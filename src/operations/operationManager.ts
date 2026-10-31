import * as crypto from 'crypto';
import {
  GitProfile,
  GitRepository,
  Operation,
  OperationErrorCode,
  OperationId,
  OperationManager as IOperationManager,
  OperationRecord,
  OperationResult,
  OperationValidationResult,
  OperationWarning,
  ResolvedAuthentication,
} from '../contracts';
import { OperationSafetyChecker } from './safety';
import { ConfirmationHandler } from './confirmation';
import { ProfileManager } from '../profiles/profileManager';
import { GitClient, GitExecOptions } from '../git/gitClient';
import { GitHubClient } from '../github/githubClient';
import { logger } from '../utils/logger';
import { Validation } from '../utils/validation';


export type ProfileMismatchPromptFn = (
  activeProfile: GitProfile,
  remoteOwner: string,
  suggestedProfile?: GitProfile
) => Promise<'switch' | 'continue' | 'cancel'>;

export class OperationManager implements IOperationManager {
  private history: OperationRecord[] = [];
  private confirmationHandler: ConfirmationHandler;
  private profileMismatchPrompt?: ProfileMismatchPromptFn;

  constructor(
    private profileManager: ProfileManager,
    private gitClient: GitClient,
    confirmationHandler?: ConfirmationHandler
  ) {
    this.confirmationHandler = confirmationHandler ?? new ConfirmationHandler();
  }

  public setProfileMismatchPrompt(fn: ProfileMismatchPromptFn): void {
    this.profileMismatchPrompt = fn;
  }

  public getConfirmationHandler(): ConfirmationHandler {
    return this.confirmationHandler;
  }

  public getHistoryRecords(): OperationRecord[] {
    return [...this.history];
  }

  public getHistory(): Operation[] {
    return this.history.map(h => h.operation);
  }

  public async validate(operation: Operation): Promise<OperationValidationResult> {
    const errors: { code: string; message: string }[] = [];
    const warnings: OperationWarning[] = [];

    // Target checks
    if (operation.target.kind === 'local-repository' || operation.target.kind === 'remote') {
      const repoPath = (operation.input as any).repositoryPath;
      if (!repoPath) {
        errors.push({ code: 'INVALID_INPUT', message: 'Repository path is required for local git operations' });
      }
    }

    // Safety checks
    const safetyAssessment = OperationSafetyChecker.assessSafety(operation);
    const confirmationRequired = safetyAssessment.confirmation.required;
    const confirmationReason = safetyAssessment.confirmation.required ? safetyAssessment.confirmation.reason : undefined;
    const confirmationWarning = safetyAssessment.confirmation.required ? safetyAssessment.confirmation.warning : undefined;

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      confirmationRequired,
      confirmationReason,
      confirmationWarning,
    };
  }

  public async cancel(operationId: OperationId): Promise<void> {
    const record = this.history.find(h => h.operation.id === operationId);
    if (record && record.state === 'executing') {
      record.state = 'cancelled';
    }
  }

  public async execute<T>(operation: Operation): Promise<OperationResult<T>> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();
    const warnings: OperationWarning[] = [];

    const record: OperationRecord = {
      operation,
      state: 'validating',
    };
    this.history.unshift(record);

    try {
      // 1. Validation
      const validation = await this.validate(operation);
      if (!validation.valid) {
        const errorMsg = validation.errors.map(e => e.message).join('; ');
        return this.createErrorResult(
          operation.id,
          'INVALID_INPUT',
          errorMsg,
          'Operation input validation failed',
          startedAt,
          record
        );
      }

      // 2. Resolve Profile first (needed for safety context & mismatch checks)
      let profile: GitProfile | undefined;
      if (operation.profileId) {
        profile = await this.profileManager.getProfile(operation.profileId);
      }
      if (!profile) {
        profile = await this.profileManager.getActiveProfile();
      }

      // 3. Remote profile mismatch check (PLAN.md Section 22)
      if (profile && profile.github?.username && operation.target.kind === 'remote') {
        const repoPath = (operation.input as any).repositoryPath;
        if (repoPath) {
          try {
            const remotes = await this.gitClient.getRemotes(repoPath);
            const targetRemote = remotes.find(r => r.name === (operation.target as any).remoteName);
            if (targetRemote && targetRemote.owner) {
              if (targetRemote.owner.toLowerCase() !== profile.github.username.toLowerCase()) {
                const matchResult = await this.profileManager.matchProfile({
                  repositoryPath: repoPath,
                  remotes,
                });
                const suggested = matchResult.recommendedProfileId
                  ? await this.profileManager.getProfile(matchResult.recommendedProfileId)
                  : undefined;

                if (this.profileMismatchPrompt) {
                  const decision = await this.profileMismatchPrompt(profile, targetRemote.owner, suggested);
                  if (decision === 'cancel') {
                    record.state = 'cancelled';
                    return this.createErrorResult(
                      operation.id,
                      'OPERATION_CANCELLED',
                      'User cancelled operation due to profile mismatch',
                      'Operation was cancelled due to profile mismatch',
                      startedAt,
                      record
                    );
                  } else if (decision === 'switch' && suggested) {
                    await this.profileManager.switchProfile(suggested.id, repoPath);
                    profile = suggested;
                  }
                }

                warnings.push({
                  code: 'PROFILE_MISMATCH',
                  message: `Active profile "${profile.name}" (${profile.github?.username || 'no user'}) does not match remote owner "${targetRemote.owner}".`,
                });
              }
            }
          } catch {}
        }
      }

      // 4. Safety Assessment & Confirmation (PLAN.md Section 20 & 21)
      const safetyAssessment = OperationSafetyChecker.assessSafety(operation);
      operation.safety = safetyAssessment.safety;
      operation.confirmation = safetyAssessment.confirmation;

      // Enrich Force Push confirmation with Profile, Repository, and Branch
      if (operation.type === 'git.push' && (operation.input as any).force && safetyAssessment.confirmation.required) {
        const repoPath = (operation.input as any).repositoryPath || 'workspace';
        const repoName = repoPath.split(/[/\\]/).filter(Boolean).pop() || 'repository';
        const branchName = (operation.input as any).branch || 'main';
        const profileName = profile ? profile.name : 'Unknown';
        safetyAssessment.confirmation.warning = `Profile: ${profileName}\nRepository: ${repoName}\nBranch: ${branchName}\n\nThis may overwrite remote history.`;
      }

      if (safetyAssessment.confirmation.required) {
        record.state = 'waiting-for-confirmation';
        const confirmed = await this.confirmationHandler.requestConfirmation(
          safetyAssessment.confirmation.reason,
          safetyAssessment.confirmation.warning
        );

        if (!confirmed) {
          record.state = 'cancelled';
          return this.createErrorResult(
            operation.id,
            'OPERATION_CANCELLED',
            'User cancelled destructive operation',
            'Operation was cancelled',
            startedAt,
            record
          );
        }
      }

      // 5. Resolve Authentication (Runtime Only)
      let auth: ResolvedAuthentication | undefined;
      if (profile) {
        const authManager = this.profileManager.getAuthManager();
        if (authManager) {
          auth = await authManager.resolveAuthentication(profile);
        }
      }

      // 6. Execute Operation
      record.state = 'executing';
      const data = await this.dispatchExecution<T>(operation, auth);

      // Clean up runtime credentials
      if (auth) {
        auth.credential = undefined;
      }

      const completedAt = new Date().toISOString();
      const result: OperationResult<T> = {
        operationId: operation.id,
        success: true,
        data,
        warnings: warnings.length > 0 ? warnings : undefined,
        startedAt,
        completedAt,
      };

      record.state = 'succeeded';
      record.result = result;
      record.durationMs = Date.now() - startTime;
      return result;
    } catch (err: unknown) {
      const completedAt = new Date().toISOString();
      const rawErrorStr = String((err as Error).message || err);
      const errorStr = Validation.sanitizeUrl(rawErrorStr);
      logger.error(`Operation ${operation.type} failed: ${errorStr}`);

      let errorCode: OperationErrorCode = 'UNKNOWN';
      if (errorStr.includes('not a git repository')) errorCode = 'NOT_A_REPOSITORY';
      else if (errorStr.includes('Authentication failed') || errorStr.includes('auth')) errorCode = 'AUTHENTICATION_FAILED';
      else if (errorStr.includes('Merge conflict') || errorStr.includes('conflict')) errorCode = 'MERGE_CONFLICT';
      else if (errorStr.includes('remote rejected')) errorCode = 'REMOTE_REJECTED';
      else if (errorStr.includes('nothing to commit')) errorCode = 'NOTHING_TO_COMMIT';

      const result: OperationResult<T> = {
        operationId: operation.id,
        success: false,
        error: {
          code: errorCode,
          message: errorStr,
          userMessage: `Failed to execute ${operation.type}: ${errorStr}`,
          retryable: true,
        },
        warnings: warnings.length > 0 ? warnings : undefined,
        startedAt,
        completedAt,
      };

      record.state = 'failed';
      record.result = result;
      record.durationMs = Date.now() - startTime;
      return result;
    }
  }

  private async dispatchExecution<T>(operation: Operation, auth?: ResolvedAuthentication): Promise<T> {
    const input = operation.input as any;

    if (operation.type.startsWith('git.')) {
      return this.dispatchGitOperation<T>(operation.type, input, auth);
    }

    if (operation.type.startsWith('github.')) {
      const ghClient = new GitHubClient({
        host: input.host,
        auth,
      });
      return this.dispatchGitHubOperation<T>(operation.type, input, ghClient);
    }

    throw new Error(`Unknown operation type: ${operation.type}`);
  }

  private async dispatchGitOperation<T>(type: string, input: any, auth?: ResolvedAuthentication): Promise<T> {
    const execOptions: GitExecOptions = {};
    if (auth?.credential) {
      const username = auth.username || '';
      const authString = username ? `${username}:${auth.credential}` : `:${auth.credential}`;
      const base64Auth = Buffer.from(authString).toString('base64');
      execOptions.env = {
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'http.extraheader',
        GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${base64Auth}`,
      };
    }

    switch (type) {
      case 'git.status':
        return (await this.gitClient.status(input.repositoryPath)) as unknown as T;
      case 'git.diff':
        return (await this.gitClient.diff(input.repositoryPath, input.staged, input.path)) as unknown as T;
      case 'git.add':
        await this.gitClient.add(input.repositoryPath, input.paths || [], input.all);
        return true as unknown as T;
      case 'git.restore':
        await this.gitClient.restore(input.repositoryPath, input.paths, input.staged);
        return true as unknown as T;
      case 'git.commit':
        return (await this.gitClient.commit(input.repositoryPath, input.message, input.amend, input.signoff)) as unknown as T;
      case 'git.amend':
        return (await this.gitClient.amend(input.repositoryPath, input.message, input.noEdit)) as unknown as T;
      case 'git.reset':
        await this.gitClient.reset(input.repositoryPath, input.ref, input.mode);
        return true as unknown as T;
      case 'git.branch.create':
        await this.gitClient.createBranch(input.repositoryPath, input.name, input.startPoint, input.checkout);
        return true as unknown as T;
      case 'git.branch.delete':
        await this.gitClient.deleteBranch(input.repositoryPath, input.name, input.force);
        return true as unknown as T;
      case 'git.branch.rename':
        await this.gitClient.renameBranch(input.repositoryPath, input.oldName, input.newName);
        return true as unknown as T;
      case 'git.checkout':
        await this.gitClient.checkout(input.repositoryPath, input.ref, input.createBranch);
        return true as unknown as T;
      case 'git.switch':
        await this.gitClient.switchBranch(input.repositoryPath, input.branch, input.create);
        return true as unknown as T;
      case 'git.merge':
        return (await this.gitClient.merge(input.repositoryPath, input.branch, input.noFastForward, input.squash)) as unknown as T;
      case 'git.rebase':
        return (await this.gitClient.rebase(input.repositoryPath, input.onto)) as unknown as T;
      case 'git.fetch':
        return (await this.gitClient.fetch(input.repositoryPath, input.remote, input.prune, input.tags, execOptions)) as unknown as T;
      case 'git.pull':
        return (await this.gitClient.pull(input.repositoryPath, input.remote, input.branch, input.rebase, execOptions)) as unknown as T;
      case 'git.push':
        return (await this.gitClient.push(
          input.repositoryPath,
          input.remote,
          input.branch,
          input.setUpstream,
          input.force,
          input.forceWithLease,
          input.tags,
          execOptions
        )) as unknown as T;
      case 'git.clone':
        await this.gitClient.clone(input.url, input.destinationPath, input.branch, input.depth, execOptions);
        return true as unknown as T;
      case 'git.init':
        await this.gitClient.init(input.repositoryPath, input.bare);
        return true as unknown as T;
      case 'git.stash.create':
        return (await this.gitClient.stash(input.repositoryPath, input.message, input.includeUntracked)) as unknown as T;
      case 'git.stash.apply':
        return (await this.gitClient.stashApply(input.repositoryPath, input.stash)) as unknown as T;

      case 'git.stash.pop':
        return (await this.gitClient.stashPop(input.repositoryPath, input.stash)) as unknown as T;
      case 'git.stash.drop':
        return (await this.gitClient.stashDrop(input.repositoryPath, input.stash)) as unknown as T;
      case 'git.tag.create':
        await this.gitClient.createTag(input.repositoryPath, input.name, input.target, input.message);
        return true as unknown as T;
      case 'git.tag.delete':
        await this.gitClient.deleteTag(input.repositoryPath, input.name);
        return true as unknown as T;
      case 'git.remote.add':
        await this.gitClient.addRemote(input.repositoryPath, input.name, input.url);
        return true as unknown as T;
      case 'git.remote.remove':
        await this.gitClient.removeRemote(input.repositoryPath, input.name);
        return true as unknown as T;
      case 'git.remote.set-url':
        await this.gitClient.setRemoteUrl(input.repositoryPath, input.name, input.url, input.push);
        return true as unknown as T;
      case 'git.log':
        return (await this.gitClient.log(input.repositoryPath, input.maxCount, input.branch, input.path)) as unknown as T;
      case 'git.blame':
        return (await this.gitClient.blame(input.repositoryPath, input.path, input.startLine, input.endLine)) as unknown as T;
      default:
        throw new Error(`Unhandled Git operation: ${type}`);
    }
  }

  private async dispatchGitHubOperation<T>(type: string, input: any, ghClient: GitHubClient): Promise<T> {
    switch (type) {
      case 'github.account.get':
        return (await ghClient.getCurrentUser()) as unknown as T;
      case 'github.repository.get':
        return (await ghClient.getRepository(input.owner, input.repository)) as unknown as T;
      case 'github.repository.list':
        return (await ghClient.listRepositories(input.owner)) as unknown as T;
      case 'github.repository.create':
        return (await ghClient.createRepository(input.name, input.description, input.private)) as unknown as T;
      case 'github.repository.delete':
        await ghClient.deleteRepository(input.owner, input.repository);
        return true as unknown as T;
      case 'github.repository.fork':
        return (await ghClient.forkRepository(input.owner, input.repository)) as unknown as T;
      case 'github.issue.create':
        return (await ghClient.createIssue(input.owner, input.repository, input.title, input.body, input.labels)) as unknown as T;
      case 'github.issue.list':
        return (await ghClient.listIssues(input.owner, input.repository, input.state)) as unknown as T;
      case 'github.issue.close':
        await ghClient.closeIssue(input.owner, input.repository, input.number);
        return true as unknown as T;
      case 'github.pull-request.create':
        return (await ghClient.createPullRequest(input.owner, input.repository, input.title, input.head, input.base, input.body, input.draft)) as unknown as T;
      case 'github.pull-request.list':
        return (await ghClient.listPullRequests(input.owner, input.repository, input.state)) as unknown as T;
      case 'github.pull-request.merge':
        await ghClient.mergePullRequest(input.owner, input.repository, input.number, input.method, input.commitMessage);
        return true as unknown as T;
      case 'github.actions.list':
        return (await ghClient.listActions(input.owner, input.repository)) as unknown as T;
      case 'github.release.create':
        return (await ghClient.createRelease(input.owner, input.repository, input.tag, input.name, input.body, input.draft, input.prerelease)) as unknown as T;
      case 'github.release.list':
        return (await ghClient.listReleases(input.owner, input.repository)) as unknown as T;
      default:
        throw new Error(`Unhandled GitHub operation: ${type}`);
    }
  }

  private createErrorResult<T>(
    operationId: OperationId,
    code: OperationErrorCode,
    message: string,
    userMessage: string,
    startedAt: string,
    record: OperationRecord
  ): OperationResult<T> {
    const completedAt = new Date().toISOString();
    const result: OperationResult<T> = {
      operationId,
      success: false,
      error: {
        code,
        message,
        userMessage,
        retryable: false,
      },
      startedAt,
      completedAt,
    };
    record.result = result;
    return result;
  }
}
