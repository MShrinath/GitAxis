export interface GitStatusInput {
  repositoryPath: string;
}

export interface GitDiffInput {
  repositoryPath: string;
  staged?: boolean;
  path?: string;
}

export interface GitAddInput {
  repositoryPath: string;
  paths: string[];
  all?: boolean;
}

export interface GitRestoreInput {
  repositoryPath: string;
  paths: string[];
  staged?: boolean;
}

export interface GitCommitInput {
  repositoryPath: string;
  message: string;
  amend?: boolean;
  signoff?: boolean;
}

export interface GitAmendInput {
  repositoryPath: string;
  message?: string;
  noEdit?: boolean;
}

export interface GitResetInput {
  repositoryPath: string;
  ref: string;
  mode: 'soft' | 'mixed' | 'hard';
}

export interface GitCreateBranchInput {
  repositoryPath: string;
  name: string;
  startPoint?: string;
  checkout?: boolean;
}

export interface GitDeleteBranchInput {
  repositoryPath: string;
  name: string;
  force?: boolean;
}

export interface GitRenameBranchInput {
  repositoryPath: string;
  oldName: string;
  newName: string;
}

export interface GitCheckoutInput {
  repositoryPath: string;
  ref: string;
  createBranch?: boolean;
}

export interface GitSwitchInput {
  repositoryPath: string;
  branch: string;
  create?: boolean;
}

export interface GitMergeInput {
  repositoryPath: string;
  branch: string;
  noFastForward?: boolean;
  squash?: boolean;
}

export interface GitRebaseInput {
  repositoryPath: string;
  onto: string;
  interactive?: boolean;
}

export interface GitFetchInput {
  repositoryPath: string;
  remote?: string;
  prune?: boolean;
  tags?: boolean;
}

export interface GitPullInput {
  repositoryPath: string;
  remote?: string;
  branch?: string;
  rebase?: boolean;
}

export interface GitPushInput {
  repositoryPath: string;
  remote?: string;
  branch?: string;
  setUpstream?: boolean;
  force?: boolean;
  forceWithLease?: boolean;
  tags?: boolean;
}

export interface GitCloneInput {
  url: string;
  destinationPath: string;
  branch?: string;
  depth?: number;
}

export interface GitInitInput {
  repositoryPath: string;
  bare?: boolean;
}

export interface GitStashCreateInput {
  repositoryPath: string;
  message?: string;
  includeUntracked?: boolean;
}

export interface GitStashApplyInput {
  repositoryPath: string;
  stash?: string;
}

export interface GitStashPopInput {
  repositoryPath: string;
  stash?: string;
}

export interface GitStashDropInput {
  repositoryPath: string;
  stash?: string;
}

export interface GitTagCreateInput {
  repositoryPath: string;
  name: string;
  target?: string;
  message?: string;
}

export interface GitTagDeleteInput {
  repositoryPath: string;
  name: string;
}

export interface GitRemoteAddInput {
  repositoryPath: string;
  name: string;
  url: string;
}

export interface GitRemoteRemoveInput {
  repositoryPath: string;
  name: string;
}

export interface GitRemoteSetUrlInput {
  repositoryPath: string;
  name: string;
  url: string;
  push?: boolean;
}

export interface GitLogInput {
  repositoryPath: string;
  maxCount?: number;
  branch?: string;
  path?: string;
}

export interface GitBlameInput {
  repositoryPath: string;
  path: string;
  startLine?: number;
  endLine?: number;
}

export interface GitHubAccountGetInput {
  host?: string;
}

export interface GitHubRepositoryGetInput {
  host?: string;
  owner: string;
  repository: string;
}

export interface GitHubRepositoryListInput {
  host?: string;
  owner?: string;
}

export interface GitHubRepositoryCreateInput {
  host?: string;
  name: string;
  description?: string;
  private?: boolean;
}

export interface GitHubRepositoryDeleteInput {
  host?: string;
  owner: string;
  repository: string;
}

export interface GitHubRepositoryForkInput {
  host?: string;
  owner: string;
  repository: string;
}

export interface GitHubIssueCreateInput {
  host?: string;
  owner?: string;
  repository?: string;
  title: string;
  body?: string;
  labels?: string[];
}

export interface GitHubIssueListInput {
  host?: string;
  owner?: string;
  repository?: string;
  state?: 'open' | 'closed' | 'all';
  labels?: string[];
}

export interface GitHubIssueCloseInput {
  host?: string;
  owner?: string;
  repository?: string;
  number: number;
}

export interface GitHubPullRequestCreateInput {
  host?: string;
  owner?: string;
  repository?: string;
  title: string;
  body?: string;
  head: string;
  base: string;
  draft?: boolean;
}

export interface GitHubPullRequestListInput {
  host?: string;
  owner?: string;
  repository?: string;
  state?: 'open' | 'closed' | 'all';
}

export interface GitHubPullRequestMergeInput {
  host?: string;
  owner?: string;
  repository?: string;
  number: number;
  method?: 'merge' | 'squash' | 'rebase';
  commitMessage?: string;
}

export interface GitHubActionsListInput {
  host?: string;
  owner?: string;
  repository?: string;
  workflow?: string;
  branch?: string;
  status?: string;
}

export interface GitHubReleaseCreateInput {
  host?: string;
  owner?: string;
  repository?: string;
  tag: string;
  name?: string;
  body?: string;
  draft?: boolean;
  prerelease?: boolean;
}

export interface GitHubReleaseListInput {
  host?: string;
  owner?: string;
  repository?: string;
  limit?: number;
}

export interface OperationInputMap {
  'git.status': GitStatusInput;
  'git.diff': GitDiffInput;
  'git.add': GitAddInput;
  'git.restore': GitRestoreInput;
  'git.commit': GitCommitInput;
  'git.amend': GitAmendInput;
  'git.reset': GitResetInput;
  'git.branch.create': GitCreateBranchInput;
  'git.branch.delete': GitDeleteBranchInput;
  'git.branch.rename': GitRenameBranchInput;
  'git.checkout': GitCheckoutInput;
  'git.switch': GitSwitchInput;
  'git.merge': GitMergeInput;
  'git.rebase': GitRebaseInput;
  'git.fetch': GitFetchInput;
  'git.pull': GitPullInput;
  'git.push': GitPushInput;
  'git.clone': GitCloneInput;
  'git.init': GitInitInput;
  'git.stash.create': GitStashCreateInput;
  'git.stash.apply': GitStashApplyInput;
  'git.stash.pop': GitStashPopInput;
  'git.stash.drop': GitStashDropInput;
  'git.tag.create': GitTagCreateInput;
  'git.tag.delete': GitTagDeleteInput;
  'git.remote.add': GitRemoteAddInput;
  'git.remote.remove': GitRemoteRemoveInput;
  'git.remote.set-url': GitRemoteSetUrlInput;
  'git.log': GitLogInput;
  'git.blame': GitBlameInput;

  'github.account.get': GitHubAccountGetInput;
  'github.repository.get': GitHubRepositoryGetInput;
  'github.repository.list': GitHubRepositoryListInput;
  'github.repository.create': GitHubRepositoryCreateInput;
  'github.repository.delete': GitHubRepositoryDeleteInput;
  'github.repository.fork': GitHubRepositoryForkInput;
  'github.issue.create': GitHubIssueCreateInput;
  'github.issue.list': GitHubIssueListInput;
  'github.issue.close': GitHubIssueCloseInput;
  'github.pull-request.create': GitHubPullRequestCreateInput;
  'github.pull-request.list': GitHubPullRequestListInput;
  'github.pull-request.merge': GitHubPullRequestMergeInput;
  'github.actions.list': GitHubActionsListInput;
  'github.release.create': GitHubReleaseCreateInput;
  'github.release.list': GitHubReleaseListInput;
}
