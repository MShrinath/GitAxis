import * as assert from 'assert';
import { SecretStore } from '../src/auth/secretStore';
import { AuthManager } from '../src/auth/authManager';
import { GitProfile } from '../src/contracts';

describe('AuthManager & SecretStore', () => {
  let secretStore: SecretStore;
  let authManager: AuthManager;

  beforeEach(() => {
    secretStore = new SecretStore();
    authManager = new AuthManager(secretStore);
  });

  it('should store and resolve PAT token securely', async () => {
    const profile: GitProfile = {
      id: 'profile-test-1',
      name: 'pat-profile',
      git: { name: 'Test', email: 'test@example.com', scope: 'local' },
      github: { host: 'github.com', username: 'testuser' },
      authentication: {
        type: 'pat',
        secretRef: { provider: 'vscode-secret-storage', key: 'gitaxis.profile.profile-test-1.github-token' },
      },
      metadata: { source: 'manual' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await authManager.saveTokenForProfile(profile.id, 'ghp_secretToken1234567890abcdef');

    const resolved = await authManager.resolveAuthentication(profile);
    assert.strictEqual(resolved.type, 'pat');
    assert.strictEqual(resolved.username, 'testuser');
    assert.strictEqual(resolved.credential, 'ghp_secretToken1234567890abcdef');

    // Clean up
    await authManager.clearAuthForProfile(profile.id);
    const resolvedAfterClear = await authManager.resolveAuthentication(profile);
    assert.strictEqual(resolvedAfterClear.credential, undefined);
  });
});
