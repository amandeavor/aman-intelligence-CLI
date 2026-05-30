# Repository Health Report — Public GitHub Push

**Date:** 2026-05-30  
**Repository:** aman-intelligence-CLI

---

## Required files

| File | Present | Notes |
|------|---------|-------|
| README.md | Yes | Opening paragraph matches spec; npx behavior documented |
| LICENSE | Yes | MIT |
| CONTRIBUTING.md | Yes | |
| SECURITY.md | Yes | |
| QUICK-START.md | Yes | No bundled/caveman examples |
| RELEASE-NOTES.md | Yes | Zero default assets noted |
| AMAN_CONSTITUTION.md | Yes | |
| .gitignore | Yes | Expanded for env/artifacts |

**Additional docs (GitHub-only, not npm):** ASSET-SPEC.md, REGISTRY-SPEC.md, LOCKFILE-SPEC.md, PUBLISHING.md, normative AMAN-*-SPEC-V1.md files, release engineering audits.

---

## README verification

**Opening paragraph (exact match):** Yes

> Aman is the package manager for AI workflow assets.
>
> Most developers have skills, prompts, and MCP configurations scattered across GitHub repositories, local folders, and notes. Aman gives you one place to install, organize, sync, and share them — the same way npm manages packages.

**npx behavior:** Documented as:

- `npx aman-cli` with no args → installs globally
- `npx aman-cli doctor` → run without installing

**Bundled assets:** Removed from README; states CLI ships with no default assets.

---

## Internal links

| Link target | Resolves |
|-------------|----------|
| QUICK-START.md | Yes |
| ASSET-SPEC.md | Yes |
| REGISTRY-SPEC.md | Yes |
| LOCKFILE-SPEC.md | Yes |
| CONTRIBUTING.md | Yes |
| SECURITY.md | Yes |
| RELEASE-NOTES.md | Yes |
| AMAN_CONSTITUTION.md | Yes |
| PUBLISHING.md | Yes |
| AMAN-*-SPEC-V1.md | Yes (repo root) |

---

## Documentation consistency

| Topic | Consistent across docs |
|-------|------------------------|
| Zero bundled assets in package | README, QUICK-START, RELEASE-NOTES |
| Registry / import install paths | QUICK-START, README |
| No `caveman` example asset | README, QUICK-START updated |
| Version 0.1.0 early adopter | package.json, RELEASE-NOTES |

**Note:** Maintainer docs (BRUTAL_QA_REPORT, PACKAGE_SIZE_OPTIMIZATION) still mention historical bundled sizes — acceptable as engineering history; not user-facing install docs.

---

## Minimal code change for health (Task 1)

`doctor.service.ts`: bundled-assets check reports **pass** when no package catalog exists (required for “doctor clean” with zero bundled assets). Does not change install, registry, or bootstrap flows.

---

## Health verdict

**READY** for public GitHub repository push from a documentation and hygiene perspective.
