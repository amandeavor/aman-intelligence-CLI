import { AssetProvider } from './provider.interface.js';
import { AssetType, ProviderResult } from '../types/index.js';
import { assetService } from '../services/asset.service.js';
import {
  assetListCategory,
  assetListDescription,
  assetListInstalls,
  assetListOrganization,
  assetListRating,
  assetListTags,
  assetListUpdated,
  assetListVersion,
} from '../utils/asset-list-fields.js';
import Fuse from 'fuse.js';

export class LocalProvider implements AssetProvider {
  name = 'local';

  async search(query: string, type?: AssetType): Promise<ProviderResult[]> {
    const results: ProviderResult[] = [];
    const types: AssetType[] = type ? [type] : ['skill', 'prompt', 'mcp'];

    for (const t of types) {
      const items = await assetService.list(t);
      for (const item of items) {
        results.push({
          type: t,
          name: item.name,
          source: item.source || this.name,
          sources: [item.source || this.name],
          description: assetListDescription(item),
          tags: assetListTags(item),
          category: assetListCategory(item),
          installs: assetListInstalls(item),
          rating: assetListRating(item),
          updated: assetListUpdated(item),
          version: assetListVersion(item),
          organization: assetListOrganization(item),
          installed: item.source === 'installed',
          confidence: 1.0,
        });
      }
    }

    if (!query) {
      return results;
    }

    const fuse = new Fuse(results, {
      keys: ['name', 'description'],
      threshold: 0.3,
    });

    return fuse.search(query).map((r) => r.item);
  }

  async fetch(name: string, type: AssetType): Promise<string> {
    const items = await assetService.list(type);
    const item = items.find((i) => i.name === name);
    if (!item) {
      throw new Error(`Asset not found in local provider: ${name}`);
    }
    return item.path;
  }

  async available(): Promise<boolean> {
    return true;
  }
}

export const localProvider = new LocalProvider();
