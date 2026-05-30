import { Scope } from '../types/index.js';
import { assetService } from '../services/asset.service.js';
import { InstallCandidate } from '../services/marketplace.service.js';
import { installMarketplaceAsset } from './install.js';

export async function installFromCandidate(
  candidate: InstallCandidate,
  scope: Scope
): Promise<{ path: string; checksum: string }> {
  if (candidate.marketplaceAsset) {
    const result = await installMarketplaceAsset(candidate.marketplaceAsset, scope);
    return { path: result.installPath, checksum: result.checksum };
  }

  await assetService.install(
    candidate.name,
    candidate.type,
    scope,
    candidate.sourcePath,
    candidate.source
  );

  const rootLabel = scope === 'project' ? '.aman' : '~/.aman';
  return {
    path: `${rootLabel}/${candidate.type}s/${candidate.name}`,
    checksum: candidate.checksum ?? '',
  };
}
