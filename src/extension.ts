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
import { ExtraheaderMigration } from './migrations/extraheaderMigration';
import { AccountVerifier } from './auth/accountVerifier';
import { GitRepository } from './contracts';
import { logger } from './utils/logger';

let statusBarItem: vscode.StatusBarItem;
const promptedRepos = new Set<string>();

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
  const accountVerifier = new AccountVerifier(secretStore, gitClient);

  // Security migration: clean leftover plaintext extraheaders from repo configs
  const workspacePaths = vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath) || [];
  ExtraheaderMigration.run(profileStore, gitClient, context.globalState, workspacePaths).catch(
    err => logger.error(`Extraheader migration failed: ${String(err)}`)
  );

  // 2. Setup Operation Manager with VS Code confirmation prompt & safety guards
  const operationManager = new OperationManager(profileManager, gitClient);
  const initialGuardMode = vscode.workspace.getConfiguration('gitaxis').get<'block' | 'warn' | 'off'>('guard.mode', 'warn');
  operationManager.setGuardMode(initialGuardMode);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('gitaxis.guard.mode')) {
        const mode = vscode.workspace.getConfiguration('gitaxis').get<'block' | 'warn' | 'off'>('guard.mode', 'warn');
        operationManager.setGuardMode(mode);
      }
    })
  );

  operationManager.getConfirmationHandler().setPromptFn(async (reason: string, warning?: string) => {
    const config = vscode.workspace.getConfiguration('gitaxis');
    const requireConfirm = config.get<boolean>('confirmDestructiveOperations', true);
    if (!requireConfirm) return true;

    const proceedItem = 'Continue';
    const detail = warning ? `${warning}\n\nDo you want to proceed?` : 'Do you want to proceed?';
    const choice = await vscode.window.showWarningMessage(reason, { modal: true, detail }, proceedItem);
    return choice === proceedItem;
  });

  // Guard before commit: author mismatch prompt (Section 4)
  operationManager.setCommitMismatchPrompt(async (repoConfig, profile) => {
    const fixBtn = 'Fix and continue';
    const continueBtn = 'Commit anyway';
    const cancelBtn = 'Cancel';
    const msg = `This repository is configured for profile "${profile.name}" (${profile.git.name} <${profile.git.email}>) but git will commit as "${repoConfig.name || 'unknown'}" <${repoConfig.email || 'unknown'}>.`;
    const choice = await vscode.window.showWarningMessage(
      msg,
      { modal: true },
      fixBtn,
      continueBtn,
      cancelBtn
    );
    if (choice === fixBtn) return 'fix';
    if (choice === continueBtn) return 'continue';
    return 'cancel';
  });

  // Guard before push: remote owner mismatch prompt with remember action (Section 4)
  operationManager.setProfileMismatchPrompt(async (active, remoteOwner, suggested) => {
    const switchBtn = suggested ? `Switch to ${suggested.name}` : undefined;
    const rememberBtn = `Remember ${remoteOwner} for this profile`;
    const continueBtn = 'Continue';
    const items = switchBtn ? [switchBtn, rememberBtn, continueBtn] : [rememberBtn, continueBtn];
    const msg = `Profile Mismatch: Active profile "${active.name}" (${active.github?.username || 'no user'}) does not match remote owner "${remoteOwner}".`;
    const choice = await vscode.window.showWarningMessage(msg, { modal: true }, ...items);
    if (choice === switchBtn) return 'switch';
    if (choice === rememberBtn) return 'remember';
    if (choice === continueBtn) return 'continue';
    return 'cancel';
  });

  // Fail closed guard check handler (Section 4)
  operationManager.setGuardCheckFailedPrompt(async reason => {
    const continueBtn = 'Proceed anyway';
    const choice = await vscode.window.showWarningMessage(
      `GitAxis Guard: Failed to perform safety checks.\n${reason}`,
      { modal: true },
      continueBtn
    );
    return choice === continueBtn;
  });

  // Helper: Get active repository path from active editor or workspace folders
  const getActiveRepositoryPath = (): string | undefined => {
    const activeUri = vscode.window.activeTextEditor?.document.uri;
    if (activeUri && activeUri.scheme === 'file') {
      const folder = vscode.workspace.getWorkspaceFolder(activeUri);
      if (folder) return folder.uri.fsPath;
    }
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  };

  // 3. Status Bar Item (Section 2)
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = 'gitaxis.switchProfile';
  statusBarItem.tooltip = 'Click to switch GitAxis Profile';
  context.subscriptions.push(statusBarItem);

  const updateStatusBar = async () => {
    const currentPath = getActiveRepositoryPath();
    let repo: GitRepository | undefined;
    let branchName: string | undefined;
    let repoEmail: string | undefined;

    if (currentPath) {
      try {
        repo = await repoDiscovery.detectRepository(currentPath);
        if (repo) {
          branchName = repo.currentBranch;
          repoEmail = (await gitClient.getLocalConfig(repo.path, 'user.email')) || (await gitClient.getConfig(repo.path, 'user.email'));
        }
      } catch {}
    }

    let active: any | undefined;
    let folderRule: string | undefined;
    if (repo) {
      const resolved = await profileManager.resolveProfileForRepository(repo.path, {
        remotes: repo.remotes,
        localGitEmail: repoEmail,
      });
      active = resolved?.profile;
      folderRule = resolved?.source === 'folder-rule' ? resolved.folderRule : undefined;
    } else {
      active = await profileManager.getActiveProfile();
    }

    if (active) {
      const emailMismatch =
        repoEmail !== undefined &&
        active.git.email !== undefined &&
        repoEmail.trim().toLowerCase() !== active.git.email.trim().toLowerCase();

      const isWork = active.name.toLowerCase().includes('work') || active.git.email.toLowerCase().includes('work');
      const isPersonal = active.name.toLowerCase().includes('personal') || active.git.email.toLowerCase().includes('personal');
      const profileIcon = isWork ? '$(briefcase)' : isPersonal ? '$(person)' : '$(account)';

      if (emailMismatch) {
        statusBarItem.text = branchName
          ? `$(warning) ${profileIcon} ${active.name} $(git-branch) ${branchName}`
          : `$(warning) ${profileIcon} ${active.name}`;
        const warningTooltip = new vscode.MarkdownString(undefined, true);
        warningTooltip.supportThemeIcons = true;
        warningTooltip.isTrusted = true;
        warningTooltip.appendMarkdown(`$(warning) **GitAxis Profile Mismatch**\n\n`);
        warningTooltip.appendMarkdown(`- **Active Profile:** ${active.name} (${active.git.email})\n`);
        if (folderRule) {
          warningTooltip.appendMarkdown(`- **Folder Rule:** \`${folderRule}\`\n`);
        }
        warningTooltip.appendMarkdown(`- **Repo git config:** ${repoEmail}\n\n`);
        warningTooltip.appendMarkdown(`*Click to switch profile or fix identity.*`);
        statusBarItem.tooltip = warningTooltip;
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      } else {
        statusBarItem.text = branchName
          ? `${profileIcon} ${active.name} $(git-branch) ${branchName}`
          : `${profileIcon} ${active.name}`;
        const normalTooltip = new vscode.MarkdownString(undefined, true);
        normalTooltip.supportThemeIcons = true;
        normalTooltip.isTrusted = true;
        normalTooltip.appendMarkdown(`${profileIcon} **GitAxis Profile:** ${active.name}\n\n`);
        normalTooltip.appendMarkdown(`- **Email:** ${active.git.email}\n`);
        if (active.github?.username) {
          normalTooltip.appendMarkdown(`- **GitHub:** @${active.github.username}\n`);
        }
        if (folderRule) {
          normalTooltip.appendMarkdown(`- **Folder Rule:** \`${folderRule}\`\n`);
        }
        normalTooltip.appendMarkdown(`\n*Click to switch or manage.*`);
        statusBarItem.tooltip = normalTooltip;
        statusBarItem.backgroundColor = undefined;
      }
      statusBarItem.show();
    } else {
      statusBarItem.text = `$(account) No Profile`;
      statusBarItem.tooltip = 'Click to create a GitAxis profile';
      statusBarItem.backgroundColor = undefined;
      statusBarItem.show();
    }
  };

  await updateStatusBar();

  let sidebarProvider: SidebarViewProvider;

  const refreshAll = async () => {
    repoDiscovery.clearCache();
    await updateStatusBar();
    if (sidebarProvider) {
      await sidebarProvider.refresh();
    }
    try {
      await vscode.commands.executeCommand('git.refresh');
    } catch {
      // Ignore if built-in git extension is not active
    }
  };

  // 4. Sidebar Webview Provider
  sidebarProvider = new SidebarViewProvider(
    context.extensionUri,
    profileManager,
    repoDiscovery,
    systemDiscovery,
    refreshAll,
    accountVerifier
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarViewProvider.viewType, sidebarProvider)
  );

  // 5. Register Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('gitaxis.open', async () => {
      await vscode.commands.executeCommand('gitaxis.sidebarView.focus');
    })
  );

  registerProfileCommands(context, profileManager, systemDiscovery, gitClient, refreshAll, accountVerifier);
  registerRepositoryCommands(context, operationManager, profileManager, refreshAll);
  registerBranchCommands(context, operationManager, refreshAll);
  registerCommitCommands(context, operationManager, refreshAll);
  registerSyncCommands(context, operationManager, refreshAll);
  registerStashCommands(context, operationManager, refreshAll);
  registerTagCommands(context, operationManager, gitClient, refreshAll);
  registerGitHubCommands(context, operationManager, repoDiscovery);

  // 6. Handle Workspace Folder Changes & Auto Profile Matching (Section 2)
  const promptUnboundRepo = async (repo: GitRepository) => {
    const config = vscode.workspace.getConfiguration('gitaxis');
    if (!config.get<boolean>('autoDetectProfile', true)) return;

    const boundId = await profileManager.getAssociation(repo.path);
    if (boundId) return; // Already explicitly bound

    // If already covered by an applied folder rule ("Set-and-Forget"), do not prompt
    const resolved = await profileManager.resolveProfileForRepository(repo.path, {
      remotes: repo.remotes,
    });
    if (resolved?.source === 'folder-rule' && resolved.isApplied) return;

    if (promptedRepos.has(repo.path)) return; // Already prompted during this session
    promptedRepos.add(repo.path);

    const matchResult = await profileManager.matchProfile({
      repositoryPath: repo.path,
      remotes: repo.remotes,
    });

    let candidate: any | undefined;
    if (matchResult.recommendedProfileId) {
      candidate = await profileManager.getProfile(matchResult.recommendedProfileId);
    }
    if (!candidate) {
      candidate = await profileManager.getActiveProfile();
    }
    if (!candidate) {
      const all = await profileManager.getProfiles();
      candidate = all[0];
    }

    if (candidate) {
      const alwaysBtn = 'Always for this repo';
      const justOnceBtn = 'Just this time';
      const chooseAnotherBtn = 'Choose another';

      vscode.window
        .showInformationMessage(
          `Use "${candidate.name}" (${candidate.git.email}) for repository "${repo.name}"?`,
          alwaysBtn,
          justOnceBtn,
          chooseAnotherBtn
        )
        .then(async choice => {
          try {
            if (choice === alwaysBtn) {
              await profileManager.switchProfile(candidate.id, repo.path);
              await profileManager.associateRepository(repo.path, candidate.id);
              await refreshAll();
            } else if (choice === justOnceBtn) {
              await profileManager.applyIdentityToRepository(candidate, repo.path);
              await refreshAll();
            } else if (choice === chooseAnotherBtn) {
              await vscode.commands.executeCommand('gitaxis.switchProfile');
            }
          } catch (err: any) {
            if (err?.message?.includes('cancelled')) {
              logger.info(`Profile switch on unbound repo prompt was cancelled: ${err.message}`);
              return;
            }
            logger.warn(`Error during promptUnboundRepo action: ${String(err)}`);
          }
        });
    }
  };

  const checkWorkspaceProfiles = async () => {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return;

    for (const folder of folders) {
      const folderPath = folder.uri.fsPath;
      const repo = await repoDiscovery.detectRepository(folderPath);
      if (repo) {
        await promptUnboundRepo(repo);
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
    setTimeout(() => {
      checkWorkspaceProfiles().catch(err => logger.error(`Workspace check error: ${String(err)}`));
    }, 1000);
  }

  let lastActiveRepoPath: string | undefined;
  let activeEditorDebounceTimer: NodeJS.Timeout | undefined;

  // Listen to active editor changes to keep status bar and sidebar aligned in multi-root workspaces
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      if (activeEditorDebounceTimer) {
        clearTimeout(activeEditorDebounceTimer);
      }
      activeEditorDebounceTimer = setTimeout(async () => {
        try {
          const currentPath = getActiveRepositoryPath();
          if (currentPath !== lastActiveRepoPath) {
            lastActiveRepoPath = currentPath;
            await updateStatusBar();
            if (sidebarProvider) {
              await sidebarProvider.refresh();
            }
            if (currentPath) {
              const repo = await repoDiscovery.detectRepository(currentPath);
              if (repo) {
                await promptUnboundRepo(repo);
              }
            }
          }
        } catch (err) {
          logger.error(`Active editor switch error: ${String(err)}`);
        }
      }, 250);
    })
  );

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
