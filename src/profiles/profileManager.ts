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

    // If repository path is provided, apply identity based on scope
    if (repositoryPath) {
      await this.applyIdentityToRepository(profile, repositoryPath, confirmGlobalChange);
    }

    logger.info(`Switched active profile to ${profile.name}`);
    return profile;
  }

  public async applyIdentityToRepository(
    profile: GitProfile,
    repositoryPath: string,
    confirmGlobalChange?: () => Promise<boolean>
  ): Promise<void> {
    try {
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
      } else {
        await this.gitClient.setLocalConfig(repositoryPath, 'user.name', profile.git.name);
        await this.gitClient.setLocalConfig(repositoryPath, 'user.email', profile.git.email);
        logger.info(`Applied local Git identity to ${repositoryPath} for profile ${profile.name}`);
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
