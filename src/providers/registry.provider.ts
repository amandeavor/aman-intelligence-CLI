import { AssetProvider } from './provider.interface.js';
import { AssetType, ProviderResult } from '../types/index.js';
import { registryService } from '../registry/registry.service.js';
import { localNameFromSlug } from '../utils/slug.js';

export const registryProvider: AssetProvider = {
  name: 'registry',

  async available(): Promise<boolean> {
    return registryService.getAdapter().available();
  },

  async search(query: string, type?: AssetType): Promise<ProviderResult[]> {
    const result = await registryService.search({
      query,
      filters: type ? { type, includeDeprecated: true } : { includeDeprecated: true },
    });

    return result.hits.map((hit) => ({
      name: localNameFromSlug(hit.slug),
      type: hit.record.type,
      source: 'registry',
      sources: ['registry'],
      description: hit.record.description,
      tags: hit.record.tags,
      version: hit.latestVersion,
      organization: hit.record.trust.publisher ?? undefined,
      installs: hit.record.trust.downloads,
      rating: hit.record.trust.rating ?? undefined,
      confidence: hit.record.trust.verified ? 1 : 0.5,
      installed: false,
      slug: hit.slug,
    }));
  },

  async fetch(name: string, type: AssetType): Promise<string> {
    const slug = name.startsWith('@') ? name : `@aman/${name}`;
    const listed = await registryService.list({ slug });
    const match = listed.versions.find((v) => v.type === type);
    if (!match) {
      throw new Error(`Registry asset not found: ${slug} (${type})`);
    }
    const resolved = await registryService.resolve({ slug, version: match.version });
    if (resolved.content.kind !== 'filesystem') {
      throw new Error('Registry provider requires filesystem content');
    }
    return resolved.content.path;
  },
};
