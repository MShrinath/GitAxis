export interface GitHubRepoSummary {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  htmlUrl: string;
  description?: string;
  defaultBranch: string;
}

export interface GitHubIssueSummary {
  id: number;
  number: number;
  title: string;
  state: string;
  htmlUrl: string;
  user: string;
  createdAt: string;
}

export interface GitHubPullRequestSummary {
  id: number;
  number: number;
  title: string;
  state: string;
  htmlUrl: string;
  user: string;
  headRef: string;
  baseRef: string;
  createdAt: string;
}

export interface GitHubActionRunSummary {
  id: number;
  name: string;
  status: string;
  conclusion?: string;
  htmlUrl: string;
  headBranch: string;
}

export interface GitHubReleaseSummary {
  id: number;
  tagName: string;
  name?: string;
  htmlUrl: string;
  publishedAt?: string;
}
