import * as os from 'os';
import * as path from 'path';
import {
  CreateProfileInput,
  GitProfile,
  ProfileId,
  ProfileMatchResult,
  UpdateProfileInput,
} from '../contracts';
import { PersistentProfileStore } from './profileStore';
import { MatchContext, ProfileMatcher } from './profileMatcher';
import { AuthManager } from '../auth/authManager';
import { GitClient } from '../git/gitClient';
import { RemoteParser } from '../git/remote';
import { Platform } from '../utils/platform';
import { logger } from '../utils/logger';

export class ProfileManager {
  private matcher: ProfileMatcher;

  constructor(
    private store: PersistentProfileStore,
    private authManager: AuthManager,
    private gitClient: GitClient,
    matcher?: ProfileMatcher
  ) {
    this.matcher = matcher ?? new ProfileMatcher(this.store);
  }

  public getStore(): PersistentProfileStore {
    return this.store;
  }

  public getMatcher(): ProfileMatcher {
    return this.matcher;
  }

  public async getProfiles(): Promise<GitProfile[]> {
    return this.store.list();
  }

  public async getActiveProfile(): Promise<GitProfile | undefined> {
    return this.store.getActive();
  }

  public async getProfile(id: ProfileId): Promise<GitProfile | undefined> {
    return this.store.get(id);
  }

  public async createProfile(input: CreateProfileInput, secretToken?: string): Promise<GitProfile> {
    const profile = await this.store.create(input);
    if (secretToken && input.authentication.type === 'pat') {
      await this.authManager.saveTokenForProfile(profile.id, secretToken);
    }
    logger.info(`Profile created: ${profile.name} (${profile.id})`);
    return profile;
  }

  public async updateProfile(id: ProfileId, input: UpdateProfileInput, secretToken?: string): Promise<GitProfile> {
    const updated = await this.store.update(id, input);
    if (secretToken && (input.authentication?.type === 'pat' || updated.authentication.type === 'pat')) {
      await this.authManager.saveTokenForProfile(id, secretToken);
    }
    logger.info(`Profile updated: ${updated.name} (${id})`);
    return updated;
  }

  public async deleteProfile(id: ProfileId): Promise<void> {
    await this.authManager.clearAuthForProfile(id);
    await this.store.delete(id);
    logger.info(`Profile deleted: ${id}`);
  }

  public getAuthManager(): AuthManager {
    return this.authManager;
  }

  public async switchProfile(
    id: ProfileId,
    repositoryPath?: string,
    confirmGlobalChange?: () => Promise<boolean>
  ): Promise<GitProfile> {
    const profile = await this.store.get(id);
    if (!profile) {
      throw new Error(`Profile with id "${id}" does not exist`);
    }

    await this.store.setActive(id);

    // If repository path is provided or scope is global, apply identity based on scope
    if (repositoryPath || profile.git.scope === 'global') {
      await this.applyIdentityToRepository(profile, repositoryPath, confirmGlobalChange);
    }

    logger.info(`Switched active profile to ${profile.name}`);
    return profile;
  }

  public async applyIdentityToRepository(
    profile: GitProfile,
    repositoryPath?: string,
    confirmGlobalChange?: () => Promise<boolean>
  ): Promise<void> {
    try {
      // 1. Resolve targetPath and check if repositoryPath points to a valid git repository
      let isRepo = false;
      let targetPath = repositoryPath;
      if (repositoryPath) {
        try {
          isRepo = await this.gitClient.isRepository(repositoryPath);
          if (isRepo) {
            targetPath = await this.gitClient.getRoot(repositoryPath);
          }
        } catch {
          isRepo = false;
        }
      }

      // 2. Apply Git author name and email
      if (profile.git.scope === 'global') {
        if (confirmGlobalChange) {
          const confirmed = await confirmGlobalChange();
          if (!confirmed) {
            logger.warn(`User cancelled global Git identity update for profile "${profile.name}".`);
            return;
          }
        }
        await this.gitClient.setGlobalConfig('user.name', profile.git.name);
        await this.gitClient.setGlobalConfig('user.email', profile.git.email);
        logger.info(`Applied global Git identity for profile ${profile.name}`);
      } else if (isRepo && targetPath) {
        await this.gitClient.setLocalConfig(targetPath, 'user.name', profile.git.name);
        await this.gitClient.setLocalConfig(targetPath, 'user.email', profile.git.email);
        logger.info(`Applied local Git identity to ${targetPath} for profile ${profile.name}`);
      }

      // Normalize host by removing protocol and trailing slashes
      const rawHost = profile.github?.host?.trim() || 'github.com';
      const host = rawHost.replace(/^https?:\/\//i, '').replace(/\/+$/, '') || 'github.com';
      const ghUsername = profile.github?.username?.trim();

      // 3. GCM Account Alignment: Set credential.https://${host}.username in repository git config (and globally if scope is global) using the profile's GitHub username.
      const credentialKey = `credential.https://${host}.username`;
      if (ghUsername) {
        if (isRepo && targetPath) {
          await this.gitClient.setLocalConfig(targetPath, credentialKey, ghUsername);
        }
        if (profile.git.scope === 'global') {
          await this.gitClient.setGlobalConfig(credentialKey, ghUsername);
        }
      } else {
        if (isRepo && targetPath) {
          await this.gitClient.unsetLocalConfig(targetPath, credentialKey);
          if (host.toLowerCase() !== 'github.com') {
            await this.gitClient.unsetLocalConfig(targetPath, 'credential.https://github.com.username');
          }
        }
        if (profile.git.scope === 'global') {
          await this.gitClient.unsetGlobalConfig(credentialKey);
          if (host.toLowerCase() !== 'github.com') {
            await this.gitClient.unsetGlobalConfig('credential.https://github.com.username');
          }
        }
      }

      // 4. PAT Token Authentication: If the profile has a PAT stored in SecretStorage, set http.https://${host}/.extraheader with AUTHORIZATION: basic <base64> in the repository git config so VS Code Source Control pushes authenticate immediately. If switching to a profile without a PAT, cleanly unset this extraheader.
      if (isRepo && targetPath) {
        const extraHeaderKey = `http.https://${host}/.extraheader`;
        let patToken: string | undefined;
        if (profile.authentication.type === 'pat') {
          patToken = await this.authManager.getPatAuth().getToken(profile.id);
        }

        if (patToken) {
          const authUser = ghUsername || profile.git.name?.trim() || '';
          const authString = authUser ? `${authUser}:${patToken}` : `:${patToken}`;
          const base64Auth = Buffer.from(authString).toString('base64');
          const extraHeaderValue = `AUTHORIZATION: basic ${base64Auth}`;
          await this.gitClient.setLocalConfig(targetPath, extraHeaderKey, extraHeaderValue);
          logger.info(`Configured PAT extraheader for ${host} on ${targetPath}`);
        } else {
          await this.gitClient.unsetLocalConfig(targetPath, extraHeaderKey);
          if (host.toLowerCase() !== 'github.com') {
            await this.gitClient.unsetLocalConfig(targetPath, 'http.https://github.com/.extraheader');
          }
          await this.gitClient.unsetLocalConfig(targetPath, 'http.extraheader');
          logger.info(`Unset PAT extraheader on ${targetPath}`);
        }
      }

      // 5. SSH Key Alignment: If the profile authentication is SSH with an sshKeyPath, set core.sshCommand to use that key; unset it if switching to a non-SSH profile.
      const rawSshKeyPath = (profile.authentication as { sshKeyPath?: string })?.sshKeyPath?.trim();
      if (profile.authentication.type === 'ssh' && rawSshKeyPath) {
        let resolvedKeyPath = rawSshKeyPath;
        if (resolvedKeyPath.startsWith('~')) {
          resolvedKeyPath = path.join(os.homedir(), resolvedKeyPath.slice(1));
        }
        const normalizedKeyPath = Platform.normalizePath(resolvedKeyPath);
        const sshCommand = rawSshKeyPath.startsWith('ssh ')
          ? rawSshKeyPath
          : `ssh -i "${normalizedKeyPath}"`;

        if (isRepo && targetPath) {
          await this.gitClient.setLocalConfig(targetPath, 'core.sshCommand', sshCommand);
        }
        if (profile.git.scope === 'global') {
          await this.gitClient.setGlobalConfig('core.sshCommand', sshCommand);
        }
        logger.info(`Configured core.sshCommand for profile ${profile.name}`);
      } else {
        if (isRepo && targetPath) {
          await this.gitClient.unsetLocalConfig(targetPath, 'core.sshCommand');
        }
        if (profile.git.scope === 'global') {
          await this.gitClient.unsetGlobalConfig('core.sshCommand');
        }
        logger.info(`Unset core.sshCommand for non-SSH profile ${profile.name}`);
      }

      // 6. Remote URL Synchronization: If the repository has HTTPS remotes matching the profile host, update the remote URL to embed the active profile's GitHub username (https://${username}@${host}/owner/repo.git), preventing Git Credential Manager from defaulting to another cached account.
      if (isRepo && targetPath && ghUsername) {
        const remotes = await this.gitClient.getRemotes(targetPath);
        const targetHost = host.toLowerCase();
        const targetHostname = targetHost.split(':')[0];

        for (const remote of remotes) {
          const remoteHost = remote.host?.toLowerCase();
          const remoteHostname = remoteHost ? remoteHost.split(':')[0] : undefined;
          if (remoteHost === targetHost || (remoteHostname && remoteHostname === targetHostname)) {
            const isFetchHttps = !!remote.fetchUrl && (remote.fetchUrl.startsWith('https://') || remote.fetchUrl.startsWith('http://'));
            const isPushHttps = !!remote.pushUrl && (remote.pushUrl.startsWith('https://') || remote.pushUrl.startsWith('http://'));

            if (isFetchHttps || isPushHttps) {
              const sampleUrl = remote.fetchUrl || remote.pushUrl || '';
              const parsed = RemoteParser.parseUrl(sampleUrl);
              const owner = remote.owner || parsed?.owner;
              const rawRepo = remote.repository || parsed?.repository;
              const cleanRepo = rawRepo ? rawRepo.replace(/\.git$/, '') : undefined;

              // Check if URL specifies a custom port
              let hostWithPort = host;
              try {
                const u = new URL(sampleUrl.includes('://') ? sampleUrl : `https://${sampleUrl}`);
                if (u.port && !host.includes(':')) {
                  hostWithPort = `${u.hostname}:${u.port}`;
                }
              } catch {}

              if (owner && cleanRepo) {
                const newUrl = `https://${ghUsername}@${hostWithPort}/${owner}/${cleanRepo}.git`;
                if (isFetchHttps && remote.fetchUrl !== newUrl) {
                  await this.gitClient.setRemoteUrl(targetPath, remote.name, newUrl);
                  logger.info(`Updated fetch remote URL for "${remote.name}" to ${newUrl}`);
                }
                if (isPushHttps) {
                  const pushUrlInConfig = await this.gitClient.getLocalConfig(targetPath, `remote.${remote.name}.pushurl`);
                  if (pushUrlInConfig && pushUrlInConfig !== newUrl) {
                    await this.gitClient.setRemoteUrl(targetPath, remote.name, newUrl, true);
                    logger.info(`Updated push remote URL for "${remote.name}" to ${newUrl}`);
                  } else if (remote.pushUrl && remote.pushUrl !== remote.fetchUrl && remote.pushUrl !== newUrl) {
                    await this.gitClient.setRemoteUrl(targetPath, remote.name, newUrl, true);
                    logger.info(`Updated push remote URL for "${remote.name}" to ${newUrl}`);
                  }
                }
              }
            }
          }
        }
      }
    } catch (err) {
      logger.error(`Failed to apply git identity to repository: ${String(err)}`);
      throw err;
    }
  }

  public async matchProfile(context: MatchContext): Promise<ProfileMatchResult> {
    return this.matcher.match(context);
  }

  public async associateRepository(repoPath: string, profileId: ProfileId): Promise<void> {
    await this.store.setAssociation(repoPath, profileId);
  }

  public async disassociateRepository(repoPath: string): Promise<void> {
    await this.store.removeAssociation(repoPath);
  }

  public async getAssociation(repoPath: string): Promise<ProfileId | undefined> {
    return this.store.getAssociation(repoPath);
  }
}
