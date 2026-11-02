import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { OperationManager } from '../operations/operationManager';
import { GitClient } from '../git/gitClient';
import { createOperation } from '../contracts';
import { Validation } from '../utils/validation';
import { TagInfo } from '../git/tag';
import { getActiveWorkspaceRepoPath } from '../utils/workspace';
import { runLocalRepoOp } from './commandHelpers';

export function registerTagCommands(
  context: vscode.ExtensionContext,
  operationManager: OperationManager,
  gitClient: GitClient,
  onRefresh?: () => void
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('gitaxis.tag', async () => {
      const repoPath = await getActiveWorkspaceRepoPath(gitClient);
      if (!repoPath) {
        vscode.window.showErrorMessage('No workspace folder open.');
        return;
      }

      const action = await vscode.window.showQuickPick(
        [
          { label: 'Create Tag', action: 'create', description: 'Create a lightweight or annotated tag' },
          { label: 'List Tags', action: 'list', description: 'View tags in this repository' },
          { label: 'Push Tags', action: 'push', description: 'Push tags to remote origin' },
          { label: 'Delete Tag', action: 'delete', description: 'Delete a local tag' },
        ],
        { title: 'Git Tag Management' }
      );
      if (!action) return;

      if (action.action === 'create') {
        const name = await vscode.window.showInputBox({
          title: 'Create Tag',
          prompt: 'Enter tag name (e.g. v1.0.0)',
          validateInput: val => (Validation.isValidBranchName(val) ? undefined : 'Invalid tag name'),
        });
        if (!name) return;

        const message = await vscode.window.showInputBox({
          title: 'Tag Message',
          prompt: 'Optional annotation message (leave blank for lightweight tag)',
        });

        const target = await vscode.window.showInputBox({
          title: 'Target Commit',
          prompt: 'Optional commit ref/hash (default: HEAD)',
        });

        await runLocalRepoOp(
          operationManager,
          repoPath,
          'git.tag.create',
          {
            repositoryPath: repoPath,
            name: name.trim(),
            message: message?.trim() || undefined,
            target: target?.trim() || undefined,
          },
          `Tag "${name}" created.`,
          'Failed to create tag',
          onRefresh
        );
      } else if (action.action === 'list') {
        try {
          const tags: TagInfo[] = await gitClient.getTags(repoPath);
          if (tags.length === 0) {
            vscode.window.showInformationMessage('No tags found in repository.');
            return;
          }
          const items: vscode.QuickPickItem[] = tags.map(t => ({
            label: t.name,
          }));
          await vscode.window.showQuickPick(items, { title: `Repository Tags (${tags.length})` });
        } catch (err) {
          vscode.window.showErrorMessage(`Failed to list tags: ${String(err)}`);
        }
      } else if (action.action === 'delete') {
        try {
          const tags: TagInfo[] = await gitClient.getTags(repoPath);
          if (tags.length === 0) {
            vscode.window.showInformationMessage('No tags to delete.');
            return;
          }
          const items: vscode.QuickPickItem[] = tags.map(t => ({
            label: t.name,
          }));
          const selected = await vscode.window.showQuickPick(items, { title: 'Select Tag to Delete' });
          if (!selected) return;

          await runLocalRepoOp(
            operationManager,
            repoPath,
            'git.tag.delete',
            { repositoryPath: repoPath, name: selected.label },
            `Tag "${selected.label}" deleted.`,
            'Failed to delete tag',
            onRefresh
          );
        } catch (err) {
          vscode.window.showErrorMessage(`Failed to delete tag: ${String(err)}`);
        }
      } else if (action.action === 'push') {
        const op = createOperation({
          id: crypto.randomUUID(),
          type: 'git.push',
          input: { repositoryPath: repoPath, remote: 'origin', tags: true },
          target: { kind: 'remote', remoteName: 'origin' },
          safety: 'mutating',
          confirmation: { required: false },
          createdAt: new Date().toISOString(),
          initiatedBy: 'command-palette',
        });

        vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: 'GitAxis: Pushing tags to remote...' },
          async () => {
            const res = await operationManager.execute(op);
            if (res.success) {
              vscode.window.showInformationMessage('Tags pushed to remote.');
            } else {
              vscode.window.showErrorMessage(res.error?.userMessage || 'Failed to push tags');
            }
            onRefresh?.();
          }
        );
      }
    })
  );
}
