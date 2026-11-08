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
    if (trimmed.startsWith('-')) return false;
    if (trimmed.startsWith('/') || trimmed.endsWith('/') || trimmed.endsWith('.lock')) return false;
    if (trimmed.includes('..') || trimmed.includes('@{') || trimmed.includes('\\') || trimmed.includes(' ')) return false;
    if (/[\x00-\x1f\x7f ~^:?*[]/.test(trimmed)) return false;
    return /^[a-zA-Z0-9_\-\./]+$/.test(trimmed);
  }

  public static isValidTagName(tag: string): boolean {
    return Validation.isValidBranchName(tag);
  }

  public static isValidRemoteName(name: string): boolean {
    if (!name || typeof name !== 'string') return false;
    const trimmed = name.trim();
    if (trimmed.startsWith('-')) return false;
    return /^[a-zA-Z0-9_\-\.]+$/.test(trimmed);
  }

  public static isValidRef(ref: string): boolean {
    if (!ref || typeof ref !== 'string') return false;
    const trimmed = ref.trim();
    if (trimmed.startsWith('-')) return false;
    if (/[\x00-\x1f\x7f\s]/.test(trimmed)) return false;
    if (trimmed.includes('..') || trimmed.includes('\\')) return false;
    return /^[a-zA-Z0-9_\-\./@{}~^+]+$/.test(trimmed);
  }

  public static isValidGitUrl(url: string): boolean {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim();
    if (trimmed.startsWith('-')) return false;
    // Reject ext:: and file:// protocols explicitly
    if (trimmed.startsWith('ext::') || trimmed.startsWith('file://')) return false;
    // Standard protocols: https://, http://, ssh://, git://
    if (/^(https?|ssh|git):\/\/[^\s]+$/.test(trimmed)) return true;
    // SCP-style SSH: [user@]host:owner/repo(.git)
    if (/^([a-zA-Z0-9_.-]+@)?[a-zA-Z0-9_.-]+:[a-zA-Z0-9_./~-]+$/.test(trimmed)) return true;
    return false;
  }

  public static sanitizeUrl(input: string): string {
    if (!input || typeof input !== 'string') return '';
    return input
      // Redact passwords and tokens embedded in URLs: https://user:pass@host or https://token@host
      .replace(/(https?:\/\/)([^:@\s]+):([^@\s]+)@/g, '$1$2:***@')
      .replace(/(https?:\/\/)([^:@\s]+)@/g, (match, proto, user) => {
        // If it looks like a token (long string or starting with gh*), redact it
        if (/^(gh[pousr]_[A-Za-z0-9_]+|[A-Za-z0-9_\-]{32,})$/.test(user)) {
          return `${proto}***@`;
        }
        return match;
      })
      // Redact GitHub Personal Access Tokens and other tokens
      .replace(/ghp_[A-Za-z0-9_]{20,}/g, 'ghp_***[REDACTED]')
      .replace(/github_pat_[A-Za-z0-9_]{20,}/g, 'github_pat_***[REDACTED]')
      .replace(/gh[ousr]_[A-Za-z0-9_]{20,}/g, 'gh*_***[REDACTED]')
      // Redact Authorization headers (basic base64 or bearer)
      .replace(/(AUTHORIZATION:\s*basic\s+)[A-Za-z0-9+/=]+/gi, '$1***[REDACTED]')
      .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1***[REDACTED]')
      // Redact tokens and passwords in key-value formats
      .replace(/(password[:=]\s*)[^\s,]+/gi, '$1***[REDACTED]')
      .replace(/(token[:=]\s*)[^\s,]+/gi, '$1***[REDACTED]');
  }

  public static isValidHost(host: string): boolean {
    if (!host || typeof host !== 'string') return false;
    const clean = host.replace(/^https?:\/\//i, '').replace(/\/+$/, '').trim();
    if (!clean) return false;
    // Disallow dangerous characters for git config section names and CLI flags
    if (/[\s"';#\\]/.test(clean)) return false;
    // Standard hostname pattern with optional port
    return /^[a-zA-Z0-9]([a-zA-Z0-9\-_]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-_]*[a-zA-Z0-9])?)*(:\d+)?$/.test(clean);
  }

  public static isValidFolderRule(rule: string): boolean {
    if (!rule || typeof rule !== 'string') return false;
    // Reject newlines, quotes, semicolons, hashes, and control characters anywhere in the string to prevent gitconfig injection
    if (/[\r\n"';#\x00-\x1f]/.test(rule)) return false;
    const trimmed = rule.trim();
    if (trimmed.length === 0 || trimmed.length > 512) return false;
    return true;
  }

  public static isValidSshKeyPath(keyPath: string): boolean {
    if (!keyPath || typeof keyPath !== 'string') return false;
    let trimmed = keyPath.trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      trimmed = trimmed.slice(1, -1).trim();
    }
    // Reject quotes, control chars, semicolons, shell metacharacters
    if (/[\r\n"';#&|`$><\x00-\x1f\x7f]/.test(trimmed)) return false;
    // Prevent option injection (cannot start with dash)
    if (trimmed.startsWith('-')) return false;
    // Reject SSH command injection vectors like ProxyCommand or LocalCommand
    if (/-(?:o\s*proxycommand|o\s*localcommand)/i.test(trimmed) || /proxycommand/i.test(trimmed) || /localcommand/i.test(trimmed)) {
      return false;
    }
    return trimmed.length > 0 && trimmed.length <= 512;
  }
}


