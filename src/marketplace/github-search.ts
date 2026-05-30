import { AssetType } from '../types/index.js';
import { defaultSlugForName } from '../utils/slug.js';
import { parsePublisherMetadata, isVerifiedPublisherSlug } from './metadata-validator.js';
import {
  isCacheFresh,
  readMarketplaceCache,
  writeMarketplaceCache,
} from './cache.js';
import { MarketplaceAsset, MarketplaceSearchResult, MarketplaceTypeFilter } from './types.js';

const GITHUB_API = 'https://api.github.com';
const REQUEST_TIMEOUT_MS = 10_000;
const USER_AGENT = 'aman-cli-marketplace';

interface GitHubRepoSearchItem {
  full_name: string;
  stargazers_count: number;
  default_branch: string;
  description?: string | null;
}

interface GitHubRepoSearchResponse {
  items: GitHubRepoSearchItem[];
}

interface GitHubContentEntry {
  name: string;
  type: 'file' | 'dir' | string;
}

class GitHubMarketplaceError extends Error {
  constructor(
    message: string,
    readonly rateLimited: boolean = false,
    readonly offline: boolean = false
  ) {
    super(message);
    this.name = 'GitHubMarketplaceError';
  }
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': USER_AGENT,
        ...(init?.headers ?? {}),
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new GitHubMarketplaceError('GitHub request timed out (10s)', false, false);
    }
    throw new GitHubMarketplaceError('Network unavailable', false, true);
  } finally {
    clearTimeout(timer);
  }
}

function buildSearchQuery(userQuery: string): string {
  const q = userQuery.trim();
  if (!q) return 'topic:aman-asset';
  return `topic:aman-asset ${q}`;
}

async function searchRepositories(userQuery: string): Promise<GitHubRepoSearchItem[]> {
  const q = encodeURIComponent(buildSearchQuery(userQuery));
  const url = `${GITHUB_API}/search/repositories?q=${q}&sort=stars&order=desc&per_page=30`;
  const res = await fetchWithTimeout(url);

  if (res.status === 403 || res.status === 429) {
    const remaining = res.headers.get('x-ratelimit-remaining');
    throw new GitHubMarketplaceError(
      `GitHub API rate limit exceeded${remaining !== null ? ` (${remaining} remaining)` : ''}. Try again later or use cached results.`,
      true,
      false
    );
  }

  if (!res.ok) {
    throw new GitHubMarketplaceError(`GitHub search failed (${res.status})`, false, res.status >= 500);
  }

  const data = (await res.json()) as GitHubRepoSearchResponse;
  return data.items ?? [];
}

async function listRepoDirectories(
  owner: string,
  repo: string,
  branch: string,
  typeFolder: string
): Promise<string[]> {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${typeFolder}?ref=${encodeURIComponent(branch)}`;
  const res = await fetchWithTimeout(url);
  if (res.status === 404) return [];
  if (res.status === 403 || res.status === 429) {
    throw new GitHubMarketplaceError('GitHub API rate limit exceeded while listing assets', true, false);
  }
  if (!res.ok) return [];

  const entries = (await res.json()) as GitHubContentEntry[];
  if (!Array.isArray(entries)) return [];
  return entries.filter((e) => e.type === 'dir').map((e) => e.name);
}

async function fetchRawMetadata(
  owner: string,
  repo: string,
  branch: string,
  type: AssetType,
  localName: string
): Promise<unknown | null> {
  const typeFolder = type === 'skill' ? 'skills' : type === 'prompt' ? 'prompts' : 'mcps';
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${typeFolder}/${localName}/metadata.json`;
  const res = await fetchWithTimeout(url);
  if (res.status === 404) return null;
  if (res.status === 403 || res.status === 429) {
    throw new GitHubMarketplaceError('GitHub rate limit exceeded while fetching metadata', true, false);
  }
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function discoverAssetsInRepo(item: GitHubRepoSearchItem): Promise<MarketplaceAsset[]> {
  const [owner, repo] = item.full_name.split('/');
  if (!owner || !repo) return [];

  const branch = item.default_branch || 'main';
  const source = `github:${owner}/${repo}`;
  const stars = item.stargazers_count ?? 0;
  const assets: MarketplaceAsset[] = [];

  const typeFolders: { type: AssetType; folder: string }[] = [
    { type: 'skill', folder: 'skills' },
    { type: 'prompt', folder: 'prompts' },
    { type: 'mcp', folder: 'mcps' },
  ];

  for (const { type, folder } of typeFolders) {
    let names: string[];
    try {
      names = await listRepoDirectories(owner, repo, branch, folder);
    } catch {
      continue;
    }

    for (const localName of names) {
      try {
        const raw = await fetchRawMetadata(owner, repo, branch, type, localName);
        if (!raw) continue;

        const fallbackSlug = defaultSlugForName(localName, owner);
        const meta = parsePublisherMetadata(raw, type, localName, fallbackSlug, owner);

        const checksum =
          meta.integrity?.checksum ??
          'sha256:0000000000000000000000000000000000000000000000000000000000000000';

        assets.push({
          slug: meta.slug,
          type: meta.type,
          name: meta.name,
          localName: meta.name,
          description: meta.description || item.description || '',
          version: meta.version,
          author: meta.author,
          tags: meta.tags,
          stars,
          source,
          verified: isVerifiedPublisherSlug(meta.slug),
          owner,
          repo,
          defaultBranch: branch,
          contentPath: `${folder}/${localName}`,
          checksum,
          id: meta.id,
          updatedAt: meta.updatedAt,
        });
      } catch {
        // Skip invalid or rejected metadata
      }
    }
  }

  return assets;
}

function filterByType(assets: MarketplaceAsset[], typeFilter: MarketplaceTypeFilter): MarketplaceAsset[] {
  if (typeFilter === 'all') return assets;
  return assets.filter((a) => a.type === typeFilter);
}

function filterByQuery(assets: MarketplaceAsset[], query: string): MarketplaceAsset[] {
  const q = query.trim().toLowerCase();
  if (!q) return assets;
  return assets.filter((a) => {
    const haystack = [a.name, a.slug, a.description, a.author, ...(a.tags ?? [])]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

function sortAssets(
  assets: MarketplaceAsset[],
  sort: 'stars' | 'recent' | 'name'
): MarketplaceAsset[] {
  const copy = [...assets];
  if (sort === 'stars') {
    return copy.sort((a, b) => b.stars - a.stars || a.name.localeCompare(b.name));
  }
  if (sort === 'recent') {
    return copy.sort((a, b) => {
      const ta = a.updatedAt ? Date.parse(a.updatedAt) : 0;
      const tb = b.updatedAt ? Date.parse(b.updatedAt) : 0;
      return tb - ta || b.stars - a.stars;
    });
  }
  return copy.sort((a, b) => a.name.localeCompare(b.name));
}

function cacheAgeMinutes(ageMs: number): number {
  return Math.max(0, Math.round(ageMs / 60000));
}

/**
 * Search GitHub for `topic:aman-asset` publisher repos and load validated metadata.
 * Uses ~/.aman/cache/marketplace/ with 1h TTL; serves stale cache on rate limit/offline.
 */
export async function searchGitHubMarketplace(options: {
  query?: string;
  typeFilter?: MarketplaceTypeFilter;
  sort?: 'stars' | 'recent' | 'name';
  forceRefresh?: boolean;
}): Promise<MarketplaceSearchResult> {
  const query = options.query ?? '';
  const typeFilter = options.typeFilter ?? 'all';
  const sort = options.sort ?? 'stars';
  const cached = await readMarketplaceCache(query, typeFilter);
  const fresh = cached && isCacheFresh(cached.ageMs);

  if (cached && fresh && !options.forceRefresh) {
    return {
      assets: sortAssets(filterByQuery(cached.assets, query), sort),
      fromCache: true,
      cacheAgeMinutes: cacheAgeMinutes(cached.ageMs),
      rateLimited: false,
      offline: false,
    };
  }

  try {
    const repos = await searchRepositories(query);
    const all: MarketplaceAsset[] = [];
    for (const repo of repos) {
      const discovered = await discoverAssetsInRepo(repo);
      all.push(...discovered);
    }

    const filtered = filterByQuery(filterByType(all, typeFilter), query);
    const sorted = sortAssets(filtered, sort);

    await writeMarketplaceCache(query, typeFilter, sorted);

    return {
      assets: sorted,
      fromCache: false,
      cacheAgeMinutes: 0,
      rateLimited: false,
      offline: false,
    };
  } catch (err) {
    const rateLimited = err instanceof GitHubMarketplaceError && err.rateLimited;
    const offline = err instanceof GitHubMarketplaceError && err.offline;

    if (cached) {
      return {
        assets: sortAssets(filterByQuery(cached.assets, query), sort),
        fromCache: true,
        cacheAgeMinutes: cacheAgeMinutes(cached.ageMs),
        rateLimited,
        offline,
        message: err instanceof Error ? err.message : String(err),
      };
    }

    return {
      assets: [],
      fromCache: false,
      cacheAgeMinutes: null,
      rateLimited,
      offline,
      message:
        offline || rateLimited
          ? 'Marketplace unavailable (offline). No cached results.'
          : err instanceof Error
            ? err.message
            : String(err),
    };
  }
}

const assetIndex = new Map<string, MarketplaceAsset>();

export function indexMarketplaceAssets(assets: MarketplaceAsset[]): void {
  for (const a of assets) {
    assetIndex.set(a.slug.toLowerCase(), a);
    assetIndex.set(a.name.toLowerCase(), a);
    assetIndex.set(a.localName.toLowerCase(), a);
  }
}

export function findMarketplaceAsset(ref: string): MarketplaceAsset | undefined {
  const key = ref.trim().toLowerCase();
  return assetIndex.get(key);
}

export async function loadMarketplaceIndex(options?: {
  query?: string;
  typeFilter?: MarketplaceTypeFilter;
}): Promise<MarketplaceSearchResult> {
  const result = await searchGitHubMarketplace({
    query: options?.query ?? '',
    typeFilter: options?.typeFilter ?? 'all',
  });
  indexMarketplaceAssets(result.assets);
  return result;
}
