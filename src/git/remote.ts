import { GitRemote } from '../contracts';

export function getPrimaryRemote(remotes?: GitRemote[], preferredName: string = 'origin'): GitRemote | undefined {
  if (!remotes || remotes.length === 0) return undefined;
  return remotes.find(r => r.name === preferredName) || remotes[0];
}

export function getRemoteWebUrl(remote?: GitRemote): string | undefined {
  if (!remote || !remote.owner || !remote.repository) return undefined;
  const host = remote.host || 'github.com';
  return `https://${host}/${remote.owner}/${remote.repository}`;
}

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

    const scpMatch = /^([a-zA-Z0-9._-]+)@([^:]+):([^\/]+)\/(.+?)(?:\.git)?$/i.exec(trimmed);
    if (scpMatch) {
      return {
        host: scpMatch[2],
        owner: scpMatch[3],
        repository: scpMatch[4],
      };
    }

    try {
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
      // Non-parseable URL format
    }

    return undefined;
  }
}
