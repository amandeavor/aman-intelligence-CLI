import { MarketplaceAsset } from '../marketplace/types.js';

export interface ListItem {
  label: string;
  value: string;
  description?: string;
  badge?: string;
  metadata?: string[];
  status?: string;
  marketplaceAsset?: MarketplaceAsset;
  rawAsset?: any;
  scope?: 'global' | 'project';
}
