import * as os from 'os';
import * as path from 'path';

export class Platform {
  public static isWindows(): boolean {
    return os.platform() === 'win32';
  }

  public static isMacOS(): boolean {
    return os.platform() === 'darwin';
  }

  public static isLinux(): boolean {
    return os.platform() === 'linux';
  }

  public static normalizePath(filePath: string): string {
    let normalized = filePath.replace(/\\/g, '/');
    normalized = path.posix.normalize(normalized);
    if (Platform.isWindows() || /^[a-zA-Z]:/.test(normalized)) {
      return normalized.replace(/^[a-zA-Z]:/, m => m.toUpperCase());
    }
    return normalized;
  }

  public static resolveSshCommand(rawKeyPath: string, homedir: string = os.homedir(), escapeQuotes: boolean = false): string {
    const cleanKeyPath = rawKeyPath.replace(/^["']|["']$/g, '').trim();
    let resolvedKeyPath = cleanKeyPath;
    if (resolvedKeyPath.startsWith('~')) {
      resolvedKeyPath = path.join(homedir, resolvedKeyPath.slice(1));
    }
    const normalizedKeyPath = Platform.normalizePath(resolvedKeyPath);
    let sshCommand: string;
    if (cleanKeyPath.startsWith('ssh ')) {
      sshCommand = cleanKeyPath.includes('-o IdentitiesOnly=yes')
        ? cleanKeyPath
        : `${cleanKeyPath} -o IdentitiesOnly=yes`;
      if (escapeQuotes) {
        sshCommand = sshCommand.replace(/"/g, '\\"');
      }
    } else {
      sshCommand = escapeQuotes
        ? `ssh -i \\"${normalizedKeyPath}\\" -o IdentitiesOnly=yes`
        : `ssh -i "${normalizedKeyPath}" -o IdentitiesOnly=yes`;
    }
    return sshCommand;
  }

  public static normalizeGitHubHost(host?: string): string {
    const rawHost = host?.trim() || 'github.com';
    return rawHost.replace(/^https?:\/\//i, '').replace(/\/+$/, '') || 'github.com';
  }
}
