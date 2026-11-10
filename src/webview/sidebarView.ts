import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { DiscoveredAccount, HtmlBuilder, WebviewState } from './html';
import { ProfileManager } from '../profiles/profileManager';
import { RepositoryDiscovery } from '../discovery/repositoryDiscovery';
import { SystemDiscovery } from '../discovery/systemDiscovery';
import { AuthenticationConfigInput, CreateProfileInput, GitProfile, GitRepository, ProfileMatchResult, UpdateProfileInput } from '../contracts';
import { Platform } from '../utils/platform';
import { Validation } from '../utils/validation';
import { logger } from '../utils/logger';
import { AccountVerifier } from '../auth/accountVerifier';
import { confirmGlobalGitChange, getWorkspaceRepoPath } from '../utils/workspace';

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
  'useRecommended',
  'verifyProfile',
  'dismissDiscovered',
  'verifyToken',
  'testSshKey',
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
            const valError = this.validateProfileFormData(data);
            if (valError) {
              this.postSaveError(valError);
              break;
            }

            const rawSshKey = typeof data.sshKeyPath === 'string' ? data.sshKeyPath.trim() : undefined;
            const isSsh = data.authType === 'ssh' || (!data.authType && Boolean(rawSshKey));
            if (isSsh && rawSshKey && !Validation.isValidSshKeyPath(rawSshKey)) {
              this.postSaveError(`Invalid SSH key path: "${data.sshKeyPath}". Path contains invalid characters or command flags.`);
              break;
            }

            const baseFields = this.toProfileGitFields(data);
            let gh = this.extractGitHubIdentity(data);
            const patVal = typeof data.pat === 'string' ? data.pat.trim() : undefined;

            if (!gh && this.accountVerifier) {
              try {
                const host = typeof data.host === 'string' && data.host.trim() ? data.host.trim() : 'github.com';
                if (data.authType === 'pat' && patVal) {
                  const res = await this.accountVerifier.verifyPatToken(patVal, host);
                  if (res.success && res.login) {
                    gh = { host, username: res.login };
                  }
                } else if (isSsh) {
                  const res = await this.accountVerifier.verifySshKey(rawSshKey, host);
                  if (res.success && res.login) {
                    gh = { host, username: res.login };
                  }
                }
              } catch {}
            }

            let authConfig: AuthenticationConfigInput;
            if (isSsh) {
              authConfig = {
                type: 'ssh',
                source: 'user-input',
                sshKeyPath: rawSshKey || undefined,
              };
            } else if (data.authType === 'pat' || (!data.authType && patVal && patVal.length > 0)) {
              authConfig = {
                type: 'pat',
                source: 'vs-code-secret-storage',
              };
            } else {
              authConfig = {
                type: 'none',
                source: 'user-input',
              };
            }

            const input: CreateProfileInput = {
              ...baseFields,
              github: gh,
              authentication: authConfig,
              source: 'manual',
              imported: false,
            };

            const created = await this.profileManager.createProfile(input, !isSsh && data.authType === 'pat' && patVal ? patVal : undefined);
            await this.applyProfileIfActive(created);
            this.view?.webview.postMessage({ command: 'saveSuccess', profileId: created.id });
            vscode.window.showInformationMessage(`Profile "${created.name}" created successfully!`);
            this.onProfileChanged?.();
            await this.refresh();
            break;
          }

          case 'updateProfileFromForm': {
            const data = message.data;
            if (!data || typeof data !== 'object' || typeof data.id !== 'string' || data.id.length > 128) {
              this.postSaveError('Profile ID is required.');
              break;
            }
            const valError = this.validateProfileFormData(data);
            if (valError) {
              this.postSaveError(valError);
              break;
            }

            const rawSshKey = typeof data.sshKeyPath === 'string' ? data.sshKeyPath.trim() : undefined;
            const isSsh = data.authType === 'ssh' || (!data.authType && Boolean(rawSshKey));
            if (isSsh && rawSshKey && !Validation.isValidSshKeyPath(rawSshKey)) {
              this.postSaveError(`Invalid SSH key path: "${data.sshKeyPath}". Path contains invalid characters or command flags.`);
              break;
            }

            const existingProfile = await this.profileManager.getProfile(data.id);
            if (!existingProfile) {
              this.postSaveError(`Cannot update: profile "${data.id}" does not exist.`);
              break;
            }

            const baseFields = this.toProfileGitFields(data);
            let gh = this.extractGitHubIdentity(data);
            const patVal = typeof data.pat === 'string' ? data.pat.trim() : undefined;

            if (!gh && this.accountVerifier) {
              try {
                const host = typeof data.host === 'string' && data.host.trim() ? data.host.trim() : 'github.com';
                if (data.authType === 'pat') {
                  const tokenToVerify = patVal || (await this.profileManager.getAuthManager().getPatAuth().getToken(existingProfile.id));
                  if (tokenToVerify) {
                    const res = await this.accountVerifier.verifyPatToken(tokenToVerify, host);
                    if (res.success && res.login) {
                      gh = { host, username: res.login };
                    }
                  }
                } else if (isSsh) {
                  const res = await this.accountVerifier.verifySshKey(rawSshKey, host);
                  if (res.success && res.login) {
                    gh = { host, username: res.login };
                  }
                }
              } catch {}
            }

            const input: UpdateProfileInput = {
              ...baseFields,
              github: gh
                ? { ...gh, orgs: existingProfile.github?.orgs }
                : {
                    username: '',
                    host: typeof data.host === 'string' && data.host.trim() ? data.host.trim() : 'github.com',
                    orgs: existingProfile.github?.orgs,
                  },
            };

            if (isSsh) {
              input.authentication = {
                type: 'ssh',
                source: 'user-input',
                sshKeyPath: rawSshKey || '',
              };
            } else if (data.authType === 'none') {
              input.authentication = {
                type: 'none',
                source: 'user-input',
                sshKeyPath: '',
              };
            } else if (data.authType === 'pat' || (!data.authType && patVal && patVal.length > 0)) {
              input.authentication = {
                type: 'pat',
                source: 'vs-code-secret-storage',
                sshKeyPath: '',
              };
            }

            const secretToSave = !isSsh && data.authType === 'pat' && patVal && patVal.length > 0 ? patVal : undefined;
            const updated = await this.profileManager.updateProfile(data.id, input, secretToSave);
            this.accountVerifier?.clearCache(data.id);
            await this.applyProfileIfActive(updated);
            this.view?.webview.postMessage({ command: 'saveSuccess', profileId: updated.id });
            vscode.window.showInformationMessage(`Profile "${updated.name}" updated successfully!`);
            this.onProfileChanged?.();
            await this.refresh();
            break;
          }

          case 'deleteProfile': {
            const profile = await this.getValidProfileFromMessage(message, 'delete');
            if (!profile) break;
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
            const accountToImport = this.toProfileInputFromDiscovered(raw);
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

          case 'useRecommended': {
            const state = await this.getCurrentState();
            if (state.matchResult?.recommendedProfileId) {
              const repoPath = await this.getActiveRepoPath();
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
            const profile = await this.getValidProfileFromMessage(message, 'verify');
            if (!profile) break;
            if (this.accountVerifier) {
              const repoPath = await this.getActiveRepoPath();
              const res = await this.accountVerifier.verifyProfile(profile, repoPath, { force: true, onDemand: true });
              this.view?.webview.postMessage({
                command: 'verificationResult',
                profileId: message.profileId,
                result: res,
              });
              if (res.success) {
                if (res.login && !profile.github?.username) {
                  try {
                    await this.profileManager.updateProfile(profile.id, {
                      github: {
                        host: profile.github?.host || 'github.com',
                        username: res.login,
                        orgs: profile.github?.orgs,
                      },
                    });
                    this.onProfileChanged?.();
                    await this.refresh();
                  } catch {}
                }
                vscode.window.showInformationMessage(`Verified "${profile.name}": ${res.message}`);
              } else {
                vscode.window.showWarningMessage(`Verification warning for "${profile.name}": ${res.message}`);
              }
            }
            break;
          }

          case 'verifyToken': {
            const token = typeof message.token === 'string' ? message.token.trim() : '';
            const host = typeof message.host === 'string' && message.host.trim() ? message.host.trim() : 'github.com';
            if (!token) {
              this.view?.webview.postMessage({
                command: 'verifyTokenResult',
                success: false,
                message: 'Please enter a Personal Access Token to verify.',
              });
              break;
            }
            if (this.accountVerifier) {
              const res = await this.accountVerifier.verifyPatToken(token, host);
              this.view?.webview.postMessage({
                command: 'verifyTokenResult',
                success: res.success,
                login: res.login,
                name: res.name,
                email: res.email,
                scopes: res.scopes,
                message: res.message,
              });
            } else {
              this.view?.webview.postMessage({
                command: 'verifyTokenResult',
                success: false,
                message: 'Account verification service is unavailable.',
              });
            }
            break;
          }

          case 'testSshKey': {
            const sshKeyPath = typeof message.sshKeyPath === 'string' ? message.sshKeyPath.trim() : undefined;
            const host = typeof message.host === 'string' && message.host.trim() ? message.host.trim() : 'github.com';
            if (this.accountVerifier) {
              const res = await this.accountVerifier.verifySshKey(sshKeyPath, host);
              this.view?.webview.postMessage({
                command: 'testSshResult',
                success: res.success,
                login: res.login,
                email: res.email,
                message: res.message,
              });
            } else {
              this.view?.webview.postMessage({
                command: 'testSshResult',
                success: false,
                message: 'Account verification service is unavailable.',
              });
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
      const accountToImport = this.toProfileInputFromDiscovered(raw);
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

  private validateProfileFormData(data: any): string | undefined {
    if (!data || typeof data !== 'object' || typeof data.name !== 'string' || typeof data.gitName !== 'string' || typeof data.gitEmail !== 'string') {
      return 'Profile Name, Git Author Name, and Git Email are required.';
    }
    if (data.name.length > 64 || data.gitName.length > 128 || data.gitEmail.length > 256) {
      return 'Input exceeds maximum allowed length.';
    }
    if (!Validation.isValidProfileName(data.name)) {
      return 'Please enter a valid profile name (alphanumeric, dash, underscore, dot, space, 1-64 chars).';
    }
    if (!Validation.isValidEmail(data.gitEmail)) {
      return 'Please enter a valid Git email address.';
    }
    const isSsh = data.authType === 'ssh' || (!data.authType && Boolean(data.sshKeyPath && typeof data.sshKeyPath === 'string' && data.sshKeyPath.trim()));
    if (isSsh && data.sshKeyPath && typeof data.sshKeyPath === 'string' && data.sshKeyPath.trim()) {
      if (!Validation.isValidSshKeyPath(data.sshKeyPath.trim())) {
        return `Invalid SSH key path: "${data.sshKeyPath}". Path contains invalid characters or command flags.`;
      }
    }
    return undefined;
  }

  private postSaveError(error: string): void {
    this.view?.webview.postMessage({ command: 'saveError', error });
    vscode.window.showErrorMessage(error);
  }

  private async applyProfileIfActive(profile: GitProfile): Promise<void> {
    const active = await this.profileManager.getActiveProfile();
    if (active?.id === profile.id) {
      const repoPath = await this.getActiveRepoPath();
      if (repoPath || profile.git.scope === 'global') {
        await this.profileManager.applyIdentityToRepository(profile, repoPath, confirmGlobalGitChange);
      }
    }
  }

  private async getActiveRepoPath(): Promise<string | undefined> {
    const workspaceFolder = getWorkspaceRepoPath();
    if (!workspaceFolder) return undefined;
    const repo = await this.repoDiscovery.detectRepository(workspaceFolder);
    return repo?.path;
  }

  private toProfileInputFromDiscovered(raw: DiscoveredAccount): CreateProfileInput {
    return {
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

  private toProfileGitFields(data: any): { name: string; git: { name: string; email: string; scope: 'global' | 'local' } } {
    return {
      name: data.name.trim(),
      git: {
        name: data.gitName.trim(),
        email: data.gitEmail.trim(),
        scope: data.scope === 'global' ? 'global' : 'local',
      },
    };
  }

  private async getValidProfileFromMessage(message: any, actionDesc: string): Promise<GitProfile | undefined> {
    if (!message.profileId || typeof message.profileId !== 'string' || message.profileId.length > 128) {
      return undefined;
    }
    const profile = await this.profileManager.getProfile(message.profileId);
    if (!profile) {
      vscode.window.showWarningMessage(`Cannot ${actionDesc}: profile "${message.profileId}" does not exist.`);
      return undefined;
    }
    return profile;
  }

  private extractGitHubIdentity(data: any): { host: string; username: string } | undefined {
    if (typeof data.githubUsername === 'string' && data.githubUsername.trim()) {
      return {
        host: typeof data.host === 'string' && data.host.trim() ? data.host.trim() : 'github.com',
        username: data.githubUsername.trim(),
      };
    }
    return undefined;
  }
}
