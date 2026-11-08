import * as vscode from 'vscode';
import { RepositoryDiscovery } from '../discovery/repositoryDiscovery';
import { GitRemote, GitRepository } from '../contracts';
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

export function registerGitHubCommands(
  context: vscode.ExtensionContext,
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
}
