import * as assert from 'assert';
import { OperationManager } from '../src/operations/operationManager';
import { PersistentProfileStore } from '../src/profiles/profileStore';
import { AuthManager } from '../src/auth/authManager';
import { SecretStore } from '../src/auth/secretStore';
import { ProfileManager } from '../src/profiles/profileManager';
import { GitClient } from '../src/git/gitClient';
import { createOperation } from '../src/contracts';

describe('OperationManager Lifecycle', () => {
  let opManager: OperationManager;
  let profileManager: ProfileManager;
  let mockGitClient: GitClient;

  beforeEach(async () => {
    const store = new PersistentProfileStore();
    const secretStore = new SecretStore();
    const authManager = new AuthManager(secretStore);
    mockGitClient = new GitClient('git');

    // Stub gitClient exec for testing
    mockGitClient.exec = async (args: string[]) => {
      if (args[0] === 'status') {
        return { stdout: '', stderr: '' };
      }
      return { stdout: 'ok', stderr: '' };
    };

    profileManager = new ProfileManager(store, authManager, mockGitClient);
    await profileManager.createProfile({
      name: 'work',
      git: { name: 'Work User', email: 'work@test.com' },
      authentication: { type: 'none' },
    });

    opManager = new OperationManager(profileManager, mockGitClient);
  });

  it('should validate inputs and reject missing repository path for local git operations', async () => {
    const op = createOperation({
      id: 'op-invalid',
      type: 'git.status',
      input: { repositoryPath: '' },
      target: { kind: 'local-repository', path: '' },
      safety: 'read-only',
      confirmation: { required: false },
      createdAt: new Date().toISOString(),
      initiatedBy: 'activity-bar',
    });

    const res = await opManager.execute(op);
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error?.code, 'INVALID_INPUT');
  });

  it('should cancel destructive operations if confirmation is declined', async () => {
    opManager.getConfirmationHandler().setPromptFn(async () => false);

    const op = createOperation({
      id: 'op-force-push',
      type: 'git.push',
      input: { repositoryPath: '/path', force: true },
      target: { kind: 'remote', remoteName: 'origin' },
      safety: 'mutating',
      confirmation: { required: false },
      createdAt: new Date().toISOString(),
      initiatedBy: 'command-palette',
    });

    const res = await opManager.execute(op);
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error?.code, 'OPERATION_CANCELLED');
  });

  it('should successfully execute valid operation and record history', async () => {
    const op = createOperation({
      id: 'op-status',
      type: 'git.status',
      input: { repositoryPath: '/workspace' },
      target: { kind: 'local-repository', path: '/workspace' },
      safety: 'read-only',
      confirmation: { required: false },
      createdAt: new Date().toISOString(),
      initiatedBy: 'activity-bar',
    });

    const res = await opManager.execute(op);
    assert.strictEqual(res.success, true);
    assert.ok(res.data);

    const history = opManager.getHistoryRecords();
    assert.strictEqual(history.length, 1);
    assert.strictEqual(history[0].state, 'succeeded');
  });

  it('should enrich force push confirmation with profile, repository, and branch info', async () => {
    let capturedWarning: string | undefined;
    opManager.getConfirmationHandler().setPromptFn(async (_reason, warning) => {
      capturedWarning = warning;
      return true;
    });

    const op = createOperation({
      id: 'op-fp-enrich',
      type: 'git.push',
      input: { repositoryPath: '/path/to/my-repo', branch: 'feature-1', force: true },
      target: { kind: 'remote', remoteName: 'origin' },
      safety: 'destructive',
      confirmation: { required: true, reason: 'Force push' },
      createdAt: new Date().toISOString(),
      initiatedBy: 'command-palette',
    });

    const res = await opManager.execute(op);
    assert.strictEqual(res.success, true);
    assert.ok(capturedWarning);
    assert.ok(capturedWarning?.includes('Profile: work'));
    assert.ok(capturedWarning?.includes('Repository: my-repo'));
    assert.ok(capturedWarning?.includes('Branch: feature-1'));
  });

  it('should prompt and cancel operation when remote profile mismatch prompt returns cancel', async () => {
    // Add remote to mockGitClient
    mockGitClient.getRemotes = async () => [
      { name: 'origin', url: 'https://github.com/company/repo.git', owner: 'company', repository: 'repo' },
    ];

    // Set active profile github username to 'personal-user'
    await profileManager.createProfile({
      name: 'personal',
      git: { name: 'Personal User', email: 'personal@test.com' },
      github: { host: 'github.com', username: 'personal-user' },
      authentication: { type: 'none' },
    });
    const personal = (await profileManager.getProfiles()).find(p => p.name === 'personal');
    if (personal) await profileManager.switchProfile(personal.id);

    let promptCalled = false;
    opManager.setProfileMismatchPrompt(async (active, remoteOwner) => {
      promptCalled = true;
      assert.strictEqual(active.name, 'personal');
      assert.strictEqual(remoteOwner, 'company');
      return 'cancel';
    });

    const op = createOperation({
      id: 'op-mismatch',
      type: 'git.push',
      input: { repositoryPath: '/path/to/repo', remote: 'origin' },
      target: { kind: 'remote', remoteName: 'origin' },
      safety: 'mutating',
      confirmation: { required: false },
      createdAt: new Date().toISOString(),
      initiatedBy: 'command-palette',
    });

    const res = await opManager.execute(op);
    assert.strictEqual(promptCalled, true);
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error?.code, 'OPERATION_CANCELLED');
  });

  it('should execute git.tag.create and git.diff operations successfully', async () => {
    let capturedArgs: string[] = [];
    mockGitClient.exec = async (args: string[]) => {
      capturedArgs = args;
      if (args[0] === 'diff') return { stdout: 'diff --git a b', stderr: '' };
      return { stdout: '', stderr: '' };
    };

    const tagOp = createOperation({
      id: 'op-tag',
      type: 'git.tag.create',
      input: { repositoryPath: '/workspace', name: 'v1.0.0', message: 'Release v1.0' },
      target: { kind: 'local-repository', path: '/workspace' },
      safety: 'mutating',
      confirmation: { required: false },
      createdAt: new Date().toISOString(),
      initiatedBy: 'command-palette',
    });

    const tagRes = await opManager.execute(tagOp);
    assert.strictEqual(tagRes.success, true);
    assert.deepStrictEqual(capturedArgs, ['tag', '-a', 'v1.0.0', '-m', 'Release v1.0']);

    const diffOp = createOperation({
      id: 'op-diff',
      type: 'git.diff',
      input: { repositoryPath: '/workspace', staged: true },
      target: { kind: 'local-repository', path: '/workspace' },
      safety: 'read-only',
      confirmation: { required: false },
      createdAt: new Date().toISOString(),
      initiatedBy: 'command-palette',
    });

    const diffRes = await opManager.execute<string>(diffOp);
    assert.strictEqual(diffRes.success, true);
    assert.strictEqual(diffRes.data, 'diff --git a b');
  });
});
