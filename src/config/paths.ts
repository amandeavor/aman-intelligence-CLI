import path from 'path';
import os from 'os';
import { ensureDir } from '../storage/filesystem.js';

export const GLOBAL_DIR = path.join(os.homedir(), '.aman');
export const GLOBAL_SKILLS = path.join(GLOBAL_DIR, 'skills');
export const GLOBAL_PROMPTS = path.join(GLOBAL_DIR, 'prompts');
export const GLOBAL_MCPS = path.join(GLOBAL_DIR, 'mcps');
export const GLOBAL_STACKS = path.join(GLOBAL_DIR, 'stacks');
export const GLOBAL_CACHE = path.join(GLOBAL_DIR, 'cache');
export const GLOBAL_BACKUPS = path.join(GLOBAL_DIR, 'backups');
export const GLOBAL_REGISTRY_DIR = path.join(GLOBAL_DIR, 'registry');
export const GLOBAL_CONFIG_DIR = path.join(GLOBAL_DIR, 'config');
export const GLOBAL_CONFIG_FILE = path.join(GLOBAL_CONFIG_DIR, 'aman.json');

export const LOCAL_DIR = '.aman';
export const LOCAL_CONFIG_FILE = path.join(LOCAL_DIR, 'aman.json');
export const LOCAL_LOCKFILE = path.join(LOCAL_DIR, 'aman.lock');

import { fileURLToPath } from 'url';

// Works from both src/config during development and dist/config after build.
const __filename = fileURLToPath(import.meta.url);
export const PROJECT_ROOT = path.resolve(path.dirname(__filename), '../..');
export const BUNDLED_SKILLS = path.join(PROJECT_ROOT, 'skills');
export const BUNDLED_PROMPTS = path.join(PROJECT_ROOT, 'prompts');
export const BUNDLED_MCPS = path.join(PROJECT_ROOT, 'mcps');

/**
 * Creates all `~/.aman/` subdirectories.
 * This is used during setup and doctor checks.
 */
export async function ensureGlobalDirs(): Promise<void> {
  await ensureDir(GLOBAL_DIR);
  await ensureDir(GLOBAL_SKILLS);
  await ensureDir(GLOBAL_PROMPTS);
  await ensureDir(GLOBAL_MCPS);
  await ensureDir(GLOBAL_STACKS);
  await ensureDir(GLOBAL_CACHE);
  await ensureDir(GLOBAL_BACKUPS);
  await ensureDir(GLOBAL_REGISTRY_DIR);
  await ensureDir(GLOBAL_CONFIG_DIR);
}

export async function ensureProjectDirs(): Promise<void> {
  await ensureDir(LOCAL_DIR);
  await ensureDir(path.join(LOCAL_DIR, 'skills'));
  await ensureDir(path.join(LOCAL_DIR, 'prompts'));
  await ensureDir(path.join(LOCAL_DIR, 'mcps'));
  await ensureDir(path.join(LOCAL_DIR, 'stacks'));
}
