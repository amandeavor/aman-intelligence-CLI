import { randomUUID } from 'crypto';
import { RegistryAdapter } from './adapter.interface.js';
import { RegistryError } from './errors.js';
import {
  RegistryDependencyRef,
  RegistryDeprecateRequest,
  RegistryDeprecateResult,
  RegistryListRequest,
  RegistryListResult,
  RegistryPublishRequest,
  RegistryPublishResult,
  RegistryResolveRequest,
  RegistrySearchRequest,
  RegistrySearchResult,
  RegistryVersionRecord,
} from './types.js';
import { localRegistryAdapter } from './local-registry.adapter.js';
import { githubRegistryAdapter } from './github-registry.adapter.js';
import { parseRegistryReference } from './slug-utils.js';
import { assetService } from '../services/asset.service.js';
import { AssetType, Scope } from '../types/index.js';
import { localNameFromSlug } from '../utils/slug.js';
import { DeprecatedMetadata } from '../types/asset-metadata.js';

export type RegistryBackend = 'local' | 'github';

function readRegistryBackendFromEnv(): RegistryBackend {
  const value = process.env.AMAN_REGISTRY_BACKEND?.trim().toLowerCase();
  return value === 'github' ? 'github' : 'local';
}

export interface RegistryInstallResult {
  slug: string;
  version: string;
  localName: string;
  warnings: string[];
}

interface DependencyNode {
  slug: string;
  version: string;
}

export class RegistryService {
  private backend: RegistryBackend;

  constructor() {
    this.backend = readRegistryBackendFromEnv();
  }

  setBackend(backend: RegistryBackend): void {
    this.backend = backend;
  }

  getBackend(): RegistryBackend {
    return this.backend;
  }

  getAdapter(): RegistryAdapter {
    return this.backend === 'github' ? githubRegistryAdapter : localRegistryAdapter;
  }

  /** Search merges local registry hits (V1 primary). */
  async search(request: RegistrySearchRequest): Promise<RegistrySearchResult> {
    const adapter = localRegistryAdapter;
    if (!(await adapter.available())) {
      return { hits: [], total: 0 };
    }
    return adapter.search(request);
  }

  async resolve(request: RegistryResolveRequest) {
    return this.getAdapter().resolve(request);
  }

  async publish(request: RegistryPublishRequest): Promise<RegistryPublishResult> {
    return this.getAdapter().publish(request);
  }

  async deprecate(request: RegistryDeprecateRequest): Promise<RegistryDeprecateResult> {
    return this.getAdapter().deprecate(request);
  }

  async list(request: RegistryListRequest): Promise<RegistryListResult> {
    return this.getAdapter().list(request);
  }

  async verifyChecksum(slug: string, version: string, checksum: string) {
    const verify = await this.getAdapter().verify({ slug, version, checksum });
    if (!verify.valid) {
      throw new RegistryError(
        'CHECKSUM_MISMATCH',
        `Checksum mismatch for ${slug}@${version}: expected ${verify.expected}, got ${verify.actual}`
      );
    }
    return verify;
  }

  /**
   * Resolves the full dependency tree (exact versions, asset-only, no cycles).
   */
  async resolveDependencyTree(
    slug: string,
    version: string,
    warnings: string[] = []
  ): Promise<DependencyNode[]> {
    const ordered: DependencyNode[] = [];
    const visiting = new Set<string>();
    const visited = new Set<string>();

    const walk = async (nodeSlug: string, nodeVersion: string) => {
      const key = `${nodeSlug}@${nodeVersion}`;
      if (visited.has(key)) return;
      if (visiting.has(key)) {
        throw new RegistryError('CIRCULAR_DEPENDENCY', `Circular dependency detected at ${key}`);
      }
      visiting.add(key);

      const resolved = await this.getAdapter().resolve({ slug: nodeSlug, version: nodeVersion });
      if (resolved.record.deprecated) {
        const d = resolved.record.deprecated;
        warnings.push(
          `Dependency ${nodeSlug}@${nodeVersion} is deprecated: ${d.reason}${
            d.successor ? ` (successor: ${d.successor})` : ''
          }`
        );
      }

      for (const dep of resolved.record.dependencies) {
        try {
          await this.getAdapter().resolve({ slug: dep.slug, version: dep.version });
        } catch (err) {
          if (err instanceof RegistryError && err.code === 'NOT_FOUND') {
            warnings.push(`Missing dependency ${dep.slug}@${dep.version} required by ${nodeSlug}`);
            continue;
          }
          throw err;
        }
        await walk(dep.slug, dep.version);
      }

      visiting.delete(key);
      visited.add(key);
      ordered.push({ slug: nodeSlug, version: nodeVersion });
    };

    await walk(slug, version);
    return ordered;
  }

  collectInstallWarnings(record: RegistryVersionRecord): string[] {
    const warnings: string[] = [];
    if (record.deprecated) {
      const d = record.deprecated;
      warnings.push(
        `WARNING: ${record.slug}@${record.version} is deprecated — ${d.reason}${
          d.successor ? `. Successor: ${d.successor}` : ''
        }`
      );
    }
    if (!record.trust.verified) {
      warnings.push(
        `Note: ${record.slug}@${record.version} is not verified by a human reviewer.`
      );
    }
    return warnings;
  }

  async installFromRegistry(
    slug: string,
    version: string,
    scope: Scope,
    options?: { localName?: string }
  ): Promise<RegistryInstallResult> {
    const warnings: string[] = [];
    const tree = await this.resolveDependencyTree(slug, version, warnings);

    for (const node of tree) {
      const resolved = await this.getAdapter().resolve({ slug: node.slug, version: node.version });
      await this.verifyChecksum(
        node.slug,
        node.version,
        resolved.record.integrity.checksum
      );
      warnings.push(...this.collectInstallWarnings(resolved.record));

      if (resolved.content.kind !== 'filesystem') {
        throw new RegistryError('ADAPTER_UNAVAILABLE', 'Install requires filesystem content');
      }

      const localName = options?.localName ?? localNameFromSlug(node.slug);
      const deprecated: DeprecatedMetadata | null = resolved.record.deprecated
        ? {
            at: resolved.record.deprecated.at,
            reason: resolved.record.deprecated.reason,
            replacement: resolved.record.deprecated.successor,
          }
        : null;

      await assetService.install(
        localName,
        resolved.record.type,
        scope,
        resolved.content.path,
        `registry:${node.slug}@${node.version}`,
        {
          id: resolved.record.id,
          slug: resolved.record.slug,
          version: resolved.record.version,
          description: resolved.record.description,
          tags: resolved.record.tags,
          author: resolved.record.author,
          visibility: resolved.record.visibility,
          dependencies: resolved.record.dependencies.map((d) => ({
            type: 'asset' as const,
            slug: d.slug,
            versionRange: d.version,
            optional: false,
          })),
          trust: {
            verified: resolved.record.trust.verified,
            downloads: resolved.record.trust.downloads,
            rating: resolved.record.trust.rating,
            publisher: resolved.record.trust.publisher,
          },
          deprecated,
        }
      );
    }

    const root = tree[tree.length - 1] ?? { slug, version };
    return {
      slug: root.slug,
      version: root.version,
      localName: options?.localName ?? localNameFromSlug(root.slug),
      warnings,
    };
  }

  parseInstallReference(name: string): { slug: string; version: string } | null {
    return parseRegistryReference(name);
  }

  newPublishId(): string {
    return randomUUID();
  }
}

export const registryService = new RegistryService();

export function isRegistryInstallReference(name: string): boolean {
  return parseRegistryReference(name) !== null;
}
