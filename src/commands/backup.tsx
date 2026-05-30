import React, { useEffect, useState } from 'react';
import { render, Box, Text, useApp, useInput } from 'ink';
import { backupService } from '../services/backup.service.js';
import { environmentService } from '../services/environment.service.js';
import { exists, listFiles } from '../storage/filesystem.js';
import { Confirm } from '../ui/components/Confirm.js';
import { Narrator } from '../ui/components/Narrator.js';
import { NarratorState } from '../types/index.js';
import { theme } from '../ui/theme.js';
import { getRelativeBackupDate, getBackupLabel } from '../ui/date.js';
import path from 'path';
import { ProgressBar } from '../ui/animations/ProgressBar.js';
import { TransitionScreen } from '../ui/animations/TransitionScreen.js';

type BackupMode = 'loading' | 'confirm_restore' | 'confirm_delete' | 'done';

interface BackupAppProps {
  subcmd: string;
  idOrName?: string;
  bypassConfirm?: boolean;
}

interface BackupInfo {
  id: string;
  skills: number;
  prompts: number;
  mcps: number;
  stacks: number;
}

export const BackupApp: React.FC<BackupAppProps & { onBack?: () => void }> = ({ subcmd, idOrName, bypassConfirm, onBack }) => {
  const { exit } = useApp();
  const handleExit = () => {
    if (onBack) onBack();
    else exit();
  };
  const [mode, setMode] = useState<BackupMode>(bypassConfirm ? 'loading' : 'loading');
  const [mochiState, setMochiState] = useState<NarratorState>('searching');
  const [message, setMessage] = useState('');
  const [list, setList] = useState<BackupInfo[]>([]);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    async function run() {
      try {
        if (subcmd === 'save') {
          setMochiState('searching');
          setMessage('Saving backup...');
          const actualId = await backupService.save(idOrName);
          setMochiState('success');
          setMessage(`Saved backup: ${actualId}`);
          setMode('done');
          setTimeout(() => exit(), 1000);
        } else if (subcmd === 'list') {
          setMochiState('searching');
          setMessage('Listing backups...');
          const ids = await backupService.list();
          const infos: BackupInfo[] = [];
          const baseDir = environmentService.getActiveEnvironmentDir();
          for (const id of ids) {
            const backupDir = path.join(baseDir, 'backups', id);
            const skills = exists(path.join(backupDir, 'skills')) ? (await listFiles(path.join(backupDir, 'skills'))).length : 0;
            const prompts = exists(path.join(backupDir, 'prompts')) ? (await listFiles(path.join(backupDir, 'prompts'))).length : 0;
            const mcps = exists(path.join(backupDir, 'mcps')) ? (await listFiles(path.join(backupDir, 'mcps'))).length : 0;
            const stacks = exists(path.join(backupDir, 'stacks')) ? (await listFiles(path.join(backupDir, 'stacks'))).length : 0;
            infos.push({ id, skills, prompts, mcps, stacks });
          }
          setList(infos);
          setMode('done');
        } else if (subcmd === 'restore') {
          if (!idOrName) {
            setMochiState('error');
            setMochiState('error');
            setMessage('Please provide a backup ID to restore.');
            setMode('done');
            setTimeout(() => handleExit(), 1500);
            return;
          }
          const baseDir = environmentService.getActiveEnvironmentDir();
          const backupDir = path.join(baseDir, 'backups', idOrName);
          if (!exists(backupDir)) {
            setMochiState('error');
            setMessage(`Backup not found: ${idOrName}`);
            setMode('done');
            setTimeout(() => handleExit(), 1500);
            return;
          }
          if (bypassConfirm) {
            setMochiState('installing');
            setMessage(`Restoring from ${idOrName}...`);
            await backupService.restore(idOrName, (p) => setProgress(p));
            setMochiState('success');
            setMessage(`Restored from ${idOrName}`);
            setMode('done');
            setTimeout(() => handleExit(), 1200);
          } else {
            setMode('confirm_restore');
          }
        } else if (subcmd === 'delete') {
          if (!idOrName) {
            setMochiState('error');
            setMessage('Please provide a backup ID to delete.');
            setMode('done');
            setTimeout(() => handleExit(), 1500);
            return;
          }
          const baseDir = environmentService.getActiveEnvironmentDir();
          const backupDir = path.join(baseDir, 'backups', idOrName);
          if (!exists(backupDir)) {
            setMochiState('error');
            setMessage(`Backup not found: ${idOrName}`);
            setMode('done');
            setTimeout(() => handleExit(), 1500);
            return;
          }
          if (bypassConfirm) {
            setMochiState('installing');
            setMessage(`Deleting backup ${idOrName}...`);
            await backupService.delete(idOrName);
            setMochiState('success');
            setMessage(`Backup deleted: ${idOrName}`);
            setMode('done');
            setTimeout(() => handleExit(), 1200);
          } else {
            setMode('confirm_delete');
          }
        } else {
          setMochiState('error');
          setMessage('Unknown backup command. Use save, list, restore, delete.');
          setMode('done');
          setTimeout(() => handleExit(), 1500);
        }
      } catch (err: any) {
        setMochiState('error');
        setMessage(`Error: ${err.message}`);
        setMode('done');
        setTimeout(() => handleExit(), 1500);
      }
    }
    if (mode === 'loading') {
      run();
    }
  }, [mode, subcmd, idOrName, handleExit, bypassConfirm]);

  useInput((input, key) => {
    if (key.escape || input === 'q') {
      handleExit();
    }
  });

  async function handleConfirmRestore() {
    setMode('loading');
    setMochiState('installing');
    setMessage(`Restoring from ${idOrName}...`);
    try {
      await backupService.restore(idOrName!, (p) => setProgress(p));
      setMochiState('success');
      setMessage(`Restored from ${idOrName}`);
    } catch (err: any) {
      setMochiState('error');
      setMessage(`Error: ${err.message}`);
    }
    setMode('done');
    setTimeout(() => handleExit(), 1200);
  }

  async function handleConfirmDelete() {
    setMode('loading');
    setMochiState('installing');
    setMessage(`Deleting backup ${idOrName}...`);
    try {
      await backupService.delete(idOrName!);
      setMochiState('success');
      setMessage(`Backup deleted: ${idOrName}`);
    } catch (err: any) {
      setMochiState('error');
      setMessage(`Error: ${err.message}`);
    }
    setMode('done');
    setTimeout(() => handleExit(), 1200);
  }

  if (mode === 'loading') {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Narrator state={mochiState} message={message} />
        {subcmd === 'restore' && mochiState === 'installing' && (
          <Box marginTop={1}>
            <ProgressBar progress={progress} />
          </Box>
        )}
      </Box>
    );
  }

  if (mode === 'confirm_restore') {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Confirm
          message={`Restore will replace your current environment. Continue?`}
          onConfirm={handleConfirmRestore}
          onCancel={() => handleExit()}
        />
      </Box>
    );
  }

  if (mode === 'confirm_delete') {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Confirm
          message={`Delete backup ${idOrName}?`}
          onConfirm={handleConfirmDelete}
          onCancel={() => handleExit()}
        />
      </Box>
    );
  }

  // Done or list view
  if (subcmd === 'list') {
    if (list.length === 0) {
      return (
        <Box flexDirection="column" paddingX={1}>
          <Text color={theme.dim}>No backups found.</Text>
        </Box>
      );
    }
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text bold color={theme.accent}>Backups:</Text>
        <Box flexDirection="column" marginTop={1}>
          {list.map((b) => {
            const parts = [];
            if (b.skills > 0) parts.push(`${b.skills} skill${b.skills > 1 ? 's' : ''}`);
            if (b.prompts > 0) parts.push(`${b.prompts} prompt${b.prompts > 1 ? 's' : ''}`);
            if (b.mcps > 0) parts.push(`${b.mcps} mcp${b.mcps > 1 ? 's' : ''}`);
            if (b.stacks > 0) parts.push(`${b.stacks} stack${b.stacks > 1 ? 's' : ''}`);
            const detailStr = parts.length > 0 ? parts.join(', ') : 'empty';
            return (
              <Box key={b.id} justifyContent="space-between" width={60}>
                <Text color={theme.primary}>{getBackupLabel(b.id)}</Text>
                <Text color={theme.dim}>{detailStr}</Text>
              </Box>
            );
          })}
        </Box>
        <Box marginTop={1}>
          <Text color={theme.dim}>Press esc or q to go back</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Narrator state={mochiState} message={message} />
    </Box>
  );
};

export async function backupCommand(args: string[], options?: any) {
  const subcmd = args[0] || 'list';
  const idOrName = args[1];
  const yes = Boolean(options?.yes || options?.y);

  if (!process.stdin.isTTY) {
    if (subcmd === 'list') {
      console.log('  Backups:');
      const ids = await backupService.list();
      if (ids.length === 0) console.log('    (none)');
      for (const id of ids) {
        console.log(`    - ${id}`);
      }
      return;
    }

    if (subcmd === 'save') {
      console.log('  ◌ Saving backup...');
      const id = await backupService.save(idOrName);
      console.log(`  ✓ Saved backup: ${id}`);
      return;
    }

    if (subcmd === 'restore') {
      if (!idOrName) {
        console.log('  ERROR: Please provide a backup ID to restore.');
        process.exit(1);
      }
      if (!yes) {
        console.log('  ERROR: Non-interactive TTY mode. Confirmation required. Run with --yes flag to bypass.');
        process.exit(1);
      }
      console.log(`  ◌ Restoring environment from ${idOrName}...`);
      await backupService.restore(idOrName);
      console.log(`  ✓ Restored environment from ${idOrName}`);
      return;
    }

    if (subcmd === 'delete') {
      if (!idOrName) {
        console.log('  ERROR: Please provide a backup ID to delete.');
        process.exit(1);
      }
      if (!yes) {
        console.log('  ERROR: Non-interactive TTY mode. Confirmation required. Run with --yes flag to bypass.');
        process.exit(1);
      }
      console.log(`  ◌ Deleting backup ${idOrName}...`);
      await backupService.delete(idOrName);
      console.log(`  ✓ Deleted backup ${idOrName}`);
      return;
    }

    console.log('  Unknown backup command. Use save, list, restore, delete.');
    return;
  }

  if (subcmd === 'save' || subcmd === 'restore') {
    const { waitUntilExit } = render(
      <TransitionScreen message={`Preparing backup operation (${subcmd})...`}>
        <BackupApp subcmd={subcmd} idOrName={idOrName} bypassConfirm={yes} />
      </TransitionScreen>
    );
    await waitUntilExit();
  } else {
    const { waitUntilExit } = render(<BackupApp subcmd={subcmd} idOrName={idOrName} bypassConfirm={yes} />);
    await waitUntilExit();
  }
}
