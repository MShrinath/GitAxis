import { GitProfile, GitRepository, ProfileMatchResult } from '../contracts';

export interface WebviewState {
  profile?: GitProfile;
  repository?: GitRepository;
  matchResult?: ProfileMatchResult;
  profiles: GitProfile[];
}

export class HtmlBuilder {
  public static render(state: WebviewState, cspSource: string = "'self' 'unsafe-inline'"): string {
    const profile = state.profile;
    const repo = state.repository;
    const match = state.matchResult;

    const profileName = profile ? profile.name : 'No Active Profile';
    const profileEmail = profile ? profile.git.email : 'Click "Switch Profile" to select or create';
    const profileUser = profile?.github?.username ? `@${profile.github.username}` : '';

    const repoName = repo ? repo.name : 'No Repository Opened';
    const currentBranch = repo?.currentBranch ? repo.currentBranch : '—';

    const status = repo?.status || {
      clean: true,
      staged: 0,
      modified: 0,
      untracked: 0,
      conflicted: 0,
      ahead: 0,
      behind: 0,
    };

    const isMatch = match && match.confidence !== 'none' && match.recommendedProfileId === profile?.id;
    const matchBadge = isMatch
      ? `<span class="badge badge-success">✓ Profile matches remote</span>`
      : match && match.confidence !== 'none' && match.recommendedProfileId !== profile?.id
      ? `<span class="badge badge-warning">⚠ Profile mismatch (Suggested: ${
          state.profiles.find(p => p.id === match.recommendedProfileId)?.name || 'other'
        })</span>`
      : `<span class="badge badge-muted">No remote match detected</span>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src ${cspSource}; style-src ${cspSource}; script-src ${cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GitAxis Control Center</title>
  <style>
    :root {
      --bg: var(--vscode-sideBar-background, #1e1e1e);
      --fg: var(--vscode-sideBar-foreground, #cccccc);
      --btn-bg: var(--vscode-button-background, #0e639c);
      --btn-fg: var(--vscode-button-foreground, #ffffff);
      --btn-hover: var(--vscode-button-hoverBackground, #1177bb);
      --border: var(--vscode-sideBarSectionHeader-border, #333333);
      --badge-success-bg: #238636;
      --badge-warning-bg: #9e6a03;
      --badge-muted-bg: #444444;
    }
    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--fg);
      background-color: var(--bg);
      margin: 0;
      padding: 12px;
      box-sizing: border-box;
    }
    .header {
      font-size: 15px;
      font-weight: 600;
      margin-bottom: 12px;
      padding-bottom: 6px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .section {
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
    }
    .section-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      opacity: 0.75;
      margin-bottom: 8px;
    }
    .profile-card {
      background: var(--vscode-editor-background, #252526);
      padding: 10px;
      border-radius: 4px;
      margin-bottom: 8px;
    }
    .profile-header {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 600;
      font-size: 14px;
    }
    .status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #2ea44f;
      display: inline-block;
    }
    .profile-sub {
      font-size: 11px;
      opacity: 0.8;
      margin-top: 4px;
    }
    .badge {
      display: inline-block;
      padding: 3px 6px;
      border-radius: 3px;
      font-size: 11px;
      margin-top: 6px;
      color: #ffffff;
    }
    .badge-success { background: var(--badge-success-bg); }
    .badge-warning { background: var(--badge-warning-bg); }
    .badge-muted { background: var(--badge-muted-bg); }
    .btn {
      background: var(--btn-bg);
      color: var(--btn-fg);
      border: none;
      padding: 6px 12px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      width: 100%;
      box-sizing: border-box;
      margin-top: 6px;
      display: block;
      text-align: center;
    }
    .btn:hover { background: var(--btn-hover); }
    .btn-secondary {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--fg);
    }
    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.08);
    }
    .btn-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      margin-top: 8px;
    }
    .stats-row {
      display: flex;
      gap: 12px;
      margin: 8px 0;
      font-size: 12px;
    }
    .stat-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .stat-val { font-weight: 600; }
  </style>
</head>
<body>
  <div class="header">
    <span>GitAxis Control Center</span>
    <button class="btn btn-secondary" style="width: auto; padding: 2px 8px; margin: 0;" onclick="sendCmd('refresh')">↻</button>
  </div>

  <!-- PROFILE SECTION -->
  <div class="section">
    <div class="section-title">PROFILE</div>
    <div class="profile-card">
      <div class="profile-header">
        <span class="status-dot"></span>
        <span>${profileName}</span>
        <span style="font-size: 11px; opacity: 0.7;">${profileUser}</span>
      </div>
      <div class="profile-sub">${profileEmail}</div>
      ${profile ? `<div class="profile-sub">Auth: ${profile.authentication.type} · Scope: ${profile.git.scope}</div>` : ''}
    </div>
    <div class="btn-grid">
      <button class="btn" onclick="sendCmd('switchProfile')">Switch Profile</button>
      <button class="btn btn-secondary" onclick="sendCmd('createProfile')">+ New</button>
    </div>
  </div>

  <!-- REPOSITORY SECTION -->
  <div class="section">
    <div class="section-title">REPOSITORY</div>
    <div style="font-weight: 600; font-size: 13px;">${repoName}</div>
    <div style="font-size: 12px; opacity: 0.8; margin-top: 2px;">Branch: <strong>${currentBranch}</strong></div>
    ${matchBadge}
    ${
      match && match.confidence !== 'none' && match.recommendedProfileId !== profile?.id
        ? `<button class="btn btn-secondary" style="margin-top: 6px;" onclick="sendCmd('useRecommended')">Switch to Suggested</button>`
        : ''
    }
  </div>

  <!-- CHANGES SECTION -->
  <div class="section">
    <div class="section-title">CHANGES</div>
    <div class="stats-row">
      <div class="stat-item"><span class="stat-val">${status.staged}</span> staged</div>
      <div class="stat-item"><span class="stat-val">${status.modified}</span> modified</div>
      <div class="stat-item"><span class="stat-val">${status.untracked}</span> untracked</div>
    </div>
    ${
      status.ahead > 0 || status.behind > 0
        ? `<div class="stats-row" style="margin-top: 4px;">
            <div class="stat-item">↑ <span class="stat-val">${status.ahead}</span> ahead</div>
            <div class="stat-item">↓ <span class="stat-val">${status.behind}</span> behind</div>
          </div>`
        : ''
    }
  </div>

  <!-- ACTIONS SECTION -->
  <div class="section">
    <div class="section-title">GIT ACTIONS</div>
    <div class="btn-grid">
      <button class="btn btn-secondary" onclick="sendCmd('commit')">Commit</button>
      <button class="btn btn-secondary" onclick="sendCmd('pull')">Pull</button>
      <button class="btn btn-secondary" onclick="sendCmd('push')">Push</button>
      <button class="btn btn-secondary" onclick="sendCmd('fetch')">Fetch</button>
    </div>
    <div class="btn-grid" style="margin-top: 6px;">
      <button class="btn btn-secondary" onclick="sendCmd('createBranch')">Branch</button>
      <button class="btn btn-secondary" onclick="sendCmd('merge')">Merge</button>
      <button class="btn btn-secondary" onclick="sendCmd('rebase')">Rebase</button>
      <button class="btn btn-secondary" onclick="sendCmd('stash')">Stash</button>
    </div>
    <div class="btn-grid" style="margin-top: 6px;">
      <button class="btn btn-secondary" onclick="sendCmd('history')">History</button>
      <button class="btn btn-secondary" onclick="sendCmd('tag')">Tags</button>
      <button class="btn btn-secondary" onclick="sendCmd('manageRemote')">Remote</button>
      <button class="btn btn-secondary" onclick="sendCmd('diff')">Diff</button>
    </div>
    <div class="btn-grid" style="margin-top: 6px;">
      <button class="btn btn-secondary" onclick="sendCmd('status')">Status</button>
      <button class="btn btn-secondary" onclick="sendCmd('reset')">Reset</button>
    </div>
  </div>

  <!-- GITHUB SECTION -->
  <div class="section">
    <div class="section-title">GITHUB</div>
    <div class="btn-grid">
      <button class="btn btn-secondary" onclick="sendCmd('openGitHubRepo')">Repository</button>
      <button class="btn btn-secondary" onclick="sendCmd('createIssue')">Issues</button>
      <button class="btn btn-secondary" onclick="sendCmd('createPullRequest')">Pull Requests</button>
      <button class="btn btn-secondary" onclick="sendCmd('actions')">Actions</button>
    </div>
    <div class="btn-grid" style="margin-top: 6px;">
      <button class="btn btn-secondary" onclick="sendCmd('releases')">Releases</button>
      <button class="btn btn-secondary" onclick="sendCmd('scanAccounts')">Scan Accounts</button>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    function sendCmd(cmd) {
      vscode.postMessage({ command: cmd });
    }
  </script>
</body>
</html>`;
  }
}
