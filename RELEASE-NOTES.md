# Release Notes

## v0.1.0 — First public release (early adopter)

First open-source and npm release of **aman-cli**: the package manager for AI workflow assets.

### Install

```bash
npx aman-cli
npm install -g aman-cli
npx aman-cli doctor
```

### Included

- Skills, prompts, and MCPs as equal first-class assets
- Install, browse, search, import, export, packs, stacks, backup, doctor, sync
- Local registry adapters and lockfile with SHA-256 integrity
- **Zero default assets** in the package — users install from registry, import, marketplace, or their own sources

### Not included in the npm tarball

- Pre-bundled `skills/`, `prompts/`, or `mcps/` catalogs (by design)
- Hosted production registry HTTP server
- Signature verification (`signature: null` in V1)

### Known limitations

- Interactive UI requires a TTY
- Quote `@` in PowerShell for registry slugs: `"@scope/name@1.0.0"`
- `npx aman-cli` with no args installs globally (see README)

See [SECURITY.md](./SECURITY.md) on GitHub.
