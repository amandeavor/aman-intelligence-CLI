# Publishing `aman-cli` to npm

Repo-only doc (not included in the npm tarball).

## Prerequisites

- npm account with access to publish `aman-cli`
- `npm login`
- `npm run typecheck` and `npm run build` pass

## What gets published

Only these paths (see `package.json` → `files`):

- `dist/` — compiled CLI
- `skills/`, `prompts/`, `mcps/` — bundled assets
- `README.md`, `LICENSE`

Specs, QA reports, and contributor docs stay on GitHub.

## Dry run

```bash
npm run pack:check
# or: npm pack --dry-run
```

Last check (v0.1.0): **552 files**, ~**666 KB** packed / **2.4 MB** unpacked. Most size is bundled `skills/` (starter content), not docs or QA artifacts.

Inspect the file list before publishing — you should **not** see `BRUTAL_QA_REPORT.md`, `AMAN-*-SPEC-V1.md`, or `src/`.

## Test like a user

```bash
npm pack
mkdir ../test-install && cd ../test-install
npm install ../aman-intelligence/aman-cli-0.1.0.tgz
npx aman-cli
npx aman-cli doctor
```

`npx aman-cli` with no args installs globally (`npm install -g aman-cli@<version>`).

## Publish

```bash
npm publish --access public
```

First early-adopter release uses **0.1.x** semver. Promote to `1.0.0` after real-world usage.

## User install paths

| Command | Result |
|---------|--------|
| `npx aman-cli` | Global install + next-step hints |
| `npx aman-cli doctor` | Run CLI once without global install |
| `npm install -g aman-cli` | Global `aman` / `aman-cli` binaries |
| `aman` | Dashboard (TTY) or status (non-TTY) |
