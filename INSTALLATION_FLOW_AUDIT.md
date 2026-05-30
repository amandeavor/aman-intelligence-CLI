# Installation Flow Audit — aman-cli@0.1.0

**Auditor role:** npm release / CLI distribution  
**Date:** 2026-05-30  
**Scope:** How users discover and run Aman via npm (`npx`, global install, offline)

---

## Executive summary

Today, bare **`npx aman-cli`** does **not** behave like a typical “run once” npx tool. It **automatically runs `npm install -g aman-cli@<version>`** with no interactive consent. Subcommands (`npx aman-cli doctor`) behave as ephemeral npx executions. This is a **distribution UX and trust issue**, not an architecture issue.

---

## 1. What happens when a user runs `npx aman-cli`?

| Step | Behavior |
|------|----------|
| 1 | npm/npx resolves package `aman-cli@latest` (or pinned version) from registry |
| 2 | Package is downloaded into the **npm cache** if not already present |
| 3 | npx executes bin **`aman-cli`** → `dist/bin/aman.js` |
| 4 | Entry detects `process.argv[1]` basename is `aman-cli` and **no subcommand** |
| 5 | `runGlobalInstall()` runs: `npm install -g aman-cli@0.1.0` (stdio inherit) |
| 6 | On success: prints next steps (`aman init`, `aman install`, `aman doctor`) and **exits** |
| 7 | On failure: prints manual fallback and **exits non-zero** |

**Does not:** open dashboard, run `init`, or install workflow assets into `~/.aman/` (only the CLI binary is global-installed).

Implementation: `src/cli/global-install.ts`, early exit in `src/bin/aman.ts` (lines 36–39).

---

## 2. Does it install globally?

**Yes**, when invoked as **`npx aman-cli`** with **zero arguments**.

- Uses `npm install -g aman-cli@${CLI_VERSION}`.
- Requires write permission to npm’s global prefix (`npm prefix -g`).
- **No prompt** unless npm itself prompts (unusual for `-g`).
- Bypass only via `AMAN_SKIP_GLOBAL_INSTALL=1`.

**No**, when:

- User runs `npx aman-cli <subcommand>` (e.g. `doctor`, `init`, `install caveman --global`).
- User runs globally linked `aman` after install.
- User runs `npx aman` (wrong package name unless aliased).

---

## 3. Does it only execute temporarily?

| Invocation | Mode |
|------------|------|
| `npx aman-cli` (no args) | **Global install side effect**, then exit |
| `npx aman-cli doctor` | **Ephemeral**: runs from cache, no global install |
| `npm install -g aman-cli` then `aman` | **Persistent** global shim |

Standard npx ephemeral execution applies to **all subcommand invocations**. The no-arg path is the exception by design.

---

## 4. What is cached?

| Cache | Location | Contents |
|-------|----------|----------|
| **npm package cache** | OS-specific (`~/.npm` etc.) | `aman-cli` tarball, dependencies (react, ink, …) |
| **npx execution** | Same cache | Resolved package version for repeat runs |
| **Global install** | `$(npm prefix -g)/node_modules/aman-cli` | Full package + `aman` / `aman-cli` bins on PATH |
| **Aman environment** | `~/.aman/` (after `aman init`) | Skills, prompts, MCPs, lockfile, registry — **not** created by bare `npx aman-cli` |

First `npx` download size: ~**666 KB** packed tarball + dependency tree (several MB node_modules in cache).

---

## 5. What happens on second execution?

| Scenario | Result |
|----------|--------|
| `npx aman-cli` again | Re-runs global install (npm idempotent; may no-op or upgrade if version changed) |
| `npx aman-cli doctor` | Uses cache; fast start; no global install |
| `aman` (after successful global install) | Runs **dashboard** (TTY) or **status summary** (non-TTY) — **not** global install again |
| `aman-cli` globally | Same entry file; basename is `aman-cli` → **would trigger global install again** if called with no args |

**Footgun:** Global binary `aman-cli` with no args re-enters install path. Users should be steered to `aman` after install.

---

## 6. What happens on offline execution?

| Case | Offline behavior |
|------|------------------|
| First `npx aman-cli` (never cached) | **Fails** at registry fetch |
| `npx aman-cli` (package cached, no network for `-g`) | May use cache for npx; **global install may fail** if npm needs network |
| `aman doctor` (global, deps installed) | **Mostly works**; bundled assets local; marketplace/skills.sh may fail |
| `aman sync` / `import` (GitHub) | **Fails** without network/git |

No offline-first bootstrap or bundled “try without install” wizard on bare `npx aman-cli`.

---

## 7. Related entry paths

| Command | Behavior |
|---------|----------|
| `npx aman-cli --version` | Prints version, exits (no global install) |
| `npx aman-cli --help` | Plain help text, exits |
| `npm install -g aman-cli` | Standard global install; `aman` available |
| `aman` (no args, TTY) | Dashboard |
| `aman` (no args, non-TTY) | Summary or init hint |

---

## 8. Gaps vs. public-release expectations

1. **No explicit consent** before global install (conflicts with enterprise and npm norms).
2. **README implies discovery via npx** but behavior is “installer,” not “try the CLI.”
3. **`aman-cli` global bin** can re-trigger installer on no-arg invoke.
4. **No detection** of “already installed globally” before re-running `npm install -g`.
5. **First-run onboarding** (`aman init`) is separate; bare npx does not guide init interactively.

---

## 9. Recommendations (distribution only)

1. Replace silent global install with **guided consent** (see `BOOTSTRAP_INSTALL_DESIGN.md`).
2. Default bare `npx aman-cli` to **welcome + menu** or **ephemeral dashboard**, not `npm install -g`.
3. If keeping auto-install: require `--yes` or `AMAN_INSTALL_GLOBAL=1`.
4. Document PowerShell quoting for registry slugs in README (already noted elsewhere).

---

## References

- `src/bin/aman.ts`
- `src/cli/global-install.ts`
- `PUBLISHING.md`
