<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="media/lockup-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="media/lockup-light.svg">
    <img alt="GitAxis - Switch Profiles" src="media/lockup-dark.svg" width="460">
  </picture>
</p>

# GitAxis — Multi-Profile Git & GitHub Manager for VS Code

[![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/mshrinath.gitaxis?logo=visual-studio-code&label=VS%20Code%20Marketplace&color=blue)](https://marketplace.visualstudio.com/items?itemName=mshrinath.gitaxis)
[![Visual Studio Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/mshrinath.gitaxis)](https://marketplace.visualstudio.com/items?itemName=mshrinath.gitaxis)
[![GitHub Release](https://img.shields.io/github/v/release/MShrinath/GitAxis?logo=github&color=blue)](https://github.com/MShrinath/GitAxis/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Build & Tests](https://img.shields.io/badge/tests-113%20passing-brightgreen.svg)](https://github.com/MShrinath/GitAxis)

**GitAxis** eliminates the friction of managing multiple Git and GitHub accounts (Work, Personal, Client, Open Source) on the same machine. It prevents accidental commits with the wrong author email and stops `Permission to repo denied (403)` push errors in VS Code.

---

## Why GitAxis?

When switching between multiple GitHub accounts on one computer:
- **Wrong Author Stamp**: Commits accidentally carry your personal email in a company or client repository.
- **403 Push Failures**: VS Code's Source Control silently defaults to cached OS credentials for the wrong user.
- **SSH Key Collisions**: System `ssh-agent` offers the wrong key order for private enterprise repositories.

---

## Visual Overview

GitAxis adds a clean, native sidebar and status bar indicator to VS Code:

```text
+------------------ GitAxis Control Center ------------------+
|  ACTIVE IDENTITY                                            |
|  [Active] Work Profile (Verified)                          |
|    Author: Jane Doe <jane@company.com>                      |
|    Remote: https://jane-work@github.com/company/project.git |
|    Branch: feature/auth-refactor                            |
+-------------------------------------------------------------+
|  PROFILES (3)                            [+ Add Profile]    |
|                                                             |
|  * Work                 [Active]     [Edit]                 |
|    jane-work | GCM / PAT                                    |
|                                                             |
|  o Personal                          [Switch]  [Edit]       |
|    janedoe | SSH (~/.ssh/id_ed25519)                        |
|                                                             |
|  o OpenSource                        [Switch]  [Edit]       |
|    janedoe-oss | PAT (No Push)       [Switch]  [Edit]       |
+-------------------------------------------------------------+
|  DISCOVERED ACCOUNTS (1 found)                              |
|  [?] client-contractor (gh cli)          [+ Import]         |
+-------------------------------------------------------------+
  Status Bar: [github] Work Profile (jane-work)  |  [check]
```

---

## Quick Start (30 Seconds)

1. **Open GitAxis**: Click the GitAxis icon in the Activity Bar or press `Ctrl+Alt+G` (`Cmd+Alt+G` on macOS).
2. **Add or Import Profiles**: Click **+ Add Profile** to configure author details, or click the search icon to scan and import existing machine accounts with 1 click.
3. **Switch & Push**: Click **[Switch]** on any profile. GitAxis instantly updates local repository identity, aligns HTTPS remote URLs, and approves credentials with your credential helper. Make your commit and push normally via VS Code's native Source Control.

---

## Core Capabilities

- **Frictionless Identity Switching**: Switch author names, emails, and credentials per repository with 1 click. The status bar dynamically displays the active profile and warns if local configuration differs from your profile.
- **Commit & Push Guard**: Checks author name/email before commits are created, and verifies repository ownership before pushes. Modes: `warn` (default), `block`, or `off`.
- **Folder Rules ("Set-and-Forget")**: Automatically routes identities based on folder paths (e.g. `~/work/**` -> Work) using native Git `includeIf` rules.
- **Isolated Authentication & SSH**: Personal Access Tokens (PATs) are stored in VS Code's hardware-encrypted `SecretStorage` (never in plain text). SSH configurations enforce `-o IdentitiesOnly=yes` to guarantee the right key is presented.
- **Zero 403 Push Errors**: Automatically aligns HTTPS remote URLs (`https://username@github.com/...`) and targets Git Credential Manager so Git never sends the wrong cached account.

---

## Commands & Shortcuts

| Command | Shortcut | Description |
|---|---|---|
| `GitAxis: Switch Profile` | `Ctrl+Alt+G` (`Cmd+Alt+G`) | QuickPick to switch active profile |
| `GitAxis: Open Control Center` | — | Focus the GitAxis sidebar |
| `GitAxis: Show Effective Identity` | — | Inspect resolved Git author, SSH, and GCM config |
| `GitAxis: Configure Folder Rules` | — | Manage `includeIf` directory bindings |
| `GitAxis: Scan Existing Accounts` | — | Discover local Git and GitHub CLI logins |
| `GitAxis: Verify Profile Authentication` | — | Test profile GitHub credentials on demand |
| `GitAxis: Create Profile` | — | Open the form to add a new profile |
| `GitAxis: Manage Profiles` | — | List and edit existing profile configurations |
| `GitAxis: Remove All GitAxis Config` | — | Safe 1-click cleanup of all GitAxis include files |

---

## Configuration Settings

Configure via VS Code Settings (`Ctrl+,` / `Cmd+,`, search `GitAxis`):

| Setting | Default | Description |
|---|---|---|
| `gitaxis.guard.mode` | `"warn"` | Safety level (`"block"`, `"warn"`, `"off"`) for pre-commit and pre-push guards. |
| `gitaxis.confirmDestructiveOperations` | `true` | Confirmation for destructive Git commands (force push, rebase, hard reset). |
| `gitaxis.autoDetectProfile` | `true` | Auto-detect and prompt profile switch based on repository remote. |
| `gitaxis.promptScanOnFirstLaunch` | `true` | Prompt to scan local accounts on initial launch. |
| `gitaxis.advanced.allowGlobalScope` | `false` | Enable global scope option (modifies machine-wide `~/.gitconfig`). |

---

## Security & Privacy

- **100% Local Execution**: Runs entirely inside your local VS Code instance. Zero telemetry, zero analytics tracking, and no external servers.
- **OS-Encrypted Tokens**: Personal Access Tokens (PATs) are encrypted via VS Code's native `SecretStorage` API (Windows Credential Manager, macOS Keychain, Linux Secret Service).
- **Non-Destructive by Default**: Never touches machine-wide `~/.gitconfig` settings unless global scope is explicitly enabled.

---

## Installation

- **From VS Code**: Press `Ctrl+P` (or `Cmd+P`), run `ext install mshrinath.gitaxis`, and press Enter.
- **From Command Line**: `code --install-extension mshrinath.gitaxis`
- **From Marketplace**: [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=mshrinath.gitaxis)

---

## License

This project is licensed under the [MIT License](LICENSE).
