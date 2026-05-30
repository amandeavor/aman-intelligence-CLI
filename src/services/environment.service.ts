import { execFileSync, spawnSync } from 'child_process';
import os from 'os';
import path from 'path';
import { GLOBAL_CONFIG_DIR, GLOBAL_DIR, LOCAL_DIR } from '../config/paths.js';
import { configService } from './config.service.js';
import { copyDir, ensureDir, exists, writeJson } from '../storage/filesystem.js';

export type StorageMode = 'local' | 'github';

export interface EnvironmentManifest {
  name: string;
  version: 1;
  createdAt: string;
  storage: {
    type: StorageMode;
    repository?: string;
  };
}

export interface InitLocalOptions {
  storagePath?: string;
}

export interface InitGithubOptions {
  repository: string;
  mode: 'create' | 'existing';
}

const ENVIRONMENT_DIRS = ['skills', 'prompts', 'mcps', 'stacks'];

interface InstallAttempt {
  command: string;
  args: string[];
}

function expandHome(inputPath: string): string {
  if (inputPath === '~') return os.homedir();
  if (inputPath.startsWith(`~${path.sep}`) || inputPath.startsWith('~/')) {
    return path.join(os.homedir(), inputPath.slice(2));
  }
  return inputPath;
}

function repoSlugToDirName(repository: string): string {
  return repository.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'aman-environment';
}

export class EnvironmentService {
  getActiveEnvironmentDir(): string {
    return configService.get('environmentPath') || GLOBAL_DIR;
  }

  getStorage(): EnvironmentManifest['storage'] {
    return configService.get('storage') || { type: 'local' };
  }

  getProjectEnvironmentDir(): string {
    return path.resolve(process.cwd(), LOCAL_DIR);
  }

  resolveStoragePath(storagePath?: string): string {
    return path.resolve(expandHome(storagePath || GLOBAL_DIR));
  }

  isGithubCliAvailable(): boolean {
    try {
      this.addKnownGithubCliPaths();
      execFileSync('gh', ['--version'], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  installGithubCli(): void {
    if (this.isGithubCliAvailable()) return;

    const attempts = this.githubCliInstallAttempts();
    if (attempts.length === 0) {
      throw new Error('Automatic GitHub CLI install is not supported on this operating system yet.');
    }

    for (const attempt of attempts) {
      const result = spawnSync(attempt.command, attempt.args, { stdio: 'pipe' });
      if (result.status === 0 && this.isGithubCliAvailable()) {
        return;
      }
    }

    throw new Error('Could not install GitHub CLI automatically.');
  }

  async ensureEnvironment(baseDir: string, storage: EnvironmentManifest['storage']): Promise<void> {
    await ensureDir(baseDir);

    for (const dir of ENVIRONMENT_DIRS) {
      await ensureDir(path.join(baseDir, dir));
    }

    const manifestPath = path.join(baseDir, 'aman.json');
    if (!exists(manifestPath)) {
      const manifest: EnvironmentManifest = {
        name: path.basename(baseDir) || 'aman-environment',
        version: 1,
        createdAt: new Date().toISOString(),
        storage,
      };
      await writeJson(manifestPath, manifest);
    }
  }

  async ensureProjectEnvironment(): Promise<string> {
    const projectDir = this.getProjectEnvironmentDir();
    await this.ensureEnvironment(projectDir, { type: 'local' });
    return projectDir;
  }

  async ensureActiveEnvironment(): Promise<string> {
    const environmentPath = this.getActiveEnvironmentDir();
    await this.ensureEnvironment(environmentPath, this.getStorage());
    return environmentPath;
  }

  async initLocal(options: InitLocalOptions = {}): Promise<string> {
    const environmentPath = this.resolveStoragePath(options.storagePath);
    await this.ensureEnvironment(environmentPath, { type: 'local' });
    await ensureDir(GLOBAL_CONFIG_DIR);
    configService.set('environmentPath', environmentPath);
    configService.set('storage', { type: 'local' });
    return environmentPath;
  }

  async initGithub(options: InitGithubOptions): Promise<string> {
    this.ensureGhAvailable();
    this.ensureGhAuthenticated();

    const repoDir = path.join(GLOBAL_DIR, 'repositories', repoSlugToDirName(options.repository));
    await ensureDir(path.dirname(repoDir));

    if (options.mode === 'existing') {
      await this.cloneRepository(options.repository, repoDir);
      await this.ensureEnvironment(repoDir, { type: 'github', repository: options.repository });
      this.gitCommitAndPush(repoDir, 'Standardize Aman environment');
    } else {
      await this.ensureEnvironment(repoDir, { type: 'github', repository: options.repository });
      this.gitInit(repoDir);
      this.gitCommit(repoDir, 'Initial Aman environment');
      this.createAndPushRepository(options.repository, repoDir);
    }

    await ensureDir(GLOBAL_CONFIG_DIR);
    configService.set('environmentPath', repoDir);
    configService.set('storage', { type: 'github', repository: options.repository });
    return repoDir;
  }

  async importStandardized(sourceDir: string, targetDir: string): Promise<void> {
    await this.ensureEnvironment(targetDir, { type: 'local' });
    for (const dir of ENVIRONMENT_DIRS) {
      const src = path.join(sourceDir, dir);
      if (exists(src)) {
        await copyDir(src, path.join(targetDir, dir));
      }
    }
  }

  private ensureGhAvailable(): void {
    if (!this.isGithubCliAvailable()) {
      throw new Error('GitHub CLI not found.');
    }
  }

  private addKnownGithubCliPaths(): void {
    if (process.platform !== 'win32') return;

    const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === 'path') || 'Path';
    const currentPath = process.env[pathKey] || '';
    const candidates = [
      process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'GitHub CLI') : undefined,
      process.env['ProgramFiles(x86)'] ? path.join(process.env['ProgramFiles(x86)'], 'GitHub CLI') : undefined,
      process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'GitHub CLI') : undefined,
    ].filter((candidate): candidate is string => Boolean(candidate));

    for (const candidate of candidates) {
      if (!exists(path.join(candidate, 'gh.exe'))) continue;
      if (currentPath.toLowerCase().split(';').includes(candidate.toLowerCase())) continue;
      process.env[pathKey] = `${candidate};${currentPath}`;
      return;
    }
  }

  private githubCliInstallAttempts(): InstallAttempt[] {
    if (process.platform === 'win32') {
      return [
        {
          command: 'winget',
          args: [
            'install',
            '--id',
            'GitHub.cli',
            '-e',
            '--source',
            'winget',
            '--accept-package-agreements',
            '--accept-source-agreements',
          ],
        },
        { command: 'choco', args: ['install', 'gh', '-y'] },
        { command: 'scoop', args: ['install', 'gh'] },
      ];
    }

    if (process.platform === 'darwin') {
      return [{ command: 'brew', args: ['install', 'gh'] }];
    }

    if (process.platform === 'linux') {
      return [
        { command: 'sh', args: ['-lc', 'command -v apt-get >/dev/null && sudo apt-get update && sudo apt-get install -y gh'] },
        { command: 'sh', args: ['-lc', 'command -v dnf >/dev/null && sudo dnf install -y gh'] },
        { command: 'sh', args: ['-lc', 'command -v yum >/dev/null && sudo yum install -y gh'] },
        { command: 'sh', args: ['-lc', 'command -v pacman >/dev/null && sudo pacman -S --noconfirm github-cli'] },
      ];
    }

    return [];
  }

  private ensureGhAuthenticated(): void {
    const status = spawnSync('gh', ['auth', 'status'], { stdio: 'ignore' });
    if (status.status === 0) return;

    const login = spawnSync('gh', ['auth', 'login'], { stdio: 'inherit' });
    if (login.status !== 0) {
      throw new Error('GitHub authentication was not completed.');
    }
  }

  private cloneRepository(repository: string, repoDir: string): void {
    if (exists(repoDir)) return;

    const result = spawnSync('gh', ['repo', 'clone', repository, repoDir], { stdio: 'pipe' });
    if (result.status !== 0) {
      const errDetail = result.stderr?.toString().trim();
      throw new Error(`Could not clone ${repository}. Check the repository name and your GitHub access.${errDetail ? ` Details: ${errDetail}` : ''}`);
    }
  }

  private gitInit(repoDir: string): void {
    if (exists(path.join(repoDir, '.git'))) return;
    execFileSync('git', ['-C', repoDir, 'init'], { stdio: 'ignore' });
  }

  private gitCommit(repoDir: string, message: string): void {
    execFileSync('git', ['-C', repoDir, 'add', '.'], { stdio: 'ignore' });
    execFileSync('git', ['-C', repoDir, 'commit', '-m', message], { stdio: 'ignore' });
  }

  private gitCommitAndPush(repoDir: string, message: string): void {
    try {
      execFileSync('git', ['-C', repoDir, 'add', '.'], { stdio: 'ignore' });
      execFileSync('git', ['-C', repoDir, 'diff', '--cached', '--quiet'], { stdio: 'ignore' });
    } catch {
      this.gitCommit(repoDir, message);
      execFileSync('git', ['-C', repoDir, 'push'], { stdio: 'ignore' });
    }
  }

  private createAndPushRepository(repository: string, repoDir: string): void {
    const result = spawnSync(
      'gh',
      ['repo', 'create', repository, '--private', '--source', repoDir, '--remote', 'origin', '--push'],
      { stdio: 'pipe' },
    );

    if (result.status !== 0) {
      const errDetail = result.stderr?.toString().trim();
      throw new Error(`Could not create GitHub repository ${repository}.${errDetail ? ` Details: ${errDetail}` : ''}`);
    }
  }
}

export const environmentService = new EnvironmentService();
