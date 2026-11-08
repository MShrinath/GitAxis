import * as assert from 'assert';

// Ensure mock for 'vscode' exists
const Module = require('module');
if (!require.cache['vscode']) {
  const origResolve = Module._resolveFilename;
  Module._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
    if (request === 'vscode') {
      return 'vscode';
    }
    return origResolve.call(this, request, parent, isMain, options);
  };
  require.cache['vscode'] = {
    id: 'vscode',
    filename: 'vscode',
    loaded: true,
    exports: {
      window: {
        showInformationMessage: async () => undefined,
        showErrorMessage: async () => undefined,
        showWarningMessage: async () => undefined,
        showQuickPick: async () => undefined,
        showInputBox: async () => undefined,
        withProgress: async (_opt: any, task: any) => task(),
        createStatusBarItem: () => ({ show: () => {}, hide: () => {}, dispose: () => {} }),
        onDidChangeActiveTextEditor: () => ({ dispose: () => {} }),
        registerWebviewViewProvider: () => ({ dispose: () => {} }),
      },
      commands: {
        registerCommand: () => ({ dispose: () => {} }),
        executeCommand: async () => undefined,
      },
      workspace: {
        workspaceFolders: [],
        getConfiguration: () => ({ get: () => undefined }),
        onDidChangeWorkspaceFolders: () => ({ dispose: () => {} }),
      },
      Uri: {
        file: (f: string) => ({ toString: () => f, fsPath: f }),
        parse: (str: string) => ({ toString: () => str }),
        joinPath: (base: any, ...segments: string[]) => ({ toString: () => `${base}/${segments.join('/')}` }),
      },
      env: {
        openExternal: async () => true,
      },
      ProgressLocation: { Notification: 1 },
      StatusBarAlignment: { Left: 1, Right: 2 },
    },
  } as any;
}

const vscode = require('vscode');
if (!vscode.Uri.joinPath) {
  vscode.Uri.joinPath = (base: any, ...segments: string[]) => ({ toString: () => `${base}/${segments.join('/')}` });
}

import { HtmlBuilder, WebviewState } from '../src/webview/html';
import { GitProfile, GitRepository } from '../src/contracts';
import { SidebarViewProvider } from '../src/webview/sidebarView';
import { InMemoryMemento, PersistentProfileStore } from '../src/profiles/profileStore';
import { AuthManager } from '../src/auth/authManager';
import { SecretStore } from '../src/auth/secretStore';
import { GitClient } from '../src/git/gitClient';
import { ProfileManager } from '../src/profiles/profileManager';
import { RepositoryDiscovery } from '../src/discovery/repositoryDiscovery';

describe('Webview Control Center Suite', () => {
  describe('Webview HTML Builder (Profile Control Center)', () => {
    const dummyProfile: GitProfile = {
      id: 'prof_1',
      name: 'Work',
      git: {
        name: 'John Doe',
        email: 'john@company.com',
        scope: 'local',
      },
      github: {
        host: 'github.com',
        username: 'john-work',
      },
      authentication: {
        type: 'pat',
        source: 'vs-code-secret-storage',
      },
      metadata: {
        source: 'manual',
        imported: false,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const dummyRepo: GitRepository = {
      id: 'repo_1',
      path: '/mock/workspace/GitAxis',
      name: 'GitAxis',
      currentBranch: 'main',
      status: {
        clean: true,
        staged: 0,
        modified: 0,
        untracked: 0,
        conflicted: 0,
        ahead: 0,
        behind: 0,
      },
      remotes: [
        {
          name: 'origin',
          fetchUrl: 'https://github.com/example-org/GitAxis.git',
          pushUrl: 'https://github.com/example-org/GitAxis.git',
          owner: 'example-org',
          repository: 'GitAxis',
          host: 'github.com',
        },
      ],
    };

    it('should render active identity card, repo status, and persistent profile form', () => {
      const state: WebviewState = {
        profile: dummyProfile,
        repository: dummyRepo,
        profiles: [dummyProfile],
        repoUrl: 'https://github.com/example-org/GitAxis',
        linkedProfileId: 'prof_1',
      };

      const html = HtmlBuilder.render(state);

      assert.ok(html.includes('ACTIVE IDENTITY'));
      assert.ok(html.includes('Work'));
      assert.ok(html.includes('john@company.com'));
      assert.ok(html.includes('@john-work'));
      assert.strictEqual(html.includes('Bound to repo'), false);
      assert.strictEqual(html.includes('(github.com)'), false);

      assert.ok(html.includes('CURRENT REPO:'));
      assert.ok(html.includes('GitAxis'));
      assert.ok(html.includes('Branch:'));
      assert.ok(html.includes('main'));
      assert.ok(html.includes('Open on GitHub'));
      assert.ok(html.includes('btn-open-repo'));
      assert.ok(html.includes('https://github.com/example-org/GitAxis'));

      assert.ok(html.includes('CREATE / EDIT PROFILE'));
      assert.ok(html.includes('id="profile-form-section"') && html.includes('hidden') && html.includes('display: none;'));
      assert.strictEqual(html.includes('Allowed Orgs'), false);
      assert.ok(html.includes('id="form-name"'));
      assert.ok(html.includes('id="form-git-name"'));
      assert.ok(html.includes('id="form-git-email"'));
      assert.ok(html.includes('id="form-gh-user"'));
      assert.ok(html.includes('id="form-host"'));
      assert.ok(html.includes('id="form-pat"'));
      assert.ok(html.includes('name="form-scope"'));
      assert.ok(html.includes('btn-toggle-pat'));
      assert.ok(html.includes('main.js'));
      assert.ok(html.includes('main.css'));
    });

    it('should NOT render redundant Git action buttons or GitHub issues/PR sections', () => {
      const state: WebviewState = {
        profile: dummyProfile,
        repository: dummyRepo,
        profiles: [dummyProfile],
      };

      const html = HtmlBuilder.render(state);

      assert.strictEqual(html.includes("sendCmd('commit')"), false);
      assert.strictEqual(html.includes("sendCmd('push')"), false);
      assert.strictEqual(html.includes("sendCmd('pull')"), false);
      assert.strictEqual(html.includes("sendCmd('stash')"), false);
      assert.strictEqual(html.includes("sendCmd('tag')"), false);
      assert.strictEqual(html.includes("sendCmd('rebase')"), false);
      assert.strictEqual(html.includes("sendCmd('merge')"), false);
      assert.strictEqual(html.includes("sendCmd('diff')"), false);
      assert.strictEqual(html.includes("sendCmd('history')"), false);
      assert.strictEqual(html.includes("sendCmd('reset')"), false);

      assert.strictEqual(html.includes("sendCmd('createIssue')"), false);
      assert.strictEqual(html.includes("sendCmd('createPullRequest')"), false);
      assert.strictEqual(html.includes("sendCmd('actions')"), false);
      assert.strictEqual(html.includes("sendCmd('releases')"), false);
    });

    it('should render discreet account scanner and 1-click import chips when discovered', () => {
      const state: WebviewState = {
        profile: dummyProfile,
        profiles: [dummyProfile],
        discoveredAccounts: [
          {
            name: 'octocat',
            git: { name: 'The Octocat', email: 'octocat@github.com' },
            github: { host: 'github.com', username: 'octocat' },
            source: 'github-cli',
          },
        ],
        scanPerformed: true,
      };

      const html = HtmlBuilder.render(state);

      assert.ok(html.includes('data-action="scanAccounts"'));
      assert.ok(html.includes('Scan local Git &amp; GitHub CLI logins'));
      assert.ok(html.includes('DISCOVERED ACCOUNTS (1)'));
      assert.ok(html.includes('@octocat'));
      assert.ok(html.includes('octocat@github.com'));
      assert.ok(html.includes('+ Import as Profile'));
      assert.ok(html.includes('data-action="importDiscoveredAccount"'));
      assert.ok(html.includes('data-index="0"'));
    });

    it('should format author name with hover email tooltip rather than inline email', () => {
      const html = HtmlBuilder.render({
        profile: dummyProfile,
        profiles: [dummyProfile],
      });

      assert.ok(html.includes('class="author-hover-email"'));
      assert.ok(html.includes('title="john@company.com"'));
      assert.ok(!html.includes('&lt;john@company.com&gt;'));
    });

    it('should render profile action buttons: switch, edit, delete (without link repo)', () => {
      const secondProfile: GitProfile = {
        ...dummyProfile,
        id: 'prof_2',
        name: 'Personal',
        git: { name: 'Personal User', email: 'personal@example.com', scope: 'local' },
        github: { host: 'github.com', username: 'personal-user' },
      };

      const state: WebviewState = {
        profile: dummyProfile,
        repository: dummyRepo,
        profiles: [dummyProfile, secondProfile],
        linkedProfileId: 'prof_1',
      };

      const html = HtmlBuilder.render(state);

      assert.ok(html.includes('data-action="editProfile"') && html.includes('data-profile-id="prof_1"'));
      assert.ok(html.includes('data-action="deleteProfile"') && html.includes('data-profile-id="prof_1"'));

      assert.ok(html.includes('data-action="switchProfile"') && html.includes('data-profile-id="prof_2"'));
      assert.ok(html.includes('data-action="editProfile"') && html.includes('data-profile-id="prof_2"'));
      assert.ok(html.includes('data-action="deleteProfile"') && html.includes('data-profile-id="prof_2"'));

      assert.strictEqual(html.includes('linkRepo('), false);
      assert.strictEqual(html.includes('unlinkRepo('), false);
      assert.strictEqual(html.includes('Linked to:'), false);
      assert.strictEqual(html.includes('data-action="verifyProfile"'), false);
    });

    it('should apply verification status color classes and display enterprise host if not github.com', () => {
      const enterpriseProfile: GitProfile = {
        id: 'prof_ent',
        name: 'Enterprise Profile',
        git: { name: 'Ent User', email: 'user@enterprise.org', scope: 'local' },
        github: { host: 'github.mycorp.internal', username: 'corp-user' },
        authentication: { type: 'none' },
        metadata: { source: 'manual', imported: false },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const state: WebviewState = {
        profile: dummyProfile,
        profiles: [dummyProfile, enterpriseProfile],
        profileStatuses: {
          prof_1: { verified: true, message: 'Token valid' },
          prof_ent: { verified: false, message: 'Invalid token' },
        },
      };

      const html = HtmlBuilder.render(state);

      assert.ok(html.includes('id="profile-name-prof_1" class="profile-title-name status-verified"'));
      assert.ok(html.includes('id="profile-name-prof_ent" class="profile-title-name status-unverified"'));
      assert.ok(html.includes('(github.mycorp.internal)'));
    });

    it('should handle empty profiles and no opened repository gracefully', () => {
      const state: WebviewState = {
        profile: undefined,
        repository: undefined,
        profiles: [],
      };

      const html = HtmlBuilder.render(state);

      assert.ok(html.includes('No Active Profile'));
      assert.ok(html.includes('No Repository Opened'));
      assert.ok(html.includes('No profiles created yet'));
    });

    it('should safely escape special characters, quotes, and HTML in profile data', () => {
      const xssProfile: GitProfile = {
        id: "prof_quote'\"<test>",
        name: 'Work "Client" & <Co>',
        git: {
          name: 'O\'Connor <Tester>',
          email: 'test"quote@example.com',
          scope: 'local',
        },
        github: {
          host: 'github.com',
          username: 'octo<cat>"test',
        },
        authentication: { type: 'none' },
        metadata: { source: 'manual', imported: false },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const state: WebviewState = {
        profile: xssProfile,
        profiles: [xssProfile],
        repoUrl: 'https://github.com/org/repo"onclick="alert(1)',
      };

      const html = HtmlBuilder.render(state, 'vscode-webview:');

      assert.ok(html.includes('default-src &#39;none&#39;') || html.includes("default-src 'none'"));
      assert.strictEqual(html.includes("'unsafe-inline'"), false);
      assert.ok(html.includes('vscode-webview:'));
      assert.ok(html.includes('script-src &#39;nonce-') || html.includes("script-src 'nonce-"));

      assert.ok(html.includes('Work &quot;Client&quot; &amp; &lt;Co&gt;'));
      assert.ok(html.includes('O&#39;Connor &lt;Tester&gt;'));
      assert.ok(html.includes('test&quot;quote@example.com'));

      assert.ok(!html.includes('repo"onclick='));
      assert.ok(html.includes('repo&quot;onclick='));
      assert.ok(!html.includes('<script>alert(1)</script>'));
    });

    it('should format profile without GitHub identity cleanly', () => {
      const gitOnlyProfile: GitProfile = {
        id: 'prof_git_only',
        name: 'LocalOnly',
        git: { name: 'Git Only', email: 'git@local.com', scope: 'local' },
        authentication: { type: 'none' },
        metadata: { source: 'manual', imported: false },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const state: WebviewState = {
        profile: gitOnlyProfile,
        profiles: [gitOnlyProfile],
      };

      const html = HtmlBuilder.render(state);

      assert.ok(html.includes('LocalOnly'));
      assert.ok(html.includes('GitHub: <strong>None</strong>'));
      assert.ok(!html.includes('GitHub: <strong>None</strong> <span class="sub">(github.com)</span>'));
    });

    it('should render auth type selector and SSH key path field in profile form', () => {
      const state: WebviewState = {
        profiles: [],
      };

      const html = HtmlBuilder.render(state);

      assert.ok(html.includes('id="form-auth-type"'));
      assert.ok(html.includes('<option value="none">None</option>'));
      assert.ok(html.includes('<option value="pat" selected>Personal Access Token (PAT)</option>'));
      assert.ok(html.includes('<option value="ssh">SSH Key</option>'));
      assert.ok(html.includes('id="form-group-ssh"'));
      assert.ok(html.includes('id="form-ssh-key"'));
      assert.ok(html.includes('placeholder="e.g. ~/.ssh/id_ed25519"'));
    });

    it('should render SSH profile authentication details and serialize sshKeyPath in JSON script', () => {
      const sshProfile: GitProfile = {
        id: 'prof_ssh_1',
        name: 'SSH Dev',
        git: { name: 'SSH User', email: 'ssh@company.com', scope: 'local' },
        github: { host: 'github.com', username: 'ssh-user' },
        authentication: {
          type: 'ssh',
          source: 'user-input',
          sshKeyPath: '~/.ssh/id_custom',
        },
        metadata: { source: 'manual', imported: false },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const state: WebviewState = {
        profile: sshProfile,
        profiles: [sshProfile],
      };

      const html = HtmlBuilder.render(state);

      assert.ok(html.includes('SSH (~/.ssh/id_custom)'));
      assert.ok(html.includes('"sshKeyPath":"~/.ssh/id_custom"'));
    });
  });

  describe('SidebarView SSH Profile Input & Validation', () => {
    let memento: InMemoryMemento;
    let store: PersistentProfileStore;
    let secretStore: SecretStore;
    let authManager: AuthManager;
    let mockGitClient: GitClient;
    let profileManager: ProfileManager;
    let repoDiscovery: RepositoryDiscovery;
    let provider: SidebarViewProvider;

    let messageListener: ((msg: any) => Promise<void>) | undefined;
    let postedMessages: any[] = [];

    beforeEach(() => {
      memento = new InMemoryMemento();
      store = new PersistentProfileStore(memento);
      secretStore = new SecretStore();
      authManager = new AuthManager(secretStore);

      mockGitClient = new GitClient('git');
      mockGitClient.isRepository = async () => false;
      mockGitClient.getRoot = async (p: string) => p;

      profileManager = new ProfileManager(store, authManager, mockGitClient);
      repoDiscovery = new RepositoryDiscovery(mockGitClient);

      provider = new SidebarViewProvider(
        { fsPath: '/mock/ext' } as any,
        profileManager,
        repoDiscovery
      );

      postedMessages = [];
      messageListener = undefined;

      const mockWebviewView: any = {
        webview: {
          options: {},
          cspSource: 'vscode-webview:',
          asWebviewUri: (uri: any) => uri,
          onDidReceiveMessage: (fn: any) => {
            messageListener = fn;
            return { dispose: () => {} };
          },
          postMessage: async (msg: any) => {
            postedMessages.push(msg);
            return true;
          },
        },
      };

      provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    });

    it('should create SSH profile from form when valid sshKeyPath is provided', async () => {
      assert.ok(messageListener, 'Message listener should be registered');

      await messageListener!({
        command: 'createProfileFromForm',
        data: {
          name: 'SSH Developer',
          gitName: 'SSH User',
          gitEmail: 'ssh@company.com',
          authType: 'ssh',
          sshKeyPath: '~/.ssh/id_ed25519',
          scope: 'local',
        },
      });

      const successMsg = postedMessages.find(m => m.command === 'saveSuccess');
      assert.ok(successMsg, 'Expected saveSuccess message');

      const created = await profileManager.getProfile(successMsg.profileId);
      assert.ok(created, 'Profile should be created in store');
      assert.strictEqual(created!.name, 'SSH Developer');
      assert.strictEqual(created!.authentication.type, 'ssh');
      assert.strictEqual(created!.authentication.sshKeyPath, '~/.ssh/id_ed25519');
      assert.strictEqual(created!.authentication.source, 'user-input');
    });

    it('should create SSH profile without sshKeyPath when authType is ssh (default keys)', async () => {
      await messageListener!({
        command: 'createProfileFromForm',
        data: {
          name: 'Default SSH',
          gitName: 'Default SSH User',
          gitEmail: 'default-ssh@company.com',
          authType: 'ssh',
          sshKeyPath: '',
          scope: 'local',
        },
      });

      const successMsg = postedMessages.find(m => m.command === 'saveSuccess');
      assert.ok(successMsg);

      const created = await profileManager.getProfile(successMsg.profileId);
      assert.ok(created);
      assert.strictEqual(created!.authentication.type, 'ssh');
      assert.strictEqual(created!.authentication.sshKeyPath, undefined);
    });

    it('should infer SSH auth type if sshKeyPath is provided even if authType is omitted', async () => {
      await messageListener!({
        command: 'createProfileFromForm',
        data: {
          name: 'Inferred SSH',
          gitName: 'Inferred User',
          gitEmail: 'inferred@company.com',
          sshKeyPath: '/home/user/.ssh/id_rsa',
          scope: 'local',
        },
      });

      const successMsg = postedMessages.find(m => m.command === 'saveSuccess');
      assert.ok(successMsg);

      const created = await profileManager.getProfile(successMsg.profileId);
      assert.ok(created);
      assert.strictEqual(created!.authentication.type, 'ssh');
      assert.strictEqual(created!.authentication.sshKeyPath, '/home/user/.ssh/id_rsa');
    });

    it('should reject invalid sshKeyPath on create and post saveError', async () => {
      await messageListener!({
        command: 'createProfileFromForm',
        data: {
          name: 'Malicious Profile',
          gitName: 'Hacker',
          gitEmail: 'hacker@example.com',
          authType: 'ssh',
          sshKeyPath: '~/.ssh/id_rsa; touch /tmp/pwned',
          scope: 'local',
        },
      });

      const errorMsg = postedMessages.find(m => m.command === 'saveError');
      assert.ok(errorMsg, 'Expected saveError message');
      assert.ok(errorMsg.error.includes('Invalid SSH key path'));

      const profiles = await profileManager.getProfiles();
      assert.strictEqual(profiles.length, 0, 'No profile should be created');
    });

    it('should reject command option injection in sshKeyPath', async () => {
      await messageListener!({
        command: 'createProfileFromForm',
        data: {
          name: 'Option Injection',
          gitName: 'Attacker',
          gitEmail: 'attacker@example.com',
          authType: 'ssh',
          sshKeyPath: '-oProxyCommand=calc.exe',
          scope: 'local',
        },
      });

      const errorMsg = postedMessages.find(m => m.command === 'saveError');
      assert.ok(errorMsg, 'Expected saveError message');
      assert.ok(errorMsg.error.includes('Invalid SSH key path'));
    });

    it('should update existing profile with new sshKeyPath', async () => {
      const existing = await profileManager.createProfile({
        name: 'Existing Dev',
        git: { name: 'Existing', email: 'existing@example.com', scope: 'local' },
        authentication: { type: 'pat', source: 'vs-code-secret-storage' },
      });

      await messageListener!({
        command: 'updateProfileFromForm',
        data: {
          id: existing.id,
          name: 'Existing Dev',
          gitName: 'Existing Dev',
          gitEmail: 'existing@example.com',
          authType: 'ssh',
          sshKeyPath: '~/.ssh/id_custom',
          scope: 'local',
        },
      });

      const successMsg = postedMessages.find(m => m.command === 'saveSuccess');
      assert.ok(successMsg);

      const updated = await profileManager.getProfile(existing.id);
      assert.ok(updated);
      assert.strictEqual(updated!.authentication.type, 'ssh');
      assert.strictEqual(updated!.authentication.sshKeyPath, '~/.ssh/id_custom');
    });

    it('should reject invalid sshKeyPath on update and post saveError', async () => {
      const existing = await profileManager.createProfile({
        name: 'Safe Profile',
        git: { name: 'Safe', email: 'safe@example.com', scope: 'local' },
        authentication: { type: 'ssh', sshKeyPath: '~/.ssh/id_ed25519' },
      });

      await messageListener!({
        command: 'updateProfileFromForm',
        data: {
          id: existing.id,
          name: 'Safe Profile',
          gitName: 'Safe',
          gitEmail: 'safe@example.com',
          authType: 'ssh',
          sshKeyPath: 'key`id`',
          scope: 'local',
        },
      });

      const errorMsg = postedMessages.find(m => m.command === 'saveError');
      assert.ok(errorMsg);
      assert.ok(errorMsg.error.includes('Invalid SSH key path'));

      const unchanged = await profileManager.getProfile(existing.id);
      assert.strictEqual(unchanged!.authentication.sshKeyPath, '~/.ssh/id_ed25519');
    });

    it('should clear sshKeyPath when switching from SSH to None', async () => {
      const existing = await profileManager.createProfile({
        name: 'To None Profile',
        git: { name: 'None User', email: 'none@example.com', scope: 'local' },
        authentication: { type: 'ssh', sshKeyPath: '~/.ssh/id_ed25519' },
      });

      await messageListener!({
        command: 'updateProfileFromForm',
        data: {
          id: existing.id,
          name: 'To None Profile',
          gitName: 'None User',
          gitEmail: 'none@example.com',
          authType: 'none',
          sshKeyPath: '',
          scope: 'local',
        },
      });

      const successMsg = postedMessages.find(m => m.command === 'saveSuccess');
      assert.ok(successMsg);

      const updated = await profileManager.getProfile(existing.id);
      assert.strictEqual(updated!.authentication.type, 'none');
      assert.strictEqual(updated!.authentication.sshKeyPath, undefined);
    });

    it('should prioritize authType none even if residual sshKeyPath is present in form payload', async () => {
      const existing = await profileManager.createProfile({
        name: 'Residual SSH Profile',
        git: { name: 'Residual User', email: 'residual@example.com', scope: 'local' },
        authentication: { type: 'ssh', sshKeyPath: '~/.ssh/id_ed25519' },
      });

      await messageListener!({
        command: 'updateProfileFromForm',
        data: {
          id: existing.id,
          name: 'Residual SSH Profile',
          gitName: 'Residual User',
          gitEmail: 'residual@example.com',
          authType: 'none',
          sshKeyPath: '~/.ssh/id_ed25519',
          scope: 'local',
        },
      });

      const successMsg = postedMessages.find(m => m.command === 'saveSuccess');
      assert.ok(successMsg, 'Expected saveSuccess message');

      const updated = await profileManager.getProfile(existing.id);
      assert.ok(updated);
      assert.strictEqual(updated!.authentication.type, 'none');
      assert.strictEqual(updated!.authentication.sshKeyPath, undefined);
      assert.strictEqual(updated!.authentication.secretRef, undefined);
    });

    it('should prioritize authType pat over residual sshKeyPath and save PAT token', async () => {
      const existing = await profileManager.createProfile({
        name: 'Switch to PAT Profile',
        git: { name: 'PAT User', email: 'pat@example.com', scope: 'local' },
        authentication: { type: 'ssh', sshKeyPath: '~/.ssh/id_ed25519' },
      });

      await messageListener!({
        command: 'updateProfileFromForm',
        data: {
          id: existing.id,
          name: 'Switch to PAT Profile',
          gitName: 'PAT User',
          gitEmail: 'pat@example.com',
          authType: 'pat',
          pat: 'ghp_switch_test_12345',
          sshKeyPath: '~/.ssh/id_ed25519',
          scope: 'local',
        },
      });

      const successMsg = postedMessages.find(m => m.command === 'saveSuccess');
      assert.ok(successMsg);

      const updated = await profileManager.getProfile(existing.id);
      assert.ok(updated);
      assert.strictEqual(updated!.authentication.type, 'pat');
      assert.strictEqual(updated!.authentication.sshKeyPath, undefined);
      assert.ok(updated!.authentication.secretRef);

      const savedToken = await authManager.getPatAuth().getToken(existing.id);
      assert.strictEqual(savedToken, 'ghp_switch_test_12345');
    });

    it('should clear stored PAT token and secretRef when switching from PAT to SSH', async () => {
      const existing = await profileManager.createProfile(
        {
          name: 'PAT to SSH Profile',
          git: { name: 'User', email: 'user@example.com', scope: 'local' },
          authentication: { type: 'pat', source: 'vs-code-secret-storage' },
        },
        'ghp_old_token_9999'
      );

      const tokenBefore = await authManager.getPatAuth().getToken(existing.id);
      assert.strictEqual(tokenBefore, 'ghp_old_token_9999');

      await messageListener!({
        command: 'updateProfileFromForm',
        data: {
          id: existing.id,
          name: 'PAT to SSH Profile',
          gitName: 'User',
          gitEmail: 'user@example.com',
          authType: 'ssh',
          sshKeyPath: '~/.ssh/id_custom',
          scope: 'local',
        },
      });

      const successMsg = postedMessages.find(m => m.command === 'saveSuccess');
      assert.ok(successMsg);

      const updated = await profileManager.getProfile(existing.id);
      assert.ok(updated);
      assert.strictEqual(updated!.authentication.type, 'ssh');
      assert.strictEqual(updated!.authentication.sshKeyPath, '~/.ssh/id_custom');
      assert.strictEqual(updated!.authentication.secretRef, undefined);

      const tokenAfter = await authManager.getPatAuth().getToken(existing.id);
      assert.strictEqual(tokenAfter, undefined, 'Old PAT token should be cleared from secret store');
    });

    it('should not reject invalid sshKeyPath when authType is none or pat', async () => {
      await messageListener!({
        command: 'createProfileFromForm',
        data: {
          name: 'None With Stray SSH',
          gitName: 'Stray User',
          gitEmail: 'stray@example.com',
          authType: 'none',
          sshKeyPath: 'invalid;calc.exe',
          scope: 'local',
        },
      });

      const successMsg = postedMessages.find(m => m.command === 'saveSuccess');
      assert.ok(successMsg, 'Expected saveSuccess for none auth type despite stray ssh input');

      const created = await profileManager.getProfile(successMsg.profileId);
      assert.ok(created);
      assert.strictEqual(created!.authentication.type, 'none');
      assert.strictEqual(created!.authentication.sshKeyPath, undefined);
    });
  });
});
