# Aman Constitution

**Status:** Permanent architectural principles  
**Audience:** Maintainers, contributors, and future registry operators  
**Authority:** Supersedes ad-hoc decisions; changes require explicit review

---

## What Aman Is

Aman is the **package manager for AI workflow assets**.

It installs, organizes, versions, verifies, and shares **Skills**, **Prompts**, and **MCP configurations** (and compositions thereof via **Packs** and **Stacks**) with the same rigor developers expect from language package managers.

Aman provides:

- A **canonical registry model** for published assets
- **Reproducible environments** via lockfiles and checksums
- **Local and GitHub-backed** working copies
- A **terminal CLI** for discovery, install, and maintenance

---

## What Aman Is Not

- Not an AI model, agent host, or inference platform
- Not a marketplace that executes third-party code at install time
- Not a replacement for Git (Git is a **publishing source**)
- Not a general-purpose package manager for npm libraries
- Not a secrets store (MCP secrets stay local in `mcp.local.json`)
- Not a hosted registry **yet** (local/GitHub adapters today; HTTP server future)

---

## Core Principles

1. **Asset-first** — Skills, Prompts, and MCPs are equal first-class citizens with one metadata contract.
2. **Content-first** — Assets are files (markdown/JSON), not installable binaries or hooks.
3. **Local working copy wins** — User disk state overrides cache; registry wins for **published** resolution.
4. **Reproducibility** — `aman.lock` pins exact versions, checksums, and provenance.
5. **No install-time execution** — Install copies and verifies content only; never runs publisher scripts.
6. **Explicit user intent** — Destructive, global, or network actions require clear UX (see bootstrap install policy).
7. **Swappable infrastructure** — Registry, marketplace discovery, and storage backends implement interfaces; the CLI does not embed vendor logic in commands.

---

## Registry Principles

1. **Registry is canonical** — Published `(id, version)` records are the source of truth.
2. **GitHub is a publishing source, not the source of truth** — Repo state does not mutate published versions.
3. **Published versions are immutable** — Content and checksum for a version never change.
4. **Published versions are retained forever** — No deletion of published versions.
5. **Deprecation is allowed** — Deprecated versions remain installable by exact version with warnings.
6. **Integrity is mandatory** — SHA-256 checksum on canonical content file; verify on install.
7. **Signatures exist in schema** — May be null until signing phase; schema reserved from day one.
8. **Scopes are modeled from day one** — Public, org, and private visibility in schema; enforcement may lag.
9. **Adapter contract is locked** — Local filesystem, GitHub mirror, and future HTTP server share `RegistryAdapter`.

---

## Asset Principles

1. **Dual identity** — Stable UUID (`id`) and human slug (`@scope/name`); lockfile stores both.
2. **Canonical layout** — `SKILL.md`, `PROMPT.md`, or `mcp.json` + `metadata.json` per asset directory.
3. **Asset-only dependencies** — Dependencies reference other assets by slug + version; no pack-to-pack recursion in V1.
4. **Exact versions in V1** — No ranges or wildcards for registry-published dependency edges.
5. **Checksum covers full content file** — Including frontmatter; bytes on disk are what get hashed.
6. **MCP local secrets** — `mcp.local.json` is optional, gitignored, never published.

---

## Trust Principles

1. **Checksums protect integrity, not intent** — A malicious but consistent publisher still passes verification.
2. **Verified means human review** — `trust.verified` is not an automated quality score.
3. **Downloads are counts, not quality** — Do not surface as recommendation signals in V1.
4. **Ratings reserved** — Schema may hold `rating`; UI must not imply quality in early releases.
5. **Unverified is the default** — Absence of verification is not a failure state.

---

## Security Principles

1. **Fail closed on checksum mismatch** — Install aborts when content does not match registry/lockfile.
2. **Quarantine corrupt config** — Invalid `aman.json` / `aman.lock` backed up and reset rather than crash.
3. **Atomic lockfile writes** — Reduce torn writes on interrupt.
4. **Backup restore rolls back** — Failed restore must not leave environment half-migrated.
5. **Path traversal defenses** — Pack extract and import validate paths.
6. **No silent global installs** — Global CLI install requires explicit user consent (target state; see bootstrap design).

---

## Non-Goals

- Install-time hooks, post-install scripts, or publisher-defined executables
- Deleting published registry versions
- Pack-to-pack dependency recursion (V1)
- Install-time execution under any circumstances
- Treating GitHub repo HEAD as canonical for published assets
- Surfacing unverified trust signals as quality rankings
- Private org ACL enforcement before enterprise phase (schema may precede enforcement)

---

## Governance

- Normative specs: `docs/specs/AMAN-ASSET-SPEC-V1.md`, `docs/specs/AMAN-REGISTRY-SPEC-V1.md`, `docs/specs/AMAN-LOCKFILE-SPEC-V1.md`
- User-facing summaries: `docs/ASSET-SPEC.md`, `docs/REGISTRY-SPEC.md`, `docs/LOCKFILE-SPEC.md`
- This constitution wins on **principles**; specs win on **formats**

When in doubt: **protect reproducibility, refuse install-time execution, keep the registry canonical.**

---

*Adopted for Aman Intelligence v0.1.x public release preparation.*
