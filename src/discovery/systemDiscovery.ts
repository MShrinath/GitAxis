import { GitDiscovery } from './gitDiscovery';
import { GitHubCliDiscovery } from './githubCliDiscovery';
import { CredentialHelperDiscovery } from './credentialHelperDiscovery';
import { GitClient } from '../git/gitClient';
import { CreateProfileInput, SystemDiscoveryResult } from '../contracts';
import { logger } from '../utils/logger';

export class SystemDiscovery {
  private gitDiscovery: GitDiscovery;
  private ghCliDiscovery: GitHubCliDiscovery;
  private credHelperDiscovery: CredentialHelperDiscovery;

  constructor(gitClient: GitClient) {
    this.gitDiscovery = new GitDiscovery(gitClient);
    this.ghCliDiscovery = new GitHubCliDiscovery();
    this.credHelperDiscovery = new CredentialHelperDiscovery(gitClient);
  }

  public async scan(): Promise<SystemDiscoveryResult> {
    logger.info('Starting non-invasive system configuration scan...');

    const [git, gitConfig, githubCli, credentialHelper] = await Promise.all([
      this.gitDiscovery.detectInstallation(),
      this.gitDiscovery.detectGlobalConfig(),
      this.ghCliDiscovery.detect(),
      this.credHelperDiscovery.detect(),
    ]);

    const result: SystemDiscoveryResult = {
      git,
      gitConfig,
      githubCli,
      credentialHelper,
      timestamp: new Date().toISOString(),
    };

    logger.info('System configuration scan completed safely.');
    return result;
  }

  public suggestProfiles(scanResult: SystemDiscoveryResult): CreateProfileInput[] {
    const suggestions: CreateProfileInput[] = [];

    // 1. If GitHub CLI has accounts
    if (scanResult.githubCli.found && scanResult.githubCli.accounts.length > 0) {
      for (const account of scanResult.githubCli.accounts) {
        suggestions.push({
          name: account.username,
          git: {
            name: scanResult.gitConfig.userName || account.username,
            email: scanResult.gitConfig.userEmail || `${account.username}@users.noreply.github.com`,
            scope: 'local',
          },
          github: {
            host: account.host,
            username: account.username,
          },
          authentication: {
            type: 'github-cli',
            source: 'github-cli',
          },
          source: 'github-cli',
          imported: true,
          description: `Discovered from GitHub CLI (${account.host})`,
        });
      }
    }

    // 2. If Git has global user config and no profile matched yet
    if (scanResult.gitConfig.userName && scanResult.gitConfig.userEmail) {
      const alreadyHasEmail = suggestions.some(s => s.git.email.toLowerCase() === scanResult.gitConfig.userEmail?.toLowerCase());
      if (!alreadyHasEmail) {
        suggestions.push({
          name: 'default',
          git: {
            name: scanResult.gitConfig.userName,
            email: scanResult.gitConfig.userEmail,
            scope: 'local',
          },
          authentication: {
            type: scanResult.credentialHelper.hasGCM ? 'credential-manager' : 'none',
            source: scanResult.credentialHelper.hasGCM ? 'git-credential-manager' : 'system',
          },
          source: 'system-discovery',
          imported: true,
          description: 'Discovered from global Git configuration',
        });
      }
    }

    return suggestions;
  }
}
