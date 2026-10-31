import { ProfileId, RepositoryId } from './common';

export interface GitRemote {
  name: string;
  fetchUrl?: string;
  pushUrl?: string;
  host?: string;
  owner?: string;
  repository?: string;
}

export interface RepositoryStatus {
  clean: boolean;
  staged: number;
  modified: number;
  untracked: number;
  conflicted: number;
  ahead: number;
  behind: number;
}

export interface GitRepository {
  id: RepositoryId;
  path: string;
  name: string;
  currentBranch?: string;
  remotes: GitRemote[];
  associatedProfileId?: ProfileId;
  detectedProfileId?: ProfileId;
  status: RepositoryStatus;
}

export type ProfileMatchReason =
  | 'repository-association'
  | 'remote-owner'
  | 'github-username'
  | 'github-host'
  | 'git-email'
  | 'git-name'
  | 'github-cli-account'
  | 'credential-helper'
  | 'no-match';

export type ProfileMatchConfidence =
  | 'exact'
  | 'high'
  | 'medium'
  | 'low'
  | 'none';

export interface ProfileMatch {
  profileId: ProfileId;
  score: number;
  reasons: ProfileMatchReason[];
}

export interface ProfileMatchResult {
  repositoryId?: RepositoryId;
  recommendedProfileId?: ProfileId;
  matches: ProfileMatch[];
  confidence: ProfileMatchConfidence;
  reasons: ProfileMatchReason[];
}
