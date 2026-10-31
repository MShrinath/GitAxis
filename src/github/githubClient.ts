import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  GitHubActionRunSummary,
  GitHubIssueSummary,
  GitHubPullRequestSummary,
  GitHubReleaseSummary,
  GitHubRepoSummary,
} from './githubTypes';
import { ResolvedAuthentication } from '../contracts';
import { logger } from '../utils/logger';

const execFileAsync = promisify(execFile);

export interface GitHubClientOptions {
  host?: string;
  auth?: ResolvedAuthentication;
}

export class GitHubClient {
  private host: string;
  private auth?: ResolvedAuthentication;

  constructor(options: GitHubClientOptions = {}) {
    this.host = options.host || 'github.com';
    this.auth = options.auth;
  }

  private getBaseUrl(): string {
    if (this.host === 'github.com') {
      return 'https://api.github.com';
    }
    return `https://${this.host}/api/v3`;
  }

  private async request<T>(endpoint: string, method: string = 'GET', body?: unknown): Promise<T> {
    const url = `${this.getBaseUrl()}${endpoint}`;
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'GitAxis-VSCode-Extension',
    };

    if (this.auth?.credential) {
      headers['Authorization'] = `token ${this.auth.credential}`;
    }

    // Try direct fetch first if token is available
    if (this.auth?.credential) {
      let response: Response | undefined;
      try {
        response = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (networkErr) {
        logger.warn(`Direct fetch network error, falling back to gh CLI: ${String(networkErr)}`);
      }

      if (response) {
        if (!response.ok) {
          const errText = await response.text();
          let parsedMsg: string = errText;
          try {
            const json = JSON.parse(errText);
            if (json.message) parsedMsg = json.message;
          } catch {}

          if (response.status === 401) {
            throw new Error(`GitHub API (401 Unauthorized): Bad credentials or expired token. ${parsedMsg}`);
          } else if (response.status === 403) {
            throw new Error(`GitHub API (403 Forbidden): Access denied or rate limited. ${parsedMsg}`);
          } else if (response.status === 404) {
            throw new Error(`GitHub API (404 Not Found): Resource not found or token missing required scopes. ${parsedMsg}`);
          } else {
            throw new Error(`GitHub API error (${response.status}): ${parsedMsg}`);
          }
        }

        if (response.status === 204) {
          return undefined as unknown as T;
        }

        const text = await response.text();
        if (!text || text.trim() === '') {
          return undefined as unknown as T;
        }

        return JSON.parse(text) as T;
      }
    }

    // Strict credential guard: If no credential is available, fail closed rather than running gh as default account
    if (!this.auth?.credential) {
      if (this.auth?.type === 'github-cli') {
        const user = this.auth.username || 'User';
        throw new Error(`${user} is not logged in to gh on ${this.host}. Run 'gh auth login' or configure a Personal Access Token.`);
      }
      if (this.auth?.type === 'credential-manager' || this.auth?.type === 'ssh' || this.auth?.type === 'none') {
        throw new Error(`This profile has no API token. Add a PAT or use GitHub CLI to access GitHub API.`);
      }
      throw new Error(`Authentication required for GitHub API ${endpoint}: No token or credentials available.`);
    }

    // Fallback to gh api if direct fetch failed due to network error and gh is installed
    try {
      const ghArgs = ['api', endpoint, '-X', method];
      if (this.host !== 'github.com') {
        ghArgs.push('--hostname', this.host);
      }
      if (body) {
        ghArgs.push('--input', '-');
      }

      const env: NodeJS.ProcessEnv = { ...process.env };
      if (this.auth?.credential) {
        env.GH_TOKEN = this.auth.credential;
      }
      if (this.host) {
        env.GH_HOST = this.host;
      }

      const child = execFile('gh', ghArgs, { timeout: 15000, env }, () => {});
      if (body && child.stdin) {
        child.stdin.write(JSON.stringify(body));
        child.stdin.end();
      }

      const { stdout } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        let out = '';
        let errOut = '';
        child.stdout?.on('data', d => (out += d));
        child.stderr?.on('data', d => (errOut += d));
        child.on('error', err => reject(err));
        child.on('close', code => {
          if (code === 0) resolve({ stdout: out, stderr: errOut });
          else reject(new Error(errOut || `gh api failed with code ${code}`));
        });
      });

      if (!stdout || stdout.trim() === '') {
        return undefined as unknown as T;
      }

      return JSON.parse(stdout) as T;
    } catch (err) {
      throw new Error(`GitHub request failed for ${endpoint}: ${String(err)}`);
    }
  }

  public async getCurrentUser(): Promise<{ login: string; id: number; name?: string; email?: string }> {
    return this.request<{ login: string; id: number; name?: string; email?: string }>('/user');
  }

  public async listRepositories(owner?: string): Promise<GitHubRepoSummary[]> {
    const endpoint = owner ? `/users/${owner}/repos?per_page=100` : '/user/repos?per_page=100';
    const raw = await this.request<any[]>(endpoint);
    return raw.map(r => ({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      private: r.private,
      htmlUrl: r.html_url,
      description: r.description,
      defaultBranch: r.default_branch,
    }));
  }

  public async getRepository(owner: string, repo: string): Promise<GitHubRepoSummary> {
    const r = await this.request<any>(`/repos/${owner}/${repo}`);
    return {
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      private: r.private,
      htmlUrl: r.html_url,
      description: r.description,
      defaultBranch: r.default_branch,
    };
  }

  public async createRepository(name: string, description?: string, isPrivate: boolean = false, owner?: string): Promise<GitHubRepoSummary> {
    const authUser = this.auth?.username?.trim().toLowerCase();
    const isOwnerSelf = !owner || (Boolean(authUser) && owner.trim().toLowerCase() === authUser);
    const endpoint = isOwnerSelf ? '/user/repos' : `/orgs/${owner.trim()}/repos`;
    const r = await this.request<any>(endpoint, 'POST', {
      name,
      description,
      private: isPrivate,
      auto_init: true,
    });
    return {
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      private: r.private,
      htmlUrl: r.html_url,
      description: r.description,
      defaultBranch: r.default_branch,
    };
  }

  public async forkRepository(owner: string, repo: string): Promise<GitHubRepoSummary> {
    const r = await this.request<any>(`/repos/${owner}/${repo}/forks`, 'POST');
    return {
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      private: r.private,
      htmlUrl: r.html_url,
      description: r.description,
      defaultBranch: r.default_branch,
    };
  }

  public async deleteRepository(owner: string, repo: string): Promise<void> {
    await this.request<void>(`/repos/${owner}/${repo}`, 'DELETE');
  }

  public async listIssues(owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'open'): Promise<GitHubIssueSummary[]> {
    const raw = await this.request<any[]>(`/repos/${owner}/${repo}/issues?state=${state}&per_page=50`);
    return raw.filter(i => !i.pull_request).map(i => ({
      id: i.id,
      number: i.number,
      title: i.title,
      state: i.state,
      htmlUrl: i.html_url,
      user: i.user?.login || 'unknown',
      createdAt: i.created_at,
    }));
  }

  public async createIssue(owner: string, repo: string, title: string, body?: string, labels?: string[]): Promise<GitHubIssueSummary> {
    const i = await this.request<any>(`/repos/${owner}/${repo}/issues`, 'POST', {
      title,
      body,
      labels,
    });
    return {
      id: i.id,
      number: i.number,
      title: i.title,
      state: i.state,
      htmlUrl: i.html_url,
      user: i.user?.login || 'unknown',
      createdAt: i.created_at,
    };
  }

  public async closeIssue(owner: string, repo: string, issueNumber: number): Promise<void> {
    await this.request<any>(`/repos/${owner}/${repo}/issues/${issueNumber}`, 'PATCH', {
      state: 'closed',
    });
  }

  public async listPullRequests(owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'open'): Promise<GitHubPullRequestSummary[]> {
    const raw = await this.request<any[]>(`/repos/${owner}/${repo}/pulls?state=${state}&per_page=50`);
    return raw.map(p => ({
      id: p.id,
      number: p.number,
      title: p.title,
      state: p.state,
      htmlUrl: p.html_url,
      user: p.user?.login || 'unknown',
      headRef: p.head?.ref || '',
      baseRef: p.base?.ref || '',
      createdAt: p.created_at,
    }));
  }

  public async createPullRequest(owner: string, repo: string, title: string, head: string, base: string, body?: string, draft: boolean = false): Promise<GitHubPullRequestSummary> {
    const p = await this.request<any>(`/repos/${owner}/${repo}/pulls`, 'POST', {
      title,
      head,
      base,
      body,
      draft,
    });
    return {
      id: p.id,
      number: p.number,
      title: p.title,
      state: p.state,
      htmlUrl: p.html_url,
      user: p.user?.login || 'unknown',
      headRef: p.head?.ref || '',
      baseRef: p.base?.ref || '',
      createdAt: p.created_at,
    };
  }

  public async mergePullRequest(owner: string, repo: string, number: number, method: 'merge' | 'squash' | 'rebase' = 'merge', commitMessage?: string): Promise<void> {
    await this.request<any>(`/repos/${owner}/${repo}/pulls/${number}/merge`, 'PUT', {
      merge_method: method,
      commit_message: commitMessage,
    });
  }

  public async listActions(owner: string, repo: string): Promise<GitHubActionRunSummary[]> {
    const data = await this.request<any>(`/repos/${owner}/${repo}/actions/runs?per_page=20`);
    const raw = data.workflow_runs || [];
    return raw.map((r: any) => ({
      id: r.id,
      name: r.name || 'Workflow Run',
      status: r.status,
      conclusion: r.conclusion,
      htmlUrl: r.html_url,
      headBranch: r.head_branch,
    }));
  }

  public async listReleases(owner: string, repo: string): Promise<GitHubReleaseSummary[]> {
    const raw = await this.request<any[]>(`/repos/${owner}/${repo}/releases?per_page=20`);
    return raw.map(r => ({
      id: r.id,
      tagName: r.tag_name,
      name: r.name,
      htmlUrl: r.html_url,
      publishedAt: r.published_at,
    }));
  }

  public async createRelease(owner: string, repo: string, tag: string, name?: string, body?: string, draft: boolean = false, prerelease: boolean = false): Promise<GitHubReleaseSummary> {
    const r = await this.request<any>(`/repos/${owner}/${repo}/releases`, 'POST', {
      tag_name: tag,
      name,
      body,
      draft,
      prerelease,
    });
    return {
      id: r.id,
      tagName: r.tag_name,
      name: r.name,
      htmlUrl: r.html_url,
      publishedAt: r.published_at,
    };
  }
}
