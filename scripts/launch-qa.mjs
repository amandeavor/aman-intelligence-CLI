#!/usr/bin/env node
/**
 * Headless launch QA harness (run after `npm run build`).
 * Usage: node scripts/launch-qa.mjs
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'dist', 'bin', 'aman.js');
const qaHome = path.join(os.tmpdir(), `aman-qa-${Date.now()}`);
const results = [];

function run(label, args, env = {}, expectCode = 0) {
  const res = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    env: { ...process.env, HOME: qaHome, USERPROFILE: qaHome, ...env },
    encoding: 'utf-8',
    timeout: 120000,
  });
  const code = res.status ?? 1;
  const ok = expectCode === null ? true : code === expectCode;
  results.push({
    label,
    pass: ok,
    code,
    stdout: (res.stdout || '').slice(0, 400),
    stderr: (res.stderr || '').slice(0, 400),
  });
  return res;
}

fs.mkdirSync(qaHome, { recursive: true });

run('--version', ['--version']);
run('help (non-TTY)', ['help'], {}, 0);
run('doctor (no init)', ['doctor'], {}, null);
run('import missing scope', ['import', './skills'], {}, 1);
const emptyDir = path.join(qaHome, 'empty-import');
fs.mkdirSync(emptyDir, { recursive: true });
run('import empty dir', ['import', emptyDir, '--global'], {}, 0);

const corruptLockDir = path.join(qaHome, '.aman');
fs.mkdirSync(path.join(corruptLockDir, 'skills'), { recursive: true });
fs.writeFileSync(path.join(corruptLockDir, 'aman.lock'), '{ not json');
run('corrupt lockfile', ['doctor', '--global'], { HOME: qaHome }, null);

const reportPath = path.join(root, 'BRUTAL_QA_REPORT.generated.json');
fs.writeFileSync(reportPath, JSON.stringify({ qaHome, results }, null, 2));
console.log(`Wrote ${results.length} harness results to ${reportPath}`);
const failed = results.filter((r) => !r.pass);
console.log(failed.length ? `FAILED: ${failed.map((f) => f.label).join(', ')}` : 'All harness checks passed expected exit codes.');
