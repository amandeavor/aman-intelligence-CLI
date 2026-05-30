# Contributing to Aman Intelligence

Thank you for helping make Aman trustworthy for real users.

## Ways to contribute

1. **Assets** — skills, prompts, or MCPs that follow [docs/ASSET-SPEC.md](./docs/ASSET-SPEC.md)
2. **Code** — CLI, registry adapters, docs (keep changes scoped; no architecture drift)
3. **Documentation** — fixes that match **current behavior**, not future plans

## Asset contributions

1. Use canonical layout (`SKILL.md` / `PROMPT.md` / `mcp.json` + `metadata.json`).
2. Include valid `id`, `slug`, `version`, and SHA-256 checksum over the content file.
3. Do not commit `mcp.local.json` or secrets.
4. Open a PR with a short description of what the asset does and who maintains it.

## Code contributions

```bash
git clone https://github.com/aman-intelligence/aman-cli.git
cd aman-cli
npm install
npm run typecheck
npm run build
npm link
aman doctor
```

### Standards

- `npm run typecheck` and `npm run build` must pass
- No install-time execution in asset or pack flows
- Registry changes must go through `RegistryAdapter` only
- Prefer minimal, focused diffs

### Pull request process

1. Describe the problem and the fix
2. Note any QA scenarios you ran (`npm run typecheck`, `npm run build`, `aman doctor`)
3. Link related issues if applicable
4. Wait for review before merge

## Code of conduct

Be respectful and constructive. Harassment and discrimination are not tolerated. Maintainers may remove contributions that violate these expectations.

## Security

See [SECURITY.md](./SECURITY.md) for reporting vulnerabilities.
