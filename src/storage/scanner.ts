import path from 'path';
import { promises as fs } from 'fs';
import { exists, listDirs, listFiles, readFrontmatter, readJson } from './filesystem.js';
import { Skill, Prompt, McpConfig, Stack } from '../types/index.js';
import { normalizeStack } from '../utils/stack-normalize.js';
import {
  assetDir,
  contentFilePath,
  metadataFilePath,
  isCanonicalAssetDir,
} from './asset-layout.js';

interface SkillMetadataFile {
  version?: string;
  organization?: string;
  date?: string;
  updated?: string;
  abstract?: string;
  tags?: string[];
  category?: string;
  installs?: number;
  rating?: number;
  originalName?: string;
}

const SCAN_CONCURRENCY = 20;

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const tags = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return tags.length > 0 ? tags : undefined;
}

async function boundedMap<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIdx = index++;
      results[currentIdx] = await fn(items[currentIdx]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

export async function scanSkills(dir: string, source: string = 'local'): Promise<Skill[]> {
  if (!exists(dir)) return [];

  const skillDirs = await listDirs(dir);

  const skills = await boundedMap(skillDirs, SCAN_CONCURRENCY, async (name) => {
    const skillPath = assetDir('skill', dir, name);
    const mdPath = contentFilePath(skillPath, 'skill');
    const metadataPath = metadataFilePath(skillPath);
    const hasMd = exists(mdPath);

    let description: string | undefined;
    let tags: string[] | undefined;
    let category: string | undefined;
    let installs: number | undefined;
    let rating: number | undefined;
    let updated: string | undefined;
    let version: string | undefined;
    let organization: string | undefined;
    let originalName: string | undefined;
    let slug: string | undefined;
    let id: string | undefined;

    if (hasMd) {
      const frontmatter = await readFrontmatter(mdPath);
      if (frontmatter) {
        if (typeof frontmatter.description === 'string') description = frontmatter.description;
        tags = stringArray(frontmatter.tags);
        const meta = frontmatter.metadata;
        if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
          const metaObj = meta as Record<string, unknown>;
          if (typeof metaObj.version === 'string') version = metaObj.version;
          if (typeof metaObj.author === 'string') organization = metaObj.author;
        }
      }
    }

    const metadata = await readJson<SkillMetadataFile & Record<string, unknown>>(metadataPath);
    if (metadata) {
      description = description || metadata.abstract;
      tags = tags || stringArray(metadata.tags);
      category = metadata.category;
      installs = metadata.installs;
      rating = metadata.rating;
      updated = metadata.updated || metadata.date;
      version = version || metadata.version;
      organization = organization || metadata.organization;
      originalName = metadata.originalName;
      if (typeof metadata.slug === 'string') slug = metadata.slug;
      if (typeof metadata.id === 'string') id = metadata.id;
    }

    return {
      name,
      path: skillPath,
      description,
      tags,
      category,
      installs,
      rating,
      updated,
      version,
      organization,
      hasSkillMd: hasMd,
      source,
      originalName,
      slug,
      id,
    };
  });

  return skills.filter((s) => s.hasSkillMd).sort((a, b) => a.name.localeCompare(b.name));
}

export async function scanPrompts(dir: string, source: string = 'local'): Promise<Prompt[]> {
  if (!exists(dir)) return [];

  const promptDirs = await listDirs(dir);

  const prompts = await boundedMap(promptDirs, SCAN_CONCURRENCY, async (name) => {
    const promptPath = assetDir('prompt', dir, name);
    if (!isCanonicalAssetDir('prompt', promptPath)) return null;

    const mdPath = contentFilePath(promptPath, 'prompt');
    let description: string | undefined;
    try {
      const content = await fs.readFile(mdPath, 'utf-8');
      const lines = content.split('\n');
      const firstLine = lines.find((l) => l.trim().length > 0 && !l.startsWith('#'));
      if (firstLine) description = firstLine.trim();
    } catch {
      // Ignore
    }

    const meta = await readJson<Record<string, unknown>>(metadataFilePath(promptPath));
    let slug: string | undefined;
    let id: string | undefined;
    if (meta) {
      if (typeof meta.description === 'string') description = meta.description || description;
      if (typeof meta.slug === 'string') slug = meta.slug;
      if (typeof meta.id === 'string') id = meta.id;
    }

    return {
      name,
      path: promptPath,
      description,
      source,
      slug,
      id,
    };
  });

  const valid = prompts.filter((p) => p !== null) as Prompt[];
  return valid.sort((a, b) => a.name.localeCompare(b.name));
}

export async function scanMcps(dir: string, source: string = 'local'): Promise<McpConfig[]> {
  if (!exists(dir)) return [];

  const mcpDirs = await listDirs(dir);

  const mcps = await boundedMap(mcpDirs, SCAN_CONCURRENCY, async (name) => {
    const mcpPath = assetDir('mcp', dir, name);
    if (!isCanonicalAssetDir('mcp', mcpPath)) return null;

    const jsonPath = contentFilePath(mcpPath, 'mcp');
    const data = await readJson<Record<string, unknown>>(jsonPath);

    const meta = await readJson<Record<string, unknown>>(metadataFilePath(mcpPath));

    return {
      name: (typeof data?.name === 'string' ? data.name : name) as string,
      path: mcpPath,
      command: data?.command as string | undefined,
      args: data?.args as string[] | undefined,
      env: data?.env as Record<string, string> | undefined,
      source,
      slug: typeof meta?.slug === 'string' ? meta.slug : undefined,
      id: typeof meta?.id === 'string' ? meta.id : undefined,
    };
  });

  const validMcps = mcps.filter((m) => m !== null) as McpConfig[];
  return validMcps.sort((a, b) => a.name.localeCompare(b.name));
}

export async function scanStacks(dir: string, source: string = 'local'): Promise<Stack[]> {
  if (!exists(dir)) return [];

  const stackFiles = await listFiles(dir, '.json');

  const stacks = await boundedMap(stackFiles, SCAN_CONCURRENCY, async (file) => {
    const jsonPath = path.join(dir, file);
    const data = await readJson<Stack>(jsonPath);
    return normalizeStack(data);
  });

  const validStacks = stacks.filter((s): s is Stack => s !== null);

  return validStacks.sort((a, b) => a.name.localeCompare(b.name));
}

export async function scanAll(dir: string, source: string = 'local') {
  const [skills, prompts, mcps, stacks] = await Promise.all([
    scanSkills(path.join(dir, 'skills'), source),
    scanPrompts(path.join(dir, 'prompts'), source),
    scanMcps(path.join(dir, 'mcps'), source),
    scanStacks(path.join(dir, 'stacks'), source),
  ]);
  return { skills, prompts, mcps, stacks };
}
