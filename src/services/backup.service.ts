import path from 'path';
import { copyDir, removeDir, exists, ensureDir, listDirs } from '../storage/filesystem.js';
import { promises as fs } from 'fs';
import { environmentService } from './environment.service.js';

export class BackupService {
  async save(name?: string, onProgress?: (progress: number) => void): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = name ? `${timestamp}-${name}` : timestamp;
    const baseDir = environmentService.getActiveEnvironmentDir();
    const backupDir = path.join(baseDir, 'backups', backupName);

    await ensureDir(backupDir);
    onProgress?.(20);

    // Copy relevant directories
    const dirsToBackup = ['skills', 'prompts', 'mcps', 'stacks', 'config'];
    for (const dir of dirsToBackup) {
      const src = path.join(baseDir, dir);
      if (exists(src)) {
        await copyDir(src, path.join(backupDir, dir));
      }
    }
    onProgress?.(80);

    // Also backup aman.lock if exists
    const lockfile = path.join(baseDir, 'aman.lock');
    if (exists(lockfile)) {
      await fs.copyFile(lockfile, path.join(backupDir, 'aman.lock'));
    }
    onProgress?.(100);

    return backupName;
  }

  async list(): Promise<string[]> {
    return await listDirs(path.join(environmentService.getActiveEnvironmentDir(), 'backups'));
  }

  async restore(id: string, onProgress?: (progress: number) => void): Promise<void> {
    const baseDir = environmentService.getActiveEnvironmentDir();
    const backupDir = path.join(baseDir, 'backups', id);
    if (!exists(backupDir)) {
      throw new Error(`Backup not found: ${id}`);
    }

    const manifestProbe = path.join(backupDir, 'skills');
    const hasContent =
      exists(manifestProbe) ||
      exists(path.join(backupDir, 'prompts')) ||
      exists(path.join(backupDir, 'mcps')) ||
      exists(path.join(backupDir, 'aman.lock'));
    if (!hasContent) {
      throw new Error(`Backup appears corrupted or empty: ${id}`);
    }

    const dirsToRestore = ['skills', 'prompts', 'mcps', 'stacks', 'config'];
    const timestamp = Date.now();
    const rollbackSuffix = `.rollback-${timestamp}`;

    const backedUpDirs: string[] = [];
    let lockfileRollbackExists = false;

    const lockfilePath = path.join(baseDir, 'aman.lock');

    try {
      // 1. Staging: Move current active environment directories to rollback paths
      for (const dir of dirsToRestore) {
        const dest = path.join(baseDir, dir);
        if (exists(dest)) {
          const rollbackPath = `${dest}${rollbackSuffix}`;
          await fs.rename(dest, rollbackPath);
          backedUpDirs.push(dir);
        }
      }

      // Rollback lockfile
      const lockfileRollback = `${lockfilePath}${rollbackSuffix}`;
      if (exists(lockfilePath)) {
        await fs.rename(lockfilePath, lockfileRollback);
        lockfileRollbackExists = true;
      }
      onProgress?.(30);

      // 2. Restore new content
      for (const dir of dirsToRestore) {
        const src = path.join(backupDir, dir);
        const dest = path.join(baseDir, dir);
        if (exists(src)) {
          await copyDir(src, dest);
        }
      }

      const lockfileSrc = path.join(backupDir, 'aman.lock');
      if (exists(lockfileSrc)) {
        await fs.copyFile(lockfileSrc, lockfilePath);
      }
      onProgress?.(70);

      // 3. Verification: Explicitly verify that restore succeeded
      await this.verifyRestore(baseDir, backupDir);
      onProgress?.(90);

      // 4. Cleanup: Delete rollback directories on success
      for (const dir of backedUpDirs) {
        const rollbackPath = `${path.join(baseDir, dir)}${rollbackSuffix}`;
        await removeDir(rollbackPath).catch(() => {});
      }
      if (lockfileRollbackExists) {
        await fs.unlink(`${lockfilePath}${rollbackSuffix}`).catch(() => {});
      }
      onProgress?.(100);

    } catch (err: unknown) {
      // 5. Transaction-like rollback on failure!
      // Wipe corrupt/incomplete folders
      for (const dir of dirsToRestore) {
        const dest = path.join(baseDir, dir);
        if (exists(dest)) {
          await removeDir(dest).catch(() => {});
        }
      }
      
      if (exists(lockfilePath)) {
        await fs.unlink(lockfilePath).catch(() => {});
      }

      // Move rollback dirs back into place
      for (const dir of backedUpDirs) {
        const dest = path.join(baseDir, dir);
        const rollbackPath = `${dest}${rollbackSuffix}`;
        if (exists(rollbackPath)) {
          await fs.rename(rollbackPath, dest).catch(() => {});
        }
      }

      if (lockfileRollbackExists) {
        const lockfileRollback = `${lockfilePath}${rollbackSuffix}`;
        await fs.rename(lockfileRollback, lockfilePath).catch(() => {});
      }

      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`Restore failed. Environment successfully rolled back. Detail: ${detail}`);
    }
  }

  private async verifyRestore(baseDir: string, backupDir: string): Promise<void> {
    const { readJson } = await import('../storage/filesystem.js');
    
    // 1. Verify lockfile when the backup included one
    const lockPath = path.join(baseDir, 'aman.lock');
    const backupLockPath = path.join(backupDir, 'aman.lock');
    if (exists(backupLockPath)) {
      const lockfileContent = await readJson<Record<string, unknown>>(lockPath);
      if (!lockfileContent) {
        throw new Error('Lockfile (aman.lock) is corrupted/unreadable after restore');
      }
    }

    // 2. Read the backup directories and verify existence of expected assets
    const dirsToRestore = ['skills', 'prompts', 'mcps', 'stacks', 'config'];
    for (const dir of dirsToRestore) {
      const srcDir = path.join(backupDir, dir);
      const destDir = path.join(baseDir, dir);
      if (exists(srcDir)) {
        if (!exists(destDir)) {
          throw new Error(`Directory ${dir} was not created during restore`);
        }
        
        const fsPromises = (await import('fs')).promises;
        const srcFiles = await fsPromises.readdir(srcDir);
        const destFiles = await fsPromises.readdir(destDir);
        
        for (const file of srcFiles) {
          const destFilePath = path.join(destDir, file);
          if (!exists(destFilePath)) {
            throw new Error(`Expected asset file/folder ${file} was not restored under ${dir}`);
          }
          
          if (dir === 'skills' || dir === 'prompts' || dir === 'mcps') {
            const metaPath = path.join(destFilePath, 'metadata.json');
            if (!exists(metaPath)) {
              throw new Error(`metadata.json is missing for ${dir}/${file}`);
            }
          }
        }
      }
    }
  }

  async delete(id: string): Promise<void> {
    const backupDir = path.join(environmentService.getActiveEnvironmentDir(), 'backups', id);
    if (exists(backupDir)) {
      await removeDir(backupDir);
    }
  }
}

export const backupService = new BackupService();
