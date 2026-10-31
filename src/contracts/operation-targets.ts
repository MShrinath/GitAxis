import { RepositoryId } from './common';

export interface LocalRepositoryTarget {
  kind: 'local-repository';
  repositoryId?: RepositoryId;
  path: string;
}

export interface RemoteTarget {
  kind: 'remote';
  repositoryId?: RepositoryId;
  remoteName: string;
  url?: string;
}

export interface GitHubRepositoryTarget {
  kind: 'github-repository';
  host: string;
  owner: string;
  repository: string;
}

export interface GitHubPullRequestTarget {
  kind: 'github-pull-request';
  host: string;
  owner: string;
  repository: string;
  number: number;
}

export interface GitHubIssueTarget {
  kind: 'github-issue';
  host: string;
  owner: string;
  repository: string;
  number: number;
}

export interface NoneTarget {
  kind: 'none';
}

export type OperationTarget =
  | LocalRepositoryTarget
  | RemoteTarget
  | GitHubRepositoryTarget
  | GitHubPullRequestTarget
  | GitHubIssueTarget
  | NoneTarget;

export interface OperationTargetMap {
  'git.status': LocalRepositoryTarget;
  'git.diff': LocalRepositoryTarget;
  'git.add': LocalRepositoryTarget;
  'git.restore': LocalRepositoryTarget;
  'git.commit': LocalRepositoryTarget;
  'git.amend': LocalRepositoryTarget;
  'git.reset': LocalRepositoryTarget;

  'git.branch.create': LocalRepositoryTarget;
  'git.branch.delete': LocalRepositoryTarget;
  'git.branch.rename': LocalRepositoryTarget;

  'git.checkout': LocalRepositoryTarget;
  'git.switch': LocalRepositoryTarget;
  'git.merge': LocalRepositoryTarget;
  'git.rebase': LocalRepositoryTarget;

  'git.fetch': RemoteTarget;
  'git.pull': RemoteTarget;
  'git.push': RemoteTarget;

  'git.clone': NoneTarget;
  'git.init': NoneTarget;

  'git.stash.create': LocalRepositoryTarget;
  'git.stash.apply': LocalRepositoryTarget;
  'git.stash.pop': LocalRepositoryTarget;
  'git.stash.drop': LocalRepositoryTarget;

  'git.tag.create': LocalRepositoryTarget;
  'git.tag.delete': LocalRepositoryTarget;

  'git.remote.add': LocalRepositoryTarget;
  'git.remote.remove': LocalRepositoryTarget;
  'git.remote.set-url': LocalRepositoryTarget;

  'git.log': LocalRepositoryTarget;
  'git.blame': LocalRepositoryTarget;

  'github.account.get': NoneTarget;
  'github.repository.get': GitHubRepositoryTarget;
  'github.repository.list': NoneTarget;
  'github.repository.create': NoneTarget;
  'github.repository.delete': GitHubRepositoryTarget;
  'github.repository.fork': GitHubRepositoryTarget;

  'github.issue.create': GitHubRepositoryTarget;
  'github.issue.list': GitHubRepositoryTarget;
  'github.issue.close': GitHubIssueTarget;

  'github.pull-request.create': GitHubRepositoryTarget;
  'github.pull-request.list': GitHubRepositoryTarget;
  'github.pull-request.merge': GitHubPullRequestTarget;

  'github.actions.list': GitHubRepositoryTarget;

  'github.release.create': GitHubRepositoryTarget;
  'github.release.list': GitHubRepositoryTarget;
}
