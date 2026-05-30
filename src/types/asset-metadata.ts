import { randomUUID } from 'crypto';
import { AssetType, Scope } from './index.js';
import { defaultSlugForName } from '../utils/slug.js';
import { INTEGRITY_ALGORITHM } from '../utils/integrity.js';

export type AssetVisibility = 'public' | 'org' | 'private';

export interface AssetIntegrity {
  algorithm: typeof INTEGRITY_ALGORITHM;
  checksum: string;
  signature: string | null;
}

export interface AssetDependency {
  type: 'asset';
  slug: string;
  versionRange: string;
  optional: boolean;
}

export interface DeprecatedMetadata {
  at: string;
  reason: string;
  replacement?: string;
}

export interface AssetTrustSignals {
  verified: boolean;
  downloads: number;
  rating: number | null;
  publisher: string | null;
}

/** Unified metadata schema for skills, prompts, and MCPs (AMAN-ASSET-SPEC-V1). */
export interface AssetMetadata {
  schemaVersion: 1;
  id: string;
  slug: string;
  type: AssetType;
  name: string;
  description: string;
  version: string;
  author: string;
  tags: string[];
  scope: Scope;
  visibility: AssetVisibility;
  createdAt: string;
  updatedAt: string;
  integrity: AssetIntegrity;
  dependencies: AssetDependency[];
  trust: AssetTrustSignals;
  deprecated: DeprecatedMetadata | null;
  /** Local provenance; not required for registry publication. */
  source?: string;
  installedAt?: string;
  originalName?: string;
  originalSlug?: string;
}

export interface CreateAssetMetadataInput {
  id?: string;
  slug?: string;
  description?: string;
  tags?: string[];
  version?: string;
  author?: string;
  scope?: Scope;
  visibility?: AssetVisibility;
  checksum?: string;
  dependencies?: AssetDependency[];
  trust?: Partial<AssetTrustSignals>;
  deprecated?: DeprecatedMetadata | null;
  source?: string;
  installedAt?: string;
  originalName?: string;
  originalSlug?: string;
  createdAt?: string;
  updatedAt?: string;
}

export function createAssetMetadata(
  type: AssetType,
  name: string,
  overrides: CreateAssetMetadataInput = {}
): AssetMetadata {
  const now = new Date().toISOString();
  const slug = overrides.slug ?? defaultSlugForName(name);
  const checksum = overrides.checksum ?? 'sha256:0000000000000000000000000000000000000000000000000000000000000000';

  return {
    schemaVersion: 1,
    id: overrides.id ?? randomUUID(),
    slug,
    type,
    name,
    description: overrides.description ?? '',
    version: overrides.version ?? '1.0.0',
    author: overrides.author ?? 'unknown',
    tags: overrides.tags ?? [],
    scope: overrides.scope ?? 'global',
    visibility: overrides.visibility ?? 'public',
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    integrity: {
      algorithm: INTEGRITY_ALGORITHM,
      checksum,
      signature: null,
    },
    dependencies: overrides.dependencies ?? [],
    trust: {
      verified: overrides.trust?.verified ?? false,
      downloads: overrides.trust?.downloads ?? 0,
      rating: overrides.trust?.rating ?? null,
      publisher: overrides.trust?.publisher ?? null,
    },
    deprecated: overrides.deprecated ?? null,
    source: overrides.source,
    installedAt: overrides.installedAt,
    originalName: overrides.originalName ?? name,
    originalSlug: overrides.originalSlug,
  };
}

/** Merge partial legacy metadata.json into canonical shape for reads. */
export function normalizeAssetMetadata(raw: Record<string, unknown>, type: AssetType, name: string): AssetMetadata {
  const base = createAssetMetadata(type, name, {
    id: typeof raw.id === 'string' ? raw.id : undefined,
    slug: typeof raw.slug === 'string' ? raw.slug : undefined,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === 'string') : undefined,
    version: typeof raw.version === 'string' ? raw.version : undefined,
    author: typeof raw.author === 'string' ? raw.author : undefined,
    scope: raw.scope === 'project' || raw.scope === 'global' ? raw.scope : undefined,
    visibility:
      raw.visibility === 'public' || raw.visibility === 'org' || raw.visibility === 'private'
        ? raw.visibility
        : undefined,
    source: typeof raw.source === 'string' ? raw.source : undefined,
    installedAt: typeof raw.installedAt === 'string' ? raw.installedAt : undefined,
    originalName: typeof raw.originalName === 'string' ? raw.originalName : undefined,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
  });

  const integrityRaw = raw.integrity as Record<string, unknown> | undefined;
  if (integrityRaw && typeof integrityRaw.checksum === 'string') {
    base.integrity.checksum = integrityRaw.checksum;
  }

  if (Array.isArray(raw.dependencies)) {
    base.dependencies = raw.dependencies.filter(
      (d): d is AssetDependency =>
        typeof d === 'object' &&
        d !== null &&
        (d as AssetDependency).type === 'asset' &&
        typeof (d as AssetDependency).slug === 'string'
    );
  }

  const trustRaw = raw.trust as Record<string, unknown> | undefined;
  if (trustRaw) {
    if (typeof trustRaw.verified === 'boolean') base.trust.verified = trustRaw.verified;
    if (typeof trustRaw.downloads === 'number') base.trust.downloads = trustRaw.downloads;
    if (typeof trustRaw.rating === 'number' || trustRaw.rating === null) base.trust.rating = trustRaw.rating as number | null;
    if (typeof trustRaw.publisher === 'string' || trustRaw.publisher === null) {
      base.trust.publisher = trustRaw.publisher as string | null;
    }
  }

  if (raw.deprecated && typeof raw.deprecated === 'object') {
    const dep = raw.deprecated as Record<string, unknown>;
    if (typeof dep.at === 'string' && typeof dep.reason === 'string') {
      base.deprecated = {
        at: dep.at,
        reason: dep.reason,
        replacement: typeof dep.replacement === 'string' ? dep.replacement : undefined,
      };
    }
  }

  if (typeof raw.updatedAt === 'string') {
    base.updatedAt = raw.updatedAt;
  }

  return base;
}
