# Aman Stack Specification — V1

**Status:** Frozen (Phase 1 Foundation)  
**Schema version:** `1`  
**Last updated:** 2026-05-30

A **Stack** is an active workflow environment: a named subset of installed assets (skills, prompts, MCPs) that a user or team activates for a session or project context. Stacks **compose** assets and MAY reference packs; they do not replace the lockfile.

---

## 1. Principles

| Principle | Requirement |
|-----------|-------------|
| Stacks compose assets | A stack selects from installed assets by reference |
| Stacks MAY include pack refs | For published/shareable stacks; local stacks use asset refs |
| No install-time execution | Activating a stack MUST NOT run scripts or MCP servers |
| Local stacks mutable | User workspace stacks MAY be edited freely |
| Published stacks immutable | Registry `(stackId, version)` follows immutability rules |
| Asset-only leaf deps | Stack members MUST resolve to installed assets |
| Lockfile independent | Stack membership does not replace `aman.lock` pins |

---

## 2. Stack Categories

| Category | Storage | Mutability | Identity |
|----------|---------|------------|----------|
| **Workspace stack** | `{scope}/stacks/{localName}.json` | User-editable | Local name + optional slug |
| **Published stack** | Registry record + optional pack bundle | Immutable per version | `id` + `slug` + `version` |

Both use the same JSON schema; published stacks include full identity fields.

---

## 3. Workspace Stack Schema

```json
{
  "schemaVersion": 1,
  "recordType": "stack",
  "id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
  "slug": "@local/frontend-dev",
  "name": "frontend-dev",
  "description": "Daily React + review workflow",
  "visibility": "private",
  "createdAt": "2026-05-01T10:00:00.000Z",
  "updatedAt": "2026-05-30T08:00:00.000Z",
  "members": {
    "skills": [
      { "localName": "react-best-practices", "slug": "@aman/react-best-practices", "version": "1.2.0" }
    ],
    "prompts": [
      { "localName": "pr-review", "slug": "@aman/pr-review", "version": "1.0.0" }
    ],
    "mcps": [
      { "localName": "github-mcp", "slug": "@aman/github-mcp", "version": "0.3.1" }
    ]
  },
  "packs": [],
  "deprecated": null
}
```

---

## 4. Field Definitions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `schemaVersion` | `integer` | yes | MUST be `1` |
| `recordType` | `"stack"` | yes | Discriminator |
| `id` | UUID | yes | Stable stack identity |
| `slug` | string | yes | Public slug; workspace stacks MAY use `@local/{name}` |
| `name` | string | yes | Local file stem (`{name}.json`) |
| `description` | string | no | Human summary |
| `visibility` | `"public" \| "org" \| "private"` | yes | Publication visibility |
| `createdAt` | ISO 8601 | yes | Creation timestamp |
| `updatedAt` | ISO 8601 | yes | Last modification |
| `members` | `StackMembers` | yes | Asset references (Section 5) |
| `packs` | `StackPackRef[]` | yes | Optional pack composition (Section 6) |
| `deprecated` | `DeprecatedMetadata \| null` | yes | Deprecation info |

---

## 5. Member References

```json
{
  "localName": "react-best-practices",
  "slug": "@aman/react-best-practices",
  "version": "1.2.0"
}
```

| Field | Description |
|-------|-------------|
| `localName` | MUST match an installed asset in current scope (lockfile) |
| `slug` | Public slug for display/registry alignment |
| `version` | Exact version pin; SHOULD match lockfile entry |

### 5.1 Validation

On stack activate/save:

- CLI SHOULD verify each `localName` exists for the given `type`
- Version mismatch → warn (local working copy may differ from pin)
- Missing asset → fail or prompt to install

### 5.2 Composite keys

References are unique by `(type, localName)` within a stack. Cross-type name collisions are allowed (`skill:review` vs `prompt:review`).

---

## 6. Pack Composition (Optional)

Published or shareable stacks MAY reference packs:

```json
{
  "packs": [
    {
      "slug": "@aman/frontend-kit",
      "version": "2.0.0"
    }
  ]
}
```

Rules:

- Pack refs declare intent; installing stack does NOT auto-install pack in V1 without user confirmation
- Expanding a stack with packs resolves to asset members at install/activate time
- Assets MUST NOT list stack dependencies (one-way composition)

---

## 7. Activation Semantics

**Activate** means selecting a stack as the current workflow context in the CLI/UI:

1. Load stack JSON from `{scope}/stacks/{name}.json`
2. Validate member assets exist in scope
3. Set active stack pointer in session/config (NOT in lockfile)
4. Do NOT start MCP processes
5. Do NOT mutate asset content

Active stack id MAY be stored in user config (`aman.json` experimental section) but MUST NOT alter lock pins.

---

## 8. Relationship to Packs

```text
Pack  ──bundles──▶  Assets (+ optional stack JSON)
Stack ──selects──▶  Installed assets (subset of environment)
```

| Operation | Result |
|-----------|--------|
| Install pack | Adds assets (+ maybe stack file) to environment |
| Create stack | References already-installed assets |
| Publish stack | Registry record pointing to asset slug/version pins |

---

## 9. On-Disk Location

| Scope | Path |
|-------|------|
| `project` | `{project}/.aman/stacks/{name}.json` |
| `global` | `{env-root}/stacks/{name}.json` |

---

## 10. Published Stack Records

Registry published stacks mirror workspace schema plus:

```json
{
  "version": "1.0.0",
  "publishedAt": "2026-05-15T00:00:00.000Z",
  "integrity": {
    "algorithm": "sha256",
    "checksum": "sha256:…",
    "signature": null
  },
  "trust": {
    "verified": false,
    "downloads": 0,
    "rating": null,
    "publisher": "@aman"
  }
}
```

Same immutability and forever-retention rules as assets and packs apply.

---

## 11. Legacy Format Migration

Pre-foundation stacks:

```json
{
  "name": "frontend-dev",
  "skills": ["react-best-practices"],
  "prompts": ["pr-review"],
  "mcps": ["github-mcp"],
  "createdAt": "…",
  "updatedAt": "…"
}
```

Migration:

| Legacy | Canonical |
|--------|-----------|
| `skills: string[]` | `members.skills: StackMemberRef[]` with inferred slug `@aman/{name}` |
| missing `id` | Generate UUID |
| missing `slug` | Set `@local/{name}` |
| missing `schemaVersion` | Set `1` |

---

## 12. V1 Non-Goals

- Stack activation running MCP servers
- Automatic install of missing members without user confirmation
- Stack-to-stack dependencies
- Deleting published stack versions from registry

---

## 13. Related Documents

- [AMAN-ASSET-SPEC-V1.md](./AMAN-ASSET-SPEC-V1.md)
- [AMAN-LOCKFILE-SPEC-V1.md](./AMAN-LOCKFILE-SPEC-V1.md)
- [AMAN-PACK-SPEC-V1.md](./AMAN-PACK-SPEC-V1.md)
- [AMAN-REGISTRY-SPEC-V1.md](./AMAN-REGISTRY-SPEC-V1.md)
