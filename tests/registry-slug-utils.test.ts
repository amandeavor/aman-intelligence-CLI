import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RegistryError } from '../src/registry/errors.js';
import { defaultSlugForName, isValidSlug } from '../src/utils/slug.js';
import {
  namespaceFromSlug,
  normalizeRegistrySlug,
  parseRegistryReference,
  slugIndexFilePath,
} from '../src/registry/slug-utils.js';

describe('registry references', () => {
  it('normalizes human-readable names into valid public and private slugs', () => {
    expect(defaultSlugForName(' Review Helper ')).toBe('@aman/review-helper');
    expect(defaultSlugForName('Café Tools', 'Aman Intelligence')).toBe(
      '@aman-intelligence/cafe-tools',
    );
    expect(defaultSlugForName('MCP Server', 'Team Name~private')).toBe(
      '@team-name~private/mcp-server',
    );
    expect(isValidSlug(defaultSlugForName('Review Helper'))).toBe(true);
  });

  it('parses scoped exact-version references', () => {
    expect(parseRegistryReference('@acme/code-review@1.2.3')).toEqual({
      slug: '@acme/code-review',
      version: '1.2.3',
    });
    expect(parseRegistryReference('@acme~private/code-review@1.2.3-beta.1')).toEqual({
      slug: '@acme~private/code-review',
      version: '1.2.3-beta.1',
    });
  });

  it.each([
    '@acme/code-review',
    'acme/code-review@1.2.3',
    '@acme/code_review@1.2.3',
    '@acme/code-review@latest',
  ])('rejects invalid reference %s', (reference) => {
    expect(parseRegistryReference(reference)).toBeNull();
  });

  it('qualifies an unscoped slug and builds its index path', () => {
    const slug = normalizeRegistrySlug('@acme', 'code-review');
    expect(slug).toBe('@acme/code-review');
    expect(namespaceFromSlug(slug)).toBe('acme');
    expect(slugIndexFilePath('/registry', slug)).toBe(
      path.join('/registry', 'slug-index', 'acme', 'code-review.json'),
    );
  });

  it('requires a namespace for unqualified slugs', () => {
    expect(() => normalizeRegistrySlug(undefined, 'code-review')).toThrowError(RegistryError);
  });
});
