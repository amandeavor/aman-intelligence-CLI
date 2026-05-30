import {
  RegistryDeprecateRequest,
  RegistryDeprecateResult,
  RegistryListRequest,
  RegistryListResult,
  RegistryPublishRequest,
  RegistryPublishResult,
  RegistryResolveByIdRequest,
  RegistryResolveRequest,
  RegistryResolveResult,
  RegistrySearchRequest,
  RegistrySearchResult,
  RegistryVerifyRequest,
  RegistryVerifyResult,
} from './types.js';

/**
 * Canonical registry adapter contract (Phase 3 — locked).
 * Local filesystem, GitHub mirror, and future HTTP server MUST implement this interface.
 */
export interface RegistryAdapter {
  readonly name: string;

  available(): Promise<boolean>;

  resolve(request: RegistryResolveRequest): Promise<RegistryResolveResult>;

  resolveById(request: RegistryResolveByIdRequest): Promise<RegistryResolveResult>;

  publish(request: RegistryPublishRequest): Promise<RegistryPublishResult>;

  deprecate(request: RegistryDeprecateRequest): Promise<RegistryDeprecateResult>;

  list(request: RegistryListRequest): Promise<RegistryListResult>;

  search(request: RegistrySearchRequest): Promise<RegistrySearchResult>;

  verify(request: RegistryVerifyRequest): Promise<RegistryVerifyResult>;
}
