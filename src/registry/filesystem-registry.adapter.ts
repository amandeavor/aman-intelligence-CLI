import path from 'path';
import { RegistryAdapter } from './adapter.interface.js';
import { RegistryError } from './errors.js';
import {
  RegistryAssetIndex,
  RegistryDeprecateRequest,
  RegistryDeprecateResult,
  RegistryListRequest,
  RegistryListResult,
  RegistryPublishRequest,
  RegistryPublishResult,
  RegistryResolveByIdRequest,
  RegistryResolveRequest,
  RegistryResolveResult,
  RegistrySearchHit,
  RegistrySearchRequest,
  RegistrySearchResult,
  RegistrySlugIndexEntry,
  RegistryVersionRecord,
  RegistryVerifyRequest,
  RegistryVerifyResult,
} from './types.js';
import {
  assetIndexPath,
  assetRootPath,
  normalizeRegistrySlug,
  namespaceFromSlug,
  slugIndexFilePath,
  versionContentPath,
  versionRecordPath,
} from './slug-utils.js';
import { copyDir, ensureDir, exists, listDirs, readJson, writeJson } from '../storage/filesystem.js';
import { computeAssetChecksum } from '../utils/integrity.js';
import { isCanonicalAssetDir } from '../storage/asset-layout.js';

function compareVersions(a: string, b: string): number {
  const ap = a.split('.').map((p) => parseInt(p, 10) || 0);
  const bp = b.split('.').map((p) => parseInt(p, 10) || 0);
  const len = Math.max(ap.length, bp.length);
  for (let i = 0; i < len; i++) {
    const diff = (ap[i] ?? 0) - (bp[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Shared filesystem layout for local and GitHub-backed registry mirrors.
 * Layout: `{root}/slug-index/{namespace}/{name}.json`, `{root}/assets/{id}/versions/{version}/`.
 */
export class FilesystemRegistryAdapter implements RegistryAdapter {
  readonly name: string;

  constructor(
    protected readonly registryRoot: string,
    name = 'local'
  ) {
    this.name = name;
  }

  async available(): Promise<boolean> {
    await ensureDir(this.registryRoot);
    return true;
  }

  async resolve(request: RegistryResolveRequest): Promise<RegistryResolveResult> {
    const slug = normalizeRegistrySlug(request.scope, request.slug);
    const { id } = await this.resolveSlugToId(slug);
    return this.resolveRecord(id, slug, request.version);
  }

  async resolveById(request: RegistryResolveByIdRequest): Promise<RegistryResolveResult> {
    const assetIndex = await readJson<RegistryAssetIndex>(assetIndexPath(this.registryRoot, request.id));
    if (!assetIndex) {
      throw new RegistryError('NOT_FOUND', `Asset id not found: ${request.id}`);
    }
    return this.resolveRecord(request.id, assetIndex.slug, request.version);
  }

  async publish(request: RegistryPublishRequest): Promise<RegistryPublishResult> {
    const slug = normalizeRegistrySlug(request.scope, request.slug);
    const version = request.version.trim();
    const contentDir = request.contentDirectory;

    if (!exists(contentDir) || !isCanonicalAssetDir(request.type, contentDir)) {
      throw new RegistryError(
        'CHECKSUM_MISMATCH',
        `Content directory is not a canonical ${request.type} layout: ${contentDir}`
      );
    }

    const checksum = await computeAssetChecksum(request.type, contentDir);
    if (request.metadata.integrity?.checksum && request.metadata.integrity.checksum !== checksum) {
      throw new RegistryError(
        'CHECKSUM_MISMATCH',
        `Submitted checksum does not match content (expected ${request.metadata.integrity.checksum}, got ${checksum})`
      );
    }

    const id = request.metadata.id;
    const versionDir = versionContentPath(this.registryRoot, id, version);
    if (exists(versionRecordPath(this.registryRoot, id, version))) {
      throw new RegistryError(
        'VERSION_EXISTS',
        `Version ${version} already published for ${slug} (${id}). Published versions are immutable.`
      );
    }

    const publishedAt = new Date().toISOString();
    const namespace = namespaceFromSlug(slug);
    const record: RegistryVersionRecord = {
      schemaVersion: 1,
      recordType: 'asset',
      id,
      slug,
      type: request.type,
      name: request.metadata.name,
      description: request.metadata.description,
      version,
      author: request.metadata.author,
      tags: request.metadata.tags ?? [],
      visibility: request.metadata.visibility ?? 'public',
      publishedAt,
      integrity: {
        algorithm: 'sha256',
        checksum,
        signature: request.metadata.integrity?.signature ?? null,
      },
      dependencies: request.metadata.dependencies ?? [],
      trust: {
        verified: request.metadata.trust?.verified ?? false,
        downloads: request.metadata.trust?.downloads ?? 0,
        rating: request.metadata.trust?.rating ?? null,
        publisher: request.metadata.trust?.publisher ?? `@${namespace}`,
        deprecated: false,
      },
      deprecated: null,
    };

    await ensureDir(versionDir);
    await copyDir(contentDir, versionDir);
    await writeJson(versionRecordPath(this.registryRoot, id, version), record);

    const assetIndex: RegistryAssetIndex = {
      schemaVersion: 1,
      id,
      slug,
      aliases: [],
      type: request.type,
      visibility: record.visibility,
    };
    await writeJson(assetIndexPath(this.registryRoot, id), assetIndex);

    const slugIndexPath = slugIndexFilePath(this.registryRoot, slug);
    const existingSlug = await readJson<RegistrySlugIndexEntry>(slugIndexPath);
    const latestVersion =
      existingSlug && compareVersions(existingSlug.latestVersion, version) > 0
        ? existingSlug.latestVersion
        : version;

    const slugEntry: RegistrySlugIndexEntry = {
      schemaVersion: 1,
      slug,
      id,
      latestVersion,
      visibility: record.visibility,
      namespace,
      redirectFrom: existingSlug?.redirectFrom ?? [],
    };
    await writeJson(slugIndexPath, slugEntry);

    return { record };
  }

  async deprecate(request: RegistryDeprecateRequest): Promise<RegistryDeprecateResult> {
    const slug = normalizeRegistrySlug(request.scope, request.slug);
    const { id } = await this.resolveSlugToId(slug);
    const recordPath = versionRecordPath(this.registryRoot, id, request.version);
    const record = await readJson<RegistryVersionRecord>(recordPath);
    if (!record) {
      throw new RegistryError('VERSION_NOT_FOUND', `Version ${request.version} not found for ${slug}`);
    }

    const at = new Date().toISOString();
    record.deprecated = {
      at,
      reason: request.reason,
      successor: request.successor,
    };
    record.trust = { ...record.trust, deprecated: true };
    await writeJson(recordPath, record);
    return { record };
  }

  async list(request: RegistryListRequest): Promise<RegistryListResult> {
    const slug = normalizeRegistrySlug(request.scope, request.slug);
    const { id } = await this.resolveSlugToId(slug);
    const versionsDir = path.join(assetRootPath(this.registryRoot, id), 'versions');
    if (!exists(versionsDir)) {
      return { slug, id, versions: [] };
    }

    const versionNames = await listDirs(versionsDir);
    const versions: RegistryVersionRecord[] = [];
    for (const version of versionNames) {
      const record = await readJson<RegistryVersionRecord>(
        versionRecordPath(this.registryRoot, id, version)
      );
      if (record) versions.push(record);
    }
    versions.sort((a, b) => compareVersions(b.version, a.version));
    return { slug, id, versions };
  }

  async search(request: RegistrySearchRequest): Promise<RegistrySearchResult> {
    const slugIndexRoot = path.join(this.registryRoot, 'slug-index');
    if (!exists(slugIndexRoot)) {
      return { hits: [], total: 0 };
    }

    const query = request.query.trim().toLowerCase();
    const hits: RegistrySearchHit[] = [];
    const namespaces = await listDirs(slugIndexRoot);

    for (const ns of namespaces) {
      if (request.filters?.namespace && request.filters.namespace !== ns) continue;
      const nsDir = path.join(slugIndexRoot, ns);
      const files = await listSlugIndexFiles(nsDir);
      for (const file of files) {
        const entry = await readJson<RegistrySlugIndexEntry>(file);
        if (!entry) continue;
        if (request.filters?.visibility && entry.visibility !== request.filters.visibility) continue;

        const record = await readJson<RegistryVersionRecord>(
          versionRecordPath(this.registryRoot, entry.id, entry.latestVersion)
        );
        if (!record) continue;
        if (request.filters?.type && record.type !== request.filters.type) continue;
        if (!request.filters?.includeDeprecated && record.deprecated) continue;

        const haystack = [
          entry.slug,
          record.name,
          record.description,
          ...(record.tags ?? []),
        ]
          .join(' ')
          .toLowerCase();

        if (query && !haystack.includes(query)) continue;

        hits.push({
          slug: entry.slug,
          latestVersion: entry.latestVersion,
          record,
        });
      }
    }

    hits.sort((a, b) => a.slug.localeCompare(b.slug));
    return { hits, total: hits.length };
  }

  async verify(request: RegistryVerifyRequest): Promise<RegistryVerifyResult> {
    const resolved = await this.resolve({
      scope: request.scope,
      slug: request.slug,
      version: request.version,
      context: request.context,
    });
    if (resolved.content.kind !== 'filesystem') {
      throw new RegistryError('ADAPTER_UNAVAILABLE', 'Verify requires filesystem content location');
    }
    const actual = await computeAssetChecksum(resolved.record.type, resolved.content.path);
    const expected = request.checksum;
    return {
      valid: actual === expected,
      expected,
      actual,
    };
  }

  protected async resolveSlugToId(slug: string): Promise<{ id: string; entry: RegistrySlugIndexEntry }> {
    const direct = await readJson<RegistrySlugIndexEntry>(slugIndexFilePath(this.registryRoot, slug));
    if (direct) {
      return { id: direct.id, entry: direct };
    }

    const redirectId = await this.findIdByRedirect(slug);
    if (redirectId) {
      const assetIndex = await readJson<RegistryAssetIndex>(assetIndexPath(this.registryRoot, redirectId));
      if (assetIndex) {
        const canonical = await readJson<RegistrySlugIndexEntry>(
          slugIndexFilePath(this.registryRoot, assetIndex.slug)
        );
        if (canonical) {
          return {
            id: redirectId,
            entry: {
              ...canonical,
              slug,
              redirectFrom: canonical.redirectFrom,
            },
          };
        }
      }
    }

    throw new RegistryError('NOT_FOUND', `Slug not found in registry: ${slug}`);
  }

  private async findIdByRedirect(slug: string): Promise<string | null> {
    const slugIndexRoot = path.join(this.registryRoot, 'slug-index');
    if (!exists(slugIndexRoot)) return null;

    const namespaces = await listDirs(slugIndexRoot);
    for (const ns of namespaces) {
      const files = await listSlugIndexFiles(path.join(slugIndexRoot, ns));
      for (const file of files) {
        const entry = await readJson<RegistrySlugIndexEntry>(file);
        if (entry?.redirectFrom?.includes(slug)) {
          return entry.id;
        }
      }
    }
    return null;
  }

  private async resolveRecord(
    id: string,
    slug: string,
    version: string
  ): Promise<RegistryResolveResult> {
    const recordPath = versionRecordPath(this.registryRoot, id, version);
    const record = await readJson<RegistryVersionRecord>(recordPath);
    if (!record) {
      throw new RegistryError('VERSION_NOT_FOUND', `Version ${version} not found for ${slug}`);
    }

    const contentPath = versionContentPath(this.registryRoot, id, version);
    if (!exists(contentPath)) {
      throw new RegistryError('NOT_FOUND', `Content missing for ${slug}@${version}`);
    }

    record.trust = {
      ...record.trust,
      downloads: (record.trust.downloads ?? 0) + 1,
    };
    await writeJson(recordPath, record);

    return {
      record,
      content: { kind: 'filesystem', path: contentPath },
    };
  }
}

async function listSlugIndexFiles(dir: string): Promise<string[]> {
  const { promises: fs } = await import('fs');
  if (!exists(dir)) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.json'))
    .map((e) => path.join(dir, e.name));
}
