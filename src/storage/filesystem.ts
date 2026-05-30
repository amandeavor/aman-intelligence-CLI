import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export async function ensureDir(dirPath: string): Promise<void> {
  if (!existsSync(dirPath)) {
    await fs.mkdir(dirPath, { recursive: true });
  }
}

export async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

export async function writeJson<T>(filePath: string, data: T): Promise<void> {
  await writeJsonAtomic(filePath, data);
}

/** Atomic JSON write (temp file + rename) to avoid corrupted half-writes. */
export async function writeJsonAtomic<T>(filePath: string, data: T): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const payload = JSON.stringify(data, null, 2);
  await fs.writeFile(tmpPath, payload, 'utf-8');
  await fs.rename(tmpPath, filePath);
}

export async function copyDir(src: string, dest: string): Promise<void> {
  if (!existsSync(src)) return;
  await ensureDir(dest);
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

export async function removeDir(dirPath: string): Promise<void> {
  if (!existsSync(dirPath)) return;
  await fs.rm(dirPath, { recursive: true, force: true });
}

export async function listDirs(dirPath: string): Promise<string[]> {
  if (!existsSync(dirPath)) return [];
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

export async function listFiles(dirPath: string, ext?: string): Promise<string[]> {
  if (!existsSync(dirPath)) return [];
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && (!ext || e.name.endsWith(ext)))
    .map((e) => e.name);
}

export function exists(targetPath: string): boolean {
  return existsSync(targetPath);
}

export async function readFrontmatter(mdPath: string): Promise<Record<string, unknown> | null> {
  try {
    const content = await fs.readFile(mdPath, 'utf-8');
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (match && match[1]) {
      const parsed = yaml.load(match[1]);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function isPathSafe(targetPath: string, rootDir: string): Promise<boolean> {
  try {
    const resolvedRoot = await fs.realpath(path.resolve(rootDir));
    const absoluteTarget = path.resolve(targetPath);
    
    let current = absoluteTarget;
    let resolvedTarget = absoluteTarget;
    
    while (current) {
      if (existsSync(current)) {
        const realCurrent = await fs.realpath(current);
        resolvedTarget = path.join(realCurrent, path.relative(current, absoluteTarget));
        break;
      }
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }

    const relative = path.relative(resolvedRoot, resolvedTarget);
    
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return false;
    }
    
    if (!resolvedTarget.startsWith(resolvedRoot)) {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}
