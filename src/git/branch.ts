export interface BranchInfo {
  name: string;
  isCurrent: boolean;
  upstream?: string;
  ahead?: number;
  behind?: number;
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

      branches.push({
        name,
        isCurrent,
      });
    }

    return branches;
  }
}
