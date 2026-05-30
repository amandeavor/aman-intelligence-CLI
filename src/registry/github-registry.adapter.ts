import path from 'path';
import { GLOBAL_DIR } from '../config/paths.js';
import { exists } from '../storage/filesystem.js';
import { environmentService } from '../services/environment.service.js';
import { FilesystemRegistryAdapter } from './filesystem-registry.adapter.js';

function repoSlugToDirName(repository: string): string {
  return repository.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'aman-environment';
}

/**
 * GitHub mirror using the same on-disk layout under the cloned environment repo.
 * Path: `~/.aman/repositories/{repo}/registry/`
 */
export class GitHubRegistryAdapter extends FilesystemRegistryAdapter {
  constructor() {
    super(GitHubRegistryAdapter.resolveRoot(), 'github');
  }

  static resolveRoot(): string {
    const storage = environmentService.getStorage();
    if (storage.type !== 'github' || !storage.repository) {
      return path.join(GLOBAL_DIR, 'repositories', '_unconfigured', 'registry');
    }
    const repoDir = path.join(GLOBAL_DIR, 'repositories', repoSlugToDirName(storage.repository));
    return path.join(repoDir, 'registry');
  }

  override async available(): Promise<boolean> {
    const storage = environmentService.getStorage();
    if (storage.type !== 'github' || !storage.repository) return false;
    return exists(this.registryRoot);
  }
}

export const githubRegistryAdapter = new GitHubRegistryAdapter();
