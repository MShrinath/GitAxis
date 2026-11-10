import { GitRemote } from '../contracts';

export class RemoteParser {
  public static parse(name: string, fetchUrl?: string, pushUrl?: string): GitRemote {
    const fetchParsed = fetchUrl ? this.parseUrl(fetchUrl) : undefined;
    const pushParsed = pushUrl ? this.parseUrl(pushUrl) : undefined;
    const primary = fetchParsed || pushParsed;

    return {
      name,
      fetchUrl,
      pushUrl,
      host: primary?.host,
      owner: primary?.owner,
      repository: primary?.repository,
      pushHost: pushParsed?.host,
      pushOwner: pushParsed?.owner,
      pushRepository: pushParsed?.repository,
    };
  }

  public static parseUrl(url: string): { host: string; owner: string; repository: string } | undefined {
    if (!url) return undefined;
    const trimmed = url.trim();

    // 1. SSH style: git@github.com:owner/repo.git or deploy@host:owner/repo.git
    const scpMatch = /^([a-zA-Z0-9._-]+)@([^:]+):([^\/]+)\/(.+?)(?:\.git)?$/i.exec(trimmed);
    if (scpMatch) {
      return {
        host: scpMatch[2],
        owner: scpMatch[3],
        repository: scpMatch[4],
      };
    }

    // 2. URL style: https://github.com/owner/repo.git or ssh://git@github.com/owner/repo.git
    try {
      // In case of ssh://git@..., URL parser handles it if standard
      const parsedUrl = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
      const pathname = parsedUrl.pathname.replace(/^\//, '').replace(/\.git$/, '');
      const parts = pathname.split('/');
      if (parts.length >= 2) {
        return {
          host: parsedUrl.hostname,
          owner: parts[0],
          repository: parts.slice(1).join('/'),
        };
      }
    } catch {
      // Ignore URL parse error
    }

    return undefined;
  }
}
