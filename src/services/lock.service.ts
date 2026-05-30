import path from 'path';
import { LOCAL_LOCKFILE } from '../config/paths.js';
import { exists, readJson, writeJson } from '../storage/filesystem.js';
import { promises as fs } from 'fs';
import { Lockfile, LockEntry, AssetType, Scope } from '../types/index.js';
import { environmentService } from './environment.service.js';
import { isLegacyLockfile, normalizeLockfile } from '../utils/lock-migrate.js';
import { migrateScopeLayout } from '../storage/asset-layout.js';
import { LOCAL_DIR } from '../config/paths.js';

export class LockService {
  private async getLockfilePath(scope: Scope): Promise<string> {
    return scope === 'global' ? path.join(environmentService.getActiveEnvironmentDir(), 'aman.lock') : LOCAL_LOCKFILE;
  }

  private scopeRoot(scope: Scope): string {
    return scope === 'global' ? environmentService.getActiveEnvironmentDir() : LOCAL_DIR;
  }

  async read(scope: Scope): Promise<Lockfile> {
    const lockPath = await this.getLockfilePath(scope);
    await migrateScopeLayout(this.scopeRoot(scope));

    let raw = await readJson<Record<string, unknown>>(lockPath);
    if (raw === null && exists(lockPath)) {
      await this.quarantineCorruptFile(lockPath, 'lock');
      raw = null;
    }

    const lockfile = normalizeLockfile(raw as Parameters<typeof normalizeLockfile>[0], scope);

    if (raw && isLegacyLockfile(raw as Parameters<typeof isLegacyLockfile>[0])) {
      await writeJson(lockPath, lockfile);
    }

    return lockfile;
  }

  private async quarantineCorruptFile(filePath: string, label: string): Promise<void> {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${filePath}.corrupt-${stamp}`;
    try {
      await fs.rename(filePath, backupPath);
      console.warn(`  Warning: Corrupt ${label} file quarantined to ${backupPath}`);
    } catch {
      // If rename fails, leave file in place; normalizeLockfile still returns empty
    }
  }

  async write(scope: Scope, lockfile: Lockfile): Promise<void> {
    await migrateScopeLayout(this.scopeRoot(scope));
    const lockPath = await this.getLockfilePath(scope);
    await writeJson(lockPath, {
      ...lockfile,
      schemaVersion: 1,
      scope,
      generatedAt: new Date().toISOString(),
    });
  }

  getEntries(lockfile: Lockfile): LockEntry[] {
    return lockfile.assets;
  }

  async addEntry(scope: Scope, entry: LockEntry): Promise<void> {
    const lockfile = await this.read(scope);
    const existingIndex = lockfile.assets.findIndex(
      (e) => e.type === entry.type && e.localName === entry.localName
    );

    if (existingIndex >= 0) {
      lockfile.assets[existingIndex] = { ...entry, scope };
    } else {
      lockfile.assets.push({ ...entry, scope });
    }

    await this.write(scope, lockfile);
  }

  async removeEntry(scope: Scope, localName: string, type: AssetType): Promise<void> {
    const lockfile = await this.read(scope);
    lockfile.assets = lockfile.assets.filter((e) => !(e.type === type && e.localName === localName));
    await this.write(scope, lockfile);
  }
}

export const lockService = new LockService();
