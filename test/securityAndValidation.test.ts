import * as assert from 'assert';
import { Validation } from '../src/utils/validation';
import { GitClient } from '../src/git/gitClient';
import { ExtraheaderMigration, IMigrationMemento } from '../src/migrations/extraheaderMigration';
import { PersistentProfileStore } from '../src/profiles/profileStore';
import { HtmlBuilder, WebviewState } from '../src/webview/html';
import { GitProfile } from '../src/contracts';

describe('Security & Validation (v0.4.0)', () => {
  describe('Git Argument Validation (Section 6)', () => {
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

      // Branch creation rejection
      await assert.rejects(async () => {
        await git.createBranch('/dummy', '--output=/tmp/pwn');
      }, /Invalid branch name/);

      // Checkout rejection
      await assert.rejects(async () => {
        await git.checkout('/dummy', '-b');
      }, /Invalid git ref/);

      // Tag creation rejection
      await assert.rejects(async () => {
        await git.createTag('/dummy', '-a');
      }, /Invalid tag name/);

      // Remote add rejection (bad URL)
      await assert.rejects(async () => {
        await git.addRemote('/dummy', 'origin', 'ext::sh -c evil');
      }, /Invalid remote URL/);

      // Clone rejection (bad URL and bad dest)
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

  describe('Secret Redaction (Section 1)', () => {
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

  describe('Extraheader Migration (Section 1)', () => {
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
  });

  describe('Webview Strict CSP & Data Attributes (Section 5)', () => {
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

      // Strict CSP
      assert.ok(html.includes("default-src 'none'"));
      assert.ok(html.includes("script-src 'nonce-random-test-nonce'"));
      assert.ok(html.includes("style-src vscode-webview: 'nonce-random-test-nonce'"));
      assert.strictEqual(html.includes("'unsafe-inline'"), false);

      // External script and stylesheet links
      assert.ok(html.includes('<link rel="stylesheet" href="vscode-webview:/media/main.css" nonce="random-test-nonce">'));
      assert.ok(html.includes('<script nonce="random-test-nonce" src="vscode-webview:/media/main.js"></script>'));

      // Event delegation with data-action instead of onclick
      assert.strictEqual(html.includes('onclick='), false);
      assert.ok(html.includes('data-action="refresh"'));
      assert.ok(html.includes('data-action="editProfile"'));
      assert.ok(html.includes('data-action="deleteProfile"'));

      // Token label indicates token saved without exposing plaintext token
      assert.ok(html.includes('PAT (token saved)'));
    });
  });
});
