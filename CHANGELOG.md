# Changelog

All notable changes to the **GitAxis** extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.12.3] - 2026-11-03

### Marketplace Polish & CI Hardening
- **Gallery Banner**: Added dark-themed Marketplace gallery banner (#0D1117).
- **Activation Events Cleanup**: Reduced activation events to only `onStartupFinished`, removing redundant `onCommand:` entries.
- **Release Workflow Typecheck**: Added `npm run typecheck` step to the release workflow before tests.
- **Test Safety**: Stubbed global and local git config methods in robustness tests to prevent host `~/.gitconfig` mutation.

---

## [0.12.2] - 2026-11-02

### Major Code Clean & Refactoring
- **Architectural Deduplication**: Refactored command pipelines, GitHub client mappings, and platform utilities, achieving 0% code duplication across all production source files.
- **Dead Code & Type Elimination**: Pruned unused internal helpers and legacy types with Knip, streamlining the extension bundle.
- **Unified Platform & Command Helpers**: Centralized SSH command formatting, GitHub host normalization, and cancellable progress operations.

---

## [0.12.1] - 2026-11-01

### Improved & Polish
- **Streamlined Webview Layout**: Removed redundant internal `GitAxis Control Center` header bar and version badge to maximize vertical editor space, leveraging VS Code's native sidebar view pane title.
- **Integrated Header Actions**: Relocated Account Scanner and Refresh buttons directly into the `ACTIVE IDENTITY` section header row for a cleaner, unified UI.

---

## [0.12.0] - 2026-11-01

### Added & Fixed
- **Status Bar Theme Icon Support**: Fixed status bar tooltip icon formatting by enabling `supportThemeIcons` and `isTrusted` on Markdown strings.
- **Alt+G Keybinding**: Added `Alt+G` (in addition to `Ctrl+Alt+G` / `Cmd+Alt+G`) for profile switching across all platforms.
- **Demo Assets**: Embedded animated preview demo and linked 1080p release media.

---

## [0.11.1] - 2026-10-31

### Trust & Polish
- **Clean Command Palette & Contributions**: Scrubbed all legacy V1 duplicate Git commands and obsolete "Bound to repo" commands from `package.json`, focusing the extension on seamless profile and identity management.
- **Generic Placeholders**: Standardized all input placeholders across the webview profile form and documentation to generic role names (`Work User`, `work@company.com`, `work-user`).
- **Brand Version Alignment**: Updated the sidebar header brand pill to reflect `v0.11.1`.
- **Theme Icon Formatting in Tooltips**: Configured `supportThemeIcons = true` across status bar Markdown tooltips for native VS Code icon rendering.

---

## [0.11.0] - 2026-10-31

### Security & Authentication
- **Strict GitHub API Credential Guard**: `GitHubClient.request` requires an explicit authentication credential, preventing fallback to ambient `gh` CLI credentials under the wrong account. Credential Manager and SSH profiles cleanly instruct users to configure a PAT or GitHub CLI.
- **Native SCM Push PAT Authentication**: Added `git credential approve` integration during identity application. When using a PAT profile with a secure credential helper (e.g. Git Credential Manager), the token is stored in the helper, enabling native VS Code Source Control pushes without plaintext config storage.
- **GitHub CLI In-Memory Injection**: Scoped in-memory auth injection for `github-cli` profiles on push/pull/fetch operations, matching PAT profiles. Added short-lived token caching (15s) and cleanup.
- **Robust Include-File Escaping**: Generated include-files properly escape backslashes, `#`, and `;` in author names, preserve quotes around `core.sshCommand` for paths with spaces on Windows, validate hostnames strictly, and delegate to `git config --file` for canonical escaping.

### Improved & Fixed
- **Three-State Account Verification**: Profile verification supports verified (green), failed (red), and neutral grey ("Configured, not verified"). Credential Manager and unauthenticated profiles are marked neutral on startup without triggering intrusive system credential popups or network calls. Manual verification remains available on-demand.
- **Process Timeouts & Error Classification**: Extended error classification to preserve child process `killed`, `signal`, and `code`, classifying SIGTERM/killed processes as `TIMEOUT`. Network operations run without artificial timeouts (relying on cancellation), and long-running local operations (`git.switch`, `git.add`, `git.stash.*`, `git.reset`, `git.restore`) are protected from timeouts.
- **Multi-Root Workspace Repo Selection**: Commands resolve the repository from the active editor first, falling back to a repository quick-pick prompt when multiple repos exist in multi-root workspaces.
- **Commit Guard Safety**: Commit guard fails closed immediately in `block` mode when guard checks error without offering a proceed prompt.
- **UI & Minor Polishing**: Operation history capped at 200 items; `GIT_CONFIG_COUNT` environment variable appends rather than overwrites; status bar tooltips enable theme icons; dynamic profile creation wizard numbering; descriptive action verb command titles.

---

## [0.10.0] - 2026-10-31

### Added & Improved
- **Author Email Hover Tooltips**: Cleaned up identity cards so emails are no longer rendered inline across cards. Hovering over author names seamlessly shows full emails in native tooltips.
- **Discreet Account Scanner**: Replaced the bulky full-width account scanner section with a discreet magnifying glass button in the header bar and profiles header (`title="Scan local Git & GitHub CLI logins"`). Discovered accounts only appear when accounts are detected.
- **Fixed Profile Switching**: Unified sidebar webview switching with `gitaxis.switchProfile` to ensure switching reliably updates local repository `.git/config`, persists repository associations, updates the status bar, and re-renders the webview.

---

## [0.9.0] - 2026-10-31

### Added & Improved
- **Automatic Background Verification with Color-Coded Profile Names**: Removed manual "Verify" button. Profiles are verified in the background on startup and refresh, dynamically tinting profile names green (valid credentials) or red (verification warning) with hover status tooltips.
- **On-Demand Profile Form**: The Create/Edit Profile form is now cleanly collapsed by default (`hidden`) and appears smoothly only when clicking `+ Add Profile`, `Edit`, or `+ Import as Profile`. Added close `✕` button to dismiss.
- **Streamlined UI & Compact Link Logo**: Replaced text button "Open on GitHub" with a compact external link icon button, removed redundant "Bound to repo" tag from the active identity card, and omitted unnecessary `(github.com)` labels on standard GitHub profiles.
- **Removed Allowed Orgs Input**: Removed the optional Allowed Orgs field from the profile form while preserving existing bindings in the background.

---

## [0.8.0] - 2026-10-31

### Security
- **Scoped In-Memory PAT Injections**: Injected runtime PAT headers are now URL-scoped to `http.https://${host}/.extraheader` and only attached when the target host matches the profile host.
- **Removed `shell: true` from Windows Process Spawns**: Dropped shell execution in `GitHubClient` and `gh` execution to prevent command injection from remote URLs.
- **Untrusted Workspaces Protection**: Declared `capabilities.untrustedWorkspaces.supported = false` to prevent automatic Git commands from running on malicious untrusted workspaces.
- **Safe Webview Text Insertion**: Replaced `innerHTML` with `textContent` DOM nodes in the sidebar webview verification renderer.
- **Precision Extraheader Migration**: Targeted only `AUTHORIZATION: basic` headers during security migration, preserving custom user and CI HTTP headers. Added per-repo migration tracking.

### Fixed & Improved
- **Clone Profile & Credential Alignment**: Cloned repositories now bind the selected profile explicitly and embed `username@` into clone URLs for proper Credential Manager routing. Added `--` argument separator to prevent option injection.
- **Folder Rule Application Verification**: `promptUnboundRepo` now verifies that the `[includeIf]` block is actually configured in `.gitconfig` before skipping unbound prompts.
- **Git includeIf Order**: Emits `[includeIf]` rules sorted by condition length ascending so Git's last-match-wins rule evaluates specific rules last.
- **Atomic GitConfig Writes with Backup**: Creates `.gitconfig.bak` before writing and updates configuration via atomic temporary file renaming.
- **Non-Interactive SSH Verification**: Added `-o BatchMode=yes` to SSH authentication tests to prevent indefinite hanging on passphrase prompts.
- **Adaptive Timeouts & Error Classification**: Exempted long-running local operations (`commit`, `amend`, `rebase`, `merge`, `checkout`) from 15s timeouts, and classified timeouts as `TIMEOUT` error codes.
- **Guard Precision & Fail-Closed Safety**: Restricted push guard specifically to push operations, prevented fallback profiles from triggering false commit mismatch warnings on local repos, and enforced strict fail-closed behavior on check errors.
- **Checkout Dirty State Detection**: Ignored untracked files during checkout/restore safety checks.
- **GitHub API 204 No Content Handling**: Properly handles empty 204 responses on repository deletion without throwing syntax errors.
- **Editor Switch Refresh Debounce**: Debounced active editor switches (250ms) and eliminated redundant `git.refresh` storms.

---

## [0.7.1] - 2026-10-31

### Fixed
- **Cross-Platform Path Normalization in Folder Rules**: Ensured Windows-style drive paths (e.g. `C:/...`, `c:/...`) are matched case-insensitively across all operating systems, including Linux CI runners.
- **Cross-Platform Path Utility**: Standardized `Platform.normalizePath` with POSIX separator normalization across environments.

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
