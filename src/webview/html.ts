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

export interface HtmlRenderOptions {
  cspSource?: string;
  scriptUri?: string;
  styleUri?: string;
  nonce?: string;
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

const Icons = {
  refresh: `<svg class="icon" viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M13.65 2.35A7.958 7.958 0 0 0 8 0a8 8 0 1 0 8 8h-2a6 6 0 1 1-1.76-4.24l-2.24 2.24h6V0l-2.35 2.35z"/></svg>`,
  user: `<svg class="icon icon-muted" viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm2-3a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm4 8c0-2.21-3.58-4-8-4s-8 1.79-8 4v1h16v-1zM2.14 13c.6-1.34 3.02-2 5.86-2 2.84 0 5.26.66 5.86 2H2.14z"/></svg>`,
  github: `<svg class="icon icon-muted" viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path fill-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>`,
  repo: `<svg class="icon icon-muted" viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path fill-rule="evenodd" d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5v-9zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8V1.5z"/></svg>`,
  search: `<svg class="icon" viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path fill-rule="evenodd" d="M11.5 7a4.499 4.499 0 1 1-8.998 0A4.499 4.499 0 0 1 11.5 7zm-.82 4.74a6 6 0 1 1 1.06-1.06l3.04 3.04a.75.75 0 1 1-1.06 1.06l-3.04-3.04z"/></svg>`,
  externalLink: `<svg class="icon" viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path fill-rule="evenodd" d="M10.75 1a.75.75 0 0 0 0 1.5h2.44L6.97 8.72a.75.75 0 1 0 1.06 1.06L14.25 3.56v2.44a.75.75 0 0 0 1.5 0V1.75A.75.75 0 0 0 15 1h-4.25zm-8 2A1.75 1.75 0 0 0 1 4.75v9.5c0 .966.784 1.75 1.75 1.75h9.5A1.75 1.75 0 0 0 14 14.25v-4.5a.75.75 0 0 0-1.5 0v4.5a.25.25 0 0 1-.25.25h-9.5a.25.25 0 0 1-.25-.25v-9.5a.25.25 0 0 1 .25-.25h4.5a.75.75 0 0 0 0-1.5h-4.5z"/></svg>`,
  link: `<svg class="icon icon-muted" viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path fill-rule="evenodd" d="M7.775 3.275a.75.75 0 0 0 1.06 1.06l1.25-1.25a2 2 0 1 1 2.83 2.83l-2.5 2.5a2 2 0 0 1-2.83 0 .75.75 0 0 0-1.06 1.06 3.5 3.5 0 0 0 4.95 0l2.5-2.5a3.5 3.5 0 0 0-4.95-4.95l-1.25 1.25zm-.69 9.45a.75.75 0 0 0-1.06-1.06l-1.25 1.25a2 2 0 0 1-2.83-2.83l2.5-2.5a2 2 0 0 1 2.83 0 .75.75 0 0 0 1.06-1.06 3.5 3.5 0 0 0-4.95 0l-2.5 2.5a3.5 3.5 0 0 0 4.95 4.95l1.25-1.25z"/></svg>`,
  branch: `<svg class="icon icon-muted" viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path fill-rule="evenodd" d="M11.75 2.5a1.75 1.75 0 1 0-3.5 0 1.75 1.75 0 0 0 3.5 0zm-6 4a1.75 1.75 0 1 0-3.5 0 1.75 1.75 0 0 0 3.5 0zM8 4.25a2.25 2.25 0 0 1-2.25 2.25v3a2.25 2.25 0 1 1-1.5 0v-3A3.75 3.75 0 0 1 8 2.75v1.5zm3.75 5.5a1.75 1.75 0 1 0-3.5 0 1.75 1.75 0 0 0 3.5 0z"/></svg>`,
  check: `<svg class="icon" viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path fill-rule="evenodd" d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/></svg>`,
  alert: `<svg class="icon" viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path fill-rule="evenodd" d="M8.22 1.754a.75.75 0 0 0-1.44 0L.37 13.5a.75.75 0 0 0 .65 1.1h13.96a.75.75 0 0 0 .65-1.1L8.22 1.754zM8 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 5zm0 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/></svg>`,
  plus: `<svg class="icon" viewBox="0 0 16 16" width="11" height="11" fill="currentColor"><path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2z"/></svg>`,
  eye: `<svg class="icon" viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path fill-rule="evenodd" d="M8 2c-4 0-7 4-7 6s3 6 7 6 7-4 7-6-3-6-7-6zm0 10a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-6.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"/></svg>`,
  eyeOff: `<svg class="icon" viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path fill-rule="evenodd" d="M2.22 2.22a.75.75 0 0 1 1.06 0l10.5 10.5a.75.75 0 1 1-1.06 1.06L11.5 10.57A6.974 6.974 0 0 1 8 12c-4 0-7-4-7-6a7.7 7.7 0 0 1 2.37-3.69L2.22 3.28a.75.75 0 0 1 0-1.06zM8 3.5c1.47 0 2.81.47 3.93 1.28l-1.45 1.45A3.977 3.977 0 0 0 8 5.5a2.5 2.5 0 0 0-2.5 2.5c0 .36.08.71.22 1.02L4.2 10.54A7.77 7.77 0 0 1 1 6c0-1.5 2.5-4.5 7-4.5zm0 4a1.5 1.5 0 0 1 1.5 1.5l-2.03-.53c.12-.55.5-1 1-1.07l-.47.1z"/></svg>`,
};

export class HtmlBuilder {
  public static render(
    state: WebviewState,
    cspSourceOrOptions?: string | HtmlRenderOptions,
    scriptUriParam?: string,
    styleUriParam?: string,
    nonceParam?: string
  ): string {
    const profile = state.profile;
    const repo = state.repository;
    const match = state.matchResult;
    const profiles = state.profiles || [];
    const discovered = state.discoveredAccounts || [];
    const repoUrl = state.repoUrl;

    let cspSource = "'self'";
    let scriptUri = 'media/main.js';
    let styleUri = 'media/main.css';
    let nonce = nonceParam || 'gitaxis-nonce-secure';

    if (typeof cspSourceOrOptions === 'string') {
      cspSource = cspSourceOrOptions;
      if (scriptUriParam) scriptUri = scriptUriParam;
      if (styleUriParam) styleUri = styleUriParam;
    } else if (cspSourceOrOptions && typeof cspSourceOrOptions === 'object') {
      if (cspSourceOrOptions.cspSource) cspSource = cspSourceOrOptions.cspSource;
      if (cspSourceOrOptions.scriptUri) scriptUri = cspSourceOrOptions.scriptUri;
      if (cspSourceOrOptions.styleUri) styleUri = cspSourceOrOptions.styleUri;
      if (cspSourceOrOptions.nonce) nonce = cspSourceOrOptions.nonce;
    }

    const hasGithub = Boolean(profile?.github?.username);
    const profileName = profile ? escapeHtml(profile.name) : 'No Active Profile';
    const profileEmail = profile ? escapeHtml(profile.git.email) : 'Select or create a profile to get started';
    const profileAuthor = profile ? escapeHtml(profile.git.name) : '';
    const profileUser = hasGithub ? `@${escapeHtml(profile!.github!.username)}` : 'None';
    const profileHost = profile?.github?.host || 'github.com';

    const repoName = repo ? escapeHtml(repo.name) : 'No Repository Opened';
    const currentBranch = repo?.currentBranch ? escapeHtml(repo.currentBranch) : '—';

    const isMatch = match && match.confidence !== 'none' && match.recommendedProfileId === profile?.id;
    const matchBadge = isMatch
      ? `<span class="badge badge-success">${Icons.check} Matches remote</span>`
      : match && match.confidence !== 'none' && match.recommendedProfileId !== profile?.id
      ? `<span class="badge badge-warning">${Icons.alert} Mismatch (Suggested: ${escapeHtml(
          profiles.find(p => p.id === match.recommendedProfileId)?.name || 'other'
        )})</span>`
      : `<span class="badge badge-muted">No remote match detected</span>`;

    // Ensure profiles data NEVER contains raw secrets before serializing
    const sanitizedProfiles = profiles.map(p => ({
      ...p,
      authentication: {
        type: p.authentication.type,
        source: p.authentication.source,
        sshKeyPath: p.authentication.sshKeyPath,
      },
    }));

    const profilesJson = JSON.stringify(sanitizedProfiles).replace(/</g, '\\u003c');
    const discoveredJson = JSON.stringify(discovered).replace(/</g, '\\u003c');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}'; img-src ${cspSource} https: data:; font-src ${cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GitAxis Control Center</title>
  <link rel="stylesheet" href="${escapeHtml(styleUri)}" nonce="${nonce}">
</head>
<body>
  <!-- HEADER -->
  <div class="header-bar">
    <div class="brand-title">
      <span>GitAxis Control Center</span>
      <span class="brand-pill">v0.5.0</span>
    </div>
    <button type="button" class="icon-btn-ghost" title="Refresh state" data-action="refresh">
      ${Icons.refresh}
    </button>
  </div>

  <!-- ACTIVE IDENTITY & REPO -->
  <div class="section">
    <div class="section-title">ACTIVE IDENTITY</div>
    <div class="card card-active-identity">
      <div class="card-header-row">
        <div class="card-title-group">
          <span class="status-dot ${profile ? 'dot-active' : 'dot-inactive'}"></span>
          <span>${profileName}</span>
        </div>
        <div>
          ${profile ? `<span class="badge badge-success">Active</span>` : ''}
          ${state.linkedProfileId && profile && state.linkedProfileId === profile.id ? `<span class="badge badge-info">Bound to repo</span>` : ''}
        </div>
      </div>
      <div class="meta-list">
        <div class="meta-item">
          ${Icons.user}
          <span>${profileAuthor ? `${profileAuthor} <span class="sub">&lt;${profileEmail}&gt;</span>` : profileEmail}</span>
        </div>
        <div class="meta-item">
          ${Icons.github}
          <span>GitHub: <strong>${profileUser}</strong> ${hasGithub ? `<span class="sub">(${escapeHtml(profileHost)})</span>` : ''}</span>
        </div>
      </div>
    </div>

    <!-- CURRENT REPOSITORY STATUS -->
    <div class="repo-box">
      <div class="repo-main-row">
        <div class="repo-title-wrapper">
          ${Icons.repo}
          <span>CURRENT REPO: <strong>${repoName}</strong></span>
        </div>
        ${
          repoUrl
            ? `<button type="button" class="btn-link-action" title="Open repository on GitHub" data-action="openRepo" data-url="${escapeHtml(repoUrl)}">
                <span>Open on GitHub</span>
                ${Icons.externalLink}
              </button>`
            : ''
        }
      </div>
      <div class="branch-row">
        ${Icons.branch}
        <span>Branch: <strong>${currentBranch}</strong></span>
      </div>
      <div class="match-badge-wrap">${matchBadge}</div>
      ${
        match && match.confidence !== 'none' && match.recommendedProfileId !== profile?.id
          ? `<button type="button" class="btn btn-secondary btn-sm switch-suggested-btn" data-action="useRecommended">Switch to Suggested Profile</button>`
          : ''
      }
    </div>
  </div>

  <!-- SYSTEM ACCOUNT SCANNER -->
  <div class="section">
    <div class="section-title-row">
      <span class="section-title">SYSTEM ACCOUNT SCANNER</span>
    </div>
    <button type="button" class="btn-scan-bar" data-action="scanAccounts">
      ${Icons.search}
      <span>Scan Local Git &amp; GitHub CLI Accounts</span>
    </button>
    ${
      discovered.length > 0
        ? `<div class="discovered-deck">
            ${discovered
              .map(
                (acc, idx) => `
              <div class="discovered-item">
                <div class="discovered-header">
                  <span>${escapeHtml(acc.github?.username ? '@' + acc.github.username : acc.name)}</span>
                  <span class="source-tag">${escapeHtml(acc.source || 'detected')}</span>
                </div>
                <div class="hint-text">${escapeHtml(acc.git.name)} &lt;${escapeHtml(acc.git.email)}&gt;</div>
                ${acc.github ? `<div class="hint-text">Host: ${escapeHtml(acc.github.host)}</div>` : ''}
                <div class="btn-group">
                  <button type="button" class="btn btn-sm" data-action="importDiscoveredAccount" data-index="${idx}">+ Import as Profile</button>
                  <button type="button" class="btn btn-sm btn-secondary" data-action="fillForm" data-index="${idx}">Fill Form</button>
                </div>
              </div>`
              )
              .join('')}
          </div>`
        : state.scanPerformed
        ? `<div class="hint-text">Scan completed. All discovered accounts are already in profiles or none were found.</div>`
        : `<div class="hint-text">1-click scan local Git configurations and GitHub CLI to import accounts seamlessly.</div>`
    }
  </div>

  <!-- PROFILES LIST -->
  <div class="section">
    <div class="section-title-row">
      <span class="section-title">PROFILES (${profiles.length})</span>
      <button type="button" class="btn-xs" data-action="startNewProfile">
        ${Icons.plus} Add Profile
      </button>
    </div>
    ${
      profiles.length === 0
        ? `<div class="hint-text">No profiles created yet. Use the form below or scan accounts above.</div>`
        : profiles
            .map(p => {
              const isActive = profile?.id === p.id;
              const authText = p.authentication.type === 'pat' ? 'PAT (token saved)' : p.authentication.type;
              return `
      <div class="card ${isActive ? 'card-active-identity' : ''}">
        <div class="card-header-row">
          <div class="card-title-group">
            <span class="status-dot ${isActive ? 'dot-active' : 'dot-inactive'}"></span>
            <span>${escapeHtml(p.name)}</span>
          </div>
          <div>
            ${isActive ? `<span class="badge badge-success">Active</span>` : ''}
          </div>
        </div>
        <div class="meta-list">
          <div class="meta-item">
            ${Icons.user}
            <span>${escapeHtml(p.git.name)} <span class="sub">&lt;${escapeHtml(p.git.email)}&gt;</span></span>
          </div>
          <div class="meta-item">
            ${Icons.github}
            <span>GitHub: <strong>${p.github?.username ? '@' + escapeHtml(p.github.username) : 'None'}</strong> ${p.github?.username ? `<span class="sub">(${escapeHtml(p.github?.host || 'github.com')})</span>` : ''}</span>
          </div>
          <div class="meta-item">
            ${Icons.link}
            <span class="sub">Scope: ${escapeHtml(p.git.scope || 'local')} · Auth: ${escapeHtml(authText)}</span>
          </div>
        </div>
        <div class="verify-result-box hidden" id="verify-result-${escapeHtml(p.id)}"></div>
        <div class="btn-group">
          ${!isActive ? `<button type="button" class="btn btn-sm" data-action="switchProfile" data-profile-id="${escapeHtml(p.id)}">Switch</button>` : ''}
          <button type="button" class="btn btn-sm btn-secondary" data-action="verifyProfile" data-profile-id="${escapeHtml(p.id)}">Verify</button>
          <button type="button" class="btn btn-sm btn-secondary" data-action="editProfile" data-profile-id="${escapeHtml(p.id)}">Edit</button>
          <button type="button" class="btn btn-sm btn-danger" data-action="deleteProfile" data-profile-id="${escapeHtml(p.id)}">Delete</button>
        </div>
      </div>`;
            })
            .join('')
    }
  </div>

  <!-- IN-SIDEBAR PERSISTENT PROFILE FORM -->
  <div class="section form-section-noborder" id="profile-form-section">
    <div class="section-title-row">
      <span class="section-title" id="form-title">CREATE / EDIT PROFILE</span>
    </div>
    <div class="form-box">
      <div id="form-error-msg" class="banner-error hidden"></div>
      <input type="hidden" id="form-profile-id" value="" />
      
      <div class="form-group">
        <label class="form-label" for="form-name">Profile Name <span class="req">*</span></label>
        <input type="text" id="form-name" class="input-text" placeholder="e.g. work, personal, opensource" autocomplete="off" />
      </div>

      <div class="form-group">
        <label class="form-label" for="form-git-name">Git Author Name <span class="req">*</span></label>
        <input type="text" id="form-git-name" class="input-text" placeholder="e.g. John Doe" autocomplete="off" />
      </div>

      <div class="form-group">
        <label class="form-label" for="form-git-email">Git Email <span class="req">*</span></label>
        <input type="email" id="form-git-email" class="input-text" placeholder="e.g. john@company.com" autocomplete="off" />
      </div>

      <div class="form-group">
        <label class="form-label" for="form-gh-user">GitHub Username <span class="opt">(optional)</span></label>
        <input type="text" id="form-gh-user" class="input-text" placeholder="e.g. john-work" autocomplete="off" />
      </div>

      <div class="form-group">
        <label class="form-label" for="form-host">GitHub Host</label>
        <input type="text" id="form-host" class="input-text" value="github.com" placeholder="github.com" autocomplete="off" />
      </div>

      <div class="form-group">
        <label class="form-label" for="form-orgs">Allowed Orgs / Owner Patterns <span class="opt">(optional, comma-separated)</span></label>
        <input type="text" id="form-orgs" class="input-text" placeholder="e.g. acme-corp, my-org, corp-*" autocomplete="off" />
      </div>

      <div class="form-group">
        <label class="form-label" for="form-pat">Personal Access Token (PAT) <span class="opt">(optional)</span></label>
        <div class="pat-row">
          <input type="password" id="form-pat" class="input-text" placeholder="ghp_xxxxxxxxxxxx" autocomplete="off" />
          <button type="button" id="btn-toggle-pat" class="btn btn-secondary btn-sm" data-action="togglePat">Show</button>
        </div>
        <div class="hint-text pat-hint">Stored securely in VS Code SecretStorage. Inputs are persistent across tab switches.</div>
      </div>

      <div class="form-group">
        <label class="form-label">Identity Scope</label>
        <div class="radio-deck">
          <label class="radio-item">
            <input type="radio" name="form-scope" value="local" checked />
            <span>Current Repo (local)</span>
          </label>
          <label class="radio-item">
            <input type="radio" name="form-scope" value="global" />
            <span>Global</span>
          </label>
        </div>
      </div>

      <div class="form-actions-row">
        <button type="button" class="btn" id="form-submit-btn" data-action="saveProfileForm">Save Profile</button>
        <button type="button" class="btn btn-secondary" data-action="cancelProfileForm">Cancel</button>
      </div>
    </div>
  </div>

  <script id="gitaxis-profiles" type="application/json" nonce="${nonce}">${profilesJson}</script>
  <script id="gitaxis-discovered" type="application/json" nonce="${nonce}">${discoveredJson}</script>
  <script nonce="${nonce}" src="${escapeHtml(scriptUri)}"></script>
</body>
</html>`;
  }
}
