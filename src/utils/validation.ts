export class Validation {
  public static isValidEmail(email: string): boolean {
    if (!email || typeof email !== 'string') return false;
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email.trim());
  }

  public static isValidProfileName(name: string): boolean {
    if (!name || typeof name !== 'string') return false;
    const trimmed = name.trim();
    return trimmed.length >= 1 && trimmed.length <= 64 && /^[a-zA-Z0-9_\-\. ]+$/.test(trimmed);
  }

  public static isValidBranchName(branch: string): boolean {
    if (!branch || typeof branch !== 'string') return false;
    const trimmed = branch.trim();
    if (trimmed.startsWith('/') || trimmed.endsWith('/') || trimmed.endsWith('.lock')) return false;
    if (trimmed.includes('..') || trimmed.includes('@{') || trimmed.includes('\\')) return false;
    return /^[a-zA-Z0-9_\-\./]+$/.test(trimmed);
  }

  public static sanitizeUrl(url: string): string {
    return url.replace(/:(\/\/[^@:]+):[^@]+@/, '$1:***@');
  }
}
