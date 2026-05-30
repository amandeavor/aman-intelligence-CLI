# Aman Asset Specification — V1

**Status:** Frozen (Phase 1 Foundation)  
**Schema version:** `1`  
**Last updated:** 2026-05-30

This document is the canonical specification for **content assets** in Aman Intelligence V1: **Skills**, **Prompts**, and **MCPs**. Packs and Stacks are defined in companion specs but may reference only assets (or other packs/stacks per their specs).

---

## 1. Principles (Non-Negotiable)

| Principle | V1 Requirement |
|-----------|----------------|
| Asset-first architecture | Skills, Prompts, and MCPs are equal first-class assets |
| Published immutability | A published `(id, version)` pair MUST NOT change content or checksum |
| Registry is canonical | The Aman Registry is the source of truth for published assets |
| GitHub is a publish source | GitHub repos MAY publish to the registry; they are NOT the source of truth |
| Local working copy wins | On conflict, the local filesystem state overrides remote/cache |
| `aman.json` is user-controlled | User preferences and environment config only |
| `aman.lock` is system-controlled | Exact installed state; written by the CLI, not hand-edited |
| Asset-only dependencies | Dependencies MUST reference other assets by slug + version range |
| No cross-layer dependencies | Assets MUST NOT depend on packs, stacks, or runtime hosts |
| No install-time execution | Installation copies/verifies content only; no hooks or scripts run |
| Content-only assets | V1 assets are files only (no binaries, no post-install codegen) |
| SHA-256 integrity | Every asset version MUST have a content checksum |
| Signatures optional in V1 | `integrity.signature` MUST exist in schema, MUST be `null` in V1 |
| Org scopes from day one | Public and private org namespaces MUST be modeled in schema |
| Registry version retention | Published versions are retained forever; deprecation allowed, deletion forbidden |

---

## 2. Asset Types

| Type | `type` value | Canonical content file | Metadata sidecar |
|------|--------------|------------------------|------------------|
| Skill | `skill` | `SKILL.md` | `metadata.json` |
| Prompt | `prompt` | `PROMPT.md` | `metadata.json` |
| MCP | `mcp` | `mcp.json` | `metadata.json` |

**MCP local secrets (optional, never published):**

| File | Purpose |
|------|---------|
| `mcp.local.json` | Machine-local secrets/overrides; MUST NOT be published or included in packs |

All three types share the **same metadata contract** (Section 4).

---

## 3. Identity

Every asset has two identities:

### 3.1 Internal ID (`id`)

- **Format:** UUID v4 (RFC 4122), lowercase hex with hyphens  
  Example: `a1b2c3d4-e5f6-7890-abcd-ef1234567890`
- **Stability:** MUST remain constant for the lifetime of the asset, even if `slug` changes
- **Authority:** Assigned at first publish (or first local materialization if never published)
- **Uniqueness:** Globally unique within the registry namespace

### 3.2 Public slug (`slug`)

- **Format:** `@namespace/asset-name`
- **Namespace rules:**
  - `@aman/…` — Aman public curated namespace (default for community assets)
  - `@org-name/…` — Organization namespace (public org catalog)
  - `@org-name~private/…` — Reserved private org namespace (enterprise; schema reserved in V1)
- **Asset name segment:** lowercase kebab-case `[a-z0-9]+(-[a-z0-9]+)*`
- **Examples:**
  - `@aman/react-best-practices`
  - `@acme-corp/internal-review-prompt`
  - `@acme-corp~private/compliance-mcp`

### 3.3 Local install name (`localName`)

- The directory or filename stem used on disk in the user's environment
- MAY differ from the slug's asset-name segment (e.g. fork, rename, collision avoidance)
- Lockfile records both `slug` and `localName`

### 3.4 Version (`version`)

- **Format:** Semantic Versioning 2.0.0 (`MAJOR.MINOR.PATCH`, optional pre-release/build)
- Published versions are **immutable**: republishing the same version with different content is forbidden
- Unpublished local edits do not create new registry versions until explicitly published

---

## 4. Unified Metadata Contract

Every installed or published asset MUST have a `metadata.json` sidecar conforming to this contract.

### 4.1 Required fields

```json
{
  "schemaVersion": 1,
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "slug": "@aman/react-best-practices",
  "type": "skill",
  "name": "react-best-practices",
  "description": "React performance guidelines from Vercel Engineering.",
  "version": "1.2.0",
  "author": "Aman Intelligence",
  "tags": ["react", "performance", "nextjs"],
  "scope": "project",
  "visibility": "public",
  "createdAt": "2026-01-15T10:00:00.000Z",
  "updatedAt": "2026-05-30T12:00:00.000Z",
  "integrity": {
    "algorithm": "sha256",
    "checksum": "sha256:abc123…",
    "signature": null
  },
  "dependencies": [],
  "trust": {
    "verified": false,
    "downloads": 0,
    "rating": null,
    "publisher": null
  },
  "deprecated": null
}
```

### 4.2 Field definitions

| Field | Type | Description |
|-------|------|-------------|
| `schemaVersion` | `integer` | Metadata schema version; MUST be `1` for this spec |
| `id` | `string` (UUID) | Stable internal identity (Section 3.1) |
| `slug` | `string` | Public identity (Section 3.2) |
| `type` | `"skill" \| "prompt" \| "mcp"` | Asset type |
| `name` | `string` | Local display/install name (Section 3.3) |
| `description` | `string` | Human-readable summary |
| `version` | `string` | SemVer version string |
| `author` | `string` | Display author or org name |
| `tags` | `string[]` | Search/discovery tags |
| `scope` | `"global" \| "project"` | Install scope in current environment |
| `visibility` | `"public" \| "org" \| "private"` | Publication visibility (schema reserved for all values in V1) |
| `createdAt` | `string` (ISO 8601) | First materialization timestamp |
| `updatedAt` | `string` (ISO 8601) | Last metadata/content update timestamp |
| `integrity.algorithm` | `"sha256"` | Checksum algorithm; MUST be `sha256` in V1 |
| `integrity.checksum` | `string` | `sha256:` + lowercase hex digest of canonical content |
| `integrity.signature` | `string \| null` | Cryptographic signature; MUST be `null` in V1 |
| `dependencies` | `AssetDependency[]` | Asset-to-asset dependencies (Section 5) |
| `trust.verified` | `boolean` | Registry verification badge |
| `trust.downloads` | `integer` | Aggregate download count (registry-sourced) |
| `trust.rating` | `number \| null` | Aggregate rating 0–5; `null` if unavailable |
| `trust.publisher` | `string \| null` | Canonical publisher slug or org id |
| `deprecated` | `DeprecatedMetadata \| null` | Deprecation info; `null` if active |

### 4.3 Optional install-time fields (local only)

These MAY appear on installed copies but MUST NOT be required for registry publication:

| Field | Description |
|-------|-------------|
| `source` | Provenance string (e.g. `registry`, `github:user/repo`, `local`, `pack:my-pack`) |
| `installedAt` | ISO timestamp of last install/update |
| `originalName` | Source name before local rename |
| `originalSlug` | Slug at install time if slug was redirected |

### 4.4 Deprecation metadata

When an asset version is deprecated (not deleted):

```json
{
  "deprecated": {
    "at": "2026-06-01T00:00:00.000Z",
    "reason": "Superseded by @aman/react-best-practices@2.0.0",
    "replacement": "@aman/react-best-practices@^2.0.0"
  }
}
```

- `replacement` SHOULD use slug + semver range
- Deprecated versions MUST remain resolvable in the registry forever

---

## 5. Dependencies

### 5.1 Rules

- Dependencies MUST reference **assets only** (`type: "asset"`)
- MUST NOT reference packs, stacks, CLI versions, or host applications
- Resolved at install time; V1 MAY require manual user confirmation before installing transitive deps
- Cycles are forbidden in published assets (registry validation MUST reject cycles)

### 5.2 Dependency object

```json
{
  "type": "asset",
  "slug": "@aman/base-prompt-kit",
  "versionRange": "^1.0.0",
  "optional": false
}
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"asset"` | MUST be `"asset"` in V1 |
| `slug` | `string` | Target asset slug |
| `versionRange` | `string` | npm-compatible semver range |
| `optional` | `boolean` | If `true`, install proceeds if dependency unavailable |

### 5.3 Declaration vs resolution (ranges vs exact versions)

- **`versionRange`** is for **declaration only** — used in asset metadata, pack manifests, and registry publish requests to express acceptable versions (e.g. `^1.0.0`).
- **Install-time and lockfile state** always use **exact versions** — never a range.
- On install, the resolver (or user confirmation in V1) picks one exact semver; that value is written to:
  - `metadata.json` → `version`
  - `aman.lock` → `version` on the installed entry
- `aman.lock` → `dependencies[]` stores **both** the declared `versionRange` and the `resolvedVersion` exact pin (see Lockfile Spec Section 9).
- Readers of asset metadata alone MUST NOT assume `dependencies[].versionRange` is the installed pin; consult the lockfile for exact state.

---

## 6. On-Disk Layout

### 6.1 Canonical layout (target)

All asset types use a **directory per install**:

```text
{scope-root}/
  skills/
    {localName}/
      SKILL.md
      metadata.json
  prompts/
    {localName}/
      PROMPT.md
      metadata.json
  mcps/
    {localName}/
      mcp.json
      mcp.local.json    # optional, gitignored
      metadata.json
```

### 6.2 Scope roots

| Scope | Root directory |
|-------|----------------|
| `project` | `{project}/.aman/` |
| `global` | User's active Aman environment (default `~/.aman/` or GitHub-backed env clone) |

### 6.3 Content rules

- **Skills:** `SKILL.md` is the authoritative skill body (Markdown + optional YAML frontmatter)
- **Prompts:** `PROMPT.md` is the authoritative prompt body
- **MCPs:** `mcp.json` is the portable MCP server config (no secrets); secrets go in `mcp.local.json`
- **No install-time execution:** Installing MUST NOT run MCP servers, shell commands, or skill scripts

---

## 7. Integrity (SHA-256)

### 7.1 Checksum scope

| Type | Files hashed (in order, concatenated with `\n---\n` separator) |
|------|------------------------------------------------------------------|
| `skill` | `SKILL.md` |
| `prompt` | `PROMPT.md` |
| `mcp` | `mcp.json` (excluding `mcp.local.json`) |

### 7.2 Checksum format

```text
sha256:{64-char lowercase hex digest}
```

### 7.3 Verification

On install and on `aman doctor`:

1. Recompute checksum from local content files
2. Compare to `metadata.json` → `integrity.checksum`
3. Compare to `aman.lock` entry (if present)
4. Mismatch → warn or fail per CLI policy; MUST NOT silently overwrite published checksums

---

## 8. Publication & Immutability

### 8.1 Publish flow (conceptual)

```text
Local working copy → Publish request → Registry validates → Immutable version record
                              ↑
                    GitHub MAY be publish source (not SoT)
```

### 8.2 Registry record invariants

For every published `(id, version)`:

- Content blob addressable by checksum
- Metadata snapshot stored with the version
- Slug MAY redirect to new slug; `id` MUST NOT change
- Version MUST NOT be deleted; MAY be marked deprecated

### 8.3 GitHub as publish source

- A GitHub repository MAY trigger or supply content for a registry publish
- The registry record is authoritative after publish
- GitHub repo deletion MUST NOT delete registry versions
- Local clone of GitHub env is a **working copy**, not canonical state

---

## 9. Visibility & Org Scopes

| `visibility` | Meaning | V1 behavior |
|--------------|---------|-------------|
| `public` | World-readable in registry/marketplace | Supported |
| `org` | Visible to org members | Schema reserved; registry enforcement deferred |
| `private` | Visible to authorized principals only | Schema reserved; registry enforcement deferred |

Org namespace `@org~private/…` is reserved for private catalogs. Clients MUST parse and store these values even if marketplace UI hides them in V1.

---

## 10. Trust Signals

Modeled in `metadata.trust` and registry index:

| Signal | Source | V1 surfacing |
|--------|--------|--------------|
| `verified` | Registry admin/org verification | Schema only |
| `downloads` | Registry aggregate counter | Schema only |
| `rating` | User ratings aggregate | Schema only |
| `publisher` | Canonical publisher identity | Schema only |
| `deprecated` | Publisher or admin action | Schema + doctor warnings |

---

## 11. Type-Specific Notes

### 11.1 Skills

- Body: Markdown instructions in `SKILL.md`
- MAY include YAML frontmatter for editor hints

**Checksum rule (V1):** `integrity.checksum` is computed over the **complete raw bytes** of `SKILL.md`, **including any YAML frontmatter**. Frontmatter is not excluded. Editors that modify frontmatter without bumping `version` will invalidate the checksum until reconciled.

### 11.2 Prompts

- Body: Markdown or plain text in `PROMPT.md` (or legacy flat `.md` files during migration)

**Checksum rule (V1):** Same as skills — checksum is the **complete raw file bytes** of the canonical prompt content file, **including any frontmatter**.

### 11.3 MCPs

- `mcp.json`: portable config (command, args, env var **names**, transport)
- `mcp.local.json`: local env values; MUST be in `.gitignore` templates
- MCP assets are config-only in V1; the MCP server binary is NOT bundled

---

## 12. Related Documents

- [AMAN-LOCKFILE-SPEC-V1.md](./AMAN-LOCKFILE-SPEC-V1.md) — installed state
- [AMAN-REGISTRY-SPEC-V1.md](./AMAN-REGISTRY-SPEC-V1.md) — canonical published catalog
- [AMAN-PACK-SPEC-V1.md](./AMAN-PACK-SPEC-V1.md) — asset bundles
- [AMAN-STACK-SPEC-V1.md](./AMAN-STACK-SPEC-V1.md) — active environment composition

---

## 13. V1 Explicit Non-Goals

- Install hooks, lifecycle scripts, or MCP auto-start
- Binary/large-artifact assets
- Signature verification (field present, always `null`)
- Automatic transitive dependency resolution without user confirmation
- Deletion of published registry versions
