# Changelog

All notable changes to the **GitAxis** extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.7.0] - 2026-10-31

### Added
- **Real Process Cancellation**: Pass `AbortSignal` to spawned Git child processes via `AbortController` in `GitClient.exec` and `OperationManager.cancel`.
- **Per-Operation Adaptive Timeouts**: 120s for remote network operations (`push`, `pull`, `fetch`, `clone`) and 15s for local git operations.
- **Safety Confirmations**:
  - `git rebase` confirmation with commit history warning.
  - `git checkout` and `git restore` prompt when the working tree has uncommitted/dirty changes.
  - `git commit --amend` warning when amending commits that have already been published to upstream tracking branches.
  - `git tag -d` and `git remote remove` deletion confirmations.
  - `github.pull-request.merge` and `github.issue.close` mutating confirmations.
  - Target owner alignment verification before `github.repository.create`.
- **Enriched Confirmation Dialogs**: All safety confirmation dialogs now include active Profile, Repository name, Branch name, and Remote name.
- **Repository Detection Caching**: Added TTL-based repository discovery cache (`RepositoryDiscovery`) to eliminate redundant Git process spawns during status bar and webview refreshes.
- **Atomic Profile Switching**: Ensures Git identity configuration successfully applies before persisting active profile state.
- **Type-Safe Dispatcher**: Replaced monolithic switch dispatchers with modular handler maps for Git and GitHub operations.
- **Accurate Git Error Classification**: Classifies specific Git stderr messages and exit codes with precise `retryable` status flags.
- **Typecheck Script**: Added `npm run typecheck` (`tsc --noEmit`).

---

## [0.6.0] - 2026-10-31

### Added
- **Folder Rules via Git `includeIf` ("Set-and-Forget")**:
  - Automatic repository profile resolution based on folder paths (e.g. `~/work/**` -> *Work*, `~/personal/**` -> *Personal*).
  - Per-profile include files in `~/.gitaxis/profiles/<profile>.gitconfig` with isolated `user.name`, `user.email`, `core.sshCommand`, and credentials.
  - Global `~/.gitconfig` integration using `[includeIf "gitdir:..."]` blocks with full diff preview and safe confirmation.
  - Clean undo command: `GitAxis: Remove All GitAxis Config`.
- **Show Effective Identity**:
  - New `GitAxis: Show Effective Identity` command displaying effective author credentials, SSH command, GCM username, and the selection rule (Binding, Folder Rule, Matcher, or Fallback).
- **Default Keybinding**:
  - Bound `Ctrl+Alt+G` (or `Cmd+Alt+G` on macOS) to `GitAxis: Switch Profile`.
- **Enhanced Switch Profile QuickPick**:
  - Displays `@username`, email, auth method, active status (`$(check)`), and folder rule badge.
  - Quick actions to configure folder rules, bind repos, verify authentication, and inspect effective identity.
- **Protected Global Scope**:
  - Global Git identity writes hidden behind `gitaxis.advanced.allowGlobalScope` to prevent accidental machine-wide config overwrites.

---

## [0.5.0] - 2026-10-31

### Added
- **Per-Repository Profile Binding**: Explicit repo associations with deterministic resolution order.
- **Commit & Push Guard**:
  - Pre-commit author mismatch verification against the bound profile.
  - Pre-push remote owner verification against allowed organizations and wildcards.
  - Configurable safety mode (`block` | `warn` | `off`) with fail-closed security.
- **SSH Key Isolation**: Enforces `-o IdentitiesOnly=yes` in `core.sshCommand`.
- **GitHub CLI User Scoping**: Uses `gh auth token --user <username>` to prevent token collisions.
- **Inline Account Verification**: 1-click verification of PAT tokens, GitHub CLI status, and SSH handshakes.

---

## [0.4.0] - 2026-10-31

### Security & Hardening
- **PAT Storage Security**: Stopped persisting plaintext PAT tokens to repository `.git/config`.
- **Automated Security Migration**: Cleaned legacy `http.*.extraheader` tokens from existing repository configurations.
- **Webview Hardening**: Enforced strict Content Security Policy (CSP) with cryptographic nonces and external assets.
- **Git Argument Validation**: Validated branch, tag, remote names, and refspecs, rejecting leading dashes and command injection vectors.
- **Secret Redaction**: Redacted sensitive tokens and credentials from logs and error messages.
