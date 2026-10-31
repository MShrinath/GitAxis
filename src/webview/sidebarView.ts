import * as vscode from 'vscode';
import { DiscoveredAccount, HtmlBuilder, WebviewState } from './html';
import { ProfileManager } from '../profiles/profileManager';
import { RepositoryDiscovery } from '../discovery/repositoryDiscovery';
import { SystemDiscovery } from '../discovery/systemDiscovery';
import { CreateProfileInput, GitRepository, ProfileMatchResult, UpdateProfileInput } from '../contracts';
import { Validation } from '../utils/validation';
import { Platform } from '../utils/platform';
import { logger } from '../utils/logger';

export class SidebarViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'gitaxis.sidebarView';

  private view?: vscode.WebviewView;
  private discoveredAccounts: DiscoveredAccount[] = [];
  private scanPerformed: boolean = false;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly profileManager: ProfileManager,
    private readonly repoDiscovery: RepositoryDiscovery,
    private readonly systemDiscovery?: SystemDiscovery,
    private readonly onProfileChanged?: () => void
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

          case 'switchProfile': {
            if (message.profileId) {
              const confirmGlobalGitChange = async (): Promise<boolean> => {
                const continueBtn = 'Continue';
                const choice = await vscode.window.showWarningMessage(
                  "You're about to change your global Git identity.",
                  { modal: true, detail: "This affects repositories that don't override their local Git identity." },
                  continueBtn
                );
                return choice === continueBtn;
              };

              const activeUri = vscode.window.activeTextEditor?.document.uri;
              const workspaceFolder = activeUri
                ? vscode.workspace.getWorkspaceFolder(activeUri)?.uri.fsPath
                : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
              let repoPath: string | undefined;
              if (workspaceFolder) {
                const repo = await this.repoDiscovery.detectRepository(workspaceFolder);
                repoPath = repo?.path;
              }
              const switched = await this.profileManager.switchProfile(
                message.profileId,
                repoPath,
                confirmGlobalGitChange
              );
              vscode.window.showInformationMessage(`Active profile switched to "${switched.name}".`);
              this.onProfileChanged?.();
              await this.refresh();
            } else {
              await vscode.commands.executeCommand('gitaxis.switchProfile');
            }
            break;
          }

          case 'createProfileFromForm': {
            const data = message.data;
            if (!data || !data.name || !data.gitName || !data.gitEmail) {
              const msg = 'Profile Name, Git Author Name, and Git Email are required.';
              this.view?.webview.postMessage({ command: 'saveError', error: msg });
              vscode.window.showErrorMessage(msg);
              break;
            }
            if (!Validation.isValidProfileName(data.name)) {
              const msg = 'Please enter a valid profile name (alphanumeric, dash, underscore, 1-64 chars).';
              this.view?.webview.postMessage({ command: 'saveError', error: msg });
              vscode.window.showErrorMessage(msg);
              break;
            }
            if (!Validation.isValidEmail(data.gitEmail)) {
              const msg = 'Please enter a valid Git email address.';
              this.view?.webview.postMessage({ command: 'saveError', error: msg });
              vscode.window.showErrorMessage(msg);
              break;
            }

            const input: CreateProfileInput = {
              name: data.name.trim(),
              git: {
                name: data.gitName.trim(),
                email: data.gitEmail.trim(),
                scope: data.scope === 'global' ? 'global' : 'local',
              },
              github: data.githubUsername?.trim()
                ? {
                    host: data.host?.trim() || 'github.com',
                    username: data.githubUsername.trim(),
                  }
                : undefined,
              authentication: {
                type: data.pat?.trim() ? 'pat' : 'none',
                source: data.pat?.trim() ? 'vs-code-secret-storage' : 'user-input',
              },
              source: 'manual',
              imported: false,
            };

            const created = await this.profileManager.createProfile(input, data.pat?.trim() || undefined);
            const active = await this.profileManager.getActiveProfile();
            if (active?.id === created.id) {
              const activeUri = vscode.window.activeTextEditor?.document.uri;
              const workspaceFolder = activeUri
                ? vscode.workspace.getWorkspaceFolder(activeUri)?.uri.fsPath
                : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
              if (workspaceFolder) {
                const repo = await this.repoDiscovery.detectRepository(workspaceFolder);
                if (repo) {
                  await this.profileManager.applyIdentityToRepository(created, repo.path);
                }
              }
            }
            this.view?.webview.postMessage({ command: 'saveSuccess', profileId: created.id });
            vscode.window.showInformationMessage(`Profile "${created.name}" created successfully!`);
            this.onProfileChanged?.();
            await this.refresh();
            break;
          }

          case 'updateProfileFromForm': {
            const data = message.data;
            if (!data || !data.id || !data.name || !data.gitName || !data.gitEmail) {
              const msg = 'Profile ID, name, Git author name, and email are required.';
              this.view?.webview.postMessage({ command: 'saveError', error: msg });
              vscode.window.showErrorMessage(msg);
              break;
            }
            if (!Validation.isValidProfileName(data.name)) {
              const msg = 'Please enter a valid profile name (alphanumeric, dash, underscore, 1-64 chars).';
              this.view?.webview.postMessage({ command: 'saveError', error: msg });
              vscode.window.showErrorMessage(msg);
              break;
            }
            if (!Validation.isValidEmail(data.gitEmail)) {
              const msg = 'Please enter a valid Git email address.';
              this.view?.webview.postMessage({ command: 'saveError', error: msg });
              vscode.window.showErrorMessage(msg);
              break;
            }

            const input: UpdateProfileInput = {
              name: data.name.trim(),
              git: {
                name: data.gitName.trim(),
                email: data.gitEmail.trim(),
                scope: data.scope === 'global' ? 'global' : 'local',
              },
              github: data.githubUsername?.trim()
                ? {
                    host: data.host?.trim() || 'github.com',
                    username: data.githubUsername.trim(),
                  }
                : { username: '', host: data.host?.trim() || 'github.com' },
            };

            if (data.pat && data.pat.trim().length > 0) {
              input.authentication = {
                type: 'pat',
                source: 'vs-code-secret-storage',
              };
            }

            const updated = await this.profileManager.updateProfile(data.id, input, data.pat?.trim() || undefined);
            const active = await this.profileManager.getActiveProfile();
            if (active?.id === updated.id) {
              const activeUri = vscode.window.activeTextEditor?.document.uri;
              const workspaceFolder = activeUri
                ? vscode.workspace.getWorkspaceFolder(activeUri)?.uri.fsPath
                : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
              if (workspaceFolder) {
                const repo = await this.repoDiscovery.detectRepository(workspaceFolder);
                if (repo) {
                  await this.profileManager.applyIdentityToRepository(updated, repo.path);
                }
              }
            }
            this.view?.webview.postMessage({ command: 'saveSuccess', profileId: updated.id });
            vscode.window.showInformationMessage(`Profile "${updated.name}" updated successfully!`);
            this.onProfileChanged?.();
            await this.refresh();
            break;
          }

          case 'deleteProfile': {
            if (!message.profileId) break;
            const profile = await this.profileManager.getProfile(message.profileId);
            const profileName = profile?.name || message.name || 'this profile';
            const confirm = await vscode.window.showWarningMessage(
              `Are you sure you want to delete profile "${profileName}"?`,
              { modal: true },
              'Delete'
            );
            if (confirm === 'Delete') {
              await this.profileManager.deleteProfile(message.profileId);
              this.view?.webview.postMessage({ command: 'profileDeleted', profileId: message.profileId });
              vscode.window.showInformationMessage(`Profile "${profileName}" deleted.`);
              this.onProfileChanged?.();
              await this.refresh();
            }
            break;
          }

          case 'scanAccounts': {
            if (this.systemDiscovery) {
              await vscode.window.withProgress(
                {
                  location: vscode.ProgressLocation.Notification,
                  title: 'GitAxis: Scanning local Git and GitHub CLI accounts...',
                },
                async () => {
                  const scanResult = await this.systemDiscovery!.scan();
                  const suggestions = this.systemDiscovery!.suggestProfiles(scanResult);
                  const existingProfiles = await this.profileManager.getProfiles();

                  this.discoveredAccounts = suggestions.filter(
                    s =>
                      !existingProfiles.some(
                        p =>
                          p.name.toLowerCase() === s.name.toLowerCase() ||
                          p.git.email.toLowerCase() === s.git.email.toLowerCase()
                      )
                  );
                  this.scanPerformed = true;
                  await this.refresh();

                  if (this.discoveredAccounts.length === 0) {
                    vscode.window.showInformationMessage('Scan completed. No new accounts detected.');
                  } else {
                    vscode.window.showInformationMessage(
                      `Scan completed. Found ${this.discoveredAccounts.length} account suggestion(s).`
                    );
                  }
                }
              );
            }
            break;
          }

          case 'importDiscoveredAccount': {
            let accountToImport: CreateProfileInput | undefined = message.account;
            if (!accountToImport && typeof message.index === 'number' && this.discoveredAccounts[message.index]) {
              const raw = this.discoveredAccounts[message.index];
              accountToImport = {
                name: raw.name,
                git: {
                  name: raw.git.name,
                  email: raw.git.email,
                  scope: raw.git.scope || 'local',
                },
                github: raw.github
                  ? {
                      host: raw.github.host || 'github.com',
                      username: raw.github.username,
                    }
                  : undefined,
                authentication: (raw as any).authentication || {
                  type: raw.source === 'github-cli' ? 'github-cli' : 'none',
                  source: raw.source === 'github-cli' ? 'github-cli' : 'system',
                },
                source: (raw.source as any) || 'system-discovery',
                imported: true,
                description: raw.description,
              };
            }
            if (accountToImport) {
              const created = await this.profileManager.createProfile(accountToImport);
              if (typeof message.index === 'number' && message.index >= 0 && message.index < this.discoveredAccounts.length) {
                this.discoveredAccounts.splice(message.index, 1);
              } else {
                this.discoveredAccounts = this.discoveredAccounts.filter(
                  a => a.name.toLowerCase() !== accountToImport!.name.toLowerCase()
                );
              }
              vscode.window.showInformationMessage(`Profile "${created.name}" imported successfully!`);
              this.onProfileChanged?.();
              await this.refresh();
            }
            break;
          }

          case 'openInBrowser': {
            if (message.url && typeof message.url === 'string') {
              if (message.url.startsWith('https://') || message.url.startsWith('http://')) {
                await vscode.env.openExternal(vscode.Uri.parse(message.url));
              } else {
                vscode.window.showWarningMessage(`Invalid URL protocol: ${message.url}`);
              }
            }
            break;
          }

          case 'openGitHubRepo': {
            await vscode.commands.executeCommand('gitaxis.openGitHubRepo');
            break;
          }

          case 'linkToRepo': {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceFolder) {
              vscode.window.showWarningMessage('No repository workspace open to link.');
              break;
            }
            const repo = await this.repoDiscovery.detectRepository(workspaceFolder);
            const targetPath = repo?.path || Platform.normalizePath(workspaceFolder);
            if (message.profileId) {
              await this.profileManager.associateRepository(targetPath, message.profileId);
              const profile = await this.profileManager.getProfile(message.profileId);
              vscode.window.showInformationMessage(`Linked repository to profile "${profile?.name || message.profileId}".`);
              this.onProfileChanged?.();
              await this.refresh();
            }
            break;
          }

          case 'unlinkRepo': {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (workspaceFolder) {
              const repo = await this.repoDiscovery.detectRepository(workspaceFolder);
              const targetPath = repo?.path || Platform.normalizePath(workspaceFolder);
              await this.profileManager.disassociateRepository(targetPath);
              vscode.window.showInformationMessage('Removed profile link for current repository.');
              this.onProfileChanged?.();
              await this.refresh();
            }
            break;
          }

          case 'useRecommended': {
            const state = await this.getCurrentState();
            if (state.matchResult?.recommendedProfileId) {
              const confirmGlobalGitChange = async (): Promise<boolean> => {
                const continueBtn = 'Continue';
                const choice = await vscode.window.showWarningMessage(
                  "You're about to change your global Git identity.",
                  { modal: true, detail: "This affects repositories that don't override their local Git identity." },
                  continueBtn
                );
                return choice === continueBtn;
              };

              const activeUri = vscode.window.activeTextEditor?.document.uri;
              const workspaceFolder = activeUri
                ? vscode.workspace.getWorkspaceFolder(activeUri)?.uri.fsPath
                : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
              let repoPath: string | undefined;
              if (workspaceFolder) {
                const repo = await this.repoDiscovery.detectRepository(workspaceFolder);
                repoPath = repo?.path;
              }
              await this.profileManager.switchProfile(
                state.matchResult.recommendedProfileId,
                repoPath,
                confirmGlobalGitChange
              );
              this.onProfileChanged?.();
              await this.refresh();
            }
            break;
          }
        }
      } catch (err) {
        logger.error(`Error handling webview message: ${String(err)}`);
        const errMsg = err instanceof Error ? err.message : String(err);
        this.view?.webview.postMessage({ command: 'saveError', error: errMsg });
        vscode.window.showErrorMessage(`GitAxis Error: ${errMsg}`);
      }
    });

    this.refresh();
  }

  public async refresh(): Promise<void> {
    if (!this.view) return;
    const state = await this.getCurrentState();
    this.view.webview.html = HtmlBuilder.render(state, this.view.webview.cspSource);
  }

  private async getCurrentState(): Promise<WebviewState> {
    const profiles = await this.profileManager.getProfiles();
    const profile = await this.profileManager.getActiveProfile();

    let repository: GitRepository | undefined;
    let matchResult: ProfileMatchResult | undefined;
    let repoUrl: string | undefined;
    let linkedProfileId: string | undefined;

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      const folderPath = workspaceFolders[0].uri.fsPath;
      repository = await this.repoDiscovery.detectRepository(folderPath);

      if (repository) {
        linkedProfileId = await this.profileManager.getAssociation(repository.path);
        matchResult = await this.profileManager.matchProfile({
          repositoryPath: repository.path,
          remotes: repository.remotes,
        });

        const origin = repository.remotes.find(r => r.name === 'origin') || repository.remotes[0];
        if (origin && origin.owner && origin.repository) {
          const host = origin.host || 'github.com';
          repoUrl = `https://${host}/${origin.owner}/${origin.repository}`;
        }
      }
    }

    return {
      profile,
      repository,
      matchResult,
      profiles,
      repoUrl,
      linkedProfileId,
      discoveredAccounts: this.discoveredAccounts,
      scanPerformed: this.scanPerformed,
    };
  }
}
