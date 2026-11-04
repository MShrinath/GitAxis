# Contributing to GitAxis

Thank you for your interest in contributing to GitAxis! This document provides guidelines and instructions for setting up your local environment, building the extension, running tests, and submitting contributions.

---

## Prerequisites

Before getting started, ensure you have the following installed on your development machine:

- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **VS Code**: Visual Studio Code or VS Code Insiders (1.85.0+)
- **Git**: 2.30.0 or higher

---

## Development Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/MShrinath/GitAxis.git
   cd GitAxis
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Launch and Debug in VS Code**:
   - Open the project folder in VS Code (`code .`).
   - Press <kbd>F5</kbd> (or navigate to the **Run and Debug** view and select **"Run Extension"**).
   - A new VS Code **Extension Development Host** window will open with GitAxis loaded.
   - You can inspect the GitAxis sidebar under the activity bar icon and test changes live.

---

## Available Commands

GitAxis uses npm scripts to automate building, type-checking, and testing:

| Command | Description |
| ------- | ----------- |
| `npm run build` | Bundles the extension using `esbuild` into `dist/extension.js` for production. |
| `npm run watch` | Starts `esbuild` in incremental watch mode for rapid iteration. |
| `npm run typecheck` | Runs TypeScript compiler (`tsc --noEmit`) to verify type safety without emitting files. |
| `npm test` | Executes the complete test suite using Mocha and `ts-node`. |
| `npm run compile` | Runs TypeScript project compilation (`tsc -p ./`). |
| `npx @vscode/vsce package --no-dependencies` | Builds the `.vsix` extension package locally. |

---

## Guidelines for Contributions

### Code Standards
- **TypeScript**: All extension code is written in strict TypeScript. Avoid `any` where possible.
- **Zero Heavy Runtime Dependencies**: Keep the extension fast and lightweight. Favor Node.js built-ins and VS Code APIs over heavy third-party packages.
- **Architecture & Modularity**: Keep modules decoupled (e.g. `core/`, `providers/`, `ui/`).

### Security Practices
- **Never log or expose sensitive data**: Tokens, passwords, and sensitive URLs must be sanitized using the existing redaction utilities before logging or outputting.
- **Credential Storage**: Never store secrets in plaintext or `settings.json`. Always use `vscode.SecretStorage`.
- **Command Safety**: Always validate paths, branches, and arguments before invoking Git or external processes. Never construct shell strings directly with unescaped user inputs.

### Testing
- Any new features, bug fixes, or enhancements should be accompanied by unit tests under `test/`.
- Ensure all existing and new tests pass before submitting your pull request:
  ```bash
  npm run typecheck
  npm test
  ```

---

## Submitting a Pull Request

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/my-feature-name
   ```
2. Commit your changes with clear and descriptive commit messages.
3. Push your branch to your fork:
   ```bash
   git push origin feature/my-feature-name
   ```
4. Open a Pull Request against the `main` branch of `MShrinath/GitAxis`.
5. Fill out the pull request template with context, rationale, and verification steps. Verify that all CI checks pass.
