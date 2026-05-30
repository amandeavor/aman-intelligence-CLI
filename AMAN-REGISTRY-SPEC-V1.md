# Aman Registry Specification — V1

**Status:** Frozen (Phase 3 — Registry Layer)  
**Schema version:** `1`  
**Adapter contract:** `src/registry/adapter.interface.ts`  
**Last updated:** 2026-05-30

The **Aman Registry** is the canonical source of truth for **published** asset versions. GitHub repositories, local folders, and third-party marketplace indexes are **publishing sources** or **discovery adapters** — not replacements for the registry after publish.

---

## 1. Non-Negotiable Principles

| Principle | Requirement |
|-----------|-------------|
| Registry is canonical | Published `(id, version)` records are authoritative |
| GitHub ≠ source of truth | GitHub MAY mirror or bootstrap; registry records win at install |
| Immutability | Published content MUST NOT change for a given `(id, version)` |
| Forever retention | Published versions MUST NOT be deleted |
| Deprecation allowed | Versions MAY be marked deprecated with reason and optional successor |
| Public and private scopes | `visibility: "public" \| "org" \| "private"` in schema from day one |
| SHA-256 required | Every published version MUST include `integrity.checksum` |
| Signatures in schema | `integrity.signature` MUST exist; `null` in V1 |
| No install-time execution | Registry serves metadata and content only |
| Asset-only dependencies | Exact versions in V1; no pack-to-pack recursion |

---

## 2. Identity Model

Every published asset has two identifiers:

| Identifier | Form | Stability |
|------------|------|-----------|
| **Internal ID** | UUID v4 | Immutable forever |
| **Public slug** | `@scope/name` | MAY change (rename, transfer); old slugs remain resolvable |

### 2.1 Resolution rules

1. **Primary:** `resolve(scope?, slug, version)` — full slug `@aman/react-best-practices` or unqualified `react-best-practices` with `scope: "aman"`.
2. **By ID:** `resolveById(id, version)` — for lockfiles and automation.
3. **Slug index** maps slug → `id`. **Asset index** (`asset.json`) holds `aliases` and canonical slug.

### 2.2 Collision and rename cases

| Case | Behavior |
|------|----------|
| Same slug, different publisher | Namespaces are distinct (`@aman/foo` vs `@acme/foo`). Slug index is per-namespace path. |
| Same slug, different org scope | `@acme/foo` vs `@acme~private/foo` are different index entries. |
| Fork | New UUID; new slug or namespace; no overwrite of forked asset’s versions. |
| Rename | New slug index entry; old slug listed in `redirectFrom` on canonical entry; `resolve` on old slug succeeds with deprecation-style notice in client warnings. |

The **lockfile** MUST store both `id` and `slug` (see [AMAN-LOCKFILE-SPEC-V1.md](./AMAN-LOCKFILE-SPEC-V1.md)).

---

## 3. Integrity Model

```json
{
  "integrity": {
    "algorithm": "sha256",
    "checksum": "sha256:<64-hex-lowercase>",
    "signature": null
  }
}
```

| Rule | Detail |
|------|--------|
| Coverage | Checksum covers the **canonical content file** bytes (including frontmatter): `SKILL.md`, `PROMPT.md`, or `mcp.json` per [AMAN-ASSET-SPEC-V1.md](./AMAN-ASSET-SPEC-V1.md). |
| Publish | Publisher supplies content; registry **recomputes** checksum and **rejects** publish if submitted checksum ≠ content. |
| Install | CLI calls `verify`; install **fails** on mismatch with `CHECKSUM_MISMATCH`. |

---

## 4. Immutability Model

Once version `V` is published for asset `id`:

- Content at `assets/{id}/versions/{V}/content/` MUST NOT change.
- Re-publishing `(id, V)` with different bytes → **`VERSION_EXISTS` / 409**.
- Publisher MAY publish `V+1`, MAY `deprecate` `V`, MUST NOT delete `V`.

---

## 5. Deprecation Model

```json
{
  "deprecated": {
    "at": "2026-06-01T00:00:00.000Z",
    "reason": "Security issue fixed in v1.0.1",
    "successor": "@aman/react-best-practices@1.0.1"
  },
  "trust": {
    "deprecated": true
  }
}
```

| Rule | Detail |
|------|--------|
| Install | Exact version remains installable; CLI prints **warning**, does not block. |
| Search | Deprecated hits included when `includeDeprecated: true`; SHOULD rank lower in future server. |
| Dependencies | Missing or deprecated dependencies → **warn** before install; checksum failure → **block**. |

---

## 6. Ownership and Scope Model

| Pattern | Visibility | Example |
|---------|------------|---------|
| `@aman/{name}` | `public` | `@aman/caveman` |
| `@org/{name}` | `org` or `public` | `@acme/review-prompt` |
| `@org~private/{name}` | `private` | `@acme~private/compliance-mcp` |

Scopes are **reserved and owned**. Two publishers MUST NOT publish to the same slug without authorization.

**V1 local adapter:** treats all records as readable (no ACL). **Interface** accepts `RegistryAccessContext.authToken` for future private resolution.

---

## 7. Trust Signal Model

```json
{
  "trust": {
    "verified": false,
    "downloads": 0,
    "rating": null,
    "publisher": "@aman",
    "deprecated": false
  }
}
```

| Field | V1 surfacing |
|-------|----------------|
| `verified` | MAY show; not a quality score |
| `downloads` | MAY show; count signal only |
| `rating` | Schema only; do not surface as quality in V1 |
| `publisher` | Metadata / search |
| `deprecated` | Warnings and search labeling |

---

## 8. Dependency Resolution

```json
{
  "dependencies": [
    { "slug": "@aman/github-mcp", "version": "1.0.0" }
  ]
}
```

| Rule | V1 |
|------|-----|
| Target | Asset-to-asset only |
| Versions | Exact semver strings only — no ranges, no wildcards |
| Graph | Registry (or CLI) resolves full tree **before** install |
| Cycles | Rejected with `CIRCULAR_DEPENDENCY` |
| Missing dep | Warn; optional continue per CLI policy |
| Bad checksum on dep | Block install |

---

## 9. On-Disk Layout (Filesystem Adapters)

Root: `~/.aman/registry/` (local) or `{repo-clone}/registry/` (GitHub mirror).

```text
registry/
  slug-index/{namespace}/{name}.json    # RegistrySlugIndexEntry
  assets/{uuid}/
    asset.json                          # RegistryAssetIndex
    versions/{semver}/
      record.json                       # RegistryVersionRecord
      content/                          # Canonical asset directory
```

GitHub adapter uses the **same layout** so records can be re-published to a future HTTP server without transformation.

---

## 10. Adapter Interface (Locked)

TypeScript: `RegistryAdapter` in `src/registry/adapter.interface.ts`.

All backends (local filesystem, GitHub mirror, future HTTP server) implement:

| Operation | Purpose |
|-----------|---------|
| `resolve` | Metadata + content location for slug@version |
| `resolveById` | Same, keyed by UUID |
| `publish` | Immutable snapshot |
| `deprecate` | Mark deprecated without delete |
| `list` | All published versions for slug |
| `search` | Query + filters with trust signals |
| `verify` | Compare stored content to checksum |

CLI and services MUST use `registryService` / `RegistryAdapter` only — no direct registry path I/O outside adapter implementations.

---

## 11. Operation Contracts

### 11.1 `resolve`

**Request**

```json
{
  "scope": "aman",
  "slug": "@aman/react-best-practices",
  "version": "1.2.0",
  "context": { "authToken": null }
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `scope` | No | Required if `slug` is unqualified (`react-best-practices`) |
| `slug` | Yes | Full `@scope/name` or unqualified with `scope` |
| `version` | Yes | Exact published version |
| `context.authToken` | No | Future private assets |

**Response**

```json
{
  "record": { },
  "content": {
    "kind": "filesystem",
    "path": "/home/user/.aman/registry/assets/{id}/versions/1.2.0/content"
  }
}
```

HTTP future mapping: `GET /v1/assets/{slug}/versions/{version}` → same JSON; `content.kind: "http"` with signed URL.

**Errors:** `NOT_FOUND`, `VERSION_NOT_FOUND`, `UNAUTHORIZED` (future), `INVALID_SLUG`, `SCOPE_REQUIRED`

---

### 11.2 `resolveById`

**Request:** `{ "id": "uuid", "version": "1.2.0", "context": {} }`  
**Response:** Same as `resolve`.  
**Errors:** `NOT_FOUND`, `VERSION_NOT_FOUND`

---

### 11.3 `publish`

**Request**

```json
{
  "slug": "@aman/react-best-practices",
  "version": "1.2.0",
  "type": "skill",
  "contentDirectory": "/path/to/canonical/dir",
  "metadata": {
    "id": "uuid",
    "slug": "@aman/react-best-practices",
    "type": "skill",
    "name": "react-best-practices",
    "description": "...",
    "version": "1.2.0",
    "author": "Aman Intelligence",
    "tags": [],
    "visibility": "public",
    "dependencies": []
  },
  "context": {}
}
```

**Response:** `{ "record": { ...RegistryVersionRecord } }`

**Rules**

- Registry computes `integrity.checksum` from `contentDirectory`.
- If `metadata.integrity.checksum` present, MUST match or `CHECKSUM_MISMATCH`.
- If `(id, version)` exists → `VERSION_EXISTS`.

---

### 11.4 `deprecate`

**Request**

```json
{
  "slug": "@aman/react-best-practices",
  "version": "1.0.0",
  "reason": "Security issue fixed in v1.0.1",
  "successor": "@aman/react-best-practices@1.0.1"
}
```

**Response:** `{ "record": { ...updated record } }`

**Errors:** `VERSION_NOT_FOUND`, `NOT_FOUND`

---

### 11.5 `list`

**Request:** `{ "slug": "@aman/react-best-practices" }`  
**Response**

```json
{
  "slug": "@aman/react-best-practices",
  "id": "uuid",
  "versions": [ { "...record..." } ]
}
```

Versions sorted descending by semver.

---

### 11.6 `search`

**Request**

```json
{
  "query": "react",
  "filters": {
    "type": "skill",
    "namespace": "aman",
    "visibility": "public",
    "includeDeprecated": true
  }
}
```

**Response**

```json
{
  "hits": [
    {
      "slug": "@aman/react-best-practices",
      "latestVersion": "1.2.0",
      "record": { }
    }
  ],
  "total": 1
}
```

V1 CLI surfaces `verified` and `downloads` only in marketplace UI where applicable.

---

### 11.7 `verify`

**Request**

```json
{
  "slug": "@aman/react-best-practices",
  "version": "1.2.0",
  "checksum": "sha256:..."
}
```

**Response**

```json
{
  "valid": true,
  "expected": "sha256:...",
  "actual": "sha256:..."
}
```

Install path treats `valid: false` as fatal.

---

## 12. Migration Strategy

| Step | State |
|------|--------|
| 1 | CLI uses **local filesystem** adapter (`~/.aman/registry/`) |
| 2 | Optional **GitHub mirror** adapter (`registry/` in environment repo) for sync/sharing |
| 3 | **HTTP registry server** implements same `RegistryAdapter` contract |
| 4 | CLI swaps backend via config — **no changes** outside `src/registry/*` and adapter wiring |

Records published via GitHub in Phase 3 MUST be ingestible by the production server **without schema migration**. Only transport (`filesystem` vs `http` content location) changes.

---

## 13. CLI Reference (V1)

```bash
# Publish (immutable)
aman registry publish ./skills/caveman --slug @aman/caveman --version 1.0.0 --type skill

# Install with checksum verification
aman install @aman/caveman@1.0.0 --global

# Deprecate (still installable)
aman registry deprecate @aman/caveman@1.0.0 --reason "..." --successor @aman/caveman@1.0.1
```

---

## 14. V1 Non-Goals

- Production registry HTTP server
- Signature verification
- Deleting published versions
- Private ACL enforcement in local adapter
- Pack/stack registry records (schema reserved; assets only in V1 adapter)
- Install-time scripts or hooks

---

## 15. Related Documents

- [AMAN-ASSET-SPEC-V1.md](./AMAN-ASSET-SPEC-V1.md)
- [AMAN-LOCKFILE-SPEC-V1.md](./AMAN-LOCKFILE-SPEC-V1.md)
- [REGISTRY_UNRESOLVED_DECISIONS.md](./REGISTRY_UNRESOLVED_DECISIONS.md)
