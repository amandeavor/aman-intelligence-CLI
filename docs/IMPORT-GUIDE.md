# Import Guide

Import skills, prompts, and MCPs from other AI tools into Aman’s canonical asset layout.

## Interactive wizard (TTY)

```bash
aman import
```

### Flow

1. **Choose source** — Select from 11 available sources: Claude Code, Cursor, Windsurf, Continue.dev, VS Code, GitHub Copilot, OpenAI Codex, local folder, custom path, another Aman Environment, or Antigravity. Unavailable sources are listed with a short reason.
2. **Scan** — Aman discovers assets and groups them by type (Skills, Prompts, MCPs).
3. **Selection** — For each type: import all, select specific items, or skip.
4. **Destination** — Local environment, or GitHub-backed environment **only if GitHub is configured** (automatically hidden otherwise).
5. **Scope** — Global (`~/.aman`) or project (`.aman/`).
6. **Conflict Resolution** — If name collisions are detected:
   - **Bulk Mode**: Select `Ask every time`, `Rename all` (appends `-imported`), `Skip all`, or `Replace all`.
   - **Per-Item Mode**: If `Ask every time` is chosen, decide to `Rename`, `Skip`, or `Replace` for each collision individually.
7. **Confirm** — Final summary displaying counts per type, destination, scope, and conflict resolutions before writing.

Keyboard: **Enter** select · **Esc** back · **q** quit · **Space** toggle items in multi-select mode.

## Non-TTY / scripted import

Headless imports can be run using the standard `--from` option or via shorthand positional syntax:

```bash
# Shorthand CLI syntax
aman import cursor --global
aman import windsurf --project
aman import antigravity --global
aman import continue --global --all

# Explicit --from syntax
aman import --from claude-code --all --global
aman import --from vscode --global
aman import --from codex --all --project
aman import --from github-copilot --global
aman import --from local-folder ./path --global
aman import --from aman-environment ../other-project --project
aman import --from antigravity --global
```

### Shorthand Resolution
When the first argument to `aman import` matches a known adapter ID (`cursor`, `windsurf`, `antigravity`, etc.), Aman automatically treats it as the `--from` source. If an additional path argument is provided (e.g., for `local-folder` or `aman-environment`), it will be correctly resolved as the scanning root path.

### CLI Flags

| Flag | Description |
|------|-------------|
| `--from <id>` | Source adapter: `claude-code`, `cursor`, `windsurf`, `continue`, `vscode`, `github-copilot`, `codex`, `local-folder`, `custom-path`, `aman-environment`, `antigravity` |
| `--global` / `-g` | Install to global scope (required in non-TTY) |
| `--project` / `-p` | Install to project scope |
| `--all` | Import all discovered assets (including lower-confidence items) |
| `--github` | Destination: GitHub-backed environment (fails if not configured) |
| `-y` / `--yes` | Skip interactive confirm (headless path) |

## What each source scans

### Antigravity
* **Skills**: Scan Antigravity global plugin directory (`~/.gemini/config/plugins/`) for skills. Extracts canonical skills from `skills/SKILL.md` under each installed plugin (e.g., `android-cli-plugin`).
* **MCPs**: Scan global Antigravity MCP config (`~/.gemini/config/mcp_config.json`) for MCP servers.

### Cursor
* **Skills**: Scan rules directories (`~/.cursor/rules/`, project `.cursor/rules/` for markdown instructions) and the project root `.cursorrules` file. Converts rules to canonical `SKILL.md` format.
* **MCPs**: Scan User `~/.cursor/mcp.json` and project workspace `.cursor/mcp.json` config files.

### Windsurf
* **Skills**: Scan rules directories (`~/.codeium/windsurf/rules/`, project `.windsurf/rules/`) and the project root `.windsurfrules` file. Converts rules to canonical `SKILL.md` format.
* **MCPs**: Scan User `~/.codeium/windsurf/mcp_config.json` and project workspace `.windsurf/mcp.json` configs.

### Continue.dev
* **Prompts**: Scan custom prompt templates in `~/.continue/prompts/*.prompt` and `~/.continue/prompts/*.md`.
* **Skills**: Scan custom documentation files in `~/.continue/docs/` and convert them to canonical skills.
* **MCPs**: Parse Continue's `~/.continue/config.json` (under `mcpServers` key) or `~/.continue/config.yaml`.

### Claude Code
* **Skills**: `~/.claude/skills/*/SKILL.md`, `.claude/skills/` in project.
* **Prompts**: `~/.claude/commands/*.md`, `.claude/commands/`.
* **MCPs**: `~/.claude.json`, project `.mcp.json`, `.claude/settings.local.json`.

### VS Code
* **MCPs**: User `mcp.json` (e.g., `%APPDATA%/Code/User/mcp.json` on Windows, or `~/.config/Code/User/mcp.json` on Linux) and workspace `.vscode/mcp.json`.

### GitHub Copilot
* **Prompts**: `.github/copilot-instructions.md`, `.github/instructions/*.md`.
* **MCPs**: `.vscode/mcp.json` (shared VS Code workspace config).

### OpenAI Codex
* **Skills**: `~/.codex/skills/*/SKILL.md`, project `.codex/skills/`.
* **MCPs**: `~/.codex/config.toml` (`[mcp_servers.*]`), project `.codex/config.toml`.

### Aman Environment
* **All Assets**: Enter the path to another Aman environment folder. Scans the environment's `skills/`, `prompts/`, and `mcps/` directories, validating the presence of the `aman.json` manifest. Fully retains prior asset structure and generates missing metadata.

### Local folder / custom path
Uses Aman’s classification engine on any general directory path. Assets are identified by heuristics. Ambiguous files are marked **ambiguous** in the wizard.

---

## Provenance Tracking

Every asset imported into Aman receives a canonical `provenance` metadata record, permanently tracking its origins. This is saved directly into the asset's local `metadata.json`:

```json
{
  "provenance": {
    "tool": "cursor",
    "sourcePath": "/Users/name/.cursor/rules/go-instructions.md",
    "importedAt": "2026-05-30T16:00:00.000Z"
  }
}
```

Aman lockfiles (`aman.lock`) also record imported assets using a unified source reference structure:
* `source.kind`: `'import'`
* `source.resolved`: `import:cursor:~/.cursor/rules/go-instructions.md`

This guarantees complete traceability for all migrated configurations.

---

## MCP Secret Separation

When importing Model Context Protocol (MCP) servers, Aman protects credentials and API keys by parsing the config's `env` section:

1. **Scan**: Searches for environment keys that match secret-like names (e.g., `token`, `key`, `secret`, `password`, `auth`, etc.) or values containing long opaque strings.
2. **Scaffold**: Extracts the actual secret values into a gitignored, local-only `mcp.local.json` file inside the asset directory.
3. **Placeholder**: Replaces the values in the portable `mcp.json` configuration file with environment placeholders (e.g., `${MY_SECRET_KEY}`).

This ensures that imported MCP configs are fully safe for sharing or syncing via GitHub.

---

## Safety and Rollback

* **Atomic Batching**: If import execution fails mid-process, Aman executes a complete atomic rollback, cleanly removing any assets written during that specific run.
* **Layout Safeguards**: Paths are fully sanitized against traversal or symlink escape attempts before installation.
* **Terminal Size**: The TTY wizard runs responsive layouts down to **70×20** columns/rows. Below this size, it displays an informative message rather than crashing.

