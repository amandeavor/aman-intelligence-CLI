# Aman Pack Specification — V1

**Status:** Frozen (Phase 1 Foundation)  
**Schema version:** `1`  
**Last updated:** 2026-05-30

A **Pack** bundles multiple assets (and optionally stack definitions) for distribution as a single installable unit. Packs depend on **assets and other packs only** through explicit manifest references — never on stacks as dependency targets for assets.

---

## 1. Principles

| Principle | Requirement |
|-----------|-------------|
| Packs bundle assets | Primary payload is skills, prompts, and MCPs |
| Asset-only leaf dependencies | Transitive deps MUST be assets (see Asset Spec) |
| Pack-to-pack deps allowed | Packs MAY depend on other packs by slug + version |
| No install-time execution | Installing a pack extracts and verifies files only |
| Published packs immutable | `(packId, version)` MUST NOT change after publish |
| Content-only V1 | Pack archive contains files + manifest; no binaries/scripts |
| SHA-256 integrity | Pack archive and member assets MUST be checksum-verified |
| Registry canonical | Published packs live in registry; `.aman-pack.zip` is transport |

---

## 2. Identity

Packs share the same identity model as assets:

| Field | Description |
|-------|-------------|
| `id` | UUID v4, stable forever |
| `slug` | Public slug, e.g. `@aman/frontend-kit` |
| `version` | SemVer, immutable once published |
| `localName` | Optional install alias (lockfile/provenance) |

---

## 3. Pack Manifest (`manifest.json`)

Canonical manifest inside pack archive root:

```json
{
  "schemaVersion": 1,
  "recordType": "pack",
  "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  "slug": "@aman/frontend-kit",
  "name": "frontend-kit",
  "description": "React skills, prompts, and MCP configs for frontend teams.",
  "version": "2.0.0",
  "author": "Aman Intelligence",
  "tags": ["frontend", "react"],
  "visibility": "public",
  "createdAt": "2026-05-01T00:00:00.000Z",
  "integrity": {
    "algorithm": "sha256",
    "checksum": "sha256:def456…",
    "signature": null
  },
  "dependencies": {
    "assets": [],
    "packs": []
  },
  "members": {
    "skills": [
      { "slug": "@aman/react-best-practices", "version": "1.2.0", "localName": "react-best-practices" }
    ],
    "prompts": [
      { "slug": "@aman/pr-review", "version": "1.0.0", "localName": "pr-review" }
    ],
    "mcps": [
      { "slug": "@aman/github-mcp", "version": "0.3.1", "localName": "github-mcp" }
    ],
    "stacks": [
      { "slug": "@aman/frontend-stack", "version": "1.0.0", "localName": "frontend-stack" }
    ]
  },
  "trust": {
    "verified": false,
    "downloads": 0,
    "rating": null,
    "publisher": "@aman"
  },
  "deprecated": null
}
```

---

## 4. Archive Layout

```text
my-pack.aman-pack.zip
├── manifest.json
├── skills/
│   └── {localName}/
│       ├── SKILL.md
│       └── metadata.json
├── prompts/
│   └── {localName}/
│       ├── PROMPT.md
│       └── metadata.json
├── mcps/
│   └── {localName}/
│       ├── mcp.json
│       └── metadata.json
└── stacks/
    └── {localName}.json
```

### 4.1 Rules

- Every bundled asset MUST include full `metadata.json` per [AMAN-ASSET-SPEC-V1.md](./AMAN-ASSET-SPEC-V1.md)
- `mcp.local.json` MUST NOT appear in published packs
- Member content checksums MUST match manifest member `version` pins
- Stacks in packs are **definitions** (JSON), not runtime environments

---

## 5. Member References

Each member entry:

```json
{
  "slug": "@aman/react-best-practices",
  "version": "1.2.0",
  "localName": "react-best-practices"
}
```

| Field | Description |
|-------|-------------|
| `slug` | Published asset slug |
| `version` | Exact semver pinned in pack (not a range) |
| `localName` | Extract path name inside pack archive |

Composite key `(type, localName)` MUST be unique within a pack.

---

## 6. Dependencies

### 6.1 Asset dependencies

```json
{
  "dependencies": {
    "assets": [
      {
        "type": "asset",
        "slug": "@aman/base-prompt-kit",
        "versionRange": "^1.0.0",
        "optional": false
      }
    ],
    "packs": [
      {
        "type": "pack",
        "slug": "@aman/core-skills",
        "versionRange": "^2.0.0",
        "optional": false
      }
    ]
  }
}
```

### 6.2 Rules

- Assets depend only on assets (Asset Spec)
- Packs MAY depend on assets and other packs
- Packs MUST NOT depend on stacks
- No cross-layer reverse deps (assets MUST NOT depend on packs)
- V1 install MAY require user confirmation before fetching transitive deps

### 6.3 Pack nesting depth (V1 cap)

- A pack MAY list **at most one level** of pack dependencies: `pack → pack`, not `pack → pack → pack`.
- Transitive pack deps MUST be flattened at publish time or rejected by validation.
- Pack creation UI and CLI MUST enforce this cap when adding pack dependencies (Phase 2+).
- Asset dependencies inside packs have no nesting cap beyond normal asset-to-asset rules.

---

## 7. Install Semantics

Installing pack `@aman/frontend-kit@2.0.0` into scope `project`:

1. Verify pack archive `integrity.checksum`
2. Extract to temp; validate path safety (no traversal)
3. For each member asset:
   - Copy to scope root using canonical directory layout
   - Verify member `integrity.checksum`
   - Write/update `metadata.json`
   - Add/update `aman.lock` entry with `source.kind: "pack"`
4. For each bundled stack JSON:
   - Copy to `{scope}/stacks/{localName}.json`
5. Do NOT execute MCP commands or skill scripts

Lockfile `source` example:

```json
{
  "kind": "pack",
  "ref": "pack:@aman/frontend-kit@2.0.0"
}
```

---

## 8. Create Semantics (CLI)

Creating a pack from local environment:

1. User selects installed assets by `(type, localName)`
2. CLI snapshots content + metadata into archive layout
3. CLI generates pack `id` if unpublished; preserves asset `id`s in member metadata
4. Computes pack-level archive checksum → `manifest.integrity.checksum`

---

## 9. Publication

Published packs follow registry rules:

- Immutable `(id, version)`
- Forever retained
- Deprecation allowed
- Registry stores manifest + blob address

---

## 10. Legacy Compatibility

Pre-foundation pack manifests used flat lists:

```json
{
  "name": "my-pack",
  "skills": ["skill-a"],
  "prompts": ["prompt-b"],
  "mcps": [],
  "stacks": []
}
```

Migration when reading legacy packs:

- Derive slug `@aman/{name}` and new pack UUID
- Map string entries to `{ slug, version: "1.0.0", localName: name }`
- Infer member layout from legacy flat files if present in archive

---

## 11. V1 Non-Goals

- Pack install hooks
- Automatic transitive install without confirmation
- Bundled MCP server binaries
- Signature verification

---

## 12. Related Documents

- [AMAN-ASSET-SPEC-V1.md](./AMAN-ASSET-SPEC-V1.md)
- [AMAN-LOCKFILE-SPEC-V1.md](./AMAN-LOCKFILE-SPEC-V1.md)
- [AMAN-REGISTRY-SPEC-V1.md](./AMAN-REGISTRY-SPEC-V1.md)
- [AMAN-STACK-SPEC-V1.md](./AMAN-STACK-SPEC-V1.md)
