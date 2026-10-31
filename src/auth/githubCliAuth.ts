import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export class GitHubCliAuth {
  public async isAvailable(): Promise<boolean> {
    try {
      await execFileAsync('gh', ['--version'], { timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  public async getToken(hostname?: string): Promise<string | undefined> {
    try {
      const args = ['auth', 'token'];
      if (hostname) {
        args.push('--hostname', hostname);
      }
      const { stdout } = await execFileAsync('gh', args, { timeout: 5000 });
      const token = stdout.trim();
      return token.length > 0 ? token : undefined;
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
