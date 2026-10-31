import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { OperationManager } from '../operations/operationManager';
import { createOperation } from '../contracts';
import { getWorkspaceRepoPath } from '../utils/workspace';

export function registerStashCommands(
  context: vscode.ExtensionContext,
  operationManager: OperationManager,
  onRefresh?: () => void
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('gitaxis.stash', async () => {
      const repoPath = getWorkspaceRepoPath();
      if (!repoPath) return;

      const action = await vscode.window.showQuickPick(
        [
          { label: 'Stash changes (push)', action: 'create' },
          { label: 'Pop stash (stash@{0})', action: 'pop' },
          { label: 'Apply stash', action: 'apply' },
          { label: 'Drop stash ⚠️', action: 'drop' },
        ],
        { title: 'Git Stash Options' }
      );
      if (!action) return;

      if (action.action === 'create') {
        const msg = await vscode.window.showInputBox({ prompt: 'Optional stash message' });
        const op = createOperation({
          id: crypto.randomUUID(),
          type: 'git.stash.create',
          input: { repositoryPath: repoPath, message: msg, includeUntracked: true },
          target: { kind: 'local-repository', path: repoPath },
          safety: 'mutating',
          confirmation: { required: false },
          createdAt: new Date().toISOString(),
          initiatedBy: 'command-palette',
        });
        const res = await operationManager.execute(op);
        if (res.success) vscode.window.showInformationMessage('Stashed successfully.');
        else vscode.window.showErrorMessage(res.error?.userMessage || 'Stash failed');
      } else if (action.action === 'pop') {
        const op = createOperation({
          id: crypto.randomUUID(),
          type: 'git.stash.pop',
          input: { repositoryPath: repoPath, stash: 'stash@{0}' },
          target: { kind: 'local-repository', path: repoPath },
          safety: 'mutating',
          confirmation: { required: false },
          createdAt: new Date().toISOString(),
          initiatedBy: 'command-palette',
        });
        const res = await operationManager.execute(op);
        if (res.success) vscode.window.showInformationMessage('Stash popped successfully.');
        else vscode.window.showErrorMessage(res.error?.userMessage || 'Stash pop failed');
      } else if (action.action === 'apply') {
        const op = createOperation({
          id: crypto.randomUUID(),
          type: 'git.stash.apply',
          input: { repositoryPath: repoPath, stash: 'stash@{0}' },
          target: { kind: 'local-repository', path: repoPath },
          safety: 'mutating',
          confirmation: { required: false },
          createdAt: new Date().toISOString(),
          initiatedBy: 'command-palette',
        });
        const res = await operationManager.execute(op);
        if (res.success) vscode.window.showInformationMessage('Stash applied successfully.');
        else vscode.window.showErrorMessage(res.error?.userMessage || 'Stash apply failed');
      } else if (action.action === 'drop') {
        const op = createOperation({
          id: crypto.randomUUID(),
          type: 'git.stash.drop',
          input: { repositoryPath: repoPath, stash: 'stash@{0}' },
          target: { kind: 'local-repository', path: repoPath },
          safety: 'destructive',
          confirmation: {
            required: true,
            reason: 'Drop stash@{0}',
            warning: 'Stashed changes will be permanently discarded.',
          },
          createdAt: new Date().toISOString(),
          initiatedBy: 'command-palette',
        });
        const res = await operationManager.execute(op);
        if (res.success) vscode.window.showInformationMessage('Stash dropped.');
        else vscode.window.showErrorMessage(res.error?.userMessage || 'Stash drop failed');
      }
      onRefresh?.();
    })
  );
}
