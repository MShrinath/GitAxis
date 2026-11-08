import * as assert from 'assert';
import { createOperation, Operation } from '../src/contracts';
import { OperationSafetyChecker } from '../src/operations/safety';
import { OperationManager } from '../src/operations/operationManager';
import { ProfileManager } from '../src/profiles/profileManager';
import { PersistentProfileStore } from '../src/profiles/profileStore';
import { GitClient, GitProcessError } from '../src/git/gitClient';
import { AuthManager } from '../src/auth/authManager';
import { SecretStore } from '../src/auth/secretStore';
import { RepositoryDiscovery } from '../src/discovery/repositoryDiscovery';

describe('Operations, Guards & Safety Suite', () => {
  describe('1. Operation Contracts & Safety Assessment', () => {
    it('should construct strongly typed operation models', () => {
      const pushOp: Operation = createOperation({
        id: 'op-push-contract',
        type: 'git.push',
        input: { repositoryPath: '/mock/repo', remote: 'origin', branch: 'main', force: false },
        target: { kind: 'remote', remoteName: 'origin' },
        safety: 'mutating',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'activity-bar',
      });
      assert.strictEqual(pushOp.type, 'git.push');
      assert.strictEqual(pushOp.target.kind, 'remote');
      assert.strictEqual(pushOp.input.branch, 'main');

      const statusOp = createOperation({
        id: 'op-status-contract',
        type: 'git.status',
        input: { repositoryPath: '/mock/repo' },
        target: { kind: 'local-repository', path: '/mock/repo' },
        safety: 'read-only',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
      });
      assert.strictEqual(statusOp.type, 'git.status');
      assert.strictEqual(statusOp.target.kind, 'local-repository');
      assert.strictEqual(statusOp.safety, 'read-only');
    });

    it('should assess safety levels correctly for git and github operations', () => {
      // Force push: destructive
      const fpOp = createOperation({
        id: '1',
        type: 'git.push',
        input: { repositoryPath: '/path', force: true },
        target: { kind: 'remote', remoteName: 'origin' },
        safety: 'mutating',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
      });
      assert.strictEqual(OperationSafetyChecker.assessSafety(fpOp).safety, 'destructive');
      assert.strictEqual(OperationSafetyChecker.assessSafety(fpOp).confirmation.required, true);

      // Normal push: mutating
      const normPushOp = createOperation({
        id: '2',
        type: 'git.push',
        input: { repositoryPath: '/path', force: false },
        target: { kind: 'remote', remoteName: 'origin' },
        safety: 'mutating',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
      });
      assert.strictEqual(OperationSafetyChecker.assessSafety(normPushOp).safety, 'mutating');
      assert.strictEqual(OperationSafetyChecker.assessSafety(normPushOp).confirmation.required, false);

      // Reset hard: destructive
      const resetOp = createOperation({
        id: '3',
        type: 'git.reset',
        input: { repositoryPath: '/path', ref: 'HEAD~1', mode: 'hard' },
        target: { kind: 'local-repository', path: '/path' },
        safety: 'mutating',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
      });
      assert.strictEqual(OperationSafetyChecker.assessSafety(resetOp).safety, 'destructive');
      assert.strictEqual(OperationSafetyChecker.assessSafety(resetOp).confirmation.required, true);

      // Status: read-only
      const statusOp = createOperation({
        id: '4',
        type: 'git.status',
        input: { repositoryPath: '/path' },
        target: { kind: 'local-repository', path: '/path' },
        safety: 'read-only',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'activity-bar',
      });
      assert.strictEqual(OperationSafetyChecker.assessSafety(statusOp).safety, 'read-only');

      // Rebase: requires confirmation
      const rebaseOp = createOperation({
        id: '5',
        type: 'git.rebase',
        input: { repositoryPath: '/path', onto: 'main' },
        target: { kind: 'local-repository', path: '/path' },
        safety: 'mutating',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
      });
      assert.strictEqual(OperationSafetyChecker.assessSafety(rebaseOp).confirmation.required, true);

      // Tag delete & Remote remove: require confirmation
      const tagDelOp = createOperation({
        id: '6',
        type: 'git.tag.delete',
        input: { repositoryPath: '/path', name: 'v1.0.0' },
        target: { kind: 'local-repository', path: '/path' },
        safety: 'mutating',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
      });
      assert.strictEqual(OperationSafetyChecker.assessSafety(tagDelOp).confirmation.required, true);

      const remDelOp = createOperation({
        id: '7',
        type: 'git.remote.remove',
        input: { repositoryPath: '/path', name: 'upstream' },
        target: { kind: 'local-repository', path: '/path' },
        safety: 'mutating',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
      });
      assert.strictEqual(OperationSafetyChecker.assessSafety(remDelOp).confirmation.required, true);

      // PR merge & Issue close: require confirmation
      const prMergeOp = createOperation({
        id: '8',
        type: 'github.pull-request.merge',
        input: { owner: 'myorg', repository: 'myrepo', number: 42 },
        target: { kind: 'github-pull-request', host: 'github.com', owner: 'myorg', repository: 'myrepo', number: 42 },
        safety: 'mutating',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
      });
      assert.strictEqual(OperationSafetyChecker.assessSafety(prMergeOp).confirmation.required, true);

      const issueCloseOp = createOperation({
        id: '9',
        type: 'github.issue.close',
        input: { owner: 'myorg', repository: 'myrepo', number: 101 },
        target: { kind: 'github-issue', host: 'github.com', owner: 'myorg', repository: 'myrepo', number: 101 },
        safety: 'mutating',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
      });
      assert.strictEqual(OperationSafetyChecker.assessSafety(issueCloseOp).confirmation.required, true);
    });
  });

  describe('2. Operation Manager Execution & Safety Confirmations', () => {
    let opManager: OperationManager;
    let profileManager: ProfileManager;
    let mockGitClient: GitClient;

    beforeEach(async () => {
      const store = new PersistentProfileStore();
      const secretStore = new SecretStore();
      const authManager = new AuthManager(secretStore);
      mockGitClient = new GitClient('git');

      mockGitClient.exec = async (args: string[]) => {
        if (args[0] === 'status') return { stdout: '', stderr: '' };
        return { stdout: 'ok', stderr: '' };
      };

      profileManager = new ProfileManager(store, authManager, mockGitClient);
      await profileManager.createProfile({
        name: 'work',
        git: { name: 'Work User', email: 'work@test.com' },
        authentication: { type: 'none' },
      });

      opManager = new OperationManager(profileManager, mockGitClient);
    });

    it('should validate inputs and reject missing repository path for local git operations', async () => {
      const op = createOperation({
        id: 'op-invalid',
        type: 'git.status',
        input: { repositoryPath: '' },
        target: { kind: 'local-repository', path: '' },
        safety: 'read-only',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'activity-bar',
      });

      const res = await opManager.execute(op);
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.error?.code, 'INVALID_INPUT');
    });

    it('should cancel destructive operations if confirmation is declined', async () => {
      opManager.getConfirmationHandler().setPromptFn(async () => false);

      const op = createOperation({
        id: 'op-force-push',
        type: 'git.push',
        input: { repositoryPath: '/path', force: true },
        target: { kind: 'remote', remoteName: 'origin' },
        safety: 'mutating',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
      });

      const res = await opManager.execute(op);
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.error?.code, 'OPERATION_CANCELLED');
    });

    it('should successfully execute valid operation and record history', async () => {
      const op = createOperation({
        id: 'op-status',
        type: 'git.status',
        input: { repositoryPath: '/workspace' },
        target: { kind: 'local-repository', path: '/workspace' },
        safety: 'read-only',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'activity-bar',
      });

      const res = await opManager.execute(op);
      assert.strictEqual(res.success, true);
      assert.ok(res.data);

      const history = opManager.getHistoryRecords();
      assert.strictEqual(history.length, 1);
      assert.strictEqual(history[0].state, 'succeeded');
    });

    it('should enrich force push confirmation with profile, repository, and branch info', async () => {
      let capturedWarning: string | undefined;
      opManager.getConfirmationHandler().setPromptFn(async (_reason, warning) => {
        capturedWarning = warning;
        return true;
      });

      const op = createOperation({
        id: 'op-fp-enrich',
        type: 'git.push',
        input: { repositoryPath: '/path/to/my-repo', branch: 'feature-1', force: true },
        target: { kind: 'remote', remoteName: 'origin' },
        safety: 'destructive',
        confirmation: { required: true, reason: 'Force push' },
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
      });

      const res = await opManager.execute(op);
      assert.strictEqual(res.success, true);
      assert.ok(capturedWarning);
      assert.ok(capturedWarning?.includes('Profile: work'));
      assert.ok(capturedWarning?.includes('Repository: my-repo'));
      assert.ok(capturedWarning?.includes('Branch: feature-1'));
    });

    it('should prompt and cancel operation when remote profile mismatch prompt returns cancel', async () => {
      mockGitClient.getRemotes = async () => [
        { name: 'origin', url: 'https://github.com/company/repo.git', owner: 'company', repository: 'repo' },
      ];

      await profileManager.createProfile({
        name: 'personal',
        git: { name: 'Personal User', email: 'personal@test.com' },
        github: { host: 'github.com', username: 'personal-user' },
        authentication: { type: 'none' },
      });
      const personal = (await profileManager.getProfiles()).find(p => p.name === 'personal');
      if (personal) await profileManager.switchProfile(personal.id);

      let promptCalled = false;
      opManager.setProfileMismatchPrompt(async (active, remoteOwner) => {
        promptCalled = true;
        assert.strictEqual(active.name, 'personal');
        assert.strictEqual(remoteOwner, 'company');
        return 'cancel';
      });

      const op = createOperation({
        id: 'op-mismatch',
        type: 'git.push',
        input: { repositoryPath: '/path/to/repo', remote: 'origin' },
        target: { kind: 'remote', remoteName: 'origin' },
        safety: 'mutating',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
      });

      const res = await opManager.execute(op);
      assert.strictEqual(promptCalled, true);
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.error?.code, 'OPERATION_CANCELLED');
    });

    it('should execute git.tag.create and git.diff operations successfully', async () => {
      let capturedArgs: string[] = [];
      mockGitClient.exec = async (args: string[]) => {
        capturedArgs = args;
        if (args[0] === 'diff') return { stdout: 'diff --git a b', stderr: '' };
        return { stdout: '', stderr: '' };
      };

      const tagOp = createOperation({
        id: 'op-tag',
        type: 'git.tag.create',
        input: { repositoryPath: '/workspace', name: 'v1.0.0', message: 'Release v1.0' },
        target: { kind: 'local-repository', path: '/workspace' },
        safety: 'mutating',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
      });

      const tagRes = await opManager.execute(tagOp);
      assert.strictEqual(tagRes.success, true);
      assert.deepStrictEqual(capturedArgs, ['tag', '-a', 'v1.0.0', '-m', 'Release v1.0']);

      const diffOp = createOperation({
        id: 'op-diff',
        type: 'git.diff',
        input: { repositoryPath: '/workspace', staged: true },
        target: { kind: 'local-repository', path: '/workspace' },
        safety: 'read-only',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
      });

      const diffRes = await opManager.execute<string>(diffOp);
      assert.strictEqual(diffRes.success, true);
      assert.strictEqual(diffRes.data, 'diff --git a b');
    });

    it('should require confirmation and enrich context when working tree is dirty for checkout', async () => {
      const profile = await profileManager.createProfile({
        name: 'WorkTreeUser',
        git: { name: 'Work User', email: 'work@test.com' },
        authentication: { type: 'none' },
      });

      const op = createOperation({
        id: 'op-dirty-checkout',
        type: 'git.checkout',
        input: { repositoryPath: 'C:/repos/my-app', ref: 'feature-branch' },
        target: { kind: 'local-repository', path: 'C:/repos/my-app' },
        safety: 'mutating',
        confirmation: { required: false },
        profileId: profile.id,
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
      });

      (mockGitClient as any).status = async () => ({
        clean: false,
        staged: 0,
        modified: 2,
        untracked: 0,
        conflicted: 0,
        ahead: 0,
        behind: 0,
      });

      let promptReason = '';
      let promptWarning = '';
      opManager.getConfirmationHandler().setPromptFn(async (reason, warning) => {
        promptReason = reason;
        promptWarning = warning || '';
        return true;
      });

      (mockGitClient as any).checkout = async () => {};

      const result = await opManager.execute(op);
      assert.strictEqual(result.success, true);
      assert.ok(promptReason.includes('dirty working tree') || promptReason.includes('uncommitted'));
      assert.ok(promptWarning.includes('Profile: WorkTreeUser'));
      assert.ok(promptWarning.includes('Repository: my-app'));
    });

    it('should warn when amending a commit that has already been pushed to remote', async () => {
      const profile = await profileManager.createProfile({
        name: 'PersonalAmend',
        git: { name: 'Personal User', email: 'pers@test.com' },
        authentication: { type: 'none' },
      });

      const op = createOperation({
        id: 'op-amend-pushed',
        type: 'git.commit',
        input: { repositoryPath: 'C:/repos/my-app', message: 'new message', amend: true },
        target: { kind: 'local-repository', path: 'C:/repos/my-app' },
        safety: 'mutating',
        confirmation: { required: false },
        profileId: profile.id,
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
      });

      (mockGitClient as any).getLocalConfig = async () => 'pers@test.com';
      (mockGitClient as any).getRemotes = async () => [{ name: 'origin', fetchUrl: 'https://github.com/org/repo.git' }];
      (mockGitClient as any).exec = async (args: string[]) => {
        if (args[0] === 'log') {
          return { stdout: '' };
        }
        return { stdout: '' };
      };
      (mockGitClient as any).commit = async () => ({ commitHash: 'abc1234' });

      let prompted = false;
      opManager.getConfirmationHandler().setPromptFn(async (reason) => {
        prompted = true;
        assert.ok(reason.includes('Amend published commit'));
        return true;
      });

      const res = await opManager.execute(op);
      assert.strictEqual(res.success, true);
      assert.strictEqual(prompted, true);
    });

    it('should NOT warn when amending on a branch without upstream tracking branch', async () => {
      const profile = await profileManager.createProfile({
        name: 'PersonalLocal',
        git: { name: 'Personal User', email: 'pers@test.com' },
        authentication: { type: 'none' },
      });

      const op = createOperation({
        id: 'op-amend-no-upstream',
        type: 'git.commit',
        input: { repositoryPath: 'C:/repos/my-app', message: 'new message', amend: true },
        target: { kind: 'local-repository', path: 'C:/repos/my-app' },
        safety: 'mutating',
        confirmation: { required: false },
        profileId: profile.id,
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
      });

      (mockGitClient as any).getLocalConfig = async () => 'pers@test.com';
      (mockGitClient as any).getRemotes = async () => [{ name: 'origin', fetchUrl: 'https://github.com/org/repo.git' }];
      (mockGitClient as any).exec = async (args: string[]) => {
        if (args[0] === 'rev-parse' && args[1] === '--verify' && args[2] === '@{u}') {
          throw new Error('fatal: no upstream configured for branch');
        }
        return { stdout: '' };
      };
      (mockGitClient as any).commit = async () => ({ commitHash: 'abc1234' });

      let prompted = false;
      opManager.getConfirmationHandler().setPromptFn(async () => {
        prompted = true;
        return true;
      });

      const res = await opManager.execute(op);
      assert.strictEqual(res.success, true);
      assert.strictEqual(prompted, false);
    });
  });

  describe('3. Cancellation, Timeouts & Error Classification', () => {
    let opManager: OperationManager;
    let gitClient: GitClient;
    let profileManager: ProfileManager;

    beforeEach(() => {
      const profileStore = new PersistentProfileStore();
      const secretStore = new SecretStore();
      const authManager = new AuthManager(secretStore);
      gitClient = new GitClient('git');

      const globalConfigs = new Map<string, string>();
      const localConfigs = new Map<string, string>();
      gitClient.setGlobalConfig = async (key: string, value: string) => {
        globalConfigs.set(key, value);
      };
      gitClient.getGlobalConfig = async (key: string) => globalConfigs.get(key);
      gitClient.setLocalConfig = async (_path: string, key: string, value: string) => {
        localConfigs.set(key, value);
      };
      gitClient.getLocalConfig = async (_path: string, key: string) => localConfigs.get(key);
      gitClient.unsetLocalConfig = async (_path: string, key: string) => {
        localConfigs.delete(key);
      };

      profileManager = new ProfileManager(profileStore, authManager, gitClient);
      opManager = new OperationManager(profileManager, gitClient);
    });

    it('should cancel executing operation via cancel()', async () => {
      const op = createOperation({
        id: 'op-cancel-test',
        type: 'git.status',
        input: { repositoryPath: 'C:/fake/repo' },
        target: { kind: 'local-repository', path: 'C:/fake/repo' },
        safety: 'read-only',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
      });

      (gitClient as any).status = async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return { isClean: true };
      };

      const execPromise = opManager.execute(op);
      await opManager.cancel(op.id);
      const result = await execPromise;

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error?.code, 'OPERATION_CANCELLED');
    });

    it('should classify authentication, conflict, and network errors accurately with correct retryable flag', async () => {
      const testCases = [
        {
          errorMsg: 'fatal: Authentication failed for https://github.com/org/repo.git',
          expectedCode: 'AUTHENTICATION_FAILED',
          expectedRetryable: false,
        },
        {
          errorMsg: 'CONFLICT (content): Merge conflict in file.txt\nAutomatic merge failed; fix conflicts',
          expectedCode: 'MERGE_CONFLICT',
          expectedRetryable: false,
        },
        {
          errorMsg: 'fatal: [remote rejected] main -> main (pre-receive hook declined)',
          expectedCode: 'REMOTE_REJECTED',
          expectedRetryable: false,
        },
        {
          errorMsg: 'fatal: Could not resolve host: github.com',
          expectedCode: 'NETWORK_ERROR',
          expectedRetryable: true,
        },
        {
          errorMsg: 'fatal: not a git repository (or any of the parent directories)',
          expectedCode: 'NOT_A_REPOSITORY',
          expectedRetryable: false,
        },
      ];

      for (const tc of testCases) {
        const op = createOperation({
          id: `op-err-${tc.expectedCode}`,
          type: 'git.status',
          input: { repositoryPath: 'C:/test/repo' },
          target: { kind: 'local-repository', path: 'C:/test/repo' },
          safety: 'read-only',
          confirmation: { required: false },
          createdAt: new Date().toISOString(),
          initiatedBy: 'command-palette',
        });

        (gitClient as any).status = async () => {
          throw new Error(tc.errorMsg);
        };

        const res = await opManager.execute(op);
        assert.strictEqual(res.success, false);
        assert.strictEqual(res.error?.code, tc.expectedCode);
        assert.strictEqual(res.error?.retryable, tc.expectedRetryable);
      }
    });

    it('should classify killed GitProcessError as TIMEOUT during operation execution', async () => {
      gitClient.status = async () => {
        throw new GitProcessError('Command failed', { killed: true });
      };

      const op = createOperation({
        id: 'op-timeout-killed',
        type: 'git.status',
        input: { repositoryPath: 'C:/repos/test-repo' },
        target: { kind: 'local-repository', path: 'C:/repos/test-repo' },
        safety: 'read-only',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'activity-bar',
      });

      const resKilled = await opManager.execute(op);
      assert.strictEqual(resKilled.success, false);
      assert.strictEqual(resKilled.error?.code, 'TIMEOUT');

      gitClient.status = async () => {
        throw new GitProcessError('Command terminated', { signal: 'SIGTERM' });
      };

      const resSigterm = await opManager.execute(op);
      assert.strictEqual(resSigterm.success, false);
      assert.strictEqual(resSigterm.error?.code, 'TIMEOUT');
    });

    it('should maintain atomic profile switching and abort when cancelled', async () => {
      const p1 = await profileManager.createProfile({
        name: 'InitialProfile',
        git: { name: 'Initial', email: 'init@test.com', scope: 'global' },
        authentication: { type: 'none' },
      });
      const p2 = await profileManager.createProfile({
        name: 'TargetProfile',
        git: { name: 'Target', email: 'target@test.com', scope: 'global' },
        authentication: { type: 'none' },
      });

      await profileManager.switchProfile(p1.id);
      const activeBefore = await profileManager.getActiveProfile();
      assert.strictEqual(activeBefore?.id, p1.id);

      await assert.rejects(
        async () => {
          await profileManager.switchProfile(p2.id, undefined, async () => false);
        },
        /cancelled/
      );

      const activeAfter = await profileManager.getActiveProfile();
      assert.strictEqual(activeAfter?.id, p1.id);
    });
  });

  describe('4. Commit & Push Guards', () => {
    let opManager: OperationManager;
    let profileManager: ProfileManager;
    let mockGitClient: GitClient;
    const localConfigs = new Map<string, string>();
    const remotesMap = new Map<string, any[]>();

    beforeEach(async () => {
      const store = new PersistentProfileStore();
      const secretStore = new SecretStore();
      const authManager = new AuthManager(secretStore);
      localConfigs.clear();
      remotesMap.clear();

      mockGitClient = new GitClient('git');
      mockGitClient.isRepository = async () => true;
      mockGitClient.getRoot = async (p: string) => p;
      mockGitClient.getLocalConfig = async (_repo: string, key: string) => localConfigs.get(key);
      mockGitClient.setLocalConfig = async (_repo: string, key: string, value: string) => {
        localConfigs.set(key, value);
      };
      mockGitClient.getRemotes = async (repoPath: string) => remotesMap.get(repoPath) || [];
      mockGitClient.exec = async (args: string[]) => {
        if (args[0] === 'config' && args[1] === '--get') {
          const val = localConfigs.get(args[2]);
          if (!val) throw new Error('config not found');
          return { stdout: val, stderr: '' };
        }
        return { stdout: '', stderr: '' };
      };
      mockGitClient.commit = async () => 'abc1234';
      mockGitClient.push = async () => 'Everything up-to-date';

      profileManager = new ProfileManager(store, authManager, mockGitClient);
      opManager = new OperationManager(profileManager, mockGitClient);
    });

    it('Commit Guard: should block commit when guard.mode is "block" and git author mismatches', async () => {
      const profile = await profileManager.createProfile({
        name: 'Corp',
        git: { name: 'Corp User', email: 'corp@company.com' },
        authentication: { type: 'none' },
      });

      const repoPath = 'C:/repos/corp-app';
      localConfigs.set('user.email', 'personal@gmail.com');
      localConfigs.set('user.name', 'Personal Guy');

      opManager.setGuardMode('block');

      const op = createOperation({
        id: 'op-commit-1',
        type: 'git.commit',
        input: { repositoryPath: repoPath, message: 'feat: add login' },
        target: { kind: 'local-repository', path: repoPath },
        safety: 'mutating',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
        profileId: profile.id,
      });

      const res = await opManager.execute(op);
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.error?.code, 'GUARD_BLOCKED');
      assert.ok(res.error?.message.includes('Commit blocked by GitAxis guard'));
    });

    it('Commit Guard: should prompt with fix action and continue when "fix" is chosen', async () => {
      const profile = await profileManager.createProfile({
        name: 'Work',
        git: { name: 'Work User', email: 'work@company.com' },
        authentication: { type: 'none' },
      });

      const repoPath = 'C:/repos/work-app';
      localConfigs.set('user.email', 'wrong@old.com');
      localConfigs.set('user.name', 'Old Guy');

      opManager.setGuardMode('warn');
      let promptFired = false;
      opManager.setCommitMismatchPrompt(async (repoConfig, prof) => {
        promptFired = true;
        assert.strictEqual(repoConfig.email, 'wrong@old.com');
        assert.strictEqual(prof.git.email, 'work@company.com');
        return 'fix';
      });

      const op = createOperation({
        id: 'op-commit-2',
        type: 'git.commit',
        input: { repositoryPath: repoPath, message: 'chore: update' },
        target: { kind: 'local-repository', path: repoPath },
        safety: 'mutating',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
        profileId: profile.id,
      });

      const res = await opManager.execute(op);
      assert.strictEqual(promptFired, true);
      assert.strictEqual(res.success, true);
      assert.strictEqual(localConfigs.get('user.email'), 'work@company.com');
    });

    it('Push Guard: should recognize allowed orgs and wildcard patterns without warning', async () => {
      const profile = await profileManager.createProfile({
        name: 'OrgProfile',
        git: { name: 'Org Dev', email: 'dev@acme.com' },
        github: {
          host: 'github.com',
          username: 'orgdev',
          orgs: ['acme-corp', 'my-*'],
        },
        authentication: { type: 'none' },
      });

      const repoPath = 'C:/repos/acme-repo';
      remotesMap.set(repoPath, [
        { name: 'origin', host: 'github.com', owner: 'acme-corp', repository: 'backend' },
      ]);

      opManager.setGuardMode('block');

      const op = createOperation({
        id: 'op-push-1',
        type: 'git.push',
        input: { repositoryPath: repoPath, remote: 'origin' },
        target: { kind: 'remote', remoteName: 'origin' },
        safety: 'mutating',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
        profileId: profile.id,
      });

      const res = await opManager.execute(op);
      assert.strictEqual(res.success, true, 'acme-corp matches profile org list');

      remotesMap.set(repoPath, [
        { name: 'origin', host: 'github.com', owner: 'my-subsidiary', repository: 'frontend' },
      ]);
      const resWildcard = await opManager.execute(op);
      assert.strictEqual(resWildcard.success, true, 'my-subsidiary matches wildcard pattern my-*');
    });

    it('Guard: should fail closed and prompt when safety check cannot run in warn mode', async () => {
      const profile = await profileManager.createProfile({
        name: 'Safe',
        git: { name: 'Safe Dev', email: 'safe@test.com' },
        authentication: { type: 'none' },
      });

      const repoPath = 'C:/repos/fail-closed-repo';
      mockGitClient.getLocalConfig = async () => {
        throw new Error('Git permission error reading .git/config');
      };

      opManager.setGuardMode('warn');
      let failClosedPromptCalled = false;
      opManager.setGuardCheckFailedPrompt(async reason => {
        failClosedPromptCalled = true;
        assert.ok(reason.includes('Git permission error'));
        return false;
      });

      const op = createOperation({
        id: 'op-commit-failclosed',
        type: 'git.commit',
        input: { repositoryPath: repoPath, message: 'commit' },
        target: { kind: 'local-repository', path: repoPath },
        safety: 'mutating',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
        profileId: profile.id,
      });

      const res = await opManager.execute(op);
      assert.strictEqual(failClosedPromptCalled, true);
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.error?.code, 'GUARD_CHECK_FAILED');
    });

    it('Commit Guard: should fail closed immediately without prompt when guard check errors in block mode', async () => {
      mockGitClient.getLocalConfig = async () => {
        throw new Error('git config read permission denied');
      };

      const profile = await profileManager.createProfile({
        name: 'guard-user',
        git: { name: 'Guard User', email: 'guard@corp.com' },
        authentication: { type: 'none' },
      });

      opManager.setGuardMode('block');

      const op = createOperation({
        id: 'op-commit-blocked',
        type: 'git.commit',
        input: { repositoryPath: 'C:/repos/guarded-repo', message: 'test commit' },
        target: { kind: 'local-repository', path: 'C:/repos/guarded-repo' },
        safety: 'mutating',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'activity-bar',
        profileId: profile.id,
      });

      const result = await opManager.execute(op);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error?.code, 'GUARD_CHECK_FAILED');
      assert.strictEqual(result.error?.userMessage, 'Commit guard safety check failed');
      assert.ok(result.error?.message.includes('permission denied'));
    });
  });

  describe('5. Operation History & Process Execution Environment', () => {
    it('should cap operation history at 200 records', async () => {
      const store = new PersistentProfileStore();
      const secretStore = new SecretStore();
      const authManager = new AuthManager(secretStore);
      const mockGit = new GitClient('git');
      mockGit.status = async () => ({
        clean: true,
        isClean: true,
        currentBranch: 'main',
        staged: [],
        unstaged: [],
        untracked: [],
        ahead: 0,
        behind: 0,
        modified: [],
        conflicted: [],
      } as any);

      const profileManager = new ProfileManager(store, authManager, mockGit);
      const opManager = new OperationManager(profileManager, mockGit);

      for (let i = 0; i < 210; i++) {
        const op = createOperation({
          id: `op-${i}`,
          type: 'git.status',
          input: { repositoryPath: 'C:/repos/test' },
          target: { kind: 'local-repository', path: 'C:/repos/test' },
          safety: 'read-only',
          confirmation: { required: false },
          createdAt: new Date().toISOString(),
          initiatedBy: 'activity-bar',
        });
        await opManager.execute(op);
      }

      assert.strictEqual(opManager.getHistory().length, 200);
      assert.strictEqual(opManager.getHistory()[0].id, 'op-209');
    });

    it('should append to existing GIT_CONFIG_COUNT rather than overwrite', async () => {
      const store = new PersistentProfileStore();
      const secretStore = new SecretStore();
      const authManager = new AuthManager(secretStore);
      const mockGit = new GitClient('git');
      const profileManager = new ProfileManager(store, authManager, mockGit);

      await profileManager.createProfile({
        name: 'cli-prof',
        git: { name: 'CLI User', email: 'cli@example.com' },
        github: { host: 'github.com', username: 'cli-user' },
        authentication: { type: 'github-cli' },
      });

      let spawnedEnv: NodeJS.ProcessEnv | undefined;
      mockGit.push = async (_repoPath: string, _remote?: string, _branch?: string, _setUpstream?: boolean, _force?: boolean, _forceWithLease?: boolean, _tags?: boolean, opts?: any) => {
        spawnedEnv = opts?.env;
        return 'Everything up-to-date';
      };

      const opManager = new OperationManager(profileManager, mockGit);

      const origCount = process.env.GIT_CONFIG_COUNT;
      const origKey0 = process.env.GIT_CONFIG_KEY_0;
      const origVal0 = process.env.GIT_CONFIG_VALUE_0;
      try {
        process.env.GIT_CONFIG_COUNT = '1';
        process.env.GIT_CONFIG_KEY_0 = 'custom.existing';
        process.env.GIT_CONFIG_VALUE_0 = 'true';

        const pushInput = { repositoryPath: 'C:/repos/test-repo', remote: 'origin', branch: 'main' };

        await (opManager as any).dispatchGitOperation(
          'git.push',
          pushInput,
          { type: 'github-cli', username: 'cli-user', credential: 'gh-cli-token' },
          { cwd: 'C:/repos/test-repo' }
        );

        assert.ok(spawnedEnv);
        assert.strictEqual(spawnedEnv!['GIT_CONFIG_COUNT'], '2');
        assert.strictEqual(spawnedEnv!['GIT_CONFIG_KEY_1'], 'http.https://github.com/.extraheader');
        assert.ok(spawnedEnv!['GIT_CONFIG_VALUE_1']?.includes('AUTHORIZATION: basic'));
      } finally {
        if (origCount !== undefined) process.env.GIT_CONFIG_COUNT = origCount;
        else delete process.env.GIT_CONFIG_COUNT;
        if (origKey0 !== undefined) process.env.GIT_CONFIG_KEY_0 = origKey0;
        else delete process.env.GIT_CONFIG_KEY_0;
        if (origVal0 !== undefined) process.env.GIT_CONFIG_VALUE_0 = origVal0;
        else delete process.env.GIT_CONFIG_VALUE_0;
      }
    });

    it('should return cached repository information without redundant git process calls within TTL', async () => {
      let processSpawns = 0;
      const customGitClient = new GitClient('git');
      (customGitClient as any).isRepository = async () => {
        processSpawns++;
        return true;
      };
      (customGitClient as any).getRoot = async (p: string) => p;
      (customGitClient as any).getCurrentBranch = async () => 'main';
      (customGitClient as any).getRemotes = async () => [];
      (customGitClient as any).status = async () => ({ clean: true, staged: 0, modified: 0, untracked: 0, conflicted: 0, ahead: 0, behind: 0 });

      const repoDiscovery = new RepositoryDiscovery(customGitClient, 1000);

      // Call 1: cold
      const repo1 = await repoDiscovery.detectRepository('C:/test/cached-repo');
      assert.ok(repo1);
      const initialSpawns = processSpawns;
      assert.strictEqual(initialSpawns, 1);

      // Call 2: warm within TTL
      const repo2 = await repoDiscovery.detectRepository('C:/test/cached-repo');
      assert.ok(repo2);
      assert.strictEqual(processSpawns, initialSpawns);

      // Call 3: clearCache forces refresh
      repoDiscovery.clearCache();
      const repo3 = await repoDiscovery.detectRepository('C:/test/cached-repo');
      assert.ok(repo3);
      assert.strictEqual(processSpawns, initialSpawns + 1);
    });
  });
});
