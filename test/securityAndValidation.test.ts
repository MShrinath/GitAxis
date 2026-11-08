import * as assert from 'assert';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

// Setup mock for 'vscode' before importing any extension code that requires vscode
const Module = require('module');
if (!require.cache['vscode']) {
  const origResolve = Module._resolveFilename;
  Module._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
    if (request === 'vscode') {
      return 'vscode';
    }
    return origResolve.call(this, request, parent, isMain, options);
  };

  const vscodeMock = {
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
  };

  require.cache['vscode'] = {
    id: 'vscode',
    filename: 'vscode',
    loaded: true,
    exports: vscodeMock,
  } as any;
}

const vscode = require('vscode');
if (!vscode.Uri.joinPath) {
  vscode.Uri.joinPath = (base: any, ...segments: string[]) => ({ toString: () => `${base}/${segments.join('/')}` });
}

import { Validation } from '../src/utils/validation';
import { GitClient } from '../src/git/gitClient';
import { ExtraheaderMigration, IMigrationMemento } from '../src/migrations/extraheaderMigration';
import { PersistentProfileStore } from '../src/profiles/profileStore';
import { HtmlBuilder, WebviewState } from '../src/webview/html';
import { GitProfile } from '../src/contracts';
import { FolderRuleManager } from '../src/profiles/folderRuleManager';
import { logger } from '../src/utils/logger';
import { GitHubClient } from '../src/github/githubClient';
import { Platform } from '../src/utils/platform';
import { SecretStore } from '../src/auth/secretStore';
import { AuthManager } from '../src/auth/authManager';
import { ProfileManager } from '../src/profiles/profileManager';
import { RepositoryDiscovery } from '../src/discovery/repositoryDiscovery';
import { registerGitHubCommands } from '../src/commands/github';
import { deactivate } from '../src/extension';

describe('Security & Validation Suite', () => {
  describe('Git Argument Validation', () => {
    it('should reject branch names starting with dash or containing invalid characters', () => {
      assert.strictEqual(Validation.isValidBranchName('-b'), false);
      assert.strictEqual(Validation.isValidBranchName('--output=/tmp/pwn'), false);
      assert.strictEqual(Validation.isValidBranchName('feature branch'), false);
      assert.strictEqual(Validation.isValidBranchName('bad..branch'), false);
      assert.strictEqual(Validation.isValidBranchName('bad@{ref'), false);
      assert.strictEqual(Validation.isValidBranchName('/bad/branch'), false);
      assert.strictEqual(Validation.isValidBranchName('bad/branch/'), false);
      assert.strictEqual(Validation.isValidBranchName('branch.lock'), false);

      // Valid branch names
      assert.strictEqual(Validation.isValidBranchName('main'), true);
      assert.strictEqual(Validation.isValidBranchName('feature/login-v2'), true);
      assert.strictEqual(Validation.isValidBranchName('user_fix.1'), true);
    });

    it('should reject tag names starting with dash or containing invalid characters', () => {
      assert.strictEqual(Validation.isValidTagName('-d'), false);
      assert.strictEqual(Validation.isValidTagName('--delete'), false);
      assert.strictEqual(Validation.isValidTagName('tag with spaces'), false);
      assert.strictEqual(Validation.isValidTagName('tag..bad'), false);

      assert.strictEqual(Validation.isValidTagName('v1.0.0'), true);
      assert.strictEqual(Validation.isValidTagName('release-2026.1'), true);
    });

    it('should reject remote names starting with dash or containing invalid characters', () => {
      assert.strictEqual(Validation.isValidRemoteName('-v'), false);
      assert.strictEqual(Validation.isValidRemoteName('--upload-pack=evil'), false);
      assert.strictEqual(Validation.isValidRemoteName('remote name'), false);
      assert.strictEqual(Validation.isValidRemoteName('remote/name'), false);

      assert.strictEqual(Validation.isValidRemoteName('origin'), true);
      assert.strictEqual(Validation.isValidRemoteName('upstream'), true);
      assert.strictEqual(Validation.isValidRemoteName('fork-1.corp'), true);
    });

    it('should reject refs starting with dash or containing whitespace/control chars', () => {
      assert.strictEqual(Validation.isValidRef('-f'), false);
      assert.strictEqual(Validation.isValidRef('--hard'), false);
      assert.strictEqual(Validation.isValidRef('ref with space'), false);

      assert.strictEqual(Validation.isValidRef('HEAD'), true);
      assert.strictEqual(Validation.isValidRef('HEAD~1'), true);
      assert.strictEqual(Validation.isValidRef('origin/main'), true);
      assert.strictEqual(Validation.isValidRef('stash@{0}'), true);
      assert.strictEqual(Validation.isValidRef('4b825dc642cb6eb9a060e54bf8d69288fbee4904'), true);
    });

    it('should allow only safe URL protocols and reject ext:: and file://', () => {
      assert.strictEqual(Validation.isValidGitUrl('-u'), false);
      assert.strictEqual(Validation.isValidGitUrl('--upload-pack=evil'), false);
      assert.strictEqual(Validation.isValidGitUrl('ext::sh -c evil'), false);
      assert.strictEqual(Validation.isValidGitUrl('file:///etc/passwd'), false);

      assert.strictEqual(Validation.isValidGitUrl('https://github.com/user/repo.git'), true);
      assert.strictEqual(Validation.isValidGitUrl('http://github.com/user/repo.git'), true);
      assert.strictEqual(Validation.isValidGitUrl('ssh://git@github.com/user/repo.git'), true);
      assert.strictEqual(Validation.isValidGitUrl('git@github.com:user/repo.git'), true);
    });

    it('GitClient should enforce validation before executing git commands', async () => {
      const git = new GitClient('git');
      let executedArgs: string[] = [];
      git.exec = async (args: string[]) => {
        executedArgs = args;
        return { stdout: '', stderr: '' };
      };

      await assert.rejects(async () => {
        await git.createBranch('/dummy', '--output=/tmp/pwn');
      }, /Invalid branch name/);

      await assert.rejects(async () => {
        await git.checkout('/dummy', '-b');
      }, /Invalid git ref/);

      await assert.rejects(async () => {
        await git.createTag('/dummy', '-a');
      }, /Invalid tag name/);

      await assert.rejects(async () => {
        await git.addRemote('/dummy', 'origin', 'ext::sh -c evil');
      }, /Invalid remote URL/);

      await assert.rejects(async () => {
        await git.clone('file:///etc/shadow', '/tmp/repo');
      }, /Invalid clone URL/);
      await assert.rejects(async () => {
        await git.clone('https://github.com/user/repo.git', '--upload-pack=evil');
      }, /Invalid destination path/);

      // Push preference: --force-with-lease preferred over --force
      await git.push('/dummy', 'origin', 'main', false, true, true);
      assert.ok(executedArgs.includes('--force-with-lease'));
      assert.strictEqual(executedArgs.includes('--force'), false);
    });
  });

  describe('Secret Redaction', () => {
    it('should redact sensitive tokens and credentials from URLs and strings', () => {
      const urlWithCredentials = 'https://john:ghp_1234567890abcdef1234567890abcdef@github.com/repo.git';
      const sanitizedUrl = Validation.sanitizeUrl(urlWithCredentials);
      assert.ok(!sanitizedUrl.includes('ghp_1234567890abcdef1234567890abcdef'));
      assert.ok(sanitizedUrl.includes('https://john:***@github.com'));

      const patString = 'Error connecting with token ghp_secret123456789012345678901234567890 to GitHub';
      const sanitizedPat = Validation.sanitizeUrl(patString);
      assert.ok(!sanitizedPat.includes('ghp_secret123456789012345678901234567890'));
      assert.ok(sanitizedPat.includes('ghp_***[REDACTED]'));

      const fineGrainedPat = 'github_pat_11AAAAAAA012345678901234567890123456789012345678901234567890';
      const sanitizedFg = Validation.sanitizeUrl(fineGrainedPat);
      assert.ok(!sanitizedFg.includes('11AAAAAAA01234567890'));
      assert.ok(sanitizedFg.includes('github_pat_***[REDACTED]'));

      const authHeader = 'AUTHORIZATION: basic dXNlcjpnaHBfc2VjcmV0VG9rZW4xMjM=';
      const sanitizedHeader = Validation.sanitizeUrl(authHeader);
      assert.ok(!sanitizedHeader.includes('dXNlcjpnaHBfc2VjcmV0VG9rZW4xMjM='));
      assert.ok(sanitizedHeader.includes('AUTHORIZATION: basic ***[REDACTED]'));
    });
  });

  describe('SSH Key Path Validation & Injection Prevention', () => {
    it('should validate valid SSH key paths', () => {
      assert.strictEqual(Validation.isValidSshKeyPath('~/.ssh/id_ed25519'), true);
      assert.strictEqual(Validation.isValidSshKeyPath('/home/user/.ssh/id_rsa'), true);
      assert.strictEqual(Validation.isValidSshKeyPath('C:/Users/dev/.ssh/id_rsa'), true);
      assert.strictEqual(Validation.isValidSshKeyPath('C:\\Users\\dev\\.ssh\\id_rsa'), true);
      assert.strictEqual(Validation.isValidSshKeyPath('"/path with spaces/id_ed25519"'), true);
      assert.strictEqual(Validation.isValidSshKeyPath("'/path with spaces/id_ed25519'"), true);
      assert.strictEqual(Validation.isValidSshKeyPath('C:/path with spaces/key'), true);
      assert.strictEqual(Validation.isValidSshKeyPath('ssh -i /path/to/key -o IdentitiesOnly=yes'), true);
    });

    it('should reject dangerous shell characters and command injection attempts', () => {
      assert.strictEqual(Validation.isValidSshKeyPath('key; calc.exe'), false);
      assert.strictEqual(Validation.isValidSshKeyPath('id_rsa; rm -rf /'), false);
      assert.strictEqual(Validation.isValidSshKeyPath('key & calc.exe'), false);
      assert.strictEqual(Validation.isValidSshKeyPath('key && calc.exe'), false);
      assert.strictEqual(Validation.isValidSshKeyPath('key | calc.exe'), false);
      assert.strictEqual(Validation.isValidSshKeyPath('key || calc.exe'), false);
      assert.strictEqual(Validation.isValidSshKeyPath('key`calc.exe`'), false);
      assert.strictEqual(Validation.isValidSshKeyPath('key$(calc.exe)'), false);
      assert.strictEqual(Validation.isValidSshKeyPath('key$VAR'), false);
      assert.strictEqual(Validation.isValidSshKeyPath('key > /tmp/pwn'), false);
      assert.strictEqual(Validation.isValidSshKeyPath('key < /tmp/pwn'), false);
      assert.strictEqual(Validation.isValidSshKeyPath('-o ProxyCommand="malicious"'), false);
      assert.strictEqual(Validation.isValidSshKeyPath('--upload-pack=evil'), false);
      assert.strictEqual(Validation.isValidSshKeyPath('id_rsa" -o ProxyCommand="calc.exe"'), false);
      assert.strictEqual(Validation.isValidSshKeyPath("id_rsa' -o ProxyCommand='calc.exe'"), false);
      assert.strictEqual(Validation.isValidSshKeyPath('"id_rsa'), false);
      assert.strictEqual(Validation.isValidSshKeyPath('id_rsa"'), false);
      assert.strictEqual(Validation.isValidSshKeyPath('"id_rsa\''), false);
      assert.strictEqual(Validation.isValidSshKeyPath('"id_rsa" "extra"'), false);
      assert.strictEqual(Validation.isValidSshKeyPath('ssh -o ProxyCommand=calc.exe'), false);
      assert.strictEqual(Validation.isValidSshKeyPath('id_rsa -o ProxyCommand=calc.exe'), false);
      assert.strictEqual(Validation.isValidSshKeyPath('key -o LocalCommand=calc.exe'), false);
      assert.strictEqual(Validation.isValidSshKeyPath('id_rsa\ncalc.exe'), false);
      assert.strictEqual(Validation.isValidSshKeyPath('id_rsa\r\ncalc.exe'), false);
      assert.strictEqual(Validation.isValidSshKeyPath('id_rsa\0calc.exe'), false);
      assert.strictEqual(Validation.isValidSshKeyPath('id_rsa\x1bcalc.exe'), false);
      assert.strictEqual(Validation.isValidSshKeyPath('id_rsa # comment'), false);
      assert.strictEqual(Validation.isValidSshKeyPath(''), false);
      assert.strictEqual(Validation.isValidSshKeyPath('   '), false);
      assert.strictEqual(Validation.isValidSshKeyPath(null as any), false);
      assert.strictEqual(Validation.isValidSshKeyPath(undefined as any), false);
      assert.strictEqual(Validation.isValidSshKeyPath('a'.repeat(513)), false);
    });

    it('Platform.resolveSshCommand should throw on invalid SSH key paths', () => {
      assert.throws(() => Platform.resolveSshCommand('id_rsa" -o ProxyCommand="calc.exe"'), /Invalid SSH key path/);
      assert.throws(() => Platform.resolveSshCommand('key; calc.exe'), /Invalid SSH key path/);
      assert.throws(() => Platform.resolveSshCommand('-o ProxyCommand=evil'), /Invalid SSH key path/);
      assert.throws(() => Platform.resolveSshCommand('"unclosed_quote'), /Invalid SSH key path/);
      assert.throws(() => Platform.resolveSshCommand('ssh -o ProxyCommand=calc.exe'), /Invalid SSH key path/);
    });

    it('PersistentProfileStore should reject invalid sshKeyPath on create and update', async () => {
      const store = new PersistentProfileStore();

      await assert.rejects(
        async () => {
          await store.create({
            name: 'MaliciousSSH',
            git: { name: 'Dev', email: 'dev@test.org' },
            authentication: {
              type: 'ssh',
              sshKeyPath: 'key; calc.exe',
            },
          });
        },
        /Invalid SSH key path/
      );

      const valid = await store.create({
        name: 'ValidSSH',
        git: { name: 'Dev', email: 'dev@test.org' },
        authentication: {
          type: 'ssh',
          sshKeyPath: '~/.ssh/id_ed25519',
        },
      });
      assert.strictEqual(valid.authentication.sshKeyPath, '~/.ssh/id_ed25519');

      await assert.rejects(
        async () => {
          await store.update(valid.id, {
            authentication: {
              type: 'ssh',
              sshKeyPath: 'id_rsa" -o ProxyCommand="calc.exe"',
            },
          });
        },
        /Invalid SSH key path/
      );
    });
  });

  describe('Extraheader Migration', () => {
    class MockMemento implements IMigrationMemento {
      public data = new Map<string, unknown>();
      public get<T>(key: string, defaultValue?: T): T {
        return (this.data.has(key) ? this.data.get(key) : defaultValue) as T;
      }
      public async update(key: string, value: unknown): Promise<void> {
        this.data.set(key, value);
      }
    }

    it('should detect and remove leftover extraheaders from .git/config', async () => {
      const memento = new MockMemento();
      const store = new PersistentProfileStore();
      await store.setAssociation('/mock/repo1', 'prof_1');

      const localConfigs = new Map<string, string>();
      localConfigs.set('http.https://github.com/.extraheader', 'AUTHORIZATION: basic secret');

      const mockGit = new GitClient('git');
      mockGit.isRepository = async () => true;
      mockGit.exec = async (args: string[]) => {
        if (args.includes('--get-regexp')) {
          return { stdout: 'http.https://github.com/.extraheader AUTHORIZATION: basic secret', stderr: '' };
        }
        return { stdout: '', stderr: '' };
      };
      mockGit.unsetLocalConfig = async (_path: string, key: string) => {
        localConfigs.delete(key);
      };
      mockGit.getLocalConfig = async (_path: string, key: string) => localConfigs.get(key);

      const cleaned = await ExtraheaderMigration.run(store, mockGit, memento);
      assert.strictEqual(cleaned, 1);
      assert.strictEqual(localConfigs.has('http.https://github.com/.extraheader'), false);
      assert.strictEqual(memento.get(ExtraheaderMigration.MIGRATION_KEY), true);

      // Running second time does nothing
      const cleanedSecond = await ExtraheaderMigration.run(store, mockGit, memento);
      assert.strictEqual(cleanedSecond, 0);
    });

    it('should preserve custom non-auth extraheaders in ExtraheaderMigration', async () => {
      const memento = new MockMemento();
      const store = new PersistentProfileStore();
      await store.setAssociation('/mock/repo1', 'p1');

      const localConfigs = new Map<string, string>();
      localConfigs.set('http.extraheader', 'X-Custom-CI: keep-this');

      const mockGit = new GitClient('git');
      mockGit.isRepository = async () => true;
      mockGit.exec = async (args: string[]) => {
        if (args.includes('--get-regexp')) {
          return { stdout: 'http.extraheader X-Custom-CI: keep-this', stderr: '' };
        }
        return { stdout: '', stderr: '' };
      };
      mockGit.unsetLocalConfig = async (_p: string, k: string) => { localConfigs.delete(k); };
      mockGit.getLocalConfig = async (_p: string, k: string) => localConfigs.get(k);

      const cleaned = await ExtraheaderMigration.run(store, mockGit, memento);
      assert.strictEqual(cleaned, 0);
      assert.strictEqual(localConfigs.get('http.extraheader'), 'X-Custom-CI: keep-this');
    });
  });

  describe('Webview Strict CSP & Data Attributes', () => {
    const dummyProfile: GitProfile = {
      id: 'prof_test',
      name: 'Work',
      git: { name: 'Dev', email: 'dev@work.com', scope: 'local' },
      github: { host: 'github.com', username: 'workdev' },
      authentication: { type: 'pat' },
      metadata: { source: 'manual', imported: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    it('should render strict CSP with nonces and no unsafe-inline', () => {
      const state: WebviewState = {
        profile: dummyProfile,
        profiles: [dummyProfile],
      };

      const html = HtmlBuilder.render(state, {
        cspSource: 'vscode-webview:',
        scriptUri: 'vscode-webview:/media/main.js',
        styleUri: 'vscode-webview:/media/main.css',
        nonce: 'random-test-nonce',
      });

      assert.ok(html.includes("default-src 'none'"));
      assert.ok(html.includes("script-src 'nonce-random-test-nonce'"));
      assert.ok(html.includes("style-src vscode-webview: 'nonce-random-test-nonce'"));
      assert.strictEqual(html.includes("'unsafe-inline'"), false);

      assert.ok(html.includes('<link rel="stylesheet" href="vscode-webview:/media/main.css" nonce="random-test-nonce">'));
      assert.ok(html.includes('<script nonce="random-test-nonce" src="vscode-webview:/media/main.js"></script>'));

      assert.strictEqual(html.includes('onclick='), false);
      assert.ok(html.includes('data-action="refresh"'));
      assert.ok(html.includes('data-action="editProfile"'));
      assert.ok(html.includes('data-action="deleteProfile"'));
      assert.ok(html.includes('PAT (token saved)'));
    });
  });

  describe('Folder Rule Validation & Injection Prevention (SEC-01)', () => {
    it('should validate valid folder rules and reject dangerous characters', () => {
      assert.strictEqual(Validation.isValidFolderRule('~/work/**'), true);
      assert.strictEqual(Validation.isValidFolderRule('/home/user/repos/**'), true);
      assert.strictEqual(Validation.isValidFolderRule('C:/Users/Dev/projects/**'), true);
      assert.strictEqual(Validation.isValidFolderRule('hasconfig:remote.*.url:git@github.com:acme/**'), true);
      assert.strictEqual(Validation.isValidFolderRule('https://github.com/my-org/**'), true);

      assert.strictEqual(Validation.isValidFolderRule(''), false);
      assert.strictEqual(Validation.isValidFolderRule('   '), false);
      assert.strictEqual(Validation.isValidFolderRule(null as any), false);
      assert.strictEqual(Validation.isValidFolderRule(undefined as any), false);
      assert.strictEqual(Validation.isValidFolderRule('a'.repeat(513)), false);

      assert.strictEqual(Validation.isValidFolderRule('work/**" ]\n[core]\nsshCommand = calc.exe'), false);
      assert.strictEqual(Validation.isValidFolderRule('work/**\r\n[core]'), false);
      assert.strictEqual(Validation.isValidFolderRule('work/**"'), false);
      assert.strictEqual(Validation.isValidFolderRule("work/**'"), false);
      assert.strictEqual(Validation.isValidFolderRule('work/**; rm -rf /'), false);
      assert.strictEqual(Validation.isValidFolderRule('work/** # comment injection'), false);
      assert.strictEqual(Validation.isValidFolderRule('work/**\x00'), false);

      assert.strictEqual(Validation.isValidFolderRule('\n~/work/**'), false);
      assert.strictEqual(Validation.isValidFolderRule('~/work/**\n'), false);
      assert.strictEqual(Validation.isValidFolderRule('\r~/work/**'), false);
      assert.strictEqual(Validation.isValidFolderRule('~/work/**\r'), false);
      assert.strictEqual(Validation.isValidFolderRule('\r\n~/work/**\r\n'), false);
      assert.strictEqual(Validation.isValidFolderRule('~/work/**\t'), false);
    });

    it('formatIncludeIfCondition should throw on invalid injection rule', () => {
      const frm = new FolderRuleManager();
      const injection = 'work/**" ]\n[core]\nsshCommand = calc.exe';
      assert.throws(() => {
        frm.formatIncludeIfCondition(injection);
      }, /Invalid folder rule pattern/);
    });

    it('generateIncludeIfBlock should filter out malicious folder rules without config breakout', () => {
      const frm = new FolderRuleManager();
      const profile: GitProfile = {
        id: 'p-malicious',
        name: 'AttackerProfile',
        git: { name: 'Evil', email: 'evil@test.com', scope: 'local' },
        authentication: { type: 'none', source: 'user-input' },
        metadata: { source: 'manual' },
        createdAt: '',
        updatedAt: '',
        folderRules: [
          '~/safe-work/**',
          'work/**" ]\n[core]\nsshCommand = "calc.exe"\n[includeIf "gitdir:dummy/',
          '~/safe-personal/**',
        ],
      };

      const block = frm.generateIncludeIfBlock([profile]);
      assert.ok(block.includes('~/safe-work/'));
      assert.ok(block.includes('~/safe-personal/'));
      assert.strictEqual(block.includes('calc.exe'), false);
      assert.strictEqual(block.includes('[core]'), false);
    });
  });

  describe('Logger Argument & Error Sanitization (SEC-06)', () => {
    let loggedError: any[] = [];
    let loggedInfo: any[] = [];
    let loggedWarn: any[] = [];
    let loggedDebug: any[] = [];

    const origError = console.error;
    const origLog = console.log;
    const origWarn = console.warn;
    const origDebug = console.debug;

    beforeEach(() => {
      loggedError = [];
      loggedInfo = [];
      loggedWarn = [];
      loggedDebug = [];
      console.error = (...args: any[]) => { loggedError.push(args); };
      console.log = (...args: any[]) => { loggedInfo.push(args); };
      console.warn = (...args: any[]) => { loggedWarn.push(args); };
      console.debug = (...args: any[]) => { loggedDebug.push(args); };
    });

    afterEach(() => {
      console.error = origError;
      console.log = origLog;
      console.warn = origWarn;
      console.debug = origDebug;
    });

    it('should redact sensitive tokens in error message and error object stack/message', () => {
      const token = 'ghp_1234567890abcdef1234567890abcdef';
      const err = new Error(`Connection failed with PAT ${token}`);
      logger.error(`Failed request for ${token}`, err);

      assert.strictEqual(loggedError.length, 1);
      const [msg, errArg] = loggedError[0];
      assert.strictEqual(msg.includes(token), false);
      assert.ok(msg.includes('ghp_***[REDACTED]'));
      assert.ok(errArg instanceof Error);
      assert.strictEqual(errArg.message.includes(token), false);
      assert.ok(errArg.message.includes('ghp_***[REDACTED]'));
      if (errArg.stack) {
        assert.strictEqual(errArg.stack.includes(token), false);
      }
    });

    it('should redact sensitive tokens in custom error properties and cause', () => {
      const token = 'ghp_1234567890abcdef1234567890abcdef';
      const cause = new Error(`Root cause token: ${token}`);
      const err: any = new Error('Top error');
      err.stderr = `git error with ${token}`;
      err.cause = cause;

      logger.error('Wrapped error', err);

      assert.strictEqual(loggedError.length, 1);
      const [, errArg] = loggedError[0];
      assert.strictEqual(errArg.stderr.includes(token), false);
      assert.ok(errArg.stderr.includes('ghp_***[REDACTED]'));
      assert.strictEqual(errArg.cause.message.includes(token), false);
      assert.ok(errArg.cause.message.includes('***[REDACTED]'));
    });

    it('should redact sensitive tokens and credentials in info, warn, debug extra arguments', () => {
      const sensitiveUrl = 'https://user:ghp_1234567890abcdef1234567890abcdef@github.com/org/repo';
      logger.info('Repo sync', sensitiveUrl);
      logger.warn('Remote check warning', sensitiveUrl);
      logger.debug('Debug trace', sensitiveUrl);

      assert.strictEqual(loggedInfo.length, 1);
      assert.strictEqual(loggedInfo[0][1].includes('ghp_1234567890abcdef1234567890abcdef'), false);
      assert.ok(loggedInfo[0][1].includes('***@github.com'));

      assert.strictEqual(loggedWarn.length, 1);
      assert.strictEqual(loggedWarn[0][1].includes('ghp_1234567890abcdef1234567890abcdef'), false);

      assert.strictEqual(loggedDebug.length, 1);
      assert.strictEqual(loggedDebug[0][1].includes('ghp_1234567890abcdef1234567890abcdef'), false);
    });
  });

  describe('Include-File Escaping & Host Validation', () => {
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
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitaxis-include-sec-test-'));
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

  describe('Hardening, Precision & Lifecycle Cleanup', () => {
    it('should reject invalid stash refs and log branch refs', async () => {
      const git = new GitClient('git');
      await assert.rejects(async () => {
        await git.stashApply('/mock', '-m');
      }, /Invalid stash ref/);

      await assert.rejects(async () => {
        await git.log('/mock', 10, '--bad-flag');
      }, /Invalid log branch\/ref/);
    });

    it('should insert -- before url and destination in clone', async () => {
      const git = new GitClient('git');
      let capturedArgs: string[] = [];
      git.exec = async (args: string[]) => {
        capturedArgs = args;
        return { stdout: '', stderr: '' };
      };

      await git.clone('https://github.com/org/repo.git', '/target/path');
      assert.strictEqual(capturedArgs.includes('--'), true);
      const dashDashIndex = capturedArgs.indexOf('--');
      assert.strictEqual(capturedArgs[dashDashIndex + 1], 'https://github.com/org/repo.git');
      assert.strictEqual(capturedArgs[dashDashIndex + 2], '/target/path');
    });

    it('should sort includeIf rules ascending by length so specific rules evaluate last in git', () => {
      const folderRuleManager = new FolderRuleManager();
      const p1: GitProfile = {
        id: 'p1',
        name: 'Broad',
        git: { name: 'Broad', email: 'b@c.com', scope: 'local' },
        authentication: { type: 'none', source: 'user-input' },
        metadata: { source: 'manual' },
        createdAt: '',
        updatedAt: '',
        folderRules: ['~/work/**'],
      };
      const p2: GitProfile = {
        id: 'p2',
        name: 'Specific',
        git: { name: 'Specific', email: 's@c.com', scope: 'local' },
        authentication: { type: 'none', source: 'user-input' },
        metadata: { source: 'manual' },
        createdAt: '',
        updatedAt: '',
        folderRules: ['~/work/special-team/project/**'],
      };

      const block = folderRuleManager.generateIncludeIfBlock([p2, p1]);
      const idxBroad = block.indexOf('~/work/');
      const idxSpecific = block.indexOf('~/work/special-team/project/');
      assert.ok(idxBroad !== -1);
      assert.ok(idxSpecific !== -1);
      assert.ok(idxSpecific > idxBroad);
    });

    it('should allow applying global profile when repository path is undefined', async () => {
      const gitClient = new GitClient('git');
      const globalConfigs = new Map<string, string>();
      gitClient.setGlobalConfig = async (key: string, val: string) => {
        globalConfigs.set(key, val);
      };

      const store = new PersistentProfileStore();
      const secretStore = new SecretStore();
      const authManager = new AuthManager(secretStore);
      const profileManager = new ProfileManager(store, authManager, gitClient);

      const globalProfile = await profileManager.createProfile({
        name: 'GlobalDev',
        git: { name: 'Global Developer', email: 'global@corp.com', scope: 'global' },
        github: { username: 'globaldev' },
        authentication: { type: 'none' },
      });

      const applied = await profileManager.applyIdentityToRepository(globalProfile, undefined);
      assert.strictEqual(applied, true);
      assert.strictEqual(globalConfigs.get('user.name'), 'Global Developer');
      assert.strictEqual(globalConfigs.get('user.email'), 'global@corp.com');
      assert.strictEqual(globalConfigs.get('credential.https://github.com.username'), 'globaldev');
    });

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

    it('registerGitHubCommands should register gitaxis.openGitHubRepo and not ghost commands', () => {
      const registeredCommands = new Map<string, (...args: any[]) => any>();
      const mockContext: any = { subscriptions: [] };
      const originalRegister = vscode.commands.registerCommand;
      vscode.commands.registerCommand = (cmd: string, handler: (...args: any[]) => any) => {
        registeredCommands.set(cmd, handler);
        return { dispose: () => registeredCommands.delete(cmd) };
      };

      try {
        const gitClient = new GitClient('git');
        const repoDiscovery = new RepositoryDiscovery(gitClient);
        registerGitHubCommands(mockContext, repoDiscovery);

        assert.ok(registeredCommands.has('gitaxis.openGitHubRepo'));
        assert.strictEqual(registeredCommands.has('gitaxis.createIssue'), false);
        assert.strictEqual(registeredCommands.has('gitaxis.createPullRequest'), false);
        assert.strictEqual(registeredCommands.has('gitaxis.actions'), false);
        assert.strictEqual(registeredCommands.has('gitaxis.releases'), false);
      } finally {
        vscode.commands.registerCommand = originalRegister;
      }
    });

    it('deactivate should cleanly execute and clear timers without throwing', () => {
      assert.doesNotThrow(() => {
        deactivate();
      });
    });

    it('should safely handle empty/null responses across list operations in GitHubClient', async () => {
      const client = new GitHubClient({ auth: { type: 'pat', credential: 'dummy' } });
      (client as any).request = async () => undefined;

      const repos = await client.listRepositories();
      assert.deepStrictEqual(repos, []);

      const issues = await client.listIssues('owner', 'repo');
      assert.deepStrictEqual(issues, []);

      const pulls = await client.listPullRequests('owner', 'repo');
      assert.deepStrictEqual(pulls, []);

      const actions = await client.listActions('owner', 'repo');
      assert.deepStrictEqual(actions, []);

      const releases = await client.listReleases('owner', 'repo');
      assert.deepStrictEqual(releases, []);
    });
  });
});
