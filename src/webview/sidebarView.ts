import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { DiscoveredAccount, HtmlBuilder, WebviewState } from './html';
import { ProfileManager } from '../profiles/profileManager';
import { RepositoryDiscovery } from '../discovery/repositoryDiscovery';
import { SystemDiscovery } from '../discovery/systemDiscovery';
import { CreateProfileInput, GitProfile, GitRepository, ProfileMatchResult, UpdateProfileInput } from '../contracts';
import { Platform } from '../utils/platform';
import { Validation } from '../utils/validation';
import { logger } from '../utils/logger';
import { AccountVerifier } from '../auth/accountVerifier';
import { getWorkspaceRepoPath } from '../utils/workspace';

const ALLOWED_COMMANDS = new Set([
  'refresh',
  'switchProfile',
  'createProfileFromForm',
  'updateProfileFromForm',
  'deleteProfile',
  'scanAccounts',
  'importDiscoveredAccount',
  'importAllDiscoveredAccounts',
  'openInBrowser',
  'openGitHubRepo',
  'linkToRepo',
  'unlinkRepo',
  'useRecommended',
  'verifyProfile',
  'dismissDiscovered',
]);

export class SidebarViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'gitaxis.sidebarView';

  private view?: vscode.WebviewView;
  private discoveredAccounts: DiscoveredAccount[] = [];
  private scanPerformed: boolean = false;
  private profileStatuses: Record<string, { verified: boolean; status?: 'verified' | 'failed' | 'not-verified'; message?: string }> = {};

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly profileManager: ProfileManager,
    private readonly repoDiscovery: RepositoryDiscovery,
    private readonly systemDiscovery?: SystemDiscovery,
    private readonly onProfileChanged?: () => void,
    private readonly accountVerifier?: AccountVerifier
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
        if (!message || typeof message !== 'object' || typeof message.command !== 'string' || !ALLOWED_COMMANDS.has(message.command)) {
          logger.warn(`Webview message ignored: invalid or disallowed command "${message?.command}"`);
          return;
        }

        switch (message.command) {
          case 'refresh':
            await this.refresh();
            break;


          case 'switchProfile': {
            if (message.profileId) {
              if (typeof message.profileId !== 'string' || message.profileId.trim().length === 0 || message.profileId.length > 128) {
                logger.warn('Invalid profileId in switchProfile message');
                break;
              }
              await vscode.commands.executeCommand('gitaxis.switchProfile', message.profileId);
              await this.refresh();
            } else {
              await vscode.commands.executeCommand('gitaxis.switchProfile');
            }
            break;
          }

          case 'dismissDiscovered': {
            this.discoveredAccounts = [];
            this.scanPerformed = false;
            await this.refresh();
            break;
          }

          case 'createProfileFromForm': {
            const data = message.data;
            if (!data || typeof data !== 'object' || typeof data.name !== 'string' || typeof data.gitName !== 'string' || typeof data.gitEmail !== 'string') {
              const msg = 'Profile Name, Git Author Name, and Git Email are required.';
              this.view?.webview.postMessage({ command: 'saveError', error: msg });
              vscode.window.showErrorMessage(msg);
              break;
            }
            if (data.name.length > 64 || data.gitName.length > 128 || data.gitEmail.length > 256) {
              const msg = 'Input exceeds maximum allowed length.';
              this.view?.webview.postMessage({ command: 'saveError', error: msg });
              vscode.window.showErrorMessage(msg);
              break;
            }
            if (!Validation.isValidProfileName(data.name)) {
              const msg = 'Please enter a valid profile name (alphanumeric, dash, underscore, dot, space, 1-64 chars).';
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
              github: data.githubUsername && typeof data.githubUsername === 'string' && data.githubUsername.trim()
                ? {
                    host: typeof data.host === 'string' && data.host.trim() ? data.host.trim() : 'github.com',
                    username: data.githubUsername.trim(),
                  }
                : undefined,
              authentication: {
                type: data.pat && typeof data.pat === 'string' && data.pat.trim() ? 'pat' : 'none',
                source: data.pat && typeof data.pat === 'string' && data.pat.trim() ? 'vs-code-secret-storage' : 'user-input',
              },
              source: 'manual',
              imported: false,
            };

            const patVal = typeof data.pat === 'string' ? data.pat.trim() : undefined;
            const created = await this.profileManager.createProfile(input, patVal || undefined);
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
            if (!data || typeof data !== 'object' || typeof data.id !== 'string' || typeof data.name !== 'string' || typeof data.gitName !== 'string' || typeof data.gitEmail !== 'string') {
              const msg = 'Profile ID, name, Git author name, and email are required.';
              this.view?.webview.postMessage({ command: 'saveError', error: msg });
              vscode.window.showErrorMessage(msg);
              break;
            }
            if (data.id.length > 128 || data.name.length > 64 || data.gitName.length > 128 || data.gitEmail.length > 256) {
              const msg = 'Input exceeds maximum allowed length.';
              this.view?.webview.postMessage({ command: 'saveError', error: msg });
              vscode.window.showErrorMessage(msg);
              break;
            }

            const existingProfile = await this.profileManager.getProfile(data.id);
            if (!existingProfile) {
              const msg = `Cannot update: profile "${data.id}" does not exist.`;
              this.view?.webview.postMessage({ command: 'saveError', error: msg });
              vscode.window.showErrorMessage(msg);
              break;
            }

            if (!Validation.isValidProfileName(data.name)) {
              const msg = 'Please enter a valid profile name (alphanumeric, dash, underscore, dot, space, 1-64 chars).';
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
              github: data.githubUsername && typeof data.githubUsername === 'string' && data.githubUsername.trim()
                ? {
                    host: typeof data.host === 'string' && data.host.trim() ? data.host.trim() : 'github.com',
                    username: data.githubUsername.trim(),
                    orgs: existingProfile.github?.orgs,
                  }
                : {
                    username: '',
                    host: typeof data.host === 'string' && data.host.trim() ? data.host.trim() : 'github.com',
                    orgs: existingProfile.github?.orgs,
                  },
            };

            const patVal = typeof data.pat === 'string' ? data.pat.trim() : undefined;
            if (patVal && patVal.length > 0) {
              input.authentication = {
                type: 'pat',
                source: 'vs-code-secret-storage',
              };
            }

            const updated = await this.profileManager.updateProfile(data.id, input, patVal || undefined);
            this.accountVerifier?.clearCache(data.id);
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
            if (!message.profileId || typeof message.profileId !== 'string' || message.profileId.length > 128) {
              break;
            }
            const profile = await this.profileManager.getProfile(message.profileId);
            if (!profile) {
              vscode.window.showWarningMessage(`Cannot delete: profile "${message.profileId}" does not exist.`);
              break;
            }
            const profileName = profile.name || message.name || 'this profile';
            const confirm = await vscode.window.showWarningMessage(
              `Are you sure you want to delete profile "${profileName}"?`,
              { modal: true },
              'Delete'
            );
            if (confirm === 'Delete') {
              await this.profileManager.deleteProfile(message.profileId);
              this.accountVerifier?.clearCache(message.profileId);
              delete this.profileStatuses[message.profileId];
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
                    const importAllBtn = 'Create profiles for all found accounts';
                    vscode.window.showInformationMessage(
                      `Scan completed. Found ${this.discoveredAccounts.length} account suggestion(s).`,
                      importAllBtn
                    ).then(async choice => {
                      if (choice === importAllBtn) {
                        await this.importAllAccounts();
                      }
                    });
                  }
                }
              );
            }
            break;
          }

          case 'importAllDiscoveredAccounts': {
            await this.importAllAccounts();
            break;
          }

          case 'importDiscoveredAccount': {
            if (
              typeof message.index !== 'number' ||
              !Number.isInteger(message.index) ||
              message.index < 0 ||
              message.index >= this.discoveredAccounts.length
            ) {
              logger.warn(`Invalid or out-of-range discovery index: ${message.index}`);
              break;
            }
            const raw = this.discoveredAccounts[message.index];
            const accountToImport: CreateProfileInput = {
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

            const created = await this.profileManager.createProfile(accountToImport);
            this.discoveredAccounts.splice(message.index, 1);
            vscode.window.showInformationMessage(`Profile "${created.name}" imported successfully!`);
            this.onProfileChanged?.();
            await this.refresh();
            break;
          }

          case 'openInBrowser': {
            if (message.url && typeof message.url === 'string' && message.url.length <= 2048) {
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
            const workspaceFolder = getWorkspaceRepoPath();
            if (!workspaceFolder) {
              vscode.window.showWarningMessage('No repository workspace open to link.');
              break;
            }
            if (typeof message.profileId !== 'string' || message.profileId.length > 128) {
              break;
            }
            const profile = await this.profileManager.getProfile(message.profileId);
            if (!profile) {
              vscode.window.showWarningMessage(`Cannot link: profile "${message.profileId}" does not exist.`);
              break;
            }
            const repo = await this.repoDiscovery.detectRepository(workspaceFolder);
            const targetPath = repo?.path || Platform.normalizePath(workspaceFolder);
            await this.profileManager.associateRepository(targetPath, message.profileId);
            vscode.window.showInformationMessage(`Linked repository to profile "${profile.name}".`);
            this.onProfileChanged?.();
            await this.refresh();
            break;
          }


          case 'unlinkRepo': {
            const workspaceFolder = getWorkspaceRepoPath();
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

          case 'verifyProfile': {
            if (!message.profileId || typeof message.profileId !== 'string' || message.profileId.length > 128) {
              break;
            }
            const profile = await this.profileManager.getProfile(message.profileId);
            if (!profile) {
              vscode.window.showWarningMessage(`Cannot verify: profile "${message.profileId}" does not exist.`);
              break;
            }
            if (this.accountVerifier) {
              const activeUri = vscode.window.activeTextEditor?.document.uri;
              const workspaceFolder = activeUri && activeUri.scheme === 'file'
                ? vscode.workspace.getWorkspaceFolder(activeUri)?.uri.fsPath
                : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
              let repoPath: string | undefined;
              if (workspaceFolder) {
                const repo = await this.repoDiscovery.detectRepository(workspaceFolder);
                repoPath = repo?.path;
              }
              const res = await this.accountVerifier.verifyProfile(profile, repoPath, { force: true, onDemand: true });
              this.view?.webview.postMessage({
                command: 'verificationResult',
                profileId: message.profileId,
                result: res,
              });
              if (res.success) {
                vscode.window.showInformationMessage(`Verified "${profile.name}": ${res.message}`);
              } else {
                vscode.window.showWarningMessage(`Verification warning for "${profile.name}": ${res.message}`);
              }
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

  public async importAllAccounts(): Promise<void> {
    if (this.discoveredAccounts.length === 0) return;
    const toImport = [...this.discoveredAccounts];
    let count = 0;
    for (const raw of toImport) {
      const accountToImport: CreateProfileInput = {
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
      await this.profileManager.createProfile(accountToImport);
      count++;
    }
    this.discoveredAccounts = [];
    vscode.window.showInformationMessage(`Successfully created ${count} profile(s) from discovered accounts!`);
    this.onProfileChanged?.();
    await this.refresh();
  }

  public async refresh(): Promise<void> {
    if (!this.view) return;
    const state = await this.getCurrentState();
    const scriptUri = this.view.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'main.js')
    );
    const styleUri = this.view.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'main.css')
    );
    const nonce = crypto.randomBytes(16).toString('base64');
    this.view.webview.html = HtmlBuilder.render(state, {
      cspSource: this.view.webview.cspSource,
      scriptUri: scriptUri.toString(),
      styleUri: styleUri.toString(),
      nonce,
    });

    if (this.accountVerifier && state.profiles.length > 0) {
      this.verifyAllProfilesInBackground(state.profiles, state.repository?.path).catch(err =>
        logger.debug(`Background verification error: ${String(err)}`)
      );
    }
  }

  private async verifyAllProfilesInBackground(profiles: GitProfile[], repoPath?: string): Promise<void> {
    if (!this.accountVerifier || profiles.length === 0) return;
    let changed = false;
    for (const p of profiles) {
      if (p.authentication.type === 'credential-manager' || p.authentication.type === 'none') {
        const prev = this.profileStatuses[p.id];
        if (!prev || prev.status !== 'not-verified') {
          this.profileStatuses[p.id] = {
            verified: false,
            status: 'not-verified',
            message: 'Configured, not verified',
          };
          changed = true;
        }
        continue;
      }

      try {
        const res = await this.accountVerifier.verifyProfile(p, repoPath);
        const prev = this.profileStatuses[p.id];
        if (!prev || prev.status !== res.status || prev.verified !== res.success || prev.message !== res.message) {
          this.profileStatuses[p.id] = {
            verified: res.success,
            status: res.status || (res.success ? 'verified' : 'failed'),
            message: res.message,
          };
          changed = true;
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const prev = this.profileStatuses[p.id];
        if (!prev || prev.status !== 'failed' || prev.verified !== false || prev.message !== errMsg) {
          this.profileStatuses[p.id] = {
            verified: false,
            status: 'failed',
            message: errMsg,
          };
          changed = true;
        }
      }
    }
    if (changed && this.view) {
      const active = await this.profileManager.getActiveProfile();
      this.view.webview.postMessage({
        command: 'verificationStatuses',
        statuses: this.profileStatuses,
        activeProfileId: active?.id,
      });
    }
  }

  private async getCurrentState(): Promise<WebviewState> {
    const profiles = await this.profileManager.getProfiles();
    let profile = await this.profileManager.getActiveProfile();

    let repository: GitRepository | undefined;
    let matchResult: ProfileMatchResult | undefined;
    let repoUrl: string | undefined;
    let linkedProfileId: string | undefined;

    const folderPath = getWorkspaceRepoPath();

    if (folderPath) {
      repository = await this.repoDiscovery.detectRepository(folderPath, true);

      if (repository) {
        linkedProfileId = await this.profileManager.getAssociation(repository.path);
        const resolved = await this.profileManager.resolveProfileForRepository(repository.path, {
          remotes: repository.remotes,
        });
        if (resolved?.profile) {
          profile = resolved.profile;
        }
        matchResult = resolved?.matchResult || await this.profileManager.matchProfile({
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
      profileStatuses: this.profileStatuses,
    };
  }
}
