# Release Checklist — v0.1.0

Check every item before publishing `aman-cli@0.1.0` on npm.

| # | Item | Owner | Done |
|---|------|-------|------|
| 1 | `npm run typecheck` passes | Maintainer | ☐ |
| 2 | `npm run build` passes | Maintainer | ☐ |
| 3 | `npm pack --dry-run` lists only `dist/`, `skills/`, `prompts/`, `mcps/`, `README.md`, `LICENSE` | Maintainer | ☐ |
| 4 | `node dist/bin/aman.js --version` prints semver | Maintainer | ☐ |
| 5 | `aman help` readable in non-TTY | Maintainer | ☐ |
| 6 | README opening paragraph exact per launch spec | Maintainer | ☐ |
| 7 | QUICK-START, ASSET-SPEC, REGISTRY-SPEC, LOCKFILE-SPEC present | Maintainer | ☐ |
| 8 | CONTRIBUTING, SECURITY, RELEASE-NOTES present | Maintainer | ☐ |
| 9 | BRUTAL_QA_REPORT.md reviewed | Maintainer | ☐ |
| 10 | LAUNCH-BLOCKERS.md empty or all resolved | Maintainer | ☐ |
| 11 | No blocking issues in QA report | Maintainer | ☐ |
| 12 | `npx aman-cli` smoke test (clean machine or temp HOME) | Maintainer | ☐ |
| 13 | Global install smoke: `npm i -g aman-cli && aman doctor` | Maintainer | ☐ |
| 14 | Registry publish + install checksum path tested | Maintainer | ☐ |
| 15 | `npm pack` + test install in clean folder (`PUBLISHING.md`) | Maintainer | ☐ |
| 16 | npm publish `aman-cli@0.1.0` (`npm publish --access public`) | Release manager | ☐ |
| 17 | GitHub release notes match RELEASE-NOTES.md | Release manager | ☐ |
| 18 | Repository URL in package.json correct | Release manager | ☐ |

**Sign-off:** _________________ **Date:** ___________
