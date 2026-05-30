export type RegistryErrorCode =
  | 'INVALID_SLUG'
  | 'SCOPE_REQUIRED'
  | 'NOT_FOUND'
  | 'VERSION_EXISTS'
  | 'VERSION_NOT_FOUND'
  | 'CHECKSUM_MISMATCH'
  | 'IMMUTABLE_VIOLATION'
  | 'UNAUTHORIZED'
  | 'CIRCULAR_DEPENDENCY'
  | 'ADAPTER_UNAVAILABLE';

export class RegistryError extends Error {
  readonly code: RegistryErrorCode;

  constructor(code: RegistryErrorCode, message: string) {
    super(message);
    this.name = 'RegistryError';
    this.code = code;
  }
}
