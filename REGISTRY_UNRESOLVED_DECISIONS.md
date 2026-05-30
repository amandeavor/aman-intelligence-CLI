# Registry — Unresolved Decisions (Phase 3)

Decisions deferred from Phase 3 with tradeoffs and recommended defaults.

---

## 1. HTTP API path shape

**Tradeoff:** RESTful slug paths (`/assets/@aman%2Ffoo/versions/1.0.0`) vs opaque ID paths (`/assets/{uuid}/versions/1.0.0`).

**Recommendation:** Expose **both** — ID routes for lockfile automation; slug routes for human CLI. Same response body as `resolve` / `resolveById` in this spec.

---

## 2. Content delivery: directory vs archive

**Tradeoff:** Store exploded `content/` (current filesystem adapter) vs single tarball blob with content-addressed storage.

**Recommendation:** Keep exploded layout for V1 adapters; add optional `content.archiveUrl` + blob store on HTTP server without changing `RegistryVersionRecord.integrity` rules.

---

## 3. Download counter semantics

**Tradeoff:** Increment on `resolve` (current local adapter) vs dedicated `recordDownload` on successful install.

**Recommendation:** Move to **install-confirmed** increments on production server to avoid scan inflation; keep resolve-time increment for local-only analytics until HTTP server exists.

---

## 4. Namespace ownership enforcement

**Tradeoff:** Trust publishers in V1 vs require namespace claims (DNS, GitHub org, manual approval).

**Recommendation:** **Claim tokens** per namespace before first publish on production server; local adapter remains open for development.

---

## 5. `successor` version format

**Tradeoff:** Full slug@version string (CLI-friendly) vs structured `{ slug, version }`.

**Recommendation:** Keep **slug@version** string in `deprecated.successor` for V1; parse consistently in CLI warnings.

---

## 6. Private asset listing in `search`

**Tradeoff:** Hide private slugs entirely vs return redacted hits without content paths.

**Recommendation:** **No public index entries** for `@org~private/*`; authenticated search returns full hits (future).

---

## 7. Pack and stack registry records

**Tradeoff:** Single adapter for all record types vs separate indexes.

**Recommendation:** Reuse `RegistryVersionRecord` shape with `recordType: "pack" | "stack"` when pack publishing ships; **separate** Phase — assets only in V1 adapter code.

---

## 8. GitHub ↔ registry canonical sync direction

**Tradeoff:** Bi-directional sync vs GitHub as publish staging only.

**Recommendation:** **Unidirectional ingest** — `aman registry publish` (or CI) pushes to canonical registry; GitHub mirror is read-through cache, not authoritative after publish.
