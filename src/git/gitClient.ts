import { execFile } from 'child_process';
import { promisify } from 'util';
import { RepositoryParser } from './repository';
import { BranchInfo, BranchParser } from './branch';
import { CommitInfo, CommitParser } from './commit';
import { StashEntry, StashParser } from './stash';
import { TagInfo, TagParser } from './tag';
import { GitRemote, RepositoryStatus } from '../contracts';
import { logger } from '../utils/logger';

const execFileAsync = promisify(execFile);

export interface GitExecOptions {
  cwd?: string;
  timeout?: number;
  env?: Record<string, string>;
}

export class GitClient {
  constructor(private gitPath: string = 'git') {}

  public async exec(args: string[], options: GitExecOptions = {}): Promise<{ stdout: string; stderr: string }> {
    try {
      const result = await execFileAsync(this.gitPath, args, {
        cwd: options.cwd,
        timeout: options.timeout ?? 30000,
        env: {
          ...process.env,
          ...(options.env || {}),
          LANG: 'C',
          LC_ALL: 'C',
        },
      });
      return { stdout: result.stdout.trim(), stderr: result.stderr.trim() };
    } catch (err: unknown) {
      const error = err as { stdout?: string; stderr?: string; message?: string; code?: number };
      const stdout = error.stdout?.trim() || '';
      const stderr = error.stderr?.trim() || error.message || '';
      logger.error(`Git command failed: ${this.gitPath} ${args.join(' ')}: ${stderr}`);
      throw new Error(stderr || stdout || `Git process exited with code ${error.code}`);
    }
  }

  public async isGitAvailable(): Promise<boolean> {
    try {
      await this.exec(['--version'], { timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  public async getVersion(): Promise<string> {
    const { stdout } = await this.exec(['--version']);
    return stdout;
  }

  public async isRepository(repoPath: string): Promise<boolean> {
    try {
      const { stdout } = await this.exec(['rev-parse', '--is-inside-work-tree'], { cwd: repoPath });
      return stdout === 'true';
    } catch {
      return false;
    }
  }

  public async getRoot(repoPath: string): Promise<string> {
    const { stdout } = await this.exec(['rev-parse', '--show-toplevel'], { cwd: repoPath });
    return stdout;
  }

  public async getCurrentBranch(repoPath: string): Promise<string> {
    try {
      const { stdout } = await this.exec(['branch', '--show-current'], { cwd: repoPath });
      if (stdout) return stdout;
    } catch {}

    try {
      const { stdout } = await this.exec(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoPath });
      return stdout;
    } catch {
      return 'HEAD';
    }
  }

  public async status(repoPath: string): Promise<RepositoryStatus> {
    try {
      const { stdout } = await this.exec(['status', '--porcelain=v2', '--branch'], { cwd: repoPath });
      return RepositoryParser.parseStatus(stdout);
    } catch {
      const { stdout } = await this.exec(['status', '--porcelain'], { cwd: repoPath });
      return RepositoryParser.parseStatus(stdout);
    }
  }

  public async diff(repoPath: string, staged?: boolean, filePath?: string): Promise<string> {
    const args = ['diff'];
    if (staged) {
      args.push('--staged');
    }
    if (filePath) {
      args.push('--', filePath);
    }
    const { stdout } = await this.exec(args, { cwd: repoPath });
    return stdout;
  }

  public async add(repoPath: string, paths: string[], all?: boolean): Promise<void> {
    const args = ['add'];
    if (all) {
      args.push('-A');
    } else if (paths.length > 0) {
      args.push('--', ...paths);
    } else {
      args.push('.');
    }
    await this.exec(args, { cwd: repoPath });
  }

  public async restore(repoPath: string, paths: string[], staged?: boolean): Promise<void> {
    const args = ['restore'];
    if (staged) {
      args.push('--staged');
    }
    args.push('--', ...paths);
    await this.exec(args, { cwd: repoPath });
  }

  public async commit(repoPath: string, message: string, amend?: boolean, signoff?: boolean): Promise<string> {
    const args = ['commit', '-m', message];
    if (amend) {
      args.push('--amend');
    }
    if (signoff) {
      args.push('--signoff');
    }
    const { stdout } = await this.exec(args, { cwd: repoPath });
    return stdout;
  }

  public async amend(repoPath: string, message?: string, noEdit?: boolean): Promise<string> {
    const args = ['commit', '--amend'];
    if (noEdit) {
      args.push('--no-edit');
    } else if (message) {
      args.push('-m', message);
    }
    const { stdout } = await this.exec(args, { cwd: repoPath });
    return stdout;
  }

  public async getBranches(repoPath: string): Promise<BranchInfo[]> {
    const { stdout } = await this.exec(['branch', '--list'], { cwd: repoPath });
    return BranchParser.parseBranchList(stdout);
  }

  public async createBranch(repoPath: string, name: string, startPoint?: string, checkout?: boolean): Promise<void> {
    if (checkout) {
      const args = ['checkout', '-b', name];
      if (startPoint) args.push(startPoint);
      await this.exec(args, { cwd: repoPath });
    } else {
      const args = ['branch', name];
      if (startPoint) args.push(startPoint);
      await this.exec(args, { cwd: repoPath });
    }
  }

  public async deleteBranch(repoPath: string, name: string, force?: boolean): Promise<void> {
    const args = ['branch', force ? '-D' : '-d', name];
    await this.exec(args, { cwd: repoPath });
  }

  public async renameBranch(repoPath: string, oldName: string, newName: string): Promise<void> {
    await this.exec(['branch', '-m', oldName, newName], { cwd: repoPath });
  }

  public async checkout(repoPath: string, ref: string, createBranch?: boolean): Promise<void> {
    const args = ['checkout'];
    if (createBranch) {
      args.push('-b');
    }
    args.push(ref);
    await this.exec(args, { cwd: repoPath });
  }

  public async switchBranch(repoPath: string, branch: string, create?: boolean): Promise<void> {
    const args = ['switch'];
    if (create) {
      args.push('-c');
    }
    args.push(branch);
    await this.exec(args, { cwd: repoPath });
  }

  public async merge(repoPath: string, branch: string, noFastForward?: boolean, squash?: boolean): Promise<string> {
    const args = ['merge'];
    if (noFastForward) args.push('--no-ff');
    if (squash) args.push('--squash');
    args.push(branch);
    const { stdout } = await this.exec(args, { cwd: repoPath });
    return stdout;
  }

  public async rebase(repoPath: string, onto: string): Promise<string> {
    const args = ['rebase', onto];
    const { stdout } = await this.exec(args, { cwd: repoPath });
    return stdout;
  }

  public async fetch(repoPath: string, remote: string = 'origin', prune?: boolean, tags?: boolean): Promise<string> {
    const args = ['fetch', remote];
    if (prune) args.push('--prune');
    if (tags) args.push('--tags');
    const { stdout, stderr } = await this.exec(args, { cwd: repoPath });
    return stdout || stderr;
  }

  public async pull(repoPath: string, remote?: string, branch?: string, rebase?: boolean): Promise<string> {
    const args = ['pull'];
    if (rebase) args.push('--rebase');
    if (remote) args.push(remote);
    if (branch) args.push(branch);
    const { stdout, stderr } = await this.exec(args, { cwd: repoPath });
    return stdout || stderr;
  }

  public async push(
    repoPath: string,
    remote: string = 'origin',
    branch?: string,
    setUpstream?: boolean,
    force?: boolean,
    forceWithLease?: boolean,
    tags?: boolean
  ): Promise<string> {
    const args = ['push'];
    if (setUpstream) args.push('-u');
    if (force) {
      args.push('--force');
    } else if (forceWithLease) {
      args.push('--force-with-lease');
    }
    if (tags) args.push('--tags');
    args.push(remote);
    if (branch) args.push(branch);

    const { stdout, stderr } = await this.exec(args, { cwd: repoPath });
    return stdout || stderr;
  }

  public async stash(repoPath: string, message?: string, includeUntracked?: boolean): Promise<string> {
    const args = ['stash', 'push'];
    if (includeUntracked) args.push('-u');
    if (message) args.push('-m', message);
    const { stdout } = await this.exec(args, { cwd: repoPath });
    return stdout;
  }

  public async stashApply(repoPath: string, stashRef: string = 'stash@{0}'): Promise<string> {
    const { stdout } = await this.exec(['stash', 'apply', stashRef], { cwd: repoPath });
    return stdout;
  }

  public async stashPop(repoPath: string, stashRef: string = 'stash@{0}'): Promise<string> {
    const { stdout } = await this.exec(['stash', 'pop', stashRef], { cwd: repoPath });
    return stdout;
  }

  public async stashDrop(repoPath: string, stashRef: string = 'stash@{0}'): Promise<string> {
    const { stdout } = await this.exec(['stash', 'drop', stashRef], { cwd: repoPath });
    return stdout;
  }

  public async getStashList(repoPath: string): Promise<StashEntry[]> {
    const { stdout } = await this.exec(['stash', 'list'], { cwd: repoPath });
    return StashParser.parseStashList(stdout);
  }

  public async createTag(repoPath: string, name: string, target?: string, message?: string): Promise<void> {
    const args = ['tag'];
    if (message) {
      args.push('-a', name, '-m', message);
    } else {
      args.push(name);
    }
    if (target) args.push(target);
    await this.exec(args, { cwd: repoPath });
  }

  public async deleteTag(repoPath: string, name: string): Promise<void> {
    await this.exec(['tag', '-d', name], { cwd: repoPath });
  }

  public async getTags(repoPath: string): Promise<TagInfo[]> {
    const { stdout } = await this.exec(['tag', '-l'], { cwd: repoPath });
    return TagParser.parseTagList(stdout);
  }

  public async getRemotes(repoPath: string): Promise<GitRemote[]> {
    const { stdout } = await this.exec(['remote', '-v'], { cwd: repoPath });
    return RepositoryParser.parseRemotes(stdout);
  }

  public async addRemote(repoPath: string, name: string, url: string): Promise<void> {
    await this.exec(['remote', 'add', name, url], { cwd: repoPath });
  }

  public async removeRemote(repoPath: string, name: string): Promise<void> {
    await this.exec(['remote', 'remove', name], { cwd: repoPath });
  }

  public async setRemoteUrl(repoPath: string, name: string, url: string, push?: boolean): Promise<void> {
    const args = ['remote', 'set-url'];
    if (push) args.push('--push');
    args.push(name, url);
    await this.exec(args, { cwd: repoPath });
  }

  public async log(repoPath: string, maxCount: number = 20, branch?: string, filePath?: string): Promise<CommitInfo[]> {
    const args = ['log', `-n${maxCount}`, '--format=%H%x1f%an%x1f%ae%x1f%aI%x1f%s%x1e'];
    if (branch) args.push(branch);
    if (filePath) args.push('--', filePath);
    const { stdout } = await this.exec(args, { cwd: repoPath });
    return CommitParser.parseLog(stdout);
  }

  public async blame(repoPath: string, filePath: string, startLine?: number, endLine?: number): Promise<string> {
    const args = ['blame'];
    if (startLine && endLine) {
      args.push(`-L${startLine},${endLine}`);
    }
    args.push('--', filePath);
    const { stdout } = await this.exec(args, { cwd: repoPath });
    return stdout;
  }

  public async reset(repoPath: string, ref: string, mode: 'soft' | 'mixed' | 'hard'): Promise<void> {
    const args = ['reset', `--${mode}`, ref];
    await this.exec(args, { cwd: repoPath });
  }

  public async clone(url: string, destinationPath: string, branch?: string, depth?: number): Promise<void> {
    const args = ['clone'];
    if (branch) args.push('-b', branch);
    if (depth) args.push('--depth', depth.toString());
    args.push(url, destinationPath);
    await this.exec(args);
  }

  public async init(repoPath: string, bare?: boolean): Promise<void> {
    const args = ['init'];
    if (bare) args.push('--bare');
    args.push(repoPath);
    await this.exec(args);
  }

  public async getLocalConfig(repoPath: string, key: string): Promise<string | undefined> {
    try {
      const { stdout } = await this.exec(['config', '--local', '--get', key], { cwd: repoPath });
      return stdout || undefined;
    } catch {
      return undefined;
    }
  }

  public async setLocalConfig(repoPath: string, key: string, value: string): Promise<void> {
    await this.exec(['config', '--local', key, value], { cwd: repoPath });
  }

  public async getGlobalConfig(key: string): Promise<string | undefined> {
    try {
      const { stdout } = await this.exec(['config', '--global', '--get', key]);
      return stdout || undefined;
    } catch {
      return undefined;
    }
  }

  public async setGlobalConfig(key: string, value: string): Promise<void> {
    await this.exec(['config', '--global', key, value]);
  }
}
