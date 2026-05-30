import path from 'path';
import { LOCAL_DIR, BUNDLED_SKILLS, BUNDLED_PROMPTS, BUNDLED_MCPS } from '../config/paths.js';
import { removeDir, exists, readJson, writeJson } from '../storage/filesystem.js';
import { scanAssetsByType } from '../storage/scan-by-type.js';
import { lockService } from './lock.service.js';
import {
  AssetType,
  Scope,
  createAssetMetadata,
  AssetMetadata,
  AssetListItem,
} from '../types/index.js';
import { environmentService } from './environment.service.js';
import { computeAssetChecksum } from '../utils/integrity.js';
import { defaultSlugForName } from '../utils/slug.js';
import { parseLockSource } from '../utils/lock-migrate.js';
import {
  assetDir,
  materializeAssetDirectory,
  metadataFilePath,
  migrateScopeLayout,
  migrateTypeRootLayout,
  resolveBundledSource,
  contentFilePath,
} from '../storage/asset-layout.js';
import {
  ensureMcpLocalGitignore,
  mcpRequiresLocalConfig,
  scaffoldMcpLocalConfig,
} from '../utils/mcp-local.js';

export class AssetService {
  private scopeRoot(scope: Scope): string {
    return scope === 'global' ? environmentService.getActiveEnvironmentDir() : LOCAL_DIR;
  }

  private getTypeRoot(type: AssetType, scope: Scope): string {
    const root = this.scopeRoot(scope);
    if (type === 'skill') return path.join(root, 'skills');
    if (type === 'prompt') return path.join(root, 'prompts');
    return path.join(root, 'mcps');
  }

  private getBundledDir(type: AssetType): string {
    if (type === 'skill') return BUNDLED_SKILLS;
    if (type === 'prompt') return BUNDLED_PROMPTS;
    return BUNDLED_MCPS;
  }

  private async ensureCanonicalLayout(scope: Scope): Promise<void> {
    await migrateScopeLayout(this.scopeRoot(scope));
  }

  async install(
    name: string,
    type: AssetType,
    scope: Scope,
    sourcePath?: string,
    source = 'local',
    metadataOverride?: Partial<AssetMetadata>
  ): Promise<void> {
    if (scope === 'global') {
      await environmentService.ensureActiveEnvironment();
    } else {
      await environmentService.ensureProjectEnvironment();
    }

    await this.ensureCanonicalLayout(scope);

    const typeRoot = this.getTypeRoot(type, scope);
    const destDir = assetDir(type, typeRoot, name);

    let src = sourcePath;
    if (!src) {
      src = resolveBundledSource(type, this.getBundledDir(type), name);
    }

    if (!exists(src)) {
      throw new Error(`Asset not found: ${src}`);
    }

    if (exists(destDir)) {
      await removeDir(destDir);
    }

    await materializeAssetDirectory(type, src, destDir);

    const installedAt = new Date().toISOString();
    const slug = metadataOverride?.slug ?? defaultSlugForName(metadataOverride?.originalName ?? name);

    const checksum = await computeAssetChecksum(type, destDir);

    let requiresLocalConfig = false;
    if (type === 'mcp') {
      await ensureMcpLocalGitignore(this.scopeRoot(scope));
      const mcpData = await readJson<Record<string, unknown>>(contentFilePath(destDir, 'mcp'));
      requiresLocalConfig = mcpData ? mcpRequiresLocalConfig(mcpData) : false;
      if (requiresLocalConfig) {
        await scaffoldMcpLocalConfig(destDir);
      }
    }

    const metadataContent = createAssetMetadata(type, name, {
      slug,
      source,
      scope,
      installedAt,
      originalName: metadataOverride?.originalName ?? name,
      description: metadataOverride?.description,
      tags: metadataOverride?.tags,
      version: metadataOverride?.version ?? '1.0.0',
      author: metadataOverride?.author,
      id: metadataOverride?.id,
      visibility: metadataOverride?.visibility,
      dependencies: metadataOverride?.dependencies,
      trust: metadataOverride?.trust,
      deprecated: metadataOverride?.deprecated,
      checksum,
      updatedAt: installedAt,
    });

    await writeJson(metadataFilePath(destDir), metadataContent);

    await lockService.addEntry(scope, {
      id: metadataContent.id,
      slug: metadataContent.slug,
      type,
      localName: name,
      version: metadataContent.version,
      integrity: {
        algorithm: 'sha256',
        checksum: metadataContent.integrity.checksum,
      },
      source: parseLockSource(source),
      scope,
      installedAt,
      dependencies: [],
      requiresLocalConfig,
    });
  }

  async remove(name: string, type: AssetType, scope: Scope): Promise<boolean> {
    await this.ensureCanonicalLayout(scope);
    const typeRoot = this.getTypeRoot(type, scope);
    const destDir = assetDir(type, typeRoot, name);

    if (!exists(destDir)) {
      return false;
    }

    await removeDir(destDir);
    await lockService.removeEntry(scope, name, type);
    return true;
  }

  private async ensureBundledCanonical(type: AssetType): Promise<void> {
    if (type === 'skill') return;
    await migrateTypeRootLayout(type, this.getBundledDir(type));
  }

  async list(type: AssetType, scope?: Scope): Promise<AssetListItem[]> {
    const bundledDir = this.getBundledDir(type);
    await this.ensureBundledCanonical(type);

    const bundled = await scanAssetsByType(type, bundledDir, 'bundled');

    let installed: AssetListItem[] = [];
    if (scope) {
      await this.ensureCanonicalLayout(scope);
      installed = await scanAssetsByType(type, this.getTypeRoot(type, scope), 'installed');
    } else {
      await this.ensureCanonicalLayout('global');
      installed = await scanAssetsByType(type, this.getTypeRoot(type, 'global'), 'installed');
    }

    const mergedMap = new Map<string, AssetListItem>();
    for (const item of bundled) mergedMap.set(item.name, item);
    for (const item of installed) mergedMap.set(item.name, item);

    return Array.from(mergedMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }
}

export const assetService = new AssetService();
