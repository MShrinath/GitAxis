import * as vscode from 'vscode';
import { SecretStore } from './auth/secretStore';
import { PersistentProfileStore } from './profiles/profileStore';
import { GitClient } from './git/gitClient';
import { AuthManager } from './auth/authManager';
import { ProfileManager } from './profiles/profileManager';
import { RepositoryDiscovery } from './discovery/repositoryDiscovery';
import { SystemDiscovery } from './discovery/systemDiscovery';
import { OperationManager } from './operations/operationManager';
import { SidebarViewProvider } from './webview/sidebarView';
import { registerProfileCommands } from './commands/profiles';
import { registerRepositoryCommands } from './commands/repository';
import { registerBranchCommands } from './commands/branch';
import { registerCommitCommands } from './commands/commit';
import { registerSyncCommands } from './commands/sync';
import { registerStashCommands } from './commands/stash';
import { registerTagCommands } from './commands/tag';
import { registerGitHubCommands } from './commands/github';
import { logger } from './utils/logger';

let statusBarItem: vscode.StatusBarItem;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  logger.info('Activating GitAxis extension...');

  // 1. Initialize Core Services
  const secretStore = new SecretStore(context.secrets);
  const profileStore = new PersistentProfileStore(context.globalState);
  const gitClient = new GitClient('git');
  const authManager = new AuthManager(secretStore);
  const profileManager = new ProfileManager(profileStore, authManager, gitClient);
  const repoDiscovery = new RepositoryDiscovery(gitClient);
  const systemDiscovery = new SystemDiscovery(gitClient);

  // 2. Setup Operation Manager with VS Code confirmation prompt
  const operationManager = new OperationManager(profileManager, gitClient);
  operationManager.getConfirmationHandler().setPromptFn(async (reason: string, warning?: string) => {
    const config = vscode.workspace.getConfiguration('gitaxis');
    const requireConfirm = config.get<boolean>('confirmDestructiveOperations', true);
    if (!requireConfirm) return true;

    const proceedItem = 'Continue';
    const detail = warning ? `${warning}\n\nDo you want to proceed?` : 'Do you want to proceed?';
    const choice = await vscode.window.showWarningMessage(reason, { modal: true, detail }, proceedItem);
    return choice === proceedItem;
  });

  operationManager.setProfileMismatchPrompt(async (active, remoteOwner, suggested) => {
    const switchBtn = suggested ? `Switch to ${suggested.name}` : undefined;
    const continueBtn = 'Continue';
    const items = switchBtn ? [switchBtn, continueBtn] : [continueBtn];
    const msg = `Profile Mismatch: Active profile "${active.name}" (${active.github?.username || 'no user'}) does not match remote owner "${remoteOwner}".`;
    const choice = await vscode.window.showWarningMessage(msg, { modal: true }, ...items);
    if (choice === switchBtn) return 'switch';
    if (choice === continueBtn) return 'continue';
    return 'cancel';
  });

  // 3. Status Bar Item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = 'gitaxis.switchProfile';
  statusBarItem.tooltip = 'Click to switch GitAxis Profile';
  context.subscriptions.push(statusBarItem);

  const updateStatusBar = async () => {
    const active = await profileManager.getActiveProfile();
    let branchName: string | undefined;
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
      try {
        const repo = await repoDiscovery.detectRepository(folders[0].uri.fsPath);
        if (repo?.currentBranch) {
          branchName = repo.currentBranch;
        }
      } catch {}
    }

    if (active) {
      statusBarItem.text = branchName
        ? `$(github) ${active.name} $(git-branch) ${branchName}`
        : `$(github) ${active.name}`;
      statusBarItem.show();
    } else {
      statusBarItem.text = `$(github) No Profile`;
      statusBarItem.show();
    }
  };

  await updateStatusBar();

  // 4. Sidebar Webview Provider
  const sidebarProvider = new SidebarViewProvider(context.extensionUri, profileManager, repoDiscovery);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarViewProvider.viewType, sidebarProvider)
  );

  const refreshAll = async () => {
    await updateStatusBar();
    await sidebarProvider.refresh();
  };

  // 5. Register Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('gitaxis.open', async () => {
      await vscode.commands.executeCommand('gitaxis.sidebarView.focus');
    })
  );

  registerProfileCommands(context, profileManager, systemDiscovery, gitClient, refreshAll);
  registerRepositoryCommands(context, operationManager, profileManager, refreshAll);
  registerBranchCommands(context, operationManager, refreshAll);
  registerCommitCommands(context, operationManager, refreshAll);
  registerSyncCommands(context, operationManager, refreshAll);
  registerStashCommands(context, operationManager, refreshAll);
  registerTagCommands(context, operationManager, refreshAll);
  registerGitHubCommands(context, operationManager, repoDiscovery);

  // 6. Handle Workspace Folder Changes & Auto Profile Matching
  const checkWorkspaceProfiles = async () => {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return;

    const folderPath = folders[0].uri.fsPath;
    const repo = await repoDiscovery.detectRepository(folderPath);
    if (!repo) return;

    const config = vscode.workspace.getConfiguration('gitaxis');
    if (!config.get<boolean>('autoDetectProfile', true)) return;

    const match = await profileManager.matchProfile({
      repositoryPath: repo.path,
      remotes: repo.remotes,
    });

    const activeProfile = await profileManager.getActiveProfile();

    if (match.recommendedProfileId && match.recommendedProfileId !== activeProfile?.id) {
      const recommended = await profileManager.getProfile(match.recommendedProfileId);
      if (recommended) {
        const switchBtn = `Use ${recommended.name}`;
        const choice = await vscode.window.showInformationMessage(
          `GitAxis detected repository "${repo.name}". Recommended profile: "${recommended.name}"`,
          switchBtn,
          'Ignore'
        );
        if (choice === switchBtn) {
          await profileManager.switchProfile(recommended.id, repo.path);
          await refreshAll();
        }
      }
    }
  };

  // 7. Prompt scan on first launch if no profiles exist
  const profiles = await profileManager.getProfiles();
  if (profiles.length === 0) {
    const config = vscode.workspace.getConfiguration('gitaxis');
    if (config.get<boolean>('promptScanOnFirstLaunch', true)) {
      const scanBtn = 'Scan';
      vscode.window
        .showInformationMessage(
          'Welcome to GitAxis! Would you like to check your existing Git/GitHub configuration?',
          scanBtn,
          'Skip'
        )
        .then(async choice => {
          if (choice === scanBtn) {
            await vscode.commands.executeCommand('gitaxis.scanAccounts');
          }
        });
    }
  } else {
    // Check workspace profile if profiles already exist
    setTimeout(() => {
      checkWorkspaceProfiles().catch(err => logger.error(`Workspace check error: ${String(err)}`));
    }, 1000);
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      checkWorkspaceProfiles().catch(err => logger.error(`Workspace change check error: ${String(err)}`));
      refreshAll();
    })
  );

  logger.info('GitAxis extension activated successfully.');
}

export function deactivate(): void {
  logger.info('Deactivating GitAxis extension...');
}
