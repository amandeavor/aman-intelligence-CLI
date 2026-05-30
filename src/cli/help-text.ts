import { CLI_VERSION } from './version.js';

export function printHelpText(): void {
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
  import <source>     Import from GitHub URL, repo, or local folder
  export [name]       Export assets (--all, --type skill|prompt|mcp)
  pack <cmd>          Create, inspect, or install packs
  stack <cmd>         Manage workflow stacks
  sync <push|pull>    Sync environment with GitHub
  backup <cmd>        Save, list, restore, or delete backups
  doctor              Check environment health
  config <cmd>        Manage CLI settings
  registry <cmd>      Publish and query the canonical asset registry
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
  https://github.com/aman-intelligence/aman-cli#readme
`);
}
