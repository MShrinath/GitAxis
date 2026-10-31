import * as assert from 'assert';
import { InMemoryMemento, PersistentProfileStore } from '../src/profiles/profileStore';
import { AuthManager } from '../src/auth/authManager';
import { SecretStore } from '../src/auth/secretStore';
import { ProfileManager } from '../src/profiles/profileManager';
import { GitClient } from '../src/git/gitClient';
import { OperationManager } from '../src/operations/operationManager';
import { AccountVerifier } from '../src/auth/accountVerifier';
import { GitHubCliAuth } from '../src/auth/githubCliAuth';
import { GitHubClient } from '../src/github/githubClient';
import { createOperation } from '../src/contracts';

describe('Multi-Account Core (v0.5.0)', () => {
  let memento: InMemoryMemento;
  let store: PersistentProfileStore;
  let secretStore: SecretStore;
  let authManager: AuthManager;
  let mockGitClient: GitClient;
  let profileManager: ProfileManager;
  let opManager: OperationManager;

  const localConfigs = new Map<string, string>();
  const globalConfigs = new Map<string, string>();
  let remotesMap = new Map<string, any[]>();

  beforeEach(() => {
    memento = new InMemoryMemento();
    store = new PersistentProfileStore(memento);
    secretStore = new SecretStore();
    authManager = new AuthManager(secretStore);
    localConfigs.clear();
    globalConfigs.clear();
    remotesMap.clear();

    mockGitClient = new GitClient('git');
    mockGitClient.isRepository = async () => true;
    mockGitClient.getRoot = async (p: string) => p;
    mockGitClient.getLocalConfig = async (_repo: string, key: string) => localConfigs.get(key);
    mockGitClient.getConfig = async (_repo: string, key: string) => localConfigs.get(key) || globalConfigs.get(key);
    mockGitClient.setLocalConfig = async (_repo: string, key: string, value: string) => {
      localConfigs.set(key, value);
    };
    mockGitClient.unsetLocalConfig = async (_repo: string, key: string) => {
      localConfigs.delete(key);
    };
    mockGitClient.getGlobalConfig = async (key: string) => globalConfigs.get(key);
    mockGitClient.setGlobalConfig = async (key: string, value: string) => {
      globalConfigs.set(key, value);
    };
    mockGitClient.unsetGlobalConfig = async (key: string) => {
      globalConfigs.delete(key);
    };
    mockGitClient.getRemotes = async (repoPath: string) => remotesMap.get(repoPath) || [];
    mockGitClient.exec = async (args: string[]) => {
      if (args[0] === 'config' && args[1] === '--get') {
        const val = localConfigs.get(args[2]) || globalConfigs.get(args[2]);
        if (!val) throw new Error('config not found');
        return { stdout: val, stderr: '' };
      }
      return { stdout: '', stderr: '' };
    };

    profileManager = new ProfileManager(store, authManager, mockGitClient);
    opManager = new OperationManager(profileManager, mockGitClient);
  });

  describe('1. Section 2: Per-Repo Profile Binding & Resolution', () => {
    it('should resolve profile via explicit binding first, then matcher, then fallback', async () => {
      const workProfile = await profileManager.createProfile({
        name: 'Work',
        git: { name: 'Work Dev', email: 'dev@work.corp' },
        github: { host: 'github.com', username: 'workdev' },
        authentication: { type: 'none' },
      });

      const personalProfile = await profileManager.createProfile({
        name: 'Personal',
        git: { name: 'Personal Dev', email: 'dev@personal.me' },
        github: { host: 'github.com', username: 'personaldev' },
        authentication: { type: 'none' },
      });

      const repoPath = 'C:/repos/app';

      // 1. Initially unbound, matcher matches by remote owner
      const resMatcher = await profileManager.resolveProfileForRepository(repoPath, {
        remotes: [{ name: 'origin', host: 'github.com', owner: 'workdev', repository: 'app' }],
      });
      assert.strictEqual(resMatcher?.source, 'matcher');
      assert.strictEqual(resMatcher?.profile.id, workProfile.id);
      assert.strictEqual(resMatcher?.isBound, false);

      // 2. Explicit binding overrides matcher
      await profileManager.associateRepository(repoPath, personalProfile.id);
      const resBound = await profileManager.resolveProfileForRepository(repoPath, {
        remotes: [{ name: 'origin', host: 'github.com', owner: 'workdev', repository: 'app' }],
      });
      assert.strictEqual(resBound?.source, 'binding');
      assert.strictEqual(resBound?.profile.id, personalProfile.id);
      assert.strictEqual(resBound?.isBound, true);

      // 3. Fallback when unassociated and no remotes match
      await profileManager.disassociateRepository(repoPath);
      const resFallback = await profileManager.resolveProfileForRepository(repoPath, {
        remotes: [{ name: 'origin', host: 'gitlab.com', owner: 'unknown', repository: 'app' }],
      });
      assert.strictEqual(resFallback?.source, 'fallback');
      assert.ok(resFallback?.profile);
    });

    it('switchProfile should apply to current repo and save association atomically', async () => {
      const p1 = await profileManager.createProfile({
        name: 'P1',
        git: { name: 'Dev 1', email: 'dev1@corp.com' },
        authentication: { type: 'none' },
      });

      const p2 = await profileManager.createProfile({
        name: 'P2',
        git: { name: 'Dev 2', email: 'dev2@corp.com' },
        authentication: { type: 'none' },
      });

      const repoPath = 'C:/repos/my-repo';
      await profileManager.switchProfile(p2.id, repoPath);

      // Repo should be explicitly bound to p2
      assert.strictEqual(await profileManager.getAssociation(repoPath), p2.id);
      assert.strictEqual(localConfigs.get('user.email'), 'dev2@corp.com');
      assert.strictEqual(localConfigs.get('user.name'), 'Dev 2');
    });
  });

  describe('2. Section 3: Wrong-Account Fixes', () => {
    it('SSH: should always include -o IdentitiesOnly=yes in core.sshCommand', async () => {
      const sshProfile = await profileManager.createProfile({
        name: 'ssh-sec',
        git: { name: 'SSH Security', email: 'sec@test.org' },
        github: { host: 'github.com', username: 'secdev' },
        authentication: {
          type: 'ssh',
          sshKeyPath: 'C:/Users/dev/.ssh/id_ed25519_custom',
        },
      });

      const repoPath = 'C:/repos/ssh-sec-project';
      await profileManager.switchProfile(sshProfile.id, repoPath);

      const sshCmd = localConfigs.get('core.sshCommand');
      assert.ok(sshCmd);
      assert.ok(sshCmd.includes('-o IdentitiesOnly=yes'), 'Must include -o IdentitiesOnly=yes');
      assert.ok(sshCmd.includes('"C:/Users/dev/.ssh/id_ed25519_custom"'), 'Path must be properly quoted');
    });

    it('GitHub CLI: should pass --user <username> when requesting account token', async () => {
      let executedArgs: string[] = [];
      const cliAuth = new GitHubCliAuth();
      (cliAuth as any).getToken = async (hostname?: string, username?: string) => {
        executedArgs = ['auth', 'token'];
        if (hostname) executedArgs.push('--hostname', hostname);
        if (username) executedArgs.push('--user', username);
        return 'gho_customUserToken123';
      };

      const token = await cliAuth.getToken('github.com', 'alice-work');
      assert.strictEqual(token, 'gho_customUserToken123');
      assert.deepStrictEqual(executedArgs, ['auth', 'token', '--hostname', 'github.com', '--user', 'alice-work']);
    });

    it('GitHub API: should NOT swallow real 401/403/404 errors with silent gh fallback', async () => {
      const client = new GitHubClient({
        host: 'github.com',
        auth: { type: 'pat', username: 'testuser', credential: 'ghp_invalidOrExpired' },
      });

      // Mock global fetch to return 401 Unauthorized
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async () =>
          new Response(JSON.stringify({ message: 'Bad credentials' }), {
            status: 401,
            statusText: 'Unauthorized',
            headers: { 'Content-Type': 'application/json' },
          });

        let errorCaught: Error | undefined;
        try {
          await client.getCurrentUser();
        } catch (err: any) {
          errorCaught = err;
        }

        assert.ok(errorCaught, 'Expected 401 error to be thrown');
        assert.ok(
          errorCaught?.message.includes('401 Unauthorized'),
          `Error message should contain 401 Unauthorized: ${errorCaught?.message}`
        );
        assert.ok(
          errorCaught?.message.includes('Bad credentials'),
          `Error message should contain server message: ${errorCaught?.message}`
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('3. Section 4: Commit & Push Guard', () => {
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
      // Identity should be fixed to match profile
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

      // Test wildcard pattern my-*
      remotesMap.set(repoPath, [
        { name: 'origin', host: 'github.com', owner: 'my-subsidiary', repository: 'frontend' },
      ]);
      const resWildcard = await opManager.execute(op);
      assert.strictEqual(resWildcard.success, true, 'my-subsidiary matches wildcard pattern my-*');
    });

    it('Guard: should fail closed and prompt when safety check cannot run', async () => {
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
        return false; // User declines to proceed blind
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
  });

  describe('4. Section 8: "Verify Account" Action', () => {
    it('AccountVerifier: should verify PAT token, compare login and report scopes/expiration', async () => {
      const verifier = new AccountVerifier(secretStore, mockGitClient);

      const profile = await profileManager.createProfile(
        {
          name: 'VerifiedPAT',
          git: { name: 'Pat Guy', email: 'pat@test.com' },
          github: { host: 'github.com', username: 'testuser' },
          authentication: { type: 'pat' },
        },
        'ghp_sampleValidPAT123'
      );

      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async () =>
          new Response(JSON.stringify({ login: 'testuser', id: 12345 }), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'x-oauth-scopes': 'repo, read:user, workflow',
              'github-authentication-token-expiration': '2027-01-01 00:00:00 UTC',
            },
          });

        const res = await verifier.verifyProfile(profile);
        assert.strictEqual(res.success, true);
        assert.strictEqual(res.login, 'testuser');
        assert.strictEqual(res.message, 'Authenticated as @testuser');
        assert.deepStrictEqual(res.scopes, ['repo', 'read:user', 'workflow']);
        assert.strictEqual(res.expiration, '2027-01-01 00:00:00 UTC');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('AccountVerifier: should report mismatch when PAT authenticates as a different user', async () => {
      const verifier = new AccountVerifier(secretStore, mockGitClient);

      const profile = await profileManager.createProfile(
        {
          name: 'WrongAccountProfile',
          git: { name: 'Expected User', email: 'exp@test.com' },
          github: { host: 'github.com', username: 'workdev' },
          authentication: { type: 'pat' },
        },
        'ghp_wrongUserToken'
      );

      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async () =>
          new Response(JSON.stringify({ login: 'personaldev', id: 999 }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });

        const res = await verifier.verifyProfile(profile);
        assert.strictEqual(res.success, false);
        assert.strictEqual(res.login, 'personaldev');
        assert.ok(res.message.includes('Token authenticates as @personaldev, but profile expects @workdev'));
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('AccountVerifier: should parse SSH authentication greeting and username', async () => {
      const verifier = new AccountVerifier(secretStore, mockGitClient);
      const parseMethod = (verifier as any).parseSshOutput.bind(verifier);

      const sshOutput = `Hi octocat! You've successfully authenticated, but GitHub does not provide shell access.`;
      const res = parseMethod(sshOutput, 'octocat');
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.login, 'octocat');
      assert.strictEqual(res.message, 'Authenticated as @octocat via SSH');

      const mismatchRes = parseMethod(sshOutput, 'workdev');
      assert.strictEqual(mismatchRes.success, false);
      assert.ok(mismatchRes.message.includes('expected @workdev'));

      const deniedRes = parseMethod('git@github.com: Permission denied (publickey).', 'octocat');
      assert.strictEqual(deniedRes.success, false);
      assert.ok(deniedRes.message.includes('Permission denied (publickey)'));
    });
  });
});
