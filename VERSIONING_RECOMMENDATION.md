# Versioning Recommendation — aman-cli

**Current version:** `0.1.0`  
**Decision required:** Stay 0.1.0 · continue 0.x · jump to 1.0.0

---

## Evaluation criteria

| Factor | Assessment |
|--------|------------|
| **Architecture maturity** | Frozen (asset-first, registry adapter, lockfile) — **high design maturity** |
| **Registry maturity** | Local + GitHub mirror only; no hosted registry — **immature operationally** |
| **Ecosystem maturity** | No public npm usage yet; no published community assets at scale — **immature** |
| **Real-world user count** | Pre-release / early adopters — **~0 production** |
| **Backwards compatibility** | No published API contract; lockfile schema v1 — **no BC guarantee yet** |

---

## Semantic versioning interpretation

| Version | Signals to developers |
|---------|----------------------|
| **0.y.z** | Experimental; breaking changes allowed; “use at own risk” |
| **1.0.0** | Stable CLI surface; semver promises for commands, lockfile, registry record shape |

---

## Options

### A. Stay on `0.1.0` for first npm publish

| Pros | Cons |
|------|------|
| Already documented in RELEASE-NOTES | No patch channel if bootstrap fix ships immediately |
| Clear “first publish” marker | — |

**Use if:** Publishing within days without follow-up fix.

### B. Continue `0.x` series (recommended)

**Publish `0.1.0` now (or `0.1.0` if not yet on npm).**

| Milestone | Version | Trigger |
|-----------|---------|---------|
| First npm publish | `0.1.0` | Initial public |
| Bootstrap consent + npm hygiene | `0.1.1` | UX fix |
| Smaller starter bundle | `0.2.0` | Package diet |
| Hosted registry beta | `0.3.0` | Infra |
| Stable public API commitment | **`1.0.0`** | 3–6 months real usage, bootstrap stable, no lockfile breaks |

| Pros | Cons |
|------|------|
| Honest about iteration | Some enterprises avoid 0.x |
| Room for lockfile/registry tweaks | Marketing sounds “beta” |
| Matches registry “V1 schema, 0.x product” | — |

### C. Release `1.0.0` immediately

| Pros | Cons |
|------|------|
| Strong marketing | **Misleading** — silent global install, no hosted registry |
| Signals confidence | Breaking changes hurt trust if ship fixes as 1.0.1 constantly |

**Not recommended** for first public npm release.

---

## Recommendation

### **Stay in the `0.x` series. Ship `0.1.0` as the first public npm version.**

Promote to **`1.0.0`** only when **all** are true:

1. Bootstrap install uses **explicit consent** (see `BOOTSTRAP_INSTALL_DESIGN.md`).
2. Tarball install test plan executed on Win/Mac/Linux (see `TARBALL_INSTALL_TEST_PLAN.md`).
3. At least one patch release (`0.1.x`) shipped without lockfile/schema breaking changes.
4. README, `npx`, and global `aman` behavior match docs.
5. Conscious decision to support semver for: CLI flags, `aman.lock` schemaVersion 1, registry on-disk layout.

Until then, document in README:

> v0.1.x is an early adopter release. Patch versions may change CLI UX; minor versions may extend schema with migrations.

---

## Tagging strategy

| Tag | Purpose |
|-----|---------|
| `v0.1.0` | First npm publish |
| `v0.1.1` | Bootstrap + optional `.d.ts` strip |
| `v1.0.0` | Stability promise |

Do not tag `1.0.0` until bootstrap and tarball validation are complete.
