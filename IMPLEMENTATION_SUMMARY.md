# Implementation Summary — Asset-First Architecture (V2)

**Date:** 2026-05-30  
**Project:** Aman Intelligence (`aman-cli`)

---

## Goal

Transform Aman from an unintentional **Skills Manager** into a true **AI workflow package manager** where **Skills**, **Prompts**, and **MCPs** are equal first-class assets across UI, commands, marketplace, packs, stacks, search, install, import, export, and sync.

---

## What Changed

### New modules

| File | Purpose |
|------|---------|
| `src/types/asset-metadata.ts` | Unified `metadata.json` schema + `createAssetMetadata()` |
| `src/ui/assetDisplay.ts` | Type labels, grouping, search helpers, confidence averaging |

### Major refactors

| Area | Change |
|------|--------|
| **Dashboard** | Asset Hub layout; menu: Browse Assets, Import Assets, Search Assets, Install Asset, My Assets; stack counts show S/P/M |
| **Browse** | Asset-type tabs (Skills / Prompts / MCPs) + My Assets / Marketplace views; type-aware search, filter, install |
| **Search** | Universal search with grouped results and `[Skill]`/`[Prompt]`/`[MCP]` badges |
| **Install** | `--type` flag; interactive wizard (type → source → name → scope) from dashboard |
| **Pack create** | Category tabs; MCPs included in pack manifest |
| **Pack inspect** | Separate Skills / Prompts / MCPs sections |
| **Import preview** | Confidence percentage before confirm |
| **Info** | Installed check across all types; type badge in UI |
| **Asset service** | Writes unified metadata on install |
| **Help / CLI flags** | Asset-first copy; `--type`, `--list`, `--json` |

### Unchanged (already asset-capable)

- `scanAll`, `Stack`, `Pack`, `Lockfile`, `backup.service`, `classificationService`, `marketplaceService.mergeResults`, dashboard stack editor add/remove

---

## Architecture Model

```
Asset (conceptual)
├── skill   → directory + SKILL.md + metadata.json
├── prompt  → {name}.md + {name}.md.metadata.json
└── mcp     → {name}.json + {name}.json.metadata.json

Workflow layers
├── Pack   → bundle of skills + prompts + mcps (+ optional stacks)
└── Stack  → active environment subset of all three types
```

---

## CLI Examples (post-V2)

```bash
# Non-interactive browse (all asset types)
aman browse --json

# Universal search
aman search react

# Install with type hint
aman install github --type mcp --global

# Import with scope (CI-safe)
aman import user/repo --project
```

---

## Deliverables

1. ✅ `ASSET_ARCHITECTURE_AUDIT.md` — pre/post analysis and remaining gaps  
2. ✅ `BRUTAL_QA_REPORT.md` — test matrix, defects, sign-off  
3. ✅ `IMPLEMENTATION_SUMMARY.md` — this document  

---

## Verification

| Check | Result |
|-------|--------|
| `npm run typecheck` | Pass |
| `npm run build` | Pass |
| `npm pack --dry-run` | Pass |
| Non-TTY: `aman`, `help`, `doctor`, `browse --json`, `search` | Pass |

---

## Known Limitations / Next Steps

1. **skills.sh** remains skills-only; add registry providers for prompts/MCPs for marketplace parity.
2. **Export** — add `--type` and `--pack` CLI flags for category-scoped export.
3. **Pack selection** — use composite keys (`type:name`) to avoid cross-type name collisions.
4. **Automated QA** — seed script + perf tests for 100–1000 assets; TTY responsive matrix in CI (optional `script` runner).
5. **Scanner** — read unified metadata sidecars for prompts/MCPs in `scanPrompts` / `scanMcps`.

---

## Files Touched (primary)

- `src/commands/dashboard.tsx`
- `src/commands/browse.tsx`
- `src/commands/search.tsx`
- `src/commands/install.tsx`
- `src/commands/pack.tsx`
- `src/commands/import.tsx`
- `src/commands/info.tsx`
- `src/commands/help.tsx`
- `src/services/asset.service.ts`
- `src/types/asset-metadata.ts`
- `src/types/index.ts`
- `src/ui/assetDisplay.ts`
- `src/ui/marketplaceDisplay.ts`
- `src/bin/aman.ts`

---

**Outcome:** Aman’s user-facing flows now speak in **assets**, not **skills**, while preserving existing on-disk layouts and lockfile structure. Public launch should include a manual TTY QA pass and seeded prompt/MCP fixtures to validate all three tabs end-to-end.
