import * as vscode from 'vscode';
import { OperationManager } from '../operations/operationManager';
import { Validation } from '../utils/validation';
import { getActiveWorkspaceRepoPath } from '../utils/workspace';
import { runLocalRepoOp } from './commandHelpers';

export function registerBranchCommands(
  context: vscode.ExtensionContext,
  operationManager: OperationManager,
  onRefresh?: () => void
): void {
  // Create Branch
  context.subscriptions.push(
    vscode.commands.registerCommand('gitaxis.createBranch', async () => {
      const repoPath = await getActiveWorkspaceRepoPath();
      if (!repoPath) return;

      const name = await vscode.window.showInputBox({
        title: 'Create Branch',
        prompt: 'Enter new branch name',
        validateInput: val => (Validation.isValidBranchName(val) ? undefined : 'Invalid branch name'),
      });
      if (!name) return;

      const checkout = await vscode.window.showQuickPick(
        [
          { label: 'Yes', value: true, description: 'Switch to new branch immediately' },
          { label: 'No', value: false, description: 'Stay on current branch' },
        ],
        { title: 'Checkout new branch?' }
      );
      if (!checkout) return;

      await runLocalRepoOp(
        operationManager,
        repoPath,
        'git.branch.create',
        { repositoryPath: repoPath, name: name.trim(), checkout: checkout.value },
        `Branch "${name}" created.`,
        'Failed to create branch',
        onRefresh
      );
    })
  );

  // Checkout Branch
  context.subscriptions.push(
    vscode.commands.registerCommand('gitaxis.checkoutBranch', async () => {
      const repoPath = await getActiveWorkspaceRepoPath();
      if (!repoPath) return;

      const ref = await vscode.window.showInputBox({
        title: 'Checkout Ref',
        prompt: 'Enter branch name or commit ref to checkout',
      });
      if (!ref) return;

      await runLocalRepoOp(
        operationManager,
        repoPath,
        'git.checkout',
        { repositoryPath: repoPath, ref: ref.trim() },
        `Checked out "${ref}".`,
        'Checkout failed',
        onRefresh
      );
    })
  );

  // Merge
  context.subscriptions.push(
    vscode.commands.registerCommand('gitaxis.merge', async () => {
      const repoPath = await getActiveWorkspaceRepoPath();
      if (!repoPath) return;

      const branch = await vscode.window.showInputBox({
        title: 'Git Merge',
        prompt: 'Enter branch name to merge into current branch',
      });
      if (!branch) return;

      await runLocalRepoOp(
        operationManager,
        repoPath,
        'git.merge',
        { repositoryPath: repoPath, branch: branch.trim() },
        `Merged "${branch}" successfully.`,
        'Merge failed',
        onRefresh
      );
    })
  );

  // Rebase
  context.subscriptions.push(
    vscode.commands.registerCommand('gitaxis.rebase', async () => {
      const repoPath = await getActiveWorkspaceRepoPath();
      if (!repoPath) return;

      const onto = await vscode.window.showInputBox({
        title: 'Git Rebase',
        prompt: 'Enter upstream branch to rebase onto (e.g. main, origin/main)',
      });
      if (!onto) return;

      await runLocalRepoOp(
        operationManager,
        repoPath,
        'git.rebase',
        { repositoryPath: repoPath, onto: onto.trim() },
        `Rebased onto "${onto}" successfully.`,
        'Rebase failed',
        onRefresh
      );
    })
  );
}
