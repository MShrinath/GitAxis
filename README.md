# <img src="media/icon.png" width="34" height="34" align="center" alt="GitAxis" /> GitAxis — Multi-Profile Git & GitHub Manager for VS Code

[![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/mshrinath.gitaxis?logo=visual-studio-code&label=VS%20Code%20Marketplace&color=blue)](https://marketplace.visualstudio.com/items?itemName=mshrinath.gitaxis)
[![Visual Studio Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/mshrinath.gitaxis)](https://marketplace.visualstudio.com/items?itemName=mshrinath.gitaxis)
[![GitHub Release](https://img.shields.io/github/v/release/MShrinath/GitAxis?logo=github&color=blue)](https://github.com/MShrinath/GitAxis/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Build & Tests](https://img.shields.io/badge/tests-113%20passing-brightgreen.svg)](https://github.com/MShrinath/GitAxis)
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

- **Robust Process Cancellation & Adaptive Timeouts**: Full cancellation support using `AbortController` and `AbortSignal` directly terminates underlying Git processes. Network operations run without artificial timeouts relying on responsive user cancellation, and long-running local commands (`git switch`, `git add`, `git stash`, `git reset`, `git restore`) are protected from premature termination.
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
- **Show Effective Identity Inspector**: Inspect the active repository's effective `user.name`, `user.email`, `core.sshCommand`, GCM credentials, and remotes, alongside the deterministic rule (*Folder Rule*, *Profile Matcher*, or *Fallback*) that resolved them.
- **Per-Repository Profile Switching**: Switching a profile in one repository updates that repository's local Git configuration without altering other repositories in multi-root workspaces.
- **Quick Profile Switcher with Default Keybinding**: Press `Ctrl+Alt+G` (or `Cmd+Alt+G` on macOS) to instantly switch profiles or inspect identity.
- **Commit & Push Guard**:
  - **Commit Guard**: Verifies that the repo's configured `user.email` and `user.name` match the active profile before you commit. Offers 1-click **Fix and continue**, **Commit anyway**, or **Cancel**.
  - **Push Guard**: Verifies the remote repository owner against the profile's allowed organizations/usernames before pushing. If pushing to an unlearned organization, GitAxis prompts to remember the owner for this profile.
  - **Configurable Safety**: Choose between `block`, `warn` (default), or `off` via `gitaxis.guard.mode`. Fails closed safely if checks encounter unexpected conditions.
- **Three-State Account Verification**: Profiles are verified with clear three-state status indicators: verified (green), failed (red), and neutral ('Configured, not verified'). Credential Manager and unauthenticated profiles show neutral grey without contacting the network at startup, avoiding intrusive system authentication popups. Hover tooltips detail token status, scopes, or expiration.
- **SSH Key Isolation**: Always injects `-o IdentitiesOnly=yes` into `core.sshCommand` (`ssh -i "<key>" -o IdentitiesOnly=yes`) to ensure `ssh-agent` offers only the explicitly assigned key.
- **Dynamic Status Bar & Mismatch Warning**: Status bar dynamically tracks the active editor's repository (`$(github) work-user`). If the local git config email differs from the active profile, GitAxis flags a warning icon (`$(warning)`) with a helpful tooltip.
- **Protected Global Scope**: Global Git identity writes are hidden behind an advanced setting (`gitaxis.advanced.allowGlobalScope`) to prevent accidental machine-wide config overwrites.
- **Instant 1-Click Identity Switching**: Switch author names, emails, and GitHub accounts in seconds directly from the sidebar or the status bar.
- **Automated Credential & Remote Alignment**:
  - Automatically targets Git Credential Manager (`credential.https://${host}.username`).
  - Rewrites repository HTTPS remotes to embed the active username (`https://username@github.com/owner/repo.git`), ensuring Git Credential Manager never defaults to the wrong cached user.
- **Direct PAT In-Memory Injection & Credential Helper Approval**: Personal Access Tokens (PATs) are stored safely in VS Code's encrypted SecretStorage (never written as plaintext to disk). When applying a PAT profile, GitAxis checks `credential.helper` and securely approves the credentials with git's native credential helper for seamless native VS Code Source Control pushes. In addition, GitAxis-managed operations inject temporary scoped extraheaders strictly in-memory per command.
- **On-Demand In-Sidebar Form**: Create and edit profiles directly in the webview sidebar. The form stays cleanly collapsed until clicking **+ Add Profile** or **Edit**, preserving form inputs across tabs or browser switches.
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

### Method 1: Install from VS Code Marketplace (Recommended)

1. Open **VS Code** or **VS Code Insiders**.
2. Press `Ctrl+P` (or `Cmd+P` on macOS) and run:
   ```text
   ext install mshrinath.gitaxis
   ```
   *Alternatively, search for **GitAxis** in the Extensions view (`Ctrl+Shift+X` or `Cmd+Shift+X`).*
3. Or install directly from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=mshrinath.gitaxis).

---

### Method 2: Install via Command Line

If you have the VS Code CLI in your system `PATH`:

```powershell
# Install directly from the VS Code Marketplace:
code --install-extension mshrinath.gitaxis

# For VS Code Insiders:
code-insiders --install-extension mshrinath.gitaxis

# Or from a downloaded .vsix package:
code --install-extension gitaxis-0.11.1.vsix
```

---

### Method 3: Install from GitHub Releases (.vsix)

1. Go to the [GitAxis GitHub Releases Page](https://github.com/MShrinath/GitAxis/releases).
2. Download the latest `.vsix` package (e.g. `gitaxis-0.11.1.vsix`).
3. Open **VS Code** or **VS Code Insiders**.
4. Open the Extensions view (`Ctrl+Shift+X` or `Cmd+Shift+X`).
5. Click the **`···`** (Views and More Actions) menu in the top right of the Extensions panel.
6. Select **Install from VSIX...** and select the downloaded file.

---

### Method 4: Run from Source (Development Mode)

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
| `gitaxis.guard.mode` | `string` (`"block"` \| `"warn"` \| `"off"`) | `"warn"` | Safety level for pre-commit author mismatch and pre-push organization mismatch guards. |
| `gitaxis.confirmDestructiveOperations` | `boolean` | `true` | Require explicit confirmation for destructive Git operations (force push, rebase, checkout with dirty changes). |
| `gitaxis.autoDetectProfile` | `boolean` | `true` | Automatically detect and prompt to switch profile based on repository remote and configuration. |
| `gitaxis.promptScanOnFirstLaunch` | `boolean` | `true` | Prompt to scan system Git and GitHub CLI configurations on first launch. |
| `gitaxis.advanced.allowGlobalScope` | `boolean` | `false` | Advanced: Show global Git identity scope option when creating profiles. Affects system-wide ~/.gitconfig. |

---

## Quick Start Guide

### 1. Open the GitAxis Control Center
Click the **GitAxis** icon in the left Activity Bar to open the Control Center sidebar.

### 2. Discover or Add Profiles
- **Quick Import**: Click the **Scan Local Accounts** icon in the sidebar title bar to detect accounts already configured on your machine and import them with 1 click.
- **Custom Profile**: Click **+ Add Profile** in the Profiles header to open the form. Fill in:
  - **Profile Name**: e.g. `work`, `personal`, `opensource`.
  - **Git Author Name & Email**: Used for commit logs.
  - **GitHub Username**: Used for remote push authentication.
  - **PAT Token** *(Optional)*: If provided, stored securely in VS Code's encrypted `SecretStorage` and approved with your Git credential helper for native Source Control push authentication.

### 3. Switch Profile
Click **[Switch]** on any profile. GitAxis will immediately:
- Update author credentials in your repository.
- Synchronize remote push URLs and credential helpers.
- Update the bottom Status Bar badge (`$(github) <active-profile>`).

### 4. Push with Native Source Control
Switch to VS Code's built-in **Source Control** view (`Ctrl+Shift+G`), make your commit, and click **Sync Changes / Push**. If using a PAT profile, GitAxis approves credentials with your native credential helper on profile switch; if using SSH or GCM, Git automatically routes to the right key or account!

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

---

## Troubleshooting

### Wrong account used on push
- Check the active profile shown in the status bar or the GitAxis sidebar.
- If using HTTPS, ensure the remote URL includes the profile username (`https://username@github.com/...`) and that `credential.https://${host}.username` is configured. GitAxis automatically applies this when switching profiles.
- If using PAT authentication, ensure a credential helper (such as Git Credential Manager) is enabled in your Git configuration (`git config --get credential.helper`). GitAxis approves your token via `git credential approve` when you switch to or save the profile.

### SSH key not used
- Verify that the profile has an SSH key path configured (`core.sshCommand`). GitAxis automatically sets `ssh -i "<path>" -o IdentitiesOnly=yes` to prevent `ssh-agent` from presenting the wrong key.
- Ensure the public key corresponding to your private key is added to the correct GitHub account.

### Git Credential Manager prompts
- If GCM repeatedly prompts for credentials, check whether your repository's remote URL specifies the username (`https://username@github.com/...`). Without the username prefix, GCM cannot differentiate between accounts for the same host.
- Run `git config --get credential.helper` to confirm that GCM is properly registered as your credential helper.

### GitHub CLI account mismatch
- For Git operations executed by GitAxis, tokens are fetched dynamically using `gh auth token --hostname <host> --user <username>` and injected in-memory per command.
- For commands executed directly in your external terminal, verify your active CLI account with `gh auth status` and switch if needed with `gh auth switch`.

### "Configured, not verified" status
- Profiles configured with OS Credential Manager or no authentication token display a neutral grey "Configured, not verified" status by default. This is intentional to prevent unwanted credential manager popups and network requests when opening VS Code.
- To verify a profile on demand, click the verification icon next to the profile in the sidebar.

---

## Development & Testing

```bash
# Run automated tests (113 unit tests)
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
