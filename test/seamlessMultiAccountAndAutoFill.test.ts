import * as assert from 'assert';

// Ensure mock for 'vscode' exists before importing modules
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

import { SecretStore } from '../src/auth/secretStore';
import { AuthManager } from '../src/auth/authManager';
import { GitClient } from '../src/git/gitClient';
import { AccountVerifier } from '../src/auth/accountVerifier';
import { PersistentProfileStore } from '../src/profiles/profileStore';
import { ProfileManager } from '../src/profiles/profileManager';
import { HtmlBuilder, WebviewState } from '../src/webview/html';
import { SidebarViewProvider } from '../src/webview/sidebarView';
import { RepositoryDiscovery } from '../src/discovery/repositoryDiscovery';

describe('Seamless Multi-Account & Auto-Fill Suite', () => {
  describe('AccountVerifier Enhanced Fields & Direct Verification', () => {
    let secretStore: SecretStore;
    let mockGitClient: GitClient;
    let verifier: AccountVerifier;

    beforeEach(() => {
      secretStore = new SecretStore();
      mockGitClient = new GitClient('git');
      verifier = new AccountVerifier(secretStore, mockGitClient);
    });

    it('should parse login, name, email, id, scopes, and expiration in verifyPatToken', async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async () =>
          new Response(
            JSON.stringify({
              login: 'octocat',
              id: 583231,
              name: 'The Octocat',
              email: 'octocat@github.com',
            }),
            {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                'x-oauth-scopes': 'repo, user, workflow',
                'github-authentication-token-expiration': '2030-01-01 00:00:00 UTC',
              },
            }
          );

        const res = await verifier.verifyPatToken('ghp_validToken123');
        assert.strictEqual(res.success, true);
        assert.strictEqual(res.status, 'verified');
        assert.strictEqual(res.login, 'octocat');
        assert.strictEqual(res.name, 'The Octocat');
        assert.strictEqual(res.email, 'octocat@github.com');
        assert.strictEqual(res.id, 583231);
        assert.deepStrictEqual(res.scopes, ['repo', 'user', 'workflow']);
        assert.strictEqual(res.expiration, '2030-01-01 00:00:00 UTC');
        assert.strictEqual(res.message, 'Authenticated as @octocat');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should fallback to id+login@users.noreply.github.com when public email is null', async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async () =>
          new Response(
            JSON.stringify({
              login: 'privacyuser',
              id: 998877,
              name: null,
              email: null,
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          );

        const res = await verifier.verifyPatToken('ghp_privacyToken');
        assert.strictEqual(res.success, true);
        assert.strictEqual(res.login, 'privacyuser');
        assert.strictEqual(res.name, undefined);
        assert.strictEqual(res.id, 998877);
        assert.strictEqual(res.email, '998877+privacyuser@users.noreply.github.com');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should reject empty or whitespace PAT token', async () => {
      const res = await verifier.verifyPatToken('   ');
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.status, 'failed');
      assert.ok(res.message.includes('No Personal Access Token provided'));
    });

    it('should handle HTTP 401 Unauthorized cleanly', async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async () =>
          new Response('Bad credentials', { status: 401, statusText: 'Unauthorized' });

        const res = await verifier.verifyPatToken('ghp_invalid');
        assert.strictEqual(res.success, false);
        assert.strictEqual(res.status, 'failed');
        assert.ok(res.message.includes('401 Unauthorized'));
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should parse SSH output and return login and noreply email', () => {
      const parseMethod = (verifier as any).parseSshOutput.bind(verifier);
      const output = 'Hi testcoder! You\'ve successfully authenticated, but GitHub does not provide shell access.';
      const res = parseMethod(output, 'testcoder');
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.status, 'verified');
      assert.strictEqual(res.login, 'testcoder');
      assert.strictEqual(res.email, 'testcoder@users.noreply.github.com');
      assert.strictEqual(res.message, 'Authenticated as @testcoder via SSH');
    });

    it('should parse SSH output with dots or enterprise format in username', () => {
      const parseMethod = (verifier as any).parseSshOutput.bind(verifier);
      const output = 'Hi john.doe! You\'ve successfully authenticated, but GitHub does not provide shell access.';
      const res = parseMethod(output, 'john.doe');
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.status, 'verified');
      assert.strictEqual(res.login, 'john.doe');
      assert.strictEqual(res.email, 'john.doe@users.noreply.github.com');
    });

    it('should recognize SSH permission denied with multiple auth methods', () => {
      const parseMethod = (verifier as any).parseSshOutput.bind(verifier);
      const output = 'git@github.com: Permission denied (publickey,keyboard-interactive).\n';
      const res = parseMethod(output);
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.status, 'failed');
      assert.ok(res.message.includes('Permission denied (publickey)'));
    });

    it('should normalize host with https protocol or trailing slashes in verifyPatToken', async () => {
      const originalFetch = globalThis.fetch;
      let requestedUrl = '';
      try {
        globalThis.fetch = async (input: any) => {
          requestedUrl = String(input);
          return new Response(JSON.stringify({ login: 'octonorm', id: 1 }), { status: 200 });
        };

        const res = await verifier.verifyPatToken('ghp_testToken', 'https://github.com/');
        assert.strictEqual(res.success, true);
        assert.strictEqual(res.login, 'octonorm');
        assert.strictEqual(requestedUrl, 'https://api.github.com/user');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('Credential Helper Bypass & Remote URL Enforcement', () => {
    let secretStore: SecretStore;
    let authManager: AuthManager;
    let store: PersistentProfileStore;
    let mockGitClient: GitClient;
    let profileManager: ProfileManager;

    let localConfigs: Map<string, string>;
    let globalConfigs: Map<string, string>;
    let setRemoteCalls: { repoPath: string; name: string; url: string; push?: boolean }[];
    let approvedCredentials: { protocol: string; host: string; username: string; password: string }[];

    beforeEach(() => {
      secretStore = new SecretStore();
      authManager = new AuthManager(secretStore);
      store = new PersistentProfileStore();
      localConfigs = new Map();
      globalConfigs = new Map();
      setRemoteCalls = [];
      approvedCredentials = [];

      mockGitClient = new GitClient('git');
      mockGitClient.isRepository = async () => true;
      mockGitClient.getRoot = async (p: string) => p;
      mockGitClient.getRemotes = async () => [];
      mockGitClient.setLocalConfig = async (_p, key, val) => {
        localConfigs.set(key, val);
      };
      mockGitClient.getLocalConfig = async (_p, key) => localConfigs.get(key);
      mockGitClient.unsetLocalConfig = async (_p, key) => {
        localConfigs.delete(key);
      };
      mockGitClient.setGlobalConfig = async (key, val) => {
        globalConfigs.set(key, val);
      };
      mockGitClient.getGlobalConfig = async (key) => globalConfigs.get(key);
      mockGitClient.unsetGlobalConfig = async (key) => {
        globalConfigs.delete(key);
      };
      mockGitClient.setRemoteUrl = async (repoPath, name, url, push) => {
        setRemoteCalls.push({ repoPath, name, url, push });
      };
      mockGitClient.approveCredential = async (params) => {
        approvedCredentials.push(params);
      };

      profileManager = new ProfileManager(store, authManager, mockGitClient);
    });

    it('should bypass gh credential helper by setting local credential.https://${host}.helper to manager and approve credential', async () => {
      const repoPath = 'C:/repos/test-gh-collision';

      // Simulate global gitconfig having gh auth git-credential override
      mockGitClient.getCredentialHelperForUrl = async () => `!'C:\\Program Files\\GitHub CLI\\gh.exe' auth git-credential`;
      mockGitClient.getSystemCredentialHelper = async () => 'manager';

      const patProfile = await profileManager.createProfile(
        {
          name: 'Work PAT',
          git: { name: 'Work Dev', email: 'work@test.com' },
          github: { host: 'github.com', username: 'workdev' },
          authentication: { type: 'pat' },
        },
        'ghp_workSecretToken999'
      );

      await profileManager.switchProfile(patProfile.id, repoPath);

      // Local helper must have been set to manager to prevent gh from swallowing the token
      assert.strictEqual(localConfigs.get('credential.https://github.com.helper'), 'manager');

      // Credential must have been approved in helper
      assert.strictEqual(approvedCredentials.length, 1);
      assert.strictEqual(approvedCredentials[0].username, 'workdev');
      assert.strictEqual(approvedCredentials[0].password, 'ghp_workSecretToken999');
      assert.strictEqual(approvedCredentials[0].host, 'github.com');
    });

    it('should clean up local credential helper override when switching to non-PAT profile', async () => {
      const repoPath = 'C:/repos/test-gh-cleanup';
      localConfigs.set('credential.https://github.com.helper', 'manager');

      const noneProfile = await profileManager.createProfile({
        name: 'None Profile',
        git: { name: 'None Dev', email: 'none@test.com' },
        github: { host: 'github.com', username: 'nonedev' },
        authentication: { type: 'none' },
      });

      await profileManager.switchProfile(noneProfile.id, repoPath);

      // Local helper override must be unset cleanly
      assert.strictEqual(localConfigs.has('credential.https://github.com.helper'), false);
    });

    it('should enforce username in remote origin URL for seamless native VS Code push', async () => {
      const repoPath = 'C:/repos/test-url-rewrite';

      mockGitClient.getRemotes = async () => [
        {
          name: 'origin',
          fetchUrl: 'https://github.com/myorg/awesome-repo.git',
          pushUrl: 'https://github.com/myorg/awesome-repo.git',
          host: 'github.com',
          owner: 'myorg',
          repository: 'awesome-repo',
        },
      ];

      const profile = await profileManager.createProfile({
        name: 'DevAccount',
        git: { name: 'Dev Account', email: 'dev@test.com' },
        github: { host: 'github.com', username: 'octodev' },
        authentication: { type: 'none' },
      });

      await profileManager.switchProfile(profile.id, repoPath);

      const originUpdate = setRemoteCalls.find(c => c.name === 'origin');
      assert.ok(originUpdate, 'Remote URL should have been updated');
      assert.strictEqual(originUpdate.url, 'https://octodev@github.com/myorg/awesome-repo.git');
    });

    it('should strip stale username from remote URL when switching to profile without username', async () => {
      const repoPath = 'C:/repos/test-url-strip';

      mockGitClient.getRemotes = async () => [
        {
          name: 'origin',
          fetchUrl: 'https://olduser@github.com/myorg/awesome-repo.git',
          pushUrl: 'https://olduser@github.com/myorg/awesome-repo.git',
          host: 'github.com',
          owner: 'myorg',
          repository: 'awesome-repo',
        },
      ];

      const profile = await profileManager.createProfile({
        name: 'General Dev',
        git: { name: 'Work User', email: 'user@test.com' }, // author name has space, no github username
        authentication: { type: 'none' },
      });

      await profileManager.switchProfile(profile.id, repoPath);

      const originUpdate = setRemoteCalls.find(c => c.name === 'origin');
      assert.ok(originUpdate, 'Remote URL should have been reset without stale username');
      assert.strictEqual(originUpdate.url, 'https://github.com/myorg/awesome-repo.git');
    });

    it('should not approve credential with invalid username containing spaces', async () => {
      const repoPath = 'C:/repos/test-spaces-username';
      mockGitClient.getCredentialHelperForUrl = async () => 'manager';

      const spaceProfile = await profileManager.createProfile(
        {
          name: 'Space Dev',
          git: { name: 'John Doe', email: 'john@test.com' }, // name has spaces, no github username
          authentication: { type: 'pat' },
        },
        'ghp_spaceToken'
      );

      await profileManager.switchProfile(spaceProfile.id, repoPath);

      // Should not approve credential with "John Doe" because it contains spaces and breaks git credential helpers
      const approvedWithSpaces = approvedCredentials.find(c => c.username.includes(' '));
      assert.strictEqual(approvedWithSpaces, undefined);
    });
  });

  describe('Webview HTML & SidebarView Auto-Fill Commands', () => {
    it('should render Verify & Auto-Fill button for PAT and Test & Auto-Fill button for SSH', () => {
      const state: WebviewState = {
        profiles: [],
      };
      const html = HtmlBuilder.render(state);

      assert.ok(html.includes('id="btn-verify-pat"'));
      assert.ok(html.includes('data-action="verifyPatToken"'));
      assert.ok(html.includes('id="pat-verify-status"'));

      assert.ok(html.includes('id="btn-verify-ssh"'));
      assert.ok(html.includes('data-action="verifySshKey"'));
      assert.ok(html.includes('id="ssh-verify-status"'));
    });

    it('should handle verifyToken and return verifyTokenResult via postMessage', async () => {
      const secretStore = new SecretStore();
      const mockGitClient = new GitClient('git');
      const verifier = new AccountVerifier(secretStore, mockGitClient);
      const profileManager = new ProfileManager(new PersistentProfileStore(), new AuthManager(secretStore), mockGitClient);
      const repoDiscovery = new RepositoryDiscovery(mockGitClient);

      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async () =>
          new Response(
            JSON.stringify({
              login: 'autouser',
              id: 112233,
              name: 'Auto User',
              email: 'autouser@company.com',
            }),
            {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                'x-oauth-scopes': 'repo, user',
              },
            }
          );

        const provider = new SidebarViewProvider(
          vscode.Uri.file('c:/fake/extension'),
          profileManager,
          repoDiscovery,
          undefined,
          undefined,
          verifier
        );

        let postedMessage: any = null;
        const fakeWebviewView = {
          webview: {
            options: {},
            html: '',
            onDidReceiveMessage: (_cb: any) => ({ dispose: () => {} }),
            postMessage: async (m: any) => {
              postedMessage = m;
              return true;
            },
            asWebviewUri: (uri: any) => uri,
            cspSource: 'vscode-resource:',
          },
        } as any;

        (provider as any).view = fakeWebviewView;

        // Simulate onDidReceiveMessage handler
        let messageHandler: ((msg: any) => Promise<void>) | null = null;
        fakeWebviewView.webview.onDidReceiveMessage = (cb: any) => {
          messageHandler = cb;
          return { dispose: () => {} };
        };

        provider.resolveWebviewView(fakeWebviewView, {} as any, {} as any);
        assert.ok(messageHandler);

        if (messageHandler) {
          await (messageHandler as (msg: any) => Promise<void>)({
            command: 'verifyToken',
            token: 'ghp_validToken',
            host: 'github.com',
          });
        }

        assert.ok(postedMessage);
        assert.strictEqual(postedMessage.command, 'verifyTokenResult');
        assert.strictEqual(postedMessage.success, true);
        assert.strictEqual(postedMessage.login, 'autouser');
        assert.strictEqual(postedMessage.name, 'Auto User');
        assert.strictEqual(postedMessage.email, 'autouser@company.com');
        assert.deepStrictEqual(postedMessage.scopes, ['repo', 'user']);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should auto-resolve github username via verifySshKey on createProfileFromForm when omitted', async () => {
      const secretStore = new SecretStore();
      const mockGitClient = new GitClient('git');
      const verifier = new AccountVerifier(secretStore, mockGitClient);
      const profileManager = new ProfileManager(new PersistentProfileStore(), new AuthManager(secretStore), mockGitClient);
      const repoDiscovery = new RepositoryDiscovery(mockGitClient);

      // Mock verifySshKey
      verifier.verifySshKey = async () => ({
        success: true,
        status: 'verified',
        login: 'sshuser',
        email: 'sshuser@users.noreply.github.com',
        message: 'Authenticated as @sshuser via SSH',
      });

      const provider = new SidebarViewProvider(
        vscode.Uri.file('c:/fake/extension'),
        profileManager,
        repoDiscovery,
        undefined,
        undefined,
        verifier
      );

      let messageHandler: ((msg: any) => Promise<void>) | null = null;
      const fakeWebviewView = {
        webview: {
          options: {},
          html: '',
          onDidReceiveMessage: (cb: any) => {
            messageHandler = cb;
            return { dispose: () => {} };
          },
          postMessage: async () => true,
          asWebviewUri: (uri: any) => uri,
          cspSource: 'vscode-resource:',
        },
      } as any;

      provider.resolveWebviewView(fakeWebviewView, {} as any, {} as any);

      assert.ok(messageHandler);
      await (messageHandler as (msg: any) => Promise<void>)({
        command: 'createProfileFromForm',
        data: {
          name: 'SSH Auto Profile',
          gitName: 'SSH Developer',
          gitEmail: 'sshdev@company.com',
          authType: 'ssh',
          sshKeyPath: '~/.ssh/id_ed25519',
          // githubUsername omitted
        },
      });

      const profiles = await profileManager.getProfiles();
      const created = profiles.find(p => p.name === 'SSH Auto Profile');
      assert.ok(created);
      assert.ok(created.github);
      assert.strictEqual(created.github.username, 'sshuser');
    });
  });
});
