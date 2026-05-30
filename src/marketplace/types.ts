import { AssetType } from '../types/index.js';

/** Asset discovered from GitHub topic `aman-asset` publisher repositories. */
export interface MarketplaceAsset {
  slug: string;
  type: AssetType;
  name: string;
  localName: string;
  description: string;
  version: string;
  author: string;
  tags: string[];
  stars: number;
  /** Provenance ref written to lockfile: `github:owner/repo` */
  source: string;
  verified: boolean;
  owner: string;
  repo: string;
  defaultBranch: string;
  /** Relative path inside repo, e.g. `skills/my-skill` */
  contentPath: string;
  checksum: string;
  id?: string;
  updatedAt?: string;
}

export interface MarketplaceSearchResult {
  assets: MarketplaceAsset[];
  fromCache: boolean;
  cacheAgeMinutes: number | null;
  rateLimited: boolean;
  offline: boolean;
  message?: string;
}

export type MarketplaceSort = 'stars' | 'recent' | 'name';
export type MarketplaceTypeFilter = 'all' | AssetType;
