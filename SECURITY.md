# Security Policy

## Supported Versions

GitAxis actively supports and provides security updates for the latest released versions.

| Version | Supported          |
| ------- | ------------------ |
| 0.12.x  | :white_check_mark: |
| < 0.12  | :x:                |

---

## Security Architecture

GitAxis is engineered with a local-first, zero-trust architecture to safeguard your credentials and developer identities:

### 1. Token Storage via OS Keychain (`SecretStorage`)
- Personal Access Tokens (PAT) and OAuth authentication tokens are never stored in plain text, workspace configuration files, or standard `settings.json`.
- All sensitive tokens are securely persisted using the VS Code `SecretStorage` API, which leverages your operating system's native secure credential manager:
  - **Windows**: Windows Credential Manager / DPAPI
  - **macOS**: Apple Keychain
  - **Linux**: GNOME Keyring / KWallet via Secret Service API (`libsecret`)

### 2. 100% Local Execution
- All Git operations, profile switching, and identity bindings execute entirely locally on your workstation.
- Network communication only occurs directly between your local machine and your configured Git/GitHub remotes (e.g., `github.com` or custom GitHub Enterprise Server endpoints). GitAxis operates with zero intermediary cloud relays, proxies, or external servers.

### 3. Zero Telemetry & Data Privacy
- GitAxis collects **zero telemetry, usage metrics, or user analytics**.
- No account details, email addresses, repository paths, commit history, or token metadata are ever tracked or sent to third-party endpoints.

### 4. Credential Redaction & Log Sanitization
- GitAxis employs automated redaction guards across logger outputs, error handlers, and Webview message channels to intercept and scrub sensitive tokens, bearer headers, and credentials before they can be written to logs.

### 5. Workspace Trust Protection
- GitAxis marks `untrustedWorkspaces` as unsupported (`"supported": false`). Because managing Git identities modifies Git configuration and handles execution contexts, GitAxis requires explicit workspace trust before running commands.

---

## Reporting a Vulnerability

We take the security of GitAxis seriously. If you discover or suspect a security vulnerability, please follow responsible disclosure practices:

1. **Do NOT open a public GitHub issue** for undisclosed security vulnerabilities.
2. Report the vulnerability privately via **[GitHub Private Vulnerability Reporting](https://github.com/MShrinath/GitAxis/security/advisories/new)**.
3. If you cannot use GitHub Security Advisories, please contact the maintainer directly via GitHub profile contact details.

### What to include in your report:
- A detailed description of the vulnerability and potential impact.
- Clear reproduction steps or Proof of Concept (PoC).
- Your operating system, VS Code version, and GitAxis version.

### Response Timeline:
- You will receive an initial response and acknowledgment within **48 hours**.
- We will coordinate patch development, testing, and release timeline before any public disclosure.
