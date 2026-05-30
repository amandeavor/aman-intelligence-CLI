import { promises as fs } from 'fs';
import path from 'path';
import { exists, ensureDir, readJson, writeJson } from '../storage/filesystem.js';
import { mcpLocalFilePath, contentFilePath } from '../storage/asset-layout.js';

const PLACEHOLDER_RE = /^\$\{[A-Z0-9_]+\}$|^\{\{[A-Z0-9_]+\}\}$|^\$[A-Z][A-Z0-9_]*$/;

function isEnvPlaceholder(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (value.trim() === '') return true;
  return PLACEHOLDER_RE.test(value.trim());
}

/**
 * Extract env var keys from mcp.json that need local values.
 */
export function extractMcpEnvKeys(mcpData: Record<string, unknown>): string[] {
  const keys = new Set<string>();

  const env = mcpData.env;
  if (env && typeof env === 'object' && !Array.isArray(env)) {
    for (const [key, value] of Object.entries(env as Record<string, unknown>)) {
      if (typeof key === 'string' && key.length > 0 && isEnvPlaceholder(value)) {
        keys.add(key);
      }
    }
  }

  const mcpServers = mcpData.mcpServers;
  if (mcpServers && typeof mcpServers === 'object' && !Array.isArray(mcpServers)) {
    for (const server of Object.values(mcpServers as Record<string, unknown>)) {
      if (!server || typeof server !== 'object') continue;
      const serverEnv = (server as Record<string, unknown>).env;
      if (!serverEnv || typeof serverEnv !== 'object' || Array.isArray(serverEnv)) continue;
      for (const [key, value] of Object.entries(serverEnv as Record<string, unknown>)) {
        if (typeof key === 'string' && key.length > 0 && isEnvPlaceholder(value)) {
          keys.add(key);
        }
      }
    }
  }

  return Array.from(keys).sort();
}

export function buildMcpLocalTemplate(envKeys: string[]): Record<string, string> {
  const out: Record<string, string> = {
    _comment:
      'Fill in local values for this MCP. This file is gitignored and never synced.',
  };
  for (const key of envKeys) {
    out[key] = '';
  }
  return out;
}

/** Create mcp.local.json when missing; never overwrite existing file. */
export async function scaffoldMcpLocalConfig(assetDir: string): Promise<{ created: boolean; keys: string[] }> {
  const mcpPath = contentFilePath(assetDir, 'mcp');
  const localPath = mcpLocalFilePath(assetDir);

  if (!exists(mcpPath)) {
    return { created: false, keys: [] };
  }

  if (exists(localPath)) {
    return { created: false, keys: [] };
  }

  const mcpData = await readJson<Record<string, unknown>>(mcpPath);
  if (!mcpData) {
    return { created: false, keys: [] };
  }

  const keys = extractMcpEnvKeys(mcpData);
  if (keys.length === 0) {
    return { created: false, keys: [] };
  }

  await writeJson(localPath, buildMcpLocalTemplate(keys));
  return { created: true, keys };
}

export function mcpRequiresLocalConfig(mcpData: Record<string, unknown>): boolean {
  return extractMcpEnvKeys(mcpData).length > 0;
}

const GITIGNORE_MCP_LINE = 'mcps/**/mcp.local.json';

export async function ensureMcpLocalGitignore(scopeRoot: string): Promise<boolean> {
  const gitignorePath = path.join(scopeRoot, '.gitignore');
  let content = '';
  if (exists(gitignorePath)) {
    content = await fs.readFile(gitignorePath, 'utf-8');
    if (content.split('\n').some((line) => line.trim() === GITIGNORE_MCP_LINE || line.trim() === '**/mcp.local.json')) {
      return false;
    }
    if (!content.endsWith('\n')) content += '\n';
    content += `${GITIGNORE_MCP_LINE}\n`;
  } else {
    content = `${GITIGNORE_MCP_LINE}\n`;
  }
  await ensureDir(scopeRoot);
  await fs.writeFile(gitignorePath, content, 'utf-8');
  return true;
}

export async function readGitignoreContent(scopeRoot: string): Promise<string> {
  const gitignorePath = path.join(scopeRoot, '.gitignore');
  if (!exists(gitignorePath)) return '';
  return fs.readFile(gitignorePath, 'utf-8');
}

export async function gitignoreIncludesMcpLocalAsync(scopeRoot: string): Promise<boolean> {
  const content = await readGitignoreContent(scopeRoot);
  if (!content) return false;
  return content.split('\n').some((line) => {
    const t = line.trim();
    return (
      t === GITIGNORE_MCP_LINE ||
      t === '**/mcp.local.json' ||
      t === 'mcp.local.json' ||
      t === 'mcps/*/mcp.local.json'
    );
  });
}

export async function countEmptyMcpLocalValues(assetDir: string): Promise<number> {
  const localPath = mcpLocalFilePath(assetDir);
  if (!exists(localPath)) return 0;
  const data = await readJson<Record<string, unknown>>(localPath);
  if (!data) return 0;
  let empty = 0;
  for (const [key, value] of Object.entries(data)) {
    if (key === '_comment') continue;
    if (value === '' || value === null || value === undefined) empty++;
  }
  return empty;
}
