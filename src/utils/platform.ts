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
}
