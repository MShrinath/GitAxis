import {
  ISODateTime,
  OperationId,
  ProfileId,
  RepositoryId,
} from './common';

export type OperationSafety = 'read-only' | 'mutating' | 'destructive';

export type ConfirmationRequirement =
  | { required: false }
  | { required: true; reason: string; warning?: string };

export type OperationErrorCode =
  | 'GIT_NOT_FOUND'
  | 'NOT_A_REPOSITORY'
  | 'PROFILE_NOT_FOUND'
  | 'AUTHENTICATION_REQUIRED'
  | 'AUTHENTICATION_FAILED'
  | 'PERMISSION_DENIED'
  | 'REMOTE_NOT_FOUND'
  | 'REMOTE_REJECTED'
  | 'BRANCH_NOT_FOUND'
  | 'MERGE_CONFLICT'
  | 'REBASE_CONFLICT'
  | 'NOTHING_TO_COMMIT'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'OPERATION_CANCELLED'
  | 'CONFIRMATION_REQUIRED'
  | 'INVALID_INPUT'
  | 'PROFILE_MISMATCH'
  | 'GUARD_BLOCKED'
  | 'GUARD_CHECK_FAILED'
  | 'UNKNOWN';

export interface OperationError {
  code: OperationErrorCode;
  message: string;
  userMessage: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export interface OperationWarning {
  code: string;
  message: string;
}

export interface OperationResult<T = unknown> {
  operationId: OperationId;
  success: boolean;
  data?: T;
  error?: OperationError;
  warnings?: OperationWarning[];
  startedAt: ISODateTime;
  completedAt: ISODateTime;
}

export interface Operation {
  id: OperationId;
  type: string;
  input?: any;
  target?: any;
  profileId?: ProfileId;
  repositoryId?: RepositoryId;
  safety?: OperationSafety;
  confirmation?: ConfirmationRequirement;
  createdAt?: ISODateTime;
  initiatedBy?: string;
}

export function createOperation<T extends Operation = Operation>(
  operation: T
): T {
  return operation;
}

export interface OperationRecord {
  operation: Operation;
  state:
    | 'created'
    | 'validating'
    | 'waiting-for-confirmation'
    | 'ready'
    | 'executing'
    | 'succeeded'
    | 'failed'
    | 'cancelled';
  result?: OperationResult;
  durationMs?: number;
}

export interface OperationValidationResult {
  valid: boolean;
  errors: { code: string; message: string }[];
  warnings: OperationWarning[];
  confirmationRequired?: boolean;
  confirmationReason?: string;
  confirmationWarning?: string;
}

export interface OperationManager {
  execute<T>(operation: Operation): Promise<OperationResult<T>>;
  validate(operation: Operation): Promise<OperationValidationResult>;
  cancel(operationId: OperationId): Promise<void>;
  getHistory(): Operation[];
}
