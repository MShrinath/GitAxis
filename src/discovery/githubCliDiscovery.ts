import { execFile } from 'child_process';
import { promisify } from 'util';
import { GitHubCliAccountInfo, GitHubCliDiscoveryInfo } from '../contracts';

const execFileAsync = promisify(execFile);

export class GitHubCliDiscovery {
  public async detect(): Promise<GitHubCliDiscoveryInfo> {
    try {
      const { stdout: versionOut } = await execFileAsync('gh', ['--version'], { timeout: 3000, windowsHide: true });
      const version = versionOut.split('\n')[0]?.trim();

      const accounts = await this.detectAccounts();

      return {
        found: true,
        version,
        accounts,
      };
    } catch {
      return {
        found: false,
        accounts: [],
      };
    }
  }

  public async detectAccounts(): Promise<GitHubCliAccountInfo[]> {
    const accounts: GitHubCliAccountInfo[] = [];

    try {
      const { stdout, stderr } = await execFileAsync('gh', ['auth', 'status'], { timeout: 5000, windowsHide: true });
      const output = `${stdout}\n${stderr}`;
      const lines = output.split('\n');

      let currentHost = 'github.com';

      for (const rawLine of lines) {
        const line = rawLine.trim();

        const hostMatch = /Logged in to ([a-zA-Z0-9\.\-]+)/i.exec(line);
        if (hostMatch) {
          currentHost = hostMatch[1];
        }

        const accountMatch = /account ([a-zA-Z0-9\-_]+)/i.exec(line);
        if (accountMatch) {
          const username = accountMatch[1];
          const isActive = line.includes('Active account: true') || line.includes('\u2713');
          accounts.push({
            host: currentHost,
            username,
            active: isActive,
            authStatusOk: true,
          });
        }
      }
    } catch (err: unknown) {
      // gh auth status exits with code 1 if not logged in or partial
      const output = String((err as { stderr?: string; stdout?: string }).stderr || (err as { stdout?: string }).stdout || '');
      const accountMatch = /account ([a-zA-Z0-9\-_]+)/i.exec(output);
      if (accountMatch) {
        accounts.push({
          host: 'github.com',
          username: accountMatch[1],
          active: true,
          authStatusOk: true,
        });
      }
    }

    return accounts;
  }
}
