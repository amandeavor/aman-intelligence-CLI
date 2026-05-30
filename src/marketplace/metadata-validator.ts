import { AssetMetadata, normalizeAssetMetadata } from '../types/asset-metadata.js';
import { AssetType } from '../types/index.js';

/** Top-level keys allowed in publisher metadata.json (unknown keys are rejected). */
const ALLOWED_METADATA_KEYS = new Set([
  'schemaVersion',
  'id',
  'slug',
  'type',
  'name',
  'description',
  'version',
  'author',
  'tags',
  'scope',
  'visibility',
  'createdAt',
  'updatedAt',
  'integrity',
  'dependencies',
  'trust',
  'deprecated',
  'source',
  'installedAt',
  'originalName',
  'originalSlug',
  // Legacy / publisher extras that are inert for the CLI
  'abstract',
  'category',
  'organization',
  'date',
  'installs',
  'rating',
]);

/** Keys that must never appear in external metadata (install-time execution risk). */
const FORBIDDEN_METADATA_KEYS = new Set([
  'scripts',
  'hooks',
  'install',
  'postInstall',
  'preInstall',
  'bin',
  'main',
  'exports',
]);

export function isVerifiedPublisherSlug(slug: string): boolean {
  return slug.startsWith('@aman/');
}

/**
 * Parse and validate metadata.json from a GitHub publisher repo.
 * Ignores metadata.trust.verified — only @aman/ namespace is verified.
 */
export function parsePublisherMetadata(
  raw: unknown,
  fallbackType: AssetType,
  fallbackLocalName: string,
  fallbackSlug: string,
  fallbackAuthor: string
): AssetMetadata {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('metadata.json must be a JSON object');
  }

  const record = raw as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (FORBIDDEN_METADATA_KEYS.has(key)) {
      throw new Error(`Rejected metadata field "${key}" (not permitted in marketplace assets)`);
    }
    if (!ALLOWED_METADATA_KEYS.has(key)) {
      throw new Error(`Unexpected metadata field "${key}"`);
    }
  }

  const typeRaw = record.type;
  const type: AssetType =
    typeRaw === 'skill' || typeRaw === 'prompt' || typeRaw === 'mcp' ? typeRaw : fallbackType;

  const localName =
    typeof record.name === 'string' && record.name.trim().length > 0
      ? record.name.trim()
      : fallbackLocalName;

  const slug =
    typeof record.slug === 'string' && record.slug.trim().length > 0 ? record.slug.trim() : fallbackSlug;

  const meta = normalizeAssetMetadata(record, type, localName);

  meta.slug = slug;
  meta.type = type;
  meta.name = localName;
  meta.author = typeof record.author === 'string' ? record.author : fallbackAuthor;

  if (meta.trust) {
    meta.trust.verified = isVerifiedPublisherSlug(meta.slug);
  }

  return meta;
}
