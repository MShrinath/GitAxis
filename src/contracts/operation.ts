import {
  ISODateTime,
  OperationGroupId,
  OperationId,
  ProfileId,
  RepositoryId,
} from './common';
import { OperationInputMap } from './operation-inputs';
import { OperationTargetMap } from './operation-targets';
import { OperationResult } from './operation-results';

export type OperationType = keyof OperationInputMap;

export type OperationSafety = 'read-only' | 'mutating' | 'destructive';

export interface NoConfirmation {
  required: false;
}

export interface UserConfirmation {
  required: true;
  reason: string;
  warning?: string;
}

export type ConfirmationRequirement = NoConfirmation | UserConfirmation;

export type OperationInitiator =
  | 'command-palette'
  | 'activity-bar'
  | 'webview'
  | 'context-menu'
  | 'automatic'
  | 'system';

export interface TypedOperation<TType extends OperationType = OperationType> {
  id: OperationId;
  groupId?: OperationGroupId;
  type: TType;
  input: OperationInputMap[TType];
  target: OperationTargetMap[TType];
  profileId?: ProfileId;
  repositoryId?: RepositoryId;
  safety: OperationSafety;
  confirmation: ConfirmationRequirement;
  createdAt: ISODateTime;
  initiatedBy: OperationInitiator;
}

export type Operation = {
  [TType in OperationType]: TypedOperation<TType>;
}[OperationType];

export function createOperation<TType extends OperationType>(
  operation: TypedOperation<TType>
): TypedOperation<TType> {
  return operation;
}

export type OperationState =
  | 'created'
  | 'validating'
  | 'waiting-for-confirmation'
  | 'ready'
  | 'executing'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface OperationRecord {
  operation: Operation;
  state: OperationState;
  result?: OperationResult;
  durationMs?: number;
}

export interface OperationGroup {
  id: OperationGroupId;
  name: string;
  operationIds: OperationId[];
  profileId?: ProfileId;
  repositoryId?: RepositoryId;
  createdAt: ISODateTime;
}
