import { AssetType, ProviderResult } from '../types/index.js';

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  skill: 'Skill',
  prompt: 'Prompt',
  mcp: 'MCP',
};

export const ASSET_TYPE_PLURAL: Record<AssetType, string> = {
  skill: 'Skills',
  prompt: 'Prompts',
  mcp: 'MCPs',
};

/** Tab/display order — MCP, Prompt, Skill (not skill-first). */
export const ASSET_TAB_ORDER: AssetType[] = ['mcp', 'prompt', 'skill'];

export const ASSET_TYPES: AssetType[] = [...ASSET_TAB_ORDER];

export function assetCompositeKey(type: AssetType, localName: string): string {
  return `${type}:${localName}`;
}

export function parseAssetCompositeKey(key: string): { type: AssetType; localName: string } | null {
  const colon = key.indexOf(':');
  if (colon <= 0) return null;
  const type = key.slice(0, colon) as AssetType;
  if (type !== 'skill' && type !== 'prompt' && type !== 'mcp') return null;
  return { type, localName: key.slice(colon + 1) };
}

export function assetTypeBadge(type: AssetType): string {
  return `[${ASSET_TYPE_LABELS[type]}]`;
}

export function groupResultsByType<T extends { type: AssetType }>(
  results: T[]
): Record<AssetType, T[]> {
  const grouped: Record<AssetType, T[]> = { skill: [], prompt: [], mcp: [] };
  for (const item of results) {
    grouped[item.type].push(item);
  }
  return grouped;
}

export function averageConfidence(results: { confidence: number }[]): number {
  if (results.length === 0) return 0;
  const sum = results.reduce((acc, r) => acc + r.confidence, 0);
  return Math.round((sum / results.length) * 100);
}

export function matchesAssetSearch(
  item: Pick<ProviderResult, 'name' | 'description' | 'tags' | 'type'>,
  query: string
): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;
  if (item.name.toLowerCase().includes(q)) return true;
  if (item.description?.toLowerCase().includes(q)) return true;
  if (item.tags?.some((t) => t.toLowerCase().includes(q))) return true;
  if (item.type.toLowerCase().includes(q)) return true;
  if (ASSET_TYPE_LABELS[item.type].toLowerCase().includes(q)) return true;
  if (ASSET_TYPE_PLURAL[item.type].toLowerCase().includes(q)) return true;
  return false;
}
