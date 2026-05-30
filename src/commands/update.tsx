import React, { useEffect, useState } from 'react';
import { render, Box, Text, useApp } from 'ink';
import { assetService } from '../services/asset.service.js';
import { lockService } from '../services/lock.service.js';
import { marketplaceService } from '../services/marketplace.service.js';
import { Narrator } from '../ui/components/Narrator.js';
import { Header } from '../ui/components/Header.js';
import { NarratorState, Scope } from '../types/index.js';
import { theme } from '../ui/theme.js';
import { titleize } from '../ui/marketplaceDisplay.js';
import { Spinner } from '../ui/animations/Spinner.js';
import { TransitionScreen } from '../ui/animations/TransitionScreen.js';

interface UpdateAppProps {
  names: string[];
  scope: Scope;
}

interface UpdateResult {
  name: string;
  success: boolean;
}

const UpdateApp: React.FC<UpdateAppProps> = ({ names, scope }) => {
  const { exit } = useApp();
  const [results, setResults] = useState<UpdateResult[]>([]);
  const [current, setCurrent] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    async function doUpdate() {
      const updateResults: UpdateResult[] = [];

      for (const name of names) {
        setCurrent(name);
        const candidate = await marketplaceService.findInstallCandidate(name);

        if (!candidate) {
          updateResults.push({ name, success: false });
          setResults([...updateResults]);
          continue;
        }

        try {
          await assetService.install(candidate.name, candidate.type, scope, candidate.sourcePath, candidate.source);
          updateResults.push({ name, success: true });
        } catch {
          updateResults.push({ name, success: false });
        }
        setResults([...updateResults]);
      }

      setDone(true);
      setTimeout(() => exit(), 1000);
    }

    doUpdate();
  }, [exit, names, scope]);

  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Header compact />

      {results.map((r) => (
        <Text key={r.name}>
          <Text color={r.success ? theme.success : theme.error} bold>
            {r.success ? '✓' : '✗'}{' '}
          </Text>
          <Text>{titleize(r.name)}</Text>
          {!r.success && <Text color={theme.dim}> (source not found)</Text>}
        </Text>
      ))}

      {!done && current && (
        <Spinner label={`Updating ${titleize(current)}...`} />
      )}

      {done && (
        <Box marginTop={1}>
          <Text color={theme.dim}>
            Updated {passed}{failed > 0 ? `, failed ${failed}` : ''}
          </Text>
        </Box>
      )}
    </Box>
  );
};

async function installedNames(scope: Scope): Promise<string[]> {
  const lockfile = await lockService.read(scope);
  return lockfile.assets.map((entry) => entry.localName);
}

export async function updateCommand(args: string[], options: any = {}) {
  const scope: Scope = options.project || options.p ? 'project' : 'global';
  const specificName = args.find((arg) => !arg.startsWith('--'));

  let names: string[];

  if (specificName) {
    names = [specificName];
  } else {
    // No name = update all
    names = await installedNames(scope);
    if (names.length === 0) {
      console.log(`  No installed items in ${scope}.`);
      return;
    }
  }

  console.log(`  Updating ${names.length} item${names.length !== 1 ? 's' : ''}...\n`);
  const { waitUntilExit } = render(
    <TransitionScreen message="Scanning for updates...">
      <UpdateApp names={names} scope={scope} />
    </TransitionScreen>
  );
  await waitUntilExit();
}
