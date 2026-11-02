import * as path from 'path';
import * as vscode from 'vscode';
import { GitClient } from '../git/gitClient';

/**
 * Synchronously resolves the active workspace folder path from the active editor,
 * falling back to the first workspace folder.
 */
export function getWorkspaceRepoPath(): string | undefined {
  const activeUri = vscode.window.activeTextEditor?.document.uri;
  if (activeUri && activeUri.scheme === 'file') {
    const folder = vscode.workspace.getWorkspaceFolder(activeUri);
    if (folder) return folder.uri.fsPath;
  }
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

/**
 * Asynchronously resolves the active repository root path from the active editor in multi-root workspaces,
 * prompting the user with a QuickPick if multiple repositories are open and no editor resolves the active repo.
 */
export async function getActiveWorkspaceRepoPath(
  gitClient?: GitClient,
  options: { promptIfMultiple?: boolean } = { promptIfMultiple: true }
): Promise<string | undefined> {
  const activeUri = vscode.window.activeTextEditor?.document.uri;
  if (activeUri && activeUri.scheme === 'file') {
    const folder = vscode.workspace.getWorkspaceFolder(activeUri);
    if (folder) {
      if (gitClient) {
        try {
          if (await gitClient.isRepository(folder.uri.fsPath)) {
            return await gitClient.getRoot(folder.uri.fsPath);
          }
        } catch {}
      }
      return folder.uri.fsPath;
    }

    // Active document is outside workspace folders; inspect its directory
    if (gitClient) {
      try {
        const fileDir = path.dirname(activeUri.fsPath);
        if (await gitClient.isRepository(fileDir)) {
          return await gitClient.getRoot(fileDir);
        }
      } catch {}
    }
  }

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return undefined;
  }

  if (workspaceFolders.length > 1 && options.promptIfMultiple) {
    const repoCandidates: { root: string; name: string }[] = [];
    for (const folder of workspaceFolders) {
      const folderPath = folder.uri.fsPath;
      if (gitClient) {
        try {
          if (await gitClient.isRepository(folderPath)) {
            const root = await gitClient.getRoot(folderPath);
            if (!repoCandidates.some(c => c.root === root)) {
              repoCandidates.push({ root, name: folder.name });
            }
          }
        } catch {}
      } else {
        repoCandidates.push({ root: folderPath, name: folder.name });
      }
    }

    if (repoCandidates.length > 1) {
      const selected = await vscode.window.showQuickPick(
        repoCandidates.map(c => ({
          label: `$(repo) ${c.name}`,
          description: c.root,
          root: c.root,
        })),
        {
          placeHolder: 'Select repository for Git operation',
          title: 'Multi-Root Workspace: Choose Repository',
        }
      );
      return selected?.root;
    } else if (repoCandidates.length === 1) {
      return repoCandidates[0].root;
    }
  }

  const defaultFolder = workspaceFolders[0].uri.fsPath;
  if (defaultFolder && gitClient) {
    try {
      if (await gitClient.isRepository(defaultFolder)) {
        return await gitClient.getRoot(defaultFolder);
      }
    } catch {}
  }

  return defaultFolder;
}

/**
 * Prompts the user for confirmation when about to modify global Git identity.
 */
export async function confirmGlobalGitChange(): Promise<boolean> {
  const continueBtn = 'Continue';
  const choice = await vscode.window.showWarningMessage(
    "You're about to change your global Git identity.",
    { modal: true, detail: "This affects repositories that don't override their local Git identity." },
    continueBtn
  );
  return choice === continueBtn;
}

