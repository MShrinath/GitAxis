import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { GitHubClient } from '../src/github/githubClient';
import { FolderRuleManager } from '../src/profiles/folderRuleManager';
import { GitClient, GitProcessError } from '../src/git/gitClient';
import { OperationManager } from '../src/operations/operationManager';
import { ProfileManager } from '../src/profiles/profileManager';
import { PersistentProfileStore } from '../src/profiles/profileStore';
import { AuthManager } from '../src/auth/authManager';
import { SecretStore } from '../src/auth/secretStore';
import { AccountVerifier } from '../src/auth/accountVerifier';
import { createOperation } from '../src/contracts';
import { Validation } from '../src/utils/validation';

describe('v0.11.0 Updates & Hardening', () => {
  describe('1. GitHubClient Credential Guard (Item 1 & 10)', () => {
    it('should throw immediately for credential-manager without falling back to gh', async () => {
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

    it('should throw immediately for github-cli without credential token', async () => {
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

    it('createRepository should use /user/repos when owner matches profile username', async () => {
      let requestedEndpoint = '';
      const client = new GitHubClient({
        auth: {
          type: 'pat',
          username: 'target-user',
          credential: 'test-token',
        },
      });

      // Stub request method
      (client as any).request = async (endpoint: string, method: string, body: any) => {
        requestedEndpoint = endpoint;
        return { id: 1, name: body.name, full_name: `target-user/${body.name}`, private: body.private };
      };

      await client.createRepository('my-repo', 'desc', false, 'target-user');
      assert.strictEqual(requestedEndpoint, '/user/repos');

      // When owner is different organization
      await client.createRepository('org-repo', 'desc', false, 'company-org');
      assert.strictEqual(requestedEndpoint, '/orgs/company-org/repos');
    });
  });

  describe('2. Include-File Escaping & Quoting (Item 4)', () => {
    let folderRuleManager: FolderRuleManager;

    beforeEach(() => {
      folderRuleManager = new FolderRuleManager();
    });

    it('should strictly validate hostnames and reject invalid hosts', () => {
      assert.strictEqual(Validation.isValidHost('github.com'), true);
      assert.strictEqual(Validation.isValidHost('git.my-corp.internal'), true);
      assert.strictEqual(Validation.isValidHost('github.com; rm -rf /'), false);
      assert.strictEqual(Validation.isValidHost('github.com"'), false);
      assert.strictEqual(Validation.isValidHost('host with spaces'), false);
    });

    it('should escape backslashes, hashes, semicolons, and quotes in user.name', () => {
      const profile: any = {
        id: 'p-special',
        name: 'SpecialProfile',
        git: {
          name: 'Jane \\ Doe "Lead" # Team ; Dev',
          email: 'jane@example.com',
          scope: 'local',
        },
        authentication: { type: 'none' },
      };

      const config = folderRuleManager.generateProfileGitConfig(profile);
      assert.ok(config.includes('name = "Jane \\\\ Doe \\"Lead\\" # Team ; Dev"'));
      assert.ok(config.includes('email = jane@example.com'));
    });

    it('should properly quote core.sshCommand when key path contains spaces', () => {
      const profile: any = {
        id: 'p-ssh',
        name: 'SshProfile',
        git: { name: 'Dev', email: 'dev@test.com', scope: 'local' },
        authentication: {
          type: 'ssh',
          sshKeyPath: 'C:/Users/Jane Doe/SSH Keys/id_ed25519',
        },
      };

      const config = folderRuleManager.generateProfileGitConfig(profile);
      assert.ok(config.includes('sshCommand = ssh -i \\"C:/Users/Jane Doe/SSH Keys/id_ed25519\\" -o IdentitiesOnly=yes'));
    });

    it('should write include config file using git config --file delegate', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitaxis-include-test-'));
      const includeFile = path.join(tempDir, 'test.gitconfig');
      try {
        const profile: any = {
          id: 'p-delegate',
          name: 'DelegateProfile',
          git: { name: 'Alice', email: 'alice@corp.com', scope: 'local' },
          github: { host: 'github.com', username: 'alice' },
          authentication: { type: 'none' },
        };

        await folderRuleManager.writeProfileConfigFile(includeFile, profile);
        assert.ok(fs.existsSync(includeFile));
        const content = fs.readFileSync(includeFile, 'utf8');
        assert.ok(content.includes('name = Alice'));
        assert.ok(content.includes('email = alice@corp.com'));
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('3. Timeouts & Process Error Classification (Item 6)', () => {
    let opManager: OperationManager;
    let mockGit: GitClient;

    beforeEach(async () => {
      const store = new PersistentProfileStore();
      const secretStore = new SecretStore();
      const authManager = new AuthManager(secretStore);
      mockGit = new GitClient('git');
      const profileManager = new ProfileManager(store, authManager, mockGit);
      opManager = new OperationManager(profileManager, mockGit);
    });

    it('should classify killed GitProcessError as TIMEOUT during operation execution', async () => {
      mockGit.status = async () => {
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

      mockGit.status = async () => {
        throw new GitProcessError('Command terminated', { signal: 'SIGTERM' });
      };

      const resSigterm = await opManager.execute(op);
      assert.strictEqual(resSigterm.success, false);
      assert.strictEqual(resSigterm.error?.code, 'TIMEOUT');
    });
  });

  describe('4. Operation History Cap & GIT_CONFIG_COUNT Appending (Item 10)', () => {
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
      mockGit.push = async (repoPath: string, remote?: string, branch?: string, setUpstream?: boolean, force?: boolean, forceWithLease?: boolean, tags?: boolean, opts?: any) => {
        spawnedEnv = opts?.env;
        return 'Everything up-to-date';
      };

      const opManager = new OperationManager(profileManager, mockGit);

      // Pre-set existing GIT_CONFIG_COUNT in process.env
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
        // Existing count was 1, adding 1 scoped extraheader header -> total count becomes 2
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
  });

  describe('5. Profile Orgs Preservation (Item 9)', () => {
    it('should preserve github.orgs when updating git identity without specifying orgs', async () => {
      const store = new PersistentProfileStore();
      const secretStore = new SecretStore();
      const authManager = new AuthManager(secretStore);
      const mockGit = new GitClient('git');
      const profileManager = new ProfileManager(store, authManager, mockGit);

      const created = await profileManager.createProfile({
        name: 'org-profile',
        git: { name: 'Original Name', email: 'orig@corp.com' },
        github: { host: 'github.com', username: 'org-user', orgs: ['allowed-org-1', 'allowed-org-2'] },
        authentication: { type: 'none' },
      });

      assert.deepStrictEqual(created.github?.orgs, ['allowed-org-1', 'allowed-org-2']);

      const updated = await profileManager.updateProfile(created.id, {
        git: { name: 'Updated Name', email: 'updated@corp.com' },
      });

      assert.strictEqual(updated.git.name, 'Updated Name');
      assert.strictEqual(updated.git.email, 'updated@corp.com');
      assert.deepStrictEqual(updated.github?.orgs, ['allowed-org-1', 'allowed-org-2']);
    });
  });

  describe('6. AccountVerifier Three-State Verification & TTL Cache (Item 5)', () => {
    it('should return neutral status not-verified for credential-manager on startup without ls-remote', async () => {
      const secretStore = new SecretStore();
      const mockGit = new GitClient('git');
      let commandExecuted = false;
      mockGit.exec = async () => {
        commandExecuted = true;
        return { stdout: '', stderr: '' };
      };

      const verifier = new AccountVerifier(secretStore, mockGit);
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
      const secretStore = new SecretStore();
      await secretStore.setSecret('p-cache', 'github-token', 'cache-token');
      const mockGit = new GitClient('git');
      const verifier = new AccountVerifier(secretStore, mockGit);

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

  describe('7. Commit Guard Fail-Closed in Block Mode (Item 7)', () => {
    it('should fail closed immediately without prompt when guard check errors in block mode', async () => {
      const store = new PersistentProfileStore();
      const secretStore = new SecretStore();
      const authManager = new AuthManager(secretStore);
      const mockGit = new GitClient('git');

      // git config get user.email throws an error
      mockGit.getLocalConfig = async () => {
        throw new Error('git config read permission denied');
      };

      const profileManager = new ProfileManager(store, authManager, mockGit);
      await profileManager.createProfile({
        name: 'guard-user',
        git: { name: 'Guard User', email: 'guard@corp.com' },
        authentication: { type: 'none' },
      });

      const opManager = new OperationManager(profileManager, mockGit);
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
      });

      const result = await opManager.execute(op);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error?.code, 'GUARD_CHECK_FAILED');
      assert.strictEqual(result.error?.userMessage, 'Commit guard safety check failed');
      assert.ok(result.error?.message.includes('permission denied'));
    });
  });
});
