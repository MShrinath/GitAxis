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
      --bg: var(--vscode-sideBar-background, #181818);
      --fg: var(--vscode-sideBar-foreground, #cccccc);
      --card-bg: var(--vscode-editor-background, #1f1f1f);
      --card-border: var(--vscode-widget-border, rgba(255, 255, 255, 0.08));
      --btn-bg: var(--vscode-button-background, #0078d4);
      --btn-fg: var(--vscode-button-foreground, #ffffff);
      --btn-hover: var(--vscode-button-hoverBackground, #026ec1);
      --btn-sec-bg: var(--vscode-button-secondaryBackground, rgba(255, 255, 255, 0.08));
      --btn-sec-fg: var(--vscode-button-secondaryForeground, #cccccc);
      --btn-sec-hover: var(--vscode-button-secondaryHoverBackground, rgba(255, 255, 255, 0.14));
      --input-bg: var(--vscode-input-background, #2a2a2a);
      --input-fg: var(--vscode-input-foreground, #cccccc);
      --input-border: var(--vscode-input-border, rgba(255, 255, 255, 0.12));
      --focus-border: var(--vscode-focusBorder, #0078d4);
      --badge-success-bg: rgba(46, 164, 79, 0.2);
      --badge-success-fg: var(--vscode-gitDecoration-addedResourceForeground, #4ec9b0);
      --badge-warning-bg: rgba(210, 153, 34, 0.2);
      --badge-warning-fg: var(--vscode-gitDecoration-modifiedResourceForeground, #cca700);
      --badge-info-bg: rgba(56, 139, 253, 0.18);
      --badge-info-fg: var(--vscode-textLink-foreground, #4daafc);
      --badge-muted-bg: rgba(255, 255, 255, 0.06);
      --badge-muted-fg: var(--vscode-descriptionForeground, #888888);
      --error-fg: var(--vscode-errorForeground, #f48771);
      --subtext: var(--vscode-descriptionForeground, #999999);
    }
    * {
      box-sizing: border-box;
    }
    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      font-size: var(--vscode-font-size, 12px);
      color: var(--fg);
      background-color: var(--bg);
      margin: 0;
      padding: 10px 12px 24px;
      line-height: 1.45;
    }
    .header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--card-border);
    }
    .brand-title {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      color: var(--fg);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .brand-pill {
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.3px;
      padding: 1px 5px;
      border-radius: 10px;
      background: var(--badge-info-bg);
      color: var(--badge-info-fg);
      text-transform: uppercase;
    }
    .icon-btn-ghost {
      background: transparent;
      border: 1px solid transparent;
      color: var(--subtext);
      border-radius: 4px;
      cursor: pointer;
      padding: 3px 6px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
    }
    .icon-btn-ghost:hover {
      background: var(--btn-sec-bg);
      color: var(--fg);
    }
    .section {
      margin-bottom: 14px;
    }
    .section-title-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }
    .section-title {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.7px;
      color: var(--subtext);
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 6px;
      padding: 10px;
      margin-bottom: 8px;
      transition: border-color 0.15s ease;
    }
    .card-active-identity {
      border-left: 3px solid var(--badge-success-fg);
    }
    .card-header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 6px;
    }
    .card-title-group {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 600;
      font-size: 12px;
      color: var(--fg);
    }
    .status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      display: inline-block;
      flex-shrink: 0;
    }
    .dot-active {
      background: #2ea44f;
      box-shadow: 0 0 0 2px rgba(46, 164, 79, 0.25);
    }
    .dot-inactive {
      background: rgba(255, 255, 255, 0.25);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 500;
      line-height: 1.3;
    }
    .badge-success {
      background: var(--badge-success-bg);
      color: var(--badge-success-fg);
      border: 1px solid rgba(78, 201, 176, 0.25);
    }
    .badge-warning {
      background: var(--badge-warning-bg);
      color: var(--badge-warning-fg);
      border: 1px solid rgba(204, 167, 0, 0.25);
    }
    .badge-info {
      background: var(--badge-info-bg);
      color: var(--badge-info-fg);
      border: 1px solid rgba(77, 170, 252, 0.25);
    }
    .badge-muted {
      background: var(--badge-muted-bg);
      color: var(--badge-muted-fg);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
    .meta-list {
      margin-top: 8px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 11px;
    }
    .meta-item {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--fg);
      word-break: break-all;
    }
    .meta-item .sub {
      color: var(--subtext);
    }
    .icon {
      display: inline-block;
      vertical-align: middle;
      flex-shrink: 0;
    }
    .icon-muted {
      color: var(--subtext);
    }
    .repo-box {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 6px;
      padding: 8px 10px;
      margin-top: 6px;
    }
    .repo-main-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 6px;
    }
    .repo-title-wrapper {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 600;
      font-size: 11px;
    }
    .btn-link-action {
      background: transparent;
      border: none;
      color: var(--badge-info-fg);
      cursor: pointer;
      font-size: 11px;
      padding: 2px 4px;
      border-radius: 3px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      text-decoration: none;
    }
    .btn-link-action:hover {
      background: var(--btn-sec-bg);
      text-decoration: underline;
    }
    .branch-row {
      margin-top: 4px;
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      color: var(--subtext);
    }
    .btn {
      background: var(--btn-bg);
      color: var(--btn-fg);
      border: none;
      padding: 4px 10px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
      font-weight: 500;
      text-align: center;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      transition: background-color 0.12s ease;
      line-height: 1.4;
    }
    .btn:hover {
      background: var(--btn-hover);
    }
    .btn-secondary {
      background: var(--btn-sec-bg);
      color: var(--btn-sec-fg);
      border: 1px solid var(--card-border);
    }
    .btn-secondary:hover {
      background: var(--btn-sec-hover);
      color: var(--fg);
    }
    .btn-danger {
      background: transparent;
      color: var(--error-fg);
      border: 1px solid rgba(244, 135, 113, 0.3);
    }
    .btn-danger:hover {
      background: rgba(244, 135, 113, 0.15);
      border-color: var(--error-fg);
    }
    .btn-sm {
      padding: 3px 8px;
      font-size: 11px;
      border-radius: 3px;
    }
    .btn-xs {
      background: var(--btn-sec-bg);
      color: var(--btn-sec-fg);
      border: 1px solid var(--card-border);
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 10px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .btn-xs:hover {
      background: var(--btn-sec-hover);
      color: var(--fg);
    }
    .btn-scan-bar {
      width: 100%;
      background: var(--btn-sec-bg);
      color: var(--btn-sec-fg);
      border: 1px solid var(--card-border);
      padding: 6px 10px;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: all 0.12s ease;
    }
    .btn-scan-bar:hover {
      background: var(--btn-sec-hover);
      color: var(--fg);
      border-color: rgba(255, 255, 255, 0.2);
    }
    .btn-group {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 8px;
    }
    .hint-text {
      font-size: 11px;
      color: var(--subtext);
      margin-top: 4px;
      line-height: 1.35;
    }
    .discovered-item {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-left: 3px solid var(--focus-border);
      border-radius: 4px;
      padding: 8px;
      margin-top: 6px;
    }
    .discovered-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      font-weight: 600;
    }
    .source-tag {
      font-size: 9px;
      padding: 1px 4px;
      border-radius: 3px;
      background: rgba(255, 255, 255, 0.08);
      color: var(--subtext);
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .form-box {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 6px;
      padding: 10px;
      margin-top: 6px;
    }
    .form-group {
      margin-bottom: 8px;
    }
    .form-label {
      display: block;
      font-size: 11px;
      font-weight: 500;
      margin-bottom: 3px;
      color: var(--fg);
    }
    .form-label .req {
      color: var(--error-fg);
    }
    .form-label .opt {
      color: var(--subtext);
      font-weight: 400;
      font-size: 10px;
    }
    .input-text {
      width: 100%;
      background: var(--input-bg);
      color: var(--input-fg);
      border: 1px solid var(--input-border);
      border-radius: 3px;
      padding: 4px 7px;
      font-size: 12px;
      outline: none;
      transition: border-color 0.12s ease;
    }
    .input-text:focus {
      border-color: var(--focus-border);
    }
    .pat-row {
      display: flex;
      gap: 4px;
    }
    .radio-deck {
      display: flex;
      gap: 12px;
      margin-top: 3px;
    }
    .radio-item {
      font-size: 11px;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      cursor: pointer;
      color: var(--fg);
    }
    .form-actions-row {
      display: flex;
      gap: 6px;
      margin-top: 10px;
    }
    .form-actions-row .btn {
      flex: 1;
    }
    .banner-error {
      background: rgba(244, 135, 113, 0.12);
      border: 1px solid rgba(244, 135, 113, 0.4);
      color: var(--error-fg);
      font-size: 11px;
      padding: 6px 8px;
      border-radius: 3px;
      margin-bottom: 8px;
    }
  </style>
</head>
<body>
  <!-- HEADER -->
  <div class="header-bar">
    <div class="brand-title">
      <span>GitAxis Control Center</span>
      <span class="brand-pill">v0.3.0</span>
    </div>
    <button type="button" class="icon-btn-ghost" title="Refresh state" onclick="sendCmd('refresh')">
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
        ${profile ? `<span class="badge badge-success">Active</span>` : ''}
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
            ? `<button type="button" class="btn-link-action" title="Open repository on GitHub" onclick="openRepoInBrowser('${escapeJsAttr(repoUrl)}')">
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
      <div style="margin-top: 6px;">${matchBadge}</div>
      ${
        match && match.confidence !== 'none' && match.recommendedProfileId !== profile?.id
          ? `<button type="button" class="btn btn-secondary btn-sm" style="margin-top: 6px; width: 100%;" onclick="sendCmd('useRecommended')">Switch to Suggested Profile</button>`
          : ''
      }
    </div>
  </div>

  <!-- SYSTEM ACCOUNT SCANNER -->
  <div class="section">
    <div class="section-title-row">
      <span class="section-title">SYSTEM ACCOUNT SCANNER</span>
    </div>
    <button type="button" class="btn-scan-bar" onclick="scanAccounts()">
      ${Icons.search}
      <span>Scan Local Git &amp; GitHub CLI Accounts</span>
    </button>
    ${
      discovered.length > 0
        ? `<div style="display: flex; flex-direction: column; gap: 6px; margin-top: 6px;">
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
                  <button type="button" class="btn btn-sm" onclick="importDiscoveredAccount(${idx})">+ Import as Profile</button>
                  <button type="button" class="btn btn-sm btn-secondary" onclick="fillFormWithAccount(${idx})">Fill Form</button>
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
      <button type="button" class="btn-xs" onclick="startNewProfile()">
        ${Icons.plus} Add Profile
      </button>
    </div>
    ${
      profiles.length === 0
        ? `<div class="hint-text">No profiles created yet. Use the form below or scan accounts above.</div>`
        : profiles
            .map(p => {
              const isActive = profile?.id === p.id;
              const isLinked = linkedProfileId === p.id;
              const hasRepo = !!repo;
              return `
      <div class="card" style="${isActive ? 'border-left: 3px solid var(--badge-success-fg);' : ''}">
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
            <span class="sub">Scope: ${escapeHtml(p.git.scope || 'local')} · Auth: ${escapeHtml(p.authentication.type)}</span>
          </div>
        </div>
        <div class="btn-group">
          ${!isActive ? `<button type="button" class="btn btn-sm" onclick="switchProfile('${escapeJsAttr(p.id)}')">Switch</button>` : ''}
          <button type="button" class="btn btn-sm btn-secondary" onclick="editProfile('${escapeJsAttr(p.id)}')">Edit</button>
          <button type="button" class="btn btn-sm btn-danger" onclick="deleteProfile('${escapeJsAttr(p.id)}')">Delete</button>
        </div>
      </div>`;
            })
            .join('')
    }
  </div>

  <!-- IN-SIDEBAR PERSISTENT PROFILE FORM -->
  <div class="section" id="profile-form-section" style="border-bottom: none;">
    <div class="section-title-row">
      <span class="section-title" id="form-title">CREATE / EDIT PROFILE</span>
    </div>
    <div class="form-box">
      <div id="form-error-msg" class="banner-error" style="display: none;"></div>
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
        <label class="form-label" for="form-pat">Personal Access Token (PAT) <span class="opt">(optional)</span></label>
        <div class="pat-row">
          <input type="password" id="form-pat" class="input-text" placeholder="ghp_xxxxxxxxxxxx" autocomplete="off" />
          <button type="button" id="btn-toggle-pat" class="btn btn-secondary btn-sm" onclick="togglePatVisibility()">Show</button>
        </div>
        <div class="hint-text" style="font-size: 10px; margin-top: 3px;">Stored securely in VS Code SecretStorage. Inputs are persistent across tab switches.</div>
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
        <button type="button" class="btn" id="form-submit-btn" onclick="saveProfileForm()">Save Profile</button>
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
        btn.innerText = 'Hide';
      } else {
        input.type = 'password';
        btn.innerText = 'Show';
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
