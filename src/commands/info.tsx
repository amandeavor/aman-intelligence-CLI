import React, { useEffect, useState } from 'react';
import { render, Box, Text, useApp, useInput } from 'ink';
import { CustomSelectInput } from '../ui/components/CustomSelect.js';
import { marketplaceService } from '../services/marketplace.service.js';
import { assetService } from '../services/asset.service.js';
import { ScopePrompt } from '../ui/components/ScopePrompt.js';
import { Narrator } from '../ui/components/Narrator.js';
import { Header } from '../ui/components/Header.js';
import { NarratorState, ProviderResult, Scope, AssetType } from '../types/index.js';
import { theme } from '../ui/theme.js';
import { metadataParts, titleize } from '../ui/marketplaceDisplay.js';
import { assetTypeBadge, ASSET_TYPES } from '../ui/assetDisplay.js';

type InfoMode = 'loading' | 'detail' | 'scope' | 'installing' | 'done';

interface InfoAppProps {
  name: string;
}

function normalizeLookupName(value: string): string {
  return value.toLowerCase().replace(/[\s_]+/g, '-');
}

async function findAssetByName(name: string): Promise<ProviderResult | null> {
  const normalized = normalizeLookupName(name);

  for (const type of ASSET_TYPES) {
    for (const scope of ['global', 'project'] as const) {
      const installed = await assetService.list(type, scope);
      const match = installed.find((i) => normalizeLookupName(i.name) === normalized);
      if (match) {
        return {
          type,
          name: match.name,
          source: match.source || scope,
          description: match.description,
          tags: match.tags,
          version: match.version,
          organization: match.organization,
          installed: true,
          confidence: 1,
          slug: match.slug,
        };
      }
    }
  }

  const marketplaceResults = await marketplaceService.search(name);
  const exact = marketplaceResults.find((r) => normalizeLookupName(r.name) === normalized);
  if (exact) {
    for (const scope of ['global', 'project'] as const) {
      const installed = await assetService.list(exact.type, scope);
      if (installed.some((i) => i.name === exact.name)) {
        exact.installed = true;
        break;
      }
    }
    return exact;
  }

  const candidate = await marketplaceService.findInstallCandidate(name);
  if (candidate) {
    return {
      type: candidate.type,
      name: candidate.name,
      source: candidate.source,
      sources: candidate.sources,
      description: candidate.description,
      tags: candidate.tags,
      category: candidate.category,
      installs: candidate.installs,
      rating: candidate.rating,
      updated: candidate.updated,
      version: candidate.version,
      organization: candidate.organization,
      installed: candidate.installed,
      confidence: 1,
    };
  }

  return null;
}

const InfoApp: React.FC<InfoAppProps> = ({ name }) => {
  const { exit } = useApp();
  const [item, setItem] = useState<ProviderResult | null>(null);
  const [mode, setMode] = useState<InfoMode>('loading');
  const [mochiState, setMochiState] = useState<NarratorState>('searching');
  const [message, setMessage] = useState(`Looking up ${name}...`);

  useInput((input) => {
    if (input === 'q') exit();
  });

  useEffect(() => {
    async function lookup() {
      const exact = await findAssetByName(name);

      if (!exact) {
        setMochiState('error');
        setMessage(`Could not find asset "${name}" (skill, prompt, or MCP)`);
        setMode('done');
        setTimeout(() => exit(), 1500);
        return;
      }

      setItem(exact);
      setMode('detail');
    }
    lookup();
  }, [exit, name]);

  async function doInstall(scope: Scope) {
    if (!item) return;
    setMode('installing');
    setMochiState('installing');
    setMessage(`Installing ${assetTypeBadge(item.type)} ${titleize(item.name)}...`);

    try {
      const candidate = await marketplaceService.findInstallCandidate(item.name);
      if (candidate && candidate.type === item.type) {
        await assetService.install(candidate.name, candidate.type, scope, candidate.sourcePath, candidate.source);
      } else {
        await assetService.install(item.name, item.type, scope, undefined, item.source || 'local');
      }
      setMochiState('success');
      setMessage(`Installed ${assetTypeBadge(item.type)} ${titleize(item.name)} → ${scope === 'project' ? 'project' : 'global'}`);
    } catch (err: any) {
      setMochiState('error');
      setMessage(`Error: ${err.message}`);
    }
    setMode('done');
    setTimeout(() => exit(), 1000);
  }

  if (mode === 'loading') {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Narrator state={mochiState} message={message} />
      </Box>
    );
  }

  if (mode === 'installing' || mode === 'done') {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Narrator state={mochiState} message={message} />
      </Box>
    );
  }

  if (mode === 'scope' && item) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text bold>
          {assetTypeBadge(item.type)} {titleize(item.name)}
        </Text>
        <Box marginTop={1}>
          <ScopePrompt onSelect={(s) => doInstall(s)} />
        </Box>
      </Box>
    );
  }

  if (mode === 'detail' && item) {
    const actions = item.installed
      ? [{ label: 'Back', value: 'back' }]
      : [
          { label: 'Install', value: 'install' },
          { label: 'Back', value: 'back' },
        ];

    return (
      <Box flexDirection="column" paddingX={1}>
        <Header compact />

        <Text bold>
          {assetTypeBadge(item.type)} {titleize(item.name)}
        </Text>
        {item.installed && <Text color={theme.success}>installed</Text>}

        {item.description && (
          <Box marginTop={1}>
            <Text color={theme.secondary}>{item.description}</Text>
          </Box>
        )}

        <Box marginTop={1} flexDirection="column">
          {metadataParts(item).map((part, i) => (
            <Text key={i} color={theme.dim}>
              {part}
            </Text>
          ))}
          {item.tags && item.tags.length > 0 && <Text color={theme.dim}>Tags: {item.tags.join(', ')}</Text>}
          {item.category && <Text color={theme.dim}>Category: {item.category}</Text>}
          {item.organization && <Text color={theme.dim}>Author: {item.organization}</Text>}
        </Box>

        <Box marginTop={1}>
          <CustomSelectInput
            items={actions}
            onSelect={(a) => {
              if (a.value === 'install') setMode('scope');
              if (a.value === 'back') exit();
            }}
          />
        </Box>
      </Box>
    );
  }

  return null;
};

export async function infoCommand(args: string[]) {
  const name = args.join(' ');
  if (!name) {
    console.log('  Usage: aman info <name>');
    console.log('  Works for skills, prompts, and MCPs (installed or marketplace).');
    return;
  }

  const { waitUntilExit } = render(<InfoApp name={name} />);
  await waitUntilExit();
}
