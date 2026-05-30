export type AssetType = 'skill' | 'prompt' | 'mcp';

export type {
  AssetMetadata,
  AssetDependency,
  AssetIntegrity,
  AssetTrustSignals,
  AssetVisibility,
  DeprecatedMetadata,
  CreateAssetMetadataInput,
} from './asset-metadata.js';
export { createAssetMetadata, normalizeAssetMetadata } from './asset-metadata.js';

export type Scope = 'global' | 'project';
export type NarratorState = 'idle' | 'searching' | 'installing' | 'success' | 'error' | 'syncing' | 'updating';

export interface Skill {
  name: string;
  path: string;
  description?: string;
  tags?: string[];
  category?: string;
  installs?: number;
  rating?: number;
  updated?: string;
  version?: string;
  organization?: string;
  hasSkillMd: boolean;
  source?: string;
  originalName?: string;
  slug?: string;
  id?: string;
}

export interface Prompt {
  name: string;
  path: string;
  description?: string;
  source?: string;
  slug?: string;
  id?: string;
}

export interface McpConfig {
  name: string;
  path: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  source?: string;
  slug?: string;
  id?: string;
}

/** Union of scan/list fields used across skills, prompts, and MCPs. */
export type AssetListItem = Skill | Prompt | McpConfig;

export interface StackMemberRef {
  localName: string;
  slug: string;
  version: string;
}

export interface StackPackRef {
  slug: string;
  version: string;
}

/** Workspace or published stack (AMAN-STACK-SPEC-V1). */
export interface Stack {
  schemaVersion?: 1;
  recordType?: 'stack';
  id?: string;
  slug?: string;
  name: string;
  description?: string;
  visibility?: import('./asset-metadata.js').AssetVisibility;
  members?: {
    skills: StackMemberRef[];
    prompts: StackMemberRef[];
    mcps: StackMemberRef[];
  };
  skills: string[];
  prompts: string[];
  mcps: string[];
  packs?: StackPackRef[];
  deprecated?: import('./asset-metadata.js').DeprecatedMetadata | null;
  createdAt: string;
  updatedAt: string;
}

export interface PackMemberRef {
  slug: string;
  version: string;
  localName: string;
}

/** Pack manifest (AMAN-PACK-SPEC-V1). Legacy string lists remain supported. */
export interface Pack {
  schemaVersion?: 1;
  recordType?: 'pack';
  id?: string;
  slug?: string;
  name: string;
  version?: string;
  description?: string;
  author?: string;
  tags?: string[];
  visibility?: import('./asset-metadata.js').AssetVisibility;
  integrity?: import('./asset-metadata.js').AssetIntegrity;
  dependencies?: {
    assets: import('./asset-metadata.js').AssetDependency[];
    packs: Array<{ type: 'pack'; slug: string; versionRange: string; optional: boolean }>;
  };
  members?: {
    skills: PackMemberRef[];
    prompts: PackMemberRef[];
    mcps: PackMemberRef[];
    stacks: PackMemberRef[];
  };
  trust?: import('./asset-metadata.js').AssetTrustSignals;
  deprecated?: import('./asset-metadata.js').DeprecatedMetadata | null;
  skills: string[];
  prompts: string[];
  mcps: string[];
  stacks: string[];
  createdAt: string;
}

export interface Backup {
  id: string;
  name?: string;
  timestamp: string;
  skills: string[];
  prompts: string[];
  mcps: string[];
  stacks: string[];
  config: Record<string, unknown>;
}

export type LockSourceKind =
  | 'registry'
  | 'github'
  | 'local'
  | 'pack'
  | 'import'
  | 'manual';

export interface LockSource {
  kind: LockSourceKind;
  ref: string;
}

export interface LockIntegrity {
  algorithm: 'sha256';
  checksum: string;
}

export interface LockDependency {
  type: 'asset';
  slug: string;
  versionRange: string;
  optional: boolean;
  resolvedVersion?: string;
}

/** Single installed asset entry in aman.lock (AMAN-LOCKFILE-SPEC-V1). */
export interface LockEntry {
  id: string;
  slug: string;
  type: AssetType;
  localName: string;
  version: string;
  integrity: LockIntegrity;
  source: LockSource;
  scope: Scope;
  installedAt: string;
  dependencies: LockDependency[];
  /** MCP only: true when mcp.local.json is required but missing (see AMAN-LOCKFILE-SPEC-V1 §4.1). */
  requiresLocalConfig: boolean;
}

export interface Lockfile {
  schemaVersion: 1;
  generatedAt: string;
  scope: Scope;
  assets: LockEntry[];
}

/** User-controlled environment config — not installed asset state. */
export interface AmanConfig {
  theme: 'dark' | 'light' | 'auto';
  defaultScope: Scope;
  environmentPath?: string;
  storage?: {
    type: 'local' | 'github';
    repository?: string;
  };
  marketplaces: string[];
  animationMode: 'off' | 'reduced' | 'normal';
  github?: {
    token?: string;
    defaultOrg?: string;
  };
  experimental?: Record<string, boolean>;
}

export interface ProviderResult {
  type: AssetType;
  name: string;
  source: string;
  sources?: string[];
  description?: string;
  tags?: string[];
  category?: string;
  installs?: number;
  rating?: number;
  updated?: string;
  version?: string;
  organization?: string;
  installed?: boolean;
  confidence: number;
  slug?: string;
  /** GitHub repo stars (marketplace assets only). */
  stars?: number;
  /** CLI-enforced: true only for @aman/ namespace. */
  verified?: boolean;
  /** UI grouping: local providers vs GitHub topic marketplace. */
  section?: 'local' | 'marketplace';
  /** Expected content checksum from publisher metadata. */
  checksum?: string;
  /** github:owner/repo */
  githubSource?: string;
}

export interface HealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  fix?: string;
}
