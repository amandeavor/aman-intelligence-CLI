import {
  clearMarketplaceCache,
  getMarketplaceCacheStatus,
  MARKETPLACE_CACHE_DIR,
} from '../marketplace/cache.js';
import { MARKETPLACE_ENABLED } from '../config/features.js';

export async function cacheCommand(args: string[]) {
  if (!MARKETPLACE_ENABLED) {
    console.log('\n  Marketplace cache is not available yet (coming in a future release).\n');
    return;
  }

  const sub = args[0] ?? 'status';

  if (sub === 'clear') {
    const removed = await clearMarketplaceCache();
    console.log(`Cleared marketplace cache (${removed} entries).`);
    return;
  }

  if (sub === 'status') {
    const status = await getMarketplaceCacheStatus();
    console.log('\n  Marketplace cache\n');
    console.log(`  Location:     ${MARKETPLACE_CACHE_DIR}`);
    console.log(`  Entries:      ${status.entryCount}`);
    console.log(`  Size:         ${formatBytes(status.totalBytes)}`);
    if (status.newestAgeMinutes !== null) {
      console.log(`  Newest entry: ${status.newestAgeMinutes} minutes ago`);
    }
    if (status.oldestAgeMinutes !== null) {
      console.log(`  Oldest entry: ${status.oldestAgeMinutes} minutes ago`);
    }
    console.log('  TTL:          1 hour\n');
    return;
  }

  console.log('Usage: aman cache <status|clear>');
  process.exit(1);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
