import * as assert from 'assert';
import { PersistentProfileStore } from '../src/profiles/profileStore';
import { ProfileMatcher } from '../src/profiles/profileMatcher';
import { GitRemote } from '../src/contracts';

describe('ProfileMatcher', () => {
  let store: PersistentProfileStore;
  let matcher: ProfileMatcher;

  beforeEach(async () => {
    store = new PersistentProfileStore();
    matcher = new ProfileMatcher(store);

    await store.create({
      name: 'work',
      git: { name: 'Work User', email: 'work@company.com' },
      github: { username: 'company-org', host: 'github.com' },
      authentication: { type: 'none' },
    });

    await store.create({
      name: 'personal',
      git: { name: 'Personal User', email: 'personal@gmail.com' },
      github: { username: 'my-personal', host: 'github.com' },
      authentication: { type: 'none' },
    });
  });

  it('should recommend associated profile with exact confidence', async () => {
    const work = (await store.list()).find(p => p.name === 'work')!;
    const repoPath = '/workspace/custom-project';
    await store.setAssociation(repoPath, work.id);

    const match = await matcher.match({
      repositoryPath: repoPath,
    });

    assert.strictEqual(match.confidence, 'exact');
    assert.strictEqual(match.recommendedProfileId, work.id);
    assert.deepStrictEqual(match.reasons, ['repository-association']);
  });

  it('should match profile by remote owner and host', async () => {
    const work = (await store.list()).find(p => p.name === 'work')!;
    const remotes: GitRemote[] = [
      {
        name: 'origin',
        host: 'github.com',
        owner: 'company-org',
        repository: 'backend-service',
      },
    ];

    const match = await matcher.match({
      remotes,
    });

    assert.strictEqual(match.confidence, 'high');
    assert.strictEqual(match.recommendedProfileId, work.id);
    assert.ok(match.reasons.includes('remote-owner'));
  });

  it('should match profile by git email', async () => {
    const personal = (await store.list()).find(p => p.name === 'personal')!;

    const match = await matcher.match({
      localGitEmail: 'personal@gmail.com',
    });

    assert.strictEqual(match.recommendedProfileId, personal.id);
    assert.ok(match.reasons.includes('git-email'));
  });

  it('should return none when no match exists', async () => {
    const match = await matcher.match({
      localGitEmail: 'stranger@nowhere.com',
      remotes: [{ name: 'origin', host: 'gitlab.com', owner: 'stranger', repository: 'repo' }],
    });

    assert.strictEqual(match.confidence, 'none');
    assert.deepStrictEqual(match.reasons, ['no-match']);
  });

  it('should escape regex special characters in org wildcards', async () => {
    const orgProfile = await store.create({
      name: 'dot-org',
      git: { name: 'Dot Org User', email: 'dot@my.org.com' },
      github: { host: 'github.com', username: 'dot-org-user', orgs: ['my.org*'] },
      authentication: { type: 'none' },
    });

    // my.org-team should match
    const match1 = await matcher.match({
      remotes: [{ name: 'origin', host: 'github.com', owner: 'my.org-team', repository: 'repo' }],
    });
    assert.strictEqual(match1.recommendedProfileId, orgProfile.id);

    // myxorg should NOT match (unintended match if dot was unescaped)
    const match2 = await matcher.match({
      remotes: [{ name: 'origin', host: 'github.com', owner: 'myxorg', repository: 'repo' }],
    });
    assert.notStrictEqual(match2.recommendedProfileId, orgProfile.id);

    const qmarkProfile = await store.create({
      name: 'qmark-org',
      git: { name: 'QMark User', email: 'qmark@test.com' },
      github: { host: 'github.com', username: 'qmark-user', orgs: ['org?team*'] },
      authentication: { type: 'none' },
    });

    // org?team-1 should match
    const match3 = await matcher.match({
      remotes: [{ name: 'origin', host: 'github.com', owner: 'org?team-1', repository: 'repo' }],
    });
    assert.strictEqual(match3.recommendedProfileId, qmarkProfile.id);

    // orteam-1 should NOT match (unintended match if ? was unescaped quantifier)
    const match4 = await matcher.match({
      remotes: [{ name: 'origin', host: 'github.com', owner: 'orteam-1', repository: 'repo' }],
    });
    assert.notStrictEqual(match4.recommendedProfileId, qmarkProfile.id);
  });
});
