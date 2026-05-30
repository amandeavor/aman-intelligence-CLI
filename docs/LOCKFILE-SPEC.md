# Lockfile Specification (Developer Guide)

The lockfile records **exactly what is installed** in an environment scope. It is written by the CLI, not hand-edited.

Normative reference: [AMAN-LOCKFILE-SPEC-V1.md](./specs/AMAN-LOCKFILE-SPEC-V1.md).

## Location

| Scope | Path |
|-------|------|
| Project | `.aman/aman.lock` |
| Global | `~/.aman/aman.lock` (or active environment root) |

## What it guarantees

- Reproducible installs: exact `version`, `integrity.checksum`, and `source` per asset
- Both `id` and `slug` for every entry
- Dependency list and `requiresLocalConfig` for MCPs needing `mcp.local.json`

## Top-level shape

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-05-30T12:00:00.000Z",
  "scope": "global",
  "assets": []
}
```

## Entry shape (abbreviated)

```json
{
  "id": "uuid",
  "slug": "@aman/caveman",
  "type": "skill",
  "localName": "caveman",
  "version": "1.0.0",
  "integrity": { "algorithm": "sha256", "checksum": "sha256:..." },
  "source": { "kind": "registry", "ref": "registry:@aman/caveman@1.0.0" },
  "scope": "global",
  "installedAt": "...",
  "dependencies": [],
  "requiresLocalConfig": false
}
```

## Source kinds

| `kind` | Meaning |
|--------|---------|
| `registry` | Canonical registry install |
| `local` | Bundled or local path |
| `github` | GitHub provenance |
| `pack` | Installed from `.amanpack` |
| `import` | Import flow |
| `manual` | Other |

## Corrupt lockfiles

If `aman.lock` contains invalid JSON, the CLI quarantines it to `aman.lock.corrupt-<timestamp>` and starts from an empty asset list. Run `aman doctor` to confirm.

## vs aman.json

| File | Owner | Purpose |
|------|-------|---------|
| `aman.json` | User | Preferences, storage mode, paths |
| `aman.lock` | CLI | Installed asset pins |
