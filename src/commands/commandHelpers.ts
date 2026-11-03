import * as crypto from 'crypto';
import * as vscode from 'vscode';
import {
  ConfirmationRequirement,
  createOperation,
  Operation,
  OperationInputMap,
  OperationResult,
  OperationSafety,
  OperationTargetMap,
  OperationType,
} from '../contracts';
import { OperationManager } from '../operations/operationManager';

export function createLocalRepoOp<TType extends OperationType>(
  type: TType,
  repoPath: string,
  input: OperationInputMap[TType],
  options?: {
    safety?: OperationSafety;
    confirmation?: ConfirmationRequirement;
  }
): Operation {
  const confirmation: ConfirmationRequirement = options?.confirmation ?? { required: false };
  return createOperation({
    id: crypto.randomUUID(),
    type,
    input,
    target: { kind: 'local-repository', path: repoPath } as OperationTargetMap[TType],
    safety: options?.safety ?? 'mutating',
    confirmation,
    createdAt: new Date().toISOString(),
    initiatedBy: 'command-palette',
  }) as unknown as Operation;
}

export async function runLocalRepoOp<TType extends OperationType>(
  operationManager: OperationManager,
  repoPath: string,
  type: TType,
  input: OperationInputMap[TType],
  successMessage: string,
  fallbackErrorMessage: string,
  onRefresh?: () => void,
  options?: {
    safety?: OperationSafety;
    confirmation?: ConfirmationRequirement;
  }
): Promise<boolean> {
  const op = createLocalRepoOp(type, repoPath, input, options);
  const res = await operationManager.execute(op);
  if (res.success) {
    vscode.window.showInformationMessage(successMessage);
  } else {
    vscode.window.showErrorMessage(res.error?.userMessage || fallbackErrorMessage);
  }
  onRefresh?.();
  return res.success;
}

export async function runCancellableProgressOp<T = unknown>(
  operationManager: OperationManager,
  op: Operation,
  title: string,
  successMessage?: string,
  fallbackErrorMessage?: string,
  onRefresh?: () => void
): Promise<OperationResult<T>> {
  return await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title,
      cancellable: true,
    },
    async (_progress, token) => {
      token.onCancellationRequested(() => {
        operationManager.cancel(op.id);
      });
      const res = await operationManager.execute<T>(op);
      if (res.success) {
        if (successMessage) {
          vscode.window.showInformationMessage(successMessage);
        }
      } else {
        if (fallbackErrorMessage) {
          vscode.window.showErrorMessage(res.error?.userMessage || fallbackErrorMessage);
        }
      }
      if (res.warnings && res.warnings.length > 0) {
        for (const w of res.warnings) {
          vscode.window.showWarningMessage(`Warning: ${w.message}`);
        }
      }
      onRefresh?.();
      return res;
    }
  );
}
