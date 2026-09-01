/** Default public slug for a local asset name (V1 local/bundled convention). */
export function defaultSlugForName(localName: string, namespace = 'aman'): string {
  const privateNamespace = namespace.toLowerCase().endsWith('~private');
  const namespaceBase = privateNamespace ? namespace.slice(0, -'~private'.length) : namespace;
  const normalizedNamespace = normalizeSlugSegment(namespaceBase, 'aman');
  const normalizedName = normalizeSlugSegment(localName, 'asset');
  return `@${normalizedNamespace}${privateNamespace ? '~private' : ''}/${normalizedName}`;
}

function normalizeSlugSegment(value: string, fallback: string): string {
  const normalized = value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

/** Extract local name segment from a slug (`@aman/react-best-practices` → `react-best-practices`). */
export function localNameFromSlug(slug: string): string {
  const slash = slug.lastIndexOf('/');
  return slash >= 0 ? slug.slice(slash + 1) : slug;
}

/** Basic slug format validation for V1. */
export function isValidSlug(slug: string): boolean {
  return /^@[a-z0-9][a-z0-9-]*(?:~private)?\/[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
}
