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
