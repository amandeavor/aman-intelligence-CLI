import { randomUUID } from 'crypto';
import {
  AssetType,
  LockEntry,
  Lockfile,
  LockSource,
  LockSourceKind,
  Scope,
} from '../types/index.js';
import { defaultSlugForName } from './slug.js';
import { INTEGRITY_ALGORITHM } from './integrity.js';

interface LegacyLockEntry {
  name: string;
  type: AssetType;
  source: string;
  installedAt: string;
  version?: string;
  originalName?: string;
}

interface LegacyLockfile {
  version?: number;
  schemaVersion?: number;
  skills?: LegacyLockEntry[];
  prompts?: LegacyLockEntry[];
  mcps?: LegacyLockEntry[];
  assets?: LockEntry[];
  scope?: Scope;
  generatedAt?: string;
}

function inferSourceKind(source: string): LockSourceKind {
  if (source.startsWith('registry:')) return 'registry';
  if (source.startsWith('github:') || source.includes('/')) return 'github';
  if (source.startsWith('pack:')) return 'pack';
  if (source.startsWith('import:')) return 'import';
  if (source === 'bundled' || source === 'local') return 'local';
  return 'manual';
}

export function parseLockSource(source: string): LockSource {
  const kind = inferSourceKind(source);
  if (kind === 'registry' || kind === 'pack' || kind === 'import' || kind === 'github') {
    return { kind, ref: source };
  }
  if (kind === 'local') {
    return { kind, ref: `local:${source}` };
  }
  return { kind: 'manual', ref: `manual:${source}` };
}

function migrateLegacyEntry(entry: LegacyLockEntry, scope: Scope): LockEntry {
  return {
    id: randomUUID(),
    slug: defaultSlugForName(entry.originalName ?? entry.name),
    type: entry.type,
    localName: entry.name,
    version: entry.version ?? '1.0.0',
    integrity: {
      algorithm: INTEGRITY_ALGORITHM,
      checksum: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    },
    source: parseLockSource(entry.source),
    scope,
    installedAt: entry.installedAt,
    dependencies: [],
    requiresLocalConfig: entry.type === 'mcp',
  };
}

/** Normalize legacy or partial lockfiles to AMAN-LOCKFILE-SPEC-V1 shape. */
export function normalizeLockfile(raw: LegacyLockfile | null | undefined, scope: Scope): Lockfile {
  if (!raw) {
    return emptyLockfile(scope);
  }

  if (Array.isArray(raw.assets)) {
    return {
      schemaVersion: 1,
      generatedAt: raw.generatedAt ?? new Date().toISOString(),
      scope: raw.scope ?? scope,
      assets: raw.assets.filter(isValidLockEntry).map((entry) => ({
        ...entry,
        scope: entry.scope ?? scope,
        dependencies: entry.dependencies ?? [],
        requiresLocalConfig: entry.requiresLocalConfig ?? entry.type === 'mcp',
      })),
    };
  }

  const legacyEntries: LegacyLockEntry[] = [
    ...(raw.skills ?? []),
    ...(raw.prompts ?? []),
    ...(raw.mcps ?? []),
  ];

  return {
    schemaVersion: 1,
    generatedAt: raw.generatedAt ?? new Date().toISOString(),
    scope: raw.scope ?? scope,
    assets: legacyEntries.map((entry) => migrateLegacyEntry(entry, raw.scope ?? scope)),
  };
}

export function emptyLockfile(scope: Scope): Lockfile {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    scope,
    assets: [],
  };
}

export function isLegacyLockfile(raw: LegacyLockfile): boolean {
  return !Array.isArray(raw.assets) && !!(raw.skills?.length || raw.prompts?.length || raw.mcps?.length || raw.version === 1);
}

function isValidLockEntry(entry: unknown): entry is LockEntry {
  if (!entry || typeof entry !== 'object') return false;
  const e = entry as LockEntry;
  return (
    typeof e.localName === 'string' &&
    (e.type === 'skill' || e.type === 'prompt' || e.type === 'mcp') &&
    typeof e.version === 'string'
  );
}
