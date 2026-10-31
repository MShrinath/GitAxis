import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FolderRuleManager, GITAXIS_CONFIG_START, GITAXIS_CONFIG_END } from '../src/profiles/folderRuleManager';
import { PersistentProfileStore } from '../src/profiles/profileStore';
import { ProfileManager } from '../src/profiles/profileManager';
import { AuthManager } from '../src/auth/authManager';
import { SecretStore } from '../src/auth/secretStore';
import { GitClient } from '../src/git/gitClient';
import { Platform } from '../src/utils/platform';

describe('Folder Rules & Set-and-Forget (v0.6.0)', () => {
  let tmpDir: string;
  let customHomedir: string;
  let customGitConfigPath: string;
  let folderRuleManager: FolderRuleManager;
  let profileStore: PersistentProfileStore;
  let authManager: AuthManager;
  let gitClient: GitClient;
  let profileManager: ProfileManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitaxis-folder-test-'));
    customHomedir = path.join(tmpDir, 'home');
    fs.mkdirSync(customHomedir, { recursive: true });
    customGitConfigPath = path.join(customHomedir, '.gitconfig');

    folderRuleManager = new FolderRuleManager(customHomedir, customGitConfigPath);
    profileStore = new PersistentProfileStore();
    const secretStore = new SecretStore();
    authManager = new AuthManager(secretStore);
    gitClient = new GitClient('git');
    profileManager = new ProfileManager(profileStore, authManager, gitClient, undefined, folderRuleManager);
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  describe('1. Pattern Matching (Section 7)', () => {
    it('should match direct folder and subdirectories for ~/ patterns', () => {
      const workDir = path.join(customHomedir, 'work', 'project-a');
      assert.strictEqual(folderRuleManager.matchesPattern(workDir, '~/work/**'), true);
      assert.strictEqual(folderRuleManager.matchesPattern(workDir, '~/work/'), true);
      assert.strictEqual(folderRuleManager.matchesPattern(workDir, '~/work'), true);
    });

    it('should NOT match unrelated folders', () => {
      const personalDir = path.join(customHomedir, 'personal', 'project-b');
      assert.strictEqual(folderRuleManager.matchesPattern(personalDir, '~/work/**'), false);
    });

    it('should match Windows-style paths and forward slashes case-insensitively', () => {
      const target = 'C:/Users/Developer/work/repo1';
      assert.strictEqual(folderRuleManager.matchesPattern(target, 'C:/Users/Developer/work/**'), true);
      assert.strictEqual(folderRuleManager.matchesPattern('c:/users/developer/work/repo1', 'C:/Users/Developer/work/**'), true);
    });

    it('should match Windows-style paths case-insensitively even on Linux runners', () => {
      const originalIsWin = Platform.isWindows;
      const originalIsMac = Platform.isMacOS;
      try {
        (Platform as any).isWindows = () => false;
        (Platform as any).isMacOS = () => false;
        assert.strictEqual(folderRuleManager.matchesPattern('c:/users/developer/work/repo1', 'C:/Users/Developer/work/**'), true);
      } finally {
        (Platform as any).isWindows = originalIsWin;
        (Platform as any).isMacOS = originalIsMac;
      }
    });

    it('should resolve the longest/most specific folder rule when multiple match', () => {
      const target = path.join(customHomedir, 'work', 'special', 'repo');
      const p1 = {
        id: 'p1',
        name: 'General Work',
        git: { name: 'Work', email: 'work@corp.com', scope: 'local' as const },
        authentication: { type: 'none' as const, source: 'user-input' as const },
        metadata: { source: 'manual' as const },
        createdAt: '',
        updatedAt: '',
        folderRules: ['~/work/**'],
      };
      const p2 = {
        id: 'p2',
        name: 'Special Work',
        git: { name: 'Special', email: 'special@corp.com', scope: 'local' as const },
        authentication: { type: 'none' as const, source: 'user-input' as const },
        metadata: { source: 'manual' as const },
        createdAt: '',
        updatedAt: '',
        folderRules: ['~/work/special/**'],
      };

      const match = folderRuleManager.resolveProfile(target, [p1, p2]);
      assert.ok(match);
      assert.strictEqual(match.profile.id, 'p2');
    });
  });

  describe('2. Resolution Order: binding -> folder rule -> matcher -> fallback', () => {
    it('should prioritize explicit repo binding over folder rule and matcher', async () => {
      const pWork = await profileManager.createProfile({
        name: 'WorkProfile',
        git: { name: 'Work User', email: 'work@company.com' },
        authentication: { type: 'none' },
        folderRules: ['~/work/**'],
      });

      const pPersonal = await profileManager.createProfile({
        name: 'PersonalProfile',
        git: { name: 'Personal User', email: 'personal@me.com' },
        authentication: { type: 'none' },
        folderRules: ['~/personal/**'],
      });

      const repoPath = path.join(customHomedir, 'work', 'bound-repo');

      // Bind repo explicitly to personal profile
      await profileManager.associateRepository(repoPath, pPersonal.id);

      const resolved = await profileManager.resolveProfileForRepository(repoPath);
      assert.ok(resolved);
      assert.strictEqual(resolved.source, 'binding');
      assert.strictEqual(resolved.profile.id, pPersonal.id);
      assert.strictEqual(resolved.isBound, true);
    });

    it('should prioritize folder rule when no explicit binding exists', async () => {
      const pWork = await profileManager.createProfile({
        name: 'WorkProfile',
        git: { name: 'Work User', email: 'work@company.com' },
        authentication: { type: 'none' },
        folderRules: ['~/work/**'],
      });

      await profileManager.createProfile({
        name: 'PersonalProfile',
        git: { name: 'Personal User', email: 'personal@me.com' },
        authentication: { type: 'none' },
        folderRules: ['~/personal/**'],
      });

      const repoPath = path.join(customHomedir, 'work', 'unbound-repo');
      const resolved = await profileManager.resolveProfileForRepository(repoPath);

      assert.ok(resolved);
      assert.strictEqual(resolved.source, 'folder-rule');
      assert.strictEqual(resolved.profile.id, pWork.id);
      assert.strictEqual(resolved.isBound, false);
      assert.strictEqual(resolved.folderRule, '~/work/**');
    });
  });

  describe('3. Include File & includeIf Generation', () => {
    it('should generate valid per-profile gitconfig include file with user, sshCommand, and credential', () => {
      const profile = {
        id: 'test_prof_1',
        name: 'Corporate Dev',
        git: { name: 'Dev User', email: 'dev@corp.com', scope: 'local' as const },
        github: { host: 'github.com', username: 'dev-user' },
        authentication: { type: 'ssh' as const, source: 'user-input' as const, sshKeyPath: '~/.ssh/id_ed25519' },
        metadata: { source: 'manual' as const },
        createdAt: '',
        updatedAt: '',
        folderRules: ['~/corp/**'],
      };

      const content = folderRuleManager.generateProfileGitConfig(profile);
      assert.ok(content.includes('[user]'));
      assert.ok(content.includes('name = Dev User'));
      assert.ok(content.includes('email = dev@corp.com'));
      assert.ok(content.includes('[core]'));
      assert.ok(content.includes('sshCommand = ssh -i'));
      assert.ok(content.includes('-o IdentitiesOnly=yes'));
      assert.ok(content.includes('[credential "https://github.com"]'));
      assert.ok(content.includes('username = dev-user'));
    });

    it('should write include files and add [includeIf] block to global .gitconfig with preview', async () => {
      const pWork = await profileManager.createProfile({
        name: 'Work',
        git: { name: 'Work Dev', email: 'work@corp.com' },
        github: { username: 'work-user' },
        authentication: { type: 'none' },
        folderRules: ['~/work/**'],
      });

      const pPersonal = await profileManager.createProfile({
        name: 'Personal',
        git: { name: 'Personal Dev', email: 'personal@home.com' },
        github: { username: 'personal-user' },
        authentication: { type: 'none' },
        folderRules: ['~/personal/**'],
      });

      const profiles = [pWork, pPersonal];
      const preview = await folderRuleManager.previewIncludeIfChanges(profiles);

      assert.ok(preview.includeIfBlock.includes(GITAXIS_CONFIG_START));
      assert.ok(preview.includeIfBlock.includes(GITAXIS_CONFIG_END));
      assert.ok(preview.includeIfBlock.includes('[includeIf "gitdir:~/work/"]'));
      assert.ok(preview.includeIfBlock.includes('[includeIf "gitdir:~/personal/"]'));

      const result = await folderRuleManager.applyIncludeIfRules(profiles);
      assert.strictEqual(result.applied, true);

      // Verify files written on disk
      assert.strictEqual(fs.existsSync(customGitConfigPath), true);
      const writtenConfig = fs.readFileSync(customGitConfigPath, 'utf8');
      assert.ok(writtenConfig.includes(GITAXIS_CONFIG_START));
      assert.ok(writtenConfig.includes('[includeIf "gitdir:~/work/"]'));
      assert.ok(writtenConfig.includes(GITAXIS_CONFIG_END));

      const workConfigPath = folderRuleManager.getProfileConfigPath(pWork);
      assert.strictEqual(fs.existsSync(workConfigPath), true);
      const workConfigFile = fs.readFileSync(workConfigPath, 'utf8');
      assert.ok(workConfigFile.includes('email = work@corp.com'));
    });

    it('should cleanly remove all GitAxis config with removeAllGitAxisConfig', async () => {
      // Setup existing global gitconfig with other settings
      const existingGitConfig = `[core]\n\teditor = code\n[includeIf "gitdir:~/work/"]\n\tpath = ~/.gitaxis/profiles/work.gitconfig\n`;
      fs.writeFileSync(customGitConfigPath, existingGitConfig, 'utf8');

      const p = await profileManager.createProfile({
        name: 'Work',
        git: { name: 'Work', email: 'w@c.com' },
        authentication: { type: 'none' },
        folderRules: ['~/work/**'],
      });

      await folderRuleManager.applyIncludeIfRules([p]);
      const withGitAxis = fs.readFileSync(customGitConfigPath, 'utf8');
      assert.ok(withGitAxis.includes(GITAXIS_CONFIG_START));

      const removeResult = await folderRuleManager.removeAllGitAxisConfig();
      assert.strictEqual(removeResult.removed, true);

      const afterRemoval = fs.readFileSync(customGitConfigPath, 'utf8');
      assert.strictEqual(afterRemoval.includes(GITAXIS_CONFIG_START), false);
      assert.strictEqual(afterRemoval.includes(GITAXIS_CONFIG_END), false);
      assert.ok(afterRemoval.includes('editor = code'));
    });
  });

  describe('4. Profile Store Persistence of Folder Rules', () => {
    it('should save and update folderRules in PersistentProfileStore', async () => {
      const p = await profileStore.create({
        name: 'RuleProfile',
        git: { name: 'Rule User', email: 'rule@test.com' },
        authentication: { type: 'none' },
        folderRules: ['~/projects/alpha/**', '~/projects/beta/**'],
      });

      assert.deepStrictEqual(p.folderRules, ['~/projects/alpha/**', '~/projects/beta/**']);

      const updated = await profileStore.update(p.id, {
        folderRules: ['~/projects/gamma/**'],
      });
      assert.deepStrictEqual(updated.folderRules, ['~/projects/gamma/**']);

      const retrieved = await profileStore.get(p.id);
      assert.deepStrictEqual(retrieved?.folderRules, ['~/projects/gamma/**']);
    });
  });

  describe('5. Section 7: hasconfig:remote.*.url: Remote URL Rules', () => {
    it('should format hasconfig:remote.*.url: conditions and generate includeIf block', () => {
      const p = {
        id: 'p-remote',
        name: 'AcmeOrg',
        git: { name: 'Acme Dev', email: 'dev@acme.com', scope: 'local' as const },
        authentication: { type: 'none' as const, source: 'user-input' as const },
        metadata: { source: 'manual' as const },
        createdAt: '',
        updatedAt: '',
        folderRules: ['hasconfig:remote.*.url:git@github.com:acme/**', 'https://github.com/client-org/**'],
      };

      const block = folderRuleManager.generateIncludeIfBlock([p]);
      assert.ok(block.includes('[includeIf "hasconfig:remote.*.url:git@github.com:acme/**"]'));
      assert.ok(block.includes('[includeIf "hasconfig:remote.*.url:https://github.com/client-org/**"]'));
    });

    it('should match remotes against hasconfig:remote.*.url: patterns during profile resolution', async () => {
      const pAcme = await profileManager.createProfile({
        name: 'Acme',
        git: { name: 'Acme User', email: 'acme@work.com' },
        authentication: { type: 'none' },
        folderRules: ['git@github.com:acme/**'],
      });

      const repoPath = 'C:/repos/random-unbound-folder';
      const resolved = await profileManager.resolveProfileForRepository(repoPath, {
        remotes: [{ name: 'origin', fetchUrl: 'git@github.com:acme/backend.git', pushUrl: 'git@github.com:acme/backend.git' }],
      });

      assert.ok(resolved);
      assert.strictEqual(resolved.source, 'folder-rule');
      assert.strictEqual(resolved.profile.id, pAcme.id);
    });
  });
});
