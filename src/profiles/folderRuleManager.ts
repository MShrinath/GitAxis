import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { GitProfile, GitRemote } from '../contracts';
import { Platform } from '../utils/platform';
import { logger } from '../utils/logger';

export const GITAXIS_CONFIG_START = '# GitAxis Start - Managed by GitAxis VS Code Extension';
export const GITAXIS_CONFIG_END = '# GitAxis End';

export interface FolderRuleMatch {
  profile: GitProfile;
  rule: string;
}

export class FolderRuleManager {
  private homedir: string;
  private gitConfigPath: string;
  private gitAxisDir: string;
  private profilesDir: string;

  constructor(customHomedir?: string, customGitConfigPath?: string) {
    this.homedir = customHomedir || os.homedir();
    this.gitConfigPath = customGitConfigPath || path.join(this.homedir, '.gitconfig');
    this.gitAxisDir = path.join(this.homedir, '.gitaxis');
    this.profilesDir = path.join(this.gitAxisDir, 'profiles');
  }

  public getProfilesDirectory(): string {
    return this.profilesDir;
  }

  public getGitConfigPath(): string {
    return this.gitConfigPath;
  }

  /**
   * Check if GitAxis includeIf configuration block is currently applied to global .gitconfig.
   */
  public isIncludeIfConfigured(): boolean {
    try {
      if (fs.existsSync(this.gitConfigPath)) {
        const content = fs.readFileSync(this.gitConfigPath, 'utf8');
        return content.includes(GITAXIS_CONFIG_START);
      }
    } catch {}
    return false;
  }

  /**
   * Normalize a folder path or glob pattern for gitdir matching.
   * Converts backslashes to forward slashes, expands tilde, and removes trailing wildcards/slashes.
   */
  public normalizePathForComparison(inputPath: string): string {
    let normalized = inputPath.trim();
    if (normalized.startsWith('~')) {
      normalized = path.join(this.homedir, normalized.slice(1));
    }
    normalized = normalized.replace(/\\/g, '/');
    // Normalize Windows drive letter to uppercase e.g. c:/ -> C:/
    if (/^[a-z]:\//i.test(normalized)) {
      normalized = normalized[0].toUpperCase() + normalized.slice(1);
    }
    // Remove redundant trailing slashes
    normalized = normalized.replace(/\/+$/, '');
    return normalized;
  }

  /**
   * Check if a repository path or remotes match a folder/remote rule pattern.
   * Examples:
   *   "~/work/**" matches "/home/user/work/repo1"
   *   "hasconfig:remote.*.url:git@github.com:acme/**" matches remotes for acme org
   *   "git@github.com:acme/**" matches remotes for acme org
   */
  public matchesPattern(targetPath: string, rulePattern: string, remotes?: GitRemote[]): boolean {
    if (!rulePattern) return false;

    const cleanRule = rulePattern.trim();

    // Remote URL matching (hasconfig:remote.*.url: or direct remote pattern)
    if (cleanRule.startsWith('hasconfig:remote.*.url:') || /^(?:https?:\/\/|git@|ssh:\/\/)/i.test(cleanRule)) {
      if (!remotes || remotes.length === 0) return false;
      const urlPattern = cleanRule.replace(/^hasconfig:remote\.\*\.url:/i, '').trim();
      const regexStr = '^' + urlPattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*') + '$';
      const regex = new RegExp(regexStr, 'i');
      return remotes.some(r => {
        const fUrl = r.fetchUrl?.trim() || '';
        const pUrl = r.pushUrl?.trim() || '';
        return regex.test(fUrl) || regex.test(pUrl);
      });
    }

    if (!targetPath) return false;

    const normTarget = this.normalizePathForComparison(targetPath);

    // Strip trailing /** or /* or / from pattern for prefix matching
    let cleanPattern = cleanRule;
    if (cleanPattern.endsWith('/**')) {
      cleanPattern = cleanPattern.slice(0, -3);
    } else if (cleanPattern.endsWith('/*')) {
      cleanPattern = cleanPattern.slice(0, -2);
    }
    const normPattern = this.normalizePathForComparison(cleanPattern);

    const isWindowsPath = /^[a-zA-Z]:\//i.test(normTarget) || /^[a-zA-Z]:\//i.test(normPattern);
    const isCaseInsensitive = Platform.isWindows() || Platform.isMacOS() || isWindowsPath;
    const target = isCaseInsensitive ? normTarget.toLowerCase() : normTarget;
    const pattern = isCaseInsensitive ? normPattern.toLowerCase() : normPattern;

    // Direct match: target is the folder itself
    if (target === pattern) {
      return true;
    }

    // Subdirectory match: target is inside the pattern folder
    if (target.startsWith(pattern + '/')) {
      return true;
    }

    return false;
  }

  /**
   * Resolves the profile matching a target repository path or remotes based on folder and remote rules.
   * If multiple rules match, returns the longest (most specific) rule match.
   */
  public resolveProfile(targetPath: string, profiles: GitProfile[], remotes?: GitRemote[]): FolderRuleMatch | undefined {
    let bestMatch: FolderRuleMatch | undefined;
    let longestRuleLength = -1;

    for (const profile of profiles) {
      if (!profile.folderRules || profile.folderRules.length === 0) continue;

      for (const rule of profile.folderRules) {
        if (this.matchesPattern(targetPath, rule, remotes)) {
          if (rule.length > longestRuleLength) {
            longestRuleLength = rule.length;
            bestMatch = { profile, rule };
          }
        }
      }
    }

    return bestMatch;
  }

  /**
   * Generate slug for profile include file name.
   */
  public sanitizeSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'profile';
  }

  /**
   * Return the include config file path for a profile.
   */
  public getProfileConfigPath(profile: GitProfile): string {
    const slug = `${this.sanitizeSlug(profile.name)}-${profile.id.replace(/[^a-z0-9]/gi, '')}`;
    return path.join(this.profilesDir, `${slug}.gitconfig`);
  }

  /**
   * Generate content for a single profile's .gitconfig include file.
   */
  public generateProfileGitConfig(profile: GitProfile): string {
    const cleanName = profile.git.name.replace(/[\r\n]+/g, ' ').replace(/"/g, '\\"');
    const cleanEmail = profile.git.email.replace(/[\r\n]+/g, '').trim();
    const lines: string[] = [
      `# GitAxis Profile: ${profile.name}`,
      `# Generated automatically. Do not edit directly.`,
      `[user]`,
      `\tname = ${cleanName}`,
      `\temail = ${cleanEmail}`,
    ];

    // SSH core.sshCommand
    const rawSshKeyPath = (profile.authentication as { sshKeyPath?: string })?.sshKeyPath?.trim();
    if (profile.authentication.type === 'ssh' && rawSshKeyPath) {
      const cleanKeyPath = rawSshKeyPath.replace(/^["']|["']$/g, '').trim();
      let resolvedKeyPath = cleanKeyPath;
      if (resolvedKeyPath.startsWith('~')) {
        resolvedKeyPath = path.join(this.homedir, resolvedKeyPath.slice(1));
      }
      const normalizedKeyPath = Platform.normalizePath(resolvedKeyPath);
      const sshCommand = cleanKeyPath.startsWith('ssh ')
        ? (cleanKeyPath.includes('-o IdentitiesOnly=yes') ? cleanKeyPath : `${cleanKeyPath} -o IdentitiesOnly=yes`)
        : `ssh -i "${normalizedKeyPath}" -o IdentitiesOnly=yes`;

      lines.push(`[core]`);
      lines.push(`\tsshCommand = ${sshCommand}`);
    }

    // Credential username
    const host = (profile.github?.host?.trim() || 'github.com')
      .replace(/^https?:\/\//i, '')
      .replace(/\/+$/, '') || 'github.com';
    const ghUsername = profile.github?.username?.trim();
    if (ghUsername) {
      lines.push(`[credential "https://${host}"]`);
      lines.push(`\tusername = ${ghUsername}`);
    }

    return lines.join('\n') + '\n';
  }

  /**
   * Format a rule pattern for Git's includeIf syntax.
   * Git requires forward slashes even on Windows.
   * If matching a directory, gitdir requires trailing slash.
   */
  public formatGitdirPattern(rule: string): string {
    let p = rule.trim().replace(/\\/g, '/');
    if (p.endsWith('/**')) {
      p = p.slice(0, -2); // keep trailing /
    } else if (p.endsWith('/*')) {
      p = p.slice(0, -1); // keep trailing /
    } else if (!p.endsWith('/')) {
      p = p + '/';
    }
    return p;
  }

  /**
   * Format full includeIf condition string (gitdir:... or hasconfig:remote.*.url:...)
   */
  public formatIncludeIfCondition(rule: string): string {
    const trimmed = rule.trim();
    if (trimmed.startsWith('hasconfig:')) {
      return trimmed;
    }
    if (/^(?:https?:\/\/|git@|ssh:\/\/)/i.test(trimmed)) {
      return `hasconfig:remote.*.url:${trimmed}`;
    }
    return `gitdir:${this.formatGitdirPattern(trimmed)}`;
  }

  /**
   * Generate the [includeIf "..."] block for all profiles with folder/remote rules.
   */
  public generateIncludeIfBlock(profiles: GitProfile[]): string {
    const rulesToEmit: Array<{ condition: string; configPath: string }> = [];

    for (const profile of profiles) {
      if (!profile.folderRules || profile.folderRules.length === 0) continue;
      const configPath = this.getProfileConfigPath(profile).replace(/\\/g, '/');

      for (const rule of profile.folderRules) {
        if (!rule.trim()) continue;
        const condition = this.formatIncludeIfCondition(rule);
        rulesToEmit.push({ condition, configPath });
      }
    }

    if (rulesToEmit.length === 0) {
      return '';
    }

    // Sort rules by condition length ascending so that more specific (longer) rules are placed later in .gitconfig (Git's last match wins)
    rulesToEmit.sort((a, b) => a.condition.length - b.condition.length);

    const lines: string[] = [
      GITAXIS_CONFIG_START,
      '# The following rules automatically switch your Git identity based on folder paths or remote URLs.',
      '# Managed by GitAxis. Use "GitAxis: Remove All GitAxis Config" to safely undo.',
    ];

    for (const r of rulesToEmit) {
      lines.push(`[includeIf "${r.condition}"]`);
      lines.push(`\tpath = ${r.configPath}`);
    }

    lines.push(GITAXIS_CONFIG_END);
    return lines.join('\n');
  }

  /**
   * Read current global .gitconfig or empty string if it does not exist.
   */
  public async readGlobalGitConfig(): Promise<string> {
    try {
      if (fs.existsSync(this.gitConfigPath)) {
        return await fs.promises.readFile(this.gitConfigPath, 'utf8');
      }
    } catch (err) {
      logger.warn(`Could not read gitconfig at ${this.gitConfigPath}: ${String(err)}`);
    }
    return '';
  }

  /**
   * Preview the changes that will be applied to ~/.gitconfig.
   */
  public async previewIncludeIfChanges(profiles: GitProfile[]): Promise<{
    currentConfig: string;
    updatedConfig: string;
    includeIfBlock: string;
  }> {
    const currentConfig = await this.readGlobalGitConfig();
    const includeIfBlock = this.generateIncludeIfBlock(profiles);

    let updatedConfig: string;
    const startIndex = currentConfig.indexOf(GITAXIS_CONFIG_START);
    const endIndex = currentConfig.indexOf(GITAXIS_CONFIG_END);

    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
      // Replace existing block
      const before = currentConfig.substring(0, startIndex).trimEnd();
      const after = currentConfig.substring(endIndex + GITAXIS_CONFIG_END.length).trimStart();
      if (includeIfBlock) {
        updatedConfig = `${before}\n\n${includeIfBlock}\n\n${after}`.trim() + '\n';
      } else {
        updatedConfig = `${before}\n\n${after}`.trim() + (before || after ? '\n' : '');
      }
    } else {
      // Append block
      if (includeIfBlock) {
        updatedConfig = currentConfig.trim()
          ? `${currentConfig.trim()}\n\n${includeIfBlock}\n`
          : `${includeIfBlock}\n`;
      } else {
        updatedConfig = currentConfig;
      }
    }

    return {
      currentConfig,
      updatedConfig,
      includeIfBlock,
    };
  }

  /**
   * Apply folder rules:
   * 1. Write per-profile include files in ~/.gitaxis/profiles/<profile>.gitconfig
   * 2. Update ~/.gitconfig with [includeIf "gitdir:..."]
   */
  public async applyIncludeIfRules(profiles: GitProfile[]): Promise<{
    applied: boolean;
    includeIfBlock: string;
    filesWritten: string[];
  }> {
    const filesWritten: string[] = [];
    const preview = await this.previewIncludeIfChanges(profiles);

    // Ensure ~/.gitaxis/profiles exists
    await fs.promises.mkdir(this.profilesDir, { recursive: true });

    // Write include files for each profile with folder rules
    for (const profile of profiles) {
      if (!profile.folderRules || profile.folderRules.length === 0) continue;
      const filePath = this.getProfileConfigPath(profile);
      const content = this.generateProfileGitConfig(profile);
      await fs.promises.writeFile(filePath, content, 'utf8');
      filesWritten.push(filePath);
      logger.info(`Wrote GitAxis include config for ${profile.name} at ${filePath}`);
    }

    // Write updated ~/.gitconfig safely with backup and atomic write
    await this.safeWriteGitConfig(this.gitConfigPath, preview.updatedConfig);
    filesWritten.push(this.gitConfigPath);
    logger.info(`Updated global gitconfig with includeIf rules at ${this.gitConfigPath}`);

    return {
      applied: true,
      includeIfBlock: preview.includeIfBlock,
      filesWritten,
    };
  }

  /**
   * Remove all GitAxis includeIf configurations from ~/.gitconfig.
   */
  public async removeAllGitAxisConfig(): Promise<{ removed: boolean; cleanedConfig: string }> {
    const currentConfig = await this.readGlobalGitConfig();
    const startIndex = currentConfig.indexOf(GITAXIS_CONFIG_START);
    const endIndex = currentConfig.indexOf(GITAXIS_CONFIG_END);

    if (startIndex === -1 || endIndex === -1) {
      return { removed: false, cleanedConfig: currentConfig };
    }

    const before = currentConfig.substring(0, startIndex).trimEnd();
    const after = currentConfig.substring(endIndex + GITAXIS_CONFIG_END.length).trimStart();
    const cleanedConfig = (before ? `${before}\n` : '') + (after ? `${after}\n` : '');

    await this.safeWriteGitConfig(this.gitConfigPath, cleanedConfig);
    logger.info(`Removed GitAxis config block from ${this.gitConfigPath}`);

    // Optionally clean profiles directory
    try {
      if (fs.existsSync(this.profilesDir)) {
        const files = await fs.promises.readdir(this.profilesDir);
        for (const file of files) {
          if (file.endsWith('.gitconfig')) {
            await fs.promises.unlink(path.join(this.profilesDir, file));
          }
        }
      }
    } catch (err) {
      logger.warn(`Could not delete some profile configs in ${this.profilesDir}: ${String(err)}`);
    }

    return { removed: true, cleanedConfig };
  }

  private async safeWriteGitConfig(targetPath: string, content: string): Promise<void> {
    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
    if (fs.existsSync(targetPath)) {
      try {
        await fs.promises.copyFile(targetPath, `${targetPath}.bak`);
      } catch (backupErr) {
        logger.warn(`Could not backup gitconfig to ${targetPath}.bak: ${String(backupErr)}`);
      }
    }
    const tempPath = `${targetPath}.tmp.${Date.now()}`;
    await fs.promises.writeFile(tempPath, content, 'utf8');
    try {
      await fs.promises.rename(tempPath, targetPath);
    } catch {
      await fs.promises.writeFile(targetPath, content, 'utf8');
      try { await fs.promises.unlink(tempPath); } catch {}
    }
  }
}
