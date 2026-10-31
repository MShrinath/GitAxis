import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { OperationManager } from '../operations/operationManager';
import { createOperation } from '../contracts';

function getWorkspaceRepoPath(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

export function registerSyncCommands(
  context: vscode.ExtensionContext,
  operationManager: OperationManager,
  onRefresh?: () => void
): void {
  // Push
  context.subscriptions.push(
    vscode.commands.registerCommand('gitaxis.push', async () => {
      const repoPath = getWorkspaceRepoPath();
      if (!repoPath) return;

      const pushType = await vscode.window.showQuickPick(
        [
          { label: 'Normal Push', force: false, forceWithLease: false },
          { label: 'Force with Lease (Safer)', force: false, forceWithLease: true, description: 'Only overwrites if remote matches expected ref' },
          { label: 'Force Push ⚠️', force: true, forceWithLease: false, description: 'May overwrite remote commits' },
        ],
        { title: 'Git Push Options' }
      );
      if (!pushType) return;

      const op = createOperation({
        id: crypto.randomUUID(),
        type: 'git.push',
        input: {
          repositoryPath: repoPath,
          remote: 'origin',
          force: pushType.force,
          forceWithLease: pushType.forceWithLease,
        },
        target: { kind: 'remote', remoteName: 'origin' },
        safety: pushType.force ? 'destructive' : 'mutating',
        confirmation: pushType.force
          ? {
              required: true,
              reason: 'Force push can overwrite remote history.',
              warning: 'Remote commits may be permanently lost.',
            }
          : { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
      });

      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'GitAxis: Pushing to remote...',
        },
        async () => {
          const res = await operationManager.execute(op);
          if (res.success) {
            vscode.window.showInformationMessage('Push succeeded.');
          } else {
            vscode.window.showErrorMessage(res.error?.userMessage || 'Push failed');
          }
          if (res.warnings && res.warnings.length > 0) {
            for (const w of res.warnings) {
              vscode.window.showWarningMessage(`Warning: ${w.message}`);
            }
          }
          onRefresh?.();
        }
      );
    })
  );

  // Pull
  context.subscriptions.push(
    vscode.commands.registerCommand('gitaxis.pull', async () => {
      const repoPath = getWorkspaceRepoPath();
      if (!repoPath) return;

      const op = createOperation({
        id: crypto.randomUUID(),
        type: 'git.pull',
        input: { repositoryPath: repoPath, remote: 'origin' },
        target: { kind: 'remote', remoteName: 'origin' },
        safety: 'mutating',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
      });

      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'GitAxis: Pulling from remote...',
        },
        async () => {
          const res = await operationManager.execute(op);
          if (res.success) {
            vscode.window.showInformationMessage('Pull succeeded.');
          } else {
            vscode.window.showErrorMessage(res.error?.userMessage || 'Pull failed');
          }
          onRefresh?.();
        }
      );
    })
  );

  // Fetch
  context.subscriptions.push(
    vscode.commands.registerCommand('gitaxis.fetch', async () => {
      const repoPath = getWorkspaceRepoPath();
      if (!repoPath) return;

      const op = createOperation({
        id: crypto.randomUUID(),
        type: 'git.fetch',
        input: { repositoryPath: repoPath, remote: 'origin', prune: true },
        target: { kind: 'remote', remoteName: 'origin' },
        safety: 'mutating',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
      });

      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'GitAxis: Fetching remotes...',
        },
        async () => {
          const res = await operationManager.execute(op);
          if (res.success) {
            vscode.window.showInformationMessage('Fetch completed.');
          } else {
            vscode.window.showErrorMessage(res.error?.userMessage || 'Fetch failed');
          }
          onRefresh?.();
        }
      );
    })
  );
}
