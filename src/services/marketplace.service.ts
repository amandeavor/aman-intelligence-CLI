import { AssetProvider } from '../providers/provider.interface.js';
import { skillsShProvider } from '../providers/skills-sh.provider.js';
import { localProvider } from '../providers/local.provider.js';
import { registryProvider } from '../providers/registry.provider.js';
import { AssetType, ProviderResult } from '../types/index.js';
import { ASSET_TAB_ORDER } from '../ui/assetDisplay.js';
import {
  findMarketplaceAsset,
  indexMarketplaceAssets,
  loadMarketplaceIndex,
  searchGitHubMarketplace,
} from '../marketplace/github-search.js';
import { MarketplaceAsset, MarketplaceSearchResult } from '../marketplace/types.js';
import { MARKETPLACE_ENABLED } from '../config/features.js';

const EMPTY_MARKETPLACE_RESULT: MarketplaceSearchResult = {
  assets: [],
  fromCache: false,
  cacheAgeMinutes: null,
  rateLimited: false,
  offline: false,
};

export interface InstallCandidate {
  name: string;
  type: AssetType;
  source: string;
  sources?: string[];
  sourcePath: string;
  description?: string;
  tags?: string[];
  category?: string;
  installs?: number;
  rating?: number;
  updated?: string;
  version?: string;
  organization?: string;
  installed?: boolean;
  slug?: string;
  checksum?: string;
  verified?: boolean;
  githubSource?: string;
  marketplaceAsset?: MarketplaceAsset;
}

export class MarketplaceService {
  private providers: AssetProvider[] = [registryProvider, skillsShProvider, localProvider];

  listProviders(): string[] {
    return this.providers.map((provider) => provider.name);
  }

  async search(query: string, type?: AssetType): Promise<ProviderResult[]> {
    const localResults: ProviderResult[] = [];

    for (const provider of this.providers) {
      if (!(await provider.available())) continue;
      const results = await provider.search(query, type);
      for (const r of results) {
        localResults.push({ ...r, section: 'local' });
      }
    }

    const mergedLocal = this.mergeResults(localResults);

    if (!MARKETPLACE_ENABLED) {
      return mergedLocal;
    }

    const gh = await searchGitHubMarketplace({
      query,
      typeFilter: type ?? 'all',
    });
    indexMarketplaceAssets(gh.assets);

    let marketplace = gh.assets.map((a) => this.marketplaceAssetToResult(a));
    if (type) {
      marketplace = marketplace.filter((r) => r.type === type);
    }

    return [...mergedLocal, ...marketplace];
  }

  async searchGitHubMarketplace(_query: string, _type?: AssetType): Promise<MarketplaceSearchResult> {
    if (!MARKETPLACE_ENABLED) return { ...EMPTY_MARKETPLACE_RESULT };
    return searchGitHubMarketplace({ query: _query, typeFilter: _type ?? 'all' });
  }

  async loadGitHubMarketplaceCatalog(options?: {
    query?: string;
    typeFilter?: 'all' | AssetType;
  }): Promise<MarketplaceSearchResult> {
    if (!MARKETPLACE_ENABLED) return { ...EMPTY_MARKETPLACE_RESULT };
    return loadMarketplaceIndex({
      query: options?.query ?? '',
      typeFilter: options?.typeFilter ?? 'all',
    });
  }

  private marketplaceAssetToResult(asset: MarketplaceAsset): ProviderResult {
    return {
      type: asset.type,
      name: asset.localName,
      slug: asset.slug,
      source: 'Marketplace',
      sources: ['marketplace'],
      description: asset.description,
      tags: asset.tags,
      version: asset.version,
      organization: asset.author,
      stars: asset.stars,
      verified: asset.verified,
      section: 'marketplace',
      checksum: asset.checksum,
      githubSource: asset.source,
      confidence: 0.95,
      installed: false,
    };
  }

  async findInstallCandidate(name: string): Promise<InstallCandidate | null> {
    const trimmed = name.trim();
    if (MARKETPLACE_ENABLED && trimmed.startsWith('@')) {
      await loadMarketplaceIndex({ query: '' });
      const gh = findMarketplaceAsset(trimmed);
      if (gh) {
        return {
          name: gh.localName,
          type: gh.type,
          source: 'marketplace',
          sources: ['marketplace'],
          sourcePath: '',
          description: gh.description,
          tags: gh.tags,
          version: gh.version,
          organization: gh.author,
          slug: gh.slug,
          checksum: gh.checksum,
          verified: gh.verified,
          githubSource: gh.source,
          marketplaceAsset: gh,
        };
      }
    }

    const types: AssetType[] = ASSET_TAB_ORDER;
    const requestedName = this.normalizeName(name);

    for (const type of types) {
      const mergedMatches = await this.search(name, type);
      const exact = mergedMatches.find((item) => this.normalizeName(item.name) === requestedName);
      if (!exact) continue;

      for (const provider of this.providers) {
        if (!(await provider.available())) continue;

        const providerMatches = await provider.search(exact.name, type);
        const providerExact = providerMatches.find((item) => this.normalizeName(item.name) === this.normalizeName(exact.name));
        if (!providerExact) continue;

        if (exact.section === 'marketplace') {
          await loadMarketplaceIndex({ query: '' });
          const gh =
            findMarketplaceAsset(exact.slug ?? exact.name) ??
            findMarketplaceAsset(exact.name);
          if (gh) {
            return {
              name: gh.localName,
              type: gh.type,
              source: 'marketplace',
              sources: ['marketplace'],
              sourcePath: '',
              description: gh.description,
              tags: gh.tags,
              version: gh.version,
              organization: gh.author,
              slug: gh.slug,
              checksum: gh.checksum,
              verified: gh.verified,
              githubSource: gh.source,
              marketplaceAsset: gh,
            };
          }
        }

        return {
          name: exact.name,
          type: exact.type,
          source: provider.name,
          sources: exact.sources,
          sourcePath: await provider.fetch(exact.name, exact.type),
          description: exact.description,
          tags: exact.tags,
          category: exact.category,
          installs: exact.installs,
          rating: exact.rating,
          updated: exact.updated,
          version: exact.version,
          organization: exact.organization,
          installed: exact.installed,
          slug: exact.slug,
          checksum: exact.checksum,
          verified: exact.verified,
          githubSource: exact.githubSource,
        };
      }
    }

    return null;
  }

  private mergeResults(results: ProviderResult[]): ProviderResult[] {
    const merged = new Map<string, ProviderResult>();

    for (const result of results) {
      const key = `${result.type}:${this.normalizeName(result.name)}`;
      const existing = merged.get(key);

      if (!existing) {
        const sources = this.uniqueSources(result.sources || [result.source]);
        merged.set(key, {
          ...result,
          sources,
          source: sources.join(' + '),
          tags: this.uniqueTags(result.tags),
          installed: Boolean(result.installed || sources.includes('installed')),
        });
        continue;
      }

      const sources = this.uniqueSources([
        ...(existing.sources || [existing.source]),
        ...(result.sources || [result.source]),
      ]);

      merged.set(key, {
        ...existing,
        source: sources.join(' + '),
        sources,
        description: existing.description || result.description,
        tags: this.uniqueTags([...(existing.tags || []), ...(result.tags || [])]),
        category: existing.category || result.category,
        installs: existing.installs ?? result.installs,
        rating: existing.rating ?? result.rating,
        updated: existing.updated || result.updated,
        version: existing.version || result.version,
        organization: existing.organization || result.organization,
        installed: Boolean(existing.installed || result.installed || sources.includes('installed')),
        confidence: Math.max(existing.confidence, result.confidence),
      });
    }

    return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  private normalizeName(value: string): string {
    return value.trim().toLowerCase().replace(/[\s_]+/g, '-');
  }

  private uniqueSources(sources: string[]): string[] {
    const priority = ['installed', 'registry', 'skills.sh', 'bundled', 'local'];
    const unique = Array.from(new Set(sources.filter(Boolean)));
    return unique.sort((a, b) => {
      const aIndex = priority.indexOf(a);
      const bIndex = priority.indexOf(b);
      if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  }

  private uniqueTags(tags?: string[]): string[] | undefined {
    if (!tags) return undefined;
    const unique = Array.from(new Set(tags.filter((tag) => tag.trim().length > 0)));
    return unique.length > 0 ? unique : undefined;
  }
}

export const marketplaceService = new MarketplaceService();
