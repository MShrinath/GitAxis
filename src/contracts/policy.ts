import { Operation } from './operation';
import { OperationId } from './common';
import { OperationResult, OperationWarning } from './operation-results';
import { GitProfile } from './profile';
import { GitRepository } from './repository';
import { ResolvedAuthentication } from './authentication';

export interface ValidationError {
  code: string;
  message: string;
}

export interface OperationValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: OperationWarning[];
  confirmationRequired?: boolean;
  confirmationReason?: string;
  confirmationWarning?: string;
}

export interface OperationContext {
  operation: Operation;
  profile?: GitProfile;
  repository?: GitRepository;
  authentication?: ResolvedAuthentication;
}

export interface OperationManager {
  execute<T>(operation: Operation): Promise<OperationResult<T>>;
  validate(operation: Operation): Promise<OperationValidationResult>;
  cancel(operationId: OperationId): Promise<void>;
  getHistory(): Operation[];
}
