import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { GitProfile } from '../contracts';
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
   * Check if a repository path matches a folder rule pattern.
   * Examples:
   *   "~/work/**" matches "/home/user/work/repo1"
   *   "~/work/" matches "/home/user/work/repo1"
   *   "C:/projects/work/**" matches "C:/projects/work/client-a"
   */
  public matchesPattern(targetPath: string, rulePattern: string): boolean {
    if (!targetPath || !rulePattern) return false;

    const normTarget = this.normalizePathForComparison(targetPath);

    // Strip trailing /** or /* or / from pattern for prefix matching
    let cleanPattern = rulePattern.trim();
    if (cleanPattern.endsWith('/**')) {
      cleanPattern = cleanPattern.slice(0, -3);
    } else if (cleanPattern.endsWith('/*')) {
      cleanPattern = cleanPattern.slice(0, -2);
    }
    const normPattern = this.normalizePathForComparison(cleanPattern);

    const isCaseInsensitive = Platform.isWindows() || Platform.isMacOS();
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
   * Resolves the profile matching a target repository path based on folder rules.
   * If multiple rules match, returns the longest (most specific) rule match.
   */
  public resolveProfile(targetPath: string, profiles: GitProfile[]): FolderRuleMatch | undefined {
    let bestMatch: FolderRuleMatch | undefined;
    let longestRuleLength = -1;

    for (const profile of profiles) {
      if (!profile.folderRules || profile.folderRules.length === 0) continue;

      for (const rule of profile.folderRules) {
        if (this.matchesPattern(targetPath, rule)) {
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
    const lines: string[] = [
      `# GitAxis Profile: ${profile.name}`,
      `# Generated automatically. Do not edit directly.`,
      `[user]`,
      `\tname = ${profile.git.name}`,
      `\temail = ${profile.git.email}`,
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
   * Generate the [includeIf "gitdir:..."] block for all profiles with folder rules.
   */
  public generateIncludeIfBlock(profiles: GitProfile[]): string {
    const rulesToEmit: Array<{ gitdir: string; configPath: string }> = [];

    for (const profile of profiles) {
      if (!profile.folderRules || profile.folderRules.length === 0) continue;
      const configPath = this.getProfileConfigPath(profile).replace(/\\/g, '/');

      for (const rule of profile.folderRules) {
        if (!rule.trim()) continue;
        const gitdir = this.formatGitdirPattern(rule);
        rulesToEmit.push({ gitdir, configPath });
      }
    }

    if (rulesToEmit.length === 0) {
      return '';
    }

    const lines: string[] = [
      GITAXIS_CONFIG_START,
      '# The following rules automatically switch your Git identity based on folder paths.',
      '# Managed by GitAxis. Use "GitAxis: Remove All GitAxis Config" to safely undo.',
    ];

    for (const r of rulesToEmit) {
      lines.push(`[includeIf "gitdir:${r.gitdir}"]`);
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

    // Write updated ~/.gitconfig
    await fs.promises.mkdir(path.dirname(this.gitConfigPath), { recursive: true });
    await fs.promises.writeFile(this.gitConfigPath, preview.updatedConfig, 'utf8');
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

    await fs.promises.writeFile(this.gitConfigPath, cleanedConfig, 'utf8');
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
}
