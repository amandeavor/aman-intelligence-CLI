import path from 'path';
import { createHash } from 'crypto';
import { GLOBAL_CACHE } from '../config/paths.js';
import { ensureDir, readJson, writeJson, removeDir } from '../storage/filesystem.js';
import { promises as fs } from 'fs';
import { MarketplaceAsset } from './types.js';
import { parsePublisherMetadata } from './metadata-validator.js';

export const MARKETPLACE_CACHE_DIR = path.join(GLOBAL_CACHE, 'marketplace');
const INDEX_FILE = path.join(MARKETPLACE_CACHE_DIR, 'index.json');
export const MARKETPLACE_CACHE_TTL_MS = 60 * 60 * 1000;

interface CacheIndexEntry {
  key: string;
  query: string;
  typeFilter: string;
  fetchedAt: string;
  file: string;
  assetCount: number;
}

interface CacheIndex {
  version: 1;
  entries: CacheIndexEntry[];
}

interface CachedPayload {
  version: 1;
  fetchedAt: string;
  query: string;
  typeFilter: string;
  assets: MarketplaceAsset[];
}

export function marketplaceCacheKey(query: string, typeFilter: string): string {
  return createHash('sha256').update(`${query}\0${typeFilter}`).digest('hex').slice(0, 24);
}

function cacheFilePath(key: string): string {
  return path.join(MARKETPLACE_CACHE_DIR, `${key}.json`);
}

async function readIndex(): Promise<CacheIndex> {
  const data = await readJson<CacheIndex>(INDEX_FILE);
  if (data?.version === 1 && Array.isArray(data.entries)) return data;
  return { version: 1, entries: [] };
}

async function writeIndex(index: CacheIndex): Promise<void> {
  await ensureDir(MARKETPLACE_CACHE_DIR);
  await writeJson(INDEX_FILE, index);
}

function validateCachedAsset(raw: unknown): MarketplaceAsset | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as MarketplaceAsset;
  if (a.type !== 'skill' && a.type !== 'prompt' && a.type !== 'mcp') return null;
  if (typeof a.slug !== 'string' || typeof a.name !== 'string') return null;
  if (typeof a.source !== 'string' || !a.source.startsWith('github:')) return null;

  try {
    parsePublisherMetadata(
      {
        schemaVersion: 1,
        id: a.id ?? a.slug,
        slug: a.slug,
        type: a.type,
        name: a.localName ?? a.name,
        description: a.description ?? '',
        version: a.version ?? '1.0.0',
        author: a.author ?? 'unknown',
        tags: a.tags ?? [],
        integrity: { algorithm: 'sha256', checksum: a.checksum, signature: null },
      },
      a.type,
      a.localName ?? a.name,
      a.slug,
      a.author ?? 'unknown'
    );
  } catch {
    return null;
  }

  return {
    ...a,
    verified: a.slug.startsWith('@aman/'),
  };
}

export async function readMarketplaceCache(
  query: string,
  typeFilter: string
): Promise<{ assets: MarketplaceAsset[]; fetchedAt: Date; ageMs: number } | null> {
  const key = marketplaceCacheKey(query, typeFilter);
  const file = cacheFilePath(key);
  const payload = await readJson<CachedPayload>(file);
  if (!payload?.fetchedAt || !Array.isArray(payload.assets)) return null;

  const valid: MarketplaceAsset[] = [];
  for (const item of payload.assets) {
    const v = validateCachedAsset(item);
    if (v) valid.push(v);
  }

  if (valid.length !== payload.assets.length) {
    await fs.unlink(file).catch(() => {});
    const index = await readIndex();
    index.entries = index.entries.filter((e) => e.key !== key);
    await writeIndex(index);
    return null;
  }

  const fetchedAt = new Date(payload.fetchedAt);
  return { assets: valid, fetchedAt, ageMs: Date.now() - fetchedAt.getTime() };
}

export async function writeMarketplaceCache(
  query: string,
  typeFilter: string,
  assets: MarketplaceAsset[]
): Promise<void> {
  await ensureDir(MARKETPLACE_CACHE_DIR);
  const key = marketplaceCacheKey(query, typeFilter);
  const fetchedAt = new Date().toISOString();
  const payload: CachedPayload = {
    version: 1,
    fetchedAt,
    query,
    typeFilter,
    assets,
  };
  await writeJson(cacheFilePath(key), payload);

  const index = await readIndex();
  const entry: CacheIndexEntry = {
    key,
    query,
    typeFilter,
    fetchedAt,
    file: `${key}.json`,
    assetCount: assets.length,
  };
  const existing = index.entries.findIndex((e) => e.key === key);
  if (existing >= 0) index.entries[existing] = entry;
  else index.entries.push(entry);
  await writeIndex(index);
}

export function isCacheFresh(ageMs: number): boolean {
  return ageMs < MARKETPLACE_CACHE_TTL_MS;
}

export async function getMarketplaceCacheStatus(): Promise<{
  entryCount: number;
  totalBytes: number;
  oldestAgeMinutes: number | null;
  newestAgeMinutes: number | null;
}> {
  await ensureDir(MARKETPLACE_CACHE_DIR);
  const index = await readIndex();
  let totalBytes = 0;
  const ages: number[] = [];
  const now = Date.now();

  for (const entry of index.entries) {
    const file = cacheFilePath(entry.key);
    try {
      const stat = await fs.stat(file);
      totalBytes += stat.size;
      ages.push(now - new Date(entry.fetchedAt).getTime());
    } catch {
      // orphan index entry
    }
  }

  return {
    entryCount: index.entries.length,
    totalBytes,
    oldestAgeMinutes: ages.length ? Math.round(Math.max(...ages) / 60000) : null,
    newestAgeMinutes: ages.length ? Math.round(Math.min(...ages) / 60000) : null,
  };
}

export async function clearMarketplaceCache(): Promise<number> {
  const index = await readIndex();
  const count = index.entries.length;
  await removeDir(MARKETPLACE_CACHE_DIR);
  await ensureDir(MARKETPLACE_CACHE_DIR);
  return count;
}
