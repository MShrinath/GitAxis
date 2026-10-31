import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { OperationManager } from '../operations/operationManager';
import { createOperation } from '../contracts';
import { Validation } from '../utils/validation';
import { getWorkspaceRepoPath } from '../utils/workspace';

export function registerBranchCommands(
  context: vscode.ExtensionContext,
  operationManager: OperationManager,
  onRefresh?: () => void
): void {
  // Create Branch
  context.subscriptions.push(
    vscode.commands.registerCommand('gitaxis.createBranch', async () => {
      const repoPath = getWorkspaceRepoPath();
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

      const op = createOperation({
        id: crypto.randomUUID(),
        type: 'git.branch.create',
        input: { repositoryPath: repoPath, name: name.trim(), checkout: checkout.value },
        target: { kind: 'local-repository', path: repoPath },
        safety: 'mutating',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
      });

      const res = await operationManager.execute(op);
      if (res.success) {
        vscode.window.showInformationMessage(`Branch "${name}" created.`);
      } else {
        vscode.window.showErrorMessage(res.error?.userMessage || 'Failed to create branch');
      }
      onRefresh?.();
    })
  );

  // Checkout Branch
  context.subscriptions.push(
    vscode.commands.registerCommand('gitaxis.checkoutBranch', async () => {
      const repoPath = getWorkspaceRepoPath();
      if (!repoPath) return;

      const ref = await vscode.window.showInputBox({
        title: 'Checkout Ref',
        prompt: 'Enter branch name or commit ref to checkout',
      });
      if (!ref) return;

      const op = createOperation({
        id: crypto.randomUUID(),
        type: 'git.checkout',
        input: { repositoryPath: repoPath, ref: ref.trim() },
        target: { kind: 'local-repository', path: repoPath },
        safety: 'mutating',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
      });

      const res = await operationManager.execute(op);
      if (res.success) {
        vscode.window.showInformationMessage(`Checked out "${ref}".`);
      } else {
        vscode.window.showErrorMessage(res.error?.userMessage || 'Checkout failed');
      }
      onRefresh?.();
    })
  );

  // Merge
  context.subscriptions.push(
    vscode.commands.registerCommand('gitaxis.merge', async () => {
      const repoPath = getWorkspaceRepoPath();
      if (!repoPath) return;

      const branch = await vscode.window.showInputBox({
        title: 'Git Merge',
        prompt: 'Enter branch name to merge into current branch',
      });
      if (!branch) return;

      const op = createOperation({
        id: crypto.randomUUID(),
        type: 'git.merge',
        input: { repositoryPath: repoPath, branch: branch.trim() },
        target: { kind: 'local-repository', path: repoPath },
        safety: 'mutating',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
      });

      const res = await operationManager.execute(op);
      if (res.success) {
        vscode.window.showInformationMessage(`Merged "${branch}" successfully.`);
      } else {
        vscode.window.showErrorMessage(res.error?.userMessage || 'Merge failed');
      }
      onRefresh?.();
    })
  );

  // Rebase
  context.subscriptions.push(
    vscode.commands.registerCommand('gitaxis.rebase', async () => {
      const repoPath = getWorkspaceRepoPath();
      if (!repoPath) return;

      const onto = await vscode.window.showInputBox({
        title: 'Git Rebase',
        prompt: 'Enter upstream branch to rebase onto (e.g. main, origin/main)',
      });
      if (!onto) return;

      const op = createOperation({
        id: crypto.randomUUID(),
        type: 'git.rebase',
        input: { repositoryPath: repoPath, onto: onto.trim() },
        target: { kind: 'local-repository', path: repoPath },
        safety: 'mutating',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
      });

      const res = await operationManager.execute(op);
      if (res.success) {
        vscode.window.showInformationMessage(`Rebased onto "${onto}" successfully.`);
      } else {
        vscode.window.showErrorMessage(res.error?.userMessage || 'Rebase failed');
      }
      onRefresh?.();
    })
  );
}
