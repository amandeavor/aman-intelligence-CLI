import { AssetType, ProviderResult } from '../types/index.js';

export interface AssetProvider {
  name: string;
  search(query: string, type?: AssetType): Promise<ProviderResult[]>;
  fetch(name: string, type: AssetType): Promise<string>; // returns temp path or actual path
  available(): Promise<boolean>;
}
