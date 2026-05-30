import path from 'path';
import { Scope } from '../types/index.js';
import { LOCAL_DIR } from '../config/paths.js';
import { assetService } from '../services/asset.service.js';
import { environmentService } from '../services/environment.service.js';
import { githubService } from '../services/github.service.js';
import { removeDir } from '../storage/filesystem.js';
import { computeAssetChecksum } from '../utils/integrity.js';
import { assetDir } from '../storage/asset-layout.js';
import { MarketplaceAsset } from './types.js';

function typeRootDir(scope: Scope, type: MarketplaceAsset['type']): string {
  const root = scope === 'global' ? environmentService.getActiveEnvironmentDir() : LOCAL_DIR;
  const folder = type === 'skill' ? 'skills' : type === 'prompt' ? 'prompts' : 'mcps';
  return path.join(root, folder);
}

export interface MarketplaceInstallResult {
  scope: Scope;
  localName: string;
  type: MarketplaceAsset['type'];
  installPath: string;
  source: string;
  checksum: string;
}

/**
 * Install a marketplace asset from its GitHub publisher repo (read-only clone + verify).
 * Does not use registry adapters. Rolls back on checksum failure before lockfile update.
 */
export async function installMarketplaceAsset(
  asset: MarketplaceAsset,
  scope: Scope
): Promise<MarketplaceInstallResult> {
  const repoRef = `${asset.owner}/${asset.repo}`;
  let tempDir: string | undefined;

  try {
    tempDir = await githubService.import(repoRef);
    const srcDir = path.join(tempDir, asset.contentPath);

    const actualChecksum = await computeAssetChecksum(asset.type, srcDir);
    if (asset.checksum && !asset.checksum.endsWith('0000000000000000000000000000000000')) {
      if (actualChecksum !== asset.checksum) {
        throw new Error(
          `Checksum mismatch for ${asset.slug}: expected ${asset.checksum}, got ${actualChecksum}`
        );
      }
    }

    await assetService.install(
      asset.localName,
      asset.type,
      scope,
      srcDir,
      asset.source,
      {
        slug: asset.slug,
        version: asset.version,
        author: asset.author,
        description: asset.description,
        tags: asset.tags,
        id: asset.id,
        originalName: asset.localName,
      }
    );

    const installPath = assetDir(asset.type, typeRootDir(scope, asset.type), asset.localName);

    return {
      scope,
      localName: asset.localName,
      type: asset.type,
      installPath,
      source: asset.source,
      checksum: actualChecksum,
    };
  } finally {
    if (tempDir) {
      await removeDir(tempDir).catch(() => {});
    }
  }
}
