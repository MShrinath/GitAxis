import * as assert from 'assert';
import { AccountVerifier } from '../src/auth/accountVerifier';
import { SecretStore } from '../src/auth/secretStore';
import { AuthManager } from '../src/auth/authManager';
import { GitClient } from '../src/git/gitClient';
import { OperationManager } from '../src/operations/operationManager';
import { OperationSafetyChecker } from '../src/operations/safety';
import { PersistentProfileStore } from '../src/profiles/profileStore';
import { ProfileManager } from '../src/profiles/profileManager';
import { ProfileMatcher } from '../src/profiles/profileMatcher';
import { RemoteParser } from '../src/git/remote';
import { BranchParser } from '../src/git/branch';
import { RepositoryParser } from '../src/git/repository';
import { Validation } from '../src/utils/validation';
import { GitProfile, Operation } from '../src/contracts';
import { FolderRuleManager } from '../src/profiles/folderRuleManager';
import { HtmlBuilder, WebviewState } from '../src/webview/html';

class InMemorySecretStorage {
  private data = new Map<string, string>();
  async get(key: string) { return this.data.get(key); }
  async store(key: string, value: string) { this.data.set(key, value); }
  async delete(key: string) { this.data.delete(key); }
}

describe('Audit Defects Remediation Suite (17 Findings)', () => {
  let secretStore: SecretStore;
  let authManager: AuthManager;
  let store: PersistentProfileStore;
  let mockGitClient: GitClient;

  beforeEach(() => {
    secretStore = new SecretStore(new InMemorySecretStorage() as any);
    authManager = new AuthManager(secretStore);
    store = new PersistentProfileStore();
    mockGitClient = new GitClient();
  });

  describe('SEC-01: Profile Verification On-Demand & Status Check', () => {
    it('should return not-verified instead of verified when on-demand verification has no credentials', async () => {
      (mockGitClient as any).execWithStdin = async () => ({
        stdout: '',
        stderr: '',
      });

      const verifier = new AccountVerifier(secretStore, mockGitClient);
      const profile: GitProfile = {
        id: 'p-unauth',
        name: 'Unauth Profile',
        git: { name: 'Unauth', email: 'unauth@test.com', scope: 'local' },
        github: { host: 'github.com', username: 'unauthuser' },
        authentication: { type: 'none' },
        metadata: { source: 'manual', imported: false },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const res = await verifier.verifyProfile(profile, 'C:/repos/test', { onDemand: true });
      assert.strictEqual(res.status, 'not-verified');
      assert.notStrictEqual(res.status, 'verified');
    });
  });

  describe('SEC-02: AccountVerifier Credential Helper Rejection', () => {
    it('should return failed when token verification response is not 200 OK', async () => {
      (mockGitClient as any).execWithStdin = async () => ({
        stdout: 'protocol=https\nhost=github.com\nusername=httpsuser\npassword=expired_token\n\n',
        stderr: '',
      });

      const verifier = new AccountVerifier(secretStore, mockGitClient);
      const profile: GitProfile = {
        id: 'p-cred',
        name: 'Cred Profile',
        git: { name: 'Cred User', email: 'user@cred.com', scope: 'local' },
        github: { host: 'github.com', username: 'httpsuser' },
        authentication: { type: 'credential-manager' },
        metadata: { source: 'manual', imported: false },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async () =>
          new Response(JSON.stringify({ message: 'Bad credentials' }), {
            status: 401,
            statusText: 'Unauthorized',
          });

        const res = await verifier.verifyProfile(profile, 'C:/repos/test', { onDemand: true });
        assert.strictEqual(res.success, false);
        assert.strictEqual(res.status, 'failed');
        assert.ok(res.message.includes('Credential rejected or expired'));
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('SEC-03: Plaintext Credential Sanitization in finally', () => {
    it('should clear runtime credentials even when dispatchExecution throws', async () => {
      const pm = new ProfileManager(store, authManager, mockGitClient);

      // Spy on clearRuntimeCredentials
      let clearCalled = false;
      const originalClear = authManager.clearRuntimeCredentials.bind(authManager);
      authManager.clearRuntimeCredentials = () => {
        clearCalled = true;
        originalClear();
      };

      const opManager = new OperationManager(pm, mockGitClient);
      opManager.setGuardMode('off');
      (opManager as any).dispatchExecution = async () => {
        throw new Error('Fatal network connection reset');
      };

      const op = {
        id: 'op-fail-test',
        type: 'git.push',
        input: { remote: 'origin', branch: 'main' },
        target: { kind: 'remote', remoteName: 'origin', url: '' },
        safety: 'mutating',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
      } as any;

      const result = await opManager.execute(op);
      assert.strictEqual(result.success, false);
      assert.strictEqual(clearCalled, true, 'Runtime credentials must be cleared in finally');
    });
  });

  describe('SEC-04: Reject Credentials on Profile Switch & Delete', () => {
    it('should call rejectCredential when switching from a PAT profile', async () => {
      let rejected: any = null;
      mockGitClient.rejectCredential = async (params) => {
        rejected = params;
      };

      const pm = new ProfileManager(store, authManager, mockGitClient);
      const p1 = await pm.createProfile({
        name: 'PAT Dev',
        git: { name: 'PAT User', email: 'pat@example.com' },
        github: { host: 'github.com', username: 'patuser' },
        authentication: { type: 'pat' },
      }, 'token-123');

      await pm.switchProfile(p1.id);

      const p2 = await pm.createProfile({
        name: 'None Dev',
        git: { name: 'None User', email: 'none@example.com' },
        authentication: { type: 'none' },
      });

      await pm.switchProfile(p2.id);
      assert.ok(rejected !== null, 'rejectCredential should have been called');
      assert.strictEqual(rejected.username, 'patuser');
      assert.strictEqual(rejected.host, 'github.com');
    });

    it('should call rejectCredential when deleting a PAT profile', async () => {
      let rejected: any = null;
      mockGitClient.rejectCredential = async (params) => {
        rejected = params;
      };

      const pm = new ProfileManager(store, authManager, mockGitClient);
      const p = await pm.createProfile({
        name: 'To Delete',
        git: { name: 'Del User', email: 'del@example.com' },
        github: { host: 'github.com', username: 'deluser' },
        authentication: { type: 'pat' },
      }, 'token-456');

      await pm.deleteProfile(p.id);
      assert.ok(rejected !== null, 'rejectCredential should have been called on delete');
      assert.strictEqual(rejected.username, 'deluser');
    });
  });

  describe('SEC-05: Commit Guard with Fallback Profile Resolution', () => {
    it('should block commit when fallback profile author does not match local repo author in block mode', async () => {
      mockGitClient.isRepository = async () => true;
      mockGitClient.getRoot = async () => 'C:/repos/work-repo';
      mockGitClient.getRemotes = async () => [];

      const pm = new ProfileManager(store, authManager, mockGitClient);
      const activeProfile = await pm.createProfile({
        name: 'Company Profile',
        git: { name: 'Alice Work', email: 'alice@company.com' },
        authentication: { type: 'none' },
      });
      await pm.switchProfile(activeProfile.id);

      // Local config has personal identity
      mockGitClient.getLocalConfig = async (_cwd, key) => {
        if (key === 'user.email') return 'alice@personal.org';
        if (key === 'user.name') return 'Alice Personal';
        return undefined;
      };

      const opManager = new OperationManager(pm, mockGitClient);
      opManager.setGuardMode('block');

      const op: any = {
        id: 'op-commit-fallback',
        type: 'git.commit',
        input: { repositoryPath: 'C:/repos/work-repo', message: 'test commit' },
        target: { kind: 'local-repository', path: 'C:/repos/work-repo' },
        safety: 'mutating',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
      };

      const res = await opManager.execute(op);
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.error?.code, 'GUARD_BLOCKED');
      assert.ok(res.error?.message.includes('Commit blocked by GitAxis guard'));
    });
  });

  describe('SEC-06: Destructive Safety Assessment for forceWithLease', () => {
    it('should classify git.push with forceWithLease as destructive', () => {
      const op = {
        id: 'op-fwl',
        type: 'git.push',
        input: { remote: 'origin', branch: 'main', forceWithLease: true },
        target: { kind: 'none' },
        safety: 'mutating',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
      } as any;

      const assessment = OperationSafetyChecker.assessSafety(op);
      assert.strictEqual(assessment.safety, 'destructive');
      assert.strictEqual(assessment.confirmation.required, true);
      assert.ok(assessment.confirmation.reason.includes('Force push'));
    });
  });

  describe('DATA-01: ProfileStore Preserves Orgs When Updating Without Username', () => {
    it('should preserve github.orgs when updating profile with empty username', async () => {
      const profile = await store.create({
        name: 'Enterprise Profile',
        git: { name: 'Corp Dev', email: 'corp@org.com' },
        github: { host: 'github.com', username: 'corp-user', orgs: ['enterprise-team', 'security-org'] },
        authentication: { type: 'none' },
      });

      const updated = await store.update(profile.id, {
        git: { name: 'Corp Dev Updated' },
        github: { username: '', host: 'github.com' },
      });

      assert.ok(updated.github !== undefined, 'github block should not be undefined');
      assert.deepStrictEqual(updated.github?.orgs, ['enterprise-team', 'security-org']);
      assert.strictEqual(updated.github?.username, '');
    });

    it('should preserve existing username when updating github.orgs without specifying username', async () => {
      const profile = await store.create({
        name: 'Preserve Username Profile',
        git: { name: 'Alice', email: 'alice@corp.com' },
        github: { host: 'github.com', username: 'alice-corp', orgs: ['team-alpha'] },
        authentication: { type: 'none' },
      });

      const updated = await store.update(profile.id, {
        github: { orgs: ['team-alpha', 'team-beta'] },
      });

      assert.ok(updated.github !== undefined);
      assert.strictEqual(updated.github?.username, 'alice-corp');
      assert.deepStrictEqual(updated.github?.orgs, ['team-alpha', 'team-beta']);
    });

    it('should preserve existing username when updating github.host without specifying username', async () => {
      const profile = await store.create({
        name: 'Preserve Host Profile',
        git: { name: 'Bob', email: 'bob@corp.com' },
        github: { host: 'github.com', username: 'bob-corp' },
        authentication: { type: 'none' },
      });

      const updated = await store.update(profile.id, {
        github: { host: 'ghe.internal' },
      });

      assert.ok(updated.github !== undefined);
      assert.strictEqual(updated.github?.host, 'ghe.internal');
      assert.strictEqual(updated.github?.username, 'bob-corp');
    });
  });

  describe('DATA-02: Push Guard Remember Action Does Not Leave Warning', () => {
    it('should not push PROFILE_MISMATCH warning when user chooses remember org', async () => {
      const pm = new ProfileManager(store, authManager, mockGitClient);
      const profile = await pm.createProfile({
        name: 'Work Profile',
        git: { name: 'Dev', email: 'dev@company.com' },
        github: { host: 'github.com', username: 'dev-user', orgs: ['initial-org'] },
        authentication: { type: 'none' },
      });
      await pm.switchProfile(profile.id);

      mockGitClient.getRemotes = async () => [
        { name: 'origin', host: 'github.com', owner: 'new-client-org', repository: 'project' },
      ];

      const opManager = new OperationManager(pm, mockGitClient);
      opManager.setGuardMode('warn');
      opManager.setProfileMismatchPrompt(async () => 'remember');
      (opManager as any).dispatchExecution = async () => ({ pushed: true });

      const op: any = {
        id: 'op-push-warn',
        type: 'git.push',
        input: { repositoryPath: 'C:/repos/test', remote: 'origin', branch: 'main' },
        target: { kind: 'remote', remoteName: 'origin', url: 'https://github.com/new-client-org/project.git' },
        safety: 'mutating',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
      };

      const res = await opManager.execute(op);
      assert.strictEqual(res.success, true);
      const mismatchWarn = res.warnings?.find(w => w.code === 'PROFILE_MISMATCH');
      assert.strictEqual(mismatchWarn, undefined, 'Should not have PROFILE_MISMATCH warning after remember');

      // Verify org was added
      const updatedProfile = await pm.getProfile(profile.id);
      assert.ok(updatedProfile?.github?.orgs?.includes('new-client-org'));
    });
  });

  describe('DATA-03: User Confirmation Required Before Mutating Global Git Config', () => {
    it('should not update global git config if confirmGlobalChange returns false', async () => {
      const pm = new ProfileManager(store, authManager, mockGitClient);
      const globalProfile = await pm.createProfile({
        name: 'Global Profile',
        git: { name: 'Global Dev', email: 'global@corp.com', scope: 'global' },
        authentication: { type: 'none' },
      });

      let setGlobalCalled = false;
      mockGitClient.setGlobalConfig = async () => {
        setGlobalCalled = true;
      };

      const applied = await pm.applyIdentityToRepository(
        globalProfile,
        undefined,
        async () => false // User rejects confirmation
      );

      assert.strictEqual(applied, false);
      assert.strictEqual(setGlobalCalled, false, 'Global Git config must not be altered when confirmation is rejected');
    });
  });

  describe('GIT-01: RemoteParser Distinct pushUrl & pushOwner', () => {
    it('should parse pushOwner and pushRepository from distinct pushUrl', () => {
      const remote = RemoteParser.parse(
        'origin',
        'https://github.com/upstream-org/project.git',
        'git@github.com:personal-fork/project.git'
      );

      assert.strictEqual(remote.owner, 'upstream-org');
      assert.strictEqual(remote.repository, 'project');
      assert.strictEqual(remote.pushOwner, 'personal-fork');
      assert.strictEqual(remote.pushRepository, 'project');
    });
  });

  describe('GIT-02: RemoteParser Accepts Non-git SCP SSH Usernames', () => {
    it('should parse deploy@ and source@ SCP URLs', () => {
      const parsedDeploy = RemoteParser.parseUrl('deploy@gitlab.internal:team-infra/provisioner.git');
      assert.ok(parsedDeploy !== undefined);
      assert.strictEqual(parsedDeploy?.host, 'gitlab.internal');
      assert.strictEqual(parsedDeploy?.owner, 'team-infra');
      assert.strictEqual(parsedDeploy?.repository, 'provisioner');

      const parsedBitbucket = RemoteParser.parseUrl('source@bitbucket.org:org/repo.git');
      assert.ok(parsedBitbucket !== undefined);
      assert.strictEqual(parsedBitbucket?.host, 'bitbucket.org');
      assert.strictEqual(parsedBitbucket?.owner, 'org');
      assert.strictEqual(parsedBitbucket?.repository, 'repo');
    });
  });

  describe('GIT-03: ProfileMatcher Non-Additive Remote Scoring', () => {
    it('should not inflate score additively when multiple remotes point to same host', async () => {
      const matcher = new ProfileMatcher(store);
      const profile = await store.create({
        name: 'Enterprise',
        git: { name: 'Ent User', email: 'user@enterprise.org' },
        github: { host: 'github.com', username: 'ent-user' },
        authentication: { type: 'none' },
      });

      // 3 remotes on github.com with ent-user as owner
      const remotes = [
        { name: 'origin', host: 'github.com', owner: 'ent-user', repository: 'repo1' },
        { name: 'upstream', host: 'github.com', owner: 'ent-user', repository: 'repo1' },
        { name: 'mirror', host: 'github.com', owner: 'ent-user', repository: 'repo1' },
      ];

      const match = await matcher.match({ remotes });
      // Single remote host (20) + owner (45) = 65. If it were additive: 65 * 3 = 195 (capped at 99).
      const score = match.matches.find(m => m.profileId === profile.id)?.score;
      assert.strictEqual(score, 65, 'Score should be 65 (not inflated by multiple remotes)');
    });
  });

  describe('GIT-05: Protocol Preservation in HTTPS Remote Rewriting', () => {
    it('should preserve http:// protocol when rewriting http remotes', async () => {
      const pm = new ProfileManager(store, authManager, mockGitClient);
      const profile = await pm.createProfile({
        name: 'Local Server Profile',
        git: { name: 'Local Dev', email: 'dev@local.lan' },
        github: { host: 'git.local.lan', username: 'localdev' },
        authentication: { type: 'none' },
      });

      let updatedFetchUrl = '';
      mockGitClient.isRepository = async () => true;
      mockGitClient.getRoot = async () => 'C:/repos/local-repo';
      mockGitClient.setLocalConfig = async () => {};
      mockGitClient.unsetLocalConfig = async () => {};
      mockGitClient.getRemotes = async () => [
        {
          name: 'origin',
          fetchUrl: 'http://git.local.lan/team/project.git',
          host: 'git.local.lan',
          owner: 'team',
          repository: 'project',
        },
      ];
      mockGitClient.setRemoteUrl = async (_cwd, _name, url) => {
        updatedFetchUrl = url;
      };

      await pm.applyIdentityToRepository(profile, 'C:/repos/local-repo');
      assert.ok(updatedFetchUrl.startsWith('http://localdev@git.local.lan/'), `Expected http://, got ${updatedFetchUrl}`);
    });
  });

  describe('GIT-06: Detached HEAD Parsing & Validation', () => {
    it('should parse detached HEAD without crashing and mark isDetached', () => {
      const output = `* (HEAD detached at a1b2c3d)\n  main\n  feature/test`;
      const branches = BranchParser.parseBranchList(output);

      assert.strictEqual(branches.length, 3);
      assert.strictEqual(branches[0].isCurrent, true);
      assert.strictEqual(branches[0].name, 'HEAD');
      assert.strictEqual(branches[0].isDetached, true);
      assert.strictEqual(Validation.isValidBranchName(branches[0].name), true);
    });
  });

  describe('GIT-07: Repository Status Parser Ignores ! and !!', () => {
    it('should not mark staged dirty on ignored files in porcelain v1 or v2', () => {
      // Porcelain v1 with ignored files
      const v1Output = `!! node_modules/package/dist/index.js\n!! .env.local\n`;
      const v1Status = RepositoryParser.parseStatus(v1Output);
      assert.strictEqual(v1Status.staged, 0);
      assert.strictEqual(v1Status.modified, 0);
      assert.strictEqual(v1Status.clean, true);

      // Porcelain v2 with ignored files
      const v2Output = `# branch.oid 1a2b3c4\n# branch.head main\n! node_modules/\n! build/\n`;
      const v2Status = RepositoryParser.parseStatus(v2Output);
      assert.strictEqual(v2Status.staged, 0);
      assert.strictEqual(v2Status.modified, 0);
      assert.strictEqual(v2Status.clean, true);
    });
  });

  describe('GIT-04: Git Config SSH Command Generation', () => {
    it('should generate valid core.sshCommand quoting in fallback config', () => {
      const folderRuleManager = new FolderRuleManager();
      const profile: GitProfile = {
        id: 'p-ssh-quotes',
        name: 'SSH Config Profile',
        git: { name: 'SSH Dev', email: 'ssh@test.com', scope: 'local' },
        authentication: {
          type: 'ssh',
          sshKeyPath: 'C:/Users/Jane Doe/SSH Keys/id_ed25519',
        },
        metadata: { source: 'manual', imported: false },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const config = folderRuleManager.generateProfileGitConfig(profile);
      assert.ok(config.includes('sshCommand = ssh -i \\"C:/Users/Jane Doe/SSH Keys/id_ed25519\\" -o IdentitiesOnly=yes'));
    });
  });

  describe('UI-01: Profile Verification Container in Webview Template', () => {
    it('should render verify result container element in profile cards', () => {
      const dummyProfile: GitProfile = {
        id: 'prof_ui_test',
        name: 'UI Test Profile',
        git: { name: 'UI Dev', email: 'ui@example.com', scope: 'local' },
        github: { host: 'github.com', username: 'uidev' },
        authentication: { type: 'none' },
        metadata: { source: 'manual', imported: false },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const state: WebviewState = {
        profile: dummyProfile,
        profiles: [dummyProfile],
      };

      const html = HtmlBuilder.render(state);
      assert.ok(html.includes('id="verify-result-prof_ui_test"'), 'Must contain verify-result container for DOM message targeting');
    });
  });
});
