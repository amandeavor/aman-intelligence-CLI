import React, { useEffect, useState } from 'react';
import { render, Box, Text, useApp, useInput } from 'ink';
import { CustomSelectInput } from '../ui/components/CustomSelect.js';
import TextInput from 'ink-text-input';
import { environmentService } from '../services/environment.service.js';
import { Header } from '../ui/components/Header.js';
import { Narrator } from '../ui/components/Narrator.js';
import { theme } from '../ui/theme.js';

export type GithubMode = 'create' | 'existing';

export type InitResult =
  | { action: 'local' }
  | { action: 'github'; repository: string; mode: GithubMode }
  | { action: 'exit' };

export interface InitFlowProps {
  startWithGithub?: boolean;
  repository?: string;
  githubMode?: GithubMode;
  exitOnDone?: boolean;
  onDone: (result: InitResult) => void;
}

const storageItems = [
  { label: 'GitHub (recommended)', value: 'github' },
  { label: 'Local only', value: 'local' },
];

const githubModeItems = [
  { label: 'Create a new private repo', value: 'create' },
  { label: 'Use an existing repo', value: 'existing' },
];

export const InitFlow: React.FC<InitFlowProps> = ({
  startWithGithub,
  repository,
  githubMode = 'create',
  exitOnDone = true,
  onDone,
}) => {
  const { exit } = useApp();
  const [screen, setScreen] = useState<'storage' | 'githubMode' | 'repo'>(startWithGithub ? 'githubMode' : 'storage');
  const [selectedGithubMode, setSelectedGithubMode] = useState<GithubMode>(githubMode);
  const [repoValue, setRepoValue] = useState(repository || '');
  const [repoError, setRepoError] = useState<string | undefined>();

  const finish = (result: InitResult) => {
    onDone(result);
    if (exitOnDone) {
      exit();
    }
  };

  useInput((input, key) => {
    if (input === 'q') {
      finish({ action: 'exit' });
      return;
    }
    if (key.escape) {
      if (screen === 'repo') {
        setScreen('githubMode');
      } else if (screen === 'githubMode') {
        if (startWithGithub) {
          finish({ action: 'exit' });
        } else {
          setScreen('storage');
        }
      } else if (screen === 'storage') {
        finish({ action: 'exit' });
      }
    }
  });

  useEffect(() => {
    if (repository && screen === 'githubMode') {
      finish({ action: 'github', repository, mode: githubMode });
    }
  }, [githubMode, repository, screen]);

  if (screen === 'storage') {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Header compact />
        <Text>Where should aman store your environment?</Text>
        <Text color={theme.dim}>GitHub syncs and backs up your environment.</Text>
        <Box marginTop={1}>
          <CustomSelectInput
            items={storageItems}
            onSelect={(item) => {
              if (item.value === 'github') setScreen('githubMode');
              if (item.value === 'local') finish({ action: 'local' });
            }}
          />
        </Box>
      </Box>
    );
  }

  if (screen === 'githubMode') {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Header compact />
        <Text>How should aman connect to GitHub?</Text>
        <Box marginTop={1}>
          <CustomSelectInput
            items={githubModeItems}
            onSelect={(item) => {
              setSelectedGithubMode(item.value as GithubMode);
              setScreen('repo');
            }}
          />
        </Box>
      </Box>
    );
  }

  if (screen === 'repo') {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Header compact />
        <Text>{selectedGithubMode === 'existing' ? 'Which GitHub repo should aman use?' : 'Name your aman GitHub repo.'}</Text>
        <Box marginTop={1}>
          <Text color={theme.primary}>{'> '}</Text>
          <TextInput
            value={repoValue}
            onChange={(value) => {
              setRepoValue(value);
              setRepoError(undefined);
            }}
            placeholder={selectedGithubMode === 'existing' ? 'github-user/repo' : 'aman-environment'}
            onSubmit={(value) => {
              const trimmed = value.trim();
              if (!trimmed) {
                setRepoError('Enter a repository name to continue.');
                return;
              }
              finish({ action: 'github', repository: trimmed, mode: selectedGithubMode });
            }}
          />
        </Box>
        {repoError && (
          <Text color={theme.error}>{repoError}</Text>
        )}
      </Box>
    );
  }

  return null;
};

async function renderInitFlow(options: Omit<InitFlowProps, 'onDone'> = {}): Promise<InitResult> {
  let result: InitResult = { action: 'exit' };
  const { waitUntilExit } = render(<InitFlow {...options} onDone={(nextResult) => { result = nextResult; }} />);
  await waitUntilExit();
  return result;
}

async function completeLocalInit(storagePath?: string): Promise<void> {
  console.log('  ◌ Setting up local environment...');
  const environmentPath = await environmentService.initLocal({ storagePath });
  console.log(`  ✓ Environment ready: ${environmentPath}`);
  console.log('');
  console.log('  Next: aman browse');
}

async function completeGithubInit(repository: string, mode: GithubMode): Promise<void> {
  if (!environmentService.isGithubCliAvailable()) {
    console.log('  ◌ Installing GitHub CLI...');
    environmentService.installGithubCli();
    console.log('  ✓ GitHub CLI ready.');
  }

  console.log(`  ◌ Setting up GitHub environment: ${repository}`);
  const environmentPath = await environmentService.initGithub({ repository, mode });
  console.log(`  ✓ Environment ready: ${environmentPath}`);
  console.log('');
  console.log('  Next: aman browse');
}

async function completeInitResult(result: InitResult, options: any): Promise<void> {
  if (result.action === 'exit') {
    console.log('  Setup paused. Run aman init when ready.');
    return;
  }

  if (result.action === 'local') {
    await completeLocalInit(options.path);
    return;
  }

  await completeGithubInit(result.repository, result.mode);
}

export async function initCommand(args: string[], options: any): Promise<void> {
  const wantsGithub = Boolean(options.github);
  const wantsLocal = Boolean(options.local);

  if (wantsGithub && wantsLocal) {
    console.log('  Choose either --github or --local, not both.');
    return;
  }

  if (wantsLocal) {
    await completeLocalInit(options.path || args[0]);
    return;
  }

  if (!process.stdin.isTTY && !wantsGithub && !wantsLocal) {
    console.log('  Non-interactive mode detected. Initializing local storage by default...');
    await completeLocalInit(options.path || args[0]);
    return;
  }

  if (wantsGithub) {
    const repository = options.repo || options.repository || args[0];
    const mode: GithubMode = options.existing ? 'existing' : 'create';
    const result = await renderInitFlow({ startWithGithub: true, repository, githubMode: mode });
    await completeInitResult(result, options);
    return;
  }

  const result = await renderInitFlow();
  await completeInitResult(result, options);
}
