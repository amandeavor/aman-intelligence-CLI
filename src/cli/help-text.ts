import { CLI_VERSION } from './version.js';
import { MARKETPLACE_ENABLED } from '../config/features.js';

export function printHelpText(): void {
  const cacheSection = MARKETPLACE_ENABLED
    ? `  cache <cmd>         Marketplace cache status or clear

Cache:
  cache status        Show marketplace cache size and age
  cache clear         Clear marketplace discovery cache`
    : `  cache <cmd>         Discovery cache (coming in a future release)`;

  console.log(`aman ${CLI_VERSION} — package manager for AI workflow assets

Install globally (one command):
  npx aman-cli

Usage:
  aman <command> [options]

Commands:
  (none)              Open dashboard (interactive terminal required)
  init                Set up local or GitHub-backed storage
  browse              Browse skills, prompts, and MCPs
  search <query>      Search across asset types
  info <name>         View asset details
  install [ref]       Install asset or @scope/name@version from registry
  remove <name>       Remove an installed asset
  update [name]       Update installed assets
  import <source>     Import from GitHub URL, repo, local folder, or AI tool
                    Sources: claude-code, cursor, windsurf, continue,
                      vscode, github-copilot, codex, local-folder,
                      custom-path, aman-environment, antigravity
  export [name]       Export assets (--all, --type skill|prompt|mcp)
  pack <cmd>          Create, inspect, or install packs
  stack <cmd>         Manage workflow stacks
  sync <push|pull>    Sync environment with GitHub
  backup <cmd>        Save, list, restore, or delete backups
  doctor              Check environment health
  config <cmd>        Manage CLI settings
  registry <cmd>      Publish and query the canonical asset registry
  ${cacheSection}
  help                Show this help

Registry:
  registry publish    Publish an immutable asset version
  registry deprecate  Mark a version deprecated (still installable)
  registry list       List published versions for a slug
  registry search     Search published assets
  registry resolve    Show metadata for slug@version

Options:
  --global, -g        Target global scope (~/.aman)
  --project, -p       Target project scope (.aman/)
  --type              Asset type: skill, prompt, or mcp
  --version, -v       Print CLI version

Environment:
  AMAN_REGISTRY_BACKEND   Registry adapter: local (default) or github

Documentation:
  https://github.com/amandeavor/aman-intelligence-CLI#readme
`);
}
