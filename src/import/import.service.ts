import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { exists, ensureDir, readJson, writeJson, removeDir, copyDir } from '../storage/filesystem.js';
import { assetService } from '../services/asset.service.js';
import { environmentService } from '../services/environment.service.js';
import { AssetType, Scope } from '../types/index.js';
import {
  DiscoveredImportAsset,
  ImportConflict,
  ImportDestination,
  ImportPlan,
  ImportResult,
  ImportSourceId,
} from './types.js';
import {
  codexBlockToMcpJson,
  extractMcpServerMap,
  parseCodexMcpBlocks,
  slugifyImportName,
} from './utils.js';

function buildProvenanceSource(adapterId: ImportSourceId, originLabel: string): string {
  return `import:${adapterId}:${originLabel}`;
}

export function isGithubDestinationAvailable(): boolean {
  const storage = environmentService.getStorage();
  return storage.type === 'github' && Boolean(storage.repository);
}

export async function detectImportConflicts(
  items: DiscoveredImportAsset[],
  scope: Scope
): Promise<ImportConflict[]> {
  const conflicts: ImportConflict[] = [];

  for (const item of items) {
    const existing = await assetService.list(item.type, scope);
    const match = existing.find((e) => e.name === item.name);
    if (match) {
      conflicts.push({
        asset: item,
        existingLocalName: match.name,
        resolution: 'skip',
        resolvedName: item.name,
      });
    }
  }

  return conflicts;
}

async function stageMcpAsset(item: DiscoveredImportAsset, stagingRoot: string): Promise<string> {
  const dest = path.join(stagingRoot, item.id);
  await ensureDir(dest);

  if (item.adapterId === 'codex' && item.mcpServerName && item.sourcePath.endsWith('.toml')) {
    const text = await fs.readFile(item.sourcePath, 'utf-8');
    const block = parseCodexMcpBlocks(text).find((b) => b.name === item.mcpServerName);
    if (!block) throw new Error(`Codex MCP block not found: ${item.mcpServerName}`);
    const mcpJson = codexBlockToMcpJson(block);
    await writeJson(path.join(dest, 'mcp.json'), mcpJson);
    await separateMcpSecrets(dest);
    return dest;
  }

  if (item.mcpServerName) {
    const raw = await readJson<Record<string, unknown>>(item.sourcePath);
    if (!raw) throw new Error(`Invalid MCP config: ${item.sourcePath}`);
    const servers = extractMcpServerMap(raw);
    const serverConfig = servers[item.mcpServerName];
    if (!serverConfig) throw new Error(`MCP server "${item.mcpServerName}" not found in ${item.sourcePath}`);
    await writeJson(path.join(dest, 'mcp.json'), { mcpServers: { [item.mcpServerName]: serverConfig } });
    await separateMcpSecrets(dest);
    return dest;
  }

  if (exists(path.join(item.sourcePath, 'mcp.json'))) {
    await copyDir(item.sourcePath, dest);
    await separateMcpSecrets(dest);
    return dest;
  }

  if (item.sourcePath.endsWith('.json') && exists(item.sourcePath)) {
    const raw = await readJson<Record<string, unknown>>(item.sourcePath);
    if (raw && extractMcpServerMap(raw)) {
      await writeJson(path.join(dest, 'mcp.json'), raw.mcpServers ? raw : { mcpServers: extractMcpServerMap(raw) });
      await separateMcpSecrets(dest);
      return dest;
    }
    await fs.copyFile(item.sourcePath, path.join(dest, 'mcp.json'));
    await separateMcpSecrets(dest);
    return dest;
  }

  throw new Error(`Cannot stage MCP from ${item.originLabel}`);
}

/**
 * Separate machine-specific secrets from portable mcp.json.
 * Reads env vars, moves actual values to mcp.local.json,
 * replaces them with placeholders in mcp.json.
 */
async function separateMcpSecrets(assetDir: string): Promise<void> {
  const mcpPath = path.join(assetDir, 'mcp.json');
  const localPath = path.join(assetDir, 'mcp.local.json');
  if (!exists(mcpPath) || exists(localPath)) return;

  const mcpData = await readJson<Record<string, unknown>>(mcpPath);
  if (!mcpData) return;

  const localValues: Record<string, string> = {};
  let modified = false;

  // Walk mcpServers.*.env to find non-placeholder values
  const mcpServers = mcpData.mcpServers as Record<string, Record<string, unknown>> | undefined;
  if (mcpServers && typeof mcpServers === 'object') {
    for (const [, serverCfg] of Object.entries(mcpServers)) {
      if (!serverCfg || typeof serverCfg !== 'object') continue;
      const env = serverCfg.env as Record<string, unknown> | undefined;
      if (!env || typeof env !== 'object' || Array.isArray(env)) continue;

      for (const [key, value] of Object.entries(env)) {
        if (typeof value !== 'string') continue;
        // Detect actual secret values (not already placeholders)
        const isPlaceholder = /^\$\{[A-Z0-9_]+\}$|^\{\{[A-Z0-9_]+\}\}$|^\$[A-Z][A-Z0-9_]*$/.test(value.trim());
        const isEmpty = value.trim() === '';
        if (!isPlaceholder && !isEmpty && looksLikeSecret(key, value)) {
          localValues[key] = value;
          (env as Record<string, string>)[key] = `\${${key}}`;
          modified = true;
        }
      }
    }
  }

  if (modified) {
    await writeJson(mcpPath, mcpData);
    await writeJson(localPath, {
      _comment: 'Fill in local values for this MCP. This file is gitignored and never synced.',
      ...localValues,
    });
  }
}

/** Heuristic: keys named token, key, secret, password, auth etc. with non-trivial values. */
function looksLikeSecret(key: string, value: string): boolean {
  const secretish = /token|key|secret|password|auth|credential|api.?key/i;
  if (secretish.test(key)) return true;
  // Long opaque strings (API keys, tokens) — 20+ chars, no spaces
  if (value.length >= 20 && !/\s/.test(value) && /[a-zA-Z0-9\-_]/.test(value)) return true;
  return false;
}

async function stageAssetSource(item: DiscoveredImportAsset, stagingRoot: string): Promise<string> {
  if (item.type === 'mcp') {
    return stageMcpAsset(item, stagingRoot);
  }

  if (item.type === 'skill') {
    // Canonical skill directory (has SKILL.md)
    if (exists(path.join(item.sourcePath, 'SKILL.md'))) {
      const dest = path.join(stagingRoot, item.id);
      await copyDir(item.sourcePath, dest);
      return dest;
    }
    // Single rule file (.md, .mdc) → convert to SKILL.md
    if ((item.sourcePath.endsWith('.md') || item.sourcePath.endsWith('.mdc')) && exists(item.sourcePath)) {
      const dest = path.join(stagingRoot, item.id);
      await ensureDir(dest);
      await fs.copyFile(item.sourcePath, path.join(dest, 'SKILL.md'));
      return dest;
    }
    throw new Error(`Invalid skill source: ${item.sourcePath}`);
  }

  if (item.type === 'prompt') {
    const dest = path.join(stagingRoot, item.id);
    await ensureDir(dest);
    if (exists(path.join(item.sourcePath, 'PROMPT.md'))) {
      await copyDir(item.sourcePath, dest);
      return dest;
    }
    if ((item.sourcePath.endsWith('.md') || item.sourcePath.endsWith('.prompt')) && exists(item.sourcePath)) {
      await fs.copyFile(item.sourcePath, path.join(dest, 'PROMPT.md'));
      return dest;
    }
    throw new Error(`Invalid prompt source: ${item.sourcePath}`);
  }

  throw new Error(`Unsupported asset type: ${item.type}`);
}

export async function executeImportPlan(plan: ImportPlan): Promise<ImportResult> {
  if (plan.destination === 'github' && !isGithubDestinationAvailable()) {
    throw new Error(
      'GitHub is not configured. Run `aman init --github` or connect GitHub first.'
    );
  }

  if (!environmentService.isEnvironmentInitialized(plan.scope)) {
    throw new Error('Environment not initialized. Run `aman init --local` first.');
  }

  const stagingRoot = path.join(os.tmpdir(), `aman-import-exec-${Date.now()}`);
  await ensureDir(stagingRoot);

  const result: ImportResult = {
    imported: 0,
    skipped: 0,
    renamed: 0,
    overwritten: 0,
    errors: [],
  };

  const installed: Array<{ type: AssetType; name: string; scope: Scope }> = [];

  try {
    for (const item of plan.items) {
      const conflict = plan.conflicts.find((c) => c.asset.id === item.id);

      if (conflict?.resolution === 'skip') {
        result.skipped++;
        continue;
      }

      let localName = item.name;
      if (conflict?.resolution === 'rename') {
        localName = conflict.resolvedName;
        if (localName !== item.name) result.renamed++;
      } else if (conflict?.resolution === 'overwrite') {
        await assetService.remove(conflict.existingLocalName, item.type, plan.scope);
        localName = conflict.existingLocalName;
        result.overwritten++;
      }

      try {
        const stagedPath = await stageAssetSource(item, stagingRoot);
        const provenanceRef = buildProvenanceSource(plan.sourceId, item.originLabel);
        const installedAt = new Date().toISOString();

        const provenance = item.provenance ?? {
          tool: plan.sourceId,
          sourcePath: item.sourcePath,
          importedAt: installedAt,
        };

        await assetService.install(localName, item.type, plan.scope, stagedPath, provenanceRef, {
          description: item.description,
          originalName: item.name !== localName ? item.name : undefined,
          tags: [`imported-from-${plan.sourceId}`],
          installedAt,
          provenance,
        });

        installed.push({ type: item.type, name: localName, scope: plan.scope });
        result.imported++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`${item.type}/${item.name}: ${msg}`);
        throw new Error(`Import failed at ${item.name}: ${msg}`);
      }
    }
  } catch (err: unknown) {
    for (const entry of [...installed].reverse()) {
      await assetService.remove(entry.name, entry.type, entry.scope).catch(() => {});
    }
    throw err;
  } finally {
    await removeDir(stagingRoot).catch(() => {});
  }

  return result;
}

export function applyAutoRenameConflicts(
  conflicts: ImportConflict[],
  mode: 'suffix' | 'skip' = 'suffix'
): ImportConflict[] {
  return conflicts.map((c) => {
    if (mode === 'skip') return c;
    let suffix = 1;
    let candidate = `${c.asset.name}-imported`;
    while (candidate === c.existingLocalName) {
      candidate = `${c.asset.name}-imported-${suffix++}`;
    }
    return {
      ...c,
      resolution: 'rename',
      resolvedName: slugifyImportName(candidate),
    };
  });
}

export function summarizeByType(items: DiscoveredImportAsset[]): Record<AssetType, number> {
  return {
    skill: items.filter((i) => i.type === 'skill').length,
    prompt: items.filter((i) => i.type === 'prompt').length,
    mcp: items.filter((i) => i.type === 'mcp').length,
  };
}
