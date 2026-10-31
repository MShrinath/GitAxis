import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { OperationManager } from '../operations/operationManager';
import { createOperation, RepositoryStatus } from '../contracts';

import { ProfileManager } from '../profiles/profileManager';
import { getWorkspaceRepoPath } from '../utils/workspace';

export function registerRepositoryCommands(
  context: vscode.ExtensionContext,
  operationManager: OperationManager,
  profileManager: ProfileManager,
  onRefresh?: () => void
): void {
  // Status
  context.subscriptions.push(
    vscode.commands.registerCommand('gitaxis.status', async () => {
      const repoPath = getWorkspaceRepoPath();
      if (!repoPath) {
        vscode.window.showErrorMessage('No workspace folder open.');
        return;
      }

      const op = createOperation({
        id: crypto.randomUUID(),
        type: 'git.status',
        input: { repositoryPath: repoPath },
        target: { kind: 'local-repository', path: repoPath },
        safety: 'read-only',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
      });

      const res = await operationManager.execute<RepositoryStatus>(op);
      if (res.success && res.data) {
        vscode.window.showInformationMessage(
          `Status: ${res.data.clean ? 'Clean' : `${res.data.modified} modified, ${res.data.staged} staged, ${res.data.untracked} untracked`}`
        );
      } else {
        vscode.window.showErrorMessage(res.error?.userMessage || 'Failed to get status');
      }
      onRefresh?.();
    })
  );

  // Reset
  context.subscriptions.push(
    vscode.commands.registerCommand('gitaxis.reset', async () => {
      const repoPath = getWorkspaceRepoPath();
      if (!repoPath) return;

      const modePick = await vscode.window.showQuickPick(
        [
          { label: 'mixed (Default)', mode: 'mixed' as const, description: 'Resets index but keeps working tree changes' },
          { label: 'soft', mode: 'soft' as const, description: 'Keeps all changes staged' },
          { label: 'hard ⚠️', mode: 'hard' as const, description: 'DISCARDS all uncommitted changes' },
        ],
        { title: 'Select Reset Mode' }
      );
      if (!modePick) return;

      const ref = await vscode.window.showInputBox({
        title: 'Git Reset',
        prompt: 'Enter commit or ref to reset to',
        value: 'HEAD',
      });
      if (!ref) return;

      const op = createOperation({
        id: crypto.randomUUID(),
        type: 'git.reset',
        input: { repositoryPath: repoPath, ref, mode: modePick.mode },
        target: { kind: 'local-repository', path: repoPath },
        safety: modePick.mode === 'hard' ? 'destructive' : 'mutating',
        confirmation:
          modePick.mode === 'hard'
            ? { required: true, reason: `git reset --hard ${ref}`, warning: 'All uncommitted changes will be discarded.' }
            : { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
      });

      const res = await operationManager.execute(op);
      if (res.success) {
        vscode.window.showInformationMessage(`Reset to ${ref} (${modePick.mode}) succeeded.`);
      } else {
        vscode.window.showErrorMessage(res.error?.userMessage || 'Reset failed');
      }
      onRefresh?.();
    })
  );

  // Manage Remote
  context.subscriptions.push(
    vscode.commands.registerCommand('gitaxis.manageRemote', async () => {
      const repoPath = getWorkspaceRepoPath();
      if (!repoPath) return;

      const action = await vscode.window.showQuickPick(
        [
          { label: 'Add Remote', action: 'add' },
          { label: 'Change Remote URL', action: 'setUrl' },
          { label: 'Remove Remote', action: 'remove' },
        ],
        { title: 'Remote Management' }
      );
      if (!action) return;

      if (action.action === 'add') {
        const name = await vscode.window.showInputBox({ prompt: 'Remote name', value: 'origin' });
        if (!name) return;
        const url = await vscode.window.showInputBox({ prompt: 'Remote URL' });
        if (!url) return;

        const op = createOperation({
          id: crypto.randomUUID(),
          type: 'git.remote.add',
          input: { repositoryPath: repoPath, name, url },
          target: { kind: 'local-repository', path: repoPath },
          safety: 'mutating',
          confirmation: { required: false },
          createdAt: new Date().toISOString(),
          initiatedBy: 'command-palette',
        });
        const res = await operationManager.execute(op);
        if (res.success) vscode.window.showInformationMessage(`Remote "${name}" added.`);
        else vscode.window.showErrorMessage(res.error?.userMessage || 'Failed to add remote');
      } else if (action.action === 'setUrl') {
        const name = await vscode.window.showInputBox({ prompt: 'Remote name', value: 'origin' });
        if (!name) return;
        const url = await vscode.window.showInputBox({ prompt: 'New Remote URL' });
        if (!url) return;

        const op = createOperation({
          id: crypto.randomUUID(),
          type: 'git.remote.set-url',
          input: { repositoryPath: repoPath, name, url },
          target: { kind: 'local-repository', path: repoPath },
          safety: 'mutating',
          confirmation: { required: false },
          createdAt: new Date().toISOString(),
          initiatedBy: 'command-palette',
        });
        const res = await operationManager.execute(op);
        if (res.success) vscode.window.showInformationMessage(`Remote "${name}" URL updated.`);
        else vscode.window.showErrorMessage(res.error?.userMessage || 'Failed to update remote URL');
      } else if (action.action === 'remove') {
        const name = await vscode.window.showInputBox({ prompt: 'Remote name to remove' });
        if (!name) return;

        const op = createOperation({
          id: crypto.randomUUID(),
          type: 'git.remote.remove',
          input: { repositoryPath: repoPath, name },
          target: { kind: 'local-repository', path: repoPath },
          safety: 'mutating',
          confirmation: { required: false },
          createdAt: new Date().toISOString(),
          initiatedBy: 'command-palette',
        });
        const res = await operationManager.execute(op);
        if (res.success) vscode.window.showInformationMessage(`Remote "${name}" removed.`);
        else vscode.window.showErrorMessage(res.error?.userMessage || 'Failed to remove remote');
      }
      onRefresh?.();
    })
  );

  // Diff
  let diffOutputChannel: vscode.OutputChannel | undefined;
  context.subscriptions.push(
    vscode.commands.registerCommand('gitaxis.diff', async () => {
      const repoPath = getWorkspaceRepoPath();
      if (!repoPath) {
        vscode.window.showErrorMessage('No workspace folder open.');
        return;
      }

      const diffType = await vscode.window.showQuickPick(
        [
          { label: 'Working Tree Diff', staged: false, description: 'Unstaged changes' },
          { label: 'Staged Changes Diff', staged: true, description: 'Staged changes (--staged)' },
        ],
        { title: 'Git Diff' }
      );
      if (!diffType) return;

      const op = createOperation({
        id: crypto.randomUUID(),
        type: 'git.diff',
        input: { repositoryPath: repoPath, staged: diffType.staged },
        target: { kind: 'local-repository', path: repoPath },
        safety: 'read-only',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
      });

      const res = await operationManager.execute<string>(op);
      if (res.success) {
        const diffText = res.data?.trim();
        if (!diffText) {
          vscode.window.showInformationMessage(`No ${diffType.staged ? 'staged' : 'unstaged'} changes detected.`);
        } else {
          if (!diffOutputChannel) {
            diffOutputChannel = vscode.window.createOutputChannel('GitAxis: Diff');
          }
          diffOutputChannel.clear();
          diffOutputChannel.appendLine(diffText);
          diffOutputChannel.show();
        }
      } else {
        vscode.window.showErrorMessage(res.error?.userMessage || 'Failed to get diff');
      }
    })
  );

  // History
  context.subscriptions.push(
    vscode.commands.registerCommand('gitaxis.history', async () => {
      const repoPath = getWorkspaceRepoPath();
      if (!repoPath) {
        vscode.window.showErrorMessage('No workspace folder open.');
        return;
      }

      const op = createOperation({
        id: crypto.randomUUID(),
        type: 'git.log',
        input: { repositoryPath: repoPath, maxCount: 30 },
        target: { kind: 'local-repository', path: repoPath },
        safety: 'read-only',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
      });

      const res = await operationManager.execute<any[]>(op);
      if (res.success && res.data) {
        if (res.data.length === 0) {
          vscode.window.showInformationMessage('No commit history found.');
          return;
        }

        const items = res.data.map((c: any) => ({
          label: c.subject,
          description: `${c.authorName} · ${c.hash.slice(0, 7)}`,
          detail: `${c.authorDate} (${c.authorEmail})`,
          commit: c,
        }));

        const selected = await vscode.window.showQuickPick(items, {
          title: `Commit History (${res.data.length} recent commits)`,
          placeHolder: 'Select a commit to view details',
        });

        if (selected) {
          const copyAction = 'Copy Commit Hash';
          const choice = await vscode.window.showInformationMessage(
            `Commit ${selected.commit.hash}\n\nAuthor: ${selected.commit.authorName} <${selected.commit.authorEmail}>\nDate: ${selected.commit.authorDate}\n\n${selected.commit.subject}`,
            copyAction
          );
          if (choice === copyAction) {
            await vscode.env.clipboard.writeText(selected.commit.hash);
            vscode.window.showInformationMessage('Commit hash copied to clipboard.');
          }
        }
      } else {
        vscode.window.showErrorMessage(res.error?.userMessage || 'Failed to load history');
      }
    })
  );

  // Clone
  context.subscriptions.push(
    vscode.commands.registerCommand('gitaxis.clone', async () => {
      const profiles = await profileManager.getProfiles();
      let selectedProfileId: string | undefined;

      if (profiles.length > 0) {
        const active = await profileManager.getActiveProfile();
        const profileItems = profiles.map(p => ({
          label: `${p.id === active?.id ? '$(check) ' : ''}${p.name}`,
          description: `${p.git.name} <${p.git.email}>`,
          profileId: p.id,
        }));

        const chosenProfile = await vscode.window.showQuickPick(profileItems, {
          title: 'Clone Repository (1/3): Select Profile',
        });
        if (!chosenProfile) return;
        selectedProfileId = chosenProfile.profileId;
      }

      const url = await vscode.window.showInputBox({
        title: 'Clone Repository (2/3)',
        prompt: 'Enter Git repository URL to clone (HTTPS or SSH)',
        validateInput: val => (val.trim().length > 0 ? undefined : 'Repository URL is required'),
      });
      if (!url) return;

      const folderUri = await vscode.window.showOpenDialog({
        title: 'Clone Repository (3/3): Select Destination Directory',
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Select Clone Location',
      });
      if (!folderUri || folderUri.length === 0) return;

      const destBase = folderUri[0].fsPath;
      const repoNameMatch = /\/([^/]+?)(?:\.git)?$/.exec(url.trim());
      const repoSubfolder = repoNameMatch ? repoNameMatch[1] : 'repository';
      const targetPath = `${destBase}/${repoSubfolder}`.replace(/\\/g, '/');

      let cloneUrl = url.trim();
      const selectedProfile = selectedProfileId ? await profileManager.getProfile(selectedProfileId) : undefined;
      const ghUser = selectedProfile?.github?.username?.trim();
      if (ghUser && cloneUrl.startsWith('https://') && !cloneUrl.includes('@')) {
        cloneUrl = cloneUrl.replace(/^https:\/\//i, `https://${ghUser}@`);
      }

      const op = createOperation({
        id: crypto.randomUUID(),
        type: 'git.clone',
        profileId: selectedProfileId,
        input: { url: cloneUrl, destinationPath: targetPath },
        target: { kind: 'none' },
        safety: 'mutating',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
      });

      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `GitAxis: Cloning ${url.trim()}...`,
          cancellable: true,
        },
        async (_progress, token) => {
          token.onCancellationRequested(() => {
            operationManager.cancel(op.id);
          });
          const res = await operationManager.execute(op);
          if (res.success) {
            if (selectedProfileId) {
              await profileManager.associateRepository(targetPath, selectedProfileId);
              const p = await profileManager.getProfile(selectedProfileId);
              if (p) {
                await profileManager.applyIdentityToRepository(p, targetPath);
              }
            }
            const openAction = 'Open in New Window';
            const choice = await vscode.window.showInformationMessage(
              `Cloned successfully into ${targetPath}`,
              openAction
            );
            if (choice === openAction) {
              await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(targetPath), true);
            }
            onRefresh?.();
          } else {
            vscode.window.showErrorMessage(res.error?.userMessage || 'Clone failed');
          }
        }
      );
    })
  );
}
