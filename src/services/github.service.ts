import { spawnSync } from 'child_process';
import { exists, ensureDir, removeDir } from '../storage/filesystem.js';
import path from 'path';
import os from 'os';

export class GithubService {
  /**
   * Imports a repository from GitHub or a local folder to a temporary directory.
   */
  async import(source: string): Promise<string> {
    const tempDir = path.join(os.tmpdir(), `aman-import-${Date.now()}`);
    await ensureDir(tempDir);

    let cloneUrl = source;

    // Handle local folder
    if (source.startsWith('.') || path.isAbsolute(source) || exists(source)) {
      const srcPath = path.resolve(process.cwd(), source);
      if (!exists(srcPath)) {
        throw new Error(`Local path does not exist: ${srcPath}`);
      }
      const { copyDir } = await import('../storage/filesystem.js');
      await copyDir(srcPath, tempDir);
      return tempDir;
    }

    // Handle user/repo format
    if (!source.startsWith('http') && source.includes('/')) {
      cloneUrl = `https://github.com/${source}.git`;
    }

    try {
      const result = spawnSync('git', ['clone', '--depth', '1', cloneUrl, tempDir], { stdio: 'ignore' });
      if (result.status !== 0) {
        throw new Error('clone failed');
      }
      // Remove .git directory so it's not detected as part of the assets
      await removeDir(path.join(tempDir, '.git'));
      return tempDir;
    } catch {
      await removeDir(tempDir);
      throw new Error(`Failed to clone ${cloneUrl}. Is git installed? Does the repo exist?`);
    }
  }
}

export const githubService = new GithubService();
