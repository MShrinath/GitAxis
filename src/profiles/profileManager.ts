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
    } else if (input.authentication?.type && input.authentication.type !== 'pat') {
      await this.authManager.clearAuthForProfile(id);
    }
    logger.info(`Profile updated: ${updated.name} (${id})`);
    return updated;
  }

  private async unsetHostConfigKey(
    host: string,
    keyFactory: (h: string) => string,
    targetPath?: string
  ): Promise<void> {
    const key = keyFactory(host);
    if (targetPath) {
      await this.gitClient.unsetLocalConfig(targetPath, key);
    } else {
      await this.gitClient.unsetGlobalConfig(key);
    }
    if (host.toLowerCase() !== 'github.com') {
      const defaultKey = keyFactory('github.com');
      if (targetPath) {
        await this.gitClient.unsetLocalConfig(targetPath, defaultKey);
      } else {
        await this.gitClient.unsetGlobalConfig(defaultKey);
      }
    }
  }

  private async rejectPatCredential(profile: GitProfile, repoPath?: string): Promise<void> {
    if (profile.authentication?.type !== 'pat') return;
    try {
      const host = Platform.normalizeGitHubHost(profile.github?.host);
      const username = profile.github?.username?.trim() || (profile.git.name && /^[a-zA-Z0-9_.-]+$/.test(profile.git.name) ? profile.git.name : undefined);
      if (username) {
        await this.gitClient.rejectCredential({ protocol: 'https', host, username }, repoPath ? { cwd: repoPath } : undefined);
      }
    } catch (err) {
      logger.warn(`Failed to reject credential for profile "${profile.name}": ${String(err)}`);
    }
  }

  public async deleteProfile(id: ProfileId): Promise<void> {
    const profile = await this.store.get(id);
    if (profile) {
      await this.rejectPatCredential(profile);
    }
    await this.authManager.clearAuthForProfile(id);
    await this.store.delete(id);
    logger.info(`Profile deleted: ${id}`);
  }

  public async syncVerifiedLogin(
    profile: GitProfile,
    login?: string,
    onProfileChanged?: () => void
  ): Promise<boolean> {
    const cleanLogin = login?.trim();
    if (!cleanLogin || profile.github?.username) {
      return false;
    }
    try {
      await this.updateProfile(profile.id, {
        github: {
          host: profile.github?.host || 'github.com',
          username: cleanLogin,
          orgs: profile.github?.orgs,
        },
      });
      if (!profile.github) {
        profile.github = {
          host: 'github.com',
          username: cleanLogin,
        };
      } else {
        profile.github.username = cleanLogin;
      }
      onProfileChanged?.();
      return true;
    } catch (err) {
      logger.warn(`Failed to auto-update profile "${profile.name}" with verified GitHub username: ${String(err)}`);
      return false;
    }
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

    const repoRoot = (await this.gitClient.resolveRepositoryRoot(repositoryPath)) || repositoryPath;

    const current = await this.store.getActive();
    if (current && current.id !== id) {
      await this.rejectPatCredential(current, repoRoot);
    }

    if (repoRoot || profile.git.scope === 'global') {
      const applied = await this.applyIdentityToRepository(profile, repoRoot, confirmGlobalChange);
      if (applied === false) {
        throw new Error(`Profile switch to "${profile.name}" was cancelled by user.`);
      }
    }

    if (repoRoot) {
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
      const repoRoot = await this.gitClient.resolveRepositoryRoot(repositoryPath);
      const isRepo = Boolean(repoRoot);
      const targetPath = repoRoot || repositoryPath;

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
      const host = Platform.normalizeGitHubHost(profile.github?.host);
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
          await this.unsetHostConfigKey(host, h => `credential.https://${h}.username`, targetPath);
        }
        if (profile.git.scope === 'global') {
          await this.unsetHostConfigKey(host, h => `credential.https://${h}.username`);
        }
      }

      // 4. PAT Token Authentication: Do NOT persist PATs to .git/config (Section 1). Ensure any leftover extraheaders are cleanly removed. Credentials are provided per-command in memory.
      if (isRepo && targetPath) {
        await this.unsetHostConfigKey(host, h => `http.https://${h}/.extraheader`, targetPath);
        await this.gitClient.unsetLocalConfig(targetPath, 'http.extraheader');
        logger.info(`Cleaned any persistent PAT extraheaders on ${targetPath}`);
      }

      // 4b. Native SCM Push Authentication (Option A):
      // Approve PAT with configured credential helper so VS Code built-in Source Control can push.
      // Skip if helper is plaintext "store" or unset to avoid plaintext disk leakage.
      if (profile.authentication.type === 'pat') {
        try {
          const token = await this.authManager.getPatAuth().getToken(profile.id);
          if (token) {
            let helper = await this.gitClient.getCredentialHelperForUrl(`https://${host}`, targetPath);

            // Bypass GitHub CLI helper collision: gh auth git-credential swallows approveCredential and breaks VS Code native push
            if (isRepo && targetPath && (helper.includes('gh') || helper.includes('auth git-credential') || !helper)) {
              const systemHelper = await this.gitClient.getSystemCredentialHelper();
              await this.gitClient.setLocalConfig(targetPath, `credential.https://${host}.helper`, systemHelper);
              logger.info(`Bypassed GitHub CLI credential helper collision on ${targetPath}: set local credential.https://${host}.helper to "${systemHelper}"`);
              helper = systemHelper;
            }

            const effectiveUsername = ghUsername || (profile.git.name && /^[a-zA-Z0-9_.-]+$/.test(profile.git.name) ? profile.git.name : undefined);
            if (!helper) {
              logger.warn(`No git credential.helper configured; skipping storing PAT in credential helper for profile "${profile.name}".`);
            } else if (helper.includes('store')) {
              logger.warn(`Configured git credential.helper is plaintext "store"; skipping storing PAT to prevent plaintext storage for profile "${profile.name}".`);
            } else if (effectiveUsername) {
              await this.gitClient.approveCredential(
                {
                  protocol: 'https',
                  host,
                  username: effectiveUsername,
                  password: token,
                },
                { cwd: targetPath }
              );
              logger.info(`Approved PAT credential in helper "${helper}" for ${effectiveUsername}@${host}`);
            }
          }
        } catch (helperErr) {
          logger.warn(`Failed to approve PAT in credential helper: ${String(helperErr)}`);
        }
      } else if (isRepo && targetPath) {
        try {
          await this.unsetHostConfigKey(host, h => `credential.https://${h}.helper`, targetPath);
        } catch (err) {
          logger.debug(`Could not unset local credential helper on ${targetPath}: ${String(err)}`);
        }
      }

      // 5. SSH Key Alignment: If the profile authentication is SSH with an sshKeyPath, set core.sshCommand to use that key; unset it if switching to a non-SSH profile.
      const rawSshKeyPath = (profile.authentication as { sshKeyPath?: string })?.sshKeyPath?.trim();
      if (profile.authentication.type === 'ssh' && rawSshKeyPath) {
        const sshCommand = Platform.resolveSshCommand(rawSshKeyPath, os.homedir(), false);

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
      const effectiveUsername = ghUsername || (profile.git.name && /^[a-zA-Z0-9_.-]+$/.test(profile.git.name) ? profile.git.name : undefined);
      if (isRepo && targetPath) {
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
              } catch (err) {
                logger.debug(`Could not parse custom port from ${sampleUrl}: ${String(err)}`);
              }

              if (owner && cleanRepo) {
                const userPrefix = effectiveUsername ? `${effectiveUsername}@` : '';
                const fetchProto = remote.fetchUrl?.startsWith('http://') ? 'http' : 'https';
                const fetchNewUrl = `${fetchProto}://${userPrefix}${hostWithPort}/${owner}/${cleanRepo}.git`;

                const pushProto = (remote.pushUrl || remote.fetchUrl)?.startsWith('http://') ? 'http' : 'https';
                const pushNewUrl = `${pushProto}://${userPrefix}${hostWithPort}/${owner}/${cleanRepo}.git`;

                if (isFetchHttps && remote.fetchUrl !== fetchNewUrl) {
                  await this.gitClient.setRemoteUrl(targetPath, remote.name, fetchNewUrl);
                  logger.info(`Updated fetch remote URL for "${remote.name}" to ${fetchNewUrl}`);
                }
                if (isPushHttps) {
                  const pushUrlInConfig = await this.gitClient.getLocalConfig(targetPath, `remote.${remote.name}.pushurl`);
                  if (pushUrlInConfig && pushUrlInConfig !== pushNewUrl) {
                    await this.gitClient.setRemoteUrl(targetPath, remote.name, pushNewUrl, true);
                    logger.info(`Updated push remote URL for "${remote.name}" to ${pushNewUrl}`);
                  } else if (remote.pushUrl && remote.pushUrl !== remote.fetchUrl && remote.pushUrl !== pushNewUrl) {
                    await this.gitClient.setRemoteUrl(targetPath, remote.name, pushNewUrl, true);
                    logger.info(`Updated push remote URL for "${remote.name}" to ${pushNewUrl}`);
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

    const targetPath = (await this.gitClient.resolveRepositoryRoot(repositoryPath)) || repositoryPath;

    const boundId = await this.store.getAssociation(targetPath);
    if (boundId) {
      const bound = profiles.find(p => p.id === boundId);
      if (bound) {
        return { profile: bound, source: 'binding', isBound: true };
      }
    }

    let remotes = options?.remotes;
    if (!remotes) {
      try {
        remotes = await this.gitClient.getRemotes(targetPath);
      } catch (err) {
        logger.debug(`Could not retrieve remotes for ${targetPath}: ${String(err)}`);
      }
    }

    const folderMatch = this.folderRuleManager.resolveProfile(targetPath, profiles, remotes);
    if (folderMatch) {
      return {
        profile: folderMatch.profile,
        source: 'folder-rule',
        isBound: false,
        folderRule: folderMatch.rule,
        isApplied: this.folderRuleManager.isIncludeIfConfigured(),
      };
    }

    let localGitEmail = options?.localGitEmail;
    let localGitName = options?.localGitName;
    if (!localGitEmail) {
      try {
        localGitEmail = (await this.gitClient.getLocalConfig(targetPath, 'user.email')) || (await this.gitClient.getConfig(targetPath, 'user.email'));
      } catch (err) {
        logger.debug(`Could not retrieve local email for ${targetPath}: ${String(err)}`);
      }
    }
    if (!localGitName) {
      try {
        localGitName = (await this.gitClient.getLocalConfig(targetPath, 'user.name')) || (await this.gitClient.getConfig(targetPath, 'user.name'));
      } catch (err) {
        logger.debug(`Could not retrieve local name for ${targetPath}: ${String(err)}`);
      }
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
  isApplied?: boolean;
  matchResult?: ProfileMatchResult;
}
