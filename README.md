# <img src="media/icon.png" width="34" height="34" align="center" alt="GitAxis" /> GitAxis — Multi-Profile Git & GitHub Manager for VS Code

[![GitHub Release](https://img.shields.io/github/v/release/MShrinath/GitAxis?logo=github&color=blue)](https://github.com/MShrinath/GitAxis/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Build & Tests](https://img.shields.io/badge/tests-97%20passing-brightgreen.svg)](https://github.com/MShrinath/GitAxis)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.85%2B-007acc.svg?logo=visualstudiocode)](https://code.visualstudio.com/)

**GitAxis** is a dedicated identity and profile manager for Visual Studio Code and VS Code Insiders. 

It eliminates the friction of juggling multiple GitHub accounts (Work, Personal, Client, Open Source) and prevents the dreaded `Permission to repo denied to other_account (403)` errors when pushing from VS Code's native Source Control.

---

## The Problem GitAxis Solves

When working across multiple GitHub accounts on the same computer:
1. **Wrong Author Stamp**: You commit to a client or work repository with your personal email (or vice versa).
2. **The 403 Push Failure**: You run `git push` in VS Code, but Git and Windows/macOS Credential Manager silently send your default cached personal account, failing with:
   ```text
   remote: Permission to work-org/repo.git denied to personal-user.
   fatal: unable to access 'https://github.com/work-org/repo.git/': The requested URL returned error: 403
   ```
3. **SSH Key Collisions**: `ssh-agent` automatically offers keys in the order they were loaded, causing GitHub to identify you as the wrong user even when you specified a key file.
4. **Lost Form Inputs (The Alt-Tab Pain)**: VS Code modal popups and QuickPicks disappear as soon as you switch to your browser to copy a Personal Access Token (PAT).

---

## Key Features

- **Robust Process Cancellation & Adaptive Timeouts**: Full cancellation support using `AbortController` and `AbortSignal` directly terminates underlying Git processes. Per-operation adaptive timeouts (120s for remote operations, 15s for local commands).
- **Comprehensive Safety Confirmations**:
  - `git rebase` confirmation with commit history warning.
  - `git checkout` & `git restore` warning when working tree has uncommitted/dirty changes.
  - `git commit --amend` detection when amending commits that have already been published to upstream.
  - `git tag -d` and `git remote remove` deletion confirmations.
  - `github.pull-request.merge` and `github.issue.close` mutating confirmations.
  - Enriched confirmation dialogs displaying Profile, Repository, Branch, and Remote details.
- **Repository Detection Caching**: Added TTL-based repository discovery cache to eliminate redundant Git process spawns during status bar and webview refreshes.
- **Atomic Profile Switching**: Ensures Git identity configuration successfully applies before persisting active profile state; cancelling global changes leaves active state intact.
- **Folder Rules via `includeIf` ("Set-and-Forget")**: Define folder path rules (e.g. `~/work/**` &rarr; *Work*, `~/personal/**` &rarr; *Personal*). GitAxis generates include files in `~/.gitaxis/profiles/<profile>.gitconfig` and manages `[includeIf "gitdir:..."]` blocks in your global `~/.gitconfig` with full preview and 1-click clean removal.
- **Show Effective Identity Inspector**: Inspect the active repository's effective `user.name`, `user.email`, `core.sshCommand`, GCM credentials, and remotes, alongside the deterministic rule (*Explicit Binding*, *Folder Rule*, *Profile Matcher*, or *Fallback*) that resolved them.
- **Per-Repository Profile Binding**: Bind identities directly to repositories. Switching a profile in one repository never alters other repositories in multi-root workspaces.
- **Quick Profile Switcher with Default Keybinding**: Press `Ctrl+Alt+G` (or `Cmd+Alt+G` on macOS) to instantly switch profiles, bind repos, or inspect identity.
- **Commit & Push Guard**:
  - **Commit Guard**: Verifies that the repo's configured `user.email` and `user.name` match the active profile before you commit. Offers 1-click **Fix and continue**, **Commit anyway**, or **Cancel**.
  - **Push Guard**: Verifies the remote repository owner against the profile's allowed organizations/usernames (`orgs` list or wildcards) before pushing.
  - **Configurable Safety**: Choose between `block`, `warn` (default), or `off` via `gitaxis.guard.mode`. Fails closed safely if checks encounter unexpected conditions.
- **Inline Account Verification**: 1-click **Verify** button per profile in the sidebar. Tests PAT permissions & expiration via GitHub API, GitHub CLI credentials (`gh auth token --user <username>`), or SSH handshake (`ssh -T git@github.com -o IdentitiesOnly=yes`).
- **SSH Key Isolation**: Always injects `-o IdentitiesOnly=yes` into `core.sshCommand` (`ssh -i "<key>" -o IdentitiesOnly=yes`) to ensure `ssh-agent` offers only the explicitly assigned key.
- **Dynamic Status Bar & Mismatch Warning**: Status bar dynamically tracks the active editor's repository (`$(github) work-user`). If the local git config email differs from the bound profile, GitAxis flags a warning icon (`$(warning)`) with a helpful tooltip.
- **Protected Global Scope**: Global Git identity writes are hidden behind an advanced setting (`gitaxis.advanced.allowGlobalScope`) to prevent accidental machine-wide config overwrites.
- **Instant 1-Click Identity Switching**: Switch author names, emails, and GitHub accounts in seconds directly from the sidebar or the status bar.
- **Automated Credential & Remote Alignment**:
  - Automatically targets Git Credential Manager (`credential.https://${host}.username`).
  - Rewrites repository HTTPS remotes to embed the active username (`https://username@github.com/owner/repo.git`), ensuring Git Credential Manager never defaults to the wrong cached user.
- **Direct In-Memory PAT Injection**: Personal Access Tokens (PATs) are stored safely in VS Code's encrypted SecretStorage (never written as plaintext to disk). Operations run by GitAxis inject temporary scoped extraheaders (`http.https://<host>/.extraheader`) strictly in-memory per command.
- **Native Push Credential Alignment**: For native VS Code Source Control pushes, GitAxis aligns `credential.https://${host}.username` and rewrites remote HTTPS URLs (`https://<user>@github.com/...`) so the OS Credential Manager automatically targets the matching profile identity.
- **Persistent In-Sidebar Form**: Create and edit profiles directly in the webview sidebar. Form inputs are preserved even if you alt-tab to your browser to generate or copy credentials.
- **1-Click Local Account Discovery**: Inspects existing `git config` and GitHub CLI (`gh auth status`) logins, displaying 1-click **[+ Import as Profile]** chips.
- **Native VS Code Design (No Emojis)**: Pixel-aligned SVG icons, theme-adaptive CSS variables, and clean layout built strictly to match VS Code's design system.
- **Seamless Coexistence with Native SCM**: GitAxis does not bloat your sidebar with duplicate commit/push buttons; VS Code's built-in Source Control remains the primary, native Git tool.

---

## How It Works Under the Hood

```text
                           GitAxis Sidebar
                                 │
                 User clicks [Switch] to "work" profile
                                 │
         ┌───────────────────────┴───────────────────────┐
         ▼                                               ▼
1. Git Identity Config                          2. Git Authentication Config
   • git config user.name "Work User"               • git config credential.username "work-user"
   • git config user.email "work@company.com"         • Rewrite remote: https://work-user@github.com/...
                                                   • Target GCM: credential.https://github.com.username
                                                   • Configure core.sshCommand (if SSH configured)
                                 │
                                 ▼
                     VS Code Native Source Control
                        [ Commit & Push ]
                                 │
                                 ▼
                         GitHub Remote Server
                    ✓ Authenticated as work-user
                    ✓ Author stamped as Work User
                    ✓ 0 Permission / 403 Errors
```

---

## How to Install

### Method 1: Install from GitHub Releases (Recommended)

1. Go to the [GitAxis GitHub Releases Page](https://github.com/MShrinath/GitAxis/releases).
2. Download the latest `.vsix` package (e.g. `gitaxis-0.8.0.vsix`).
3. Open **VS Code** or **VS Code Insiders**.
4. Open the Extensions view (`Ctrl+Shift+X` or `Cmd+Shift+X`).
5. Click the **`···`** (Views and More Actions) menu in the top right of the Extensions panel.
6. Select **Install from VSIX...** and select the downloaded file.

---

### Method 2: Install via Command Line

If you have VS Code in your system `PATH`:

```powershell
# For standard VS Code:
code --install-extension gitaxis-0.8.0.vsix

# For VS Code Insiders:
code-insiders --install-extension gitaxis-0.8.0.vsix
```

---

### Method 3: Run from Source (Development Mode)

If you want to contribute or build from source:

```bash
# 1. Clone repository
git clone https://github.com/MShrinath/GitAxis.git
cd GitAxis

# 2. Install dependencies
npm install

# 3. Compile and build bundle
npm run compile
npm run build

# 4. Launch in VS Code Extension Host
# Open the project folder in VS Code and press F5
```

---

## Configuration Settings

| Setting | Type | Default | Description |
|---|---|---|---|
| `gitaxis.guard.mode` | `string` (`"block"` | `"warn"` | `"off"`) | `"warn"` | Safety level for pre-commit author mismatch and pre-push organization mismatch guards. |
| `gitaxis.confirmDestructiveOperations` | `boolean` | `true` | Require explicit confirmation for destructive Git operations (force push, rebase, checkout with dirty changes). |
| `gitaxis.autoDetectProfile` | `boolean` | `true` | Automatically detect and prompt to switch profile based on repository remote and configuration. |
| `gitaxis.promptScanOnFirstLaunch` | `boolean` | `true` | Prompt to scan system Git and GitHub CLI configurations on first launch. |
| `gitaxis.advanced.allowGlobalScope` | `boolean` | `false` | Advanced: Show global Git identity scope option when creating profiles. Affects system-wide ~/.gitconfig. |

---

## Quick Start Guide

### 1. Open the GitAxis Control Center
Click the **GitAxis** icon in the left Activity Bar to open the Control Center sidebar.

### 2. Discover or Add Profiles
- **Quick Import**: Click **Scan Local Git & GitHub CLI Accounts** to detect accounts already configured on your machine and import them with 1 click.
- **Custom Profile**: Click **+ Add Profile** in the Profiles header to open the form. Fill in:
  - **Profile Name**: e.g. `work`, `personal`, `opensource`.
  - **Git Author Name & Email**: Used for commit logs.
  - **GitHub Username**: Used for remote push authentication.
  - **Allowed Orgs**: (Optional) Comma-separated list of GitHub orgs or owner patterns (e.g. `my-corp, client-*`).
  - **PAT Token** *(Optional)*: If provided, stored securely in VS Code's encrypted `SecretStorage` and injected into the repo for instant push authentication.

### 3. Switch Profile or Bind to Repo
Click **[Switch]** on any profile. GitAxis will immediately:
- Update author credentials in your repository.
- Synchronize remote push URLs and credential helpers.
- Update the bottom Status Bar badge (`$(github) <active-profile>`).
- To bind a profile specifically to this repository, click `...` &rarr; `Bind Current Repo`.

### 4. Push with Native Source Control
Switch to VS Code's built-in **Source Control** view (`Ctrl+Shift+G`), make your commit, and click **Sync Changes / Push**. Git will automatically authenticate using the active profile!

---

## Frequently Asked Questions

### Why does GitAxis rewrite HTTPS remote URLs to include the username?
Windows Credential Manager and macOS Keychain cache credentials under hostnames (e.g. `github.com`). If you have two accounts (`personal-user` and `work-user`), Git defaults to the first one it finds unless the username is explicitly specified. Rewriting the remote URL to `https://work-user@github.com/...` tells Git specifically which credentials to send, completely eliminating 403 authorization failures.

### Are my Personal Access Tokens (PATs) safe?
Yes. Tokens are saved in VS Code's native `SecretStorage` API, which encrypts them using your operating system's secure keychain (Windows Credential Manager, macOS Keychain, or Linux Secret Service). Tokens are never committed to Git or synced to remote servers.

### Does GitAxis touch my global Git settings?
By default, GitAxis only modifies the local `.git/config` of the repository currently opened in your workspace. If you choose `Scope: Global` when creating or switching a profile, GitAxis will ask for explicit confirmation before altering your machine-wide Git settings.

---

### How does GitAxis work in VS Code Remote, WSL, or Dev Containers?
When using VS Code Remote (SSH, WSL, Dev Containers, or GitHub Codespaces), GitAxis runs as a workspace extension inside the remote environment. GitAxis transparently configures the remote system's `~/.gitconfig`, reads remote SSH keys (`~/.ssh/`), and integrates with GitHub CLI logins installed in the remote container or VM.

## Development & Testing

```bash
# Run automated tests (97 unit tests)
npm test

# Check TypeScript types
npm run compile

# Build production bundle with esbuild
npm run build

# Package clean VSIX file
npx @vscode/vsce package --no-dependencies
```

---

## License

This project is licensed under the [MIT License](LICENSE).
