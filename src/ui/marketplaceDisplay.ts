import { ProviderResult } from '../types/index.js';
import { InstallCandidate } from '../services/marketplace.service.js';

type MarketplaceLike = ProviderResult | InstallCandidate;

export function titleize(value: string): string {
  return value
    .split(/[-_\s]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function sourceLabel(item: MarketplaceLike): string {
  const sources = item.sources?.length ? item.sources : [item.source];
  return sources.join(' + ');
}

export function statusLabel(item: MarketplaceLike): string | undefined {
  return item.installed ? 'installed' : undefined;
}

export function metadataParts(item: MarketplaceLike): string[] {
  const parts: string[] = [];

  if (item.version) {
    parts.push(`v${item.version}`);
  }

  if (item.updated) {
    parts.push(`Updated ${item.updated}`);
  }

  parts.push(`Source: ${sourceLabel(item)}`);
  return parts;
}

export function verifiedBadge(verified?: boolean): string {
  return verified ? ' ✓ Aman' : '';
}

export function shortDescription(description?: string, maxLength = 120): string | undefined {
  if (!description) return undefined;
  const normalized = description.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}
