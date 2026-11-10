export type AuthenticationType =
  | 'github-cli'
  | 'credential-manager'
  | 'pat'
  | 'oauth'
  | 'ssh'
  | 'none';

export interface AuthenticationConfig {
  type: AuthenticationType;
  secretRef?: {
    provider: 'vscode-secret-storage';
    key: string;
  };
  source?: string;
  sshKeyPath?: string;
}

export interface AuthenticationConfigInput {
  type: AuthenticationType;
  source?: string;
  sshKeyPath?: string;
}

/**
 * Runtime-only authentication object.
 * NEVER serialize or persist this.
 */
export interface ResolvedAuthentication {
  type: AuthenticationType;
  username?: string;
  credential?: string;
  host?: string;
}
