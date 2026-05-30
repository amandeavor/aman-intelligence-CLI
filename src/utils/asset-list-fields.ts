import { AssetListItem, Skill } from '../types/index.js';

/** Optional listing fields shared across asset kinds (for union-safe access). */
export function assetListDescription(item: AssetListItem): string | undefined {
  return 'description' in item ? item.description : undefined;
}

export function assetListTags(item: AssetListItem): string[] | undefined {
  return 'tags' in item ? item.tags : undefined;
}

export function assetListCategory(item: AssetListItem): string | undefined {
  return 'category' in item ? item.category : undefined;
}

export function assetListInstalls(item: AssetListItem): number | undefined {
  return 'installs' in item ? item.installs : undefined;
}

export function assetListRating(item: AssetListItem): number | undefined {
  return 'rating' in item ? item.rating : undefined;
}

export function assetListUpdated(item: AssetListItem): string | undefined {
  return 'updated' in item ? item.updated : undefined;
}

export function assetListVersion(item: AssetListItem): string | undefined {
  return 'version' in item ? item.version : undefined;
}

export function assetListOrganization(item: AssetListItem): string | undefined {
  return 'organization' in item ? item.organization : undefined;
}

export function assetListOriginalName(item: AssetListItem): string | undefined {
  return 'originalName' in item ? (item as Skill).originalName : undefined;
}
