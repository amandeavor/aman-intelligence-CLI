import { spawnSync } from 'child_process';
import { exists, ensureDir, removeDir } from '../storage/filesystem.js';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { McpConfig, Prompt, Skill } from '../types/index.js';

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
    } catch (err) {
      await removeDir(tempDir);
      throw new Error(`Failed to clone ${cloneUrl}. Is git installed? Does the repo exist?`);
    }
  }

  /**
   * Detects what assets are available in an imported directory.
   */
  async detect(dir: string): Promise<any> {
    const { scanAll } = await import('../storage/scanner.js');
    const standardized = await scanAll(dir, 'github');
    const total = standardized.skills.length + standardized.prompts.length + standardized.mcps.length;
    if (total > 0) {
      return standardized;
    }

    return await this.detectLooseAssets(dir);
  }

  private async detectLooseAssets(dir: string): Promise<{
    skills: Skill[];
    prompts: Prompt[];
    mcps: McpConfig[];
    stacks: any[];
  }> {
    const { readFrontmatter, readJson } = await import('../storage/filesystem.js');
    const files = await this.walk(dir);
    const skills: Skill[] = [];
    const prompts: Prompt[] = [];
    const mcps: McpConfig[] = [];
    const skillDirs = new Set(
      files
        .filter((file) => path.basename(file) === 'SKILL.md')
        .map((file) => path.dirname(file)),
    );

    for (const file of files) {
      const basename = path.basename(file);
      const ext = path.extname(file).toLowerCase();

      if (basename === 'SKILL.md') {
        const skillPath = path.dirname(file);
        const name = path.basename(skillPath);
        const frontmatter = await readFrontmatter(file);
        skills.push({
          name,
          path: skillPath,
          description: frontmatter?.description,
          tags: frontmatter?.tags,
          hasSkillMd: true,
          source: 'github',
        });
        continue;
      }

      if (ext === '.md') {
        const parent = path.dirname(file);
        if (skillDirs.has(parent)) continue;

        prompts.push({
          name: path.basename(file, '.md'),
          path: file,
          description: await this.firstContentLine(file),
          source: 'github',
        });
        continue;
      }

      if (ext === '.json') {
        const data = await readJson<any>(file);
        if (!data) continue;

        const looksLikeMcp = Boolean(data.command || data.mcpServers || data.servers || data.name);
        if (!looksLikeMcp) continue;

        mcps.push({
          name: data.name || path.basename(file, '.json'),
          path: file,
          command: data.command,
          args: data.args,
          env: data.env,
          source: 'github',
        });
      }
    }

    return {
      skills: skills.sort((a, b) => a.name.localeCompare(b.name)),
      prompts: prompts.sort((a, b) => a.name.localeCompare(b.name)),
      mcps: mcps.sort((a, b) => a.name.localeCompare(b.name)),
      stacks: [],
    };
  }

  private async walk(root: string): Promise<string[]> {
    const ignored = new Set(['.git', 'node_modules', 'dist', 'build', '.next']);
    const entries = await fs.readdir(root, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      if (ignored.has(entry.name)) continue;

      const fullPath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        files.push(...await this.walk(fullPath));
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }

    return files;
  }

  private async firstContentLine(file: string): Promise<string | undefined> {
    try {
      const content = await fs.readFile(file, 'utf-8');
      return content
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.length > 0 && !line.startsWith('#') && line !== '---');
    } catch {
      return undefined;
    }
  }
}

export const githubService = new GithubService();
