import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { exists, readJson } from '../storage/filesystem.js';
import {
  discoverMcpFromJsonFile,
  discoverPromptFile,
  discoverSkillDir,
  expandHome,
  listSkillDirs,
  parseCodexMcpBlocks,
  codexBlockToMcpJson,
  makeAssetId,
  slugifyImportName,
  vscodeUserMcpPath,
  discoverRulesAsSkills,
  discoverContinuePrompts,
  discoverContinueMcpFromConfig,
  discoverAmanEnvironmentAssets,
} from './utils.js';
import { DiscoveredImportAsset, ImportAdapter, ImportSourceId } from './types.js';

function claudeJsonMcpPaths(): string[] {
  const home = os.homedir();
  return [
    path.join(home, '.claude.json'),
    path.join(process.cwd(), '.mcp.json'),
    path.join(process.cwd(), '.claude', 'settings.local.json'),
  ];
}

export const claudeCodeAdapter: ImportAdapter = {
  id: 'claude-code',
  label: 'Claude Code',
  description: 'Skills, commands, and MCP configs from Claude Code',

  isAvailable() {
    const home = os.homedir();
    return (
      exists(path.join(home, '.claude')) ||
      exists(path.join(home, '.claude.json')) ||
      exists(path.join(process.cwd(), '.claude')) ||
      exists(path.join(process.cwd(), '.mcp.json'))
    );
  },

  unavailableReason() {
    return 'No Claude Code config found (~/.claude, ~/.claude.json, or project .claude/)';
  },

  async scan() {
    const home = os.homedir();
    const found: DiscoveredImportAsset[] = [];
    const seen = new Set<string>();

    const skillRoots = [
      path.join(home, '.claude', 'skills'),
      path.join(process.cwd(), '.claude', 'skills'),
    ];

    for (const root of skillRoots) {
      for (const dir of await listSkillDirs(root)) {
        const key = `skill:${dir}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const asset = await discoverSkillDir(dir, 'claude-code', root.replace(home, '~'));
        if (asset) found.push(asset);
      }
    }

    const commandRoots = [
      path.join(home, '.claude', 'commands'),
      path.join(process.cwd(), '.claude', 'commands'),
    ];

    for (const root of commandRoots) {
      if (!exists(root)) continue;
      const files = await fs.readdir(root);
      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        const filePath = path.join(root, file);
        const key = `prompt:${filePath}`;
        if (seen.has(key)) continue;
        seen.add(key);
        found.push(
          await discoverPromptFile(filePath, 'claude-code', `${root.replace(home, '~')}/${file}`, file.replace(/\.md$/, ''))
        );
      }
    }

    for (const configPath of claudeJsonMcpPaths()) {
      const mcps = await discoverMcpFromJsonFile(
        configPath,
        'claude-code',
        configPath.replace(home, '~')
      );
      for (const m of mcps) {
        const key = `mcp:${m.originLabel}`;
        if (seen.has(key)) continue;
        seen.add(key);
        found.push(m);
      }
    }

    return found;
  },
};

export const vscodeAdapter: ImportAdapter = {
  id: 'vscode',
  label: 'VS Code',
  description: 'MCP servers from VS Code user and workspace mcp.json',

  isAvailable() {
    return (
      exists(vscodeUserMcpPath()) || exists(path.join(process.cwd(), '.vscode', 'mcp.json'))
    );
  },

  unavailableReason() {
    return 'No VS Code MCP config found (User/mcp.json or .vscode/mcp.json)';
  },

  async scan() {
    const home = os.homedir();
    const paths = [
      vscodeUserMcpPath(),
      path.join(process.cwd(), '.vscode', 'mcp.json'),
    ];
    const found: DiscoveredImportAsset[] = [];
    const seen = new Set<string>();

    for (const configPath of paths) {
      const mcps = await discoverMcpFromJsonFile(
        configPath,
        'vscode',
        configPath.replace(home, '~')
      );
      for (const m of mcps) {
        const key = `mcp:${m.originLabel}`;
        if (seen.has(key)) continue;
        seen.add(key);
        found.push(m);
      }
    }

    return found;
  },
};

export const githubCopilotAdapter: ImportAdapter = {
  id: 'github-copilot',
  label: 'GitHub Copilot',
  description: 'Copilot instruction files and workspace MCP configs',

  isAvailable() {
    const cwd = process.cwd();
    return (
      exists(path.join(cwd, '.github', 'copilot-instructions.md')) ||
      exists(path.join(cwd, '.github', 'instructions')) ||
      exists(path.join(cwd, '.vscode', 'mcp.json'))
    );
  },

  unavailableReason() {
    return 'No Copilot instruction files found (.github/copilot-instructions.md or .github/instructions/)';
  },

  async scan() {
    const cwd = process.cwd();
    const found: DiscoveredImportAsset[] = [];
    const seen = new Set<string>();

    const copilotMain = path.join(cwd, '.github', 'copilot-instructions.md');
    if (exists(copilotMain)) {
      found.push({
        ...(await discoverPromptFile(copilotMain, 'github-copilot', '.github/copilot-instructions.md', 'copilot-instructions')),
        description: 'GitHub Copilot repository instructions',
        confidence: 90,
      });
    }

    const instrDir = path.join(cwd, '.github', 'instructions');
    if (exists(instrDir)) {
      const files = await fs.readdir(instrDir);
      for (const file of files) {
        if (!file.endsWith('.md') && !file.endsWith('.instructions.md')) continue;
        const filePath = path.join(instrDir, file);
        const key = `prompt:${filePath}`;
        if (seen.has(key)) continue;
        seen.add(key);
        found.push(
          await discoverPromptFile(filePath, 'github-copilot', `.github/instructions/${file}`, file.replace(/\.(instructions\.)?md$/, ''))
        );
      }
    }

    const mcpPath = path.join(cwd, '.vscode', 'mcp.json');
    const mcps = await discoverMcpFromJsonFile(mcpPath, 'github-copilot', '.vscode/mcp.json');
    for (const m of mcps) {
      const key = `mcp:${m.originLabel}`;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push(m);
    }

    return found;
  },
};

export const codexAdapter: ImportAdapter = {
  id: 'codex',
  label: 'OpenAI Codex',
  description: 'Skills and MCP servers from Codex CLI config',

  isAvailable() {
    const home = os.homedir();
    return (
      exists(path.join(home, '.codex')) ||
      exists(path.join(home, '.codex', 'config.toml')) ||
      exists(path.join(process.cwd(), '.codex', 'config.toml'))
    );
  },

  unavailableReason() {
    return 'No Codex config found (~/.codex/config.toml or project .codex/config.toml)';
  },

  async scan() {
    const home = os.homedir();
    const found: DiscoveredImportAsset[] = [];
    const seen = new Set<string>();

    const skillRoots = [
      path.join(home, '.codex', 'skills'),
      path.join(process.cwd(), '.codex', 'skills'),
    ];

    for (const root of skillRoots) {
      for (const dir of await listSkillDirs(root)) {
        const key = `skill:${dir}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const asset = await discoverSkillDir(dir, 'codex', root.replace(home, '~'));
        if (asset) found.push(asset);
      }
    }

    const configPaths = [
      path.join(home, '.codex', 'config.toml'),
      path.join(process.cwd(), '.codex', 'config.toml'),
    ];

    for (const configPath of configPaths) {
      if (!exists(configPath)) continue;
      const text = await fs.readFile(configPath, 'utf-8');
      for (const block of parseCodexMcpBlocks(text)) {
        const key = `mcp:${configPath}:${block.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const mcpJson = codexBlockToMcpJson(block);
        const stagingNote = `${configPath.replace(home, '~')} [${block.name}]`;
        found.push({
          id: makeAssetId(),
          type: 'mcp',
          name: slugifyImportName(block.name),
          description: `Codex MCP server "${block.name}"`,
          sourcePath: configPath,
          originLabel: stagingNote,
          canonicalStatus: 'convertible',
          canonicalNote: 'Will convert Codex TOML entry to canonical mcp.json',
          confidence: 85,
          adapterId: 'codex',
          mcpServerName: block.name,
          // stash converted json path marker via mcpServerName + codex inline
        });
        // Store inline json in a sidecar temp during import - import service handles codex specially
        void mcpJson;
      }
    }

    return found;
  },
};

export const localFolderAdapter: ImportAdapter = {
  id: 'local-folder',
  label: 'Local folder',
  description: 'Import from a folder on this machine',

  isAvailable() {
    return true;
  },

  unavailableReason() {
    return '';
  },

  async scan(options) {
    const root = options?.rootPath ? path.resolve(expandHome(options.rootPath)) : process.cwd();
    if (!exists(root)) {
      throw new Error(`Path not found: ${root}`);
    }
    const { classificationService } = await import('../services/classification.service.js');
    const classifications = await classificationService.classifyDirectory(root);
    const found: DiscoveredImportAsset[] = [];

    for (const c of classifications) {
      if (c.type !== 'skill' && c.type !== 'prompt' && c.type !== 'mcp') continue;
      let sourcePath = path.resolve(root, c.file);
      let name = path.basename(c.file, path.extname(c.file)).replace(/[/\\]/g, '-');

      if (c.type === 'skill') {
        sourcePath = path.dirname(sourcePath);
        if (sourcePath === root) name = path.basename(root);
        else name = path.basename(sourcePath);
        const asset = await discoverSkillDir(sourcePath, 'local-folder', c.file);
        if (asset) {
          asset.confidence = c.confidence;
          asset.canonicalNote = c.reason;
          if (c.confidence < 50) asset.canonicalStatus = 'ambiguous';
          found.push(asset);
        }
        continue;
      }

      found.push({
        id: makeAssetId(),
        type: c.type,
        name: slugifyImportName(name),
        description: c.reason,
        sourcePath,
        originLabel: c.file,
        canonicalStatus: c.confidence >= 70 ? 'convertible' : 'ambiguous',
        canonicalNote: c.confidence < 70 ? `Classification: ${c.reason} (${c.confidence}%)` : c.reason,
        confidence: c.confidence,
        adapterId: 'local-folder',
      });
    }

    return found;
  },
};

export const customPathAdapter: ImportAdapter = {
  id: 'custom-path',
  label: 'Custom path',
  description: 'Enter any folder path to scan',

  isAvailable() {
    return true;
  },

  unavailableReason() {
    return '';
  },

  async scan(options) {
    if (!options?.rootPath) {
      throw new Error('Custom path import requires a folder path');
    }
    return localFolderAdapter.scan(options);
  },
};

// ── New adapters ────────────────────────────────────────────────────

function cursorRulesDirs(): string[] {
  const home = os.homedir();
  return [
    path.join(home, '.cursor', 'rules'),
    path.join(process.cwd(), '.cursor', 'rules'),
  ];
}

function cursorDotfiles(): string[] {
  return [
    path.join(process.cwd(), '.cursorrules'),
  ];
}

function cursorMcpPaths(): string[] {
  const home = os.homedir();
  return [
    path.join(home, '.cursor', 'mcp.json'),
    path.join(process.cwd(), '.cursor', 'mcp.json'),
  ];
}

export const cursorAdapter: ImportAdapter = {
  id: 'cursor',
  label: 'Cursor',
  description: 'Rules and MCP configs from Cursor editor',

  isAvailable() {
    const home = os.homedir();
    return (
      exists(path.join(home, '.cursor')) ||
      exists(path.join(process.cwd(), '.cursor')) ||
      exists(path.join(process.cwd(), '.cursorrules'))
    );
  },

  unavailableReason() {
    return 'No Cursor config found (~/.cursor/ or project .cursor/)';
  },

  async scan() {
    const home = os.homedir();
    const found: DiscoveredImportAsset[] = [];
    const seen = new Set<string>();

    // Skills from rules directories and dotfiles
    const skills = await discoverRulesAsSkills(
      cursorRulesDirs(),
      cursorDotfiles(),
      'cursor',
      '.cursor/rules'
    );
    for (const s of skills) {
      const key = `skill:${s.sourcePath}`;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push(s);
    }

    // MCPs from mcp.json files
    for (const configPath of cursorMcpPaths()) {
      const mcps = await discoverMcpFromJsonFile(
        configPath,
        'cursor',
        configPath.replace(home, '~')
      );
      for (const m of mcps) {
        const key = `mcp:${m.originLabel}`;
        if (seen.has(key)) continue;
        seen.add(key);
        found.push(m);
      }
    }

    return found;
  },
};

function windsurfRulesDirs(): string[] {
  const home = os.homedir();
  return [
    path.join(home, '.codeium', 'windsurf', 'rules'),
    path.join(process.cwd(), '.windsurf', 'rules'),
  ];
}

function windsurfDotfiles(): string[] {
  return [
    path.join(process.cwd(), '.windsurfrules'),
  ];
}

function windsurfMcpPaths(): string[] {
  const home = os.homedir();
  return [
    path.join(home, '.codeium', 'windsurf', 'mcp_config.json'),
    path.join(process.cwd(), '.windsurf', 'mcp.json'),
  ];
}

export const windsurfAdapter: ImportAdapter = {
  id: 'windsurf',
  label: 'Windsurf',
  description: 'Rules and MCP configs from Windsurf editor',

  isAvailable() {
    const home = os.homedir();
    return (
      exists(path.join(home, '.codeium', 'windsurf')) ||
      exists(path.join(process.cwd(), '.windsurf')) ||
      exists(path.join(process.cwd(), '.windsurfrules'))
    );
  },

  unavailableReason() {
    return 'No Windsurf config found (~/.codeium/windsurf/ or project .windsurf/)';
  },

  async scan() {
    const home = os.homedir();
    const found: DiscoveredImportAsset[] = [];
    const seen = new Set<string>();

    // Skills from rules directories and dotfiles
    const skills = await discoverRulesAsSkills(
      windsurfRulesDirs(),
      windsurfDotfiles(),
      'windsurf',
      '.windsurf/rules'
    );
    for (const s of skills) {
      const key = `skill:${s.sourcePath}`;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push(s);
    }

    // MCPs from config files
    for (const configPath of windsurfMcpPaths()) {
      const mcps = await discoverMcpFromJsonFile(
        configPath,
        'windsurf',
        configPath.replace(home, '~')
      );
      for (const m of mcps) {
        const key = `mcp:${m.originLabel}`;
        if (seen.has(key)) continue;
        seen.add(key);
        found.push(m);
      }
    }

    return found;
  },
};

export const continueAdapter: ImportAdapter = {
  id: 'continue',
  label: 'Continue.dev',
  description: 'Prompts, docs, and MCP configs from Continue',

  isAvailable() {
    const home = os.homedir();
    return exists(path.join(home, '.continue'));
  },

  unavailableReason() {
    return 'No Continue config found (~/.continue/)';
  },

  async scan() {
    const home = os.homedir();
    const found: DiscoveredImportAsset[] = [];
    const seen = new Set<string>();

    // Prompts from ~/.continue/prompts/
    const promptsDir = path.join(home, '.continue', 'prompts');
    const prompts = await discoverContinuePrompts(promptsDir, 'continue');
    for (const p of prompts) {
      const key = `prompt:${p.sourcePath}`;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push(p);
    }

    // Skills from ~/.continue/docs/ (custom documentation context)
    const docsDir = path.join(home, '.continue', 'docs');
    if (exists(docsDir)) {
      for (const dir of await listSkillDirs(docsDir)) {
        const key = `skill:${dir}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const asset = await discoverSkillDir(dir, 'continue', docsDir.replace(home, '~'));
        if (asset) found.push(asset);
      }
    }

    // MCPs from config.json and config.yaml
    const configPaths = [
      path.join(home, '.continue', 'config.json'),
      path.join(home, '.continue', 'config.yaml'),
    ];
    for (const configPath of configPaths) {
      const mcps = await discoverContinueMcpFromConfig(configPath, 'continue');
      for (const m of mcps) {
        const key = `mcp:${m.originLabel}`;
        if (seen.has(key)) continue;
        seen.add(key);
        found.push(m);
      }
    }

    return found;
  },
};

export const amanEnvironmentAdapter: ImportAdapter = {
  id: 'aman-environment',
  label: 'Aman Environment',
  description: 'Import assets from another Aman environment',

  isAvailable() {
    // Always available when a rootPath is provided; acts as target-only
    return true;
  },

  unavailableReason() {
    return '';
  },

  async scan(options) {
    const rootPath = options?.rootPath;
    if (!rootPath) {
      throw new Error('Aman environment import requires a path (the environment directory)');
    }
    const resolved = path.resolve(expandHome(rootPath));
    if (!exists(resolved)) {
      throw new Error(`Path not found: ${resolved}`);
    }
    // Validate it looks like an Aman environment
    const hasManifest = exists(path.join(resolved, 'aman.json'));
    const hasSkills = exists(path.join(resolved, 'skills'));
    const hasPrompts = exists(path.join(resolved, 'prompts'));
    const hasMcps = exists(path.join(resolved, 'mcps'));
    if (!hasManifest && !hasSkills && !hasPrompts && !hasMcps) {
      throw new Error(`Not a valid Aman environment: ${resolved}`);
    }
    return discoverAmanEnvironmentAssets(resolved, 'aman-environment');
  },
};

export const antigravityAdapter: ImportAdapter = {
  id: 'antigravity',
  label: 'Antigravity',
  description: 'Skills and MCP configs from Antigravity IDE',

  isAvailable() {
    const home = os.homedir();
    return (
      exists(path.join(home, '.gemini')) ||
      exists(path.join(home, '.gemini', 'config'))
    );
  },

  unavailableReason() {
    return 'No Antigravity configurations found (~/.gemini/)';
  },

  async scan() {
    const home = os.homedir();
    const found: DiscoveredImportAsset[] = [];
    const seen = new Set<string>();

    // 1. Scan Antigravity plugins for skills
    const pluginsRoot = path.join(home, '.gemini', 'config', 'plugins');
    if (exists(pluginsRoot)) {
      try {
        const dirents = await fs.readdir(pluginsRoot, { withFileTypes: true });
        const pluginDirs = dirents.filter((d) => d.isDirectory()).map((d) => d.name);

        for (const pluginName of pluginDirs) {
          const skillsDir = path.join(pluginsRoot, pluginName, 'skills');
          const skillMd = path.join(skillsDir, 'SKILL.md');

          if (exists(skillMd)) {
            const key = `skill:${skillsDir}`;
            if (seen.has(key)) continue;
            seen.add(key);

            const asset = await discoverSkillDir(skillsDir, 'antigravity', `~/.gemini/config/plugins/${pluginName}/skills`);
            if (asset) {
              // Custom clean name, e.g. "android-cli-plugin" -> "android-cli"
              asset.name = slugifyImportName(pluginName.replace(/-plugin$/, ''));
              found.push(asset);
            }
          }
        }
      } catch {
        // Ignore read errors
      }
    }

    // 2. Scan Antigravity MCP configs
    const mcpConfigPath = path.join(home, '.gemini', 'config', 'mcp_config.json');
    if (exists(mcpConfigPath)) {
      const mcps = await discoverMcpFromJsonFile(
        mcpConfigPath,
        'antigravity',
        '~/.gemini/config/mcp_config.json'
      );
      for (const m of mcps) {
        const key = `mcp:${m.originLabel}`;
        if (seen.has(key)) continue;
        seen.add(key);
        found.push(m);
      }
    }

    return found;
  },
};

export const IMPORT_ADAPTERS: ImportAdapter[] = [
  claudeCodeAdapter,
  cursorAdapter,
  windsurfAdapter,
  continueAdapter,
  vscodeAdapter,
  githubCopilotAdapter,
  codexAdapter,
  localFolderAdapter,
  customPathAdapter,
  amanEnvironmentAdapter,
  antigravityAdapter,
];

export function getAdapter(id: ImportSourceId): ImportAdapter | undefined {
  return IMPORT_ADAPTERS.find((a) => a.id === id);
}
