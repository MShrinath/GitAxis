import * as assert from 'assert';
import { HtmlBuilder, WebviewState } from '../src/webview/html';
import { GitProfile, GitRepository, ProfileMatchResult } from '../src/contracts';

describe('Webview HTML Builder (V2 Profile Control Center)', () => {
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
        fetchUrl: 'https://github.com/MShrinath/GitAxis.git',
        pushUrl: 'https://github.com/MShrinath/GitAxis.git',
        owner: 'MShrinath',
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
      repoUrl: 'https://github.com/MShrinath/GitAxis',
      linkedProfileId: 'prof_1',
    };

    const html = HtmlBuilder.render(state);

    // Active identity card
    assert.ok(html.includes('ACTIVE IDENTITY'));
    assert.ok(html.includes('Work'));
    assert.ok(html.includes('john@company.com'));
    assert.ok(html.includes('@john-work'));

    // Repo status & GitHub link
    assert.ok(html.includes('CURRENT REPO:'));
    assert.ok(html.includes('GitAxis'));
    assert.ok(html.includes('Branch:'));
    assert.ok(html.includes('main'));
    assert.ok(html.includes('Open on GitHub'));
    assert.ok(html.includes('https://github.com/MShrinath/GitAxis'));

    // Persistent form
    assert.ok(html.includes('CREATE / EDIT PROFILE'));
    assert.ok(html.includes('id="form-name"'));
    assert.ok(html.includes('id="form-git-name"'));
    assert.ok(html.includes('id="form-git-email"'));
    assert.ok(html.includes('id="form-gh-user"'));
    assert.ok(html.includes('id="form-host"'));
    assert.ok(html.includes('id="form-pat"'));
    assert.ok(html.includes('name="form-scope"'));
    assert.ok(html.includes('btn-toggle-pat'));
    assert.ok(html.includes('restoreFormFromState'));
    assert.ok(html.includes('saveCurrentFormToState'));
  });

  it('should NOT render redundant Git action buttons or GitHub issues/PR sections', () => {
    const state: WebviewState = {
      profile: dummyProfile,
      repository: dummyRepo,
      profiles: [dummyProfile],
    };

    const html = HtmlBuilder.render(state);

    // Ensure redundant Git buttons are absent
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

    // Ensure redundant GitHub explorer sections are absent
    assert.strictEqual(html.includes("sendCmd('createIssue')"), false);
    assert.strictEqual(html.includes("sendCmd('createPullRequest')"), false);
    assert.strictEqual(html.includes("sendCmd('actions')"), false);
    assert.strictEqual(html.includes("sendCmd('releases')"), false);
  });

  it('should render system discovery scan bar and 1-click import chips', () => {
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

    assert.ok(html.includes('SYSTEM ACCOUNT SCANNER'));
    assert.ok(html.includes('Scan Local Git &amp; GitHub CLI Accounts'));
    assert.ok(html.includes('@octocat'));
    assert.ok(html.includes('octocat@github.com'));
    assert.ok(html.includes('+ Import as Profile'));
    assert.ok(html.includes('importDiscoveredAccount(0)'));
  });

  it('should render profile action buttons: switch, edit, delete (without link repo)', () => {
    const secondProfile: GitProfile = {
      ...dummyProfile,
      id: 'prof_2',
      name: 'Personal',
      git: { name: 'Shrinath', email: 'shrinath@personal.me', scope: 'local' },
      github: { host: 'github.com', username: 'MShrinath' },
    };

    const state: WebviewState = {
      profile: dummyProfile,
      repository: dummyRepo,
      profiles: [dummyProfile, secondProfile],
      linkedProfileId: 'prof_1',
    };

    const html = HtmlBuilder.render(state);

    // Active profile has Edit, Delete (no link/unlink)
    assert.ok(html.includes("editProfile('prof_1')"));
    assert.ok(html.includes("deleteProfile('prof_1'"));

    // Inactive profile has Switch, Edit, Delete (no link/unlink)
    assert.ok(html.includes("switchProfile('prof_2')"));
    assert.ok(html.includes("editProfile('prof_2')"));
    assert.ok(html.includes("deleteProfile('prof_2'"));

    // Ensure link repo is completely removed from UI
    assert.strictEqual(html.includes('linkRepo('), false);
    assert.strictEqual(html.includes('unlinkRepo('), false);
    assert.strictEqual(html.includes('Linked to:'), false);
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

    // CSP header includes the provided cspSource
    assert.ok(html.includes('vscode-webview:'));
    assert.ok(html.includes("'unsafe-inline'"));

    // Names and emails are escaped in HTML content
    assert.ok(html.includes('Work &quot;Client&quot; &amp; &lt;Co&gt;'));
    assert.ok(html.includes('O&#39;Connor &lt;Tester&gt;'));
    assert.ok(html.includes('test&quot;quote@example.com'));

    // Quotes and angle brackets in attributes are escaped so attributes cannot be broken out of
    assert.ok(!html.includes('repo"onclick='));
    assert.ok(html.includes('repo&quot;onclick='));
    assert.ok(!html.includes('<script>alert(1)</script>'));

    // Message listener for backend events is present
    assert.ok(html.includes("msg.command === 'saveSuccess'"));
    assert.ok(html.includes("msg.command === 'saveError'"));
    assert.ok(html.includes("msg.command === 'profileDeleted'"));
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
    // Should NOT show (github.com) when there is no GitHub user
    assert.ok(!html.includes('GitHub: <strong>None</strong> <span class="sub">(github.com)</span>'));
  });
});
