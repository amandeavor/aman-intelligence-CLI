import { IMPORT_ADAPTERS, getAdapter } from './adapters.js';
import { ImportAdapterDescriptor, ImportSourceId, DiscoveredImportAsset } from './types.js';

export class ImportDiscoveryService {
  listAdapters(): ImportAdapterDescriptor[] {
    return IMPORT_ADAPTERS.map((adapter) => {
      const available = adapter.isAvailable();
      return {
        id: adapter.id,
        label: adapter.label,
        description: adapter.description,
        available,
        unavailableReason: available ? undefined : adapter.unavailableReason(),
      };
    });
  }

  async scan(sourceId: ImportSourceId, options?: { rootPath?: string }): Promise<DiscoveredImportAsset[]> {
    const adapter = getAdapter(sourceId);
    if (!adapter) {
      throw new Error(`Unknown import source: ${sourceId}`);
    }
    if (!adapter.isAvailable() && sourceId !== 'local-folder' && sourceId !== 'custom-path' && sourceId !== 'aman-environment') {
      throw new Error(adapter.unavailableReason());
    }
    return adapter.scan(options);
  }
}

export const importDiscoveryService = new ImportDiscoveryService();
