import * as os from 'os';
import * as path from 'path';
import {
  CreateProfileInput,
  GitProfile,
  GitRemote,
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
import { FolderRuleManager } from './folderRuleManager';

export class ProfileManager {
  private matcher: ProfileMatcher;
  private folderRuleManager: FolderRuleManager;

  constructor(
    private store: PersistentProfileStore,
    private authManager: AuthManager,
    private gitClient: GitClient,
    matcher?: ProfileMatcher,
    folderRuleManager?: FolderRuleManager
  ) {
    this.matcher = matcher ?? new ProfileMatcher(this.store);
    this.folderRuleManager = folderRuleManager ?? new FolderRuleManager();
  }

  public getStore(): PersistentProfileStore {
    return this.store;
  }

  public getMatcher(): ProfileMatcher {
    return this.matcher;
  }

  public getFolderRuleManager(): FolderRuleManager {
    return this.folderRuleManager;
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

    // Apply identity first (atomic)
    if (repositoryPath || profile.git.scope === 'global') {
      const applied = await this.applyIdentityToRepository(profile, repositoryPath, confirmGlobalChange);
      if (applied === false) {
        throw new Error(`Profile switch to "${profile.name}" was cancelled by user.`);
      }
    }

    // If repository path was provided, associate this repo with the profile so switching applies to current repo
    if (repositoryPath) {
      let repoRoot = repositoryPath;
      try {
        if (await this.gitClient.isRepository(repositoryPath)) {
          repoRoot = await this.gitClient.getRoot(repositoryPath);
        }
      } catch {}
      await this.store.setAssociation(repoRoot, id);
    }

    await this.store.setActive(id);

    logger.info(`Switched active profile to ${profile.name}`);
    return profile;
  }

  public async applyIdentityToRepository(
    profile: GitProfile,
    repositoryPath?: string,
    confirmGlobalChange?: () => Promise<boolean>
  ): Promise<boolean> {
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
            return false;
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

      // 4. PAT Token Authentication: Do NOT persist PATs to .git/config (Section 1). Ensure any leftover extraheaders are cleanly removed. Credentials are provided per-command in memory.
      if (isRepo && targetPath) {
        const extraHeaderKey = `http.https://${host}/.extraheader`;
        await this.gitClient.unsetLocalConfig(targetPath, extraHeaderKey);
        if (host.toLowerCase() !== 'github.com') {
          await this.gitClient.unsetLocalConfig(targetPath, 'http.https://github.com/.extraheader');
        }
        await this.gitClient.unsetLocalConfig(targetPath, 'http.extraheader');
        logger.info(`Cleaned any persistent PAT extraheaders on ${targetPath}`);
      }


      // 5. SSH Key Alignment: If the profile authentication is SSH with an sshKeyPath, set core.sshCommand to use that key; unset it if switching to a non-SSH profile.
      const rawSshKeyPath = (profile.authentication as { sshKeyPath?: string })?.sshKeyPath?.trim();
      if (profile.authentication.type === 'ssh' && rawSshKeyPath) {
        const cleanKeyPath = rawSshKeyPath.replace(/^["']|["']$/g, '').trim();
        let resolvedKeyPath = cleanKeyPath;
        if (resolvedKeyPath.startsWith('~')) {
          resolvedKeyPath = path.join(os.homedir(), resolvedKeyPath.slice(1));
        }
        const normalizedKeyPath = Platform.normalizePath(resolvedKeyPath);
        let sshCommand: string;
        if (cleanKeyPath.startsWith('ssh ')) {
          sshCommand = cleanKeyPath.includes('-o IdentitiesOnly=yes')
            ? cleanKeyPath
            : `${cleanKeyPath} -o IdentitiesOnly=yes`;
        } else {
          sshCommand = `ssh -i "${normalizedKeyPath}" -o IdentitiesOnly=yes`;
        }

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
      return true;
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

  public async resolveProfileForRepository(
    repositoryPath: string,
    options?: {
      remotes?: GitRemote[];
      localGitEmail?: string;
      localGitName?: string;
    }
  ): Promise<ResolvedRepoProfile | undefined> {
    const profiles = await this.store.list();
    if (profiles.length === 0) return undefined;

    let targetPath = repositoryPath;
    try {
      if (await this.gitClient.isRepository(repositoryPath)) {
        targetPath = await this.gitClient.getRoot(repositoryPath);
      }
    } catch {}

    // 1. Explicit binding
    const boundId = await this.store.getAssociation(targetPath);
    if (boundId) {
      const bound = profiles.find(p => p.id === boundId);
      if (bound) {
        return { profile: bound, source: 'binding', isBound: true };
      }
    }

    // 2. Folder rule (includeIf / folder path pattern matching)
    const folderMatch = this.folderRuleManager.resolveProfile(targetPath, profiles);
    if (folderMatch) {
      return {
        profile: folderMatch.profile,
        source: 'folder-rule',
        isBound: false,
        folderRule: folderMatch.rule,
      };
    }

    // 3. Matcher (remote owner, host, email, name)
    let remotes = options?.remotes;
    if (!remotes) {
      try {
        remotes = await this.gitClient.getRemotes(targetPath);
      } catch {}
    }

    let localGitEmail = options?.localGitEmail;
    let localGitName = options?.localGitName;
    if (!localGitEmail) {
      try {
        localGitEmail = (await this.gitClient.getLocalConfig(targetPath, 'user.email')) || (await this.gitClient.getConfig(targetPath, 'user.email'));
      } catch {}
    }
    if (!localGitName) {
      try {
        localGitName = (await this.gitClient.getLocalConfig(targetPath, 'user.name')) || (await this.gitClient.getConfig(targetPath, 'user.name'));
      } catch {}
    }

    const matchResult = await this.matcher.match({
      repositoryPath: targetPath,
      remotes,
      localGitEmail,
      localGitName,
    });

    if (matchResult.recommendedProfileId) {
      const matched = profiles.find(p => p.id === matchResult.recommendedProfileId);
      if (matched) {
        return { profile: matched, source: 'matcher', isBound: false, matchResult };
      }
    }

    // 4. Fallback: last-used / active profile
    const active = await this.store.getActive();
    if (active) {
      return { profile: active, source: 'fallback', isBound: false };
    }

    return { profile: profiles[0], source: 'fallback', isBound: false };
  }
}

export interface ResolvedRepoProfile {
  profile: GitProfile;
  source: 'binding' | 'folder-rule' | 'matcher' | 'fallback';
  isBound: boolean;
  folderRule?: string;
  matchResult?: ProfileMatchResult;
}
