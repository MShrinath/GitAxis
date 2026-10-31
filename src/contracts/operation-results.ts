import { ISODateTime, OperationId } from './common';

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
