# Asset Architecture Audit — Aman Intelligence V2

**Date:** 2026-05-30  
**Scope:** Full codebase audit for skill-centric assumptions vs. asset-first target (Skills + Prompts + MCPs as equal first-class entities)

---

## Executive Summary

Aman had substantial backend support for prompts and MCPs (`scanAll`, `Pack`, `Stack`, `Lockfile`, `classificationService`) but the **interactive UX and several command entry points were skill-biased**. This audit documents pre-refactor issues and the asset-first corrections applied in V2.

---

## 1. Dashboard

| Issue | Current Behavior (Pre-V2) | Desired Asset-First Behavior | Implementation |
|-------|---------------------------|------------------------------|----------------|
| Hub framing | "Navigation Hub" with skill-focused copy | **Asset Hub** with equal Skills/Prompts/MCPs/Stacks counts | Renamed sections; added Assets header block with repo line |
| Discover menu | "My Skills", "Browse Marketplace", skill-only import copy | **Browse Assets**, **Import Assets**, **Search Assets**, **Install Asset** | Menu items rewritten |
| Manage menu | Packs/stacks described as skill bundles | Packs/stacks as **workflow bundles/environments** for all asset types | Descriptions updated |
| My Assets | Separate "My Skills" screen → browse tab 0 | **My Assets** → browse with `initialView=installed` | Routed to unified browse |
| Stack activation labels | `(N skills)` only | `(Ns Np Nm)` category counts | Stack list labels show all three |
| Non-TTY profile | "Environment Profile" | **Asset Hub** profile with Assets subsection | `dashboardCommand` text updated |

**Residual:** Arrow-key column navigation still assumes a fixed left-column count; works but should be recalculated if menu order changes.

---

## 2. Browse

| Issue | Current Behavior | Desired | Implementation |
|-------|------------------|---------|----------------|
| Tabs | `My Skills` \| `Marketplace` | **Skills \| Prompts \| MCPs** + My Assets/Marketplace view | `browse.tsx` rewritten |
| Marketplace search | Hardcoded `marketplaceService.search(q, 'skill')` | Search by **active asset type** | `activeAssetType` passed to provider |
| Install | Always `type: 'skill'` | Install **active asset type** | `installSelected` uses `activeAssetType` |
| Placeholders / empty states | "skills" wording | Type-aware copy | `ASSET_TYPE_PLURAL` helpers |
| CLI `--list` / `--json` | Skills only | All three types | Per-type loops in `browseCommand` |

---

## 3. Search

| Issue | Current Behavior | Desired | Implementation |
|-------|------------------|---------|----------------|
| Title | "Search Skills & Prompts" | Universal **Search Assets** | UI copy updated |
| Installed check | `assetService.list('skill')` only | Check per result **type** | Per-type installed sets |
| Results display | Flat list, no type prefix | `[Skill]` / `[Prompt]` / `[MCP]` grouped | `groupResultsByType` + section headers |
| Non-TTY | Flat skill-oriented output | Grouped by asset type | `searchCommand` fallback updated |
| Tag search | Name/description via Fuse in providers | Name, description, **tags** | Client-side tag match in `performSearch` |

---

## 4. Marketplace / Providers

| Issue | Current Behavior | Desired | Implementation |
|-------|------------------|---------|----------------|
| `MarketplaceService.search` | Already accepts `type?` | Asset-first `search(type)` / `fetch(type)` | **No change needed** — already correct |
| `skills-sh` provider | Skills only (by design) | Skills from skills.sh; prompts/MCPs from local/bundled | Documented limitation |
| `local` provider | All types when no filter | Same | Already iterates `skill \| prompt \| mcp` |
| Merge key | `type:name` | Same | Already type-aware |

**Recommendation (future):** Add `prompts-sh` / MCP registry providers mirroring `skills-sh.provider.ts`.

---

## 5. Install

| Issue | Current Behavior | Desired | Implementation |
|-------|------------------|---------|----------------|
| CLI with name | Lookup any type via `findInstallCandidate` | Same + `--type` flag | `--type skill\|prompt\|mcp` in `aman.ts` |
| CLI without name | Usage text only | **Install wizard** (type → source → name → scope) | `InstallWizardApp` + dashboard route |
| Success message | Generic | Type-aware | Uses `ASSET_TYPE_PLURAL` |

---

## 6. Packs

| Issue | Current Behavior | Desired | Implementation |
|-------|------------------|---------|----------------|
| Pack create selector | Skills + prompts only; MCPs forced `[]` | Select **skills, prompts, MCPs** | Category tabs in `PackCreateApp` |
| Pack inspect | Skills list only under "Contents" | Separate **Skills / Prompts / MCPs** sections | `PackInspectApp` updated |
| Pack install | Already installs all types via `packService` | Same | Verified — service was already asset-aware |

---

## 7. Stacks

| Issue | Current Behavior | Desired | Implementation |
|-------|------------------|---------|----------------|
| Stack editor (dashboard list) | Add/remove skill/prompt/mcp | Same | **Already implemented** in `stacks_list` |
| Stack activate label | Skills count only | All category counts | Dashboard activate select updated |
| `stack.tsx` create | Verify mixed assets | Same | Existing `StackCreateApp` uses `scanAll` |

---

## 8. Import

| Issue | Current Behavior | Desired | Implementation |
|-------|------------------|---------|----------------|
| Classification | Skills, prompts, MCPs, stacks | Same | Already via `classificationService` |
| Preview UI | Counts only | **Confidence %** before confirm | `averageConfidence()` in preview |
| Install loop | All three asset types | Same | Already handles `skill \| prompt \| mcp` |

---

## 9. Export

| Issue | Current Behavior | Desired | Implementation |
|-------|------------------|---------|----------------|
| Single asset export | Filters all three types by name | Same | Already searches skills, prompts, mcps |
| Full export | `scanAll` → pack | Same | Already includes all categories |
| Category-only export | Not exposed in CLI | Export by category | **Future:** `aman export --type prompt` |

---

## 10. Sync / Backup

| Issue | Current Behavior | Desired | Implementation |
|-------|------------------|---------|----------------|
| Git sync | Syncs environment directory | Skills, prompts, MCPs, stacks, metadata | **Directory-level git** — all folders included if present |
| Backup service | `skills[]`, `prompts[]`, `mcps[]`, `stacks[]` | Same | `backup.service.ts` already asset-complete |
| Doctor metadata check | All asset types | Same | `doctor.service.ts` validates all |

---

## 11. Metadata

| Issue | Current Behavior | Desired | Implementation |
|-------|------------------|---------|----------------|
| Schema | Ad-hoc per install | Unified `metadata.json` fields | `src/types/asset-metadata.ts` + `createAssetMetadata()` |
| Fields | Partial | `type`, `name`, `description`, `tags`, `version`, `author`, `source`, `createdAt`, `updatedAt` | Written on every install |
| Prompt/MCP metadata | Sidecar `.metadata.json` | Same schema | `asset.service.ts` uses unified helper |

**Gap:** Scanner still reads legacy skill `metadata.json` shape for prompts/MCPs; recommend extending `scanPrompts` / `scanMcps` to merge unified metadata files.

---

## 12. Info Command

| Issue | Current Behavior | Desired | Implementation |
|-------|------------------|---------|----------------|
| Installed check | Global skills only | Per-type, global + project | **Fixed** in `info.tsx` |
| Display | Name only | `[Type] Name` | `assetTypeBadge` in detail view |

---

## 13. Help & Branding

| Issue | Current Behavior | Desired | Implementation |
|-------|------------------|---------|----------------|
| Command descriptions | "Browse marketplace content", skill-centric install | Asset-first descriptions | `help.tsx` updated |
| Package description | Already mentions all types | Same | `package.json` OK |

---

## Priority Matrix (Remaining Work)

| Priority | Item | Effort |
|----------|------|--------|
| P1 | Dedicated MCP/prompt marketplace providers | Medium |
| P2 | `aman export --type` / `--pack` flags | Low |
| P3 | Scanner reads unified metadata for prompts/MCPs | Low |
| P4 | Stress-test harness in CI (100–1000 assets) | Medium |
| P5 | Responsive TTY matrix automated (60×12 … 160×50) | High (manual QA tool) |

---

## Conclusion

The largest gaps were **UI entry points** (dashboard, browse, search, pack create), not the storage layer. V2 refactors treat `AssetType` as the primary navigation axis while preserving backward-compatible on-disk layouts.
