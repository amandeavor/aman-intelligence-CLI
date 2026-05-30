import path from 'path';
import { promises as fs } from 'fs';
import { GLOBAL_CACHE } from '../config/paths.js';
import { readJson, writeJson, exists, ensureDir, readFrontmatter } from '../storage/filesystem.js';
import { AssetType } from '../types/index.js';

export interface ClassificationResult {
  file: string;
  type: AssetType | 'stack' | 'unknown';
  confidence: number;
  reason: string;
}

interface ClassificationMemory {
  [relativePath: string]: AssetType | 'stack';
}

const MEMORY_PATH = path.join(GLOBAL_CACHE, 'classifications.json');

// ── Patterns for classification ─────────────────────────────────────

const SKILL_INDICATORS = [
  /^SKILL\.md$/i,
  /instructions?/i,
  /guide/i,
  /best.?practices/i,
  /workflow/i,
  /how.?to/i,
  /pattern/i,
  /architecture/i,
  /setup/i,
  /conventions?/i,
];

const PROMPT_INDICATORS = [
  /^prompt/i,
  /\bprompt\b/i,
  /^system/i,
  /\brole\b/i,
  /\byou are\b/i,
  /\bact as\b/i,
  /\brespond/i,
  /\bgenerate\b/i,
  /\btask\b/i,
];

const MCP_INDICATORS = [
  /mcpServers/i,
  /\bcommand\b/,
  /\bargs\b/,
  /\"servers\"/,
  /stdio/i,
  /sse/i,
  /transport/i,
];

const STACK_INDICATORS = [
  /\bstack\b/i,
  /\bworkspace\b/i,
  /\bprofile\b/i,
  /\"skills\"/,
  /\"prompts\"/,
  /\"mcps\"/,
];

const IGNORED = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.aman', '__pycache__']);

export class ClassificationService {
  private memory: ClassificationMemory | null = null;

  // ── Load / save memory ──────────────────────────────────────────

  private async loadMemory(): Promise<ClassificationMemory> {
    if (this.memory) return this.memory;
    this.memory = (await readJson<ClassificationMemory>(MEMORY_PATH)) || {};
    return this.memory;
  }

  private async saveMemory(): Promise<void> {
    if (!this.memory) return;
    await ensureDir(path.dirname(MEMORY_PATH));
    await writeJson(MEMORY_PATH, this.memory);
  }

  async remember(relativePath: string, type: AssetType | 'stack'): Promise<void> {
    const mem = await this.loadMemory();
    mem[relativePath] = type;
    await this.saveMemory();
  }

  async rememberBatch(decisions: Record<string, AssetType | 'stack'>): Promise<void> {
    const mem = await this.loadMemory();
    for (const [key, val] of Object.entries(decisions)) {
      mem[key] = val;
    }
    await this.saveMemory();
  }

  async getRemembered(relativePath: string): Promise<AssetType | 'stack' | undefined> {
    const mem = await this.loadMemory();
    return mem[relativePath];
  }

  // ── Walk a directory ────────────────────────────────────────────

  private async walk(root: string, base = root): Promise<string[]> {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      if (IGNORED.has(entry.name)) continue;
      const full = path.join(root, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await this.walk(full, base)));
      } else if (entry.isFile()) {
        files.push(full);
      }
    }
    return files;
  }

  // ── Classify a single file ──────────────────────────────────────

  private async classifyFile(filePath: string, rootDir: string): Promise<ClassificationResult> {
    const relative = path.relative(rootDir, filePath);
    const basename = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();

    // Check memory first
    const remembered = await this.getRemembered(relative);
    if (remembered) {
      return {
        file: relative,
        type: remembered,
        confidence: 100,
        reason: 'Previously classified',
      };
    }

    // SKILL.md is always a skill marker
    if (basename === 'SKILL.md') {
      return { file: relative, type: 'skill', confidence: 99, reason: 'SKILL.md file' };
    }

    // JSON files
    if (ext === '.json') {
      return await this.classifyJson(filePath, relative);
    }

    // Markdown files
    if (ext === '.md') {
      return await this.classifyMarkdown(filePath, relative);
    }

    return { file: relative, type: 'unknown', confidence: 20, reason: 'Unrecognized file type' };
  }

  private async classifyJson(filePath: string, relative: string): Promise<ClassificationResult> {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(raw);

      // MCP detection
      let mcpScore = 0;
      for (const pattern of MCP_INDICATORS) {
        if (pattern.test(raw)) mcpScore += 15;
      }
      if (data.command || data.mcpServers || data.servers) mcpScore += 30;
      mcpScore = Math.min(mcpScore, 99);

      // Stack detection
      let stackScore = 0;
      if (data.skills && Array.isArray(data.skills)) stackScore += 40;
      if (data.prompts && Array.isArray(data.prompts)) stackScore += 25;
      if (data.mcps && Array.isArray(data.mcps)) stackScore += 25;
      for (const pattern of STACK_INDICATORS) {
        if (pattern.test(raw)) stackScore += 5;
      }
      stackScore = Math.min(stackScore, 99);

      if (mcpScore > stackScore && mcpScore >= 50) {
        return { file: relative, type: 'mcp', confidence: mcpScore, reason: 'MCP configuration detected' };
      }
      if (stackScore >= 50) {
        return { file: relative, type: 'stack', confidence: stackScore, reason: 'Stack definition detected' };
      }

      return { file: relative, type: 'unknown', confidence: Math.max(mcpScore, stackScore, 25), reason: 'JSON file, unclear purpose' };
    } catch {
      return { file: relative, type: 'unknown', confidence: 10, reason: 'Invalid JSON' };
    }
  }

  private async classifyMarkdown(filePath: string, relative: string): Promise<ClassificationResult> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const frontmatter = await readFrontmatter(filePath);

      // Check if parent dir has SKILL.md (part of a skill)
      const parentSkillMd = path.join(path.dirname(filePath), 'SKILL.md');
      if (exists(parentSkillMd) && path.basename(filePath) !== 'SKILL.md') {
        return { file: relative, type: 'skill', confidence: 90, reason: 'Part of a skill directory' };
      }

      // Frontmatter hints
      if (frontmatter?.type === 'prompt') {
        return { file: relative, type: 'prompt', confidence: 98, reason: 'Frontmatter declares prompt' };
      }
      if (frontmatter?.type === 'skill') {
        return { file: relative, type: 'skill', confidence: 98, reason: 'Frontmatter declares skill' };
      }

      // Content-based scoring
      let skillScore = 0;
      let promptScore = 0;

      for (const pattern of SKILL_INDICATORS) {
        if (pattern.test(content.slice(0, 2000))) skillScore += 10;
      }
      for (const pattern of PROMPT_INDICATORS) {
        if (pattern.test(content.slice(0, 2000))) promptScore += 12;
      }

      // Long documents with headers tend to be skills
      const headerCount = (content.match(/^#+\s/gm) || []).length;
      if (headerCount >= 3) skillScore += 15;
      if (content.length > 3000) skillScore += 10;

      // Short documents with direct instructions tend to be prompts
      if (content.length < 2000 && promptScore > 0) promptScore += 15;

      skillScore = Math.min(skillScore, 97);
      promptScore = Math.min(promptScore, 97);

      if (skillScore > promptScore && skillScore >= 50) {
        return { file: relative, type: 'skill', confidence: skillScore, reason: 'Content matches skill patterns' };
      }
      if (promptScore >= 50) {
        return { file: relative, type: 'prompt', confidence: promptScore, reason: 'Content matches prompt patterns' };
      }

      const best = Math.max(skillScore, promptScore);
      return { file: relative, type: 'unknown', confidence: best || 25, reason: 'Could not determine type' };
    } catch {
      return { file: relative, type: 'unknown', confidence: 10, reason: 'Could not read file' };
    }
  }

  // ── Classify an entire directory ────────────────────────────────

  async classifyDirectory(rootDir: string): Promise<ClassificationResult[]> {
    const files = await this.walk(rootDir);
    const results: ClassificationResult[] = [];

    // First pass: find SKILL.md markers and mark their parent dirs
    const skillDirs = new Set<string>();
    for (const file of files) {
      if (path.basename(file) === 'SKILL.md') {
        skillDirs.add(path.dirname(file));
      }
    }

    for (const file of files) {
      const dir = path.dirname(file);
      // Skip files inside known skill directories (they're part of the skill)
      if (skillDirs.has(dir) && path.basename(file) !== 'SKILL.md') {
        continue;
      }
      // Skip files in subdirectories of skill directories
      let inSkillDir = false;
      for (const sd of skillDirs) {
        if (dir.startsWith(sd + path.sep) && dir !== sd) {
          inSkillDir = true;
          break;
        }
      }
      if (inSkillDir) continue;

      const result = await this.classifyFile(file, rootDir);
      results.push(result);
    }

    return results;
  }

  // ── Summary helpers ─────────────────────────────────────────────

  summarize(results: ClassificationResult[]): { skills: number; prompts: number; mcps: number; stacks: number; unknown: number } {
    const summary = { skills: 0, prompts: 0, mcps: 0, stacks: 0, unknown: 0 };
    for (const r of results) {
      if (r.type === 'skill') summary.skills++;
      else if (r.type === 'prompt') summary.prompts++;
      else if (r.type === 'mcp') summary.mcps++;
      else if (r.type === 'stack') summary.stacks++;
      else summary.unknown++;
    }
    return summary;
  }

  /** Auto-import threshold: 50%+ per import confidence bands; below 50 is manual review only. */
  highConfidence(results: ClassificationResult[], threshold = 50): ClassificationResult[] {
    return results.filter((r) => r.confidence >= threshold && r.type !== 'unknown');
  }

  lowConfidence(results: ClassificationResult[], threshold = 50): ClassificationResult[] {
    return results.filter((r) => r.confidence < threshold || r.type === 'unknown');
  }
}

export const classificationService = new ClassificationService();
