import * as assert from 'assert';
import { PersistentProfileStore } from '../src/profiles/profileStore';
import { AuthManager } from '../src/auth/authManager';
import { SecretStore } from '../src/auth/secretStore';
import { ProfileManager } from '../src/profiles/profileManager';
import { GitClient } from '../src/git/gitClient';
import { GitRemote } from '../src/contracts';

describe('Profile Credentials & Remote Synchronization', () => {
  let profileManager: ProfileManager;
  let secretStore: SecretStore;
  let authManager: AuthManager;
  let store: PersistentProfileStore;
  let localConfigs: Map<string, string>;
  let globalConfigs: Map<string, string>;
  let remotesMap: Map<string, GitRemote[]>;
  let setRemoteCalls: { repoPath: string; name: string; url: string; push?: boolean }[];

  beforeEach(() => {
    store = new PersistentProfileStore();
    secretStore = new SecretStore();
    authManager = new AuthManager(secretStore);

    localConfigs = new Map();
    globalConfigs = new Map();
    remotesMap = new Map();
    setRemoteCalls = [];

    const mockGitClient = new GitClient('git');

    // Stub git repo checks
    mockGitClient.isRepository = async (_repoPath: string) => true;
    mockGitClient.getRoot = async (repoPath: string) => repoPath;

    // Stub configs
    mockGitClient.setLocalConfig = async (_repoPath: string, key: string, value: string) => {
      localConfigs.set(key, value);
    };
    mockGitClient.getLocalConfig = async (_repoPath: string, key: string) => {
      return localConfigs.get(key);
    };
    mockGitClient.unsetLocalConfig = async (_repoPath: string, key: string) => {
      localConfigs.delete(key);
    };

    mockGitClient.setGlobalConfig = async (key: string, value: string) => {
      globalConfigs.set(key, value);
    };
    mockGitClient.getGlobalConfig = async (key: string) => {
      return globalConfigs.get(key);
    };
    mockGitClient.unsetGlobalConfig = async (key: string) => {
      globalConfigs.delete(key);
    };

    // Stub remotes
    mockGitClient.getRemotes = async (repoPath: string) => {
      return remotesMap.get(repoPath) || [];
    };
    mockGitClient.setRemoteUrl = async (repoPath: string, name: string, url: string, push?: boolean) => {
      setRemoteCalls.push({ repoPath, name, url, push });
    };

    profileManager = new ProfileManager(store, authManager, mockGitClient);
  });

  it('1. GCM Account Alignment: should configure credential.https://${host}.username in repo and global if global scope', async () => {
    const repoPath = 'C:/repos/project-1';

    // Local profile
    const localProfile = await profileManager.createProfile({
      name: 'work-local',
      git: { name: 'Work Dev', email: 'dev@work.com', scope: 'local' },
      github: { host: 'github.com', username: 'workdev' },
      authentication: { type: 'none' },
    });

    await profileManager.switchProfile(localProfile.id, repoPath);
    assert.strictEqual(localConfigs.get('credential.https://github.com.username'), 'workdev');
    assert.strictEqual(globalConfigs.get('credential.https://github.com.username'), undefined);

    // Global profile
    const globalProfile = await profileManager.createProfile({
      name: 'personal-global',
      git: { name: 'Personal Dev', email: 'dev@personal.com', scope: 'global' },
      github: { host: 'github.com', username: 'mshrnth' },
      authentication: { type: 'none' },
    });

    await profileManager.switchProfile(globalProfile.id, repoPath);
    assert.strictEqual(localConfigs.get('credential.https://github.com.username'), 'mshrnth');
    assert.strictEqual(globalConfigs.get('credential.https://github.com.username'), 'mshrnth');
  });

  it('2. PAT Token Authentication: should NOT persist PAT extraheader to git config and should unset any leftover extraheader', async () => {
    const repoPath = 'C:/repos/project-2';
    const testPat = 'ghp_secretTokenABC123';

    // Seed a leftover extraheader to verify it gets cleaned
    localConfigs.set('http.https://github.com/.extraheader', 'AUTHORIZATION: basic oldtoken');

    const patProfile = await profileManager.createProfile(
      {
        name: 'pat-user',
        git: { name: 'PAT User', email: 'pat@example.com' },
        github: { host: 'github.com', username: 'patuser' },
        authentication: { type: 'pat' },
      },
      testPat
    );

    await profileManager.switchProfile(patProfile.id, repoPath);

    // Section 1: Never persist PATs to .git/config
    assert.strictEqual(localConfigs.has('http.https://github.com/.extraheader'), false);
    assert.strictEqual(localConfigs.has('http.extraheader'), false);

    // Switch to profile without PAT
    const noPatProfile = await profileManager.createProfile({
      name: 'no-pat-user',
      git: { name: 'No PAT', email: 'nopat@example.com' },
      github: { host: 'github.com', username: 'nopatuser' },
      authentication: { type: 'none' },
    });

    await profileManager.switchProfile(noPatProfile.id, repoPath);
    assert.strictEqual(localConfigs.has('http.https://github.com/.extraheader'), false);
  });


  it('3. SSH Key Alignment: should configure core.sshCommand when sshKeyPath is provided and unset for non-SSH', async () => {
    const repoPath = 'C:/repos/project-3';

    const sshProfile = await profileManager.createProfile({
      name: 'ssh-user',
      git: { name: 'SSH Dev', email: 'ssh@example.com' },
      github: { host: 'github.com', username: 'sshdev' },
      authentication: {
        type: 'ssh',
        sshKeyPath: 'C:\\Users\\dev\\.ssh\\id_ed25519_custom',
      },
    });

    await profileManager.switchProfile(sshProfile.id, repoPath);
    assert.strictEqual(
      localConfigs.get('core.sshCommand'),
      'ssh -i "C:/Users/dev/.ssh/id_ed25519_custom"'
    );

    // Switch to non-SSH profile
    const nonSshProfile = await profileManager.createProfile({
      name: 'standard-user',
      git: { name: 'Standard Dev', email: 'std@example.com' },
      authentication: { type: 'none' },
    });

    await profileManager.switchProfile(nonSshProfile.id, repoPath);
    assert.strictEqual(localConfigs.has('core.sshCommand'), false);
  });

  it('4. Remote URL Synchronization: should update HTTPS remote URL to embed profile username', async () => {
    const repoPath = 'C:/repos/project-4';

    remotesMap.set(repoPath, [
      {
        name: 'origin',
        fetchUrl: 'https://MShrinath@github.com/mshrnth/my-project.git',
        pushUrl: 'https://MShrinath@github.com/mshrnth/my-project.git',
        host: 'github.com',
        owner: 'mshrnth',
        repository: 'my-project',
      },
      {
        name: 'ssh-remote',
        fetchUrl: 'git@github.com:mshrnth/my-project.git',
        pushUrl: 'git@github.com:mshrnth/my-project.git',
        host: 'github.com',
        owner: 'mshrnth',
        repository: 'my-project',
      },
      {
        name: 'gitlab',
        fetchUrl: 'https://gitlab.com/mshrnth/my-project.git',
        pushUrl: 'https://gitlab.com/mshrnth/my-project.git',
        host: 'gitlab.com',
        owner: 'mshrnth',
        repository: 'my-project',
      },
    ]);

    const activeProfile = await profileManager.createProfile({
      name: 'target-profile',
      git: { name: 'Shrinath M', email: 'shrinath@test.com' },
      github: { host: 'github.com', username: 'mshrnth' },
      authentication: { type: 'none' },
    });

    await profileManager.switchProfile(activeProfile.id, repoPath);

    // Check setRemoteCalls
    assert.strictEqual(setRemoteCalls.length, 1);
    assert.strictEqual(setRemoteCalls[0].name, 'origin');
    assert.strictEqual(setRemoteCalls[0].url, 'https://mshrnth@github.com/mshrnth/my-project.git');

    // SSH and GitLab remotes must not be touched
    const touchedNames = setRemoteCalls.map(c => c.name);
    assert.strictEqual(touchedNames.includes('ssh-remote'), false);
    assert.strictEqual(touchedNames.includes('gitlab'), false);
  });

  it('5. Edge Case: should handle non-git directory gracefully without throwing', async () => {
    const nonGitPath = 'C:/non-git-folder';
    const profile = await profileManager.createProfile({
      name: 'test-nongit',
      git: { name: 'Dev', email: 'dev@test.com' },
      github: { host: 'github.com', username: 'dev' },
      authentication: { type: 'none' },
    });

    // Mock isRepository returning false for this path and setLocalConfig throwing
    const originalIsRepo = profileManager['gitClient'].isRepository;
    const originalSetLocal = profileManager['gitClient'].setLocalConfig;
    profileManager['gitClient'].isRepository = async (p: string) => p !== nonGitPath;
    profileManager['gitClient'].setLocalConfig = async (p: string, k: string, v: string) => {
      if (p === nonGitPath) {
        throw new Error('fatal: not a git repository');
      }
      return originalSetLocal.call(profileManager['gitClient'], p, k, v);
    };

    await assert.doesNotReject(async () => {
      await profileManager.switchProfile(profile.id, nonGitPath);
    });

    profileManager['gitClient'].isRepository = originalIsRepo;
    profileManager['gitClient'].setLocalConfig = originalSetLocal;
  });

  it('6. Edge Case: should handle custom enterprise host and distinct pushurl', async () => {
    const repoPath = 'C:/repos/corp-project';
    const enterpriseHost = 'github.enterprise.corp';

    remotesMap.set(repoPath, [
      {
        name: 'origin',
        fetchUrl: `https://${enterpriseHost}/org/repo.git`,
        pushUrl: `https://${enterpriseHost}/org/repo.git`,
        host: enterpriseHost,
        owner: 'org',
        repository: 'repo',
      },
    ]);

    const profile = await profileManager.createProfile({
      name: 'corp-user',
      git: { name: 'Corp Dev', email: 'corp@enterprise.com' },
      github: { host: enterpriseHost, username: 'corpdev' },
      authentication: {
        type: 'ssh',
        sshKeyPath: 'ssh -i /path/to/key -o IdentitiesOnly=yes',
      },
    });

    await profileManager.switchProfile(profile.id, repoPath);

    assert.strictEqual(localConfigs.get(`credential.https://${enterpriseHost}.username`), 'corpdev');
    assert.strictEqual(localConfigs.get('core.sshCommand'), 'ssh -i /path/to/key -o IdentitiesOnly=yes');
    assert.strictEqual(setRemoteCalls.length, 1);
    assert.strictEqual(setRemoteCalls[0].url, `https://corpdev@${enterpriseHost}/org/repo.git`);
  });

  it('7. Edge Case: should NOT overwrite SSH push URL when fetch URL is HTTPS', async () => {
    const repoPath = 'C:/repos/mixed-remote';

    remotesMap.set(repoPath, [
      {
        name: 'origin',
        fetchUrl: 'https://github.com/myorg/myrepo.git',
        pushUrl: 'git@github.com:myorg/myrepo.git',
        host: 'github.com',
        owner: 'myorg',
        repository: 'myrepo',
      },
    ]);

    const profile = await profileManager.createProfile({
      name: 'hybrid-user',
      git: { name: 'Hybrid Dev', email: 'dev@hybrid.com' },
      github: { host: 'github.com', username: 'hybriddev' },
      authentication: { type: 'none' },
    });

    await profileManager.switchProfile(profile.id, repoPath);

    // Fetch URL should be updated
    const fetchCall = setRemoteCalls.find(c => c.name === 'origin' && !c.push);
    assert.ok(fetchCall);
    assert.strictEqual(fetchCall.url, 'https://hybriddev@github.com/myorg/myrepo.git');

    // Push URL (SSH) should NOT have been updated
    const pushCall = setRemoteCalls.find(c => c.name === 'origin' && c.push);
    assert.strictEqual(pushCall, undefined);
  });

  it('8. Edge Case: should expand tilde (~) in sshKeyPath to home directory', async () => {
    const repoPath = 'C:/repos/ssh-tilde-project';

    const profile = await profileManager.createProfile({
      name: 'tilde-ssh-user',
      git: { name: 'Tilde Dev', email: 'tilde@dev.com' },
      authentication: {
        type: 'ssh',
        sshKeyPath: '~/.ssh/id_custom',
      },
    });

    await profileManager.switchProfile(profile.id, repoPath);

    const configuredCmd = localConfigs.get('core.sshCommand');
    assert.ok(configuredCmd);
    assert.ok(!configuredCmd.includes('~'), 'sshCommand should not contain raw tilde (~)');
    assert.ok(configuredCmd.includes('/.ssh/id_custom') || configuredCmd.includes('\\.ssh\\id_custom'));
  });

  it('9. Edge Case: should unset GCM username when switching to a profile without github username', async () => {
    const repoPath = 'C:/repos/gcm-unset-project';

    const ghProfile = await profileManager.createProfile({
      name: 'gh-user',
      git: { name: 'GH Dev', email: 'gh@dev.com' },
      github: { host: 'github.com', username: 'ghuser' },
      authentication: { type: 'none' },
    });

    await profileManager.switchProfile(ghProfile.id, repoPath);
    assert.strictEqual(localConfigs.get('credential.https://github.com.username'), 'ghuser');

    // Switch to profile without github username
    const localOnlyProfile = await profileManager.createProfile({
      name: 'local-only',
      git: { name: 'Local Dev', email: 'local@dev.com' },
      authentication: { type: 'none' },
    });

    await profileManager.switchProfile(localOnlyProfile.id, repoPath);
    assert.strictEqual(localConfigs.has('credential.https://github.com.username'), false);
  });

  it('10. Edge Case: should preserve custom port and normalize host with protocol', async () => {
    const repoPath = 'C:/repos/custom-port-project';
    const enterpriseHost = 'git.corp.net:8443';

    remotesMap.set(repoPath, [
      {
        name: 'origin',
        fetchUrl: `https://${enterpriseHost}/mygroup/myrepo.git`,
        pushUrl: `https://${enterpriseHost}/mygroup/myrepo.git`,
        host: 'git.corp.net',
        owner: 'mygroup',
        repository: 'myrepo',
      },
    ]);

    const profile = await profileManager.createProfile({
      name: 'port-user',
      git: { name: 'Port Dev', email: 'port@corp.com' },
      github: { host: 'https://git.corp.net:8443/', username: 'portdev' },
      authentication: { type: 'none' },
    });

    await profileManager.switchProfile(profile.id, repoPath);

    assert.strictEqual(localConfigs.get('credential.https://git.corp.net:8443.username'), 'portdev');
    const fetchCall = setRemoteCalls.find(c => c.name === 'origin' && !c.push);
    assert.ok(fetchCall);
    assert.strictEqual(fetchCall.url, 'https://portdev@git.corp.net:8443/mygroup/myrepo.git');
  });
});
