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

export type VerificationStatusState = 'verified' | 'failed' | 'not-verified';

export interface VerificationResult {
  success: boolean;
  status?: VerificationStatusState;
  login?: string;
  message: string;
  scopes?: string[];
  expiration?: string;
}

export class AccountVerifier {
  private cache = new Map<string, { result: VerificationResult; expiresAt: number }>();
  private readonly TTL_MS = 10 * 60 * 1000; // 10 minutes

  constructor(
    private secretStore: SecretStore,
    private gitClient: GitClient,
    private ghCliAuth: GitHubCliAuth = new GitHubCliAuth()
  ) {}

  public clearCache(profileId?: string): void {
    if (profileId) {
      this.cache.delete(profileId);
    } else {
      this.cache.clear();
    }
  }

  public async verifyProfile(
    profile: GitProfile,
    repoPath?: string,
    options: { force?: boolean; onDemand?: boolean } = {}
  ): Promise<VerificationResult> {
    if (!options.force) {
      const cached = this.cache.get(profile.id);
      if (cached && Date.now() < cached.expiresAt) {
        return cached.result;
      }
    }

    const authType = profile.authentication.type;
    const host = profile.github?.host || 'github.com';
    const expectedUsername = profile.github?.username;
    let result: VerificationResult;

    switch (authType) {
      case 'pat':
        result = await this.verifyPat(profile, host, expectedUsername);
        break;
      case 'github-cli':
        result = await this.verifyGitHubCli(profile, host, expectedUsername);
        break;
      case 'ssh':
        result = await this.verifySsh(profile, host, expectedUsername);
        break;
      case 'credential-manager':
      case 'none':
      default:
        result = await this.verifyHttpsOrGit(profile, host, expectedUsername, repoPath, options.onDemand);
        break;
    }

    this.cache.set(profile.id, { result, expiresAt: Date.now() + this.TTL_MS });
    return result;
  }

  private getApiUrl(host: string): string {
    return host === 'github.com' ? 'https://api.github.com/user' : `https://${host}/api/v3/user`;
  }

  private fetchGitHubUser(host: string, token: string): Promise<Response> {
    return fetch(this.getApiUrl(host), {
      headers: {
        Authorization: `token ${token}`,
        'User-Agent': 'GitAxis-VSCode-Extension',
        Accept: 'application/vnd.github.v3+json',
      },
    });
  }

  private isUsernameMismatch(login: string, expectedUsername?: string): boolean {
    return Boolean(expectedUsername && login.toLowerCase() !== expectedUsername.toLowerCase());
  }

  private evaluateUserLogin(
    login: string,
    expectedUsername: string | undefined,
    sourceDesc: 'Token' | 'gh CLI',
    extra?: { scopes?: string[]; expiration?: string }
  ): VerificationResult {
    if (this.isUsernameMismatch(login, expectedUsername)) {
      return {
        success: false,
        status: 'failed',
        login,
        message: `${sourceDesc} authenticates as @${login}, but profile expects @${expectedUsername}.`.replace('gh CLI authenticates', 'gh CLI authenticated'),
        ...extra,
      };
    }
    return {
      success: true,
      status: 'verified',
      login,
      message: sourceDesc === 'gh CLI' ? `Authenticated as @${login} via GitHub CLI` : `Authenticated as @${login}`,
      ...extra,
    };
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
        status: 'failed',
        message: 'No Personal Access Token saved in SecretStorage for this profile.',
      };
    }

    try {
      const res = await this.fetchGitHubUser(host, token);

      const scopesHeader = res.headers.get('x-oauth-scopes');
      const scopes = scopesHeader ? scopesHeader.split(',').map(s => s.trim()).filter(Boolean) : undefined;
      const expiration = res.headers.get('github-authentication-token-expiration') || undefined;

      if (!res.ok) {
        if (res.status === 401) {
          return { success: false, status: 'failed', message: 'Invalid or expired Personal Access Token (401 Unauthorized).' };
        }
        if (res.status === 403) {
          return { success: false, status: 'failed', message: 'Access forbidden or API rate limited (403 Forbidden).' };
        }
        return { success: false, status: 'failed', message: `GitHub API error (${res.status}): ${res.statusText}` };
      }

      const user = (await res.json()) as { login: string };
      return this.evaluateUserLogin(user.login, expectedUsername, 'Token', { scopes, expiration });
    } catch (err) {
      return {
        success: false,
        status: 'failed',
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
        status: 'failed',
        message: expectedUsername
          ? `User "${expectedUsername}" is not logged in to GitHub CLI.`
          : 'GitHub CLI is not logged in or token is unavailable.',
      };
    }

    try {
      const res = await this.fetchGitHubUser(host, token);

      if (!res.ok) {
        return { success: false, status: 'failed', message: `GitHub CLI token returned error (${res.status}).` };
      }

      const user = (await res.json()) as { login: string };
      return this.evaluateUserLogin(user.login, expectedUsername, 'gh CLI');
    } catch (err) {
      return {
        success: false,
        status: 'failed',
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
        status: 'failed',
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
      'BatchMode=yes',
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
        status: 'failed',
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
          status: 'failed',
          login,
          message: `SSH key authenticated as @${login}, expected @${expectedUsername}.`,
        };
      }
      return {
        success: true,
        status: 'verified',
        login,
        message: `Authenticated as @${login} via SSH`,
      };
    }

    if (output.includes('Permission denied (publickey)')) {
      return {
        success: false,
        status: 'failed',
        message: 'Permission denied (publickey). Key is not recognized by GitHub.',
      };
    }

    return {
      success: false,
      status: 'failed',
      message: `SSH response: ${output.trim().split('\n')[0] || 'Unknown response'}`,
    };
  }

  private async verifyHttpsOrGit(
    profile: GitProfile,
    host: string,
    expectedUsername?: string,
    repoPath?: string,
    onDemand: boolean = false
  ): Promise<VerificationResult> {
    if (!onDemand) {
      return {
        success: true,
        status: 'not-verified',
        login: expectedUsername,
        message: 'Configured, not verified',
      };
    }

    if (expectedUsername) {
      try {
        const { stdout } = await this.gitClient.execWithStdin(
          ['credential', 'fill'],
          `protocol=https\nhost=${host}\nusername=${expectedUsername}\n\n`,
          { cwd: repoPath, timeout: 5000 }
        );
        const passMatch = stdout.match(/^password=(.+)$/m);
        const token = passMatch ? passMatch[1].trim() : undefined;
        if (token) {
          const apiUrl = host === 'github.com' ? 'https://api.github.com/user' : `https://${host}/api/v3/user`;
          const res = await fetch(apiUrl, {
            headers: {
              Authorization: `token ${token}`,
              'User-Agent': 'GitAxis-VSCode-Extension',
              Accept: 'application/vnd.github.v3+json',
            },
          });
          if (res.ok) {
            const user = (await res.json()) as { login: string };
            if (user.login.toLowerCase() === expectedUsername.toLowerCase()) {
              return {
                success: true,
                status: 'verified',
                login: user.login,
                message: `Verified @${user.login} via credential helper`,
              };
            }
          }
        }
      } catch {}
    }

    return {
      success: true,
      status: 'not-verified',
      login: expectedUsername,
      message: 'Configured, not verified',
    };
  }
}
