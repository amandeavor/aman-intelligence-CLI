import { promises as fs } from 'fs';
import path from 'path';
import { AssetType } from '../types/index.js';
import { exists, ensureDir, readJson, writeJson, listDirs, listFiles, removeDir } from './filesystem.js';
import { computeAssetChecksum } from '../utils/integrity.js';
import { normalizeAssetMetadata } from '../types/asset-metadata.js';

export const CONTENT_FILES: Record<AssetType, string> = {
  skill: 'SKILL.md',
  prompt: 'PROMPT.md',
  mcp: 'mcp.json',
};

export function assetDir(type: AssetType, typeRoot: string, localName: string): string {
  return path.join(typeRoot, localName);
}

export function contentFilePath(assetDirectory: string, type: AssetType): string {
  return path.join(assetDirectory, CONTENT_FILES[type]);
}

export function metadataFilePath(assetDirectory: string): string {
  return path.join(assetDirectory, 'metadata.json');
}

export function mcpLocalFilePath(assetDirectory: string): string {
  return path.join(assetDirectory, 'mcp.local.json');
}

export function isCanonicalAssetDir(type: AssetType, dirPath: string): boolean {
  if (!exists(dirPath)) return false;
  return exists(contentFilePath(dirPath, type)) && exists(metadataFilePath(dirPath));
}

/** Flat prompt: prompts/{name}.md + optional prompts/{name}.md.metadata.json */
export function flatPromptPaths(typeRoot: string, localName: string) {
  return {
    md: path.join(typeRoot, `${localName}.md`),
    metadata: path.join(typeRoot, `${localName}.md.metadata.json`),
  };
}

/** Flat MCP: mcps/{name}.json + optional mcps/{name}.json.metadata.json */
export function flatMcpPaths(typeRoot: string, localName: string) {
  return {
    json: path.join(typeRoot, `${localName}.json`),
    metadata: path.join(typeRoot, `${localName}.json.metadata.json`),
    local: path.join(typeRoot, `${localName}.local.json`),
  };
}

export function detectPromptLayout(typeRoot: string, localName: string): 'canonical' | 'flat' | 'missing' {
  const dir = assetDir('prompt', typeRoot, localName);
  if (isCanonicalAssetDir('prompt', dir)) return 'canonical';
  const flat = flatPromptPaths(typeRoot, localName);
  if (exists(flat.md)) return 'flat';
  return 'missing';
}

export function detectMcpLayout(typeRoot: string, localName: string): 'canonical' | 'flat' | 'missing' {
  const dir = assetDir('mcp', typeRoot, localName);
  if (isCanonicalAssetDir('mcp', dir)) return 'canonical';
  const flat = flatMcpPaths(typeRoot, localName);
  if (exists(flat.json)) return 'flat';
  return 'missing';
}

async function readMetadataFromFlatOrDir(
  type: 'prompt' | 'mcp',
  typeRoot: string,
  localName: string,
  layout: 'canonical' | 'flat'
): Promise<Record<string, unknown> | null> {
  if (layout === 'canonical') {
    return readJson<Record<string, unknown>>(metadataFilePath(assetDir(type, typeRoot, localName)));
  }
  const flatMeta =
    type === 'prompt'
      ? flatPromptPaths(typeRoot, localName).metadata
      : flatMcpPaths(typeRoot, localName).metadata;
  return readJson<Record<string, unknown>>(flatMeta);
}

/**
 * Migrates flat prompt/MCP files into canonical directory layout.
 * Preserves content bytes (checksum unchanged). Removes flat files after success.
 */
export async function migratePromptFlatToCanonical(typeRoot: string, localName: string): Promise<boolean> {
  const layout = detectPromptLayout(typeRoot, localName);
  if (layout !== 'flat') return layout === 'canonical';

  const flat = flatPromptPaths(typeRoot, localName);
  const destDir = assetDir('prompt', typeRoot, localName);
  await ensureDir(destDir);

  await fs.copyFile(flat.md, contentFilePath(destDir, 'prompt'));

  const existingMeta = await readMetadataFromFlatOrDir('prompt', typeRoot, localName, 'flat');
  const metadata = existingMeta
    ? normalizeAssetMetadata(existingMeta, 'prompt', localName)
    : normalizeAssetMetadata({}, 'prompt', localName);

  const checksum = await computeAssetChecksum('prompt', destDir);
  metadata.integrity.checksum = checksum;
  await writeJson(metadataFilePath(destDir), metadata);

  await fs.unlink(flat.md);
  if (exists(flat.metadata)) await fs.unlink(flat.metadata);

  return true;
}

export async function migrateMcpFlatToCanonical(typeRoot: string, localName: string): Promise<boolean> {
  const layout = detectMcpLayout(typeRoot, localName);
  if (layout !== 'flat') return layout === 'canonical';

  const flat = flatMcpPaths(typeRoot, localName);
  const destDir = assetDir('mcp', typeRoot, localName);
  await ensureDir(destDir);

  await fs.copyFile(flat.json, contentFilePath(destDir, 'mcp'));

  if (exists(flat.local)) {
    await fs.copyFile(flat.local, mcpLocalFilePath(destDir));
  }

  const existingMeta = await readMetadataFromFlatOrDir('mcp', typeRoot, localName, 'flat');
  const metadata = existingMeta
    ? normalizeAssetMetadata(existingMeta, 'mcp', localName)
    : normalizeAssetMetadata({}, 'mcp', localName);

  const checksum = await computeAssetChecksum('mcp', destDir);
  metadata.integrity.checksum = checksum;
  await writeJson(metadataFilePath(destDir), metadata);

  await fs.unlink(flat.json);
  if (exists(flat.metadata)) await fs.unlink(flat.metadata);
  if (exists(flat.local)) await fs.unlink(flat.local);

  return true;
}

/** Scan type root for flat files and migrate each. Returns count migrated. */
export async function migrateTypeRootLayout(type: 'prompt' | 'mcp', typeRoot: string): Promise<number> {
  if (!exists(typeRoot)) return 0;
  let migrated = 0;

  if (type === 'prompt') {
    const flatFiles = await listFiles(typeRoot, '.md');
    for (const file of flatFiles) {
      if (file.endsWith('.metadata.json')) continue;
      const localName = file.replace(/\.md$/, '');
      if (await migratePromptFlatToCanonical(typeRoot, localName)) migrated++;
    }
  } else {
    const flatFiles = await listFiles(typeRoot, '.json');
    for (const file of flatFiles) {
      if (file.endsWith('.metadata.json') || file.endsWith('.local.json')) continue;
      const localName = file.replace(/\.json$/, '');
      if (await migrateMcpFlatToCanonical(typeRoot, localName)) migrated++;
    }
  }

  return migrated;
}

/** Migrate prompts/ and mcps/ under a scope root (.aman or global env). */
export async function migrateScopeLayout(scopeRoot: string): Promise<{ prompts: number; mcps: number }> {
  const promptsRoot = path.join(scopeRoot, 'prompts');
  const mcpsRoot = path.join(scopeRoot, 'mcps');
  const result = {
    prompts: await migrateTypeRootLayout('prompt', promptsRoot),
    mcps: await migrateTypeRootLayout('mcp', mcpsRoot),
  };
  if (exists(mcpsRoot)) {
    const { ensureMcpLocalGitignore } = await import('../utils/mcp-local.js');
    await ensureMcpLocalGitignore(scopeRoot);
  }
  return result;
}

export interface LayoutViolation {
  type: AssetType;
  localName: string;
  issue: string;
}

/** Lists assets not in canonical directory layout (post-migration). */
export async function findLayoutViolations(scopeRoot: string): Promise<LayoutViolation[]> {
  const violations: LayoutViolation[] = [];

  const skillsRoot = path.join(scopeRoot, 'skills');
  if (exists(skillsRoot)) {
    for (const name of await listDirs(skillsRoot)) {
      const dir = assetDir('skill', skillsRoot, name);
      if (!isCanonicalAssetDir('skill', dir)) {
        violations.push({ type: 'skill', localName: name, issue: 'missing SKILL.md or metadata.json in asset directory' });
      }
    }
    for (const file of await listFiles(skillsRoot, '.md')) {
      violations.push({ type: 'skill', localName: file, issue: 'unexpected flat file in skills/' });
    }
  }

  const promptsRoot = path.join(scopeRoot, 'prompts');
  if (exists(promptsRoot)) {
    for (const file of await listFiles(promptsRoot, '.md')) {
      violations.push({
        type: 'prompt',
        localName: file.replace(/\.md$/, ''),
        issue: 'flat prompt file (expected prompts/{name}/PROMPT.md)',
      });
    }
    for (const name of await listDirs(promptsRoot)) {
      const dir = assetDir('prompt', promptsRoot, name);
      if (!isCanonicalAssetDir('prompt', dir)) {
        violations.push({ type: 'prompt', localName: name, issue: 'prompt directory missing PROMPT.md or metadata.json' });
      }
    }
  }

  const mcpsRoot = path.join(scopeRoot, 'mcps');
  if (exists(mcpsRoot)) {
    for (const file of await listFiles(mcpsRoot, '.json')) {
      if (file.endsWith('.metadata.json') || file.endsWith('.local.json')) {
        violations.push({ type: 'mcp', localName: file, issue: 'flat MCP sidecar at mcps/ root (expected directory layout)' });
        continue;
      }
      violations.push({
        type: 'mcp',
        localName: file.replace(/\.json$/, ''),
        issue: 'flat mcp.json file (expected mcps/{name}/mcp.json)',
      });
    }
    for (const name of await listDirs(mcpsRoot)) {
      const dir = assetDir('mcp', mcpsRoot, name);
      if (!isCanonicalAssetDir('mcp', dir)) {
        violations.push({ type: 'mcp', localName: name, issue: 'MCP directory missing mcp.json or metadata.json' });
      }
    }
  }

  return violations;
}

/**
 * Install content from src (file or directory) into canonical asset directory.
 */
export async function materializeAssetDirectory(
  type: AssetType,
  src: string,
  destDir: string
): Promise<void> {
  await ensureDir(destDir);
  const contentDest = contentFilePath(destDir, type);

  if (type === 'skill') {
    if (exists(path.join(src, 'SKILL.md'))) {
      await copyDirContents(src, destDir);
      return;
    }
    throw new Error(`Invalid skill source: ${src}`);
  }

  if (type === 'prompt') {
    const canonicalSrc = path.join(src, 'PROMPT.md');
    if (exists(canonicalSrc)) {
      await copyDirContents(src, destDir);
      return;
    }
    if (src.endsWith('.md') && exists(src)) {
      await fs.copyFile(src, contentDest);
      return;
    }
    throw new Error(`Invalid prompt source: ${src}`);
  }

  const canonicalMcp = path.join(src, 'mcp.json');
  if (exists(canonicalMcp)) {
    await copyDirContents(src, destDir);
    return;
  }
  if (src.endsWith('.json') && exists(src)) {
    await fs.copyFile(src, contentDest);
    return;
  }
  throw new Error(`Invalid MCP source: ${src}`);
}

async function copyDirContents(src: string, dest: string): Promise<void> {
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await ensureDir(destPath);
      await copyDirContents(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

/** Resolve bundled/default source path (flat file or directory). */
export function resolveBundledSource(type: AssetType, bundledDir: string, localName: string): string {
  const dir = assetDir(type, bundledDir, localName);
  if (type === 'skill' && exists(path.join(dir, 'SKILL.md'))) return dir;
  if (type === 'prompt' && exists(path.join(dir, 'PROMPT.md'))) return dir;
  if (type === 'mcp' && exists(path.join(dir, 'mcp.json'))) return dir;

  if (type === 'skill') return dir;
  if (type === 'prompt') return path.join(bundledDir, `${localName}.md`);
  return path.join(bundledDir, `${localName}.json`);
}
