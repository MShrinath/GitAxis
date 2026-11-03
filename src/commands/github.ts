import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { OperationManager } from '../operations/operationManager';
import { RepositoryDiscovery } from '../discovery/repositoryDiscovery';
import { createOperation, GitRemote, GitRepository, Operation, OperationInputMap } from '../contracts';
import {
  GitHubActionRunSummary,
  GitHubIssueSummary,
  GitHubPullRequestSummary,
  GitHubReleaseSummary,
} from '../github/githubTypes';
import { getActiveWorkspaceRepoPath } from '../utils/workspace';

interface ValidatedGitHubRemote extends GitRemote {
  owner: string;
  repository: string;
}

async function resolveGitHubRemote(
  repoDiscovery: RepositoryDiscovery,
  warningMsg = 'No GitHub remote configured.'
): Promise<{ repoPath: string; origin: ValidatedGitHubRemote; repo: GitRepository } | undefined> {
  const repoPath = await getActiveWorkspaceRepoPath();
  if (!repoPath) return undefined;

  const repo = await repoDiscovery.detectRepository(repoPath);
  const origin = repo?.remotes.find(r => r.name === 'origin') || repo?.remotes[0];

  if (!origin || !origin.owner || !origin.repository) {
    vscode.window.showWarningMessage(warningMsg);
    return undefined;
  }

  return { repoPath, origin: origin as ValidatedGitHubRemote, repo: repo! };
}

function createGitHubListOp(
  type: 'github.actions.list' | 'github.release.list',
  origin: ValidatedGitHubRemote
): Operation {
  if (type === 'github.actions.list') {
    return createOperation({
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
  } else {
    return createOperation({
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
  }
}

async function showGitHubResourceList<T>(
  operationManager: OperationManager,
  op: Operation,
  progressTitle: string,
  emptyMessage: string,
  failedMessage: string,
  pickerTitlePrefix: string,
  placeHolder: string,
  formatItem: (item: T) => { label: string; description: string; detail: string; htmlUrl?: string }
): Promise<void> {
  vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: progressTitle },
    async () => {
      const res = await operationManager.execute<T[]>(op);
      if (res.success && res.data) {
        if (res.data.length === 0) {
          vscode.window.showInformationMessage(emptyMessage);
          return;
        }
        const items = res.data.map(formatItem);
        const selected = await vscode.window.showQuickPick(items, {
          title: `${pickerTitlePrefix} (${res.data.length})`,
          placeHolder,
        });
        if (selected?.htmlUrl) {
          await vscode.env.openExternal(vscode.Uri.parse(selected.htmlUrl));
        }
      } else {
        vscode.window.showErrorMessage(res.error?.userMessage || failedMessage);
      }
    }
  );
}

export function registerGitHubCommands(
  context: vscode.ExtensionContext,
  operationManager: OperationManager,
  repoDiscovery: RepositoryDiscovery
): void {
  // Open GitHub Repository in browser
  context.subscriptions.push(
    vscode.commands.registerCommand('gitaxis.openGitHubRepo', async () => {
      const target = await resolveGitHubRemote(repoDiscovery, 'No GitHub remote found for this repository.');
      if (!target) return;

      const host = target.origin.host || 'github.com';
      const url = `https://${host}/${target.origin.owner}/${target.origin.repository}`;
      await vscode.env.openExternal(vscode.Uri.parse(url));
    })
  );

  // Create GitHub Issue
  context.subscriptions.push(
    vscode.commands.registerCommand('gitaxis.createIssue', async () => {
      const target = await resolveGitHubRemote(repoDiscovery);
      if (!target) return;
      const { origin } = target;

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

      const op = createGitHubRepoOp('github.issue.create', origin, {
        title: title.trim(),
        body: body?.trim(),
      });

      await runGitHubCreateOp<GitHubIssueSummary>(
        operationManager,
        op,
        'GitAxis: Creating GitHub issue...',
        d => `Issue #${d.number} created: ${d.title}`,
        'Open Issue',
        'Failed to create issue'
      );
    })
  );

  // Create Pull Request
  context.subscriptions.push(
    vscode.commands.registerCommand('gitaxis.createPullRequest', async () => {
      const target = await resolveGitHubRemote(repoDiscovery);
      if (!target) return;
      const { origin, repo } = target;
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

      const op = createGitHubRepoOp('github.pull-request.create', origin, {
        title: title.trim(),
        head: currentBranch,
        base: base.trim(),
        body: body?.trim(),
      });

      await runGitHubCreateOp<GitHubPullRequestSummary>(
        operationManager,
        op,
        'GitAxis: Creating Pull Request...',
        d => `Pull Request #${d.number} created!`,
        'Open PR',
        'Failed to create pull request'
      );
    })
  );

  // View GitHub Actions
  context.subscriptions.push(
    vscode.commands.registerCommand('gitaxis.actions', async () => {
      const target = await resolveGitHubRemote(repoDiscovery);
      if (!target) return;

      const op = createGitHubListOp('github.actions.list', target.origin);
      await showGitHubResourceList<GitHubActionRunSummary>(
        operationManager,
        op,
        'GitAxis: Fetching GitHub Actions...',
        'No workflow runs found.',
        'Failed to list actions',
        'GitHub Actions Runs',
        'Select a workflow run to view in browser',
        run => ({
          label: `${run.status === 'completed' && run.conclusion === 'success' ? '✓' : '●'} ${run.name}`,
          description: `Status: ${run.status} · Conclusion: ${run.conclusion || 'pending'}`,
          detail: `Branch: ${run.headBranch || '—'}`,
          htmlUrl: run.htmlUrl,
        })
      );
    })
  );

  // View GitHub Releases
  context.subscriptions.push(
    vscode.commands.registerCommand('gitaxis.releases', async () => {
      const target = await resolveGitHubRemote(repoDiscovery);
      if (!target) return;

      const op = createGitHubListOp('github.release.list', target.origin);
      await showGitHubResourceList<GitHubReleaseSummary>(
        operationManager,
        op,
        'GitAxis: Fetching GitHub Releases...',
        'No releases found.',
        'Failed to list releases',
        'GitHub Releases',
        'Select a release to view in browser',
        r => ({
          label: r.name || r.tagName,
          description: `Tag: ${r.tagName}`,
          detail: `Published: ${r.publishedAt || 'draft'}`,
          htmlUrl: r.htmlUrl,
        })
      );
    })
  );
}

function createGitHubRepoOp<TType extends 'github.issue.create' | 'github.pull-request.create'>(
  type: TType,
  origin: { host?: string; owner: string; repository: string },
  input: Omit<OperationInputMap[TType], 'host' | 'owner' | 'repository'>
): Operation {
  return createOperation({
    id: crypto.randomUUID(),
    type,
    input: {
      host: origin.host,
      owner: origin.owner,
      repository: origin.repository,
      ...input,
    } as OperationInputMap[TType],
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
  }) as unknown as Operation;
}

async function runGitHubCreateOp<T extends { htmlUrl?: string }>(
  operationManager: OperationManager,
  op: Operation,
  progressTitle: string,
  successMessage: (data: T) => string,
  openLabel: string,
  fallbackError: string
): Promise<void> {
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: progressTitle },
    async () => {
      const res = await operationManager.execute<T>(op);
      if (res.success && res.data) {
        const choice = await vscode.window.showInformationMessage(
          successMessage(res.data),
          openLabel
        );
        if (choice === openLabel && res.data.htmlUrl) {
          await vscode.env.openExternal(vscode.Uri.parse(res.data.htmlUrl));
        }
      } else {
        vscode.window.showErrorMessage(res.error?.userMessage || fallbackError);
      }
    }
  );
}

