import { CredentialHelperInfo } from '../contracts';
import { GitClient } from '../git/gitClient';

export class CredentialHelperDiscovery {
  constructor(private gitClient: GitClient) {}

  public async detect(): Promise<CredentialHelperInfo> {
    const helpers = await this.gitClient.getGlobalCredentialHelpers();
    const hasGCM = helpers.some(h => GitClient.isGitCredentialManager(h));

    return {
      helpers,
      hasGCM,
    };
  }
}
