import { GitRepository, RepositoryStatus } from '../contracts';
import { RemoteParser } from './remote';

export class RepositoryParser {
  public static parseStatus(output: string): RepositoryStatus {
    let staged = 0;
    let modified = 0;
    let untracked = 0;
    let conflicted = 0;
    let ahead = 0;
    let behind = 0;

    const lines = output.split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      if (!line) continue;

      if (line.startsWith('#')) {
        if (line.startsWith('# branch.ab ')) {
          // e.g. # branch.ab +2 -1
          const match = /\+(\d+)\s+-(\d+)/.exec(line);
          if (match) {
            ahead = parseInt(match[1], 10);
            behind = parseInt(match[2], 10);
          }
        }
        continue;
      }

      if (line.startsWith('? ')) {
        untracked++;
      } else if (line.startsWith('! ')) {
        // Ignored in porcelain v2
        continue;
      } else if (line.startsWith('u ') || line.startsWith('1 U') || line.startsWith('2 U')) {
        conflicted++;
      } else if (line.startsWith('1 ') || line.startsWith('2 ')) {
        const parts = line.split(' ');
        const xy = parts[1]; // e.g. "M.", ".M", "MM"
        if (xy && xy.length >= 2) {
          if (xy[0] !== '.') staged++;
          if (xy[1] !== '.') modified++;
        }
      } else if (line.length >= 2) {
        // Standard porcelain v1 fallback: "M ", " M", "??", "UU", "!!"
        const x = line[0];
        const y = line[1];
        if (x === '?' && y === '?') {
          untracked++;
        } else if (x === '!' || y === '!') {
          // Ignored in porcelain v1
          continue;
        } else if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) {
          conflicted++;
        } else {
          if (x !== ' ' && x !== '?' && x !== '!') staged++;
          if (y !== ' ' && y !== '?' && y !== '!') modified++;
        }
      }
    }

    const clean = staged === 0 && modified === 0 && untracked === 0 && conflicted === 0;

    return {
      clean,
      staged,
      modified,
      untracked,
      conflicted,
      ahead,
      behind,
    };
  }

  public static parseRemotes(output: string): ReturnType<typeof RemoteParser.parse>[] {
    // git remote -v output:
    // origin  https://github.com/owner/repo.git (fetch)
    // origin  https://github.com/owner/repo.git (push)
    const map = new Map<string, { fetchUrl?: string; pushUrl?: string }>();
    const lines = output.split('\n');

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      const parts = line.split(/\s+/);
      if (parts.length >= 3) {
        const name = parts[0];
        const url = parts[1];
        const type = parts[2];
        const current = map.get(name) || {};
        if (type.includes('fetch')) {
          current.fetchUrl = url;
        } else if (type.includes('push')) {
          current.pushUrl = url;
        }
        map.set(name, current);
      }
    }

    const remotes: ReturnType<typeof RemoteParser.parse>[] = [];
    for (const [name, urls] of map.entries()) {
      remotes.push(RemoteParser.parse(name, urls.fetchUrl, urls.pushUrl));
    }

    return remotes;
  }
}
