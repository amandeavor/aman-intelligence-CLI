import React, { useEffect, useState, useCallback } from 'react';
import { render, Box, Text, useApp, useInput } from 'ink';
import { CustomSelectInput } from '../ui/components/CustomSelect.js';
import TextInput from 'ink-text-input';
import { environmentService } from '../services/environment.service.js';
import { lockService } from '../services/lock.service.js';
import { exists } from '../storage/filesystem.js';
import { Narrator } from '../ui/components/Narrator.js';
import { Header } from '../ui/components/Header.js';
import { NarratorState } from '../types/index.js';
import { theme } from '../ui/theme.js';
import { execFileSync } from 'child_process';
import { useResponsiveLayout, MIN_COLUMNS, MIN_ROWS } from '../ui/layout.js';
import { TooSmallScreen } from '../ui/components/TooSmallScreen.js';
import { ProgressBar } from '../ui/animations/ProgressBar.js';
import { TransitionScreen } from '../ui/animations/TransitionScreen.js';

type SyncMode = 'loading' | 'done';

type SyncScreen =
  | 'checking'
  | 'not_connected_menu'
  | 'gh_cli_required'
  | 'mode_select'
  | 'repo_input'
  | 'setup_loading'
  | 'local_storage_info'
  | 'sync_loading'
  | 'done';

interface SyncAppProps {
  action: 'push' | 'pull';
}

function parseGitError(err: any): string {
  const stderr = err.stderr ? err.stderr.toString() : err.message || '';
  
  if (stderr.includes('Repository not found') || stderr.includes('does not exist')) {
    return 'GitHub Repository not found. Verify the repo name or run "gh repo create" to establish it.';
  }
  if (stderr.includes('Permission to') && stderr.includes('denied')) {
    return 'Permission denied. Ensure your GitHub CLI account has push access to this repository.';
  }
  if (stderr.includes('Authentication failed') || stderr.includes('Could not read from remote repository')) {
    return 'GitHub Authentication failed. Please run "gh auth login" to refresh your session.';
  }
  if (stderr.includes('detached HEAD')) {
    return 'Git is in a detached HEAD state. Run "git checkout main" manually in the environment directory first.';
  }
  if (stderr.includes('conflict') || stderr.includes('non-fast-forward') || stderr.includes('Updates were rejected')) {
    return 'Push conflict: remote changes exist. Run "aman sync pull" first to merge differences.';
  }
  if (stderr.includes('branch') && (stderr.includes('does not exist') || stderr.includes('not found'))) {
    return 'Target branch does not exist on the remote repository.';
  }
  if (stderr.includes('remote rejected')) {
    return 'Remote repository rejected the push. Check remote branch restrictions or permissions.';
  }
  if (stderr.includes('Could not resolve host') || stderr.includes('network') || stderr.includes('connection')) {
    return 'Network failure. Check your internet connection and try again.';
  }
  
  return stderr.trim() || 'Git operation failed';
}

export const SyncApp: React.FC<SyncAppProps & { onBack?: () => void }> = ({ action, onBack }) => {
  const { exit } = useApp();
  const { rows, isTooSmall, physicalColumns, physicalRows } = useResponsiveLayout();
  const [progress, setProgress] = useState(0);
  
  const handleExit = useCallback(() => {
    if (onBack) onBack();
    else exit();
  }, [onBack, exit]);

  const [screenState, setScreenState] = useState<SyncScreen>('checking');
  const [githubMode, setGithubMode] = useState<'create' | 'existing'>('create');
  const [repoName, setRepoName] = useState('');
  const [repoError, setRepoError] = useState<string | undefined>();
  const [setupState, setSetupState] = useState<NarratorState>('idle');
  const [setupMessage, setSetupMessage] = useState('');

  if (isTooSmall) {
    return <TooSmallScreen columns={physicalColumns} rows={physicalRows} minColumns={MIN_COLUMNS} minRows={MIN_ROWS} />;
  }

  const [mochiState, setMochiState] = useState<NarratorState>('searching');
  const [message, setMessage] = useState('');

  useInput((input, key) => {
    if (key.escape || input === 'q') {
      if (screenState === 'mode_select') {
        setScreenState('not_connected_menu');
      } else if (screenState === 'repo_input') {
        setScreenState('mode_select');
      } else if (screenState === 'gh_cli_required') {
        setScreenState('not_connected_menu');
      } else if (
        screenState === 'not_connected_menu' ||
        screenState === 'local_storage_info' ||
        screenState === 'done'
      ) {
        handleExit();
      }
    }
  });

  // Check connection on start
  useEffect(() => {
    if (screenState === 'checking') {
      const storage = environmentService.getStorage();
      if (storage.type === 'github' && storage.repository) {
        setScreenState('sync_loading');
      } else {
        setScreenState('not_connected_menu');
      }
    }
  }, [screenState]);

  // Handle local storage info auto-exit
  useEffect(() => {
    if (screenState === 'local_storage_info') {
      const t = setTimeout(() => handleExit(), 3000);
      return () => clearTimeout(t);
    }
  }, [screenState, handleExit]);

  async function handleSetupAndSync(repo: string) {
    setScreenState('setup_loading');
    setSetupState('installing');
    setSetupMessage(`Setting up GitHub repository: ${repo}...`);
    try {
      await environmentService.initGithub({ repository: repo, mode: githubMode });
      setSetupState('success');
      setSetupMessage('GitHub connected successfully! Starting sync...');
      setTimeout(() => {
        setScreenState('sync_loading');
      }, 1200);
    } catch (err: any) {
      setSetupState('error');
      setSetupMessage(`Setup failed: ${err.message}`);
      setTimeout(() => {
        handleExit();
      }, 2500);
    }
  }

  useEffect(() => {
    async function runSync() {
      try {
        setProgress(10);
        const storage = environmentService.getStorage();
        if (storage.type !== 'github' || !storage.repository) {
          setMochiState('error');
          setMessage('No GitHub storage configured.');
          setScreenState('done');
          setTimeout(() => handleExit(), 2000);
          return;
        }

        const repoDir = environmentService.getActiveEnvironmentDir();
        if (!exists(repoDir)) {
          setMochiState('error');
          setMessage(`Active environment directory does not exist: ${repoDir}`);
          setScreenState('done');
          setTimeout(() => handleExit(), 2000);
          return;
        }

        setProgress(25);
        // Verify git is installed and directory is git repo
        try {
          execFileSync('git', ['-C', repoDir, 'status'], { stdio: 'ignore' });
        } catch {
          // Initialize git repo if not already
          try {
            execFileSync('git', ['-C', repoDir, 'init'], { stdio: 'ignore' });
            execFileSync('git', ['-C', repoDir, 'remote', 'add', 'origin', `https://github.com/${storage.repository}.git`], { stdio: 'ignore' });
          } catch {
            setMochiState('error');
            setMessage('Git is not installed or configured correctly in the environment directory.');
            setScreenState('done');
            setTimeout(() => handleExit(), 2000);
            return;
          }
        }

        setProgress(35);
        // Read lockfile to count assets before sync
        const beforeLock = await lockService.read('global');
        const beforeSkills = beforeLock.assets.filter((a) => a.type === 'skill').length;
        const beforePrompts = beforeLock.assets.filter((a) => a.type === 'prompt').length;
        const beforeMcps = beforeLock.assets.filter((a) => a.type === 'mcp').length;

        if (action === 'push') {
          setMochiState('syncing');
          setMessage(`Pushing to ${storage.repository}...`);
          setProgress(50);

          try {
            execFileSync('git', ['-C', repoDir, 'add', '.'], { stdio: 'ignore' });
            // Check if there is anything to commit
            let hasChanges = true;
            try {
              execFileSync('git', ['-C', repoDir, 'diff', '--cached', '--quiet'], { stdio: 'ignore' });
              hasChanges = false;
            } catch {
              // diff returns non-zero when there are changes, so this is expected
            }

            setProgress(65);
            if (hasChanges) {
              const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
              execFileSync('git', ['-C', repoDir, 'commit', '-m', `Sync environment: ${timestamp}`], { stdio: 'ignore' });
            }

            setProgress(80);
            // Push origin main/master
            let pushSuccess = false;
            let lastErr: any = null;
            for (const branch of ['main', 'master']) {
              try {
                execFileSync('git', ['-C', repoDir, 'push', 'origin', branch], { stdio: 'pipe' });
                pushSuccess = true;
                break;
              } catch (err) {
                lastErr = err;
              }
            }

            if (!pushSuccess) {
              try {
                execFileSync('git', ['-C', repoDir, 'push', '-u', 'origin', 'HEAD'], { stdio: 'pipe' });
              } catch (err) {
                throw lastErr || err;
              }
            }

            setProgress(100);
            setMochiState('success');
            setMessage(
              `Synced ${beforeMcps} MCP${beforeMcps !== 1 ? 's' : ''}, ${beforePrompts} prompt${beforePrompts !== 1 ? 's' : ''}, ${beforeSkills} skill${beforeSkills !== 1 ? 's' : ''}`
            );
          } catch (err: any) {
            throw new Error(parseGitError(err));
          }
        } else if (action === 'pull') {
          setMochiState('syncing');
          setMessage(`Pulling from ${storage.repository}...`);
          setProgress(50);

          try {
            let pullSuccess = false;
            let lastErr: any = null;
            for (const branch of ['main', 'master']) {
              try {
                execFileSync('git', ['-C', repoDir, 'pull', '--rebase', 'origin', branch], { stdio: 'pipe' });
                pullSuccess = true;
                break;
              } catch (err) {
                lastErr = err;
              }
            }

            setProgress(80);
            if (!pullSuccess) {
              try {
                execFileSync('git', ['-C', repoDir, 'pull', '--rebase', 'origin', 'HEAD'], { stdio: 'pipe' });
              } catch (err) {
                throw lastErr || err;
              }
            }

            // Read lockfile again after pull
            const afterLock = await lockService.read('global');
            const afterSkills = afterLock.assets.filter((a) => a.type === 'skill').length;
            const afterPrompts = afterLock.assets.filter((a) => a.type === 'prompt').length;
            const afterMcps = afterLock.assets.filter((a) => a.type === 'mcp').length;

            setProgress(100);
            setMochiState('success');
            setMessage(
              `Pulled ${afterMcps} MCP${afterMcps !== 1 ? 's' : ''}, ${afterPrompts} prompt${afterPrompts !== 1 ? 's' : ''}, ${afterSkills} skill${afterSkills !== 1 ? 's' : ''}`
            );
          } catch (err: any) {
            throw new Error(parseGitError(err));
          }
        }

        setScreenState('done');
        setTimeout(() => handleExit(), 1500);
      } catch (err: any) {
        setProgress(0);
        setMochiState('error');
        setMessage(`Sync error: ${err.message}`);
        setScreenState('done');
        setTimeout(() => handleExit(), 2500);
      }
    }

    if (screenState === 'sync_loading') {
      runSync();
    }
  }, [screenState, action, handleExit]);

  if (screenState === 'checking') {
    return (
      <Box paddingX={1} height={rows} justifyContent="center" alignItems="center">
        <Narrator state="searching" message="Checking connection..." />
      </Box>
    );
  }

  if (screenState === 'not_connected_menu') {
    return (
      <Box flexDirection="column" paddingX={1} height={rows} justifyContent="space-between">
        <Box flexDirection="column">
          <Header compact />
          <Text bold color={theme.accent}>GitHub is not connected.</Text>
          <Box marginTop={1}>
            <CustomSelectInput
              items={[
                { label: 'Connect GitHub', value: 'connect' },
                { label: 'Use Local Storage Only', value: 'local' },
                { label: 'Back', value: 'back' },
              ]}
              onSelect={async (item) => {
                if (item.value === 'connect') {
                  if (!environmentService.isGithubCliAvailable()) {
                    setScreenState('gh_cli_required');
                  } else {
                    setScreenState('mode_select');
                  }
                } else if (item.value === 'local') {
                  setScreenState('local_storage_info');
                } else {
                  handleExit();
                }
              }}
            />
          </Box>
        </Box>
        <Box>
          <Text color={theme.dim}>press enter to select · esc exit</Text>
        </Box>
      </Box>
    );
  }

  if (screenState === 'gh_cli_required') {
    return (
      <Box flexDirection="column" paddingX={1} height={rows} justifyContent="space-between">
        <Box flexDirection="column">
          <Header compact />
          <Text bold color={theme.error}>GitHub CLI is required.</Text>
          <Box marginTop={1}>
            <Text>Please install it via https://cli.github.com or using your package manager:</Text>
          </Box>
          <Box flexDirection="column" marginTop={1} marginLeft={2}>
            <Text color={theme.secondary}>• Windows:  winget install GitHub.cli</Text>
            <Text color={theme.secondary}>• macOS:    brew install gh</Text>
            <Text color={theme.secondary}>• Linux:    sudo apt install gh</Text>
          </Box>
          <Box marginTop={1}>
            <CustomSelectInput
              items={[
                { label: 'Continue With Local Storage', value: 'local' },
                { label: 'Back', value: 'back' },
              ]}
              onSelect={async (item) => {
                if (item.value === 'local') {
                  setScreenState('setup_loading');
                  setSetupState('installing');
                  setSetupMessage('Configuring local folder...');
                  try {
                    await environmentService.initLocal({});
                    setSetupState('success');
                    setSetupMessage('Local environment initialized!');
                    setTimeout(() => {
                      setScreenState('local_storage_info');
                    }, 1200);
                  } catch (err: any) {
                    setSetupState('error');
                    setSetupMessage(`Setup failed: ${err.message}`);
                    setTimeout(() => {
                      handleExit();
                    }, 2500);
                  }
                } else {
                  setScreenState('not_connected_menu');
                }
              }}
            />
          </Box>
        </Box>
        <Box>
          <Text color={theme.dim}>press enter to select</Text>
        </Box>
      </Box>
    );
  }

  if (screenState === 'mode_select') {
    return (
      <Box flexDirection="column" paddingX={1} height={rows} justifyContent="space-between">
        <Box flexDirection="column">
          <Header compact />
          <Text bold color={theme.accent}>Connect GitHub</Text>
          <Box marginTop={1}>
            <CustomSelectInput
              items={[
                { label: 'Create New Repository', value: 'create' },
                { label: 'Use Existing Repository', value: 'existing' },
              ]}
              onSelect={(item) => {
                setGithubMode(item.value as 'create' | 'existing');
                setScreenState('repo_input');
              }}
            />
          </Box>
        </Box>
        <Box>
          <Text color={theme.dim}>press enter to select · esc go back</Text>
        </Box>
      </Box>
    );
  }

  if (screenState === 'repo_input') {
    return (
      <Box flexDirection="column" paddingX={1} height={rows} justifyContent="space-between">
        <Box flexDirection="column">
          <Header compact />
          <Text bold color={theme.accent}>
            {githubMode === 'existing' ? 'Which GitHub repo should aman use?' : 'Name your aman GitHub repo.'}
          </Text>
          <Box marginTop={1} flexDirection="row">
            <Text color={theme.primary}>Repository Name: </Text>
            <TextInput
              value={repoName}
              onChange={(val) => {
                setRepoName(val);
                setRepoError(undefined);
              }}
              placeholder={githubMode === 'existing' ? 'github-user/repo' : 'aman-environment'}
              onSubmit={async (val) => {
                const trimmed = val.trim();
                if (!trimmed) {
                  setRepoError('Enter a repository name to continue.');
                  return;
                }
                await handleSetupAndSync(trimmed);
              }}
            />
          </Box>
          {repoError && <Text color={theme.error}>{repoError}</Text>}
        </Box>
        <Box>
          <Text color={theme.dim}>press enter to submit · esc go back</Text>
        </Box>
      </Box>
    );
  }

  if (screenState === 'setup_loading') {
    return (
      <Box flexDirection="column" paddingX={1} height={rows} justifyContent="space-between">
        <Box flexDirection="column">
          <Header compact />
          <Narrator state={setupState} message={setupMessage} />
        </Box>
      </Box>
    );
  }

  if (screenState === 'local_storage_info') {
    return (
      <Box flexDirection="column" paddingX={1} height={rows} justifyContent="space-between">
        <Box flexDirection="column">
          <Header compact />
          <Text color={theme.warning}>Local storage does not support cloud sync.</Text>
          <Box marginTop={1}>
            <Text color={theme.dim}>Please connect a GitHub repository to enable push/pull workflows.</Text>
          </Box>
        </Box>
        <Box>
          <Text color={theme.dim}>press esc or q to exit</Text>
        </Box>
      </Box>
    );
  }

  if (screenState === 'sync_loading') {
    return (
      <Box flexDirection="column" paddingX={1} height={rows}>
        <Header compact />
        <Narrator state={mochiState} message={message} />
        <Box marginTop={1}>
          <ProgressBar progress={progress} />
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1} height={rows}>
      <Header compact />
      <Narrator state={mochiState} message={message} />
    </Box>
  );
};

export async function syncCommand(args: string[]) {
  const action = args[0] as 'push' | 'pull';
  if (action !== 'push' && action !== 'pull') {
    console.log('  Usage: aman sync <push|pull>');
    return;
  }

  if (!process.stdin.isTTY) {
    console.log(`  ◌ Non-interactive mode: executing sync ${action}...`);
    try {
      const storage = environmentService.getStorage();
      if (storage.type !== 'github' || !storage.repository) {
        console.log('  ✗ Sync error: No GitHub storage configured. Run "aman init" first.');
        process.exit(1);
      }
      const repoDir = environmentService.getActiveEnvironmentDir();
      
      if (action === 'push') {
        execFileSync('git', ['-C', repoDir, 'add', '.'], { stdio: 'ignore' });
        try {
          execFileSync('git', ['-C', repoDir, 'diff', '--cached', '--quiet'], { stdio: 'ignore' });
        } catch {
          const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
          execFileSync('git', ['-C', repoDir, 'commit', '-m', `Sync environment: ${timestamp}`], { stdio: 'ignore' });
        }

        let pushSuccess = false;
        let lastErr: any = null;
        for (const branch of ['main', 'master']) {
          try {
            execFileSync('git', ['-C', repoDir, 'push', 'origin', branch], { stdio: 'pipe' });
            pushSuccess = true;
            break;
          } catch (err) {
            lastErr = err;
          }
        }
        if (!pushSuccess && lastErr) {
          throw lastErr;
        }
        console.log(`  ✓ Synced environment to ${storage.repository}`);
      } else {
        let pullSuccess = false;
        let lastErr: any = null;
        for (const branch of ['main', 'master']) {
          try {
            execFileSync('git', ['-C', repoDir, 'pull', '--rebase', 'origin', branch], { stdio: 'pipe' });
            pullSuccess = true;
            break;
          } catch (err) {
            lastErr = err;
          }
        }
        if (!pullSuccess && lastErr) {
          throw lastErr;
        }
        console.log(`  ✓ Pulled environment changes from ${storage.repository}`);
      }
      return;
    } catch (err: any) {
      console.log(`  ✗ Sync error: ${parseGitError(err)}`);
      process.exit(1);
    }
  }

  const { waitUntilExit } = render(
    <TransitionScreen message={`Starting repository sync (${action})...`}>
      <SyncApp action={action} />
    </TransitionScreen>
  );
  await waitUntilExit();
}
