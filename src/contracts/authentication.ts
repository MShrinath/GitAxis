import { ProfileId } from './common';

export type AuthenticationType =
  | 'github-cli'
  | 'credential-manager'
  | 'pat'
  | 'oauth'
  | 'ssh'
  | 'none';

export type AuthenticationSource =
  | 'github-cli'
  | 'git-credential-manager'
  | 'vs-code-secret-storage'
  | 'user-input'
  | 'system'
  | 'unknown';

export interface SecretReference {
  provider: 'vscode-secret-storage';
  key: string;
}

export interface AuthenticationConfig {
  type: AuthenticationType;
  secretRef?: SecretReference;
  source?: AuthenticationSource;
  sshKeyPath?: string;
}

export interface AuthenticationConfigInput {
  type: AuthenticationType;
  source?: AuthenticationSource;
  sshKeyPath?: string;
}

export type SecretType =
  | 'github-token'
  | 'oauth-access-token'
  | 'oauth-refresh-token'
  | 'ssh-passphrase';

export interface SaveProfileSecretInput {
  profileId: ProfileId;
  secretType: SecretType;
  value: string;
}

/**
 * Runtime-only authentication object.
 * NEVER serialize or persist this.
 */
export interface ResolvedAuthentication {
  type: AuthenticationType;
  username?: string;
  credential?: string;
}
