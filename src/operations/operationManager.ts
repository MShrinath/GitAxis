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


export type GuardMode = 'block' | 'warn' | 'off';

export type ProfileMismatchPromptFn = (
  activeProfile: GitProfile,
  remoteOwner: string,
  suggestedProfile?: GitProfile
) => Promise<'switch' | 'continue' | 'remember' | 'cancel'>;

export type CommitMismatchPromptFn = (
  repoConfig: { email?: string; name?: string },
  profile: GitProfile
) => Promise<'fix' | 'continue' | 'cancel'>;

export type GuardCheckFailedPromptFn = (
  reason: string
) => Promise<boolean>;

export class OperationManager implements IOperationManager {
  private history: OperationRecord[] = [];
  private confirmationHandler: ConfirmationHandler;
  private profileMismatchPrompt?: ProfileMismatchPromptFn;
  private commitMismatchPrompt?: CommitMismatchPromptFn;
  private guardCheckFailedPrompt?: GuardCheckFailedPromptFn;
  private guardMode: GuardMode = 'warn';
  private activeControllers = new Map<OperationId, AbortController>();
  private gitHandlers: Record<string, (input: any, options: GitExecOptions) => Promise<unknown>> = {};
  private githubHandlers: Record<string, (input: any, ghClient: GitHubClient) => Promise<unknown>> = {};

  constructor(
    private profileManager: ProfileManager,
    private gitClient: GitClient,
    confirmationHandler?: ConfirmationHandler
  ) {
    this.confirmationHandler = confirmationHandler ?? new ConfirmationHandler();
    this.initHandlerMaps();
  }

  public setGuardMode(mode: GuardMode): void {
    this.guardMode = mode;
  }

  public getGuardMode(): GuardMode {
    return this.guardMode;
  }

  public setProfileMismatchPrompt(fn: ProfileMismatchPromptFn): void {
    this.profileMismatchPrompt = fn;
  }

  public setCommitMismatchPrompt(fn: CommitMismatchPromptFn): void {
    this.commitMismatchPrompt = fn;
  }

  public setGuardCheckFailedPrompt(fn: GuardCheckFailedPromptFn): void {
    this.guardCheckFailedPrompt = fn;
  }

  public getConfirmationHandler(): ConfirmationHandler {
    return this.confirmationHandler;
  }

  private matchesRemoteOwner(remoteOwner: string, profile: GitProfile): boolean {
    const lowerRemote = remoteOwner.toLowerCase();
    if (profile.github?.username && profile.github.username.toLowerCase() === lowerRemote) {
      return true;
    }
    const orgs = profile.github?.orgs || [];
    for (const org of orgs) {
      const lowerOrg = org.trim().toLowerCase();
      if (lowerOrg === lowerRemote) return true;
      if (lowerOrg.includes('*')) {
        const regexPattern = '^' + lowerOrg.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$';
        const regex = new RegExp(regexPattern);
        if (regex.test(lowerRemote)) return true;
      }
    }
    return false;
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
    const controller = this.activeControllers.get(operationId);
    if (controller) {
      controller.abort();
      this.activeControllers.delete(operationId);
    }
    const record = this.history.find(h => h.operation.id === operationId);
    if (record && (record.state === 'executing' || record.state === 'waiting-for-confirmation')) {
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
    if (this.history.length > 200) {
      this.history.length = 200;
    }

    const abortController = new AbortController();
    this.activeControllers.set(operation.id, abortController);
    let auth: ResolvedAuthentication | undefined;

    try {
      if (abortController.signal.aborted) {
        record.state = 'cancelled';
        return this.createErrorResult(
          operation.id,
          'OPERATION_CANCELLED',
          'Operation was cancelled by user',
          'Operation was cancelled',
          startedAt,
          record
        );
      }

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
      const repoPath = (operation.input as any)?.repositoryPath || (operation.target as any)?.repositoryPath || (operation.target as any)?.path;
      let profile: GitProfile | undefined;
      let resolutionSource: string | undefined;
      if (operation.profileId) {
        profile = await this.profileManager.getProfile(operation.profileId);
        resolutionSource = 'binding';
      }
      if (!profile && repoPath) {
        const resolved = await this.profileManager.resolveProfileForRepository(repoPath);
        profile = resolved?.profile;
        resolutionSource = resolved?.source;
      }
      if (!profile) {
        profile = await this.profileManager.getActiveProfile();
        resolutionSource = 'fallback';
      }

      // 3. Commit Guard Check (Section 4)
      if (operation.type === 'git.commit' && repoPath && profile) {
        if (this.guardMode !== 'off') {
          try {
            const localEmail = await this.gitClient.getLocalConfig(repoPath, 'user.email');
            const localName = await this.gitClient.getLocalConfig(repoPath, 'user.name');

            const effectiveEmail = localEmail || (await this.gitClient.getConfig(repoPath, 'user.email'));
            const effectiveName = localName || (await this.gitClient.getConfig(repoPath, 'user.name'));

            const emailMismatch =
              effectiveEmail !== undefined &&
              profile.git.email !== undefined &&
              effectiveEmail.trim().toLowerCase() !== profile.git.email.trim().toLowerCase();
            const nameMismatch =
              effectiveName !== undefined &&
              profile.git.name !== undefined &&
              effectiveName.trim().toLowerCase() !== profile.git.name.trim().toLowerCase();

            if (emailMismatch || nameMismatch) {
              if (this.guardMode === 'block') {
                record.state = 'cancelled';
                return this.createErrorResult(
                  operation.id,
                  'GUARD_BLOCKED',
                  `Commit blocked by GitAxis guard: Repo config (email: "${effectiveEmail || 'unset'}", name: "${effectiveName || 'unset'}") does not match profile "${profile.name}" (email: "${profile.git.email}", name: "${profile.git.name}").`,
                  `Commit blocked by GitAxis guard: Git author does not match profile "${profile.name}".`,
                  startedAt,
                  record
                );
              } else if (this.guardMode === 'warn') {
                if (this.commitMismatchPrompt) {
                  const decision = await this.commitMismatchPrompt(
                    { email: effectiveEmail, name: effectiveName },
                    profile
                  );
                  if (decision === 'cancel') {
                    record.state = 'cancelled';
                    return this.createErrorResult(
                      operation.id,
                      'OPERATION_CANCELLED',
                      'User cancelled commit due to author mismatch',
                      'Commit cancelled due to author mismatch',
                      startedAt,
                      record
                    );
                  } else if (decision === 'fix') {
                    await this.profileManager.applyIdentityToRepository(profile, repoPath);
                  }
                }
                warnings.push({
                  code: 'COMMIT_AUTHOR_MISMATCH',
                  message: `Repo identity (${effectiveName} <${effectiveEmail}>) differs from profile "${profile.name}" (${profile.git.name} <${profile.git.email}>).`,
                });
              }
            }
          } catch (err) {
            // Fail closed: do not swallow error silently
            logger.error(`Commit guard check failed: ${String(err)}`);
            if (this.guardMode === 'block') {
              record.state = 'cancelled';
              return this.createErrorResult(
                operation.id,
                'GUARD_CHECK_FAILED',
                String(err),
                'Commit guard safety check failed',
                startedAt,
                record
              );
            } else if (this.guardCheckFailedPrompt) {
              const proceed = await this.guardCheckFailedPrompt(`Commit guard check failed: ${String(err)}`);
              if (!proceed) {
                record.state = 'cancelled';
                return this.createErrorResult(
                  operation.id,
                  'GUARD_CHECK_FAILED',
                  String(err),
                  'Commit guard safety check failed',
                  startedAt,
                  record
                );
              }
            }
          }
        }
      }

      // 4. Remote Push Guard Check (Section 4)
      if (profile && operation.type === 'git.push' && repoPath) {
        if (this.guardMode !== 'off') {
          try {
            const remotes = await this.gitClient.getRemotes(repoPath);
            const targetRemoteName = (operation.target as any).remoteName || (operation.input as any).remote || 'origin';
            const targetRemote = remotes.find(r => r.name === targetRemoteName) || remotes[0];

            const effectiveOwner = targetRemote ? (targetRemote.pushOwner || targetRemote.owner) : undefined;
            if (targetRemote && effectiveOwner) {
              const isMatch = this.matchesRemoteOwner(effectiveOwner, profile);
              if (!isMatch) {
                if (this.guardMode === 'block') {
                  record.state = 'cancelled';
                  return this.createErrorResult(
                    operation.id,
                    'GUARD_BLOCKED',
                    `Push blocked by GitAxis guard: Remote owner "${effectiveOwner}" does not match profile "${profile.name}" (@${profile.github?.username || 'none'}) or allowed orgs.`,
                    `Push blocked by GitAxis guard: Remote owner mismatch.`,
                    startedAt,
                    record
                  );
                } else if (this.guardMode === 'warn') {
                  const matchResult = await this.profileManager.matchProfile({
                    repositoryPath: repoPath,
                    remotes,
                  });
                  const suggested = matchResult.recommendedProfileId
                    ? await this.profileManager.getProfile(matchResult.recommendedProfileId)
                    : undefined;

                  let mismatchResolved = false;
                  if (this.profileMismatchPrompt) {
                    const decision = await this.profileMismatchPrompt(profile, effectiveOwner, suggested);
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
                      mismatchResolved = true;
                    } else if (decision === 'remember') {
                      const currentOrgs = profile.github?.orgs || [];
                      if (!currentOrgs.includes(effectiveOwner)) {
                        await this.profileManager.updateProfile(profile.id, {
                          github: {
                            ...profile.github,
                            username: profile.github?.username || '',
                            host: profile.github?.host || 'github.com',
                            orgs: [...currentOrgs, effectiveOwner],
                          },
                        });
                      }
                      mismatchResolved = true;
                    }
                  }

                  if (!mismatchResolved) {
                    warnings.push({
                      code: 'PROFILE_MISMATCH',
                      message: `Active profile "${profile.name}" (${profile.github?.username || 'no user'}) does not match remote owner "${effectiveOwner}".`,
                    });
                  }
                }
              }
            }
          } catch (err) {
            // Fail closed: do not swallow error silently
            logger.error(`Push guard check failed: ${String(err)}`);
            if (this.guardMode === 'block') {
              record.state = 'cancelled';
              return this.createErrorResult(
                operation.id,
                'GUARD_CHECK_FAILED',
                String(err),
                'Push guard safety check failed',
                startedAt,
                record
              );
            } else if (this.guardCheckFailedPrompt) {
              const proceed = await this.guardCheckFailedPrompt(`Push guard check failed: ${String(err)}`);
              if (!proceed) {
                record.state = 'cancelled';
                return this.createErrorResult(
                  operation.id,
                  'GUARD_CHECK_FAILED',
                  String(err),
                  'Push guard safety check failed',
                  startedAt,
                  record
                );
              }
            }
          }
        }
      }

      // 4. Dynamic Safety Checks & Confirmation (Section 11)
      const safetyAssessment = OperationSafetyChecker.assessSafety(operation);
      operation.safety = safetyAssessment.safety;
      operation.confirmation = safetyAssessment.confirmation;

      // 4a. Check dirty working tree for checkout and restore (ignoring untracked files)
      if ((operation.type === 'git.checkout' || operation.type === 'git.restore') && repoPath) {
        try {
          const status = await this.gitClient.status(repoPath);
          const hasDirty = (status.modified > 0) || (status.staged > 0) || (status.conflicted > 0);
          if (hasDirty) {
            safetyAssessment.confirmation = {
              required: true,
              reason: `${operation.type === 'git.checkout' ? 'Checkout' : 'Restore'} with uncommitted changes`,
              warning: 'Your working tree contains uncommitted changes that may be overwritten or permanently lost.',
            };
          }
        } catch (err) {
          logger.debug(`Could not check dirty working tree before ${operation.type}: ${String(err)}`);
        }
      }

      // 4b. Check if amending a commit that is already pushed to upstream
      if (((operation.type === 'git.commit' && (operation.input as any).amend) || operation.type === 'git.amend') && repoPath) {
        try {
          const remotes = await this.gitClient.getRemotes(repoPath);
          if (remotes.length > 0) {
            let hasUpstream = false;
            try {
              await this.gitClient.exec(['rev-parse', '--verify', '@{u}'], { cwd: repoPath });
              hasUpstream = true;
            } catch {}

            if (hasUpstream) {
              const { stdout } = await this.gitClient.exec(['log', '@{u}..HEAD', '--oneline'], { cwd: repoPath }).catch(() => ({ stdout: '' }));
              if (stdout.trim() === '') {
                safetyAssessment.confirmation = {
                  required: true,
                  reason: 'Amend published commit',
                  warning: 'The commit you are amending has already been pushed to remote. Amending will rewrite published history and require force-pushing.',
                };
              }
            }
          }
        } catch (err) {
          logger.debug(`Could not verify upstream push status for amend: ${String(err)}`);
        }
      }

      // 4c. Check repository creation target owner against active profile
      if (operation.type === 'github.repository.create') {
        const targetOwner = (operation.input as any).owner;
        if (targetOwner && profile && !this.matchesRemoteOwner(targetOwner, profile)) {
          safetyAssessment.confirmation = {
            required: true,
            reason: `Create repository under organization "${targetOwner}"`,
            warning: `Active profile "${profile.name}" (@${profile.github?.username || 'none'}) is not configured for organization "${targetOwner}".`,
          };
        }
      }

      // 4d. Enrich all confirmations with Profile, Repository, Branch, and Remote details
      if (safetyAssessment.confirmation.required) {
        const repoName = repoPath ? repoPath.split(/[/\\]/).filter(Boolean).pop() || 'repository' : undefined;
        const profileName = profile ? profile.name : undefined;
        let branchName = (operation.input as any)?.branch;
        if (!branchName && repoPath) {
          try {
            branchName = await this.gitClient.getCurrentBranch(repoPath);
          } catch {}
        }
        const remoteName = (operation.input as any)?.remote || 'origin';

        const contextLines = [
          profileName ? `Profile: ${profileName}` : '',
          repoName ? `Repository: ${repoName}` : '',
          branchName ? `Branch: ${branchName}` : '',
          remoteName ? `Remote: ${remoteName}` : '',
        ].filter(Boolean);

        if (contextLines.length > 0) {
          const originalWarning = safetyAssessment.confirmation.warning || '';
          safetyAssessment.confirmation.warning = `${contextLines.join('\n')}\n\n${originalWarning}`;
        }

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

      // 5. Setup Per-Operation Timeouts (Section 10)
      const isRemoteOperation = ['git.push', 'git.pull', 'git.fetch', 'git.clone'].includes(operation.type);
      const isLongRunningLocal = [
        'git.commit',
        'git.amend',
        'git.rebase',
        'git.merge',
        'git.checkout',
        'git.switch',
        'git.add',
        'git.stash.create',
        'git.stash.pop',
        'git.stash.apply',
        'git.stash.drop',
        'git.reset',
        'git.restore',
      ].includes(operation.type);
      // For network remote operations, timeout is 0 (none) so large clones/pushes aren't killed, relying on Cancel button
      const operationTimeout = isRemoteOperation ? 0 : (isLongRunningLocal ? 0 : 15000);

      // 6. Resolve Authentication (Runtime Only) - only when needed (network git ops or github.*)
      const needsAuth = isRemoteOperation || operation.type.startsWith('github.');
      if (needsAuth && profile) {
        const authManager = this.profileManager.getAuthManager();
        if (authManager) {
          auth = await authManager.resolveAuthentication(profile);
        }
      }

      // 7. Execute Operation via Handler Maps
      record.state = 'executing';
      const data = await this.dispatchExecution<T>(operation, auth, {
        signal: abortController.signal,
        timeout: operationTimeout,
        cwd: repoPath,
      });

      if (abortController.signal.aborted) {
        record.state = 'cancelled';
        return this.createErrorResult(
          operation.id,
          'OPERATION_CANCELLED',
          'Operation was cancelled by user',
          'Operation was cancelled',
          startedAt,
          record
        );
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
      let retryable = false;

      if (abortController.signal.aborted || errorStr.includes('cancelled') || errorStr.includes('AbortError')) {
        errorCode = 'OPERATION_CANCELLED';
        record.state = 'cancelled';
        retryable = false;
      } else if (
        (err as any)?.code === 'ETIMEDOUT' ||
        (err as any)?.killed ||
        (err as any)?.signal === 'SIGTERM' ||
        errorStr.toLowerCase().includes('timed out')
      ) {
        errorCode = 'TIMEOUT';
        retryable = true;
      } else if (errorStr.includes('not a git repository')) {
        errorCode = 'NOT_A_REPOSITORY';
        retryable = false;
      } else if (
        errorStr.includes('Authentication failed') ||
        errorStr.includes('Permission to') ||
        errorStr.includes('Invalid credentials') ||
        errorStr.includes('could not read Username')
      ) {
        errorCode = 'AUTHENTICATION_FAILED';
        retryable = false;
      } else if (
        errorStr.includes('Merge conflict') ||
        errorStr.includes('CONFLICT (content)') ||
        errorStr.includes('Automatic merge failed')
      ) {
        errorCode = 'MERGE_CONFLICT';
        retryable = false;
      } else if (errorStr.includes('remote rejected') || errorStr.includes('pre-receive hook declined')) {
        errorCode = 'REMOTE_REJECTED';
        retryable = false;
      } else if (errorStr.includes('nothing to commit')) {
        errorCode = 'NOTHING_TO_COMMIT';
        retryable = false;
      } else if (
        errorStr.includes('Could not resolve host') ||
        errorStr.includes('Failed to connect') ||
        errorStr.includes('Connection timed out') ||
        errorStr.includes('remote end hung up unexpectedly') ||
        errorStr.includes('ETIMEDOUT') ||
        errorStr.includes('ECONNRESET')
      ) {
        errorCode = 'NETWORK_ERROR';
        retryable = true;
      }

      const result: OperationResult<T> = {
        operationId: operation.id,
        success: false,
        error: {
          code: errorCode,
          message: errorStr,
          userMessage: `Failed to execute ${operation.type}: ${errorStr}`,
          retryable,
        },
        warnings: warnings.length > 0 ? warnings : undefined,
        startedAt,
        completedAt,
      };

      record.state = 'failed';
      record.result = result;
      record.durationMs = Date.now() - startTime;
      return result;
    } finally {
      this.activeControllers.delete(operation.id);
      if (auth) {
        auth.credential = undefined;
      }
      const authManager = this.profileManager.getAuthManager();
      if (authManager) {
        authManager.clearRuntimeCredentials();
      }
    }
  }

  private async dispatchExecution<T>(
    operation: Operation,
    auth?: ResolvedAuthentication,
    baseOptions: GitExecOptions = {}
  ): Promise<T> {
    const input = operation.input as any;

    if (operation.type.startsWith('git.')) {
      return this.dispatchGitOperation<T>(operation.type, input, auth, baseOptions);
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

  private async dispatchGitOperation<T>(
    type: string,
    input: any,
    auth?: ResolvedAuthentication,
    baseOptions: GitExecOptions = {}
  ): Promise<T> {
    const execOptions: GitExecOptions = { ...baseOptions };
    if (auth?.credential && (auth.type === 'pat' || auth.type === 'github-cli')) {
      const host = (auth.host || 'github.com').toLowerCase();
      const targetUrl = input?.url || input?.fetchUrl || input?.pushUrl;
      let shouldAttach = true;
      if (targetUrl) {
        try {
          const parsed = new URL(targetUrl);
          if (parsed.hostname.toLowerCase() !== host) {
            shouldAttach = false;
          }
        } catch {
          const hostMatch = String(targetUrl).match(/^(?:https?:\/\/|git@)([^/:]+)/i);
          if (hostMatch && hostMatch[1].toLowerCase() !== host) {
            shouldAttach = false;
          }
        }
      }

      if (shouldAttach) {
        const username = auth.username || '';
        const authString = username ? `${username}:${auth.credential}` : `:${auth.credential}`;
        const base64Auth = Buffer.from(authString).toString('base64');
        const headerKey = `http.https://${host}/.extraheader`;

        const env = { ...(baseOptions.env || {}) };
        const rawExistingCount = env.GIT_CONFIG_COUNT ?? process.env.GIT_CONFIG_COUNT;
        const existingCount = rawExistingCount ? parseInt(rawExistingCount, 10) : 0;
        const index = isNaN(existingCount) ? 0 : existingCount;
        const newCount = index + 1;

        env.GIT_CONFIG_COUNT = String(newCount);
        env[`GIT_CONFIG_KEY_${index}`] = headerKey;
        env[`GIT_CONFIG_VALUE_${index}`] = `AUTHORIZATION: basic ${base64Auth}`;
        execOptions.env = env;
      }
    }

    const handler = this.gitHandlers[type];
    if (handler) {
      return (await handler(input, execOptions)) as T;
    }

    throw new Error(`Unhandled Git operation: ${type}`);
  }

  private async dispatchGitHubOperation<T>(type: string, input: any, ghClient: GitHubClient): Promise<T> {
    const handler = this.githubHandlers[type];
    if (handler) {
      return (await handler(input, ghClient)) as T;
    }

    throw new Error(`Unhandled GitHub operation: ${type}`);
  }

  private initHandlerMaps(): void {
    this.gitHandlers = {
      'git.status': (input, opts) => this.gitClient.status(input.repositoryPath, opts),
      'git.diff': (input, opts) => this.gitClient.diff(input.repositoryPath, input.staged, input.path, opts),
      'git.add': async (input, opts) => {
        await this.gitClient.add(input.repositoryPath, input.paths || [], input.all, opts);
        return true;
      },
      'git.restore': async (input, opts) => {
        await this.gitClient.restore(input.repositoryPath, input.paths, input.staged, opts);
        return true;
      },
      'git.commit': (input, opts) => this.gitClient.commit(input.repositoryPath, input.message, input.amend, input.signoff, opts),
      'git.amend': (input, opts) => this.gitClient.amend(input.repositoryPath, input.message, input.noEdit, opts),
      'git.reset': async (input, opts) => {
        await this.gitClient.reset(input.repositoryPath, input.ref, input.mode, opts);
        return true;
      },
      'git.branch.create': async (input, opts) => {
        await this.gitClient.createBranch(input.repositoryPath, input.name, input.startPoint, input.checkout, opts);
        return true;
      },
      'git.branch.delete': async (input, opts) => {
        await this.gitClient.deleteBranch(input.repositoryPath, input.name, input.force, opts);
        return true;
      },
      'git.branch.rename': async (input, opts) => {
        await this.gitClient.renameBranch(input.repositoryPath, input.oldName, input.newName, opts);
        return true;
      },
      'git.checkout': async (input, opts) => {
        await this.gitClient.checkout(input.repositoryPath, input.ref, input.createBranch, opts);
        return true;
      },
      'git.switch': async (input, opts) => {
        await this.gitClient.switchBranch(input.repositoryPath, input.branch, input.create, opts);
        return true;
      },
      'git.merge': (input, opts) => this.gitClient.merge(input.repositoryPath, input.branch, input.noFastForward, input.squash, opts),
      'git.rebase': (input, opts) => this.gitClient.rebase(input.repositoryPath, input.onto, opts),
      'git.fetch': (input, opts) => this.gitClient.fetch(input.repositoryPath, input.remote, input.prune, input.tags, opts),
      'git.pull': (input, opts) => this.gitClient.pull(input.repositoryPath, input.remote, input.branch, input.rebase, opts),
      'git.push': (input, opts) =>
        this.gitClient.push(
          input.repositoryPath,
          input.remote,
          input.branch,
          input.setUpstream,
          input.force,
          input.forceWithLease,
          input.tags,
          opts
        ),
      'git.clone': async (input, opts) => {
        await this.gitClient.clone(input.url, input.destinationPath, input.branch, input.depth, opts);
        return true;
      },
      'git.init': async (input, opts) => {
        await this.gitClient.init(input.repositoryPath, input.bare, opts);
        return true;
      },
      'git.stash.create': (input, opts) => this.gitClient.stash(input.repositoryPath, input.message, input.includeUntracked, opts),
      'git.stash.apply': (input, opts) => this.gitClient.stashApply(input.repositoryPath, input.stash, opts),
      'git.stash.pop': (input, opts) => this.gitClient.stashPop(input.repositoryPath, input.stash, opts),
      'git.stash.drop': (input, opts) => this.gitClient.stashDrop(input.repositoryPath, input.stash, opts),
      'git.tag.create': async (input, opts) => {
        await this.gitClient.createTag(input.repositoryPath, input.name, input.target, input.message, opts);
        return true;
      },
      'git.tag.delete': async (input, opts) => {
        await this.gitClient.deleteTag(input.repositoryPath, input.name, opts);
        return true;
      },
      'git.remote.add': async (input, opts) => {
        await this.gitClient.addRemote(input.repositoryPath, input.name, input.url, opts);
        return true;
      },
      'git.remote.remove': async (input, opts) => {
        await this.gitClient.removeRemote(input.repositoryPath, input.name, opts);
        return true;
      },
      'git.remote.set-url': async (input, opts) => {
        await this.gitClient.setRemoteUrl(input.repositoryPath, input.name, input.url, input.push, opts);
        return true;
      },
      'git.log': (input, opts) => this.gitClient.log(input.repositoryPath, input.maxCount, input.branch, input.path, opts),
      'git.blame': (input, opts) => this.gitClient.blame(input.repositoryPath, input.path, input.startLine, input.endLine, opts),
    };

    this.githubHandlers = {
      'github.account.get': (_input, gh) => gh.getCurrentUser(),
      'github.repository.get': (input, gh) => gh.getRepository(input.owner, input.repository),
      'github.repository.list': (input, gh) => gh.listRepositories(input.owner),
      'github.repository.create': (input, gh) => gh.createRepository(input.name, input.description, input.private, input.owner),
      'github.repository.delete': async (input, gh) => {
        await gh.deleteRepository(input.owner, input.repository);
        return true;
      },
      'github.repository.fork': (input, gh) => gh.forkRepository(input.owner, input.repository),
      'github.issue.create': (input, gh) => gh.createIssue(input.owner, input.repository, input.title, input.body, input.labels),
      'github.issue.list': (input, gh) => gh.listIssues(input.owner, input.repository, input.state),
      'github.issue.close': async (input, gh) => {
        await gh.closeIssue(input.owner, input.repository, input.number);
        return true;
      },
      'github.pull-request.create': (input, gh) => gh.createPullRequest(input.owner, input.repository, input.title, input.head, input.base, input.body, input.draft),
      'github.pull-request.list': (input, gh) => gh.listPullRequests(input.owner, input.repository, input.state),
      'github.pull-request.merge': async (input, gh) => {
        await gh.mergePullRequest(input.owner, input.repository, input.number, input.method, input.commitMessage);
        return true;
      },
      'github.actions.list': (input, gh) => gh.listActions(input.owner, input.repository),
      'github.release.create': (input, gh) => gh.createRelease(input.owner, input.repository, input.tag, input.name, input.body, input.draft, input.prerelease),
      'github.release.list': (input, gh) => gh.listReleases(input.owner, input.repository),
    };
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
