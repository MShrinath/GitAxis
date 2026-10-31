import { GitProfile, ResolvedAuthentication } from '../contracts';
import { SecretStore } from './secretStore';
import { PatAuth } from './patAuth';
import { GitHubCliAuth } from './githubCliAuth';
import { CredentialManagerAuth } from './credentialManagerAuth';
import { logger } from '../utils/logger';

export class AuthManager {
  private patAuth: PatAuth;
  private ghCliAuth: GitHubCliAuth;
  private credManagerAuth: CredentialManagerAuth;

  constructor(
    private secretStore: SecretStore,
    patAuth?: PatAuth,
    ghCliAuth?: GitHubCliAuth,
    credManagerAuth?: CredentialManagerAuth
  ) {
    this.patAuth = patAuth ?? new PatAuth(this.secretStore);
    this.ghCliAuth = ghCliAuth ?? new GitHubCliAuth();
    this.credManagerAuth = credManagerAuth ?? new CredentialManagerAuth();
  }

  public getSecretStore(): SecretStore {
    return this.secretStore;
  }

  public getPatAuth(): PatAuth {
    return this.patAuth;
  }

  public getGhCliAuth(): GitHubCliAuth {
    return this.ghCliAuth;
  }

  public async resolveAuthentication(profile: GitProfile): Promise<ResolvedAuthentication> {
    const authType = profile.authentication.type;
    const username = profile.github?.username || profile.git.name;
    const host = profile.github?.host || 'github.com';

    switch (authType) {
      case 'pat': {
        const token = await this.patAuth.getToken(profile.id);
        if (!token) {
          logger.warn(`No Personal Access Token found in secret store for profile ${profile.id}`);
        }
        return {
          type: 'pat',
          username,
          credential: token,
        };
      }

      case 'github-cli': {
        const token = await this.ghCliAuth.getToken(host, profile.github?.username);
        return {
          type: 'github-cli',
          username,
          credential: token,
        };
      }

      case 'credential-manager': {
        return {
          type: 'credential-manager',
          username,
        };
      }

      case 'ssh': {
        return {
          type: 'ssh',
          username,
        };
      }

      case 'oauth': {
        const token = await this.secretStore.getSecret(profile.id, 'oauth-access-token');
        return {
          type: 'oauth',
          username,
          credential: token,
        };
      }

      case 'none':
      default:
        return {
          type: 'none',
          username,
        };
    }
  }

  public async saveTokenForProfile(profileId: string, token: string): Promise<void> {
    await this.patAuth.setToken(profileId, token);
  }

  public async clearAuthForProfile(profileId: string): Promise<void> {
    await this.secretStore.deleteAllForProfile(profileId);
  }
}
