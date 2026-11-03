import * as assert from 'assert';
import { OperationManager } from '../src/operations/operationManager';
import { ProfileManager } from '../src/profiles/profileManager';
import { PersistentProfileStore } from '../src/profiles/profileStore';
import { GitClient } from '../src/git/gitClient';
import { AuthManager } from '../src/auth/authManager';
import { SecretStore } from '../src/auth/secretStore';
import { RepositoryDiscovery } from '../src/discovery/repositoryDiscovery';
import { OperationSafetyChecker } from '../src/operations/safety';
import { createOperation } from '../src/contracts';

describe('Robustness, Safety & Polish (v0.7.0)', () => {
  let profileStore: PersistentProfileStore;
  let authManager: AuthManager;
  let gitClient: GitClient;
  let profileManager: ProfileManager;
  let operationManager: OperationManager;

  beforeEach(() => {
    profileStore = new PersistentProfileStore();
    const secretStore = new SecretStore();
    authManager = new AuthManager(secretStore);
    gitClient = new GitClient('git');

    // Stub git config operations to protect host system config
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
    operationManager = new OperationManager(profileManager, gitClient);
  });

  describe('1. Section 10: Real Cancellation & Error Classification', () => {
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

      // Override gitClient.status to simulate a long-running call
      (gitClient as any).status = async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return { isClean: true };
      };

      const execPromise = operationManager.execute(op);
      await operationManager.cancel(op.id);
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

        const res = await operationManager.execute(op);
        assert.strictEqual(res.success, false);
        assert.strictEqual(res.error?.code, tc.expectedCode);
        assert.strictEqual(res.error?.retryable, tc.expectedRetryable);
      }
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

      // User rejects global change confirmation
      await assert.rejects(
        async () => {
          await profileManager.switchProfile(p2.id, undefined, async () => false);
        },
        /cancelled/
      );

      // Active profile should remain unchanged
      const activeAfter = await profileManager.getActiveProfile();
      assert.strictEqual(activeAfter?.id, p1.id);
    });
  });

  describe('2. Section 11: Safety Confirmations', () => {
    it('should require confirmation for git.rebase with historical warning', () => {
      const op = createOperation({
        id: 'op-rebase',
        type: 'git.rebase',
        input: { repositoryPath: 'C:/repos/app', onto: 'main' },
        target: { kind: 'local-repository', path: 'C:/repos/app' },
        safety: 'mutating',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
      });

      const assessment = OperationSafetyChecker.assessSafety(op);
      assert.strictEqual(assessment.confirmation.required, true);
      assert.ok(assessment.confirmation.reason.includes('Rebase'));
    });

    it('should require confirmation for git.tag.delete and git.remote.remove', () => {
      const tagOp = createOperation({
        id: 'op-tag-del',
        type: 'git.tag.delete',
        input: { repositoryPath: 'C:/repos/app', name: 'v1.0.0' },
        target: { kind: 'local-repository', path: 'C:/repos/app' },
        safety: 'mutating',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
      });
      assert.strictEqual(OperationSafetyChecker.assessSafety(tagOp).confirmation.required, true);

      const remoteOp = createOperation({
        id: 'op-rem-del',
        type: 'git.remote.remove',
        input: { repositoryPath: 'C:/repos/app', name: 'upstream' },
        target: { kind: 'local-repository', path: 'C:/repos/app' },
        safety: 'mutating',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
      });
      assert.strictEqual(OperationSafetyChecker.assessSafety(remoteOp).confirmation.required, true);
    });

    it('should require confirmation for github.pull-request.merge and github.issue.close', () => {
      const prOp = createOperation({
        id: 'op-pr-merge',
        type: 'github.pull-request.merge',
        input: { owner: 'myorg', repository: 'myrepo', number: 42 },
        target: { kind: 'github-pull-request', host: 'github.com', owner: 'myorg', repository: 'myrepo', number: 42 },
        safety: 'mutating',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
      });
      assert.strictEqual(OperationSafetyChecker.assessSafety(prOp).confirmation.required, true);

      const issueOp = createOperation({
        id: 'op-issue-close',
        type: 'github.issue.close',
        input: { owner: 'myorg', repository: 'myrepo', number: 101 },
        target: { kind: 'github-issue', host: 'github.com', owner: 'myorg', repository: 'myrepo', number: 101 },
        safety: 'mutating',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
      });
      assert.strictEqual(OperationSafetyChecker.assessSafety(issueOp).confirmation.required, true);
    });

    it('should require confirmation and enrich context when working tree is dirty for checkout', async () => {
      const profile = await profileManager.createProfile({
        name: 'Work',
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

      // Mock dirty working tree
      (gitClient as any).status = async () => ({
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
      operationManager.getConfirmationHandler().setPromptFn(async (reason, warning) => {
        promptReason = reason;
        promptWarning = warning || '';
        return true;
      });

      (gitClient as any).checkout = async () => {};

      const result = await operationManager.execute(op);
      assert.strictEqual(result.success, true);
      assert.ok(promptReason.includes('dirty working tree') || promptReason.includes('uncommitted'));
      assert.ok(promptWarning.includes('Profile: Work'));
      assert.ok(promptWarning.includes('Repository: my-app'));
    });

    it('should warn when amending a commit that has already been pushed to remote', async () => {
      const profile = await profileManager.createProfile({
        name: 'Personal',
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

      (gitClient as any).getLocalConfig = async () => 'pers@test.com';
      (gitClient as any).getRemotes = async () => [{ name: 'origin', fetchUrl: 'https://github.com/org/repo.git' }];
      (gitClient as any).exec = async (args: string[]) => {
        if (args[0] === 'log') {
          return { stdout: '' }; // no unpushed commits -> HEAD is pushed!
        }
        return { stdout: '' };
      };
      (gitClient as any).commit = async () => ({ commitHash: 'abc1234' });

      let prompted = false;
      operationManager.getConfirmationHandler().setPromptFn(async (reason, warning) => {
        prompted = true;
        assert.ok(reason.includes('Amend published commit'));
        return true;
      });

      const res = await operationManager.execute(op);
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

      (gitClient as any).getLocalConfig = async () => 'pers@test.com';
      (gitClient as any).getRemotes = async () => [{ name: 'origin', fetchUrl: 'https://github.com/org/repo.git' }];
      (gitClient as any).exec = async (args: string[]) => {
        if (args[0] === 'rev-parse' && args[1] === '--verify' && args[2] === '@{u}') {
          throw new Error('fatal: no upstream configured for branch');
        }
        return { stdout: '' };
      };
      (gitClient as any).commit = async () => ({ commitHash: 'abc1234' });

      let prompted = false;
      operationManager.getConfirmationHandler().setPromptFn(async () => {
        prompted = true;
        return true;
      });

      const res = await operationManager.execute(op);
      assert.strictEqual(res.success, true);
      assert.strictEqual(prompted, false); // Must NOT prompt false positive!
    });
  });

  describe('3. Section 12 & 14: Repository Discovery Caching', () => {
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
      assert.strictEqual(processSpawns, initialSpawns); // No extra git process spawned!

      // Call 3: clearCache forces refresh
      repoDiscovery.clearCache();
      const repo3 = await repoDiscovery.detectRepository('C:/test/cached-repo');
      assert.ok(repo3);
      assert.strictEqual(processSpawns, initialSpawns + 1);
    });
  });
});
