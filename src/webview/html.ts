import { GitProfile, GitRepository, ProfileMatchResult } from '../contracts';

export interface DiscoveredAccount {
  name: string;
  git: {
    name: string;
    email: string;
    scope?: 'local' | 'global';
  };
  github?: {
    host?: string;
    username: string;
  };
  authentication?: {
    type: string;
    source?: string;
  };
  description?: string;
  source?: string;
}

export interface WebviewState {
  profile?: GitProfile;
  repository?: GitRepository;
  matchResult?: ProfileMatchResult;
  profiles: GitProfile[];
  repoUrl?: string;
  linkedProfileId?: string;
  discoveredAccounts?: DiscoveredAccount[];
  scanPerformed?: boolean;
}

function escapeHtml(str?: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeJs(str?: string): string {
  if (!str) return '';
  return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
}

function escapeJsAttr(str?: string): string {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export class HtmlBuilder {
  public static render(state: WebviewState, cspSource?: string): string {
    const profile = state.profile;
    const repo = state.repository;
    const match = state.matchResult;
    const profiles = state.profiles || [];
    const discovered = state.discoveredAccounts || [];
    const linkedProfileId = state.linkedProfileId;
    const repoUrl = state.repoUrl;

    const baseCsp = cspSource || "'self'";
    const fullCsp = `${baseCsp} 'unsafe-inline'`;

    const hasGithub = Boolean(profile?.github?.username);
    const profileName = profile ? escapeHtml(profile.name) : 'No Active Profile';
    const profileEmail = profile ? escapeHtml(profile.git.email) : 'Select or create a profile to get started';
    const profileAuthor = profile ? escapeHtml(profile.git.name) : '';
    const profileUser = hasGithub ? `@${escapeHtml(profile!.github!.username)}` : 'None';
    const profileHost = profile?.github?.host || 'github.com';

    let activeLinkedText = 'global fallback';
    if (repo) {
      if (linkedProfileId && profile && linkedProfileId === profile.id) {
        activeLinkedText = `current repo (${escapeHtml(repo.name)})`;
      } else if (linkedProfileId) {
        const linkedProf = profiles.find(p => p.id === linkedProfileId);
        activeLinkedText = `other (${escapeHtml(linkedProf?.name || 'linked')}) [global fallback]`;
      } else {
        activeLinkedText = `current repo not linked [global fallback]`;
      }
    } else {
      activeLinkedText = 'no repository opened';
    }

    const repoName = repo ? escapeHtml(repo.name) : 'No Repository Opened';
    const currentBranch = repo?.currentBranch ? escapeHtml(repo.currentBranch) : '—';

    const isMatch = match && match.confidence !== 'none' && match.recommendedProfileId === profile?.id;
    const matchBadge = isMatch
      ? `<span class="badge badge-success">✓ Profile matches remote</span>`
      : match && match.confidence !== 'none' && match.recommendedProfileId !== profile?.id
      ? `<span class="badge badge-warning">⚠ Profile mismatch (Suggested: ${escapeHtml(
          profiles.find(p => p.id === match.recommendedProfileId)?.name || 'other'
        )})</span>`
      : `<span class="badge badge-muted">No remote match detected</span>`;

    const profilesJson = JSON.stringify(profiles).replace(/</g, '\\u003c');
    const discoveredJson = JSON.stringify(discovered).replace(/</g, '\\u003c');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src ${fullCsp}; style-src ${fullCsp}; script-src ${fullCsp};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GitAxis Control Center</title>
  <style>
    :root {
      --bg: var(--vscode-sideBar-background, #1e1e1e);
      --fg: var(--vscode-sideBar-foreground, #cccccc);
      --card-bg: var(--vscode-editor-background, #252526);
      --btn-bg: var(--vscode-button-background, #0e639c);
      --btn-fg: var(--vscode-button-foreground, #ffffff);
      --btn-hover: var(--vscode-button-hoverBackground, #1177bb);
      --btn-sec-bg: var(--vscode-button-secondaryBackground, #3a3d41);
      --btn-sec-fg: var(--vscode-button-secondaryForeground, #ffffff);
      --btn-sec-hover: var(--vscode-button-secondaryHoverBackground, #45494e);
      --btn-danger-bg: #8b0000;
      --btn-danger-hover: #a50000;
      --input-bg: var(--vscode-input-background, #3c3c3c);
      --input-fg: var(--vscode-input-foreground, #cccccc);
      --input-border: var(--vscode-input-border, #3c3c3c);
      --border: var(--vscode-sideBarSectionHeader-border, rgba(255, 255, 255, 0.1));
      --focus-border: var(--vscode-focusBorder, #007acc);
      --badge-success-bg: #238636;
      --badge-warning-bg: #9e6a03;
      --badge-info-bg: #1f6feb;
      --badge-muted-bg: #444444;
      --error-fg: var(--vscode-errorForeground, #f48771);
    }
    * {
      box-sizing: border-box;
    }
    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--fg);
      background-color: var(--bg);
      margin: 0;
      padding: 12px;
    }
    .header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      padding-bottom: 6px;
      border-bottom: 1px solid var(--border);
    }
    .header-title {
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.3px;
    }
    .icon-btn-round {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--fg);
      border-radius: 3px;
      cursor: pointer;
      padding: 2px 7px;
      font-size: 12px;
    }
    .icon-btn-round:hover {
      background: rgba(255, 255, 255, 0.1);
    }
    .section {
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
    }
    .section-title-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .section-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      opacity: 0.8;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 5px;
      padding: 10px;
      margin-bottom: 8px;
    }
    .status-dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      display: inline-block;
      flex-shrink: 0;
    }
    .dot-active { background: #2ea44f; }
    .dot-inactive { background: #6e7681; }
    .profile-card-header {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 600;
      font-size: 13px;
    }
    .profile-name {
      font-size: 13px;
      font-weight: 600;
    }
    .badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: 600;
      color: #ffffff;
      line-height: 1.2;
    }
    .badge-success { background: var(--badge-success-bg); }
    .badge-warning { background: var(--badge-warning-bg); }
    .badge-info { background: var(--badge-info-bg); }
    .badge-muted { background: var(--badge-muted-bg); }
    .profile-meta {
      font-size: 11px;
      opacity: 0.88;
      margin-top: 5px;
      line-height: 1.4;
    }
    .meta-sub {
      opacity: 0.7;
      font-size: 10px;
      margin-top: 2px;
    }
    .repo-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 5px;
      padding: 10px;
      margin-top: 6px;
    }
    .repo-header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 6px;
    }
    .repo-name {
      font-weight: 600;
      font-size: 12px;
      word-break: break-all;
    }
    .btn-link {
      background: transparent;
      border: none;
      color: var(--vscode-textLink-foreground, #3794ff);
      cursor: pointer;
      font-size: 11px;
      padding: 0;
      text-decoration: underline;
      display: inline-flex;
      align-items: center;
      gap: 3px;
      white-space: nowrap;
    }
    .btn-link:hover {
      color: var(--vscode-textLink-activeForeground, #3794ff);
    }
    .btn {
      background: var(--btn-bg);
      color: var(--btn-fg);
      border: none;
      padding: 5px 10px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      text-align: center;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .btn:hover { background: var(--btn-hover); }
    .btn-block { width: 100%; }
    .btn-secondary {
      background: var(--btn-sec-bg);
      color: var(--btn-sec-fg);
      border: 1px solid var(--border);
    }
    .btn-secondary:hover { background: var(--btn-sec-hover); }
    .btn-danger {
      background: transparent;
      color: var(--error-fg);
      border: 1px solid rgba(244, 135, 113, 0.4);
    }
    .btn-danger:hover {
      background: var(--btn-danger-bg);
      color: #ffffff;
    }
    .btn-sm {
      padding: 3px 7px;
      font-size: 11px;
    }
    .btn-xs {
      background: var(--btn-sec-bg);
      color: var(--btn-sec-fg);
      border: 1px solid var(--border);
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 11px;
      cursor: pointer;
    }
    .btn-xs:hover { background: var(--btn-sec-hover); }
    .btn-scan {
      width: 100%;
      background: var(--btn-sec-bg);
      color: var(--btn-sec-fg);
      border: 1px dashed var(--vscode-focusBorder, #007acc);
      padding: 7px 10px;
      font-weight: 600;
      cursor: pointer;
      border-radius: 4px;
      margin-bottom: 6px;
    }
    .btn-scan:hover {
      background: var(--btn-sec-hover);
    }
    .card-btn-row {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      margin-top: 8px;
    }
    .scan-hint {
      font-size: 11px;
      opacity: 0.7;
      margin-top: 4px;
      line-height: 1.3;
    }
    .discovered-list {
      margin-top: 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .discovered-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-left: 3px solid #007acc;
      border-radius: 4px;
      padding: 8px;
    }
    .discovered-title {
      font-size: 12px;
      font-weight: 600;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .source-tag {
      font-size: 9px;
      opacity: 0.7;
      background: rgba(255, 255, 255, 0.1);
      padding: 1px 4px;
      border-radius: 2px;
      text-transform: uppercase;
    }
    .discovered-detail {
      font-size: 11px;
      opacity: 0.8;
      margin-top: 2px;
    }
    .discovered-actions {
      display: flex;
      gap: 6px;
      margin-top: 6px;
    }
    .form-container {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 5px;
      padding: 10px;
      margin-top: 6px;
    }
    .form-group {
      margin-bottom: 9px;
    }
    .form-label {
      display: block;
      font-size: 11px;
      font-weight: 600;
      margin-bottom: 3px;
      opacity: 0.9;
    }
    .required {
      color: var(--error-fg);
    }
    .optional {
      font-weight: 400;
      opacity: 0.6;
      font-size: 10px;
    }
    .input-field {
      width: 100%;
      background: var(--input-bg);
      color: var(--input-fg);
      border: 1px solid var(--input-border);
      border-radius: 3px;
      padding: 5px 8px;
      font-size: 12px;
      outline: none;
    }
    .input-field:focus {
      border-color: var(--focus-border);
    }
    .pat-input-wrapper {
      display: flex;
      gap: 4px;
    }
    .btn-toggle {
      flex-shrink: 0;
      padding: 4px 8px;
      font-size: 11px;
    }
    .form-hint {
      font-size: 10px;
      opacity: 0.65;
      margin-top: 3px;
      line-height: 1.25;
    }
    .radio-row {
      display: flex;
      gap: 12px;
      margin-top: 3px;
    }
    .radio-label {
      font-size: 11px;
      display: flex;
      align-items: center;
      gap: 4px;
      cursor: pointer;
    }
    .form-btn-row {
      display: flex;
      gap: 6px;
      margin-top: 12px;
    }
    .form-btn-row .btn {
      flex: 1;
    }
    .form-error-banner {
      background: rgba(244, 135, 113, 0.15);
      border: 1px solid var(--error-fg);
      color: var(--error-fg);
      font-size: 11px;
      padding: 6px 8px;
      border-radius: 3px;
      margin-bottom: 8px;
    }
    .empty-hint {
      font-size: 11px;
      opacity: 0.65;
      font-style: italic;
      padding: 6px 0;
    }
  </style>
</head>
<body>
  <!-- HEADER -->
  <div class="header-bar">
    <span class="header-title">GitAxis Control Center</span>
    <button type="button" class="icon-btn-round" title="Refresh state" onclick="sendCmd('refresh')">↻</button>
  </div>

  <!-- ACTIVE IDENTITY & REPO -->
  <div class="section">
    <div class="section-title">ACTIVE IDENTITY</div>
    <div class="card">
      <div class="profile-card-header">
        <span class="status-dot ${profile ? 'dot-active' : 'dot-inactive'}"></span>
        <span class="profile-name">${profileName}</span>
        ${profile ? `<span class="badge badge-success">Active</span>` : ''}
      </div>
      <div class="profile-meta">
        ${profileAuthor ? `<div>👤 ${profileAuthor} &lt;${profileEmail}&gt;</div>` : `<div>${profileEmail}</div>`}
        <div>🐙 ${profileUser} ${hasGithub ? `<span class="meta-sub">(${escapeHtml(profileHost)})</span>` : ''}</div>
        <div class="meta-sub">📁 Linked to: <strong>${activeLinkedText}</strong></div>
      </div>
    </div>

    <!-- CURRENT REPOSITORY STATUS -->
    <div class="repo-card">
      <div class="repo-header-row">
        <div class="repo-name">📁 CURRENT REPO: <strong>${repoName}</strong></div>
        ${
          repoUrl
            ? `<button type="button" class="btn-link" title="Open repository on GitHub" onclick="openRepoInBrowser('${escapeJsAttr(repoUrl)}')">↗ Open on GitHub</button>`
            : ''
        }
      </div>
      <div style="font-size: 11px; opacity: 0.8; margin-top: 3px;">Branch: <strong>${currentBranch}</strong></div>
      <div style="margin-top: 5px;">${matchBadge}</div>
      ${
        match && match.confidence !== 'none' && match.recommendedProfileId !== profile?.id
          ? `<button type="button" class="btn btn-secondary btn-sm" style="margin-top: 6px; width: 100%;" onclick="sendCmd('useRecommended')">Switch to Suggested Profile</button>`
          : ''
      }
    </div>
  </div>

  <!-- SYSTEM ACCOUNT SCANNER -->
  <div class="section">
    <div class="section-title-bar">
      <span class="section-title">SYSTEM ACCOUNT SCANNER</span>
    </div>
    <button type="button" class="btn-scan" onclick="scanAccounts()">
      🔍 Scan Local Git &amp; GitHub CLI Accounts
    </button>
    ${
      discovered.length > 0
        ? `<div class="discovered-list">
            ${discovered
              .map(
                (acc, idx) => `
              <div class="discovered-card">
                <div class="discovered-title">
                  <span>${escapeHtml(acc.github?.username ? '@' + acc.github.username : acc.name)}</span>
                  <span class="source-tag">${escapeHtml(acc.source || 'detected')}</span>
                </div>
                <div class="discovered-detail">${escapeHtml(acc.git.name)} &lt;${escapeHtml(acc.git.email)}&gt;</div>
                ${acc.github ? `<div class="discovered-detail">Host: ${escapeHtml(acc.github.host)}</div>` : ''}
                <div class="discovered-actions">
                  <button type="button" class="btn btn-sm btn-primary" onclick="importDiscoveredAccount(${idx})">+ Import as Profile</button>
                  <button type="button" class="btn btn-sm btn-secondary" onclick="fillFormWithAccount(${idx})">Fill Form</button>
                </div>
              </div>`
              )
              .join('')}
          </div>`
        : state.scanPerformed
        ? `<div class="scan-hint">Scan completed. All discovered accounts are already in profiles or none were found.</div>`
        : `<div class="scan-hint">1-click scan local Git configurations and GitHub CLI to import accounts seamlessly.</div>`
    }
  </div>

  <!-- PROFILES LIST -->
  <div class="section">
    <div class="section-title-bar">
      <span class="section-title">PROFILES (${profiles.length})</span>
      <button type="button" class="btn-xs" onclick="startNewProfile()">+ Add Profile</button>
    </div>
    ${
      profiles.length === 0
        ? `<div class="empty-hint">No profiles created yet. Use the form below or scan accounts above.</div>`
        : profiles
            .map(p => {
              const isActive = profile?.id === p.id;
              const isLinked = linkedProfileId === p.id;
              const hasRepo = !!repo;
              return `
      <div class="card">
        <div class="profile-card-header">
          <span class="status-dot ${isActive ? 'dot-active' : 'dot-inactive'}"></span>
          <span class="profile-name">${escapeHtml(p.name)}</span>
          ${isActive ? `<span class="badge badge-success">Active</span>` : ''}
          ${isLinked ? `<span class="badge badge-info">Linked</span>` : ''}
        </div>
        <div class="profile-meta">
          <div>Git: ${escapeHtml(p.git.name)} &lt;${escapeHtml(p.git.email)}&gt;</div>
          <div>GitHub: ${p.github?.username ? '@' + escapeHtml(p.github.username) + ` <span class="meta-sub">(${escapeHtml(p.github?.host || 'github.com')})</span>` : '—'}</div>
          <div class="meta-sub">Scope: ${escapeHtml(p.git.scope || 'local')} · Auth: ${escapeHtml(p.authentication.type)}</div>
        </div>
        <div class="card-btn-row">
          ${!isActive ? `<button type="button" class="btn btn-sm" onclick="switchProfile('${escapeJsAttr(p.id)}')">Switch</button>` : ''}
          <button type="button" class="btn btn-sm btn-secondary" onclick="editProfile('${escapeJsAttr(p.id)}')">Edit</button>
          ${
            hasRepo
              ? isLinked
                ? `<button type="button" class="btn btn-sm btn-secondary" onclick="unlinkRepo('${escapeJsAttr(p.id)}')">Unlink</button>`
                : `<button type="button" class="btn btn-sm btn-secondary" onclick="linkRepo('${escapeJsAttr(p.id)}')">Link Repo</button>`
              : ''
          }
          <button type="button" class="btn btn-sm btn-danger" onclick="deleteProfile('${escapeJsAttr(p.id)}')">Delete</button>
        </div>
      </div>`;
            })
            .join('')
    }
  </div>

  <!-- IN-SIDEBAR PERSISTENT PROFILE FORM -->
  <div class="section" id="profile-form-section" style="border-bottom: none;">
    <div class="section-title-bar">
      <span class="section-title" id="form-title">CREATE / EDIT PROFILE</span>
    </div>
    <div class="form-container">
      <div id="form-error-msg" class="form-error-banner" style="display: none;"></div>
      <input type="hidden" id="form-profile-id" value="" />
      
      <div class="form-group">
        <label class="form-label" for="form-name">Profile Name <span class="required">*</span></label>
        <input type="text" id="form-name" class="input-field" placeholder="e.g. work, personal, opensource" autocomplete="off" />
      </div>

      <div class="form-group">
        <label class="form-label" for="form-git-name">Git Author Name <span class="required">*</span></label>
        <input type="text" id="form-git-name" class="input-field" placeholder="e.g. John Doe" autocomplete="off" />
      </div>

      <div class="form-group">
        <label class="form-label" for="form-git-email">Git Email <span class="required">*</span></label>
        <input type="email" id="form-git-email" class="input-field" placeholder="e.g. john@company.com" autocomplete="off" />
      </div>

      <div class="form-group">
        <label class="form-label" for="form-gh-user">GitHub Username <span class="optional">(optional)</span></label>
        <input type="text" id="form-gh-user" class="input-field" placeholder="e.g. john-work" autocomplete="off" />
      </div>

      <div class="form-group">
        <label class="form-label" for="form-host">GitHub Host</label>
        <input type="text" id="form-host" class="input-field" value="github.com" placeholder="github.com" autocomplete="off" />
      </div>

      <div class="form-group">
        <label class="form-label" for="form-pat">Personal Access Token (PAT) <span class="optional">(optional)</span></label>
        <div class="pat-input-wrapper">
          <input type="password" id="form-pat" class="input-field" placeholder="ghp_xxxxxxxxxxxx" autocomplete="off" />
          <button type="button" id="btn-toggle-pat" class="btn btn-secondary btn-toggle" onclick="togglePatVisibility()">👁 Show</button>
        </div>
        <div class="form-hint">Stored securely in VS Code SecretStorage. Inputs are persistent across tab switches.</div>
      </div>

      <div class="form-group">
        <label class="form-label">Identity Scope</label>
        <div class="radio-row">
          <label class="radio-label">
            <input type="radio" name="form-scope" value="local" checked />
            <span>Current Repo (local)</span>
          </label>
          <label class="radio-label">
            <input type="radio" name="form-scope" value="global" />
            <span>Global</span>
          </label>
        </div>
      </div>

      <div class="form-btn-row">
        <button type="button" class="btn btn-primary" id="form-submit-btn" onclick="saveProfileForm()">Save Profile</button>
        <button type="button" class="btn btn-secondary" onclick="cancelProfileForm()">Cancel</button>
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const profilesData = ${profilesJson};
    const discoveredData = ${discoveredJson};

    function sendCmd(cmd, payload) {
      vscode.postMessage({ command: cmd, ...(payload || {}) });
    }

    function showFormError(msg) {
      const errEl = document.getElementById('form-error-msg');
      if (errEl) {
        errEl.innerText = msg;
        errEl.style.display = 'block';
      }
    }

    function hideFormError() {
      const errEl = document.getElementById('form-error-msg');
      if (errEl) {
        errEl.style.display = 'none';
      }
    }

    function saveCurrentFormToState() {
      try {
        const currentState = vscode.getState() || {};
        const scopeEl = document.querySelector('input[name="form-scope"]:checked');
        const formState = {
          id: document.getElementById('form-profile-id')?.value || '',
          name: document.getElementById('form-name')?.value || '',
          gitName: document.getElementById('form-git-name')?.value || '',
          gitEmail: document.getElementById('form-git-email')?.value || '',
          githubUsername: document.getElementById('form-gh-user')?.value || '',
          host: document.getElementById('form-host')?.value || 'github.com',
          pat: document.getElementById('form-pat')?.value || '',
          scope: scopeEl ? scopeEl.value : 'local',
          title: document.getElementById('form-title')?.innerText || 'CREATE / EDIT PROFILE',
          submitBtnText: document.getElementById('form-submit-btn')?.innerText || 'Save Profile',
        };
        vscode.setState({ ...currentState, form: formState });
      } catch (e) {
        console.error('Failed to save form state:', e);
      }
    }

    function restoreFormFromState() {
      try {
        const state = vscode.getState();
        if (!state || !state.form) return;
        const f = state.form;
        if (f.name || f.gitName || f.gitEmail || f.githubUsername || f.pat || f.id) {
          if (document.getElementById('form-profile-id')) document.getElementById('form-profile-id').value = f.id || '';
          if (document.getElementById('form-name')) document.getElementById('form-name').value = f.name || '';
          if (document.getElementById('form-git-name')) document.getElementById('form-git-name').value = f.gitName || '';
          if (document.getElementById('form-git-email')) document.getElementById('form-git-email').value = f.gitEmail || '';
          if (document.getElementById('form-gh-user')) document.getElementById('form-gh-user').value = f.githubUsername || '';
          if (document.getElementById('form-host')) document.getElementById('form-host').value = f.host || 'github.com';
          if (document.getElementById('form-pat')) document.getElementById('form-pat').value = f.pat || '';
          if (f.scope) {
            const radio = document.querySelector('input[name="form-scope"][value="' + f.scope + '"]');
            if (radio) radio.checked = true;
          }
          if (f.title && document.getElementById('form-title')) {
            document.getElementById('form-title').innerText = f.title;
          }
          if (f.submitBtnText && document.getElementById('form-submit-btn')) {
            document.getElementById('form-submit-btn').innerText = f.submitBtnText;
          }
        }
      } catch (e) {
        console.error('Failed to restore form state:', e);
      }
    }

    // Attach listeners for persistent input caching
    ['form-name', 'form-git-name', 'form-git-email', 'form-gh-user', 'form-host', 'form-pat'].forEach(function(id) {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', saveCurrentFormToState);
      }
    });
    document.querySelectorAll('input[name="form-scope"]').forEach(function(el) {
      el.addEventListener('change', saveCurrentFormToState);
    });

    function saveProfileForm() {
      hideFormError();
      const id = (document.getElementById('form-profile-id')?.value || '').trim();
      const name = (document.getElementById('form-name')?.value || '').trim();
      const gitName = (document.getElementById('form-git-name')?.value || '').trim();
      const gitEmail = (document.getElementById('form-git-email')?.value || '').trim();
      const githubUsername = (document.getElementById('form-gh-user')?.value || '').trim();
      const host = (document.getElementById('form-host')?.value || '').trim() || 'github.com';
      const pat = (document.getElementById('form-pat')?.value || '').trim();
      const scopeEl = document.querySelector('input[name="form-scope"]:checked');
      const scope = scopeEl ? scopeEl.value : 'local';

      if (!name) {
        showFormError('Profile Name is required.');
        return;
      }
      if (!gitName) {
        showFormError('Git Author Name is required.');
        return;
      }
      if (!gitEmail || !gitEmail.includes('@')) {
        showFormError('A valid Git Email is required.');
        return;
      }

      const submitBtn = document.getElementById('form-submit-btn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = 'Saving...';
      }

      saveCurrentFormToState();

      if (id) {
        vscode.postMessage({
          command: 'updateProfileFromForm',
          data: { id, name, gitName, gitEmail, githubUsername, host, pat, scope }
        });
      } else {
        vscode.postMessage({
          command: 'createProfileFromForm',
          data: { name, gitName, gitEmail, githubUsername, host, pat, scope }
        });
      }
    }

    function cancelProfileForm() {
      hideFormError();
      if (document.getElementById('form-profile-id')) document.getElementById('form-profile-id').value = '';
      if (document.getElementById('form-name')) document.getElementById('form-name').value = '';
      if (document.getElementById('form-git-name')) document.getElementById('form-git-name').value = '';
      if (document.getElementById('form-git-email')) document.getElementById('form-git-email').value = '';
      if (document.getElementById('form-gh-user')) document.getElementById('form-gh-user').value = '';
      if (document.getElementById('form-host')) document.getElementById('form-host').value = 'github.com';
      if (document.getElementById('form-pat')) document.getElementById('form-pat').value = '';
      const radio = document.querySelector('input[name="form-scope"][value="local"]');
      if (radio) radio.checked = true;
      if (document.getElementById('form-title')) document.getElementById('form-title').innerText = 'CREATE / EDIT PROFILE';
      const submitBtn = document.getElementById('form-submit-btn');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerText = 'Save Profile';
      }
      const currentState = vscode.getState() || {};
      vscode.setState({ ...currentState, form: null });
    }

    function editProfile(id) {
      hideFormError();
      const p = profilesData.find(item => item.id === id);
      if (!p) return;
      if (document.getElementById('form-profile-id')) document.getElementById('form-profile-id').value = p.id;
      if (document.getElementById('form-name')) document.getElementById('form-name').value = p.name;
      if (document.getElementById('form-git-name')) document.getElementById('form-git-name').value = p.git.name;
      if (document.getElementById('form-git-email')) document.getElementById('form-git-email').value = p.git.email;
      if (document.getElementById('form-gh-user')) document.getElementById('form-gh-user').value = p.github?.username || '';
      if (document.getElementById('form-host')) document.getElementById('form-host').value = p.github?.host || 'github.com';
      if (document.getElementById('form-pat')) document.getElementById('form-pat').value = '';
      const scopeVal = p.git.scope || 'local';
      const radio = document.querySelector('input[name="form-scope"][value="' + scopeVal + '"]');
      if (radio) radio.checked = true;

      if (document.getElementById('form-title')) {
        document.getElementById('form-title').innerText = 'EDIT PROFILE: ' + p.name;
      }
      if (document.getElementById('form-submit-btn')) {
        document.getElementById('form-submit-btn').innerText = 'Update Profile';
      }
      saveCurrentFormToState();
      const formEl = document.getElementById('profile-form-section');
      if (formEl) formEl.scrollIntoView({ behavior: 'smooth' });
    }

    function fillFormWithAccount(index) {
      hideFormError();
      const acc = discoveredData[index];
      if (!acc) return;
      if (document.getElementById('form-profile-id')) document.getElementById('form-profile-id').value = '';
      if (document.getElementById('form-name')) document.getElementById('form-name').value = acc.name || '';
      if (document.getElementById('form-git-name')) document.getElementById('form-git-name').value = acc.git?.name || '';
      if (document.getElementById('form-git-email')) document.getElementById('form-git-email').value = acc.git?.email || '';
      if (document.getElementById('form-gh-user')) document.getElementById('form-gh-user').value = acc.github?.username || '';
      if (document.getElementById('form-host')) document.getElementById('form-host').value = acc.github?.host || 'github.com';
      if (document.getElementById('form-pat')) document.getElementById('form-pat').value = '';
      const radio = document.querySelector('input[name="form-scope"][value="local"]');
      if (radio) radio.checked = true;

      if (document.getElementById('form-title')) {
        document.getElementById('form-title').innerText = 'IMPORT PROFILE: ' + (acc.name || 'Account');
      }
      if (document.getElementById('form-submit-btn')) {
        document.getElementById('form-submit-btn').innerText = 'Save Profile';
      }
      saveCurrentFormToState();
      const formEl = document.getElementById('profile-form-section');
      if (formEl) formEl.scrollIntoView({ behavior: 'smooth' });
    }

    function startNewProfile() {
      cancelProfileForm();
      const formEl = document.getElementById('profile-form-section');
      if (formEl) formEl.scrollIntoView({ behavior: 'smooth' });
      const nameInput = document.getElementById('form-name');
      if (nameInput) nameInput.focus();
    }

    function togglePatVisibility() {
      const input = document.getElementById('form-pat');
      const btn = document.getElementById('btn-toggle-pat');
      if (!input || !btn) return;
      if (input.type === 'password') {
        input.type = 'text';
        btn.innerText = '🙈 Hide';
      } else {
        input.type = 'password';
        btn.innerText = '👁 Show';
      }
    }

    function switchProfile(id) {
      vscode.postMessage({ command: 'switchProfile', profileId: id });
    }

    function deleteProfile(id, name) {
      const p = profilesData.find(item => item.id === id);
      const profileName = p ? p.name : (name || '');
      vscode.postMessage({ command: 'deleteProfile', profileId: id, name: profileName });
    }

    function linkRepo(id) {
      vscode.postMessage({ command: 'linkToRepo', profileId: id });
    }

    function unlinkRepo(id) {
      vscode.postMessage({ command: 'unlinkRepo', profileId: id });
    }

    function scanAccounts() {
      vscode.postMessage({ command: 'scanAccounts' });
    }

    function importDiscoveredAccount(index) {
      vscode.postMessage({ command: 'importDiscoveredAccount', index: index });
    }

    function openRepoInBrowser(url) {
      if (url) {
        vscode.postMessage({ command: 'openInBrowser', url: url });
      } else {
        vscode.postMessage({ command: 'openGitHubRepo' });
      }
    }

    // Message listener for extension backend responses
    window.addEventListener('message', function(event) {
      const msg = event.data;
      if (!msg) return;
      if (msg.command === 'saveSuccess') {
        cancelProfileForm();
      } else if (msg.command === 'saveError') {
        const submitBtn = document.getElementById('form-submit-btn');
        if (submitBtn) {
          submitBtn.disabled = false;
          const id = document.getElementById('form-profile-id')?.value;
          submitBtn.innerText = id ? 'Update Profile' : 'Save Profile';
        }
        showFormError(msg.error || 'Failed to save profile.');
      } else if (msg.command === 'profileDeleted') {
        const currentId = document.getElementById('form-profile-id')?.value;
        if (currentId === msg.profileId) {
          cancelProfileForm();
        }
      }
    });

    // Restore any previously typed form fields
    restoreFormFromState();
  </script>
</body>
</html>`;
  }
}
