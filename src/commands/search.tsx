import React, { useEffect, useMemo, useState } from 'react';
import { render, Box, Text, useApp, useInput } from 'ink';
import { CustomSelectInput } from '../ui/components/CustomSelect.js';
import TextInput from 'ink-text-input';
import { marketplaceService } from '../services/marketplace.service.js';
import { assetService } from '../services/asset.service.js';
import { ProviderResult, NarratorState, Scope, AssetType } from '../types/index.js';
import { Header } from '../ui/components/Header.js';
import { Narrator } from '../ui/components/Narrator.js';
import { theme } from '../ui/theme.js';
import { useResponsiveLayout, MIN_COLUMNS, MIN_ROWS } from '../ui/layout.js';
import { TooSmallScreen } from '../ui/components/TooSmallScreen.js';
import { metadataParts, shortDescription, titleize, verifiedBadge } from '../ui/marketplaceDisplay.js';
import { installFromCandidate } from '../marketplace/install-from-candidate.js';
import { MarketplaceInstallConfirm } from '../ui/components/MarketplaceInstallConfirm.js';
import { PLAIN_OUTPUT_MAX_COLUMNS } from '../ui/layout.js';
import { MARKETPLACE_ENABLED } from '../config/features.js';
import {
  ASSET_TAB_ORDER,
  ASSET_TYPE_PLURAL,
  assetTypeBadge,
  groupResultsByType,
  matchesAssetSearch,
} from '../ui/assetDisplay.js';
import { TransitionScreen } from '../ui/animations/TransitionScreen.js';

type SearchMode = 'input' | 'results' | 'detail' | 'confirm' | 'installing' | 'done';

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
  const [filterQuery, setFilterQuery] = useState('');
  const [filterActive, setFilterActive] = useState(false);
  const [marketplaceNotice, setMarketplaceNotice] = useState<string | undefined>();
  const [installCandidate, setInstallCandidate] = useState<Awaited<
    ReturnType<typeof marketplaceService.findInstallCandidate>
  > | null>(null);

  async function performSearch(searchQuery: string) {
    if (!searchQuery.trim()) return;
    setLoading(true);
    setCursor(0);
    setMochiState('searching');
    setMessage('Searching assets...');

    try {
      if (MARKETPLACE_ENABLED) {
      const ghMeta = await marketplaceService.searchGitHubMarketplace(searchQuery);
      if (ghMeta.message) {
        setMarketplaceNotice(
          ghMeta.fromCache && ghMeta.cacheAgeMinutes !== null
            ? `${ghMeta.message} Results from ${ghMeta.cacheAgeMinutes} minutes ago.`
            : ghMeta.message
        );
      } else if (ghMeta.fromCache && ghMeta.cacheAgeMinutes !== null) {
        setMarketplaceNotice(`Marketplace results from ${ghMeta.cacheAgeMinutes} minutes ago.`);
      } else {
        setMarketplaceNotice(undefined);
      }
      }

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

  const displayResults = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return flatResults;
    return flatResults.filter((r) => {
      const hay = [r.name, r.slug, r.description, r.organization, ...(r.tags ?? [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [flatResults, filterQuery]);

  const visibleItems = useMemo(() => {
    const total = displayResults.length;
    if (total === 0) return [];
    const half = Math.floor(pageSize / 2);
    const start = Math.max(0, Math.min(cursor - half, Math.max(0, total - pageSize)));
    return displayResults.slice(start, start + pageSize).map((item, idx) => ({
      item,
      index: start + idx,
    }));
  }, [cursor, displayResults, pageSize]);

  const focusedItem = displayResults[cursor];

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
      if (input === '/') {
        setFilterActive(true);
        setFilterQuery('');
        setCursor(0);
        return;
      }
      if (filterActive && input.length === 1 && !key.ctrl && !key.meta) {
        setFilterQuery((prev) => prev + input);
        setCursor(0);
        return;
      }
      if (key.escape || key.backspace || key.delete) {
        if (filterActive || filterQuery) {
          setFilterQuery('');
          setFilterActive(false);
          setCursor(0);
        } else {
          setMode('input');
        }
        return;
      }
      if (key.upArrow || input === 'k') {
        setCursor((p) => Math.max(0, p - 1));
        return;
      }
      if (key.downArrow || input === 'j') {
        setCursor((p) => Math.min(displayResults.length - 1, p + 1));
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

  async function prepareInstall() {
    if (!focusedItem) return;
    const candidate = await marketplaceService.findInstallCandidate(focusedItem.slug ?? focusedItem.name);
    if (!candidate) {
      setMochiState('error');
      setMessage('Asset not found');
      setMode('done');
      return;
    }
    setInstallCandidate(candidate);
    setMode('confirm');
  }

  async function doInstall(scope: Scope) {
    if (!installCandidate) return;
    setMode('installing');
    setMochiState('installing');
    setMessage(`Installing ${titleize(installCandidate.name)}...`);

    try {
      const result = await installFromCandidate(installCandidate, scope);
      setMochiState('success');
      setMessage(
        `Installed ${assetTypeBadge(installCandidate.type)} ${titleize(installCandidate.name)} → ${result.path}`
      );
    } catch (err: unknown) {
      setMochiState('error');
      setMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
    setMode('done');
    setTimeout(() => handleExit(), 1200);
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

  if (mode === 'confirm' && installCandidate) {
    return (
      <Box flexDirection="column" paddingX={1} height={rows} justifyContent="space-between">
        <MarketplaceInstallConfirm
          details={{
            name: installCandidate.name,
            type: installCandidate.type,
            slug: installCandidate.slug,
            author: installCandidate.organization,
            version: installCandidate.version,
            source: installCandidate.githubSource ?? installCandidate.source,
            checksum: installCandidate.checksum,
            verified: installCandidate.verified,
          }}
          onConfirm={(s) => doInstall(s)}
          onCancel={() => setMode('detail')}
        />
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
                if (item.value === 'install') void prepareInstall();
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

  const localResults = results.filter((r) => r.section !== 'marketplace');
  const marketplaceResults = results.filter((r) => r.section === 'marketplace');
  const grouped = groupResultsByType(displayResults);

  return (
    <Box flexDirection="column" paddingX={1} height={rows} justifyContent="space-between">
      <Box flexDirection="column">
        <Header compact />
        {marketplaceNotice && (
          <Text color={theme.warning} wrap="truncate">
            {marketplaceNotice}
          </Text>
        )}
        <Text color={theme.dim}>
          {displayResults.length} result{displayResults.length !== 1 ? 's' : ''} · Local{' '}
          {localResults.length}
          {MARKETPLACE_ENABLED ? ` · Marketplace ${marketplaceResults.length}` : ''}
        </Text>
        {!filterActive && filterQuery === '' && (
          <Box marginTop={0}>
            <Text color={theme.dim}>/ filter · j/k navigate · enter details · q quit</Text>
          </Box>
        )}
        {(filterActive || filterQuery !== '') && (
          <Box flexDirection="row" marginTop={0}>
            <Text color={theme.primary}>/ </Text>
            <TextInput
              value={filterQuery}
              onChange={(v) => {
                setFilterQuery(v);
                setCursor(0);
              }}
              placeholder="filter..."
            />
          </Box>
        )}
        <Text>{' '}</Text>

        <Box flexDirection="column" height={pageSize}>
          {visibleItems.length === 0 ? (
            <Text color={theme.dim}>No results found.</Text>
          ) : (
            visibleItems.map(({ item, index }) => {
              const isCurrent = index === cursor;
              const isInstalled = item.installed;
              const showSectionHeader =
                index === 0 || displayResults[index - 1]?.section !== item.section;
              const showTypeHeader =
                showSectionHeader ||
                displayResults[index - 1]?.type !== item.type;

              return (
                <Box key={`${item.section}:${item.type}:${item.name}`} flexDirection="column">
                  {showSectionHeader && (
                    <Text color={theme.accent} bold>
                      {item.section === 'marketplace' ? 'Marketplace' : 'Local'}
                    </Text>
                  )}
                  {showTypeHeader && (
                    <Text color={theme.secondary}>
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
                      {item.slug ?? titleize(item.name)}
                      {verifiedBadge(item.verified)}
                    </Text>
                    {item.stars !== undefined && !isCompact && (
                      <Text color={theme.dim}> ★{item.stars}</Text>
                    )}
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
            <Text color={theme.text}>{displayResults[cursor]?.description || ''}</Text>
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

export async function searchCommand(
  args: string[],
  options: { noTty?: boolean } = {}
) {
  const query = args.join(' ');
  const forcePlain = options.noTty === true;
  const columns = process.stdout.columns ?? 80;
  const plain = forcePlain || !process.stdin.isTTY || !process.stdout.isTTY || columns <= PLAIN_OUTPUT_MAX_COLUMNS;

  if (plain) {
    if (MARKETPLACE_ENABLED) {
      const ghMeta = await marketplaceService.searchGitHubMarketplace(query);
      if (ghMeta.message) {
        console.error(ghMeta.message);
      }
    }
    const results = (await marketplaceService.search(query)).filter((r) => matchesAssetSearch(r, query));

    for (const r of results) {
      const label = r.section === 'marketplace' ? 'marketplace' : 'registry';
      const badge = r.verified ? ' ✓' : '';
      console.log(
        `${r.type}  ${r.slug ?? r.name}  ${r.version ?? '-'}  ${r.description ?? ''}${badge}  [${label}]`
      );
    }
    if (results.length === 0) console.log('No results found.');
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
