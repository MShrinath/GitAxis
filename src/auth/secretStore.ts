export interface ISecretStorage {
  get(key: string): Thenable<string | undefined> | Promise<string | undefined>;
  store(key: string, value: string): Thenable<void> | Promise<void>;
  delete(key: string): Thenable<void> | Promise<void>;
}

class InMemorySecretStorage implements ISecretStorage {
  private storeMap = new Map<string, string>();

  public async get(key: string): Promise<string | undefined> {
    return this.storeMap.get(key);
  }

  public async store(key: string, value: string): Promise<void> {
    this.storeMap.set(key, value);
  }

  public async delete(key: string): Promise<void> {
    this.storeMap.delete(key);
  }
}

export class SecretStore {
  private storage: ISecretStorage;

  constructor(storage?: ISecretStorage) {
    this.storage = storage ?? new InMemorySecretStorage();
  }

  public setStorage(storage: ISecretStorage): void {
    this.storage = storage;
  }

  public getSecretKey(profileId: string, secretType: string): string {
    return `gitaxis.profile.${profileId}.${secretType}`;
  }

  public async getSecret(profileId: string, secretType: string): Promise<string | undefined> {
    const key = this.getSecretKey(profileId, secretType);
    return this.storage.get(key);
  }

  public async setSecret(profileId: string, secretType: string, value: string): Promise<void> {
    const key = this.getSecretKey(profileId, secretType);
    await this.storage.store(key, value);
  }

  public async deleteSecret(profileId: string, secretType: string): Promise<void> {
    const key = this.getSecretKey(profileId, secretType);
    await this.storage.delete(key);
  }

  public async deleteAllForProfile(profileId: string): Promise<void> {
    const secretTypes = ['github-token', 'oauth-access-token', 'oauth-refresh-token', 'ssh-passphrase'];
    for (const type of secretTypes) {
      await this.deleteSecret(profileId, type);
    }
  }
}
