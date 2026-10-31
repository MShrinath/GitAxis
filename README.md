# <img src="media/icon.png" width="36" height="36" align="center" alt="GitAxis" /> GitAxis - Git & GitHub Profile Manager for VS Code

[![GitHub Repository](https://img.shields.io/badge/GitHub-MShrinath%2FGitAxis-blue.svg?logo=github)](https://github.com/MShrinath/GitAxis)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

GitAxis is a multi-profile Git and GitHub control center for Visual Studio Code and VS Code Insiders. Repository: [https://github.com/MShrinath/GitAxis](https://github.com/MShrinath/GitAxis).

Maintain separate identities (e.g. `work`, `personal`, `opensource`, `client-a`) each with their own Git author name, email, GitHub account, host (github.com / GitHub Enterprise), and authentication mechanism.

---

## Features

- **Multi-Profile Control Center**: Define distinct identities with custom Git author details, GitHub credentials, and identity scopes (repository-local vs global).
- **Smart Repository Matching**: Automatically detects the best matching profile based on remote URLs, repository associations, and local Git configs.
- **Activity Bar & Sidebar UI**: Dedicated dashboard displaying active profile, opened repository status, quick Git operations, and GitHub resources.
- **Status Bar Integration**: View active profile identity (`$(github) work`) and switch profiles with one click.
- **Non-Invasive System Discovery**: Safely scan existing `git` configs and `gh` CLI credentials on launch and import them without extracting passwords or private keys.
- **Safety & Destructive Operation Guard**: Prevents accidental destructive actions (force push, `reset --hard`, branch deletions, stash drops) by requiring explicit confirmation and warning on profile/remote owner mismatches.
- **Centralized Git & GitHub Layer**: Full command palette support for commits, branches, stashes, remotes, issues, and pull requests routed through a typed operation pipeline.

---

## Commands

- `gitaxis.open`: GitHub Manager: Open Control Center
- `gitaxis.switchProfile`: GitHub Manager: Switch Profile
- `gitaxis.createProfile`: GitHub Manager: Create Profile
- `gitaxis.manageProfiles`: GitHub Manager: Manage Profiles
- `gitaxis.scanAccounts`: GitHub Manager: Scan Existing Accounts
- `gitaxis.status`: GitHub Manager: Status
- `gitaxis.commit`: GitHub Manager: Commit
- `gitaxis.push`: GitHub Manager: Push (with force/force-with-lease options)
- `gitaxis.pull`: GitHub Manager: Pull
- `gitaxis.fetch`: GitHub Manager: Fetch
- `gitaxis.createBranch`: GitHub Manager: Create Branch
- `gitaxis.checkoutBranch`: GitHub Manager: Checkout Branch
- `gitaxis.merge`: GitHub Manager: Merge
- `gitaxis.rebase`: GitHub Manager: Rebase
- `gitaxis.stash`: GitHub Manager: Stash
- `gitaxis.tag`: GitHub Manager: Tag
- `gitaxis.reset`: GitHub Manager: Reset
- `gitaxis.manageRemote`: GitHub Manager: Manage Remote
- `gitaxis.diff`: GitHub Manager: Diff
- `gitaxis.history`: GitHub Manager: History
- `gitaxis.clone`: GitHub Manager: Clone Repository
- `gitaxis.openGitHubRepo`: GitHub Manager: Open GitHub Repository
- `gitaxis.createPullRequest`: GitHub Manager: Create Pull Request
- `gitaxis.createIssue`: GitHub Manager: Create Issue
- `gitaxis.actions`: GitHub Manager: View GitHub Actions
- `gitaxis.releases`: GitHub Manager: View GitHub Releases

---

## Development

```bash
# Install dependencies
npm install

# Run TypeScript compilation
npm run compile

# Run tests
npm test

# Build production bundle with esbuild
npm run build
```