import path from 'path';
import { RegistryError } from './errors.js';
import { RegistryNamespace } from './types.js';
import { isValidSlug } from '../utils/slug.js';

export function parseRegistryReference(
  input: string
): { slug: string; version: string } | null {
  const trimmed = input.trim();
  const match = trimmed.match(
    /^(@[a-z0-9][a-z0-9-]*(?:~private)?\/[a-z0-9]+(?:-[a-z0-9]+)*)@(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?)$/
  );
  if (!match) return null;
  return { slug: match[1], version: match[2] };
}

export function namespaceFromSlug(slug: string): RegistryNamespace {
  const slash = slug.indexOf('/');
  if (slash < 2 || slug[0] !== '@') {
    throw new RegistryError('INVALID_SLUG', `Invalid slug: ${slug}`);
  }
  return slug.slice(1, slash);
}

export function normalizeRegistrySlug(scope: RegistryNamespace | undefined, slug: string): string {
  if (slug.startsWith('@')) {
    if (!isValidSlug(slug)) {
      throw new RegistryError('INVALID_SLUG', `Invalid slug format: ${slug}`);
    }
    return slug;
  }
  if (!scope) {
    throw new RegistryError('SCOPE_REQUIRED', `Scope required to resolve unqualified slug "${slug}"`);
  }
  const ns = scope.startsWith('@') ? scope.slice(1) : scope;
  const full = `@${ns}/${slug}`;
  if (!isValidSlug(full)) {
    throw new RegistryError('INVALID_SLUG', `Invalid slug after scope qualification: ${full}`);
  }
  return full;
}

export function slugIndexFilePath(registryRoot: string, slug: string): string {
  const ns = namespaceFromSlug(slug);
  const name = slug.slice(slug.indexOf('/') + 1);
  return path.join(registryRoot, 'slug-index', ns, `${name}.json`);
}

export function assetRootPath(registryRoot: string, id: string): string {
  return path.join(registryRoot, 'assets', id);
}

export function versionRecordPath(registryRoot: string, id: string, version: string): string {
  return path.join(assetRootPath(registryRoot, id), 'versions', version, 'record.json');
}

export function versionContentPath(registryRoot: string, id: string, version: string): string {
  return path.join(assetRootPath(registryRoot, id), 'versions', version, 'content');
}

export function assetIndexPath(registryRoot: string, id: string): string {
  return path.join(assetRootPath(registryRoot, id), 'asset.json');
}
