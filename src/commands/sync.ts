import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { OperationManager } from '../operations/operationManager';
import { createOperation } from '../contracts';
import { getActiveWorkspaceRepoPath } from '../utils/workspace';
import { runCancellableProgressOp } from './commandHelpers';

export function registerSyncCommands(
  context: vscode.ExtensionContext,
  operationManager: OperationManager,
  onRefresh?: () => void
): void {
  // Push
  context.subscriptions.push(
    vscode.commands.registerCommand('gitaxis.push', async () => {
      const repoPath = await getActiveWorkspaceRepoPath();
      if (!repoPath) return;

      const pushType = await vscode.window.showQuickPick(
        [
          { label: 'Normal Push', force: false, forceWithLease: false },
          { label: 'Force with Lease (Safer)', force: false, forceWithLease: true, description: 'Only overwrites if remote matches expected ref' },
          { label: 'Force Push', force: true, forceWithLease: false, description: 'May overwrite remote commits' },
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

      await runCancellableProgressOp(
        operationManager,
        op,
        'GitAxis: Pushing to remote...',
        'Push succeeded.',
        'Push failed',
        onRefresh
      );
    })
  );

  // Pull
  context.subscriptions.push(
    vscode.commands.registerCommand('gitaxis.pull', async () => {
      const repoPath = await getActiveWorkspaceRepoPath();
      if (!repoPath) return;

      const op = createRemoteSyncOp('git.pull', { repositoryPath: repoPath, remote: 'origin' });

      await runCancellableProgressOp(
        operationManager,
        op,
        'GitAxis: Pulling from remote...',
        'Pull succeeded.',
        'Pull failed',
        onRefresh
      );
    })
  );

  // Fetch
  context.subscriptions.push(
    vscode.commands.registerCommand('gitaxis.fetch', async () => {
      const repoPath = await getActiveWorkspaceRepoPath();
      if (!repoPath) return;

      const op = createRemoteSyncOp('git.fetch', { repositoryPath: repoPath, remote: 'origin', prune: true });

      await runCancellableProgressOp(
        operationManager,
        op,
        'GitAxis: Fetching remotes...',
        'Fetch completed.',
        'Fetch failed',
        onRefresh
      );
    })
  );
}

function createRemoteSyncOp(type: 'git.pull' | 'git.fetch', input: any) {
  return createOperation({
    id: crypto.randomUUID(),
    type,
    input,
    target: { kind: 'remote', remoteName: 'origin' },
    safety: 'mutating',
    confirmation: { required: false },
    createdAt: new Date().toISOString(),
    initiatedBy: 'command-palette',
  });
}
