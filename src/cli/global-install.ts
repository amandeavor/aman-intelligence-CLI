import { spawnSync } from 'child_process';
import path from 'path';
import { CLI_VERSION } from './version.js';

/** True when the process was started via the `aman-cli` bin (e.g. `npx aman-cli`). */
export function isAmanCliEntrypoint(): boolean {
  const bin = path.basename(process.argv[1] ?? '');
  return bin === 'aman-cli' || bin === 'aman-cli.cmd' || bin === 'aman-cli.ps1';
}

/**
 * Installs this package globally so users can run `aman` from any directory.
 * Invoked by `npx aman-cli` with no subcommand.
 */
export function runGlobalInstall(): void {
  if (process.env.AMAN_SKIP_GLOBAL_INSTALL === '1') {
    console.log('AMAN_SKIP_GLOBAL_INSTALL=1 — skipping global install.');
    return;
  }

  console.log(`\n  Installing aman ${CLI_VERSION} globally…\n`);

  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npm, ['install', '-g', `aman-cli@${CLI_VERSION}`], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  });

  if (result.status !== 0) {
    console.error('\n  Global install failed.');
    console.error('  Try manually: npm install -g aman-cli\n');
    process.exit(result.status === null ? 1 : result.status);
  }

  console.log('\n  ✓ aman is installed globally.\n');
  console.log('  Next steps:');
  console.log('    aman init --local');
  console.log('    aman install caveman --global');
  console.log('    aman doctor\n');
}
