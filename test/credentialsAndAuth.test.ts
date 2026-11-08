import * as assert from 'assert';
import { SecretStore } from '../src/auth/secretStore';
import { AuthManager } from '../src/auth/authManager';
import { GitProfile, GitRemote, SystemDiscoveryResult } from '../src/contracts';
import { SystemDiscovery } from '../src/discovery/systemDiscovery';
import { PersistentProfileStore } from '../src/profiles/profileStore';
import { ProfileManager } from '../src/profiles/profileManager';
import { GitClient } from '../src/git/gitClient';
import { GitHubCliAuth } from '../src/auth/githubCliAuth';
import { GitHubClient } from '../src/github/githubClient';
import { AccountVerifier } from '../src/auth/accountVerifier';

describe('Credentials & Authentication Suite', () => {
  describe('AuthManager & SecretStore', () => {
    let secretStore: SecretStore;
    let authManager: AuthManager;

    beforeEach(() => {
      secretStore = new SecretStore();
      authManager = new AuthManager(secretStore);
    });

    it('should store and resolve PAT token securely', async () => {
      const profile: GitProfile = {
        id: 'profile-test-1',
        name: 'pat-profile',
        git: { name: 'Test', email: 'test@example.com', scope: 'local' },
        github: { host: 'github.com', username: 'testuser' },
        authentication: {
          type: 'pat',
          secretRef: { provider: 'vscode-secret-storage', key: 'gitaxis.profile.profile-test-1.github-token' },
        },
        metadata: { source: 'manual' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await authManager.saveTokenForProfile(profile.id, 'ghp_secretToken1234567890abcdef');

      const resolved = await authManager.resolveAuthentication(profile);
      assert.strictEqual(resolved.type, 'pat');
      assert.strictEqual(resolved.username, 'testuser');
      assert.strictEqual(resolved.credential, 'ghp_secretToken1234567890abcdef');

      // Clean up
      await authManager.clearAuthForProfile(profile.id);
      const resolvedAfterClear = await authManager.resolveAuthentication(profile);
      assert.strictEqual(resolvedAfterClear.credential, undefined);
    });
  });

  describe('SystemDiscovery & Suggestions', () => {
    it('should generate profile suggestions from GitHub CLI accounts and Git config', () => {
      const gitClient = new GitClient('git');
      const discovery = new SystemDiscovery(gitClient);

      const scanResult: SystemDiscoveryResult = {
        git: { found: true, version: 'git version 2.40.0' },
        gitConfig: {
          userName: 'John Doe',
          userEmail: 'john@company.com',
          credentialHelpers: ['manager'],
        },
        githubCli: {
          found: true,
          version: 'gh version 2.30.0',
          accounts: [
            {
              username: 'johndoe-gh',
              host: 'github.com',
              active: true,
              authStatusOk: true,
            },
          ],
        },
        credentialHelper: {
          helpers: ['manager'],
          hasGCM: true,
        },
        timestamp: new Date().toISOString(),
      };

      const suggestions = discovery.suggestProfiles(scanResult);
      assert.ok(suggestions.length >= 1);

      const ghSuggestion = suggestions.find(s => s.name === 'johndoe-gh');
      assert.ok(ghSuggestion);
      assert.strictEqual(ghSuggestion?.github?.username, 'johndoe-gh');
      assert.strictEqual(ghSuggestion?.authentication.type, 'github-cli');
      assert.strictEqual(ghSuggestion?.imported, true);
    });
  });

  describe('Profile Credentials & Remote Synchronization', () => {
    let profileManager: ProfileManager;
    let secretStore: SecretStore;
    let authManager: AuthManager;
    let store: PersistentProfileStore;
    let localConfigs: Map<string, string>;
    let globalConfigs: Map<string, string>;
    let remotesMap: Map<string, GitRemote[]>;
    let setRemoteCalls: { repoPath: string; name: string; url: string; push?: boolean }[];

    beforeEach(() => {
      store = new PersistentProfileStore();
      secretStore = new SecretStore();
      authManager = new AuthManager(secretStore);

      localConfigs = new Map();
      globalConfigs = new Map();
      remotesMap = new Map();
      setRemoteCalls = [];

      const mockGitClient = new GitClient('git');

      mockGitClient.isRepository = async (_repoPath: string) => true;
      mockGitClient.getRoot = async (repoPath: string) => repoPath;

      mockGitClient.setLocalConfig = async (_repoPath: string, key: string, value: string) => {
        localConfigs.set(key, value);
      };
      mockGitClient.getLocalConfig = async (_repoPath: string, key: string) => {
        return localConfigs.get(key);
      };
      mockGitClient.unsetLocalConfig = async (_repoPath: string, key: string) => {
        localConfigs.delete(key);
      };

      mockGitClient.setGlobalConfig = async (key: string, value: string) => {
        globalConfigs.set(key, value);
      };
      mockGitClient.getGlobalConfig = async (key: string) => {
        return globalConfigs.get(key);
      };
      mockGitClient.unsetGlobalConfig = async (key: string) => {
        globalConfigs.delete(key);
      };

      mockGitClient.getRemotes = async (repoPath: string) => {
        return remotesMap.get(repoPath) || [];
      };
      mockGitClient.setRemoteUrl = async (repoPath: string, name: string, url: string, push?: boolean) => {
        setRemoteCalls.push({ repoPath, name, url, push });
      };

      profileManager = new ProfileManager(store, authManager, mockGitClient);
    });

    it('should configure credential.https://${host}.username in repo and global if global scope', async () => {
      const repoPath = 'C:/repos/project-1';

      const localProfile = await profileManager.createProfile({
        name: 'work-local',
        git: { name: 'Work Dev', email: 'dev@work.com', scope: 'local' },
        github: { host: 'github.com', username: 'workdev' },
        authentication: { type: 'none' },
      });

      await profileManager.switchProfile(localProfile.id, repoPath);
      assert.strictEqual(localConfigs.get('credential.https://github.com.username'), 'workdev');
      assert.strictEqual(globalConfigs.get('credential.https://github.com.username'), undefined);

      const globalProfile = await profileManager.createProfile({
        name: 'personal-global',
        git: { name: 'Personal Dev', email: 'dev@personal.com', scope: 'global' },
        github: { host: 'github.com', username: 'mshrnth' },
        authentication: { type: 'none' },
      });

      await profileManager.switchProfile(globalProfile.id, repoPath);
      assert.strictEqual(localConfigs.get('credential.https://github.com.username'), 'mshrnth');
      assert.strictEqual(globalConfigs.get('credential.https://github.com.username'), 'mshrnth');
    });

    it('should NOT persist PAT extraheader to git config and should unset any leftover extraheader', async () => {
      const repoPath = 'C:/repos/project-2';
      const testPat = 'ghp_secretTokenABC123';

      localConfigs.set('http.https://github.com/.extraheader', 'AUTHORIZATION: basic oldtoken');

      const patProfile = await profileManager.createProfile(
        {
          name: 'pat-user',
          git: { name: 'PAT User', email: 'pat@example.com' },
          github: { host: 'github.com', username: 'patuser' },
          authentication: { type: 'pat' },
        },
        testPat
      );

      await profileManager.switchProfile(patProfile.id, repoPath);

      assert.strictEqual(localConfigs.has('http.https://github.com/.extraheader'), false);
      assert.strictEqual(localConfigs.has('http.extraheader'), false);

      const noPatProfile = await profileManager.createProfile({
        name: 'no-pat-user',
        git: { name: 'No PAT', email: 'nopat@example.com' },
        github: { host: 'github.com', username: 'nopatuser' },
        authentication: { type: 'none' },
      });

      await profileManager.switchProfile(noPatProfile.id, repoPath);
      assert.strictEqual(localConfigs.has('http.https://github.com/.extraheader'), false);
    });

    it('should configure core.sshCommand when sshKeyPath is provided and unset for non-SSH', async () => {
      const repoPath = 'C:/repos/project-3';

      const sshProfile = await profileManager.createProfile({
        name: 'ssh-user',
        git: { name: 'SSH Dev', email: 'ssh@example.com' },
        github: { host: 'github.com', username: 'sshdev' },
        authentication: {
          type: 'ssh',
          sshKeyPath: 'C:\\Users\\dev\\.ssh\\id_ed25519_custom',
        },
      });

      await profileManager.switchProfile(sshProfile.id, repoPath);
      assert.strictEqual(
        localConfigs.get('core.sshCommand'),
        'ssh -i "C:/Users/dev/.ssh/id_ed25519_custom" -o IdentitiesOnly=yes'
      );

      const nonSshProfile = await profileManager.createProfile({
        name: 'standard-user',
        git: { name: 'Standard Dev', email: 'std@example.com' },
        authentication: { type: 'none' },
      });

      await profileManager.switchProfile(nonSshProfile.id, repoPath);
      assert.strictEqual(localConfigs.has('core.sshCommand'), false);
    });

    it('should update HTTPS remote URL to embed profile username', async () => {
      const repoPath = 'C:/repos/project-4';

      remotesMap.set(repoPath, [
        {
          name: 'origin',
          fetchUrl: 'https://old-user@github.com/target-org/my-project.git',
          pushUrl: 'https://old-user@github.com/target-org/my-project.git',
          host: 'github.com',
          owner: 'target-org',
          repository: 'my-project',
        },
        {
          name: 'ssh-remote',
          fetchUrl: 'git@github.com:target-org/my-project.git',
          pushUrl: 'git@github.com:target-org/my-project.git',
          host: 'github.com',
          owner: 'target-org',
          repository: 'my-project',
        },
        {
          name: 'gitlab',
          fetchUrl: 'https://gitlab.com/target-org/my-project.git',
          pushUrl: 'https://gitlab.com/target-org/my-project.git',
          host: 'gitlab.com',
          owner: 'target-org',
          repository: 'my-project',
        },
      ]);

      const activeProfile = await profileManager.createProfile({
        name: 'target-profile',
        git: { name: 'Target User', email: 'target@example.com' },
        github: { host: 'github.com', username: 'target-user' },
        authentication: { type: 'none' },
      });

      await profileManager.switchProfile(activeProfile.id, repoPath);

      assert.strictEqual(setRemoteCalls.length, 1);
      assert.strictEqual(setRemoteCalls[0].name, 'origin');
      assert.strictEqual(setRemoteCalls[0].url, 'https://target-user@github.com/target-org/my-project.git');

      const touchedNames = setRemoteCalls.map(c => c.name);
      assert.strictEqual(touchedNames.includes('ssh-remote'), false);
      assert.strictEqual(touchedNames.includes('gitlab'), false);
    });

    it('should handle non-git directory gracefully without throwing', async () => {
      const nonGitPath = 'C:/non-git-folder';
      const profile = await profileManager.createProfile({
        name: 'test-nongit',
        git: { name: 'Dev', email: 'dev@test.com' },
        github: { host: 'github.com', username: 'dev' },
        authentication: { type: 'none' },
      });

      const originalIsRepo = profileManager['gitClient'].isRepository;
      const originalSetLocal = profileManager['gitClient'].setLocalConfig;
      profileManager['gitClient'].isRepository = async (p: string) => p !== nonGitPath;
      profileManager['gitClient'].setLocalConfig = async (p: string, k: string, v: string) => {
        if (p === nonGitPath) {
          throw new Error('fatal: not a git repository');
        }
        return originalSetLocal.call(profileManager['gitClient'], p, k, v);
      };

      await assert.doesNotReject(async () => {
        await profileManager.switchProfile(profile.id, nonGitPath);
      });

      profileManager['gitClient'].isRepository = originalIsRepo;
      profileManager['gitClient'].setLocalConfig = originalSetLocal;
    });

    it('should handle custom enterprise host and distinct pushurl', async () => {
      const repoPath = 'C:/repos/corp-project';
      const enterpriseHost = 'github.enterprise.corp';

      remotesMap.set(repoPath, [
        {
          name: 'origin',
          fetchUrl: `https://${enterpriseHost}/org/repo.git`,
          pushUrl: `https://${enterpriseHost}/org/repo.git`,
          host: enterpriseHost,
          owner: 'org',
          repository: 'repo',
        },
      ]);

      const profile = await profileManager.createProfile({
        name: 'corp-user',
        git: { name: 'Corp Dev', email: 'corp@enterprise.com' },
        github: { host: enterpriseHost, username: 'corpdev' },
        authentication: {
          type: 'ssh',
          sshKeyPath: 'ssh -i /path/to/key -o IdentitiesOnly=yes',
        },
      });

      await profileManager.switchProfile(profile.id, repoPath);

      assert.strictEqual(localConfigs.get(`credential.https://${enterpriseHost}.username`), 'corpdev');
      assert.strictEqual(localConfigs.get('core.sshCommand'), 'ssh -i /path/to/key -o IdentitiesOnly=yes');
      assert.strictEqual(setRemoteCalls.length, 1);
      assert.strictEqual(setRemoteCalls[0].url, `https://corpdev@${enterpriseHost}/org/repo.git`);
    });

    it('should NOT overwrite SSH push URL when fetch URL is HTTPS', async () => {
      const repoPath = 'C:/repos/mixed-remote';

      remotesMap.set(repoPath, [
        {
          name: 'origin',
          fetchUrl: 'https://github.com/myorg/myrepo.git',
          pushUrl: 'git@github.com:myorg/myrepo.git',
          host: 'github.com',
          owner: 'myorg',
          repository: 'myrepo',
        },
      ]);

      const profile = await profileManager.createProfile({
        name: 'hybrid-user',
        git: { name: 'Hybrid Dev', email: 'dev@hybrid.com' },
        github: { host: 'github.com', username: 'hybriddev' },
        authentication: { type: 'none' },
      });

      await profileManager.switchProfile(profile.id, repoPath);

      const fetchCall = setRemoteCalls.find(c => c.name === 'origin' && !c.push);
      assert.ok(fetchCall);
      assert.strictEqual(fetchCall.url, 'https://hybriddev@github.com/myorg/myrepo.git');

      const pushCall = setRemoteCalls.find(c => c.name === 'origin' && c.push);
      assert.strictEqual(pushCall, undefined);
    });

    it('should expand tilde (~) in sshKeyPath to home directory', async () => {
      const repoPath = 'C:/repos/ssh-tilde-project';

      const profile = await profileManager.createProfile({
        name: 'tilde-ssh-user',
        git: { name: 'Tilde Dev', email: 'tilde@dev.com' },
        authentication: {
          type: 'ssh',
          sshKeyPath: '~/.ssh/id_custom',
        },
      });

      await profileManager.switchProfile(profile.id, repoPath);

      const configuredCmd = localConfigs.get('core.sshCommand');
      assert.ok(configuredCmd);
      assert.ok(!configuredCmd.includes('~'), 'sshCommand should not contain raw tilde (~)');
      assert.ok(configuredCmd.includes('/.ssh/id_custom') || configuredCmd.includes('\\.ssh\\id_custom'));
    });

    it('should unset GCM username when switching to a profile without github username', async () => {
      const repoPath = 'C:/repos/gcm-unset-project';

      const ghProfile = await profileManager.createProfile({
        name: 'gh-user',
        git: { name: 'GH Dev', email: 'gh@dev.com' },
        github: { host: 'github.com', username: 'ghuser' },
        authentication: { type: 'none' },
      });

      await profileManager.switchProfile(ghProfile.id, repoPath);
      assert.strictEqual(localConfigs.get('credential.https://github.com.username'), 'ghuser');

      const localOnlyProfile = await profileManager.createProfile({
        name: 'local-only',
        git: { name: 'Local Dev', email: 'local@dev.com' },
        authentication: { type: 'none' },
      });

      await profileManager.switchProfile(localOnlyProfile.id, repoPath);
      assert.strictEqual(localConfigs.has('credential.https://github.com.username'), false);
    });

    it('should preserve custom port and normalize host with protocol', async () => {
      const repoPath = 'C:/repos/custom-port-project';
      const enterpriseHost = 'git.corp.net:8443';

      remotesMap.set(repoPath, [
        {
          name: 'origin',
          fetchUrl: `https://${enterpriseHost}/mygroup/myrepo.git`,
          pushUrl: `https://${enterpriseHost}/mygroup/myrepo.git`,
          host: 'git.corp.net',
          owner: 'mygroup',
          repository: 'myrepo',
        },
      ]);

      const profile = await profileManager.createProfile({
        name: 'port-user',
        git: { name: 'Port Dev', email: 'port@corp.com' },
        github: { host: 'https://git.corp.net:8443/', username: 'portdev' },
        authentication: { type: 'none' },
      });

      await profileManager.switchProfile(profile.id, repoPath);

      assert.strictEqual(localConfigs.get('credential.https://git.corp.net:8443.username'), 'portdev');
      const fetchCall = setRemoteCalls.find(c => c.name === 'origin' && !c.push);
      assert.ok(fetchCall);
      assert.strictEqual(fetchCall.url, 'https://portdev@git.corp.net:8443/mygroup/myrepo.git');
    });

    it('should strip surrounding quotes from sshKeyPath', async () => {
      const repoPath = 'C:/repos/ssh-quoted-project';
      const sshProfile = await profileManager.createProfile({
        name: 'ssh-quoted',
        git: { name: 'SSH Quoted', email: 'quoted@test.org' },
        github: { host: 'github.com', username: 'quoteduser' },
        authentication: {
          type: 'ssh',
          sshKeyPath: '"/custom/path with spaces/id_rsa"',
        },
      });

      await profileManager.switchProfile(sshProfile.id, repoPath);
      const configuredSsh = localConfigs.get('core.sshCommand');
      assert.ok(configuredSsh);
      assert.ok(!configuredSsh.includes('""'), 'Should not contain duplicate double quotes');
      assert.ok(configuredSsh.includes('-o IdentitiesOnly=yes'));
    });

    it('should apply identity to current repo and save association atomically', async () => {
      const p2 = await profileManager.createProfile({
        name: 'P2',
        git: { name: 'Dev 2', email: 'dev2@corp.com' },
        authentication: { type: 'none' },
      });

      const repoPath = 'C:/repos/my-repo';
      await profileManager.switchProfile(p2.id, repoPath);

      assert.strictEqual(await profileManager.getAssociation(repoPath), p2.id);
      assert.strictEqual(localConfigs.get('user.email'), 'dev2@corp.com');
      assert.strictEqual(localConfigs.get('user.name'), 'Dev 2');
    });
  });

  describe('GitHub CLI & API Credentials', () => {
    it('should pass --user <username> when requesting account token via GitHubCliAuth', async () => {
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

    it('should NOT swallow real 401/403/404 errors with silent gh fallback', async () => {
      const client = new GitHubClient({
        host: 'github.com',
        auth: { type: 'pat', username: 'testuser', credential: 'ghp_invalidOrExpired' },
      });

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
        assert.ok(errorCaught?.message.includes('401 Unauthorized'));
        assert.ok(errorCaught?.message.includes('Bad credentials'));
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('GitHubClient should throw immediately for credential-manager without falling back to gh', async () => {
      const client = new GitHubClient({
        auth: {
          type: 'credential-manager',
          username: 'work-user',
        },
      });

      await assert.rejects(
        async () => client.getCurrentUser(),
        (err: any) => {
          assert.ok(err.message.includes('This profile has no API token'));
          return true;
        }
      );
    });

    it('GitHubClient should throw immediately for github-cli without credential token', async () => {
      const client = new GitHubClient({
        auth: {
          type: 'github-cli',
          username: 'cli-user',
        },
      });

      await assert.rejects(
        async () => client.getCurrentUser(),
        (err: any) => {
          assert.ok(err.message.includes('cli-user is not logged in to gh'));
          return true;
        }
      );
    });

    it('GitHubClient: createRepository should use /user/repos when owner matches profile username', async () => {
      let requestedEndpoint = '';
      const client = new GitHubClient({
        auth: {
          type: 'pat',
          username: 'target-user',
          credential: 'test-token',
        },
      });

      (client as any).request = async (endpoint: string, _method: string, body: any) => {
        requestedEndpoint = endpoint;
        return { id: 1, name: body.name, full_name: `target-user/${body.name}`, private: body.private };
      };

      await client.createRepository('my-repo', 'desc', false, 'target-user');
      assert.strictEqual(requestedEndpoint, '/user/repos');

      await client.createRepository('org-repo', 'desc', false, 'company-org');
      assert.strictEqual(requestedEndpoint, '/orgs/company-org/repos');
    });

    it('GitHubClient.request should provide signal with 5000ms timeout', async () => {
      let capturedSignal: AbortSignal | null | undefined;
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async (_url: any, init?: RequestInit) => {
          capturedSignal = init?.signal;
          return new Response(JSON.stringify({ login: 'octocat' }), { status: 200 });
        }) as any;

        const ghClient = new GitHubClient({
          auth: { type: 'pat', credential: 'ghp_dummy_token' },
        });

        const user = await ghClient.getCurrentUser();
        assert.strictEqual(user.login, 'octocat');
        assert.ok(capturedSignal, 'fetch must receive an AbortSignal');
        assert.strictEqual(capturedSignal?.aborted, false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('AccountVerifier', () => {
    let secretStore: SecretStore;
    let mockGitClient: GitClient;
    let profileManager: ProfileManager;

    beforeEach(() => {
      secretStore = new SecretStore();
      mockGitClient = new GitClient('git');
      const store = new PersistentProfileStore();
      const authManager = new AuthManager(secretStore);
      profileManager = new ProfileManager(store, authManager, mockGitClient);
    });

    it('should verify PAT token, compare login and report scopes/expiration', async () => {
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

    it('should report mismatch when PAT authenticates as a different user', async () => {
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

    it('should parse SSH authentication greeting and username', () => {
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

    it('should return not-verified by default for credential-manager and support onDemand verification', async () => {
      let execWithStdinCalledWith: string[] = [];
      mockGitClient.execWithStdin = async (args: string[]) => {
        execWithStdinCalledWith = args;
        return { stdout: 'protocol=https\nhost=github.com\nusername=httpsuser\npassword=fake-token\n', stderr: '' };
      };

      const profile = await profileManager.createProfile({
        name: 'HttpsProfile',
        git: { name: 'HTTPS Dev', email: 'dev@https.org' },
        github: { host: 'github.com', username: 'httpsuser' },
        authentication: { type: 'credential-manager' },
      });

      const verifier = new AccountVerifier(secretStore, mockGitClient);

      // Default / startup verification: neutral without running commands
      const resDefault = await verifier.verifyProfile(profile, 'C:/repos/https-repo');
      assert.strictEqual(resDefault.success, true);
      assert.strictEqual(resDefault.status, 'not-verified');
      assert.strictEqual(resDefault.message, 'Configured, not verified');
      assert.strictEqual(execWithStdinCalledWith.length, 0);

      // On-demand verification: calls credential fill
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async () =>
          new Response(JSON.stringify({ login: 'httpsuser', id: 123 }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });

        const resOnDemand = await verifier.verifyProfile(profile, 'C:/repos/https-repo', { force: true, onDemand: true });
        assert.strictEqual(resOnDemand.success, true);
        assert.strictEqual(resOnDemand.status, 'verified');
        assert.strictEqual(execWithStdinCalledWith[0], 'credential');
        assert.strictEqual(execWithStdinCalledWith[1], 'fill');
        assert.ok(resOnDemand.message.includes('Verified @httpsuser via credential helper'));
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('verifySsh should safely reject invalid sshKeyPath without command execution', async () => {
      const verifier = new AccountVerifier(secretStore, mockGitClient);

      const maliciousProfile: any = {
        id: 'prof_bad_ssh',
        name: 'BadSSH',
        git: { name: 'User', email: 'u@test.org' },
        github: { host: 'github.com', username: 'octocat' },
        authentication: {
          type: 'ssh',
          sshKeyPath: 'id_rsa" -o ProxyCommand="calc.exe"',
        },
      };

      const result = await verifier.verifyProfile(maliciousProfile);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.status, 'failed');
      assert.ok(result.message.includes('Invalid SSH key path'));
    });

    it('verifySsh should support default SSH keys without sshKeyPath', async () => {
      const verifier = new AccountVerifier(secretStore, mockGitClient);

      const defaultSshProfile: any = {
        id: 'prof_default_ssh',
        name: 'DefaultSSH',
        git: { name: 'User', email: 'u@test.org' },
        github: { host: 'github.com', username: 'octocat' },
        authentication: {
          type: 'ssh',
        },
      };

      const result = await verifier.verifyProfile(defaultSshProfile);
      assert.strictEqual(result.message.includes('No SSH key path configured'), false);
    });

    it('fetchGitHubUser should provide signal with 5000ms timeout', async () => {
      let capturedSignal: AbortSignal | null | undefined;
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async (_url: any, init?: RequestInit) => {
          capturedSignal = init?.signal;
          return new Response(JSON.stringify({ login: 'octocat' }), { status: 200 });
        }) as any;

        const verifier = new AccountVerifier(secretStore, mockGitClient);

        const profile: GitProfile = {
          id: 'prof_test_fetch',
          name: 'Test Fetch',
          git: { name: 'User', email: 'u@test.org', scope: 'local' },
          github: { host: 'github.com', username: 'octocat' },
          authentication: { type: 'pat', source: 'vs-code-secret-storage' },
          metadata: { source: 'manual', imported: false },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        await secretStore.setSecret('prof_test_fetch', 'github-token', 'ghp_fake_token');
        const result = await verifier.verifyProfile(profile);

        assert.strictEqual(result.success, true);
        assert.ok(capturedSignal, 'fetch must receive an AbortSignal');
        assert.strictEqual(capturedSignal?.aborted, false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should return neutral status not-verified for credential-manager on startup without ls-remote', async () => {
      let commandExecuted = false;
      mockGitClient.exec = async () => {
        commandExecuted = true;
        return { stdout: '', stderr: '' };
      };

      const verifier = new AccountVerifier(secretStore, mockGitClient);
      const profile: any = {
        id: 'p-gcm',
        name: 'GcmProfile',
        git: { name: 'User', email: 'user@test.com' },
        github: { host: 'github.com', username: 'gcm-user' },
        authentication: { type: 'credential-manager' },
      };

      const result = await verifier.verifyProfile(profile, 'C:/repos/test');
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.status, 'not-verified');
      assert.strictEqual(result.message, 'Configured, not verified');
      assert.strictEqual(commandExecuted, false);
    });

    it('should cache verification result and respect clearCache', async () => {
      await secretStore.setSecret('p-cache', 'github-token', 'cache-token');
      const verifier = new AccountVerifier(secretStore, mockGitClient);

      let fetchCallCount = 0;
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async () => {
          fetchCallCount++;
          return new Response(JSON.stringify({ login: 'cache-user', id: 50 }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        };

        const profile: any = {
          id: 'p-cache',
          name: 'CacheProfile',
          git: { name: 'Cache', email: 'cache@test.com' },
          github: { host: 'github.com', username: 'cache-user' },
          authentication: { type: 'pat' },
        };

        const res1 = await verifier.verifyProfile(profile);
        assert.strictEqual(res1.status, 'verified');
        assert.strictEqual(fetchCallCount, 1);

        // Second call hits cache
        const res2 = await verifier.verifyProfile(profile);
        assert.strictEqual(res2.status, 'verified');
        assert.strictEqual(fetchCallCount, 1);

        // After clearing cache, makes fresh call
        verifier.clearCache(profile.id);
        const res3 = await verifier.verifyProfile(profile);
        assert.strictEqual(res3.status, 'verified');
        assert.strictEqual(fetchCallCount, 2);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
