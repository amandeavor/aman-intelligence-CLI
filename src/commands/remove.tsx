import React, { useEffect, useState } from 'react';
import { render, Box, Text, useApp } from 'ink';
import { assetService } from '../services/asset.service.js';
import { Confirm } from '../ui/components/Confirm.js';
import { Narrator } from '../ui/components/Narrator.js';
import { AssetType, NarratorState, Scope } from '../types/index.js';
import { titleize } from '../ui/marketplaceDisplay.js';
import { ASSET_TAB_ORDER } from '../ui/assetDisplay.js';

interface RemoveAppProps {
  name: string;
  scope: Scope;
  skipConfirm: boolean;
}

const RemoveApp: React.FC<RemoveAppProps> = ({ name, scope, skipConfirm }) => {
  const { exit } = useApp();
  const [confirmed, setConfirmed] = useState(skipConfirm);
  const [state, setState] = useState<NarratorState>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!confirmed) return;

    async function doRemove() {
      setState('installing');
      setMessage(`Removing ${titleize(name)}...`);

      const types: AssetType[] = ['skill', 'prompt', 'mcp'];
      let removed = false;

      for (const t of types) {
        try {
          const result = await assetService.remove(name, t, scope);
          if (result) removed = true;
        } catch {
          // ignore
        }
      }

      if (removed) {
        setState('success');
        setMessage(`Removed ${titleize(name)} from ${scope === 'project' ? 'project' : 'global'}`);
      } else {
        setState('error');
        setMessage(`Could not find ${titleize(name)} in ${scope === 'project' ? 'project' : 'global'}`);
      }
      setTimeout(() => exit(), 800);
    }

    doRemove();
  }, [confirmed, exit, name, scope]);

  if (!confirmed) {
    return (
      <Box paddingX={1}>
        <Confirm
          message={`Remove ${titleize(name)}?`}
          onConfirm={() => setConfirmed(true)}
          onCancel={() => {
            console.log('  Cancelled.');
            exit();
          }}
        />
      </Box>
    );
  }

  return (
    <Box paddingX={1}>
      <Narrator state={state} message={message} />
    </Box>
  );
};

export async function removeCommand(args: string[], options: any) {
  const name = args.join(' ');
  if (!name) {
    console.log('  Usage: aman remove <name>');
    return;
  }

  const scope: Scope = options.project || options.p ? 'project' : 'global';
  let skipConfirm = Boolean(options.yes || options.y);

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    let removed = false;
    for (const type of ASSET_TAB_ORDER) {
      if (await assetService.remove(name, type, scope)) {
        removed = true;
      }
    }
    if (removed) {
      console.log(`Removed ${titleize(name)} from ${scope === 'project' ? 'project' : 'global'}`);
      return;
    }
    console.error(`Could not find ${titleize(name)} in ${scope === 'project' ? 'project' : 'global'}`);
    process.exit(1);
  }

  const { waitUntilExit } = render(<RemoveApp name={name} scope={scope} skipConfirm={skipConfirm} />);
  await waitUntilExit();
}
