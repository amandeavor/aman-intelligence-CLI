# Quick Start

Get from zero to your first installed asset in under five minutes.

## 1. Install the CLI

```bash
npx aman-cli
```

Running `npx aman-cli` with no arguments installs `aman` globally. To run once without installing:

```bash
npx aman-cli doctor
```

Confirm:

```bash
aman --version
```

## 2. Initialize

```bash
aman init --local
```

For GitHub-backed storage (requires [GitHub CLI](https://cli.github.com/) authenticated):

```bash
aman init --github
```

## 3. Add your first asset

The CLI does not ship with pre-installed skills, prompts, or MCPs. Choose one:

**Import from a local folder** (canonical layout with `SKILL.md`, `PROMPT.md`, or `mcp.json`):

```bash
aman import ./path-to-assets --global
```

**Install from the registry** (after publishing or using a known slug):

```bash
aman install "@scope/asset-name@1.0.0" --global
```

**Publish your own asset to the local registry:**

```bash
aman registry publish ./path/to/skill-dir --slug "@you/my-skill" --version "1.0.0" --type skill
aman install "@you/my-skill@1.0.0" --global
```

Verify:

```bash
aman doctor
```

## 4. Browse and search

```bash
aman browse
aman search <query>
```

Interactive commands need a TTY. In scripts:

```bash
aman doctor
aman import ./assets --global
```

## 5. Export and back up

```bash
aman export --all
aman backup save
aman backup list
```

## Next steps

- [docs/ASSET-SPEC.md](./docs/ASSET-SPEC.md) — publish assets
- [docs/REGISTRY-SPEC.md](./docs/REGISTRY-SPEC.md) — registry contract
- `aman help` — full command list
