import * as assert from 'assert';
import { createOperation, Operation } from '../src/contracts';

describe('Contracts & Type Safety', () => {
  it('should construct a strongly typed git.push operation', () => {
    const op: Operation = createOperation({
      id: 'op-123',
      type: 'git.push',
      input: {
        repositoryPath: '/mock/repo',
        remote: 'origin',
        branch: 'main',
        force: false,
      },
      target: {
        kind: 'remote',
        remoteName: 'origin',
      },
      safety: 'mutating',
      confirmation: { required: false },
      createdAt: new Date().toISOString(),
      initiatedBy: 'activity-bar',
    });

    assert.strictEqual(op.type, 'git.push');
    assert.strictEqual(op.target.kind, 'remote');
    assert.strictEqual(op.input.branch, 'main');
  });

  it('should construct a strongly typed git.status operation', () => {
    const op = createOperation({
      id: 'op-456',
      type: 'git.status',
      input: {
        repositoryPath: '/mock/repo',
      },
      target: {
        kind: 'local-repository',
        path: '/mock/repo',
      },
      safety: 'read-only',
      confirmation: { required: false },
      createdAt: new Date().toISOString(),
      initiatedBy: 'command-palette',
    });

    assert.strictEqual(op.type, 'git.status');
    assert.strictEqual(op.target.kind, 'local-repository');
    assert.strictEqual(op.safety, 'read-only');
  });
});
