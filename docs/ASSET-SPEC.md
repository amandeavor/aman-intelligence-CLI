# Asset Specification (Publisher Guide)

This document describes the **canonical on-disk format** for Aman assets today. Normative details: [AMAN-ASSET-SPEC-V1.md](./specs/AMAN-ASSET-SPEC-V1.md).

## Asset types

| Type | Content file | Metadata |
|------|--------------|----------|
| Skill | `SKILL.md` | `metadata.json` |
| Prompt | `PROMPT.md` | `metadata.json` |
| MCP | `mcp.json` | `metadata.json` |

Optional (MCP only, never published): `mcp.local.json` for secrets.

## Directory layout

```text
skills/{localName}/
  SKILL.md
  metadata.json

prompts/{localName}/
  PROMPT.md
  metadata.json

mcps/{localName}/
  mcp.json
  metadata.json
  mcp.local.json   # optional, gitignored
```

`localName` is the folder name in the user's environment. The public **`slug`** (`@namespace/name`) lives in metadata and the lockfile.

## metadata.json (schema version 1)

Required fields for publishers:

| Field | Description |
|-------|-------------|
| `id` | UUID — stable forever |
| `slug` | `@namespace/asset-name` |
| `type` | `skill` \| `prompt` \| `mcp` |
| `name` | Display name |
| `version` | Semver string |
| `integrity.checksum` | `sha256:<hex>` over **full content file bytes** (including frontmatter) |
| `integrity.signature` | `null` in V1 |

## Integrity

Checksums are computed over the entire canonical content file:

- Skills → `SKILL.md`
- Prompts → `PROMPT.md`
- MCPs → `mcp.json`

The CLI verifies checksums on install from the registry. Mismatches fail the install.

## Dependencies

Assets may depend only on other assets:

```json
"dependencies": [
  { "type": "asset", "slug": "@aman/other-skill", "versionRange": "1.0.0", "optional": false }
]
```

No pack-to-pack recursion in V1. No install-time scripts.

## Publishing

1. Lay out a canonical directory locally.
2. Run `aman registry publish <dir> --slug @you/name --version 1.0.0 --type skill`.
3. Registry stores an **immutable** version; republishing the same version is rejected.

## What not to ship

- `mcp.local.json` (secrets)
- Install hooks or executable post-install scripts
- Binaries as asset content (V1 is content-only)
