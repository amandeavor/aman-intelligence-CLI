# Build Verification Report — v0.1.0

**Date:** 2026-05-30  
**Environment:** Windows, Node v22.22.0

---

## Commands

| Command | Result |
|---------|--------|
| `npm run typecheck` | **PASS** — zero errors |
| `npm run build` | **PASS** — zero errors |
| `npm pack --dry-run` | **PASS** |

---

## npm pack --dry-run

| Metric | Value |
|--------|--------|
| Package | `aman-cli@0.1.0` |
| Files | **173** |
| Packed size | **98.5 kB** |
| Unpacked size | **481.1 kB** |

### Tarball contents (verified)

| Included | Expected |
|----------|----------|
| `dist/**` | Yes |
| `README.md` | Yes |
| `LICENSE` | Yes |
| `package.json` | Yes (auto) |
| `skills/` | **No** |
| `prompts/` | **No** |
| `mcps/` | **No** |
| `src/` | **No** |
| QA/spec markdown | **No** (not in `files` whitelist) |

### bin entry

```json
"bin": {
  "aman": "./dist/bin/aman.js",
  "aman-cli": "./dist/bin/aman.js"
}
```

`dist/bin/aman.js` exists with `#!/usr/bin/env node` shebang.

---

## Runtime smoke

| Test | Result |
|------|--------|
| `node dist/bin/aman.js --version` | `0.1.0` |
| `node dist/bin/aman.js doctor` (fresh temp HOME) | All checks pass; bundled line shows optional/no catalog |
| No `skills/` in pack listing | Confirmed |

---

## Stale build artifact

Removed orphan `dist/commands/onboarding.js` (legacy bundled copy; no source). Not included in post-cleanup pack count.

---

## Verdict

**BUILD VERIFICATION: PASS** — suitable for git push and future `npm publish`.
