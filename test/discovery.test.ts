import * as assert from 'assert';
import { SystemDiscovery } from '../src/discovery/systemDiscovery';
import { GitClient } from '../src/git/gitClient';
import { SystemDiscoveryResult } from '../src/contracts';

describe('SystemDiscovery & Suggestions', () => {
  it('should generate profile suggestions from GitHub CLI accounts and Git config', () => {
    const gitClient = new GitClient('git');
    const discovery = new SystemDiscovery(gitClient);

    const scanResult: SystemDiscoveryResult = {
      git: { found: true, version: 'git version 2.40.0' },
      gitConfig: {
        userName: 'John Doe',
        userEmail: 'john@company.com',
        credentialHelpers: ['manager'],
      },
      githubCli: {
        found: true,
        version: 'gh version 2.30.0',
        accounts: [
          {
            username: 'johndoe-gh',
            host: 'github.com',
            active: true,
            authStatusOk: true,
          },
        ],
      },
      credentialHelper: {
        helpers: ['manager'],
        hasGCM: true,
      },
      timestamp: new Date().toISOString(),
    };

    const suggestions = discovery.suggestProfiles(scanResult);
    assert.ok(suggestions.length >= 1);

    const ghSuggestion = suggestions.find(s => s.name === 'johndoe-gh');
    assert.ok(ghSuggestion);
    assert.strictEqual(ghSuggestion?.github?.username, 'johndoe-gh');
    assert.strictEqual(ghSuggestion?.authentication.type, 'github-cli');
    assert.strictEqual(ghSuggestion?.imported, true);
  });
});
