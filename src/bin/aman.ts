#!/usr/bin/env node
import meow from 'meow';
import { CLI_VERSION } from '../cli/version.js';
import { printHelpText } from '../cli/help-text.js';
import { isAmanCliEntrypoint, runGlobalInstall } from '../cli/global-install.js';
import { ensureGlobalDirs } from '../config/paths.js';
import { dashboardCommand } from '../commands/dashboard.js';
import { browseCommand } from '../commands/browse.js';
import { searchCommand } from '../commands/search.js';
import { installCommand } from '../commands/install.js';
import { removeCommand } from '../commands/remove.js';
import { updateCommand } from '../commands/update.js';
import { importCommand } from '../commands/import.js';
import { exportCommand } from '../commands/export.js';
import { packCommand } from '../commands/pack.js';
import { stackCommand } from '../commands/stack.js';
import { backupCommand } from '../commands/backup.js';
import { doctorCommand } from '../commands/doctor.js';
import { configCommand } from '../commands/config.js';
import { helpCommand } from '../commands/help.js';
import { initCommand } from '../commands/init.js';
import { syncCommand } from '../commands/sync.js';
import { infoCommand } from '../commands/info.js';
import { registryCommand } from '../commands/registry.js';

const preArgs = process.argv.slice(2);
if (preArgs.includes('--version') || preArgs.includes('-v') || preArgs[0] === 'version') {
  console.log(CLI_VERSION);
  process.exit(0);
}
if (preArgs.length === 1 && (preArgs[0] === '--help' || preArgs[0] === '-h')) {
  printHelpText();
  process.exit(0);
}

// `npx aman-cli` (no subcommand) → global install; use `aman` afterward.
if (isAmanCliEntrypoint() && preArgs.length === 0) {
  runGlobalInstall();
  process.exit(0);
}

const cli = meow(
  `
  Usage
    $ aman <command> [options]
  
  Options
    --global, -g    Target global scope
    --project, -p   Target project scope
    --github        Initialize with GitHub storage
    --local         Initialize with local storage
    --repo          Repository name for GitHub init
    --path          Storage path for local init
    --format        Output format (json, yaml, zip)
    --all           Apply command to all installed items
    --type          Asset type: skill, prompt, or mcp
    --list, -l      List mode (browse)
    --json          JSON output (browse)
    --version, -v   Print CLI version
`,
  {
    importMeta: import.meta,
    flags: {
      global: { type: 'boolean', shortFlag: 'g' },
      project: { type: 'boolean', shortFlag: 'p' },
      type: { type: 'string' },
      list: { type: 'boolean', shortFlag: 'l' },
      json: { type: 'boolean' },
      github: { type: 'boolean' },
      local: { type: 'boolean' },
      existing: { type: 'boolean' },
      repo: { type: 'string' },
      repository: { type: 'string' },
      path: { type: 'string' },
      format: { type: 'string' },
      all: { type: 'boolean' },
      version: { type: 'boolean', shortFlag: 'v' },
      yes: { type: 'boolean', shortFlag: 'y' },
    },
  }
);

async function main() {
  await ensureGlobalDirs().catch(() => {});

  if (cli.flags.version) {
    console.log(CLI_VERSION);
    return;
  }

  const input = cli.input;
  const cmd = input[0];
  const args = input.slice(1);
  const options = cli.flags;

  switch (cmd) {
    case undefined:
      await dashboardCommand();
      break;
    case 'init':
      await initCommand(args, options);
      break;
    case 'browse':
      await browseCommand(args, options);
      break;
    case 'search':
      await searchCommand(args);
      break;
    case 'install':
      await installCommand(args, options);
      break;
    case 'remove':
      await removeCommand(args, options);
      break;
    case 'update':
      await updateCommand(args, options);
      break;
    case 'import':
      await importCommand(args, options);
      break;
    case 'export':
      await exportCommand(args, options);
      break;
    case 'pack':
      await packCommand(args, options);
      break;
    case 'stack':
      await stackCommand(args, options);
      break;
    case 'backup':
      await backupCommand(args, options);
      break;
    case 'doctor':
      await doctorCommand();
      break;
    case 'config':
      await configCommand(args);
      break;
    case 'sync':
      await syncCommand(args);
      break;
    case 'info':
      await infoCommand(args);
      break;
    case 'registry':
      await registryCommand(args, options);
      break;
    case 'help':
      await helpCommand();
      break;
    default:
      if (cmd) {
        console.error(`Unknown command: ${cmd}`);
      }
      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        printHelpText();
        process.exit(cmd ? 1 : 0);
      }
      await helpCommand();
      if (cmd) process.exit(1);
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Error: ${message}`);
  process.exit(1);
});
