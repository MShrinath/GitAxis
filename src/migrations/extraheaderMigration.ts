import { GitClient } from '../git/gitClient';
import { IMemento, PersistentProfileStore } from '../profiles/profileStore';
import { logger } from '../utils/logger';

let vscodeModule: any;
try {
  vscodeModule = require('vscode');
} catch {}

export type IMigrationMemento = IMemento;

export class ExtraheaderMigration {
  public static readonly MIGRATION_KEY = 'gitaxis.migratedExtraheaderV040';
  public static readonly MIGRATED_REPOS_KEY = 'gitaxis.migratedRepoExtraheaders';

  public static async run(
    profileStore: PersistentProfileStore,
    gitClient: GitClient,
    memento: IMigrationMemento,
    workspacePaths?: string[],
    notifyFn?: (msg: string) => void
  ): Promise<number> {
    const migratedRepos = new Set<string>(memento.get<string[]>(this.MIGRATED_REPOS_KEY, []));

    const repoPathsSet = new Set<string>();

    try {
      const associations = await profileStore.getAllAssociations();
      for (const p of Object.keys(associations)) {
        if (p) repoPathsSet.add(p);
      }
    } catch (e) {
      logger.error('Failed to get repo associations during migration', e);
    }

    if (workspacePaths) {
      for (const p of workspacePaths) {
        if (p) {
          repoPathsSet.add(p);
        }
      }
    }

    let cleanedCount = 0;

    for (const repoPath of repoPathsSet) {
      if (migratedRepos.has(repoPath)) continue;

      try {
        const isRepo = await gitClient.isRepository(repoPath);
        if (!isRepo) {
          migratedRepos.add(repoPath);
          continue;
        }

        let foundAny = false;
        try {
          const { stdout } = await gitClient.exec(
            ['config', '--local', '--get-regexp', '^http\\..*extraheader'],
            { cwd: repoPath }
          );
          if (stdout) {
            const lines = stdout.split('\n');
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              const match = trimmed.match(/^(\S+)\s+(.*)$/);
              if (match) {
                const key = match[1];
                const val = match[2];
                // Only clean headers that contain basic authorization tokens
                if (/^authorization:\s*basic/i.test(val.trim())) {
                  await gitClient.unsetLocalConfig(repoPath, key);
                  foundAny = true;
                }
              }
            }
          }
        } catch {
          // git config --get-regexp returns exit code 1 if no keys match
        }

        try {
          const generalExtraheader = await gitClient.getLocalConfig(repoPath, 'http.extraheader');
          if (generalExtraheader && /^authorization:\s*basic/i.test(generalExtraheader.trim())) {
            await gitClient.unsetLocalConfig(repoPath, 'http.extraheader');
            foundAny = true;
          }
        } catch {}

        migratedRepos.add(repoPath);

        if (foundAny) {
          cleanedCount++;
          logger.warn(`Security migration: cleaned leftover PAT extraheader from ${repoPath}`);
        }
      } catch (err) {
        logger.error(`Error migrating repo at ${repoPath}: ${String(err)}`);
      }
    }

    await memento.update(this.MIGRATED_REPOS_KEY, Array.from(migratedRepos));
    await memento.update(this.MIGRATION_KEY, true);

    if (cleanedCount > 0) {
      const noticeMsg = `GitAxis Security Notice: Removed plaintext Personal Access Token (PAT) extraheader from .git/config in ${cleanedCount} repository(ies). For security, please rotate any GitHub Personal Access Tokens used previously.`;
      if (notifyFn) {
        notifyFn(noticeMsg);
      } else if (vscodeModule?.window?.showWarningMessage) {
        vscodeModule.window.showWarningMessage(noticeMsg, 'Understood');
      }
    }

    return cleanedCount;

  }
}
