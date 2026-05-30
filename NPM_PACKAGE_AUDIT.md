# npm Package Audit — aman-cli@0.1.0

**Command:** `npm pack --dry-run`  
**Date:** 2026-05-30  
**Result:** 552 files · **665.9 KB** packed · **2.4 MB** unpacked

**Whitelist (`package.json` → `files`):** `dist/`, `skills/`, `prompts/`, `mcps/`, `README.md`, `LICENSE`

Repo-only content (AMAN-* specs, QA reports, `src/`, `scripts/`) is **not** in the tarball ✓

---

## Summary by classification

| Class | ~Files | ~Unpacked | Notes |
|-------|--------|-----------|-------|
| **1. Required Runtime** | 552 | 2.4 MB | Everything currently shipped |
| **2. Optional Runtime** | — | — | None shipped separately |
| **3. Development Only** | 0 in tarball | 0 | Excluded ✓ |
| **4. Should Not Ship** | 0 in tarball | 0 | Excluded ✓ |

**Within Required Runtime**, optimization candidates exist (see `PACKAGE_SIZE_OPTIMIZATION.md`).

---

## Top-level breakdown

| Path | Files (approx) | Unpacked (approx) | Class | Ship? |
|------|----------------|-------------------|-------|-------|
| `dist/` | 170 | 475 KB | Required Runtime | **Yes** — compiled CLI |
| `skills/` | 353 | 1.91 MB | Required Runtime* | **Yes** — bundled catalog |
| `prompts/` | 22 | 8 KB | Required Runtime | **Yes** — samples |
| `mcps/` | 4 | 1.4 KB | Required Runtime | **Yes** — samples |
| `README.md` | 1 | 3 KB | Required Runtime | **Yes** |
| `LICENSE` | 1 | 1 KB | Required Runtime | **Yes** |
| `package.json` | 1 | 2 KB | Required Runtime | **Yes** (auto) |

\*Justified for offline browse/install demos; largest optimization lever.

---

## `dist/` — Required Runtime

| Area | Purpose | Needed at runtime? | Ship? |
|------|---------|-------------------|-------|
| `dist/bin/aman.js` | CLI entry, shebang | **Yes** | **Yes** |
| `dist/cli/*` | version, help, global-install | **Yes** | **Yes** |
| `dist/commands/*` | All subcommands | **Yes** | **Yes** |
| `dist/services/*` | Business logic | **Yes** | **Yes** |
| `dist/registry/*` | Registry adapters | **Yes** | **Yes** |
| `dist/providers/*` | Marketplace | **Yes** | **Yes** |
| `dist/storage/*` | FS, scanner, layout | **Yes** | **Yes** |
| `dist/types/*` | Runtime metadata helpers | **Yes** | **Yes** |
| `dist/ui/*` | Ink TUI | **Yes** | **Yes** |
| `dist/utils/*` | integrity, slug, lock | **Yes** | **Yes** |
| `dist/**/*.d.ts` | TypeScript declarations | **No** for Node execution | **Optional** — safe to omit (~50% of dist file count) |
| `dist/commands/onboarding.js` | Orphan in dist? | Verify wired | **Yes** if referenced |

**Why `.d.ts` ships:** `tsc` emits declarations; no `declaration: false` in build.  
**Recommendation:** Exclude `**/*.d.ts` from npm `files` or add `publishConfig` ignore — saves ~100–150 KB unpacked, ~85 files. **Low risk.**

---

## `skills/` — Required Runtime (bundled catalog)

| Skill / tree | Why it exists | Needed? | Ship? |
|--------------|---------------|---------|-------|
| `caveman`, `brainstorming`, … small skills | Starter demos | Useful first-run | **Yes** (subset) |
| `react-best-practices/` | Large rule library + AGENTS.md | Demo / bundled install | **Debatable** — high file count |
| `react-native-skills/` | Same pattern | Demo | **Debatable** |
| `react-view-transitions/` | Same | Demo | **Debatable** |
| `vercel-optimize/` | **Largest** — scripts, lib, references | Power-user skill | **Optional** — move to GitHub-only or post-install download |
| `azure-cost/` | Multi-file skill | Niche | **Optional** |
| `writing-skills/`, `writing-plans/` | Education content | Demo | **Yes** (small) |

**vercel-optimize alone:** ~200+ files, bulk of `skills/` bytes. Includes `.mjs` tooling inside skill tree (content for agents, not executed by Aman install — aligns with no install-time execution).

---

## `prompts/` — Required Runtime

| Item | Purpose | Ship? |
|------|---------|-------|
| 11 prompt dirs | Sample PROMPT.md + metadata | **Yes** — parity demos |
| Empty PROMPT.md files | Placeholders | **Yes** — harmless |

---

## `mcps/` — Required Runtime

| Item | Purpose | Ship? |
|------|---------|-------|
| `filesystem`, `github` | Sample mcp.json | **Yes** |

---

## Explicitly excluded (repo only) — Should Not Ship ✓

| Path | Why in repo | In npm? |
|------|-------------|---------|
| `src/` | TypeScript source | **No** ✓ |
| `scripts/launch-qa.mjs` | QA | **No** ✓ |
| `AMAN-*-SPEC-V1.md` | Normative specs | **No** ✓ |
| `BRUTAL_QA_REPORT.md` | QA | **No** ✓ |
| `PUBLISHING.md` | Maintainer | **No** ✓ |
| `.aman/` | Local user data | **No** ✓ |
| `node_modules/` | Dependencies | Bundled via npm deps, not packed |

---

## Dependencies (not in tarball, installed on `npm install`)

| Package | Runtime need |
|---------|----------------|
| react, ink, * | TUI |
| meow | CLI parsing |
| conf | Config |
| fuse.js | Search |
| archiver | Packs |
| glob, js-yaml, chalk | Various |

**DevDependencies** correctly excluded from publish.

---

## Audit verdict

| Check | Status |
|-------|--------|
| No QA/spec leakage | **Pass** |
| `bin` points to built JS | **Pass** |
| `prepublishOnly` builds | **Pass** |
| Runtime completeness | **Pass** |
| Optional slimming | **dist/.d.ts**, **trim bundled skills** |

---

## Recommended `files` field (future)

```json
"files": [
  "dist/**/*.js",
  "!dist/**/*.d.ts",
  "skills",
  "prompts",
  "mcps",
  "README.md",
  "LICENSE"
]
```

(Verify npm `files` negation support or use `publishConfig` + build step to strip `.d.ts`.)
