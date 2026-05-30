import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { exists } from '../storage/filesystem.js';
import { AssetType } from '../types/index.js';
import { contentFilePath, CONTENT_FILES } from '../storage/asset-layout.js';

export const INTEGRITY_ALGORITHM = 'sha256' as const;

export function formatChecksum(digest: Buffer): string {
  return `sha256:${digest.toString('hex')}`;
}

export async function hashFileContent(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath);
  return formatChecksum(createHash('sha256').update(content).digest());
}

/**
 * Computes canonical content checksum per AMAN-ASSET-SPEC-V1.
 * `assetPath` MUST be the asset directory (not a flat file).
 */
export async function computeAssetChecksum(type: AssetType, assetDirectory: string): Promise<string> {
  const contentPath = contentFilePath(assetDirectory, type);
  if (!exists(contentPath)) {
    throw new Error(`Missing ${CONTENT_FILES[type]} for checksum: ${assetDirectory}`);
  }
  return hashFileContent(contentPath);
}
