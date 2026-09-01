# Quick Start

Get from zero to your first installed asset in under five minutes.

## 1. Install the CLI

```bash
git clone https://github.com/amandeavor/Aman-CLI.git
cd Aman-CLI
npm ci
npm run build
npm link
```

Confirm:

```bash
aman --version
aman doctor
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

**Import from another tool** (interactive wizard):

```bash
aman import
```

**Import using shorthand CLI commands (Cursor / Antigravity / Windsurf)**:

```bash
aman import cursor --global         # Import rules and MCPs from Cursor
aman import antigravity --global    # Import plugins and MCPs from Antigravity
```

**Import from a local folder or another Aman environment**:

```bash
aman import ./path-to-assets --global
aman import --from aman-environment ../other-project --global
```

Full source list and guide: [docs/IMPORT-GUIDE.md](./docs/IMPORT-GUIDE.md).

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

Interactive commands need a TTY (recommended 80×24 or larger). In scripts:

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
