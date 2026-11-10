import { ISODateTime, ProfileId } from './common';
import { AuthenticationConfig, AuthenticationConfigInput } from './authentication';

export type GitIdentityScope = 'local' | 'global';

export interface GitIdentityInput {
  name: string;
  email: string;
  scope?: GitIdentityScope;
}

export interface GitHubIdentityInput {
  host?: string;
  username: string;
  orgs?: string[];
}

export interface GitProfile {
  id: ProfileId;
  name: string;
  git: {
    name: string;
    email: string;
    scope: GitIdentityScope;
  };
  github?: {
    host: string;
    username: string;
    orgs?: string[];
  };
  authentication: AuthenticationConfig;
  metadata: {
    source: string;
    imported?: boolean;
    lastUsedAt?: ISODateTime;
    description?: string;
  };
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  folderRules?: string[];
}

export interface CreateProfileInput {
  id?: ProfileId;
  name: string;
  git: GitIdentityInput;
  github?: GitHubIdentityInput;
  authentication: AuthenticationConfigInput;
  description?: string;
  source?: string;
  imported?: boolean;
  folderRules?: string[];
}

export interface UpdateProfileInput {
  name?: string;
  git?: Partial<GitIdentityInput>;
  github?: Partial<GitHubIdentityInput>;
  authentication?: Partial<AuthenticationConfigInput>;
  description?: string;
  folderRules?: string[];
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
