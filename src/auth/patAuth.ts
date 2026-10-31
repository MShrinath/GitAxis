import { SecretStore } from './secretStore';

export class PatAuth {
  constructor(private secretStore: SecretStore) {}

  public async getToken(profileId: string): Promise<string | undefined> {
    return this.secretStore.getSecret(profileId, 'github-token');
  }

  public async setToken(profileId: string, token: string): Promise<void> {
    await this.secretStore.setSecret(profileId, 'github-token', token.trim());
  }

  public async deleteToken(profileId: string): Promise<void> {
    await this.secretStore.deleteSecret(profileId, 'github-token');
  }
}
