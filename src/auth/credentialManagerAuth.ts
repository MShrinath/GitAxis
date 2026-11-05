import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export class CredentialManagerAuth {
  public async isConfigured(): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync('git', ['config', '--global', '--get-all', 'credential.helper'], { timeout: 3000, windowsHide: true });
      const lower = stdout.toLowerCase();
      return lower.includes('manager') || lower.includes('gcm');
    } catch {
      return false;
    }
  }
}
