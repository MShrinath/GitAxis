import { CredentialHelperInfo } from '../contracts';
import { GitClient } from '../git/gitClient';

export class CredentialHelperDiscovery {
  constructor(private gitClient: GitClient) {}

  public async detect(): Promise<CredentialHelperInfo> {
    const helpers: string[] = [];
    try {
      const { stdout } = await this.gitClient.exec(['config', '--global', '--get-all', 'credential.helper']);
      for (const line of stdout.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !helpers.includes(trimmed)) {
          helpers.push(trimmed);
        }
      }
    } catch {}

    const hasGCM = helpers.some(h => {
      const lower = h.toLowerCase();
      return lower.includes('manager') || lower.includes('gcm');
    });

    return {
      helpers,
      hasGCM,
    };
  }
}
