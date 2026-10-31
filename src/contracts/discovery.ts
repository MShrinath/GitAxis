import { ISODateTime } from './common';

export interface GitInstallationInfo {
  found: boolean;
  version?: string;
  path?: string;
}

export interface GitGlobalConfigInfo {
  userName?: string;
  userEmail?: string;
  credentialHelpers: string[];
  defaultBranch?: string;
}

export interface GitHubCliAccountInfo {
  username: string;
  host: string;
  active: boolean;
  authStatusOk: boolean;
}

export interface GitHubCliDiscoveryInfo {
  found: boolean;
  version?: string;
  accounts: GitHubCliAccountInfo[];
}

export interface CredentialHelperInfo {
  helpers: string[];
  hasGCM: boolean;
}

export interface SystemDiscoveryResult {
  git: GitInstallationInfo;
  gitConfig: GitGlobalConfigInfo;
  githubCli: GitHubCliDiscoveryInfo;
  credentialHelper: CredentialHelperInfo;
  timestamp: ISODateTime;
}
