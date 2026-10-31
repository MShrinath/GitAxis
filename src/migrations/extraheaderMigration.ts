import { GitClient } from '../git/gitClient';
import { PersistentProfileStore } from '../profiles/profileStore';
import { logger } from '../utils/logger';

let vscodeModule: any;
try {
  vscodeModule = require('vscode');
} catch {}

export interface IMigrationMemento {
  get<T>(key: string, defaultValue?: T): T;
  update(key: string, value: unknown): Thenable<void> | Promise<void>;
}

export class ExtraheaderMigration {
  public static readonly MIGRATION_KEY = 'gitaxis.migratedExtraheaderV040';

  public static async run(
    profileStore: PersistentProfileStore,
    gitClient: GitClient,
    memento: IMigrationMemento,
    workspacePaths?: string[],
    notifyFn?: (msg: string) => void
  ): Promise<number> {

    const alreadyMigrated = memento.get<boolean>(this.MIGRATION_KEY, false);
    if (alreadyMigrated) {
      return 0;
    }

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
      try {
        const isRepo = await gitClient.isRepository(repoPath);
        if (!isRepo) continue;

        let foundAny = false;
        try {
          const { stdout } = await gitClient.exec(
            ['config', '--local', '--get-regexp', '^http\\..*extraheader'],
            { cwd: repoPath }
          );
          if (stdout) {
            const lines = stdout.split('\n');
            for (const line of lines) {
              const key = line.split(' ')[0]?.trim();
              if (key) {
                await gitClient.unsetLocalConfig(repoPath, key);
                foundAny = true;
              }
            }
          }
        } catch {
          // git config --get-regexp returns exit code 1 if no keys match
        }

        try {
          const generalExtraheader = await gitClient.getLocalConfig(repoPath, 'http.extraheader');
          if (generalExtraheader) {
            await gitClient.unsetLocalConfig(repoPath, 'http.extraheader');
            foundAny = true;
          }
        } catch {}

        if (foundAny) {
          cleanedCount++;
          logger.warn(`Security migration: cleaned leftover PAT extraheader from ${repoPath}`);
        }
      } catch (err) {
        logger.error(`Error migrating repo at ${repoPath}: ${String(err)}`);
      }
    }

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
