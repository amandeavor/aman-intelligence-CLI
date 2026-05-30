import { AssetType } from '../types/index.js';
import { AssetVisibility } from '../types/asset-metadata.js';

/** Publisher namespace (without leading `@`), e.g. `aman`, `acme~private`. */
export type RegistryNamespace = string;

/**
 * Access context for scoped resolution (private org assets in future).
 * V1 local adapter ignores `authToken` and treats all records as readable.
 */
export interface RegistryAccessContext {
  authToken?: string;
}

export interface RegistryIntegrity {
  algorithm: 'sha256';
  checksum: string;
  signature: string | null;
}

/** Exact-version dependency reference (V1 — no ranges). */
export interface RegistryDependencyRef {
  slug: string;
  version: string;
}

export interface RegistryDeprecation {
  at: string;
  reason: string;
  successor?: string;
}

export interface RegistryTrustSignals {
  verified: boolean;
  downloads: number;
  rating: number | null;
  publisher: string;
  deprecated: boolean;
}

export interface RegistryVersionRecord {
  schemaVersion: 1;
  recordType: 'asset';
  id: string;
  slug: string;
  type: AssetType;
  name: string;
  description: string;
  version: string;
  author: string;
  tags: string[];
  visibility: AssetVisibility;
  publishedAt: string;
  integrity: RegistryIntegrity;
  dependencies: RegistryDependencyRef[];
  trust: RegistryTrustSignals;
  deprecated: RegistryDeprecation | null;
}

export interface RegistrySlugIndexEntry {
  schemaVersion: 1;
  slug: string;
  id: string;
  latestVersion: string;
  visibility: AssetVisibility;
  namespace: RegistryNamespace;
  redirectFrom: string[];
}

export interface RegistryAssetIndex {
  schemaVersion: 1;
  id: string;
  slug: string;
  aliases: string[];
  type: AssetType;
  visibility: AssetVisibility;
}

export type RegistryContentLocation =
  | { kind: 'filesystem'; path: string }
  | { kind: 'http'; url: string };

export interface RegistryResolveRequest {
  /** Disambiguates abbreviated slugs (`react-best-practices` + scope `aman`). */
  scope?: RegistryNamespace;
  slug: string;
  version: string;
  context?: RegistryAccessContext;
}

export interface RegistryResolveByIdRequest {
  id: string;
  version: string;
  context?: RegistryAccessContext;
}

export interface RegistryResolveResult {
  record: RegistryVersionRecord;
  content: RegistryContentLocation;
}

export interface RegistryPublishRequest {
  scope?: RegistryNamespace;
  slug: string;
  version: string;
  type: AssetType;
  metadata: Omit<
    RegistryVersionRecord,
    'schemaVersion' | 'recordType' | 'publishedAt' | 'integrity' | 'trust' | 'deprecated'
  > & {
    integrity?: Partial<RegistryIntegrity>;
    trust?: Partial<RegistryTrustSignals>;
  };
  /** Canonical asset directory on disk (SKILL.md / PROMPT.md / mcp.json layout). */
  contentDirectory: string;
  context?: RegistryAccessContext;
}

export interface RegistryPublishResult {
  record: RegistryVersionRecord;
}

export interface RegistryDeprecateRequest {
  scope?: RegistryNamespace;
  slug: string;
  version: string;
  reason: string;
  successor?: string;
  context?: RegistryAccessContext;
}

export interface RegistryDeprecateResult {
  record: RegistryVersionRecord;
}

export interface RegistryListRequest {
  scope?: RegistryNamespace;
  slug: string;
  context?: RegistryAccessContext;
}

export interface RegistryListResult {
  slug: string;
  id: string;
  versions: RegistryVersionRecord[];
}

export interface RegistrySearchFilters {
  type?: AssetType;
  namespace?: RegistryNamespace;
  visibility?: AssetVisibility;
  includeDeprecated?: boolean;
}

export interface RegistrySearchRequest {
  query: string;
  filters?: RegistrySearchFilters;
  context?: RegistryAccessContext;
}

export interface RegistrySearchHit {
  record: RegistryVersionRecord;
  slug: string;
  latestVersion: string;
}

export interface RegistrySearchResult {
  hits: RegistrySearchHit[];
  total: number;
}

export interface RegistryVerifyRequest {
  scope?: RegistryNamespace;
  slug: string;
  version: string;
  checksum: string;
  context?: RegistryAccessContext;
}

export interface RegistryVerifyResult {
  valid: boolean;
  expected: string;
  actual: string;
}
