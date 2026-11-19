import * as crypto from 'crypto';
import {
  CreateProfileInput,
  GitProfile,
  ProfileId,
  ProfileStore,
  UpdateProfileInput,
} from '../contracts';
import { Platform } from '../utils/platform';
import { Validation } from '../utils/validation';

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
  private cachedProfiles?: GitProfile[];
  private idMap = new Map<ProfileId, GitProfile>();
  private nameMap = new Map<string, GitProfile>();
  private associationsCache?: Record<string, ProfileId>;

  constructor(memento?: IMemento) {
    this.memento = memento ?? new InMemoryMemento();
  }

  public setMemento(memento: IMemento): void {
    this.memento = memento;
    this.cachedProfiles = undefined;
    this.idMap.clear();
    this.nameMap.clear();
    this.associationsCache = undefined;
  }

  private ensureCache(): GitProfile[] {
    if (this.cachedProfiles) {
      return this.cachedProfiles;
    }
    const raw = this.memento.get<GitProfile[]>(PersistentProfileStore.PROFILES_KEY, []);
    const profiles = Array.isArray(raw) ? raw : [];
    this.cachedProfiles = profiles;
    this.idMap.clear();
    this.nameMap.clear();
    for (const p of profiles) {
      this.idMap.set(p.id, p);
      this.nameMap.set(p.name.toLowerCase(), p);
    }
    return this.cachedProfiles;
  }

  private generateId(): string {
    return `profile_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
  }

  public async list(): Promise<GitProfile[]> {
    const profiles = this.ensureCache();
    return [...profiles];
  }

  public async get(id: ProfileId): Promise<GitProfile | undefined> {
    this.ensureCache();
    return this.idMap.get(id);
  }

  public async getByName(name: string): Promise<GitProfile | undefined> {
    this.ensureCache();
    return this.nameMap.get(name.toLowerCase());
  }

  public async create(input: CreateProfileInput): Promise<GitProfile> {
    if (!Validation.isValidProfileName(input.name)) {
      throw new Error(`Invalid profile name: "${input.name}"`);
    }
    if (!input.git || !input.git.name || input.git.name.length > 128) {
      throw new Error(`Invalid git author name: "${input.git?.name}"`);
    }
    if (!Validation.isValidEmail(input.git.email)) {
      throw new Error(`Invalid git author email: "${input.git?.email}"`);
    }
    if (input.folderRules) {
      for (const rule of input.folderRules) {
        if (!Validation.isValidFolderRule(rule)) {
          throw new Error(`Invalid folder rule pattern: "${rule}"`);
        }
      }
    }

    this.ensureCache();
    if (this.nameMap.has(input.name.toLowerCase())) {
      throw new Error(`Profile with name "${input.name}" already exists`);
    }

    const now = new Date().toISOString();
    const id = input.id ?? this.generateId();

    const rawSshKey = input.authentication.sshKeyPath?.trim();
    if (rawSshKey && !Validation.isValidSshKeyPath(rawSshKey)) {
      throw new Error(`Invalid SSH key path: "${input.authentication.sshKeyPath}"`);
    }

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
            orgs: input.github.orgs ? input.github.orgs.map(o => o.trim()).filter(Boolean) : undefined,
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
      folderRules: input.folderRules
        ? input.folderRules.map(r => r.trim()).filter(Boolean)
        : undefined,
      createdAt: now,
      updatedAt: now,
    };

    this.cachedProfiles!.push(newProfile);
    this.idMap.set(id, newProfile);
    this.nameMap.set(newProfile.name.toLowerCase(), newProfile);
    await this.memento.update(PersistentProfileStore.PROFILES_KEY, this.cachedProfiles);

    // If this is the only profile, set as active
    const active = await this.getActive();
    if (!active) {
      await this.setActive(id);
    }

    return newProfile;
  }

  public async update(id: ProfileId, input: UpdateProfileInput): Promise<GitProfile> {
    this.ensureCache();
    const current = this.idMap.get(id);
    if (!current) {
      throw new Error(`Profile with ID "${id}" not found`);
    }

    if (input.name && !Validation.isValidProfileName(input.name)) {
      throw new Error(`Invalid profile name: "${input.name}"`);
    }
    if (input.git?.name !== undefined && (input.git.name.length > 128 || input.git.name.trim().length === 0)) {
      throw new Error(`Invalid git author name: "${input.git.name}"`);
    }
    if (input.git?.email !== undefined && !Validation.isValidEmail(input.git.email)) {
      throw new Error(`Invalid git author email: "${input.git.email}"`);
    }
    if (input.folderRules) {
      for (const rule of input.folderRules) {
        if (!Validation.isValidFolderRule(rule)) {
          throw new Error(`Invalid folder rule pattern: "${rule}"`);
        }
      }
    }

    if (input.name && input.name.toLowerCase() !== current.name.toLowerCase()) {
      const duplicate = this.nameMap.get(input.name.toLowerCase());
      if (duplicate && duplicate.id !== id) {
        throw new Error(`Profile with name "${input.name}" already exists`);
      }
    }

    if (input.authentication?.sshKeyPath !== undefined) {
      const rawSshKey = input.authentication.sshKeyPath.trim();
      if (rawSshKey && !Validation.isValidSshKeyPath(rawSshKey)) {
        throw new Error(`Invalid SSH key path: "${input.authentication.sshKeyPath}"`);
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
          ? (() => {
              const effectiveUsername =
                input.github.username !== undefined
                  ? input.github.username.trim()
                  : (current.github?.username || '');
              const effectiveOrgs =
                input.github.orgs !== undefined
                  ? input.github.orgs.map(o => o.trim()).filter(Boolean)
                  : current.github?.orgs;
              if (effectiveUsername || (effectiveOrgs && effectiveOrgs.length > 0)) {
                return {
                  host: input.github.host?.trim() || current.github?.host || 'github.com',
                  username: effectiveUsername,
                  orgs: effectiveOrgs,
                };
              }
              return undefined;
            })()
          : current.github,
      authentication: {
        ...current.authentication,
        ...(input.authentication?.type ? { type: input.authentication.type } : {}),
        ...(input.authentication?.source ? { source: input.authentication.source } : {}),
        sshKeyPath:
          (input.authentication?.type ?? current.authentication.type) === 'ssh'
            ? (input.authentication?.sshKeyPath !== undefined
                ? input.authentication.sshKeyPath.trim() || undefined
                : current.authentication.sshKeyPath)
            : undefined,
        secretRef:
          (input.authentication?.type ?? current.authentication.type) === 'pat'
            ? current.authentication.secretRef || {
                provider: 'vscode-secret-storage',
                key: `gitaxis.profile.${id}.github-token`,
              }
            : undefined,
      },
      folderRules:
        input.folderRules !== undefined
          ? input.folderRules.map(r => r.trim()).filter(Boolean)
          : current.folderRules,
      metadata: {
        ...current.metadata,
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
      updatedAt: new Date().toISOString(),
    };

    const index = this.cachedProfiles!.findIndex(p => p.id === id);
    if (index !== -1) {
      this.cachedProfiles![index] = updated;
    }
    this.idMap.set(id, updated);
    if (current.name.toLowerCase() !== updated.name.toLowerCase()) {
      this.nameMap.delete(current.name.toLowerCase());
    }
    this.nameMap.set(updated.name.toLowerCase(), updated);

    await this.memento.update(PersistentProfileStore.PROFILES_KEY, this.cachedProfiles);
    return updated;
  }

  public async delete(id: ProfileId): Promise<void> {
    this.ensureCache();
    const current = this.idMap.get(id);
    if (!current) {
      return;
    }

    this.idMap.delete(id);
    this.nameMap.delete(current.name.toLowerCase());
    this.cachedProfiles = this.cachedProfiles!.filter(p => p.id !== id);
    await this.memento.update(PersistentProfileStore.PROFILES_KEY, this.cachedProfiles);

    // If active profile was deleted, switch to first remaining or clear
    const active = await this.getActive();
    if (active && active.id === id) {
      const nextActive = this.cachedProfiles[0]?.id;
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
      this.associationsCache = associations;
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
    profile.metadata.lastUsedAt = new Date().toISOString();
    await this.memento.update(PersistentProfileStore.PROFILES_KEY, this.cachedProfiles);
  }

  public async getActive(): Promise<GitProfile | undefined> {
    const activeId = this.memento.get<string | undefined>(PersistentProfileStore.ACTIVE_PROFILE_KEY);
    if (!activeId) {
      this.ensureCache();
      return this.cachedProfiles![0];
    }
    return this.get(activeId);
  }

  private normalizeRepoKey(repoPath: string): string {
    let key = Platform.normalizePath(repoPath);
    if (key.length > 1 && !/^[a-zA-Z]:\/$/i.test(key)) {
      key = key.replace(/\/+$/, '');
    }
    return Platform.isWindows() || Platform.isMacOS() || /^[a-zA-Z]:\//i.test(key)
      ? key.toLowerCase()
      : key;
  }

  // Repository Associations
  public async getAssociation(repoPath: string): Promise<ProfileId | undefined> {
    const key = this.normalizeRepoKey(repoPath);
    const associations = await this.getAllAssociations();
    if (associations[key]) {
      return associations[key];
    }
    if (Platform.isWindows() || Platform.isMacOS() || /^[a-zA-Z]:\//i.test(key)) {
      const match = Object.entries(associations).find(([k]) => this.normalizeRepoKey(k) === key);
      return match ? match[1] : undefined;
    }
    return undefined;
  }

  public async setAssociation(repoPath: string, profileId: ProfileId): Promise<void> {
    const key = this.normalizeRepoKey(repoPath);
    const associations = await this.getAllAssociations();
    if (Platform.isWindows() || Platform.isMacOS() || /^[a-zA-Z]:\//i.test(key)) {
      for (const k of Object.keys(associations)) {
        if (this.normalizeRepoKey(k) === key && k !== key) {
          delete associations[k];
        }
      }
    }
    associations[key] = profileId;
    this.associationsCache = associations;
    await this.memento.update(PersistentProfileStore.ASSOCIATIONS_KEY, associations);
  }

  public async removeAssociation(repoPath: string): Promise<void> {
    const key = this.normalizeRepoKey(repoPath);
    const associations = await this.getAllAssociations();
    delete associations[key];
    if (Platform.isWindows() || Platform.isMacOS() || /^[a-zA-Z]:\//i.test(key)) {
      for (const k of Object.keys(associations)) {
        if (this.normalizeRepoKey(k) === key) {
          delete associations[k];
        }
      }
    }
    this.associationsCache = associations;
    await this.memento.update(PersistentProfileStore.ASSOCIATIONS_KEY, associations);
  }

  public async getAllAssociations(): Promise<Record<string, ProfileId>> {
    if (!this.associationsCache) {
      const raw = this.memento.get<Record<string, ProfileId>>(PersistentProfileStore.ASSOCIATIONS_KEY, {});
      this.associationsCache = typeof raw === 'object' && raw !== null ? { ...raw } : {};
    }
    return { ...this.associationsCache };
  }
}
