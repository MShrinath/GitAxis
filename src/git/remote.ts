import { GitRemote } from '../contracts';

export class RemoteParser {
  public static parse(name: string, fetchUrl?: string, pushUrl?: string): GitRemote {
    const url = fetchUrl || pushUrl || '';
    const parsed = this.parseUrl(url);

    return {
      name,
      fetchUrl,
      pushUrl,
      host: parsed?.host,
      owner: parsed?.owner,
      repository: parsed?.repository,
    };
  }

  public static parseUrl(url: string): { host: string; owner: string; repository: string } | undefined {
    if (!url) return undefined;
    const trimmed = url.trim();

    // 1. SSH style: git@github.com:owner/repo.git
    const scpMatch = /^git@([^:]+):([^\/]+)\/(.+?)(?:\.git)?$/i.exec(trimmed);
    if (scpMatch) {
      return {
        host: scpMatch[1],
        owner: scpMatch[2],
        repository: scpMatch[3],
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
