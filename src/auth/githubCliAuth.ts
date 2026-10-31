import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export class GitHubCliAuth {
  private tokenCache = new Map<string, { token: string; expiresAt: number }>();

  public clearTokenCache(): void {
    this.tokenCache.clear();
  }

  public async isAvailable(): Promise<boolean> {
    try {
      await execFileAsync('gh', ['--version'], { timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  public async getToken(hostname?: string, username?: string): Promise<string | undefined> {
    const cacheKey = `${hostname || 'github.com'}:${username || 'default'}`;
    const cached = this.tokenCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.token;
    }

    try {
      const args = ['auth', 'token'];
      if (hostname) {
        args.push('--hostname', hostname);
      }
      if (username) {
        args.push('--user', username);
      }
      const { stdout } = await execFileAsync('gh', args, { timeout: 5000 });
      const token = stdout.trim();
      if (token.length > 0) {
        this.tokenCache.set(cacheKey, { token, expiresAt: Date.now() + 15000 });
        return token;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  public async getStatus(): Promise<{ loggedIn: boolean; rawOutput: string }> {
    try {
      const { stdout, stderr } = await execFileAsync('gh', ['auth', 'status'], { timeout: 5000 });
      const output = `${stdout}\n${stderr}`;
      return {
        loggedIn: output.includes('Logged in to'),
        rawOutput: output,
      };
    } catch (err: unknown) {
      const output = String((err as { stderr?: string; stdout?: string }).stderr || (err as { stdout?: string }).stdout || '');
      return {
        loggedIn: output.includes('Logged in to'),
        rawOutput: output,
      };
    }
  }
}
