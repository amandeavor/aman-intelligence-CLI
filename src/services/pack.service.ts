import path from 'path';
import os from 'os';
import archiver from 'archiver';
import { createWriteStream } from 'fs';
import { spawnSync } from 'child_process';
import { exists, ensureDir, writeJson, removeDir, readJson } from '../storage/filesystem.js';
import { Pack, Scope } from '../types/index.js';
import { environmentService } from './environment.service.js';
import { lockService } from './lock.service.js';
import { defaultSlugForName } from '../utils/slug.js';
import { randomUUID } from 'crypto';
import { assetDir, migrateScopeLayout, contentFilePath } from '../storage/asset-layout.js';
import { mcpRequiresLocalConfig } from '../utils/mcp-local.js';

export class PackService {
  async create(name: string, packData: Pack, outputPath: string): Promise<void> {
    await ensureDir(path.dirname(outputPath));

    return new Promise((resolve, reject) => {
      const output = createWriteStream(outputPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => resolve());
      archive.on('error', (err) => reject(err));

      archive.pipe(output);

      // Add manifest
      archive.append(JSON.stringify(packData, null, 2), { name: 'manifest.json' });

      // Add skills
      for (const skill of packData.skills) {
        const skillPath = path.join(environmentService.getActiveEnvironmentDir(), 'skills', skill);
        if (exists(skillPath)) {
          archive.directory(skillPath, `skills/${skill}`);
        }
      }

      const envDir = environmentService.getActiveEnvironmentDir();
      const promptsRoot = path.join(envDir, 'prompts');
      const mcpsRoot = path.join(envDir, 'mcps');

      for (const prompt of packData.prompts) {
        const promptDir = assetDir('prompt', promptsRoot, prompt);
        if (exists(promptDir)) {
          archive.directory(promptDir, `prompts/${prompt}`);
        }
      }

      for (const mcp of packData.mcps) {
        const mcpDirPath = assetDir('mcp', mcpsRoot, mcp);
        if (exists(mcpDirPath)) {
          archive.directory(mcpDirPath, `mcps/${mcp}`);
        }
      }

      // Add stacks
      for (const stack of packData.stacks) {
        const stackPath = path.join(environmentService.getActiveEnvironmentDir(), 'stacks', `${stack}.json`);
        if (exists(stackPath)) {
          archive.file(stackPath, { name: `stacks/${stack}.json` });
        }
      }

      archive.finalize();
    });
  }

  async install(packPath: string, scope: Scope, onProgress?: (progress: number) => void): Promise<void> {
    if (!exists(packPath)) throw new Error(`Pack not found: ${packPath}`);
    
    const tempDir = path.join(os.tmpdir(), `aman-pack-${Date.now()}`);
    await ensureDir(tempDir);

    try {
      this.extractPack(packPath, tempDir);
      onProgress?.(25);

      const files = await this.walk(tempDir);
      const { isPathSafe, readJson, copyDir } = await import('../storage/filesystem.js');
      for (const file of files) {
        const safe = await isPathSafe(file, tempDir);
        if (!safe) {
          throw new Error('Security Exception: Path traversal escape attempt detected inside pack archive!');
        }
      }
      onProgress?.(50);

      const manifestPath = path.join(tempDir, 'manifest.json');
      const manifest = await readJson<Pack>(manifestPath);
      if (!manifest) throw new Error('Invalid pack manifest');

      const targetBase = scope === 'global'
        ? await environmentService.ensureActiveEnvironment()
        : await environmentService.ensureProjectEnvironment();

      // Copy skills
      if (exists(path.join(tempDir, 'skills'))) {
        await copyDir(path.join(tempDir, 'skills'), path.join(targetBase, 'skills'));
      }
      
      // Copy prompts
      if (exists(path.join(tempDir, 'prompts'))) {
        await copyDir(path.join(tempDir, 'prompts'), path.join(targetBase, 'prompts'));
      }

      // Copy mcps
      if (exists(path.join(tempDir, 'mcps'))) {
        await copyDir(path.join(tempDir, 'mcps'), path.join(targetBase, 'mcps'));
      }

      // Copy stacks
      if (exists(path.join(tempDir, 'stacks'))) {
        await copyDir(path.join(tempDir, 'stacks'), path.join(targetBase, 'stacks'));
      }

      await migrateScopeLayout(targetBase);
      onProgress?.(80);

      const packRef = manifest.slug ?? defaultSlugForName(manifest.name);
      const packVersion = manifest.version ?? '1.0.0';
      const installedAt = new Date().toISOString();
      const placeholderChecksum = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';

      const addPackEntry = async (localName: string, type: 'skill' | 'prompt' | 'mcp') => {
        let requiresLocalConfig = false;
        if (type === 'mcp') {
          const mcpDir = assetDir('mcp', path.join(targetBase, 'mcps'), localName);
          const mcpData = await readJson<Record<string, unknown>>(contentFilePath(mcpDir, 'mcp'));
          requiresLocalConfig = mcpData ? mcpRequiresLocalConfig(mcpData) : false;
        }
        await lockService.addEntry(scope, {
          id: randomUUID(),
          slug: defaultSlugForName(localName),
          type,
          localName,
          version: packVersion,
          integrity: { algorithm: 'sha256', checksum: placeholderChecksum },
          source: { kind: 'pack', ref: `pack:${packRef}@${packVersion}` },
          scope,
          installedAt,
          dependencies: [],
          requiresLocalConfig,
        });
      };

      for (const skill of manifest.skills || []) {
        await addPackEntry(skill, 'skill');
      }

      for (const prompt of manifest.prompts || []) {
        await addPackEntry(prompt, 'prompt');
      }

      for (const mcp of manifest.mcps || []) {
        await addPackEntry(mcp, 'mcp');
      }
      onProgress?.(100);

    } finally {
      await removeDir(tempDir);
    }
  }

  async inspect(packPath: string): Promise<Pack> {
    if (!exists(packPath)) throw new Error(`Pack not found: ${packPath}`);
    
    // Simplistic inspect by extracting manifest
    const tempDir = path.join(os.tmpdir(), `aman-pack-inspect-${Date.now()}`);
    await ensureDir(tempDir);

    try {
      this.extractPack(packPath, tempDir);

      const files = await this.walk(tempDir);
      const { isPathSafe, readJson } = await import('../storage/filesystem.js');
      for (const file of files) {
        const safe = await isPathSafe(file, tempDir);
        if (!safe) {
          throw new Error('Security Exception: Path traversal escape attempt detected inside pack archive!');
        }
      }

      const manifestPath = path.join(tempDir, 'manifest.json');
      if (!exists(manifestPath)) throw new Error('Invalid pack: missing manifest.json');

      const manifest = await readJson<Pack>(manifestPath);
      return manifest!;
    } finally {
      await removeDir(tempDir);
    }
  }

  private async walk(root: string): Promise<string[]> {
    const fsPromises = (await import('fs')).promises;
    const entries = await fsPromises.readdir(root, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const fullPath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        files.push(...await this.walk(fullPath));
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
    return files;
  }

  private extractPack(packPath: string, tempDir: string): void {
    const result = process.platform === 'win32'
      ? spawnSync('tar', ['-xf', packPath, '-C', tempDir], { stdio: 'pipe' })
      : spawnSync('unzip', ['-o', packPath, '-d', tempDir], { stdio: 'pipe' });

    if (result.status !== 0) {
      const stderr = result.stderr?.toString() || '';
      const stdout = result.stdout?.toString() || '';
      if (stderr.includes('..') || stderr.includes('path') || stdout.includes('..')) {
        throw new Error('Security Exception: Path traversal escape attempt detected inside pack archive!');
      }
      throw new Error('Could not extract pack.');
    }
  }
}

export const packService = new PackService();
