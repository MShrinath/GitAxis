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
