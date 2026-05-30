# Asset Parity Audit — Phase 2

**Date:** 2026-05-30  
**Scope:** Eliminate skill-manager bias; Skills, Prompts, and MCPs treated as equal first-class assets.  
**Spec baseline:** Phase 1 foundation (`AMAN-*-SPEC-V1.md`)

---

## Summary

| Category | Issues found | Fixed | Deferred |
|----------|--------------|-------|----------|
| UI copy / labels | 18 | 18 | 0 |
| Command behavior | 12 | 11 | 1 |
| Data structures | 4 | 4 | 0 |
| Marketplace / search | 5 | 4 | 1 |
| Dashboard | 6 | 6 | 0 |
| Pack / stack | 8 | 8 | 0 |
| Import / export / info | 7 | 7 | 0 |
| Doctor / backup | 4 | 4 | 0 |
| **Total** | **64** | **62** | **2** |

---

## Phase 1 spec gaps (fixed in this pass)

| Gap | Fix |
|-----|-----|
| `mcp.local.json` not in lockfile | Added `requiresLocalConfig` to `AMAN-LOCKFILE-SPEC-V1.md` §4.1; TypeScript `LockEntry`; doctor check |
| Checksum / frontmatter ambiguity | Explicit rule in `AMAN-ASSET-SPEC-V1.md` §11.1–11.2: full file bytes including frontmatter |
| Dependency ranges vs exact versions | Clarified in `AMAN-ASSET-SPEC-V1.md` §5.3 |
| Pack nesting cap | Added `AMAN-PACK-SPEC-V1.md` §6.3 (one-level pack deps) |

---

## 1. Conditionals (`type === 'skill'` without parity)

Legitimate type-branching (filesystem paths, checksum files) — **no change required**:

| File | Lines | Reason |
|------|-------|--------|
| `src/services/asset.service.ts` | 21–166 | Per-type storage paths and scanners |
| `src/utils/integrity.ts` | 23–28 | Skill content file is `SKILL.md` |
| `src/services/doctor.service.ts` | 116–121 | Per-type metadata sidecar paths |
| `src/services/pack.service.ts` | 29–135 | Pack archive layout by type |
| `src/commands/import.tsx` | 105–326 | Skill install uses directory not file |
| `src/services/classification.service.ts` | 141–291 | SKILL.md detection rules |

**Fixed — behavior was skill-only:**

| File | Issue | Fix |
|------|-------|-----|
| `src/commands/stack.tsx` | Create/activate only skills | Rewritten: all types in create; activate installs skills + prompts + MCPs |
| `src/commands/stack.tsx` | Activate message "N skills loaded" | `activationSummary()` for all types |
| `src/services/backup.service.ts` | Restore verified metadata only for skills | Also verifies prompt/MCP metadata sidecars |

---

## 2. UI strings (skill when asset intended)

| File | Line(s) | Issue | Fix |
|------|---------|-------|-----|
| `src/commands/stack.tsx` | 122, 138, 109 | "Loading skills", "Select skills" | "Loading assets", "Select assets", counts all types |
| `src/commands/dashboard.tsx` | 802 | "load its skills" | "activate its assets" |
| `src/commands/dashboard.tsx` | 1015 | "Add Skill" only in add menu | Equal labels: Skills / Prompts / MCPs |
| `src/commands/search.tsx` | 44 | "Searching skills, prompts..." | "Searching assets..." |
| `src/commands/search.tsx` | 310–311 | Skill-first result counts | MCP · Prompt · Skill order |
| `src/commands/pack.tsx` | 23 | Comment "skill selector" | Left as historical comment in pack create header only |
| `src/commands/help.tsx` | 28 | Lists types (OK) | Kept explicit type list |
| `src/commands/sync.tsx` | 241, 280 | Skill-first sync summary | MCP · Prompt · Skill order |
| `src/ui/assetDisplay.ts` | 31 | `formatGroupedCount` skill-first | MCP · Prompt · Skill order |

Menu descriptions in `dashboard.tsx` already asset-inclusive; install line tightened.

---

## 3. Data structures (skills without prompts/mcps)

| File | Issue | Fix |
|------|-------|-----|
| `src/commands/stack.tsx` | `projectData: { skills: [] }` only | Full `scanAll` merge for all types |
| `src/commands/dashboard.tsx` | Stats missing `packs` | Added `packs` from distinct lockfile `pack:` sources |
| `src/ui/assetDisplay.ts` | `ASSET_TYPES` order skill-first | `ASSET_TAB_ORDER`: mcp, prompt, skill |
| `src/types/index.ts` | `LockEntry` missing `requiresLocalConfig` | Added per lockfile spec |

Pack/Stack/Backup `skills[]` arrays are **intentional** per-type buckets (not skill-only models).

---

## 4. Commands / flags

| File | Issue | Fix |
|------|-------|-----|
| `src/commands/export.tsx` | No `--type`; single-name only | `--type skill\|prompt\|mcp`; filters export |
| `src/bin/aman.ts` | `--type` documented | Already present; export honors it |
| `src/commands/info.tsx` | Marketplace-only lookup | Local installed lookup first, all types |
| `src/commands/install.tsx` | Wizard default type `skill` | Default `mcp` (first tab order) |
| `src/commands/browse.tsx` | Default tab `skill` | Default `mcp` |
| `src/commands/install.tsx` | Success message type-agnostic | Includes asset type label |

---

## 5. Marketplace / search / browse

| File | Issue | Fix |
|------|-------|-----|
| `src/providers/skills-sh.provider.ts` | Skills only | **Deferred** — documented; local provider covers all types |
| `src/commands/search.tsx` | No `type` in client filter | `matchesAssetSearch` includes type + labels |
| `src/commands/search.tsx` | Empty query behavior | No skill filter; marketplace returns all when typed |
| `src/commands/browse.tsx` | Tab order skill-first | `ASSET_TAB_ORDER` for tabs and cycling |
| `src/services/marketplace.service.ts` | Install candidate iteration order | Uses `ASSET_TAB_ORDER` |

---

## 6. Dashboard

| Requirement | Status |
|-------------|--------|
| Counts: Skills, Prompts, MCPs, Packs, Stacks | Done — equal-weight line, MCP-first order |
| Storage type + repo | Done |
| Last sync + last backup | Done — shown on TTY home |
| No skill-primary framing | Done — "Asset Hub", equal counts |

| File | Fix |
|------|-----|
| `dashboard.tsx` `loadData` | Pack count from lockfile |
| `dashboard.tsx` home | Sync/backup timestamps |
| `dashboard.tsx` non-TTY | MCP-first asset counts + packs |

---

## 7. Packs

| File | Issue | Fix |
|------|-------|-----|
| `src/commands/pack.tsx` | Selection `Set<string>` by name only | `skill:name` composite keys via `assetCompositeKey()` |
| `src/commands/pack.tsx` | Default category skill | `ASSET_TAB_ORDER[0]` (mcp) |
| `src/commands/pack.tsx` | Tab order | `ASSET_TAB_ORDER` |

---

## 8. Stacks

| File | Issue | Fix |
|------|-------|-----|
| `src/commands/stack.tsx` | Create: skills only | Category tabs + composite selection |
| `src/commands/stack.tsx` | Activate: install skills only | `installStackMembers()` all types |
| `src/commands/dashboard.tsx` | Stack editor add/remove | Already had skill/prompt/mcp paths; labels equalized |

---

## 9. Import

| File | Issue | Fix |
|------|-------|-----|
| `src/services/classification.service.ts` | Auto-import threshold 75% | **50%** per Phase 2 confidence bands |
| `src/commands/import.tsx` | Preview: counts only | Per-item type badge, file, confidence %, reason |
| `src/commands/import.tsx` | Install loop | Already skill \| prompt \| mcp |

---

## 10. Export

| File | Issue | Fix |
|------|-------|-----|
| `src/commands/export.tsx` | No type-scoped export | `--type` filters to one asset category |
| `src/commands/export.tsx` | Pack export | Unchanged — includes all types in manifest |

---

## 11. Info / help / doctor

| File | Issue | Fix |
|------|-------|-----|
| `src/commands/info.tsx` | Failed for local prompts/MCPs | `findAssetByName()` scans installed + marketplace |
| `src/commands/help.tsx` | Export help vague | Documents `--all` and `--type` |
| `src/services/doctor.service.ts` | Bundled check skills dir only | skills + prompts + mcps dirs |
| `src/services/doctor.service.ts` | No MCP secrets warning | `MCP local configuration` check when `requiresLocalConfig` |

---

## 12. Shared utilities

| File | Change |
|------|--------|
| `src/ui/assetDisplay.ts` | `ASSET_TAB_ORDER`, `assetCompositeKey`, `parseAssetCompositeKey`, type-aware search |
| `src/types/index.ts` | `LockEntry.requiresLocalConfig` |
| `src/utils/lock-migrate.ts` | Default `requiresLocalConfig` for MCP on migrate |
| `src/services/asset.service.ts` | Set `requiresLocalConfig: true` on MCP install |

---

## Acceptance checklist

| Criterion | Status |
|-----------|--------|
| Browse / search / install / info equal for 3 types | Pass |
| No skill-only language unless type-specific | Pass |
| Dashboard shows all required stats | Pass |
| Pack composite keys | Pass |
| Stack create/activate all types | Pass |
| Import confidence + per-type preview | Pass |
| Export `--type` + full environment | Pass |
| `npm run typecheck` | Pass |
| `npm run build` | Pass |

---

## Remaining parity gaps (Phase 3+)

1. **skills.sh marketplace provider** (`src/providers/skills-sh.provider.ts`)  
   - Still returns skills only by design.  
   - **Recommendation:** Add prompt/MCP registry providers or stub marketplace rows for non-skill types with “coming soon” in browse.

2. **Pack nesting depth enforcement** (`src/commands/pack.tsx`)  
   - Spec §6.3 caps pack→pack deps at one level; UI does not yet block nested pack dependencies (no pack-deps UI in V1).  
   - **Recommendation:** Enforce when pack dependency picker ships.

3. **Canonical on-disk layout** (Phase 1 divergence)  
   - Prompts/MCPs still use flat `{name}.md` / `{name}.json` vs spec directory layout.  
   - Not skill bias; layout migration is a separate phase.

4. **`mcp.local.json` scaffolding**  
   - Doctor warns when missing; CLI does not auto-create template file on MCP install.  
   - **Recommendation:** `aman doctor --fix` or install-time empty template.

---

## Files changed (Phase 2)

- `AMAN-LOCKFILE-SPEC-V1.md`, `AMAN-ASSET-SPEC-V1.md`, `AMAN-PACK-SPEC-V1.md`
- `src/ui/assetDisplay.ts`
- `src/types/index.ts`, `src/utils/lock-migrate.ts`
- `src/services/asset.service.ts`, `pack.service.ts`, `doctor.service.ts`, `backup.service.ts`, `classification.service.ts`, `marketplace.service.ts`
- `src/commands/dashboard.tsx`, `browse.tsx`, `search.tsx`, `install.tsx`, `pack.tsx`, `stack.tsx`, `import.tsx`, `export.tsx`, `info.tsx`, `help.tsx`, `sync.tsx`

---

**Outcome:** Aman’s CLI and dashboard now treat Skills, Prompts, and MCPs as peers in navigation order (MCP → Prompt → Skill), selection keys (`type:localName`), stack/pack flows, search, install, info, export, import review, and environment stats.
