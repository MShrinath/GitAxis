import * as crypto from 'crypto';
import {
  CreateProfileInput,
  GitProfile,
  ProfileId,
  ProfileStore,
  UpdateProfileInput,
} from '../contracts';
import { Platform } from '../utils/platform';

export interface IMemento {
  get<T>(key: string, defaultValue?: T): T;
  update(key: string, value: unknown): Thenable<void> | Promise<void>;
}

export class InMemoryMemento implements IMemento {
  private map = new Map<string, unknown>();

  public get<T>(key: string, defaultValue?: T): T {
    if (this.map.has(key)) {
      return this.map.get(key) as T;
    }
    return defaultValue as T;
  }

  public async update(key: string, value: unknown): Promise<void> {
    if (value === undefined) {
      this.map.delete(key);
    } else {
      this.map.set(key, value);
    }
  }
}

export class PersistentProfileStore implements ProfileStore {
  private static readonly PROFILES_KEY = 'gitaxis.profiles';
  private static readonly ACTIVE_PROFILE_KEY = 'gitaxis.activeProfileId';
  private static readonly ASSOCIATIONS_KEY = 'gitaxis.repoAssociations';

  private memento: IMemento;

  constructor(memento?: IMemento) {
    this.memento = memento ?? new InMemoryMemento();
  }

  public setMemento(memento: IMemento): void {
    this.memento = memento;
  }

  private generateId(): string {
    return `profile_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
  }

  public async list(): Promise<GitProfile[]> {
    const raw = this.memento.get<GitProfile[]>(PersistentProfileStore.PROFILES_KEY, []);
    return Array.isArray(raw) ? raw : [];
  }

  public async get(id: ProfileId): Promise<GitProfile | undefined> {
    const profiles = await this.list();
    return profiles.find(p => p.id === id);
  }

  public async getByName(name: string): Promise<GitProfile | undefined> {
    const profiles = await this.list();
    return profiles.find(p => p.name.toLowerCase() === name.toLowerCase());
  }

  public async create(input: CreateProfileInput): Promise<GitProfile> {
    const profiles = await this.list();
    const existing = profiles.find(p => p.name.toLowerCase() === input.name.toLowerCase());
    if (existing) {
      throw new Error(`Profile with name "${input.name}" already exists`);
    }

    const now = new Date().toISOString();
    const id = input.id ?? this.generateId();

    const newProfile: GitProfile = {
      id,
      name: input.name.trim(),
      git: {
        name: input.git.name.trim(),
        email: input.git.email.trim(),
        scope: input.git.scope ?? 'local',
      },
      github: input.github
        ? {
            host: input.github.host?.trim() || 'github.com',
            username: input.github.username.trim(),
          }
        : undefined,
      authentication: {
        type: input.authentication.type,
        source: input.authentication.source,
        sshKeyPath: input.authentication.sshKeyPath?.trim() || undefined,
        secretRef:
          input.authentication.type === 'pat'
            ? {
                provider: 'vscode-secret-storage',
                key: `gitaxis.profile.${id}.github-token`,
              }
            : undefined,
      },
      metadata: {
        source: input.source ?? 'manual',
        imported: input.imported ?? false,
        description: input.description,
      },
      createdAt: now,
      updatedAt: now,
    };

    profiles.push(newProfile);
    await this.memento.update(PersistentProfileStore.PROFILES_KEY, profiles);

    // If this is the only profile, set as active
    const active = await this.getActive();
    if (!active) {
      await this.setActive(id);
    }

    return newProfile;
  }

  public async update(id: ProfileId, input: UpdateProfileInput): Promise<GitProfile> {
    const profiles = await this.list();
    const index = profiles.findIndex(p => p.id === id);
    if (index === -1) {
      throw new Error(`Profile with ID "${id}" not found`);
    }

    const current = profiles[index];

    if (input.name && input.name.toLowerCase() !== current.name.toLowerCase()) {
      const duplicate = profiles.find(
        p => p.id !== id && p.name.toLowerCase() === input.name?.toLowerCase()
      );
      if (duplicate) {
        throw new Error(`Profile with name "${input.name}" already exists`);
      }
    }

    const updated: GitProfile = {
      ...current,
      name: input.name ? input.name.trim() : current.name,
      git: {
        ...current.git,
        ...(input.git?.name ? { name: input.git.name.trim() } : {}),
        ...(input.git?.email ? { email: input.git.email.trim() } : {}),
        ...(input.git?.scope ? { scope: input.git.scope } : {}),
      },
      github:
        input.github !== undefined
          ? input.github.username !== undefined && !input.github.username.trim()
            ? undefined
            : {
                host: input.github.host?.trim() || current.github?.host || 'github.com',
                username: input.github.username ? input.github.username.trim() : current.github?.username || '',
              }
          : current.github,
      authentication: {
        ...current.authentication,
        ...(input.authentication?.type ? { type: input.authentication.type } : {}),
        ...(input.authentication?.source ? { source: input.authentication.source } : {}),
        ...(input.authentication?.sshKeyPath !== undefined
          ? { sshKeyPath: input.authentication.sshKeyPath.trim() || undefined }
          : {}),
      },
      metadata: {
        ...current.metadata,
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
      updatedAt: new Date().toISOString(),
    };

    profiles[index] = updated;
    await this.memento.update(PersistentProfileStore.PROFILES_KEY, profiles);
    return updated;
  }

  public async delete(id: ProfileId): Promise<void> {
    let profiles = await this.list();
    const exists = profiles.some(p => p.id === id);
    if (!exists) {
      return;
    }

    profiles = profiles.filter(p => p.id !== id);
    await this.memento.update(PersistentProfileStore.PROFILES_KEY, profiles);

    // If active profile was deleted, switch to first remaining or clear
    const active = await this.getActive();
    if (active && active.id === id) {
      const nextActive = profiles[0]?.id;
      await this.memento.update(PersistentProfileStore.ACTIVE_PROFILE_KEY, nextActive);
    }

    // Clean up repo associations pointing to this profile
    const associations = await this.getAllAssociations();
    let modified = false;
    for (const repoPath of Object.keys(associations)) {
      if (associations[repoPath] === id) {
        delete associations[repoPath];
        modified = true;
      }
    }
    if (modified) {
      await this.memento.update(PersistentProfileStore.ASSOCIATIONS_KEY, associations);
    }
  }

  public async setActive(id: ProfileId): Promise<void> {
    const profile = await this.get(id);
    if (!profile) {
      throw new Error(`Cannot activate non-existent profile "${id}"`);
    }

    await this.memento.update(PersistentProfileStore.ACTIVE_PROFILE_KEY, id);

    // Update lastUsedAt
    const profiles = await this.list();
    const idx = profiles.findIndex(p => p.id === id);
    if (idx !== -1) {
      profiles[idx].metadata.lastUsedAt = new Date().toISOString();
      await this.memento.update(PersistentProfileStore.PROFILES_KEY, profiles);
    }
  }

  public async getActive(): Promise<GitProfile | undefined> {
    const activeId = this.memento.get<string | undefined>(PersistentProfileStore.ACTIVE_PROFILE_KEY);
    if (!activeId) {
      const profiles = await this.list();
      return profiles[0];
    }
    return this.get(activeId);
  }

  // Repository Associations
  public async getAssociation(repoPath: string): Promise<ProfileId | undefined> {
    const key = Platform.normalizePath(repoPath);
    const associations = await this.getAllAssociations();
    return associations[key];
  }

  public async setAssociation(repoPath: string, profileId: ProfileId): Promise<void> {
    const key = Platform.normalizePath(repoPath);
    const associations = await this.getAllAssociations();
    associations[key] = profileId;
    await this.memento.update(PersistentProfileStore.ASSOCIATIONS_KEY, associations);
  }

  public async removeAssociation(repoPath: string): Promise<void> {
    const key = Platform.normalizePath(repoPath);
    const associations = await this.getAllAssociations();
    delete associations[key];
    await this.memento.update(PersistentProfileStore.ASSOCIATIONS_KEY, associations);
  }

  public async getAllAssociations(): Promise<Record<string, ProfileId>> {
    const raw = this.memento.get<Record<string, ProfileId>>(PersistentProfileStore.ASSOCIATIONS_KEY, {});
    return typeof raw === 'object' && raw !== null ? { ...raw } : {};
  }
}
