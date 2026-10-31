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
