# Registry Specification (Contributor Guide)

The registry is the **canonical source of truth** for published asset versions. GitHub and local folders are publish sources, not replacements for the registry.

Normative reference: [AMAN-REGISTRY-SPEC-V1.md](./specs/AMAN-REGISTRY-SPEC-V1.md).

## Identity

| Identifier | Role |
|------------|------|
| `id` (UUID) | Stable forever; used in lockfiles |
| `slug` (`@scope/name`) | Human-facing; may change with redirects |

## Immutability

- Published `(id, version)` content never changes.
- Versions are never deleted.
- Deprecation marks a version with `reason` and optional `successor`; exact version remains installable.

## Integrity

Every published version includes:

```json
"integrity": {
  "algorithm": "sha256",
  "checksum": "sha256:<hex>",
  "signature": null
}
```

Publish fails if submitted checksum ≠ computed content. Install fails if verification fails.

## Adapter contract

Implement `RegistryAdapter` (`src/registry/adapter.interface.ts`):

| Operation | Purpose |
|-----------|---------|
| `resolve` | Metadata + content location for slug@version |
| `resolveById` | Same, by UUID |
| `publish` | Immutable snapshot |
| `deprecate` | Mark deprecated |
| `list` | All versions for a slug |
| `search` | Query index |
| `verify` | Checksum check |

V1 implementations: **local** (`~/.aman/registry/`), **GitHub mirror** (`{repo}/registry/`).

## CLI configuration

```bash
export AMAN_REGISTRY_BACKEND=local   # default
export AMAN_REGISTRY_BACKEND=github  # mirror
```

## Trust signals (schema)

```json
"trust": {
  "verified": false,
  "downloads": 0,
  "rating": null,
  "publisher": "@aman",
  "deprecated": false
}
```

V1 UI surfaces `verified` and `downloads` only where shown; `rating` is reserved.

## Dependencies (registry records)

Exact versions only in V1:

```json
"dependencies": [{ "slug": "@aman/foo", "version": "1.0.0" }]
```
