import { scanSkills, scanPrompts, scanMcps } from './scanner.js';
import { AssetListItem, AssetType } from '../types/index.js';

export async function scanAssetsByType(
  type: AssetType,
  dir: string,
  source: string
): Promise<AssetListItem[]> {
  if (type === 'skill') return scanSkills(dir, source);
  if (type === 'prompt') return scanPrompts(dir, source);
  return scanMcps(dir, source);
}
