import { GLOBAL_REGISTRY_DIR } from '../config/paths.js';
import { FilesystemRegistryAdapter } from './filesystem-registry.adapter.js';

/** V1 canonical registry at `~/.aman/registry/`. */
export class LocalRegistryAdapter extends FilesystemRegistryAdapter {
  constructor(registryRoot = GLOBAL_REGISTRY_DIR) {
    super(registryRoot, 'local');
  }
}

export const localRegistryAdapter = new LocalRegistryAdapter();
