import { execFile } from 'child_process';
import { promisify } from 'util';
import { RepositoryParser } from './repository';
import { BranchInfo, BranchParser } from './branch';
import { CommitInfo, CommitParser } from './commit';
import { StashEntry, StashParser } from './stash';
import { TagInfo, TagParser } from './tag';
import { GitRemote, RepositoryStatus } from '../contracts';
import { logger } from '../utils/logger';
import { Validation } from '../utils/validation';

const execFileAsync = promisify(execFile);

export interface GitExecOptions {
  cwd?: string;
  timeout?: number;
  env?: Record<string, string>;
  signal?: AbortSignal;
}

export class GitProcessError extends Error {
  public readonly code?: number | string;
  public readonly killed?: boolean;
  public readonly signal?: string;
  public readonly stdout: string;
  public readonly stderr: string;

  constructor(
    message: string,
    details: { code?: number | string; killed?: boolean; signal?: string; stdout?: string; stderr?: string } = {}
  ) {
    super(message);
    this.name = 'GitProcessError';
    this.code = details.code;
    this.killed = details.killed;
    this.signal = details.signal;
    this.stdout = details.stdout || '';
    this.stderr = details.stderr || '';
    Object.setPrototypeOf(this, GitProcessError.prototype);
  }
}

export class GitClient {
  constructor(private gitPath: string = 'git') {}

  public async exec(args: string[], options: GitExecOptions = {}): Promise<{ stdout: string; stderr: string }> {
    try {
      const result = await execFileAsync(this.gitPath, args, {
        cwd: options.cwd,
        timeout: options.timeout ?? 30000,
        signal: options.signal,
        env: {
          ...process.env,
          ...(options.env || {}),
          LANG: 'C',
          LC_ALL: 'C',
        },
      });
      return { stdout: result.stdout.trim(), stderr: result.stderr.trim() };
    } catch (err: unknown) {
      if (options.signal?.aborted || (err as { name?: string })?.name === 'AbortError') {
        throw new Error('Git operation was cancelled by user');
      }
      const error = err as { stdout?: string; stderr?: string; message?: string; code?: number | string; killed?: boolean; signal?: string };
      const stdout = error.stdout?.trim() || '';
      const stderr = error.stderr?.trim() || error.message || '';
      const sanitizedCmd = Validation.sanitizeUrl(`${this.gitPath} ${args.join(' ')}`);
      const sanitizedStderr = Validation.sanitizeUrl(stderr);
      const sanitizedStdout = Validation.sanitizeUrl(stdout);
      logger.error(`Git command failed: ${sanitizedCmd}: ${sanitizedStderr}`);
      const message = sanitizedStderr || sanitizedStdout || `Git process exited with code ${error.code}`;
      throw new GitProcessError(message, {
        code: error.code,
        killed: error.killed,
        signal: error.signal,
        stdout: sanitizedStdout,
        stderr: sanitizedStderr,
      });
    }
  }

  public async execWithStdin(
    args: string[],
    input: string,
    options: GitExecOptions = {}
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = execFile(
        this.gitPath,
        args,
        {
          cwd: options.cwd,
          timeout: options.timeout ?? 10000,
          signal: options.signal,
          env: {
            ...process.env,
            ...(options.env || {}),
            LANG: 'C',
            LC_ALL: 'C',
          },
        },
        (err, stdout, stderr) => {
          if (err) {
            const e = err as any;
            const message = stderr?.trim() || stdout?.trim() || e.message;
            return reject(
              new GitProcessError(Validation.sanitizeUrl(message), {
                code: e.code,
                killed: e.killed,
                signal: e.signal,
                stdout: stdout?.trim(),
                stderr: stderr?.trim(),
              })
            );
          }
          resolve({ stdout: stdout?.trim() || '', stderr: stderr?.trim() || '' });
        }
      );

      if (child.stdin) {
        child.stdin.write(input);
        child.stdin.end();
      }
    });
  }

  public async getCredentialHelper(cwd?: string): Promise<string> {
    try {
      const { stdout } = await this.exec(['config', '--get', 'credential.helper'], { cwd });
      return stdout.trim();
    } catch {
      return '';
    }
  }

  public async approveCredential(
    params: { protocol: string; host: string; username: string; password: string },
    options: GitExecOptions = {}
  ): Promise<void> {
    const input = `protocol=${params.protocol}\nhost=${params.host}\nusername=${params.username}\npassword=${params.password}\n\n`;
    await this.execWithStdin(['credential', 'approve'], input, options);
  }

  public async rejectCredential(
    params: { protocol: string; host: string; username: string },
    options: GitExecOptions = {}
  ): Promise<void> {
    const input = `protocol=${params.protocol}\nhost=${params.host}\nusername=${params.username}\n\n`;
    await this.execWithStdin(['credential', 'reject'], input, options);
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

  public async status(repoPath: string, options?: GitExecOptions): Promise<RepositoryStatus> {
    try {
      const { stdout } = await this.exec(['status', '--porcelain=v2', '--branch'], { cwd: repoPath, ...options });
      return RepositoryParser.parseStatus(stdout);
    } catch {
      const { stdout } = await this.exec(['status', '--porcelain'], { cwd: repoPath, ...options });
      return RepositoryParser.parseStatus(stdout);
    }
  }

  public async diff(repoPath: string, staged?: boolean, filePath?: string, options?: GitExecOptions): Promise<string> {
    const args = ['diff'];
    if (staged) {
      args.push('--staged');
    }
    if (filePath) {
      args.push('--', filePath);
    }
    const { stdout } = await this.exec(args, { cwd: repoPath, ...options });
    return stdout;
  }

  public async add(repoPath: string, paths: string[], all?: boolean, options?: GitExecOptions): Promise<void> {
    const args = ['add'];
    if (all) {
      args.push('-A');
    } else if (paths.length > 0) {
      args.push('--', ...paths);
    } else {
      args.push('.');
    }
    await this.exec(args, { cwd: repoPath, ...options });
  }

  public async restore(repoPath: string, paths: string[], staged?: boolean, options?: GitExecOptions): Promise<void> {
    const args = ['restore'];
    if (staged) {
      args.push('--staged');
    }
    args.push('--', ...paths);
    await this.exec(args, { cwd: repoPath, ...options });
  }

  public async commit(repoPath: string, message: string, amend?: boolean, signoff?: boolean, options?: GitExecOptions): Promise<string> {
    const args = ['commit', '-m', message];
    if (amend) {
      args.push('--amend');
    }
    if (signoff) {
      args.push('--signoff');
    }
    const { stdout } = await this.exec(args, { cwd: repoPath, ...options });
    return stdout;
  }

  public async amend(repoPath: string, message?: string, noEdit?: boolean, options?: GitExecOptions): Promise<string> {
    const args = ['commit', '--amend'];
    if (noEdit) {
      args.push('--no-edit');
    } else if (message) {
      args.push('-m', message);
    }
    const { stdout } = await this.exec(args, { cwd: repoPath, ...options });
    return stdout;
  }

  public async getBranches(repoPath: string, options?: GitExecOptions): Promise<BranchInfo[]> {
    const { stdout } = await this.exec(['branch', '--list'], { cwd: repoPath, ...options });
    return BranchParser.parseBranchList(stdout);
  }

  public async createBranch(repoPath: string, name: string, startPoint?: string, checkout?: boolean, options?: GitExecOptions): Promise<void> {
    if (!Validation.isValidBranchName(name)) {
      throw new Error(`Invalid branch name: "${name}"`);
    }
    if (startPoint && !Validation.isValidRef(startPoint)) {
      throw new Error(`Invalid start point ref: "${startPoint}"`);
    }
    if (checkout) {
      const args = ['checkout', '-b', name];
      if (startPoint) args.push(startPoint);
      await this.exec(args, { cwd: repoPath, ...options });
    } else {
      const args = ['branch', name];
      if (startPoint) args.push(startPoint);
      await this.exec(args, { cwd: repoPath, ...options });
    }
  }

  public async deleteBranch(repoPath: string, name: string, force?: boolean, options?: GitExecOptions): Promise<void> {
    if (!Validation.isValidBranchName(name)) {
      throw new Error(`Invalid branch name: "${name}"`);
    }
    const args = ['branch', force ? '-D' : '-d', name];
    await this.exec(args, { cwd: repoPath, ...options });
  }

  public async renameBranch(repoPath: string, oldName: string, newName: string, options?: GitExecOptions): Promise<void> {
    if (!Validation.isValidBranchName(oldName) || !Validation.isValidBranchName(newName)) {
      throw new Error(`Invalid branch name for rename: "${oldName}" -> "${newName}"`);
    }
    await this.exec(['branch', '-m', oldName, newName], { cwd: repoPath, ...options });
  }

  public async checkout(repoPath: string, ref: string, createBranch?: boolean, options?: GitExecOptions): Promise<void> {
    if (createBranch) {
      if (!Validation.isValidBranchName(ref)) {
        throw new Error(`Invalid branch name: "${ref}"`);
      }
      await this.exec(['checkout', '-b', ref], { cwd: repoPath, ...options });
    } else {
      if (!Validation.isValidRef(ref)) {
        throw new Error(`Invalid git ref: "${ref}"`);
      }
      await this.exec(['checkout', ref], { cwd: repoPath, ...options });
    }
  }

  public async switchBranch(repoPath: string, branch: string, create?: boolean, options?: GitExecOptions): Promise<void> {
    if (!Validation.isValidBranchName(branch)) {
      throw new Error(`Invalid branch name: "${branch}"`);
    }
    const args = ['switch'];
    if (create) {
      args.push('-c');
    }
    args.push(branch);
    await this.exec(args, { cwd: repoPath, ...options });
  }

  public async merge(repoPath: string, branch: string, noFastForward?: boolean, squash?: boolean, options?: GitExecOptions): Promise<string> {
    if (!Validation.isValidRef(branch)) {
      throw new Error(`Invalid merge branch/ref: "${branch}"`);
    }
    const args = ['merge'];
    if (noFastForward) args.push('--no-ff');
    if (squash) args.push('--squash');
    args.push(branch);
    const { stdout } = await this.exec(args, { cwd: repoPath, ...options });
    return stdout;
  }

  public async rebase(repoPath: string, onto: string, options?: GitExecOptions): Promise<string> {
    if (!Validation.isValidRef(onto)) {
      throw new Error(`Invalid rebase ref: "${onto}"`);
    }
    const args = ['rebase', onto];
    const { stdout } = await this.exec(args, { cwd: repoPath, ...options });
    return stdout;
  }

  public async fetch(repoPath: string, remote: string = 'origin', prune?: boolean, tags?: boolean, options?: GitExecOptions): Promise<string> {
    if (!Validation.isValidRemoteName(remote)) {
      throw new Error(`Invalid remote name: "${remote}"`);
    }
    const args = ['fetch', remote];
    if (prune) args.push('--prune');
    if (tags) args.push('--tags');
    const { stdout, stderr } = await this.exec(args, { cwd: repoPath, ...options });
    return stdout || stderr;
  }

  public async pull(repoPath: string, remote?: string, branch?: string, rebase?: boolean, options?: GitExecOptions): Promise<string> {
    if (remote && !Validation.isValidRemoteName(remote)) {
      throw new Error(`Invalid remote name: "${remote}"`);
    }
    if (branch && !Validation.isValidBranchName(branch)) {
      throw new Error(`Invalid branch name: "${branch}"`);
    }
    const args = ['pull'];
    if (rebase) args.push('--rebase');
    return this.execRemoteBranch(repoPath, args, remote, branch, options);
  }

  public async push(
    repoPath: string,
    remote: string = 'origin',
    branch?: string,
    setUpstream?: boolean,
    force?: boolean,
    forceWithLease?: boolean,
    tags?: boolean,
    options?: GitExecOptions
  ): Promise<string> {
    if (!Validation.isValidRemoteName(remote)) {
      throw new Error(`Invalid remote name: "${remote}"`);
    }
    if (branch && !Validation.isValidBranchName(branch)) {
      throw new Error(`Invalid branch name: "${branch}"`);
    }
    const args = ['push'];
    if (setUpstream) args.push('-u');
    // Section 6: Prefer --force-with-lease when both force and forceWithLease are set
    if (forceWithLease) {
      args.push('--force-with-lease');
    } else if (force) {
      args.push('--force');
    }
    if (tags) args.push('--tags');
    return this.execRemoteBranch(repoPath, args, remote, branch, options);
  }

  private async execRemoteBranch(
    repoPath: string,
    args: string[],
    remote?: string,
    branch?: string,
    options?: GitExecOptions
  ): Promise<string> {
    if (remote) args.push(remote);
    if (branch) args.push(branch);
    const { stdout, stderr } = await this.exec(args, { cwd: repoPath, ...options });
    return stdout || stderr;
  }


  public async stash(repoPath: string, message?: string, includeUntracked?: boolean, options?: GitExecOptions): Promise<string> {
    const args = ['stash', 'push'];
    if (includeUntracked) args.push('-u');
    if (message) args.push('-m', message);
    const { stdout } = await this.exec(args, { cwd: repoPath, ...options });
    return stdout;
  }

  public async stashApply(repoPath: string, stashRef: string = 'stash@{0}', options?: GitExecOptions): Promise<string> {
    if (!Validation.isValidRef(stashRef)) {
      throw new Error(`Invalid stash ref: "${stashRef}"`);
    }
    const { stdout } = await this.exec(['stash', 'apply', stashRef], { cwd: repoPath, ...options });
    return stdout;
  }

  public async stashPop(repoPath: string, stashRef: string = 'stash@{0}', options?: GitExecOptions): Promise<string> {
    if (!Validation.isValidRef(stashRef)) {
      throw new Error(`Invalid stash ref: "${stashRef}"`);
    }
    const { stdout } = await this.exec(['stash', 'pop', stashRef], { cwd: repoPath, ...options });
    return stdout;
  }

  public async stashDrop(repoPath: string, stashRef: string = 'stash@{0}', options?: GitExecOptions): Promise<string> {
    if (!Validation.isValidRef(stashRef)) {
      throw new Error(`Invalid stash ref: "${stashRef}"`);
    }
    const { stdout } = await this.exec(['stash', 'drop', stashRef], { cwd: repoPath, ...options });
    return stdout;
  }

  public async getStashList(repoPath: string, options?: GitExecOptions): Promise<StashEntry[]> {
    const { stdout } = await this.exec(['stash', 'list'], { cwd: repoPath, ...options });
    return StashParser.parseStashList(stdout);
  }

  public async createTag(repoPath: string, name: string, target?: string, message?: string, options?: GitExecOptions): Promise<void> {
    if (!Validation.isValidTagName(name)) {
      throw new Error(`Invalid tag name: "${name}"`);
    }
    if (target && !Validation.isValidRef(target)) {
      throw new Error(`Invalid tag target ref: "${target}"`);
    }
    const args = ['tag'];
    if (message) {
      args.push('-a', name, '-m', message);
    } else {
      args.push(name);
    }
    if (target) args.push(target);
    await this.exec(args, { cwd: repoPath, ...options });
  }

  public async deleteTag(repoPath: string, name: string, options?: GitExecOptions): Promise<void> {
    if (!Validation.isValidTagName(name)) {
      throw new Error(`Invalid tag name: "${name}"`);
    }
    await this.exec(['tag', '-d', name], { cwd: repoPath, ...options });
  }

  public async getTags(repoPath: string, options?: GitExecOptions): Promise<TagInfo[]> {
    const { stdout } = await this.exec(['tag', '-l'], { cwd: repoPath, ...options });
    return TagParser.parseTagList(stdout);
  }

  public async getRemotes(repoPath: string, options?: GitExecOptions): Promise<GitRemote[]> {
    const { stdout } = await this.exec(['remote', '-v'], { cwd: repoPath, ...options });
    return RepositoryParser.parseRemotes(stdout);
  }

  private validateRemoteAndUrl(name: string, url: string): void {
    if (!Validation.isValidRemoteName(name)) {
      throw new Error(`Invalid remote name: "${name}"`);
    }
    if (!Validation.isValidGitUrl(url)) {
      throw new Error(`Invalid remote URL: "${url}"`);
    }
  }

  public async addRemote(repoPath: string, name: string, url: string, options?: GitExecOptions): Promise<void> {
    this.validateRemoteAndUrl(name, url);
    await this.exec(['remote', 'add', name, url], { cwd: repoPath, ...options });
  }

  public async removeRemote(repoPath: string, name: string, options?: GitExecOptions): Promise<void> {
    if (!Validation.isValidRemoteName(name)) {
      throw new Error(`Invalid remote name: "${name}"`);
    }
    await this.exec(['remote', 'remove', name], { cwd: repoPath, ...options });
  }

  public async setRemoteUrl(repoPath: string, name: string, url: string, push?: boolean, options?: GitExecOptions): Promise<void> {
    this.validateRemoteAndUrl(name, url);
    const args = ['remote', 'set-url'];
    if (push) args.push('--push');
    args.push(name, url);
    await this.exec(args, { cwd: repoPath, ...options });
  }

  public async log(repoPath: string, maxCount: number = 20, branch?: string, filePath?: string, options?: GitExecOptions): Promise<CommitInfo[]> {
    const args = ['log', `-n${maxCount}`, '--format=%H%x1f%an%x1f%ae%x1f%aI%x1f%s%x1e'];
    if (branch) {
      if (!Validation.isValidRef(branch)) {
        throw new Error(`Invalid log branch/ref: "${branch}"`);
      }
      args.push(branch);
    }
    if (filePath) args.push('--', filePath);
    const { stdout } = await this.exec(args, { cwd: repoPath, ...options });
    return CommitParser.parseLog(stdout);
  }

  public async blame(repoPath: string, filePath: string, startLine?: number, endLine?: number, options?: GitExecOptions): Promise<string> {
    const args = ['blame'];
    if (startLine && endLine) {
      args.push(`-L${startLine},${endLine}`);
    }
    args.push('--', filePath);
    const { stdout } = await this.exec(args, { cwd: repoPath, ...options });
    return stdout;
  }

  public async reset(repoPath: string, ref: string, mode: 'soft' | 'mixed' | 'hard', options?: GitExecOptions): Promise<void> {
    if (!Validation.isValidRef(ref)) {
      throw new Error(`Invalid reset ref: "${ref}"`);
    }
    const args = ['reset', `--${mode}`, ref];
    await this.exec(args, { cwd: repoPath, ...options });
  }

  public async clone(url: string, destinationPath: string, branch?: string, depth?: number, options?: GitExecOptions): Promise<void> {
    if (!Validation.isValidGitUrl(url)) {
      throw new Error(`Invalid clone URL: "${url}"`);
    }
    if (branch && !Validation.isValidBranchName(branch)) {
      throw new Error(`Invalid branch name: "${branch}"`);
    }
    if (destinationPath.trim().startsWith('-')) {
      throw new Error(`Invalid destination path: "${destinationPath}"`);
    }
    const args = ['clone'];
    if (branch) args.push('-b', branch);
    if (depth) args.push('--depth', depth.toString());
    args.push('--', url, destinationPath);
    await this.exec(args, options);
  }

  public async init(repoPath: string, bare?: boolean, options?: GitExecOptions): Promise<void> {
    const args = ['init'];
    if (bare) args.push('--bare');
    args.push(repoPath);
    await this.exec(args, options);
  }

  public async getConfig(repoPath: string, key: string): Promise<string | undefined> {
    try {
      const { stdout } = await this.exec(['config', '--get', key], { cwd: repoPath });
      return stdout || undefined;
    } catch {
      return undefined;
    }
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

  public async unsetLocalConfig(repoPath: string, key: string): Promise<void> {
    try {
      await this.exec(['config', '--local', '--unset-all', key], { cwd: repoPath });
    } catch {
      // Ignore if key is not set
    }
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

  public async unsetGlobalConfig(key: string): Promise<void> {
    try {
      await this.exec(['config', '--global', '--unset-all', key]);
    } catch {
      // Ignore if key is not set
    }
  }
}
