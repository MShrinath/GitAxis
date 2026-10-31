import * as assert from 'assert';
import { PersistentProfileStore } from '../src/profiles/profileStore';

describe('PersistentProfileStore', () => {
  let store: PersistentProfileStore;

  beforeEach(() => {
    store = new PersistentProfileStore();
  });

  it('should create and retrieve a profile', async () => {
    const created = await store.create({
      name: 'work',
      git: { name: 'Work User', email: 'work@company.com' },
      github: { username: 'work-user', host: 'github.com' },
      authentication: { type: 'pat' },
    });

    assert.strictEqual(created.name, 'work');
    assert.strictEqual(created.git.email, 'work@company.com');
    assert.strictEqual(created.authentication.secretRef?.provider, 'vscode-secret-storage');

    const retrieved = await store.get(created.id);
    assert.ok(retrieved);
    assert.strictEqual(retrieved?.name, 'work');

    const active = await store.getActive();
    assert.strictEqual(active?.id, created.id);
  });

  it('should reject duplicate profile names', async () => {
    await store.create({
      name: 'personal',
      git: { name: 'Personal User', email: 'user@gmail.com' },
      authentication: { type: 'none' },
    });

    await assert.rejects(
      async () => {
        await store.create({
          name: 'personal',
          git: { name: 'Another User', email: 'another@gmail.com' },
          authentication: { type: 'none' },
        });
      },
      /already exists/
    );
  });

  it('should update profile and handle active profile switching', async () => {
    const p1 = await store.create({
      name: 'p1',
      git: { name: 'User 1', email: 'u1@test.com' },
      authentication: { type: 'none' },
    });

    const p2 = await store.create({
      name: 'p2',
      git: { name: 'User 2', email: 'u2@test.com' },
      authentication: { type: 'none' },
    });

    await store.setActive(p2.id);
    const active = await store.getActive();
    assert.strictEqual(active?.id, p2.id);

    const updated = await store.update(p1.id, {
      name: 'p1-updated',
      git: { email: 'u1-new@test.com' },
      github: { host: 'github.com', username: 'u1-gh' },
    });
    assert.strictEqual(updated.name, 'p1-updated');
    assert.strictEqual(updated.git.email, 'u1-new@test.com');
    assert.strictEqual(updated.github?.username, 'u1-gh');

    const clearedGh = await store.update(p1.id, {
      github: { username: '' },
    });
    assert.strictEqual(clearedGh.github, undefined);
  });

  it('should manage repository associations', async () => {
    const p1 = await store.create({
      name: 'client-a',
      git: { name: 'Client A', email: 'client@a.com' },
      authentication: { type: 'none' },
    });

    const repoPath = 'C:/Projects/ClientA-Repo';
    await store.setAssociation(repoPath, p1.id);

    const associatedId = await store.getAssociation(repoPath);
    assert.strictEqual(associatedId, p1.id);

    // Deleting profile removes association
    await store.delete(p1.id);
    const afterDeleteAssoc = await store.getAssociation(repoPath);
    assert.strictEqual(afterDeleteAssoc, undefined);
  });

  it('should support renaming a profile and reject colliding names', async () => {
    const alpha = await store.create({
      name: 'alpha',
      git: { name: 'Alpha', email: 'alpha@test.com' },
      authentication: { type: 'none' },
    });

    const beta = await store.create({
      name: 'beta',
      git: { name: 'Beta', email: 'beta@test.com' },
      authentication: { type: 'none' },
    });

    // Renaming alpha to beta should fail
    await assert.rejects(
      async () => {
        await store.update(alpha.id, { name: 'beta' });
      },
      /already exists/
    );

    // Renaming alpha to gamma should succeed
    const renamed = await store.update(alpha.id, { name: 'gamma' });
    assert.strictEqual(renamed.name, 'gamma');

    const fetched = await store.get(alpha.id);
    assert.strictEqual(fetched?.name, 'gamma');
  });
});
