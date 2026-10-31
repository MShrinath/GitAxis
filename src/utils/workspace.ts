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
 * falling back to the first workspace folder.
 */
export async function getActiveWorkspaceRepoPath(gitClient?: GitClient): Promise<string | undefined> {
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

  const defaultFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (defaultFolder && gitClient) {
    try {
      if (await gitClient.isRepository(defaultFolder)) {
        return await gitClient.getRoot(defaultFolder);
      }
    } catch {}
  }

  return defaultFolder;
}
