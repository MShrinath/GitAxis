import { ISODateTime, ProfileId } from './common';
import { AuthenticationConfig, AuthenticationConfigInput } from './authentication';

export type GitIdentityScope = 'local' | 'global';

export interface GitIdentity {
  name: string;
  email: string;
  scope: GitIdentityScope;
}

export interface GitIdentityInput {
  name: string;
  email: string;
  scope?: GitIdentityScope;
}

export interface GitHubIdentity {
  host: string;
  username: string;
  accountId?: string;
}

export interface GitHubIdentityInput {
  host?: string;
  username: string;
}

export type ProfileSource =
  | 'manual'
  | 'github-cli'
  | 'credential-manager'
  | 'imported'
  | 'system-discovery';

export interface ProfileMetadata {
  source: ProfileSource;
  imported?: boolean;
  lastUsedAt?: ISODateTime;
  description?: string;
}

export interface GitProfile {
  id: ProfileId;
  name: string;
  git: GitIdentity;
  github?: GitHubIdentity;
  authentication: AuthenticationConfig;
  metadata: ProfileMetadata;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface CreateProfileInput {
  id?: ProfileId;
  name: string;
  git: GitIdentityInput;
  github?: GitHubIdentityInput;
  authentication: AuthenticationConfigInput;
  description?: string;
  source?: ProfileSource;
  imported?: boolean;
}

export interface UpdateProfileInput {
  name?: string;
  git?: Partial<GitIdentityInput>;
  github?: Partial<GitHubIdentityInput>;
  authentication?: Partial<AuthenticationConfigInput>;
  description?: string;
}

export interface ProfileStore {
  create(profile: CreateProfileInput): Promise<GitProfile>;
  get(id: ProfileId): Promise<GitProfile | undefined>;
  getByName(name: string): Promise<GitProfile | undefined>;
  list(): Promise<GitProfile[]>;
  update(id: ProfileId, update: UpdateProfileInput): Promise<GitProfile>;
  delete(id: ProfileId): Promise<void>;
  setActive(id: ProfileId): Promise<void>;
  getActive(): Promise<GitProfile | undefined>;
}
