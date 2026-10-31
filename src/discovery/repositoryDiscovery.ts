import * as path from 'path';
import { GitClient } from '../git/gitClient';
import { GitRepository, RepositoryStatus } from '../contracts';
import { Platform } from '../utils/platform';

export class RepositoryDiscovery {
  constructor(private gitClient: GitClient) {}

  public async detectRepository(folderPath: string): Promise<GitRepository | undefined> {
    const isRepo = await this.gitClient.isRepository(folderPath);
    if (!isRepo) {
      return undefined;
    }

    const rootPath = await this.gitClient.getRoot(folderPath);
    const normalizedPath = Platform.normalizePath(rootPath);
    const name = path.basename(normalizedPath);
    const currentBranch = await this.gitClient.getCurrentBranch(normalizedPath);
    const remotes = await this.gitClient.getRemotes(normalizedPath);
    const status: RepositoryStatus = await this.gitClient.status(normalizedPath);

    return {
      id: `repo_${Buffer.from(normalizedPath).toString('base64url').slice(0, 12)}`,
      path: normalizedPath,
      name,
      currentBranch,
      remotes,
      status,
    };
  }
}
