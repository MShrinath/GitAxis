import * as path from 'path';
import { GitClient } from '../git/gitClient';
import { GitRepository, RepositoryStatus } from '../contracts';
import { Platform } from '../utils/platform';

export interface CachedRepoEntry {
  repo?: GitRepository;
  timestamp: number;
}

export class RepositoryDiscovery {
  private cache = new Map<string, CachedRepoEntry>();
  private cacheTtlMs: number;

  constructor(private gitClient: GitClient, cacheTtlMs: number = 3000) {
    this.cacheTtlMs = cacheTtlMs;
  }

  public clearCache(): void {
    this.cache.clear();
  }

  public async detectRepository(folderPath: string, forceRefresh: boolean = false): Promise<GitRepository | undefined> {
    const normalizedKey = Platform.normalizePath(folderPath);

    if (!forceRefresh) {
      const cached = this.cache.get(normalizedKey);
      if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
        return cached.repo;
      }
    }

    const isRepo = await this.gitClient.isRepository(folderPath);
    if (!isRepo) {
      this.cache.set(normalizedKey, { repo: undefined, timestamp: Date.now() });
      return undefined;
    }

    const rootPath = await this.gitClient.getRoot(folderPath);
    const normalizedPath = Platform.normalizePath(rootPath);
    const name = path.basename(normalizedPath);
    const currentBranch = await this.gitClient.getCurrentBranch(normalizedPath);
    const remotes = await this.gitClient.getRemotes(normalizedPath);
    const status: RepositoryStatus = await this.gitClient.status(normalizedPath);

    const repo: GitRepository = {
      id: `repo_${Buffer.from(normalizedPath).toString('base64url').slice(0, 12)}`,
      path: normalizedPath,
      name,
      currentBranch,
      remotes,
      status,
    };

    this.cache.set(normalizedKey, { repo, timestamp: Date.now() });
    if (normalizedKey !== normalizedPath) {
      this.cache.set(normalizedPath, { repo, timestamp: Date.now() });
    }

    return repo;
  }
}
