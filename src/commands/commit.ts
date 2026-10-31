import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { OperationManager } from '../operations/operationManager';
import { createOperation } from '../contracts';

function getWorkspaceRepoPath(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

export function registerCommitCommands(
  context: vscode.ExtensionContext,
  operationManager: OperationManager,
  onRefresh?: () => void
): void {
  // Commit
  context.subscriptions.push(
    vscode.commands.registerCommand('gitaxis.commit', async () => {
      const repoPath = getWorkspaceRepoPath();
      if (!repoPath) return;

      const message = await vscode.window.showInputBox({
        title: 'Git Commit',
        prompt: 'Enter commit message',
        validateInput: val => (val.trim().length > 0 ? undefined : 'Commit message cannot be empty'),
      });
      if (!message) return;

      const stageAllPick = await vscode.window.showQuickPick(
        [
          { label: 'Stage All and Commit', stageAll: true },
          { label: 'Commit Staged Changes Only', stageAll: false },
        ],
        { title: 'Staging options' }
      );
      if (!stageAllPick) return;

      if (stageAllPick.stageAll) {
        const addOp = createOperation({
          id: crypto.randomUUID(),
          type: 'git.add',
          input: { repositoryPath: repoPath, paths: [], all: true },
          target: { kind: 'local-repository', path: repoPath },
          safety: 'mutating',
          confirmation: { required: false },
          createdAt: new Date().toISOString(),
          initiatedBy: 'command-palette',
        });
        await operationManager.execute(addOp);
      }

      const commitOp = createOperation({
        id: crypto.randomUUID(),
        type: 'git.commit',
        input: { repositoryPath: repoPath, message: message.trim() },
        target: { kind: 'local-repository', path: repoPath },
        safety: 'mutating',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
      });

      const res = await operationManager.execute(commitOp);
      if (res.success) {
        vscode.window.showInformationMessage(`Committed: "${message}"`);
      } else {
        vscode.window.showErrorMessage(res.error?.userMessage || 'Commit failed');
      }
      onRefresh?.();
    })
  );
}
