# Aman Lockfile Specification — V1

**Status:** Frozen (Phase 1 Foundation)  
**Schema version:** `1`  
**Filename:** `aman.lock`  
**Last updated:** 2026-05-30

The lockfile is the **machine-controlled, system-owned** record of exactly which asset versions are installed in an environment scope. Users MUST NOT treat `aman.lock` as configuration; use `aman.json` for preferences.

---

## 1. Principles

| Principle | Requirement |
|-----------|-------------|
| System-controlled | Written and updated only by the Aman CLI |
| Reproducibility | Exact versions, checksums, and sources for every installed asset |
| Scope-bound | One lockfile per scope root (project `.aman/` or global environment root) |
| Complements metadata | Lockfile is authoritative for *installed set*; per-asset `metadata.json` is authoritative for *asset fields* |
| Local wins | If lockfile and disk disagree, disk content wins; CLI SHOULD reconcile lockfile on next command |
| No install-time execution | Updating the lockfile MUST NOT trigger scripts |

---

## 2. File Location

| Scope | Path |
|-------|------|
| `project` | `{project}/.aman/aman.lock` |
| `global` | `{active-environment-root}/aman.lock` |

There is exactly one lockfile per scope root. Global and project scopes are independent.

---

## 3. Top-Level Schema

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-05-30T12:22:11.601Z",
  "scope": "project",
  "assets": []
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `schemaVersion` | `integer` | yes | MUST be `1` for this spec |
| `generatedAt` | `string` (ISO 8601) | yes | Timestamp of last lockfile write |
| `scope` | `"global" \| "project"` | yes | Scope this lockfile governs |
| `assets` | `LockAssetEntry[]` | yes | Installed assets (MAY be empty) |

---

## 4. Lock Asset Entry

Each entry describes one installed asset at an exact version.

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "slug": "@aman/react-best-practices",
  "type": "skill",
  "localName": "react-best-practices",
  "version": "1.2.0",
  "integrity": {
    "algorithm": "sha256",
    "checksum": "sha256:abc123…"
  },
  "source": {
    "kind": "registry",
    "ref": "registry:@aman/react-best-practices@1.2.0"
  },
  "scope": "project",
  "installedAt": "2026-05-30T12:22:11.601Z",
  "dependencies": [],
  "requiresLocalConfig": false
}
```

### 4.1 Field definitions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID string | yes | Stable asset identity |
| `slug` | string | yes | Public slug at install time |
| `type` | `"skill" \| "prompt" \| "mcp"` | yes | Asset type |
| `localName` | string | yes | On-disk directory/file stem |
| `version` | string | yes | Exact installed semver (not a range) |
| `integrity.algorithm` | `"sha256"` | yes | Checksum algorithm |
| `integrity.checksum` | string | yes | Must match asset metadata and content |
| `source` | `LockSource` | yes | Provenance (Section 5) |
| `scope` | `"global" \| "project"` | yes | Redundant with top-level; MUST match |
| `installedAt` | ISO 8601 | yes | Last install/update of this entry |
| `dependencies` | `AssetDependency[]` | yes | Resolved dependency snapshot (MAY be `[]`) |
| `requiresLocalConfig` | `boolean` | yes | If `true`, MCP needs `mcp.local.json` (MCP type only; MUST be `false` for skill/prompt) |

### 4.2 Uniqueness

- Entries MUST be unique by `(type, localName)` within a lockfile
- The same `slug@version` MAY appear once per scope (different `localName` only on intentional fork/rename)

---

## 5. Source Provenance (`source`)

```typescript
type LockSourceKind =
  | "registry"      // Canonical registry resolution
  | "github"        // GitHub repo/path as publish source
  | "local"         // Local path or bundled ship-with-cli
  | "pack"          // Installed via pack archive
  | "import"        // Repository import/classification
  | "manual";       // Explicit local copy without remote ref

interface LockSource {
  kind: LockSourceKind;
  ref: string;       // Kind-specific reference (see below)
}
```

### 5.1 Reference formats

| `kind` | `ref` format | Example |
|--------|--------------|---------|
| `registry` | `registry:{slug}@{version}` | `registry:@aman/react-best-practices@1.2.0` |
| `github` | `github:{owner}/{repo}@{ref}#{path}` | `github:acme/skills@main#skills/react` |
| `local` | `local:{path}` | `local:bundled/skills/caveman` |
| `pack` | `pack:{packSlug}@{packVersion}` | `pack:@aman/frontend-kit@2.0.0` |
| `import` | `import:{origin}` | `import:user/dotfiles` |
| `manual` | `manual:{note}` | `manual:copied-from-template` |

**Note:** GitHub references record publish provenance; the registry (when used) remains canonical after publish.

---

## 6. Relationship to `aman.json`

| File | Owner | Purpose |
|------|-------|---------|
| `aman.json` | User | Theme, default scope, marketplace list, storage backend preference, animation mode |
| `aman.lock` | System | Exact installed asset graph |

The lockfile MUST NOT store user UI preferences. `aman.json` MUST NOT store installed version pins (use lockfile).

---

## 7. Write Semantics

The CLI MUST update `aman.lock` when:

- An asset is installed, upgraded, or removed
- A pack install mutates the asset set
- A doctor/reconcile command detects drift and repairs entries
- Import materializes new assets

On every write:

1. Set `generatedAt` to current UTC timestamp
2. Recompute or verify `integrity.checksum` from disk
3. Preserve exact `version` strings (never rewrite to ranges)

---

## 8. Read Semantics & Drift

### 8.1 Local working copy wins

If `metadata.json` or content files were edited locally:

- Checksum mismatch → CLI warns; local content is not auto-reverted
- Lockfile SHOULD be updated only on explicit install/reconcile, not on silent overwrite

### 8.2 Missing assets

If lockfile lists an asset that is absent on disk:

- `aman doctor` MUST report `fail` or `warn`
- Repair: reinstall from `source` or remove lock entry

### 8.3 Legacy format migration

Lockfiles using the deprecated shape (top-level `skills` / `prompts` / `mcps` arrays with `version: 1`) MUST be migrated on read to the unified `assets[]` schema. See Section 10.

---

## 9. Dependencies in Lockfile

`dependencies` on each entry is a **resolved snapshot** at install time:

```json
{
  "dependencies": [
    {
      "type": "asset",
      "slug": "@aman/base-prompt-kit",
      "versionRange": "^1.0.0",
      "resolvedVersion": "1.4.2",
      "optional": false
    }
  ]
}
```

| Field | Description |
|-------|-------------|
| `resolvedVersion` | Exact version installed or verified for that dependency |

V1 MAY leave `dependencies` empty until dependency resolution is implemented; field MUST still be present as `[]`.

---

## 10. Legacy Format (Deprecated)

Pre-foundation lockfiles used:

```json
{
  "version": 1,
  "skills": [{ "name": "…", "type": "skill", "source": "…", "installedAt": "…" }],
  "prompts": [],
  "mcps": []
}
```

Migration rules:

| Legacy field | Maps to |
|--------------|---------|
| `version` | `schemaVersion` |
| `entry.name` | `localName` |
| `entry.source` (string) | `source.ref` with inferred `kind` |
| missing `id` | Generate new UUID on migration |
| missing `slug` | Derive `@aman/{localName}` |
| missing `integrity` | Compute from disk on next install/doctor |

After migration, legacy keys MUST NOT be written back.

### 10.1 On-disk layout migration (flat → directory)

Pre-canonical installations stored prompts and MCPs as flat files:

| Type | Legacy (flat) | Canonical (directory) |
|------|---------------|------------------------|
| Prompt | `prompts/{name}.md` + `prompts/{name}.md.metadata.json` | `prompts/{name}/PROMPT.md` + `prompts/{name}/metadata.json` |
| MCP | `mcps/{name}.json` + sidecars | `mcps/{name}/mcp.json` + `mcps/{name}/metadata.json` (+ optional `mcp.local.json`) |

On `aman.lock` read or write (and before doctor checks), the CLI MUST:

1. Detect flat layout per asset
2. Move content into `{localName}/` directories without mutating file bytes
3. Rewrite `metadata.json` in the directory (from flat sidecar if present)
4. Recompute `integrity.checksum` from moved content (MUST match prior checksum if metadata was valid)
5. Delete flat files after successful migration

Lockfile entries (`localName`, `version`, `source`, `integrity`) MUST be preserved; only on-disk paths change.

---

## 11. Related Documents

- [AMAN-ASSET-SPEC-V1.md](./AMAN-ASSET-SPEC-V1.md)
- [AMAN-REGISTRY-SPEC-V1.md](./AMAN-REGISTRY-SPEC-V1.md)
- [AMAN-PACK-SPEC-V1.md](./AMAN-PACK-SPEC-V1.md)
