# Tarball Install Test Plan — aman-cli@0.1.0

**Purpose:** Validate what npm users receive matches maintainer expectations before `npm publish`.

---

## Prerequisites

- Node.js ≥ 18
- Clean machine or isolated `HOME` / `npm_config_cache`
- `npm run typecheck && npm run build` pass
- No global `aman-cli` installed (or note version before test)

---

## Phase 1 — Build tarball

```bash
cd aman-intelligence
npm pack
# Expected: aman-cli-0.1.0.tgz in repo root
```

| Check | Expected | Blocker if fail |
|-------|----------|-----------------|
| File exists | `aman-cli-0.1.0.tgz` | **Yes** |
| `prepack` ran build | `dist/bin/aman.js` fresh | **Yes** |
| Size | ~650–700 KB packed | No (warn if &gt;1 MB) |

---

## Phase 2 — Clean-room install

```bash
mkdir /tmp/aman-tarball-test && cd /tmp/aman-tarball-test
npm init -y
npm install /path/to/aman-cli-0.1.0.tgz
```

| Check | Expected | Blocker? |
|-------|----------|----------|
| Install exit 0 | Yes | **Yes** |
| `node_modules/aman-cli/dist/bin/aman.js` exists | Yes | **Yes** |
| `node_modules/.bin/aman` exists | Yes | **Yes** |
| `node_modules/.bin/aman-cli` exists | Yes | **Yes** |
| Bundled `skills/caveman` present | Yes | **Yes** |

---

## Phase 3 — npx from local project

```bash
npx aman-cli --version
# Expected: 0.1.0
```

| Test | Expected (current v0.1.0) | Expected (after bootstrap fix) |
|------|---------------------------|--------------------------------|
| `npx aman-cli --version` | `0.1.0` | Same |
| `npx aman-cli --help` | Plain help | Same |
| `npx aman-cli` (no args) | Runs `npm install -g` | **Menu** or instructions only |
| `npx aman-cli doctor` | Doctor output, no global install | Same |

**Release blocker (current):** Document or fix bare `npx aman-cli` before marketing.

---

## Phase 4 — Global install from tarball

```bash
npm install -g /path/to/aman-cli-0.1.0.tgz
aman --version
which aman   # or where aman on Windows
```

| Check | Expected | Blocker? |
|-------|----------|----------|
| `aman --version` | `0.1.0` | **Yes** |
| `aman-cli --version` | `0.1.0` | **Yes** |
| `aman doctor` (non-TTY) | Health checks, may warn on init | No |
| `aman` (TTY) | Dashboard or init prompt | No |

---

## Phase 5 — Functional smoke

```bash
aman init --local
aman install caveman --global
aman doctor
aman export caveman   # non-TTY or TTY
```

| Check | Expected | Blocker? |
|-------|----------|----------|
| `init` creates `~/.aman` | Yes | **Yes** |
| `install caveman` | Skill in `~/.aman/skills` | **Yes** |
| Lockfile written | `aman.lock` valid JSON | **Yes** |
| Checksum present | Non-placeholder sha256 | **Yes** |

---

## Phase 6 — Failure cases

| Scenario | Command | Expected behavior |
|----------|---------|-------------------|
| Corrupt lock | Manual edit `aman.lock` → `aman doctor` | Quarantine + warn, no crash |
| No network | `npx aman-cli doctor` (cached) | Runs; marketplace may warn |
| No git | `aman import user/repo` | Clear error |
| Global install denied | `npx aman-cli` without permissions | Non-zero + manual instructions |
| PowerShell slug | `aman install "@aman/foo@1.0.0"` | Works when quoted |

---

## Phase 7 — Platform matrix

| OS | Phase 2–5 | Owner |
|----|-----------|-------|
| Windows 10/11 | Required | |
| macOS (Apple Silicon) | Required | |
| Ubuntu LTS | Required | |

---

## Phase 8 — Post-publish verification

After `npm publish --access public`:

```bash
cd /tmp/clean-dir
npx aman-cli@0.1.0 --version
```

| Check | Blocker? |
|-------|----------|
| Resolves from registry | **Yes** |
| Integrity hash matches | **Yes** |

---

## Recording template

```markdown
| Test | Win | macOS | Linux | Notes |
|------|-----|-------|-------|-------|
| npm pack | | | | |
| local npm install | | | | |
| npx --version | | | | |
| npx (no args) | | | | |
| global aman | | | | |
| init + install | | | | |
```

---

## Current status (automated partial)

| Test | Result |
|------|--------|
| `npm pack --dry-run` | 552 files, 666 KB — **Pass** |
| `node dist/bin/aman.js --version` | 0.1.0 — **Pass** |
| `node dist/bin/aman.js help` | Plain text — **Pass** |
| Full clean-room tarball | **Not recorded in CI** — manual required |

---

## Release blockers from this plan

1. **Bare `npx aman-cli` behavior** vs documented consent model.
2. **Missing recorded** Win/Mac/Linux tarball matrix.
3. **npm publish** not yet executed — `npx` from registry unverified.

Non-blockers: package size, terminal &lt;60 cols.
