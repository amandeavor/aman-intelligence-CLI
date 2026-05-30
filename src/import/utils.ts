import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { exists, readJson, readFrontmatter } from '../storage/filesystem.js';
import { defaultSlugForName } from '../utils/slug.js';
import { DiscoveredImportAsset, ImportCanonicalStatus, ImportSourceId, ImportProvenance } from './types.js';
import { AssetType } from '../types/index.js';
import { randomUUID } from 'crypto';

export function expandHome(inputPath: string): string {
  if (inputPath === '~') return os.homedir();
  if (inputPath.startsWith('~/') || inputPath.startsWith(`~${path.sep}`)) {
    return path.join(os.homedir(), inputPath.slice(2));
  }
  return inputPath;
}

export function vscodeUserMcpPath(): string {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), 'Code', 'User', 'mcp.json');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User', 'mcp.json');
  }
  return path.join(os.homedir(), '.config', 'Code', 'User', 'mcp.json');
}

export function slugifyImportName(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || defaultSlugForName(name);
}

export function makeAssetId(): string {
  return randomUUID();
}

export async function discoverSkillDir(
  skillDir: string,
  adapterId: ImportSourceId,
  originLabel: string
): Promise<DiscoveredImportAsset | null> {
  const skillMd = path.join(skillDir, 'SKILL.md');
  if (!exists(skillMd)) return null;

  const hasMeta = exists(path.join(skillDir, 'metadata.json'));
  let description = '';
  const fm = await readFrontmatter(skillMd);
  if (fm) {
    description = (typeof fm.description === 'string' ? fm.description : '') ||
      (typeof fm.name === 'string' ? fm.name : '');
  }

  const name = path.basename(skillDir);
  return {
    id: makeAssetId(),
    type: 'skill',
    name: slugifyImportName(name),
    description,
    sourcePath: skillDir,
    originLabel,
    canonicalStatus: hasMeta ? 'canonical' : 'convertible',
    canonicalNote: hasMeta ? undefined : 'Will generate metadata.json on import',
    confidence: hasMeta ? 95 : 85,
    adapterId,
  };
}

export async function discoverPromptFile(
  filePath: string,
  adapterId: ImportSourceId,
  originLabel: string,
  suggestedName?: string
): Promise<DiscoveredImportAsset> {
  const base = suggestedName ?? path.basename(filePath, path.extname(filePath));
  let description = '';
  const fm = await readFrontmatter(filePath);
  if (fm && typeof fm.description === 'string') {
    description = fm.description;
  }

  const canonicalStatus: ImportCanonicalStatus = path.basename(filePath).toUpperCase() === 'PROMPT.MD'
    ? 'canonical'
    : 'convertible';

  return {
    id: makeAssetId(),
    type: 'prompt',
    name: slugifyImportName(base),
    description,
    sourcePath: filePath,
    originLabel,
    canonicalStatus,
    canonicalNote:
      canonicalStatus === 'convertible' ? 'Markdown will be normalized to PROMPT.md layout' : undefined,
    confidence: canonicalStatus === 'canonical' ? 95 : 75,
    adapterId,
  };
}

export async function listSkillDirs(root: string): Promise<string[]> {
  if (!exists(root)) return [];
  const { listDirs } = await import('../storage/filesystem.js');
  const dirs = await listDirs(root);
  return dirs.map((d) => path.join(root, d)).filter((d) => exists(path.join(d, 'SKILL.md')));
}

export function extractMcpServerMap(raw: Record<string, unknown>): Record<string, unknown> {
  if (raw.mcpServers && typeof raw.mcpServers === 'object' && raw.mcpServers !== null) {
    return raw.mcpServers as Record<string, unknown>;
  }
  if (raw.servers && typeof raw.servers === 'object' && raw.servers !== null) {
    return raw.servers as Record<string, unknown>;
  }
  return {};
}

export async function discoverMcpFromJsonFile(
  filePath: string,
  adapterId: ImportSourceId,
  originPrefix: string
): Promise<DiscoveredImportAsset[]> {
  if (!exists(filePath)) return [];
  const raw = await readJson<Record<string, unknown>>(filePath);
  if (!raw) return [];

  const servers = extractMcpServerMap(raw);
  const results: DiscoveredImportAsset[] = [];

  for (const [serverName, config] of Object.entries(servers)) {
    if (!config || typeof config !== 'object') continue;
    results.push({
      id: makeAssetId(),
      type: 'mcp',
      name: slugifyImportName(serverName),
      description: `MCP server "${serverName}" from ${originPrefix}`,
      sourcePath: filePath,
      originLabel: `${originPrefix} → ${serverName}`,
      canonicalStatus: 'convertible',
      canonicalNote: `Will extract server "${serverName}" into canonical mcp.json`,
      confidence: 80,
      adapterId,
      mcpServerName: serverName,
    });
  }

  return results;
}

/** Minimal TOML [mcp_servers.name] block parser for Codex config.toml */
export function parseCodexMcpBlocks(tomlText: string): Array<{ name: string; body: string }> {
  const blocks: Array<{ name: string; body: string }> = [];
  const lines = tomlText.split(/\r?\n/);
  let current: { name: string; body: string[] } | null = null;

  for (const line of lines) {
    const section = line.match(/^\[mcp_servers\.([^\]]+)\]\s*$/);
    if (section) {
      if (current) blocks.push({ name: current.name, body: current.body.join('\n') });
      current = { name: section[1], body: [] };
      continue;
    }
    if (current && line.trim() && !line.startsWith('[')) {
      current.body.push(line);
    }
  }
  if (current) blocks.push({ name: current.name, body: current.body.join('\n') });
  return blocks;
}

export function codexBlockToMcpJson(block: { name: string; body: string }): Record<string, unknown> {
  const server: Record<string, unknown> = {};
  for (const line of block.body.split('\n')) {
    const kv = line.match(/^([a-zA-Z0-9_]+)\s*=\s*(.+)$/);
    if (!kv) continue;
    const key = kv[1];
    let val: unknown = kv[2].trim();
    if (typeof val === 'string' && val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1);
    } else if (val === 'true' || val === 'false') {
      val = val === 'true';
    }
    server[key] = val;
  }

  if (typeof server.url === 'string') {
    return {
      mcpServers: {
        [block.name]: {
          type: 'http',
          url: server.url,
          ...(typeof server.bearer_token_env_var === 'string'
            ? { headers: { Authorization: `Bearer $${server.bearer_token_env_var}` } }
            : {}),
        },
      },
    };
  }

  const command = typeof server.command === 'string' ? server.command : undefined;
  const args = Array.isArray(server.args)
    ? server.args
    : typeof server.args === 'string'
      ? [server.args]
      : [];

  return {
    mcpServers: {
      [block.name]: {
        ...(command ? { command, args } : {}),
        ...(server.env && typeof server.env === 'object' ? { env: server.env } : {}),
      },
    },
  };
}

/**
 * Discover rules-style markdown files as skills.
 * Used by Cursor (.cursor/rules/, .cursorrules) and Windsurf (.windsurf/rules/, .windsurfrules).
 */
export async function discoverRulesAsSkills(
  rulePaths: string[],
  dotfilePaths: string[],
  adapterId: ImportSourceId,
  originPrefix: string
): Promise<DiscoveredImportAsset[]> {
  const found: DiscoveredImportAsset[] = [];
  const seen = new Set<string>();

  // Scan directories of rule files
  for (const rulesDir of rulePaths) {
    if (!exists(rulesDir)) continue;
    let files: string[];
    try {
      files = await fs.readdir(rulesDir);
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith('.md') && !file.endsWith('.mdc')) continue;
      const filePath = path.join(rulesDir, file);
      const key = `skill:${filePath}`;
      if (seen.has(key)) continue;
      seen.add(key);

      let description = '';
      const fm = await readFrontmatter(filePath);
      if (fm && typeof fm.description === 'string') {
        description = fm.description;
      }

      const name = file.replace(/\.(md|mdc)$/, '');
      found.push({
        id: makeAssetId(),
        type: 'skill',
        name: slugifyImportName(name),
        description: description || `Rule file from ${adapterId}`,
        sourcePath: filePath,
        originLabel: `${originPrefix}/${file}`,
        canonicalStatus: 'convertible',
        canonicalNote: 'Rule file will be converted to SKILL.md',
        confidence: 80,
        adapterId,
        provenance: {
          tool: adapterId,
          sourcePath: filePath,
          importedAt: new Date().toISOString(),
        },
      });
    }
  }

  // Scan dotfiles (.cursorrules, .windsurfrules)
  for (const dotfile of dotfilePaths) {
    if (!exists(dotfile)) continue;
    const key = `skill:${dotfile}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const baseName = path.basename(dotfile).replace(/^\./, '');
    found.push({
      id: makeAssetId(),
      type: 'skill',
      name: slugifyImportName(baseName),
      description: `Root rules file from ${adapterId}`,
      sourcePath: dotfile,
      originLabel: path.basename(dotfile),
      canonicalStatus: 'convertible',
      canonicalNote: 'Dotfile will be converted to SKILL.md',
      confidence: 75,
      adapterId,
      provenance: {
        tool: adapterId,
        sourcePath: dotfile,
        importedAt: new Date().toISOString(),
      },
    });
  }

  return found;
}

/**
 * Discover Continue.dev prompt files from ~/.continue/prompts/.
 */
export async function discoverContinuePrompts(
  promptsDir: string,
  adapterId: ImportSourceId
): Promise<DiscoveredImportAsset[]> {
  if (!exists(promptsDir)) return [];
  const found: DiscoveredImportAsset[] = [];

  let files: string[];
  try {
    files = await fs.readdir(promptsDir);
  } catch {
    return [];
  }

  for (const file of files) {
    if (!file.endsWith('.md') && !file.endsWith('.prompt')) continue;
    const filePath = path.join(promptsDir, file);

    let description = '';
    const fm = await readFrontmatter(filePath);
    if (fm && typeof fm.description === 'string') {
      description = fm.description;
    }

    const name = file.replace(/\.(md|prompt)$/, '');
    found.push({
      id: makeAssetId(),
      type: 'prompt',
      name: slugifyImportName(name),
      description: description || `Continue prompt "${name}"`,
      sourcePath: filePath,
      originLabel: `~/.continue/prompts/${file}`,
      canonicalStatus: 'convertible',
      canonicalNote: 'Prompt file will be normalized to PROMPT.md',
      confidence: 85,
      adapterId,
      provenance: {
        tool: adapterId,
        sourcePath: filePath,
        importedAt: new Date().toISOString(),
      },
    });
  }

  return found;
}

/**
 * Discover MCP servers from Continue's config.json (legacy) or config.yaml.
 */
export async function discoverContinueMcpFromConfig(
  configPath: string,
  adapterId: ImportSourceId
): Promise<DiscoveredImportAsset[]> {
  if (!exists(configPath)) return [];

  try {
    const text = await fs.readFile(configPath, 'utf-8');
    let data: Record<string, unknown> | null = null;

    if (configPath.endsWith('.json')) {
      data = JSON.parse(text);
    } else if (configPath.endsWith('.yaml') || configPath.endsWith('.yml')) {
      const yaml = await import('js-yaml');
      const parsed = yaml.load(text);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        data = parsed as Record<string, unknown>;
      }
    }

    if (!data) return [];

    const servers = extractMcpServerMap(data);
    const results: DiscoveredImportAsset[] = [];

    for (const [serverName, config] of Object.entries(servers)) {
      if (!config || typeof config !== 'object') continue;
      const home = os.homedir();
      results.push({
        id: makeAssetId(),
        type: 'mcp',
        name: slugifyImportName(serverName),
        description: `Continue MCP server "${serverName}"`,
        sourcePath: configPath,
        originLabel: `${configPath.replace(home, '~')} → ${serverName}`,
        canonicalStatus: 'convertible',
        canonicalNote: `Will extract server "${serverName}" into canonical mcp.json`,
        confidence: 80,
        adapterId,
        mcpServerName: serverName,
        provenance: {
          tool: adapterId,
          sourcePath: configPath,
          importedAt: new Date().toISOString(),
        },
      });
    }

    return results;
  } catch {
    return [];
  }
}

/**
 * Discover canonical assets from an existing Aman environment directory.
 */
export async function discoverAmanEnvironmentAssets(
  envRoot: string,
  adapterId: ImportSourceId
): Promise<DiscoveredImportAsset[]> {
  const found: DiscoveredImportAsset[] = [];
  const home = os.homedir();

  const typeMap: Array<{ type: AssetType; dir: string; contentFile: string }> = [
    { type: 'skill', dir: path.join(envRoot, 'skills'), contentFile: 'SKILL.md' },
    { type: 'prompt', dir: path.join(envRoot, 'prompts'), contentFile: 'PROMPT.md' },
    { type: 'mcp', dir: path.join(envRoot, 'mcps'), contentFile: 'mcp.json' },
  ];

  for (const { type, dir, contentFile } of typeMap) {
    if (!exists(dir)) continue;
    let entries: string[];
    try {
      const dirents = await fs.readdir(dir, { withFileTypes: true });
      entries = dirents.filter((d) => d.isDirectory()).map((d) => d.name);
    } catch {
      continue;
    }

    for (const name of entries) {
      const assetPath = path.join(dir, name);
      const content = path.join(assetPath, contentFile);
      if (!exists(content)) continue;

      const hasMeta = exists(path.join(assetPath, 'metadata.json'));

      let description = '';
      if (hasMeta) {
        const meta = await readJson<Record<string, unknown>>(path.join(assetPath, 'metadata.json'));
        if (meta && typeof meta.description === 'string') {
          description = meta.description;
        }
      } else if (type === 'skill' || type === 'prompt') {
        const fm = await readFrontmatter(content);
        if (fm && typeof fm.description === 'string') {
          description = fm.description;
        }
      }

      found.push({
        id: makeAssetId(),
        type,
        name: slugifyImportName(name),
        description,
        sourcePath: assetPath,
        originLabel: assetPath.replace(home, '~'),
        canonicalStatus: hasMeta ? 'canonical' : 'convertible',
        canonicalNote: hasMeta ? undefined : 'Will generate metadata.json on import',
        confidence: hasMeta ? 95 : 85,
        adapterId,
        provenance: {
          tool: 'aman',
          sourcePath: assetPath,
          importedAt: new Date().toISOString(),
        },
      });
    }
  }

  return found;
}
