import * as vscode from 'vscode';
import { HtmlBuilder, WebviewState } from './html';
import { ProfileManager } from '../profiles/profileManager';
import { RepositoryDiscovery } from '../discovery/repositoryDiscovery';
import { GitProfile, GitRepository, ProfileMatchResult } from '../contracts';
import { logger } from '../utils/logger';

export class SidebarViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'gitaxis.sidebarView';

  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly profileManager: ProfileManager,
    private readonly repoDiscovery: RepositoryDiscovery
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.onDidReceiveMessage(async message => {
      try {
        switch (message.command) {
          case 'refresh':
            await this.refresh();
            break;
          case 'switchProfile':
            await vscode.commands.executeCommand('gitaxis.switchProfile');
            break;
          case 'createProfile':
            await vscode.commands.executeCommand('gitaxis.createProfile');
            break;
          case 'useRecommended': {
            const state = await this.getCurrentState();
            if (state.matchResult?.recommendedProfileId) {
              await vscode.commands.executeCommand('gitaxis.switchProfile', state.matchResult.recommendedProfileId);
            }
            break;
          }
          case 'status':
            await vscode.commands.executeCommand('gitaxis.status');
            break;
          case 'diff':
            await vscode.commands.executeCommand('gitaxis.diff');
            break;
          case 'history':
            await vscode.commands.executeCommand('gitaxis.history');
            break;
          case 'commit':
            await vscode.commands.executeCommand('gitaxis.commit');
            break;
          case 'push':
            await vscode.commands.executeCommand('gitaxis.push');
            break;
          case 'pull':
            await vscode.commands.executeCommand('gitaxis.pull');
            break;
          case 'fetch':
            await vscode.commands.executeCommand('gitaxis.fetch');
            break;
          case 'createBranch':
            await vscode.commands.executeCommand('gitaxis.createBranch');
            break;
          case 'merge':
            await vscode.commands.executeCommand('gitaxis.merge');
            break;
          case 'rebase':
            await vscode.commands.executeCommand('gitaxis.rebase');
            break;
          case 'stash':
            await vscode.commands.executeCommand('gitaxis.stash');
            break;
          case 'tag':
            await vscode.commands.executeCommand('gitaxis.tag');
            break;
          case 'reset':
            await vscode.commands.executeCommand('gitaxis.reset');
            break;
          case 'manageRemote':
            await vscode.commands.executeCommand('gitaxis.manageRemote');
            break;
          case 'openGitHubRepo':
            await vscode.commands.executeCommand('gitaxis.openGitHubRepo');
            break;
          case 'createPullRequest':
            await vscode.commands.executeCommand('gitaxis.createPullRequest');
            break;
          case 'createIssue':
            await vscode.commands.executeCommand('gitaxis.createIssue');
            break;
          case 'actions':
            await vscode.commands.executeCommand('gitaxis.actions');
            break;
          case 'releases':
            await vscode.commands.executeCommand('gitaxis.releases');
            break;
          case 'scanAccounts':
            await vscode.commands.executeCommand('gitaxis.scanAccounts');
            break;
        }
      } catch (err) {
        logger.error(`Error handling webview message: ${String(err)}`);
      }
    });

    this.refresh();
  }

  public async refresh(): Promise<void> {
    if (!this.view) return;
    const state = await this.getCurrentState();
    this.view.webview.html = HtmlBuilder.render(state);
  }

  private async getCurrentState(): Promise<WebviewState> {
    const profiles = await this.profileManager.getProfiles();
    const profile = await this.profileManager.getActiveProfile();

    let repository: GitRepository | undefined;
    let matchResult: ProfileMatchResult | undefined;

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      const folderPath = workspaceFolders[0].uri.fsPath;
      repository = await this.repoDiscovery.detectRepository(folderPath);

      if (repository) {
        matchResult = await this.profileManager.matchProfile({
          repositoryPath: repository.path,
          remotes: repository.remotes,
        });
      }
    }

    return {
      profile,
      repository,
      matchResult,
      profiles,
    };
  }
}
