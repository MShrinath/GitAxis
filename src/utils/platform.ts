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
    return path.normalize(filePath).replace(/\\/g, '/');
  }
}
