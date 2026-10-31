import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { OperationManager } from '../operations/operationManager';
import { RepositoryDiscovery } from '../discovery/repositoryDiscovery';
import { createOperation } from '../contracts';
import { getActiveWorkspaceRepoPath } from '../utils/workspace';

export function registerGitHubCommands(
  context: vscode.ExtensionContext,
  operationManager: OperationManager,
  repoDiscovery: RepositoryDiscovery
): void {
  // Open GitHub Repository in browser
  context.subscriptions.push(
    vscode.commands.registerCommand('gitaxis.openGitHubRepo', async () => {
      const repoPath = await getActiveWorkspaceRepoPath();
      if (!repoPath) return;

      const repo = await repoDiscovery.detectRepository(repoPath);
      const origin = repo?.remotes.find(r => r.name === 'origin') || repo?.remotes[0];

      if (!origin || !origin.owner || !origin.repository) {
        vscode.window.showWarningMessage('No GitHub remote found for this repository.');
        return;
      }

      const host = origin.host || 'github.com';
      const url = `https://${host}/${origin.owner}/${origin.repository}`;
      await vscode.env.openExternal(vscode.Uri.parse(url));
    })
  );

  // Create GitHub Issue
  context.subscriptions.push(
    vscode.commands.registerCommand('gitaxis.createIssue', async () => {
      const repoPath = await getActiveWorkspaceRepoPath();
      if (!repoPath) return;

      const repo = await repoDiscovery.detectRepository(repoPath);
      const origin = repo?.remotes.find(r => r.name === 'origin') || repo?.remotes[0];

      if (!origin || !origin.owner || !origin.repository) {
        vscode.window.showWarningMessage('No GitHub remote configured.');
        return;
      }

      const title = await vscode.window.showInputBox({
        title: 'Create GitHub Issue',
        prompt: 'Enter issue title',
        validateInput: val => (val.trim().length > 0 ? undefined : 'Title cannot be empty'),
      });
      if (!title) return;

      const body = await vscode.window.showInputBox({
        title: 'Create GitHub Issue',
        prompt: 'Enter issue description (optional)',
      });

      const op = createOperation({
        id: crypto.randomUUID(),
        type: 'github.issue.create',
        input: {
          host: origin.host,
          owner: origin.owner,
          repository: origin.repository,
          title: title.trim(),
          body: body?.trim(),
        },
        target: {
          kind: 'github-repository',
          host: origin.host || 'github.com',
          owner: origin.owner,
          repository: origin.repository,
        },
        safety: 'mutating',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
      });

      vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'GitAxis: Creating GitHub issue...' },
        async () => {
          const res = await operationManager.execute<any>(op);
          if (res.success && res.data) {
            const action = 'Open Issue';
            const choice = await vscode.window.showInformationMessage(
              `Issue #${res.data.number} created: ${res.data.title}`,
              action
            );
            if (choice === action && res.data.htmlUrl) {
              await vscode.env.openExternal(vscode.Uri.parse(res.data.htmlUrl));
            }
          } else {
            vscode.window.showErrorMessage(res.error?.userMessage || 'Failed to create issue');
          }
        }
      );
    })
  );

  // Create Pull Request
  context.subscriptions.push(
    vscode.commands.registerCommand('gitaxis.createPullRequest', async () => {
      const repoPath = await getActiveWorkspaceRepoPath();
      if (!repoPath) return;

      const repo = await repoDiscovery.detectRepository(repoPath);
      const origin = repo?.remotes.find(r => r.name === 'origin') || repo?.remotes[0];

      if (!origin || !origin.owner || !origin.repository) {
        vscode.window.showWarningMessage('No GitHub remote configured.');
        return;
      }

      const currentBranch = repo?.currentBranch || 'main';

      const title = await vscode.window.showInputBox({
        title: 'Create Pull Request',
        prompt: 'Enter Pull Request title',
        value: `Update from ${currentBranch}`,
        validateInput: val => (val.trim().length > 0 ? undefined : 'Title cannot be empty'),
      });
      if (!title) return;

      const base = await vscode.window.showInputBox({
        title: 'Target Branch (Base)',
        prompt: 'Enter base branch',
        value: 'main',
      });
      if (!base) return;

      const body = await vscode.window.showInputBox({
        title: 'Pull Request Description',
        prompt: 'Enter description (optional)',
      });

      const op = createOperation({
        id: crypto.randomUUID(),
        type: 'github.pull-request.create',
        input: {
          host: origin.host,
          owner: origin.owner,
          repository: origin.repository,
          title: title.trim(),
          head: currentBranch,
          base: base.trim(),
          body: body?.trim(),
        },
        target: {
          kind: 'github-repository',
          host: origin.host || 'github.com',
          owner: origin.owner,
          repository: origin.repository,
        },
        safety: 'mutating',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
      });

      vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'GitAxis: Creating Pull Request...' },
        async () => {
          const res = await operationManager.execute<any>(op);
          if (res.success && res.data) {
            const action = 'Open PR';
            const choice = await vscode.window.showInformationMessage(
              `Pull Request #${res.data.number} created!`,
              action
            );
            if (choice === action && res.data.htmlUrl) {
              await vscode.env.openExternal(vscode.Uri.parse(res.data.htmlUrl));
            }
          } else {
            vscode.window.showErrorMessage(res.error?.userMessage || 'Failed to create pull request');
          }
        }
      );
    })
  );

  // View GitHub Actions
  context.subscriptions.push(
    vscode.commands.registerCommand('gitaxis.actions', async () => {
      const repoPath = await getActiveWorkspaceRepoPath();
      if (!repoPath) return;

      const repo = await repoDiscovery.detectRepository(repoPath);
      const origin = repo?.remotes.find(r => r.name === 'origin') || repo?.remotes[0];

      if (!origin || !origin.owner || !origin.repository) {
        vscode.window.showWarningMessage('No GitHub remote configured.');
        return;
      }

      const op = createOperation({
        id: crypto.randomUUID(),
        type: 'github.actions.list',
        input: {
          host: origin.host,
          owner: origin.owner,
          repository: origin.repository,
        },
        target: {
          kind: 'github-repository',
          host: origin.host || 'github.com',
          owner: origin.owner,
          repository: origin.repository,
        },
        safety: 'read-only',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
      });

      vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'GitAxis: Fetching GitHub Actions...' },
        async () => {
          const res = await operationManager.execute<any[]>(op);
          if (res.success && res.data) {
            if (res.data.length === 0) {
              vscode.window.showInformationMessage('No workflow runs found.');
              return;
            }
            const items = res.data.map(run => ({
              label: `${run.status === 'completed' && run.conclusion === 'success' ? '✓' : '●'} ${run.name}`,
              description: `Status: ${run.status} · Conclusion: ${run.conclusion || 'pending'}`,
              detail: `Branch: ${run.headBranch || '—'}`,
              htmlUrl: run.htmlUrl,
            }));
            const selected = await vscode.window.showQuickPick(items, {
              title: `GitHub Actions Runs (${res.data.length})`,
              placeHolder: 'Select a workflow run to view in browser',
            });
            if (selected?.htmlUrl) {
              await vscode.env.openExternal(vscode.Uri.parse(selected.htmlUrl));
            }
          } else {
            vscode.window.showErrorMessage(res.error?.userMessage || 'Failed to list actions');
          }
        }
      );
    })
  );

  // View GitHub Releases
  context.subscriptions.push(
    vscode.commands.registerCommand('gitaxis.releases', async () => {
      const repoPath = await getActiveWorkspaceRepoPath();
      if (!repoPath) return;

      const repo = await repoDiscovery.detectRepository(repoPath);
      const origin = repo?.remotes.find(r => r.name === 'origin') || repo?.remotes[0];

      if (!origin || !origin.owner || !origin.repository) {
        vscode.window.showWarningMessage('No GitHub remote configured.');
        return;
      }

      const op = createOperation({
        id: crypto.randomUUID(),
        type: 'github.release.list',
        input: {
          host: origin.host,
          owner: origin.owner,
          repository: origin.repository,
        },
        target: {
          kind: 'github-repository',
          host: origin.host || 'github.com',
          owner: origin.owner,
          repository: origin.repository,
        },
        safety: 'read-only',
        confirmation: { required: false },
        createdAt: new Date().toISOString(),
        initiatedBy: 'command-palette',
      });

      vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'GitAxis: Fetching GitHub Releases...' },
        async () => {
          const res = await operationManager.execute<any[]>(op);
          if (res.success && res.data) {
            if (res.data.length === 0) {
              vscode.window.showInformationMessage('No releases found.');
              return;
            }
            const items = res.data.map(r => ({
              label: r.name || r.tagName,
              description: `Tag: ${r.tagName}`,
              detail: `Published: ${r.publishedAt || 'draft'}`,
              htmlUrl: r.htmlUrl,
            }));
            const selected = await vscode.window.showQuickPick(items, {
              title: `GitHub Releases (${res.data.length})`,
              placeHolder: 'Select a release to view in browser',
            });
            if (selected?.htmlUrl) {
              await vscode.env.openExternal(vscode.Uri.parse(selected.htmlUrl));
            }
          } else {
            vscode.window.showErrorMessage(res.error?.userMessage || 'Failed to list releases');
          }
        }
      );
    })
  );
}
