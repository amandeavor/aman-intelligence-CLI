# Phase 2.5 Report — Canonical Layout & MCP Local Scaffolding

**Date:** 2026-05-30  
**Scope:** Two pre–Phase 3 gaps only (no registry work, no UI changes)

---

## Summary

| Task | Status |
|------|--------|
| Task 1 — Canonical disk layout for prompts & MCPs | Complete |
| Task 2 — MCP `mcp.local.json` scaffolding & doctor checks | Complete |
| `npm run typecheck` | Pass |
| `npm run build` | Pass |

---

## Task 1 — Canonical disk layout

### What changed

**New module:** `src/storage/asset-layout.ts`

- Path helpers: `assetDir`, `contentFilePath`, `metadataFilePath`, `mcpLocalFilePath`
- Flat detection: `detectPromptLayout`, `detectMcpLayout`
- Migration: `migratePromptFlatToCanonical`, `migrateMcpFlatToCanonical`, `migrateTypeRootLayout`, `migrateScopeLayout`
- Install helper: `materializeAssetDirectory` (file or directory source → canonical dir)
- Compliance: `findLayoutViolations` for doctor
- Bundled source resolver: `resolveBundledSource` (directory or legacy flat file in ship-with-cli tree)

**Updated consumers:**

| File | Change |
|------|--------|
| `src/storage/scanner.ts` | `scanPrompts` / `scanMcps` use directory layout only (`listDirs` + `PROMPT.md` / `mcp.json`) |
| `src/services/asset.service.ts` | Install/remove/list use `{typeRoot}/{localName}/`; migrate on scope access |
| `src/services/lock.service.ts` | `migrateScopeLayout` on lock read/write |
| `src/services/doctor.service.ts` | Migrate then `findLayoutViolations`; metadata paths under asset dirs |
| `src/services/pack.service.ts` | Pack archive uses `prompts/{name}/` and `mcps/{name}/` directories; post-install migrate |
| `src/services/backup.service.ts` | Restore verifies `metadata.json` inside each asset directory |
| `src/utils/integrity.ts` | Checksum always from canonical content file inside asset directory |

**Spec:** `AMAN-LOCKFILE-SPEC-V1.md` §10.1 documents flat → directory migration alongside lockfile legacy rules.

### Layout mapping

| Before (flat) | After (canonical) |
|---------------|-------------------|
| `prompts/foo.md` | `prompts/foo/PROMPT.md` |
| `prompts/foo.md.metadata.json` | `prompts/foo/metadata.json` |
| `mcps/bar.json` | `mcps/bar/mcp.json` |
| `mcps/bar.json.metadata.json` | `mcps/bar/metadata.json` |
| `mcps/bar.local.json` (legacy root) | `mcps/bar/mcp.local.json` |

### Migration behavior

1. Triggered on: `lockService.read/write`, `assetService.install/remove/list`, `doctor` checks (via migrate before validate).
2. Content files are **copied** (bytes unchanged); checksum recomputed from canonical path — must match prior digest if metadata was already correct.
3. Flat files and flat sidecars are **deleted** after successful migration.
4. Lockfile fields (`localName`, `version`, `source`, `integrity`, `id`, `slug`) are **not** modified by layout migration alone.

### First run after update

1. User runs any command that touches the lockfile or installs assets (e.g. `aman doctor`, `aman browse`, `aman install`).
2. CLI silently migrates flat prompts/MCPs under the active scope root (and bundled `prompts/` / `mcps/` on `assetService.list`).
3. No user prompt; no metadata schema changes.

### Edge cases

| Case | Handling |
|------|----------|
| Only flat `.md` / `.json` without sidecar | Migration creates `metadata.json` via `normalizeAssetMetadata` + checksum from content |
| Existing canonical directory | `migrate*` no-ops |
| Pack archive with legacy flat `prompts/x.md` | `migrateScopeLayout(targetBase)` after pack extract |
| Import from GitHub (loose files) | `materializeAssetDirectory` accepts flat file source on install |
| Skill layout | Unchanged (already directory-based) |
| Bundled repo `prompts/` with dirs missing `PROMPT.md` | Scanner skips non-canonical dirs; pre-existing content gap, not introduced by this phase |

---

## Task 2 — MCP local config scaffolding

### New module: `src/utils/mcp-local.ts`

- `extractMcpEnvKeys` — keys in `env` / `mcpServers.*.env` with empty or placeholder values (`${VAR}`, `{{VAR}}`, `$VAR`)
- `buildMcpLocalTemplate` — `_comment` + empty string per key
- `scaffoldMcpLocalConfig` — writes `mcp.local.json` only if missing
- `mcpRequiresLocalConfig` — true when extract returns keys
- `ensureMcpLocalGitignore` — appends `mcps/**/mcp.local.json` to scope `.gitignore`
- `gitignoreIncludesMcpLocalAsync`, `countEmptyMcpLocalValues`

### Install flow (`asset.service.ts`)

1. After `mcp.json` is materialized, `ensureMcpLocalGitignore(scopeRoot)`.
2. If `mcpRequiresLocalConfig(mcp.json)`, scaffold `mcp.local.json` (never overwrite existing).
3. `lockfile.requiresLocalConfig` set from detection (false when no env keys need local values).

### Doctor checks (after migration)

| Check | Severity | Condition |
|-------|----------|-----------|
| MCP local configuration | warn | `requiresLocalConfig` and missing `mcps/{name}/mcp.local.json` |
| MCP local secrets filled | warn | Any non-`_comment` key still `""` in `mcp.local.json` |
| mcp.local.json gitignored | **fail** | Scope `.gitignore` missing `mcps/**/mcp.local.json` |

`migrateScopeLayout` also calls `ensureMcpLocalGitignore` when `mcps/` exists so existing environments get the gitignore line on first migrate/doctor pass.

### Example scaffolded `mcp.local.json`

```json
{
  "_comment": "Fill in local values for this MCP. This file is gitignored and never synced.",
  "GITHUB_TOKEN": ""
}
```

(Only keys detected from `mcp.json` with empty/placeholder values are included.)

---

## Doctor output — before vs after (representative)

### Before (pre–2.5)

- Metadata paths pointed at `prompts/{name}.md.metadata.json` and `mcps/{name}.json.metadata.json`.
- No canonical layout check.
- MCP warning: “create mcp.local.json beside each MCP config” with no scaffold and flat paths.
- No `.gitignore` enforcement for `mcp.local.json`.

### After (this build, non-TTY `aman doctor`)

```
✓ Metadata integrity: All assets have valid metadata
✓ Canonical asset layout: All assets use directory layout (SKILL.md / PROMPT.md / mcp.json)
✓ MCP local configuration: All MCPs requiring local config have mcp.local.json
✗ mcp.local.json gitignored: ... (only if scope .gitignore predates migrate and mcps/ empty)
```

After first MCP install or scope migrate with `mcps/` present, gitignore line is added and the last check becomes **pass**.

---

## Files added / touched

**Added**

- `src/storage/asset-layout.ts`
- `src/utils/mcp-local.ts`
- `PHASE_2_5_REPORT.md`

**Updated**

- `src/storage/scanner.ts`, `src/utils/integrity.ts`
- `src/services/asset.service.ts`, `lock.service.ts`, `doctor.service.ts`, `pack.service.ts`, `backup.service.ts`
- `AMAN-LOCKFILE-SPEC-V1.md` (§10.1)

---

## Verification

```bash
npm run typecheck   # pass
npm run build       # pass
```

---

## Out of scope (Phase 3+)

- Registry / marketplace
- UI or new commands
- Migrating bundled prompt dirs that lack `PROMPT.md` (content repair)
- Auto-filling `mcp.local.json` values (doctor warns only)
