import { BUNDLED_SKILLS, BUNDLED_PROMPTS, BUNDLED_MCPS, LOCAL_DIR } from '../config/paths.js';
import { exists } from '../storage/filesystem.js';
import { HealthCheck } from '../types/index.js';
import { execSync } from 'child_process';
import { lockService } from './lock.service.js';
import { environmentService } from './environment.service.js';
import path from 'path';
import { migrateScopeLayout, findLayoutViolations, assetDir, metadataFilePath, mcpLocalFilePath } from '../storage/asset-layout.js';
import { countEmptyMcpLocalValues, gitignoreIncludesMcpLocalAsync } from '../utils/mcp-local.js';

export class DoctorService {
  async runChecks(scope: 'global' | 'project' = 'global'): Promise<HealthCheck[]> {
    const checks: HealthCheck[] = [];

    const targetDir = scope === 'global' ? environmentService.getActiveEnvironmentDir() : LOCAL_DIR;
    const dirExists = exists(targetDir);
    checks.push({
      name: `${scope} directory exists`,
      status: dirExists ? 'pass' : 'fail',
      message: dirExists ? `Found ${targetDir}` : `Missing ${targetDir}`,
      fix: dirExists ? undefined : `Run 'aman init' to create the environment.`,
    });

    const bundledSkills = exists(BUNDLED_SKILLS);
    const bundledPrompts = exists(BUNDLED_PROMPTS);
    const bundledMcps = exists(BUNDLED_MCPS);
    const bundledOk = bundledSkills && bundledPrompts && bundledMcps;
    const anyBundled = bundledSkills || bundledPrompts || bundledMcps;
    checks.push({
      name: `Bundled assets (optional)`,
      status: bundledOk ? 'pass' : anyBundled ? 'warn' : 'pass',
      message: bundledOk
        ? `Optional dev/catalog tree found beside the CLI package`
        : anyBundled
          ? `Partial catalog tree (skills: ${bundledSkills}, prompts: ${bundledPrompts}, mcps: ${bundledMcps})`
          : `No bundled assets ship with the CLI — install via registry, import, or marketplace`,
    });

    let gitAvailable = false;
    try {
      execSync('git --version', { stdio: 'ignore' });
      gitAvailable = true;
    } catch {
      // Ignore
    }
    checks.push({
      name: `Git installed`,
      status: gitAvailable ? 'pass' : 'warn',
      message: gitAvailable ? `Git is available` : `Git not found - install git for import/sync features`,
    });

    let ghAvailable = false;
    try {
      execSync('gh --version', { stdio: 'ignore' });
      ghAvailable = true;
    } catch {
      // Ignore
    }
    checks.push({
      name: `GitHub CLI`,
      status: ghAvailable ? 'pass' : 'warn',
      message: ghAvailable ? `GitHub CLI is available` : `GitHub CLI not found - install for sync/GitHub storage`,
      fix: ghAvailable ? undefined : `Install using winget/brew/apt or scoop`,
    });

    if (ghAvailable) {
      let ghAuth = false;
      try {
        execSync('gh auth status', { stdio: 'ignore' });
        ghAuth = true;
      } catch {
        // Ignore
      }
      checks.push({
        name: `GitHub auth`,
        status: ghAuth ? 'pass' : 'warn',
        message: ghAuth ? `Authenticated with GitHub` : `Not authenticated with GitHub`,
        fix: ghAuth ? undefined : `Run 'gh auth login' to authenticate`,
      });
    }

    const nodeVersion = process.version;
    const isV18 = parseInt(nodeVersion.slice(1).split('.')[0], 10) >= 18;
    checks.push({
      name: `Node.js version`,
      status: isV18 ? 'pass' : 'fail',
      message: `Running ${nodeVersion}`,
      fix: isV18 ? undefined : `Upgrade Node.js to v18 or newer.`,
    });

    if (dirExists) {
      await migrateScopeLayout(targetDir);

      try {
        await lockService.read(scope);
        checks.push({
          name: `Lockfile valid`,
          status: 'pass',
          message: `Lockfile parsed successfully`,
        });
      } catch {
        checks.push({
          name: `Lockfile valid`,
          status: 'fail',
          message: `Could not parse aman.lock`,
          fix: `Remove and reinstall assets.`,
        });
      }

      try {
        const lock = await lockService.read(scope);
        let missingCount = 0;
        const allEntries = lock.assets;

        for (const entry of allEntries) {
          const typeRoot =
            entry.type === 'skill'
              ? path.join(targetDir, 'skills')
              : entry.type === 'prompt'
                ? path.join(targetDir, 'prompts')
                : path.join(targetDir, 'mcps');
          const metaPath = metadataFilePath(assetDir(entry.type, typeRoot, entry.localName));
          if (!exists(metaPath)) {
            missingCount++;
          }
        }

        checks.push({
          name: `Metadata integrity`,
          status: missingCount === 0 ? 'pass' : 'warn',
          message:
            missingCount === 0
              ? `All assets have valid metadata`
              : `Found ${missingCount} assets with missing metadata`,
          fix: missingCount === 0 ? undefined : `Re-install missing assets to regenerate metadata.`,
        });

        const violations = await findLayoutViolations(targetDir);
        checks.push({
          name: `Canonical asset layout`,
          status: violations.length === 0 ? 'pass' : 'warn',
          message:
            violations.length === 0
              ? `All assets use directory layout (SKILL.md / PROMPT.md / mcp.json)`
              : `${violations.length} layout issue(s): e.g. ${violations[0].type} "${violations[0].localName}" — ${violations[0].issue}`,
          fix:
            violations.length === 0
              ? undefined
              : `Run any install command or open the dashboard to auto-migrate flat files to directories.`,
        });

        let mcpLocalMissing = 0;
        let mcpEmptyValues = 0;
        for (const entry of allEntries) {
          if (entry.type !== 'mcp' || !entry.requiresLocalConfig) continue;
          const mcpDir = assetDir('mcp', path.join(targetDir, 'mcps'), entry.localName);
          const localSecrets = mcpLocalFilePath(mcpDir);
          if (!exists(localSecrets)) {
            mcpLocalMissing++;
          } else {
            mcpEmptyValues += await countEmptyMcpLocalValues(mcpDir);
          }
        }

        checks.push({
          name: `MCP local configuration`,
          status: mcpLocalMissing === 0 ? 'pass' : 'warn',
          message:
            mcpLocalMissing === 0
              ? `All MCPs requiring local config have mcp.local.json`
              : `${mcpLocalMissing} MCP(s) missing mcp.local.json`,
          fix:
            mcpLocalMissing === 0
              ? undefined
              : `Re-install the MCP or create mcp.local.json in the asset directory.`,
        });

        if (mcpEmptyValues > 0) {
          checks.push({
            name: `MCP local secrets filled`,
            status: 'warn',
            message: `${mcpEmptyValues} empty value(s) in mcp.local.json — fill in required secrets`,
            fix: `Edit mcps/{name}/mcp.local.json and set non-empty values for each key.`,
          });
        }

        const gitignoreOk = await gitignoreIncludesMcpLocalAsync(targetDir);
        checks.push({
          name: `mcp.local.json gitignored`,
          status: gitignoreOk ? 'pass' : 'fail',
          message: gitignoreOk
            ? `.gitignore excludes mcps/**/mcp.local.json`
            : `mcp.local.json is not listed in ${path.join(targetDir, '.gitignore')}`,
          fix: gitignoreOk ? undefined : `Add "mcps/**/mcp.local.json" to .gitignore at the scope root.`,
        });
      } catch {
        // Ignore
      }
    }

    return checks;
  }
}

export const doctorService = new DoctorService();
