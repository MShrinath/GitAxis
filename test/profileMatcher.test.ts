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
});
