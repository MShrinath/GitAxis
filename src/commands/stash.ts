import * as vscode from 'vscode';
import { OperationManager } from '../operations/operationManager';
import { getActiveWorkspaceRepoPath } from '../utils/workspace';
import { runLocalRepoOp } from './commandHelpers';

export function registerStashCommands(
  context: vscode.ExtensionContext,
  operationManager: OperationManager,
  onRefresh?: () => void
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('gitaxis.stash', async () => {
      const repoPath = await getActiveWorkspaceRepoPath();
      if (!repoPath) return;

      const action = await vscode.window.showQuickPick(
        [
          { label: 'Stash changes (push)', action: 'create' },
          { label: 'Pop stash (stash@{0})', action: 'pop' },
          { label: 'Apply stash', action: 'apply' },
          { label: 'Drop stash', action: 'drop' },
        ],
        { title: 'Git Stash Options' }
      );
      if (!action) return;

      if (action.action === 'create') {
        const msg = await vscode.window.showInputBox({ prompt: 'Optional stash message' });
        await runLocalRepoOp(
          operationManager,
          repoPath,
          'git.stash.create',
          { repositoryPath: repoPath, message: msg, includeUntracked: true },
          'Stashed successfully.',
          'Stash failed',
          onRefresh
        );
      } else if (action.action === 'pop') {
        await runLocalRepoOp(
          operationManager,
          repoPath,
          'git.stash.pop',
          { repositoryPath: repoPath, stash: 'stash@{0}' },
          'Stash popped successfully.',
          'Stash pop failed',
          onRefresh
        );
      } else if (action.action === 'apply') {
        await runLocalRepoOp(
          operationManager,
          repoPath,
          'git.stash.apply',
          { repositoryPath: repoPath, stash: 'stash@{0}' },
          'Stash applied successfully.',
          'Stash apply failed',
          onRefresh
        );
      } else if (action.action === 'drop') {
        await runLocalRepoOp(
          operationManager,
          repoPath,
          'git.stash.drop',
          { repositoryPath: repoPath, stash: 'stash@{0}' },
          'Stash dropped.',
          'Stash drop failed',
          onRefresh,
          {
            safety: 'destructive',
            confirmation: {
              required: true,
              reason: 'Drop stash@{0}',
              warning: 'Stashed changes will be permanently discarded.',
            },
          }
        );
      }
    })
  );
}
