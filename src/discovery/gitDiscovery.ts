import { GitClient } from '../git/gitClient';
import { GitGlobalConfigInfo, GitInstallationInfo } from '../contracts';

export class GitDiscovery {
  constructor(private gitClient: GitClient) {}

  public async detectInstallation(): Promise<GitInstallationInfo> {
    const found = await this.gitClient.isGitAvailable();
    if (!found) {
      return { found: false };
    }
    const version = await this.gitClient.getVersion();
    return {
      found: true,
      version,
      path: 'git',
    };
  }

  public async detectGlobalConfig(): Promise<GitGlobalConfigInfo> {
    const userName = await this.gitClient.getGlobalConfig('user.name');
    const userEmail = await this.gitClient.getGlobalConfig('user.email');
    const defaultBranch = await this.gitClient.getGlobalConfig('init.defaultBranch');
    const credentialHelpers = await this.gitClient.getGlobalCredentialHelpers();

    return {
      userName,
      userEmail,
      defaultBranch,
      credentialHelpers,
    };
  }
}
