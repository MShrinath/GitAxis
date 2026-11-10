import { execFile } from 'child_process';
import { promisify } from 'util';
import { GitClient } from '../git/gitClient';

const execFileAsync = promisify(execFile);

export class CredentialManagerAuth {
  constructor(private gitClient?: GitClient) {}

  public async isConfigured(): Promise<boolean> {
    if (this.gitClient) {
      const helpers = await this.gitClient.getGlobalCredentialHelpers();
      return helpers.some(h => GitClient.isGitCredentialManager(h));
    }
    try {
      const { stdout } = await execFileAsync('git', ['config', '--global', '--get-all', 'credential.helper'], { timeout: 3000, windowsHide: true });
      return GitClient.isGitCredentialManager(stdout);
    } catch {
      return false;
    }
  }
}
