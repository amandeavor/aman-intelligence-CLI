import React, { useEffect, useMemo, useState } from 'react';
import { render, Box, Text, useApp, useInput } from 'ink';
import { CustomSelectInput } from '../ui/components/CustomSelect.js';
import TextInput from 'ink-text-input';
import { marketplaceService } from '../services/marketplace.service.js';
import { assetService } from '../services/asset.service.js';
import { ProviderResult, NarratorState, Scope, AssetType } from '../types/index.js';
import { Header } from '../ui/components/Header.js';
import { Narrator } from '../ui/components/Narrator.js';
import { ScopePrompt } from '../ui/components/ScopePrompt.js';
import { theme } from '../ui/theme.js';
import { useResponsiveLayout, MIN_COLUMNS, MIN_ROWS } from '../ui/layout.js';
import { TooSmallScreen } from '../ui/components/TooSmallScreen.js';
import { metadataParts, shortDescription, titleize } from '../ui/marketplaceDisplay.js';
import {
  ASSET_TAB_ORDER,
  ASSET_TYPE_PLURAL,
  assetTypeBadge,
  groupResultsByType,
  matchesAssetSearch,
} from '../ui/assetDisplay.js';
import { TransitionScreen } from '../ui/animations/TransitionScreen.js';

type SearchMode = 'input' | 'results' | 'detail' | 'scope' | 'installing' | 'done';

export const SearchApp = ({ onBack, initialQuery = '' }: { onBack?: () => void; initialQuery?: string }) => {
  const { exit } = useApp();
  const handleExit = () => {
    if (onBack) onBack();
    else exit();
  };

  const { rows, isTooSmall, isCompact, canShowDescriptions, physicalColumns, physicalRows } = useResponsiveLayout();
  const pageSize = Math.max(1, rows - (canShowDescriptions ? 14 : 9));

  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<ProviderResult[]>([]);
  const [flatResults, setFlatResults] = useState<ProviderResult[]>([]);
  const [cursor, setCursor] = useState(0);
  const [mode, setMode] = useState<SearchMode>(initialQuery ? 'results' : 'input');
  const [mochiState, setMochiState] = useState<NarratorState>('searching');
  const [message, setMessage] = useState('Searching...');
  const [loading, setLoading] = useState(Boolean(initialQuery));

  async function performSearch(searchQuery: string) {
    if (!searchQuery.trim()) return;
    setLoading(true);
    setCursor(0);
    setMochiState('searching');
    setMessage('Searching assets...');

    try {
      const found = await marketplaceService.search(searchQuery);

      const installedByType: Record<AssetType, Set<string>> = {
        skill: new Set(),
        prompt: new Set(),
        mcp: new Set(),
      };

      for (const type of ASSET_TAB_ORDER) {
        const global = await assetService.list(type, 'global');
        const project = await assetService.list(type, 'project');
        for (const item of [...global, ...project]) {
          installedByType[type].add(item.name);
        }
      }

      const filtered = found.filter((r) => matchesAssetSearch(r, searchQuery));

      for (const r of filtered) {
        if (installedByType[r.type].has(r.name)) {
          r.installed = true;
        }
      }

      const grouped = groupResultsByType(filtered);
      const flat: ProviderResult[] = [];
      for (const type of ASSET_TAB_ORDER) {
        flat.push(...grouped[type]);
      }

      setResults(filtered);
      setFlatResults(flat);
      setMode('results');
    } catch {
      setResults([]);
      setFlatResults([]);
      setMode('results');
    }
    setLoading(false);
  }

  useEffect(() => {
    if (initialQuery) {
      performSearch(initialQuery);
    }
  }, [initialQuery]);

  const visibleItems = useMemo(() => {
    const total = flatResults.length;
    if (total === 0) return [];
    const half = Math.floor(pageSize / 2);
    const start = Math.max(0, Math.min(cursor - half, Math.max(0, total - pageSize)));
    return flatResults.slice(start, start + pageSize).map((item, idx) => ({
      item,
      index: start + idx,
    }));
  }, [cursor, flatResults, pageSize]);

  const focusedItem = flatResults[cursor];

  useInput((input, key) => {
    if (input === 'q') {
      handleExit();
      return;
    }

    if (mode === 'input') {
      if (key.escape) handleExit();
      return;
    }

    if (mode === 'results') {
      if (key.escape || key.backspace || key.delete) {
        setMode('input');
        return;
      }
      if (key.upArrow) {
        setCursor((p) => Math.max(0, p - 1));
        return;
      }
      if (key.downArrow) {
        setCursor((p) => Math.min(flatResults.length - 1, p + 1));
        return;
      }
      if (key.return && focusedItem) {
        setMode('detail');
        return;
      }
    }

    if (mode === 'detail') {
      if (key.escape || input === 'b') {
        setMode('results');
        return;
      }
    }
  });

  async function doInstall(scope: Scope) {
    if (!focusedItem) return;
    setMode('installing');
    setMochiState('installing');
    setMessage(`Installing ${titleize(focusedItem.name)}...`);

    try {
      const candidate = await marketplaceService.findInstallCandidate(focusedItem.name);
      if (!candidate) throw new Error('Not found');
      await assetService.install(
        candidate.name,
        candidate.type,
        scope,
        candidate.sourcePath,
        candidate.source
      );
      setMochiState('success');
      setMessage(
        `Installed ${assetTypeBadge(candidate.type)} ${titleize(focusedItem.name)} → ${scope === 'project' ? 'project' : 'global'}`
      );
    } catch (err: any) {
      setMochiState('error');
      setMessage(`Error: ${err.message}`);
    }
    setMode('done');
    setTimeout(() => handleExit(), 1000);
  }

  if (isTooSmall) {
    return (
      <TooSmallScreen
        columns={physicalColumns}
        rows={physicalRows}
        minColumns={MIN_COLUMNS}
        minRows={MIN_ROWS}
      />
    );
  }

  if (mode === 'input') {
    return (
      <Box flexDirection="column" paddingX={1} height={rows} justifyContent="space-between">
        <Box flexDirection="column">
          <Header compact />
          <Text bold color={theme.accent}>Search Assets</Text>
          <Text color={theme.dim}>Search skills, prompts, and MCPs by name, description, or tags</Text>
          <Box marginTop={1} flexDirection="row">
            <Text color={theme.primary}>❯ </Text>
            <TextInput
              value={query}
              onChange={setQuery}
              onSubmit={(val) => performSearch(val)}
              placeholder="Type search query... (e.g. react, github)"
            />
          </Box>
        </Box>
        <Box>
          <Text color={theme.dim}>press enter to search · esc go back</Text>
        </Box>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box flexDirection="column" paddingX={1} height={rows} justifyContent="space-between">
        <Box flexDirection="column">
          <Header compact />
          <Narrator state="searching" message="Searching..." />
        </Box>
        <Box>
          <Text color={theme.dim}>Please wait...</Text>
        </Box>
      </Box>
    );
  }

  if (mode === 'installing' || mode === 'done') {
    return (
      <Box flexDirection="column" paddingX={1} height={rows} justifyContent="space-between">
        <Box flexDirection="column">
          <Narrator state={mochiState} message={message} />
        </Box>
        <Box>
          <Text color={theme.dim}>Please wait...</Text>
        </Box>
      </Box>
    );
  }

  if (mode === 'scope') {
    return (
      <Box flexDirection="column" paddingX={1} height={rows} justifyContent="space-between">
        <Box flexDirection="column">
          <Text bold>
            {focusedItem ? `${assetTypeBadge(focusedItem.type)} ${titleize(focusedItem.name)}` : ''}
          </Text>
          <Box marginTop={1}>
            <ScopePrompt onSelect={(s) => doInstall(s)} />
          </Box>
        </Box>
        <Box>
          <Text color={theme.dim}>Select installation scope · esc cancel</Text>
        </Box>
      </Box>
    );
  }

  if (mode === 'detail' && focusedItem) {
    const detailActions = [
      { label: 'Install', value: 'install' },
      { label: 'Back', value: 'back' },
    ];

    return (
      <Box flexDirection="column" paddingX={1} height={rows} justifyContent="space-between">
        <Box flexDirection="column">
          <Header compact />
          <Text bold>
            {assetTypeBadge(focusedItem.type)} {titleize(focusedItem.name)}
          </Text>
          {focusedItem.description && (
            <Text color={theme.secondary}>{focusedItem.description}</Text>
          )}
          <Box marginTop={1} flexDirection="column">
            {metadataParts(focusedItem).map((part, i) => (
              <Text key={i} color={theme.dim}>
                {part}
              </Text>
            ))}
            {focusedItem.tags && focusedItem.tags.length > 0 && (
              <Text color={theme.dim}>Tags: {focusedItem.tags.join(', ')}</Text>
            )}
            {focusedItem.installed && <Text color={theme.success}>installed</Text>}
          </Box>
          <Box marginTop={1}>
            <CustomSelectInput
              items={detailActions}
              onSelect={(item) => {
                if (item.value === 'install') setMode('scope');
                if (item.value === 'back') setMode('results');
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

  const grouped = groupResultsByType(results);

  return (
    <Box flexDirection="column" paddingX={1} height={rows} justifyContent="space-between">
      <Box flexDirection="column">
        <Header compact />
        <Text color={theme.dim}>
          {results.length} result{results.length !== 1 ? 's' : ''} · MCPs {grouped.mcp.length} · Prompts{' '}
          {grouped.prompt.length} · Skills {grouped.skill.length}
        </Text>
        <Text>{' '}</Text>

        <Box flexDirection="column" height={pageSize}>
          {visibleItems.length === 0 ? (
            <Text color={theme.dim}>No results found.</Text>
          ) : (
            visibleItems.map(({ item, index }) => {
              const isCurrent = index === cursor;
              const isInstalled = item.installed;
              const showHeader =
                index === 0 ||
                flatResults[index - 1]?.type !== item.type;

              return (
                <Box key={`${item.type}:${item.name}`} flexDirection="column">
                  {showHeader && (
                    <Text color={theme.accent} bold>
                      {ASSET_TYPE_PLURAL[item.type]}
                    </Text>
                  )}
                  <Box flexDirection="row">
                    <Text color={isCurrent ? theme.primary : theme.dim}>
                      {isCurrent ? ' › ' : '   '}
                    </Text>
                    <Text color={isCurrent ? theme.text : theme.secondary}>
                      {isInstalled ? '● ' : '○ '}
                    </Text>
                    <Text color={theme.dim}>{assetTypeBadge(item.type)} </Text>
                    <Text color={isCurrent ? theme.text : theme.secondary} bold={isCurrent}>
                      {titleize(item.name)}
                    </Text>
                    {isInstalled && <Text color={theme.dim}> installed</Text>}
                  </Box>
                </Box>
              );
            })
          )}
        </Box>
      </Box>

      <Box flexDirection="column">
        {canShowDescriptions && (
          <Box
            flexDirection="column"
            paddingX={2}
            paddingY={1}
            borderStyle="round"
            borderColor={theme.borderMuted}
            height={isCompact ? 0 : 5}
            justifyContent="center"
          >
            <Text color={theme.text}>{flatResults[cursor]?.description || ''}</Text>
          </Box>
        )}
        <Box marginTop={isCompact ? 1 : 0}>
          <Text color={theme.dim}>
            {isCompact
              ? '↑↓ navigate  enter details  esc search again'
              : '↑↓ navigate  enter details  esc search again  q quit'}
          </Text>
        </Box>
      </Box>
    </Box>
  );
};

export async function searchCommand(args: string[]) {
  const query = args.join(' ');

  if (!process.stdin.isTTY) {
    console.log(`\n  Aman Search Results for "${query}" (Non-TTY):\n`);
    const results = (await marketplaceService.search(query)).filter((r) => matchesAssetSearch(r, query));
    const grouped = groupResultsByType(results);

    for (const type of ASSET_TAB_ORDER) {
      const items = grouped[type];
      if (items.length === 0) continue;
      console.log(`  ${ASSET_TYPE_PLURAL[type]}:`);
      for (const r of items) {
        const installed =
          (await assetService.list(type, 'global')).some((i) => i.name === r.name) ||
          (await assetService.list(type, 'project')).some((i) => i.name === r.name);
        console.log(
          `    ${installed ? '●' : '○'} ${assetTypeBadge(type)} ${r.name}: ${r.description || 'No description'}`
        );
      }
    }
    if (results.length === 0) console.log('  No results found.');
    console.log('');
    return;
  }

  if (query.trim()) {
    const { waitUntilExit } = render(
      <TransitionScreen message={`Searching assets for "${query}"...`}>
        <SearchApp initialQuery={query} />
      </TransitionScreen>
    );
    await waitUntilExit();
  } else {
    const { waitUntilExit } = render(<SearchApp initialQuery="" />);
    await waitUntilExit();
  }
}
