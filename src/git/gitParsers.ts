export interface BranchInfo {
  name: string;
  isCurrent: boolean;
  upstream?: string;
  ahead?: number;
  behind?: number;
  isDetached?: boolean;
}

export class BranchParser {
  public static parseBranchList(output: string): BranchInfo[] {
    const lines = output.split('\n');
    const branches: BranchInfo[] = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      const isCurrent = line.startsWith('*');
      const name = line.replace(/^\*\s*/, '').trim();

      const isDetached = name.startsWith('(') && (name.includes('detached') || name.includes('no branch'));
      const branchName = isDetached ? 'HEAD' : name;

      branches.push({
        name: branchName,
        isCurrent,
        ...(isDetached ? { isDetached: true } : {}),
      });
    }

    return branches;
  }
}

export interface CommitInfo {
  hash: string;
  shortHash: string;
  author: string;
  email: string;
  date: string;
  message: string;
}

export class CommitParser {
  public static parseLog(output: string): CommitInfo[] {
    const commits: CommitInfo[] = [];
    const entries = output.split('\x1e').filter(e => e.trim().length > 0);

    for (const entry of entries) {
      const parts = entry.trim().split('\x1f');
      if (parts.length >= 5) {
        commits.push({
          hash: parts[0].trim(),
          shortHash: parts[0].trim().slice(0, 7),
          author: parts[1].trim(),
          email: parts[2].trim(),
          date: parts[3].trim(),
          message: parts[4].trim(),
        });
      }
    }

    return commits;
  }
}

export interface StashEntry {
  index: number;
  ref: string;
  message: string;
}

export class StashParser {
  public static parseStashList(output: string): StashEntry[] {
    const lines = output.split('\n');
    const entries: StashEntry[] = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      const match = /^stash@\{(\d+)\}:\s*(.+)$/.exec(line);
      if (match) {
        entries.push({
          index: parseInt(match[1], 10),
          ref: `stash@{${match[1]}}`,
          message: match[2].trim(),
        });
      }
    }

    return entries;
  }
}

export interface TagInfo {
  name: string;
}

export class TagParser {
  public static parseTagList(output: string): TagInfo[] {
    return output
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .map(name => ({ name }));
  }
}
