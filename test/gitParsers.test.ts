import * as assert from 'assert';
import { RemoteParser } from '../src/git/remote';
import { RepositoryParser } from '../src/git/repository';
import { BranchParser } from '../src/git/branch';
import { CommitParser } from '../src/git/commit';
import { StashParser } from '../src/git/stash';
import { TagParser } from '../src/git/tag';

describe('Git Parsers', () => {
  it('should parse HTTPS and SSH remote URLs correctly', () => {
    const httpsRemote = RemoteParser.parse('origin', 'https://github.com/facebook/react.git');
    assert.strictEqual(httpsRemote.host, 'github.com');
    assert.strictEqual(httpsRemote.owner, 'facebook');
    assert.strictEqual(httpsRemote.repository, 'react');

    const sshRemote = RemoteParser.parse('origin', 'git@github.com:vercel/next.js.git');
    assert.strictEqual(sshRemote.host, 'github.com');
    assert.strictEqual(sshRemote.owner, 'vercel');
    assert.strictEqual(sshRemote.repository, 'next.js');

    const customEnterprise = RemoteParser.parse('origin', 'https://github.myenterprise.com/corp/app');
    assert.strictEqual(customEnterprise.host, 'github.myenterprise.com');
    assert.strictEqual(customEnterprise.owner, 'corp');
    assert.strictEqual(customEnterprise.repository, 'app');
  });

  it('should parse git status porcelain v1 and v2 formats', () => {
    const v1Output = `
 M file1.ts
M  file2.ts
?? untracked.txt
UU conflict.ts
`;
    const v1Status = RepositoryParser.parseStatus(v1Output);
    assert.strictEqual(v1Status.clean, false);
    assert.strictEqual(v1Status.staged, 1);
    assert.strictEqual(v1Status.modified, 1);
    assert.strictEqual(v1Status.untracked, 1);
    assert.strictEqual(v1Status.conflicted, 1);

    const v2Output = `
# branch.oid 123456
# branch.head main
# branch.ab +3 -1
1 M. N... 100644 100644 100644 abc def file1.ts
1 .M N... 100644 100644 100644 abc def file2.ts
? file3.ts
`;
    const v2Status = RepositoryParser.parseStatus(v2Output);
    assert.strictEqual(v2Status.ahead, 3);
    assert.strictEqual(v2Status.behind, 1);
    assert.strictEqual(v2Status.staged, 1);
    assert.strictEqual(v2Status.modified, 1);
    assert.strictEqual(v2Status.untracked, 1);
  });

  it('should parse branch list output', () => {
    const output = `
* main
  feature/login
  bugfix/fix-header
`;
    const branches = BranchParser.parseBranchList(output);
    assert.strictEqual(branches.length, 3);
    assert.strictEqual(branches[0].name, 'main');
    assert.strictEqual(branches[0].isCurrent, true);
    assert.strictEqual(branches[1].name, 'feature/login');
    assert.strictEqual(branches[1].isCurrent, false);
  });

  it('should parse stash list output', () => {
    const output = `
stash@{0}: WIP on main: 1a2b3c4 Initial commit
stash@{1}: On feature: save work
`;
    const stashes = StashParser.parseStashList(output);
    assert.strictEqual(stashes.length, 2);
    assert.strictEqual(stashes[0].index, 0);
    assert.strictEqual(stashes[0].ref, 'stash@{0}');
    assert.strictEqual(stashes[1].index, 1);
  });

  it('should parse tag list output', () => {
    const output = `
v1.0.0
v1.0.1
v2.0.0-beta
`;
    const tags = TagParser.parseTagList(output);
    assert.strictEqual(tags.length, 3);
    assert.strictEqual(tags[0].name, 'v1.0.0');
  });

  it('should parse commit log output', () => {
    const output = `hash1\x1fAlice\x1falice@test.com\x1f2026-10-31T00:00:00Z\x1ffeat: add feature\x1ehash2\x1fBob\x1fbob@test.com\x1f2026-10-30T00:00:00Z\x1ffix: resolve bug\x1e`;
    const commits = CommitParser.parseLog(output);
    assert.strictEqual(commits.length, 2);
    assert.strictEqual(commits[0].author, 'Alice');
    assert.strictEqual(commits[0].message, 'feat: add feature');
    assert.strictEqual(commits[1].author, 'Bob');
  });
});
