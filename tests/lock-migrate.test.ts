import { describe, expect, it } from 'vitest';
import {
  emptyLockfile,
  isLegacyLockfile,
  normalizeLockfile,
  parseLockSource,
} from '../src/utils/lock-migrate.js';

describe('lockfile migration', () => {
  it.each([
    ['registry:@acme/review@1.0.0', 'registry'],
    ['github:acme/review', 'github'],
    ['pack:starter', 'pack'],
    ['import:cursor', 'import'],
    ['bundled', 'local'],
    ['handwritten', 'manual'],
  ] as const)('classifies %s as %s', (source, kind) => {
    expect(parseLockSource(source).kind).toBe(kind);
  });

  it('creates an empty lockfile for missing input', () => {
    const lockfile = normalizeLockfile(undefined, 'local');
    expect(lockfile).toMatchObject({ schemaVersion: 1, scope: 'local', assets: [] });
    expect(lockfile.generatedAt).toEqual(expect.any(String));
  });

  it('migrates legacy entries without losing their source or install time', () => {
    const installedAt = '2026-01-02T03:04:05.000Z';
    const raw = {
      version: 1,
      skills: [{ name: 'Review Helper', type: 'skill' as const, source: 'github:acme/review', installedAt }],
    };

    expect(isLegacyLockfile(raw)).toBe(true);
    const lockfile = normalizeLockfile(raw, 'global');

    expect(lockfile.assets).toHaveLength(1);
    expect(lockfile.assets[0]).toMatchObject({
      slug: '@aman/review-helper',
      localName: 'Review Helper',
      type: 'skill',
      version: '1.0.0',
      source: { kind: 'github', ref: 'github:acme/review' },
      scope: 'global',
      installedAt,
      dependencies: [],
      requiresLocalConfig: false,
    });
  });

  it('filters malformed current entries and fills optional fields', () => {
    const raw = {
      schemaVersion: 1,
      scope: 'local' as const,
      generatedAt: '2026-01-01T00:00:00.000Z',
      assets: [
        {
          id: 'asset-1',
          slug: '@local/server',
          type: 'mcp' as const,
          localName: 'server',
          version: '1.0.0',
          integrity: { algorithm: 'sha256' as const, checksum: 'sha256:test' },
          source: { kind: 'local' as const, ref: 'local:bundled' },
          scope: 'local' as const,
          installedAt: '2026-01-01T00:00:00.000Z',
        },
        { type: 'skill', version: '1.0.0' },
      ],
    };

    const lockfile = normalizeLockfile(raw, 'local');
    expect(lockfile.assets).toHaveLength(1);
    expect(lockfile.assets[0]).toMatchObject({
      localName: 'server',
      dependencies: [],
      requiresLocalConfig: true,
    });
  });

  it('returns an isolated empty lockfile value', () => {
    const first = emptyLockfile('local');
    const second = emptyLockfile('local');
    first.assets.push({} as never);
    expect(second.assets).toEqual([]);
  });
});
