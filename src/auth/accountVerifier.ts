import { execFile } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as path from 'path';
import { GitProfile } from '../contracts';
import { SecretStore } from './secretStore';
import { GitClient } from '../git/gitClient';
import { GitHubCliAuth } from './githubCliAuth';
import { Platform } from '../utils/platform';
import { logger } from '../utils/logger';

const execFileAsync = promisify(execFile);

export interface VerificationResult {
  success: boolean;
  login?: string;
  message: string;
  scopes?: string[];
  expiration?: string;
}

export class AccountVerifier {
  constructor(
    private secretStore: SecretStore,
    private gitClient: GitClient,
    private ghCliAuth: GitHubCliAuth = new GitHubCliAuth()
  ) {}

  public async verifyProfile(profile: GitProfile, repoPath?: string): Promise<VerificationResult> {
    const authType = profile.authentication.type;
    const host = profile.github?.host || 'github.com';
    const expectedUsername = profile.github?.username;

    switch (authType) {
      case 'pat':
        return this.verifyPat(profile, host, expectedUsername);
      case 'github-cli':
        return this.verifyGitHubCli(profile, host, expectedUsername);
      case 'ssh':
        return this.verifySsh(profile, host, expectedUsername);
      case 'credential-manager':
      case 'none':
      default:
        return this.verifyHttpsOrGit(profile, host, expectedUsername, repoPath);
    }
  }

  private async verifyPat(
    profile: GitProfile,
    host: string,
    expectedUsername?: string
  ): Promise<VerificationResult> {
    const token = await this.secretStore.getSecret(profile.id, 'github-token');
    if (!token) {
      return {
        success: false,
        message: 'No Personal Access Token saved in SecretStorage for this profile.',
      };
    }

    const apiUrl = host === 'github.com' ? 'https://api.github.com/user' : `https://${host}/api/v3/user`;

    try {
      const res = await fetch(apiUrl, {
        headers: {
          Authorization: `token ${token}`,
          'User-Agent': 'GitAxis-VSCode-Extension',
          Accept: 'application/vnd.github.v3+json',
        },
      });

      const scopesHeader = res.headers.get('x-oauth-scopes');
      const scopes = scopesHeader ? scopesHeader.split(',').map(s => s.trim()).filter(Boolean) : undefined;
      const expiration = res.headers.get('github-authentication-token-expiration') || undefined;

      if (!res.ok) {
        if (res.status === 401) {
          return { success: false, message: 'Invalid or expired Personal Access Token (401 Unauthorized).' };
        }
        if (res.status === 403) {
          return { success: false, message: 'Access forbidden or API rate limited (403 Forbidden).' };
        }
        return { success: false, message: `GitHub API error (${res.status}): ${res.statusText}` };
      }

      const user = (await res.json()) as { login: string };
      const login = user.login;

      if (expectedUsername && login.toLowerCase() !== expectedUsername.toLowerCase()) {
        return {
          success: false,
          login,
          message: `Token authenticates as @${login}, but profile expects @${expectedUsername}.`,
          scopes,
          expiration,
        };
      }

      return {
        success: true,
        login,
        message: `Authenticated as @${login}`,
        scopes,
        expiration,
      };
    } catch (err) {
      return {
        success: false,
        message: `Network error verifying PAT: ${String(err)}`,
      };
    }
  }

  private async verifyGitHubCli(
    profile: GitProfile,
    host: string,
    expectedUsername?: string
  ): Promise<VerificationResult> {
    const token = await this.ghCliAuth.getToken(host, expectedUsername);
    if (!token) {
      return {
        success: false,
        message: expectedUsername
          ? `User "${expectedUsername}" is not logged in to GitHub CLI.`
          : 'GitHub CLI is not logged in or token is unavailable.',
      };
    }

    const apiUrl = host === 'github.com' ? 'https://api.github.com/user' : `https://${host}/api/v3/user`;
    try {
      const res = await fetch(apiUrl, {
        headers: {
          Authorization: `token ${token}`,
          'User-Agent': 'GitAxis-VSCode-Extension',
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (!res.ok) {
        return { success: false, message: `GitHub CLI token returned error (${res.status}).` };
      }

      const user = (await res.json()) as { login: string };
      const login = user.login;

      if (expectedUsername && login.toLowerCase() !== expectedUsername.toLowerCase()) {
        return {
          success: false,
          login,
          message: `gh CLI authenticated as @${login}, but profile expects @${expectedUsername}.`,
        };
      }

      return {
        success: true,
        login,
        message: `Authenticated as @${login} via GitHub CLI`,
      };
    } catch (err) {
      return {
        success: false,
        message: `Failed to verify gh CLI token: ${String(err)}`,
      };
    }
  }

  private async verifySsh(
    profile: GitProfile,
    host: string,
    expectedUsername?: string
  ): Promise<VerificationResult> {
    const rawSshKeyPath = profile.authentication.sshKeyPath?.trim();
    if (!rawSshKeyPath) {
      return {
        success: false,
        message: 'No SSH key path configured for this profile.',
      };
    }

    let resolvedKeyPath = rawSshKeyPath;
    if (resolvedKeyPath.startsWith('~')) {
      resolvedKeyPath = path.join(os.homedir(), resolvedKeyPath.slice(1));
    }
    const normalizedKeyPath = Platform.normalizePath(resolvedKeyPath);

    const sshTarget = `git@${host}`;
    const args = [
      '-i',
      normalizedKeyPath,
      '-o',
      'IdentitiesOnly=yes',
      '-o',
      'StrictHostKeyChecking=accept-new',
      '-T',
      sshTarget,
    ];

    try {
      const { stdout, stderr } = await execFileAsync('ssh', args, { timeout: 10000 });
      const output = `${stdout}\n${stderr}`;
      return this.parseSshOutput(output, expectedUsername);
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; code?: number; message?: string };
      const output = `${e.stdout || ''}\n${e.stderr || ''}`;
      if (output.includes('Hi ') || output.includes('Permission denied')) {
        return this.parseSshOutput(output, expectedUsername);
      }
      return {
        success: false,
        message: `SSH test failed: ${e.stderr || e.message || String(err)}`,
      };
    }
  }

  private parseSshOutput(output: string, expectedUsername?: string): VerificationResult {
    const match = output.match(/Hi\s+([a-zA-Z0-9_\-]+)!/i);
    if (match) {
      const login = match[1];
      if (expectedUsername && login.toLowerCase() !== expectedUsername.toLowerCase()) {
        return {
          success: false,
          login,
          message: `SSH key authenticated as @${login}, expected @${expectedUsername}.`,
        };
      }
      return {
        success: true,
        login,
        message: `Authenticated as @${login} via SSH`,
      };
    }

    if (output.includes('Permission denied (publickey)')) {
      return {
        success: false,
        message: 'Permission denied (publickey). Key is not recognized by GitHub.',
      };
    }

    return {
      success: false,
      message: `SSH response: ${output.trim().split('\n')[0] || 'Unknown response'}`,
    };
  }

  private async verifyHttpsOrGit(
    profile: GitProfile,
    _host: string,
    expectedUsername?: string,
    repoPath?: string
  ): Promise<VerificationResult> {
    if (repoPath) {
      try {
        const remotes = await this.gitClient.getRemotes(repoPath);
        const origin = remotes.find(r => r.name === 'origin') || remotes[0];
        if (origin && origin.fetchUrl) {
          await this.gitClient.exec(['ls-remote', '--heads', origin.name], {
            cwd: repoPath,
            timeout: 10000,
          });
          return {
            success: true,
            login: expectedUsername,
            message: `Git remote authenticated successfully for ${origin.name} (${origin.fetchUrl})`,
          };
        }
      } catch (err) {
        return {
          success: false,
          login: expectedUsername,
          message: `Git remote authentication failed: ${String(err)}`,
        };
      }
    }

    return {
      success: true,
      login: expectedUsername,
      message: expectedUsername
        ? `Configured as @${expectedUsername} (GCM / Local Git identity)`
        : 'Local Git identity configured',
    };
  }
}
