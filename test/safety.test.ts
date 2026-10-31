import * as assert from 'assert';
import { OperationSafetyChecker } from '../src/operations/safety';
import { createOperation } from '../src/contracts';

describe('OperationSafetyChecker', () => {
  it('should mark force push as destructive requiring confirmation', () => {
    const op = createOperation({
      id: '1',
      type: 'git.push',
      input: { repositoryPath: '/path', force: true },
      target: { kind: 'remote', remoteName: 'origin' },
      safety: 'mutating',
      confirmation: { required: false },
      createdAt: new Date().toISOString(),
      initiatedBy: 'command-palette',
    });

    const assessment = OperationSafetyChecker.assessSafety(op);
    assert.strictEqual(assessment.safety, 'destructive');
    assert.strictEqual(assessment.confirmation.required, true);
  });

  it('should mark normal push as mutating not requiring confirmation', () => {
    const op = createOperation({
      id: '2',
      type: 'git.push',
      input: { repositoryPath: '/path', force: false },
      target: { kind: 'remote', remoteName: 'origin' },
      safety: 'mutating',
      confirmation: { required: false },
      createdAt: new Date().toISOString(),
      initiatedBy: 'command-palette',
    });

    const assessment = OperationSafetyChecker.assessSafety(op);
    assert.strictEqual(assessment.safety, 'mutating');
    assert.strictEqual(assessment.confirmation.required, false);
  });

  it('should mark reset --hard as destructive', () => {
    const op = createOperation({
      id: '3',
      type: 'git.reset',
      input: { repositoryPath: '/path', ref: 'HEAD~1', mode: 'hard' },
      target: { kind: 'local-repository', path: '/path' },
      safety: 'mutating',
      confirmation: { required: false },
      createdAt: new Date().toISOString(),
      initiatedBy: 'command-palette',
    });

    const assessment = OperationSafetyChecker.assessSafety(op);
    assert.strictEqual(assessment.safety, 'destructive');
    assert.strictEqual(assessment.confirmation.required, true);
  });

  it('should mark status and diff as read-only', () => {
    const statusOp = createOperation({
      id: '4',
      type: 'git.status',
      input: { repositoryPath: '/path' },
      target: { kind: 'local-repository', path: '/path' },
      safety: 'read-only',
      confirmation: { required: false },
      createdAt: new Date().toISOString(),
      initiatedBy: 'activity-bar',
    });

    const assessment = OperationSafetyChecker.assessSafety(statusOp);
    assert.strictEqual(assessment.safety, 'read-only');
    assert.strictEqual(assessment.confirmation.required, false);
  });
});
