import React, { useEffect, useMemo, useState } from 'react';
import { render, Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { assetService } from '../services/asset.service.js';
import { marketplaceService } from '../services/marketplace.service.js';
import { ListItem } from '../ui/components/SearchableList.js';
import { Header } from '../ui/components/Header.js';
import { Narrator } from '../ui/components/Narrator.js';
import { ScopePrompt } from '../ui/components/ScopePrompt.js';
import { theme } from '../ui/theme.js';
import { useResponsiveLayout, MIN_COLUMNS, MIN_ROWS } from '../ui/layout.js';
import { TooSmallScreen } from '../ui/components/TooSmallScreen.js';
import { TransitionScreen } from '../ui/animations/TransitionScreen.js';
import { titleize, shortDescription, statusLabel } from '../ui/marketplaceDisplay.js';
import { ASSET_TYPE_PLURAL, ASSET_TAB_ORDER } from '../ui/assetDisplay.js';
import { NarratorState, Scope, AssetType } from '../types/index.js';

const viewTabs = ['My Assets', 'Marketplace'] as const;
const subFilters = ['All', 'Project', 'Global'] as const;

type BrowseView = (typeof viewTabs)[number];
type BrowseMode = 'loading' | 'browsing' | 'scope' | 'installing' | 'done';

function scopeLabel(scope: Scope): string {
  return scope === 'project' ? 'project' : 'global';
}

function assetTypeIndex(type: AssetType): number {
  return ASSET_TAB_ORDER.indexOf(type);
}

export const BrowseApp = ({
  onBack,
  initialAssetType = 'mcp',
  initialView = 'marketplace',
}: {
  onBack?: () => void;
  initialAssetType?: AssetType;
  initialView?: 'installed' | 'marketplace';
}) => {
  const { exit } = useApp();
  const handleExit = () => {
    if (onBack) onBack();
    else exit();
  };
  const { rows, isTooSmall, isCompact, canShowDescriptions, physicalColumns, physicalRows } = useResponsiveLayout();
  const pageSize = Math.max(1, rows - (canShowDescriptions ? 16 : 11));

  const [activeAssetType, setActiveAssetType] = useState<AssetType>(initialAssetType);
  const [activeView, setActiveView] = useState<BrowseView>(
    initialView === 'installed' ? 'My Assets' : 'Marketplace'
  );
  const [activeFilter, setActiveFilter] = useState(0);
  const [items, setItems] = useState<ListItem[]>([]);
  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<BrowseMode>('loading');
  const [mochiState, setMochiState] = useState<NarratorState>('searching');
  const [message, setMessage] = useState('Loading...');
  const [searchQuery, setSearchQuery] = useState('');
  const [focusedSection, setFocusedSection] = useState<'search' | 'list'>('search');

  const isMarketplace = activeView === 'Marketplace';

  async function loadMarketplaceItems(query: string) {
    const marketplaceItems = await marketplaceService.search(query, activeAssetType);
    const globalAssets = await assetService.list(activeAssetType, 'global');
    let projectAssets: { name: string }[] = [];
    try {
      projectAssets = await assetService.list(activeAssetType, 'project');
    } catch {
      // no project env
    }
    const installedNames = new Set([
      ...globalAssets.map((s) => s.name),
      ...projectAssets.map((s) => s.name),
    ]);

    return marketplaceItems.map((item) => ({
      label: titleize(item.name),
      value: item.name,
      description: shortDescription(item.description),
      metadata: [item.source || 'marketplace'].filter(Boolean) as string[],
      status: installedNames.has(item.name) ? 'installed' : statusLabel(item),
    }));
  }

  async function loadInstalledItems(): Promise<ListItem[]> {
    const globalAssets = await assetService.list(activeAssetType, 'global');
    let projectAssets: any[] = [];
    try {
      projectAssets = await assetService.list(activeAssetType, 'project');
    } catch {
      // fine
    }

    const merged = new Map<string, ListItem>();
    const seenBaseNames = new Set<string>();

    const getBaseName = (name: string, originalName?: string) =>
      (originalName || name)
        .replace(/[-_\s]+\d+$/, '')
        .toLowerCase()
        .replace(/[-_\s]+/g, ' ')
        .trim();

    for (const item of globalAssets) {
      const baseName = getBaseName(item.name, item.originalName);
      if (seenBaseNames.has(baseName)) continue;
      seenBaseNames.add(baseName);
      merged.set(item.name, {
        label: titleize(baseName),
        value: item.name,
        description: shortDescription(item.description),
        badge: 'global',
        metadata: ['global'],
        status: item.source === 'installed' ? 'installed' : undefined,
      });
    }

    for (const item of projectAssets) {
      const baseName = getBaseName(item.name, item.originalName);
      if (seenBaseNames.has(baseName)) {
        let foundKey = '';
        for (const [k] of merged.entries()) {
          const globalItem = globalAssets.find((s) => s.name === k);
          const kBase = getBaseName(k, globalItem?.originalName);
          if (kBase === baseName) {
            foundKey = k;
            break;
          }
        }
        if (foundKey) {
          merged.set(foundKey, {
            ...merged.get(foundKey)!,
            badge: 'project',
            metadata: ['project'],
            status: 'installed',
          });
        }
        continue;
      }
      seenBaseNames.add(baseName);
      merged.set(item.name, {
        label: titleize(baseName),
        value: item.name,
        description: shortDescription(item.description),
        badge: 'project',
        metadata: ['project'],
        status: 'installed',
      });
    }

    return Array.from(merged.values());
  }

  useEffect(() => {
    let active = true;

    async function loadItems() {
      setMode('loading');
      setCursor(0);
      setMochiState('searching');
      setMessage(isMarketplace ? 'Loading marketplace...' : 'Loading your assets...');

      try {
        const loaded = isMarketplace
          ? await loadMarketplaceItems(searchQuery)
          : await loadInstalledItems();
        if (!active) return;
        setItems(loaded);
      } catch {
        if (!active) return;
        setItems([]);
      }
      setMode('browsing');
    }

    loadItems();
    return () => {
      active = false;
    };
  }, [activeAssetType, activeView]);

  const filteredItems = useMemo(() => {
    let result = items;
    if (!isMarketplace && activeFilter > 0) {
      const filterScope = subFilters[activeFilter].toLowerCase();
      result = result.filter((item) => item.badge === filterScope);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (item) =>
          item.label.toLowerCase().includes(q) ||
          (item.description && item.description.toLowerCase().includes(q))
      );
    }
    return result;
  }, [items, isMarketplace, activeFilter, searchQuery]);

  const visibleItems = useMemo(() => {
    const total = filteredItems.length;
    if (total === 0) return [];
    const half = Math.floor(pageSize / 2);
    const start = Math.max(0, Math.min(cursor - half, Math.max(0, total - pageSize)));
    const end = Math.min(start + pageSize, total);
    return filteredItems.slice(start, end).map((item, idx) => ({
      item,
      index: start + idx,
    }));
  }, [cursor, filteredItems, pageSize]);

  useInput((input, key) => {
    if (input === 'q') {
      handleExit();
      return;
    }

    if (key.escape) {
      if (focusedSection === 'list') {
        setFocusedSection('search');
      } else {
        handleExit();
      }
      return;
    }

    if (mode !== 'browsing') return;

    if (focusedSection === 'search') {
      if (key.downArrow && filteredItems.length > 0) {
        setFocusedSection('list');
        setCursor(0);
        return;
      }
      if (key.leftArrow || key.rightArrow) {
        const typeIdx = assetTypeIndex(activeAssetType);
        const nextIdx =
          key.leftArrow
            ? (typeIdx - 1 + ASSET_TAB_ORDER.length) % ASSET_TAB_ORDER.length
            : (typeIdx + 1) % ASSET_TAB_ORDER.length;
        setActiveAssetType(ASSET_TAB_ORDER[nextIdx]);
        setCursor(0);
        setSearchQuery('');
        return;
      }
      if (key.tab) {
        setActiveView((prev) => (prev === 'My Assets' ? 'Marketplace' : 'My Assets'));
        setActiveFilter(0);
        setCursor(0);
        setSearchQuery('');
        return;
      }
      if (key.return) {
        if (isMarketplace) {
          setMode('loading');
          loadMarketplaceItems(searchQuery).then((loaded) => {
            setItems(loaded);
            setMode('browsing');
            setFocusedSection('list');
          });
        } else if (filteredItems.length > 0) {
          setFocusedSection('list');
          setCursor(0);
        }
        return;
      }
      return;
    }

    if (focusedSection === 'list') {
      if (key.upArrow) {
        if (cursor === 0) setFocusedSection('search');
        else setCursor((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow) {
        setCursor((prev) => Math.min(filteredItems.length - 1, prev + 1));
        return;
      }
      if (key.leftArrow || key.rightArrow) {
        const typeIdx = assetTypeIndex(activeAssetType);
        const nextIdx =
          key.leftArrow
            ? (typeIdx - 1 + ASSET_TAB_ORDER.length) % ASSET_TAB_ORDER.length
            : (typeIdx + 1) % ASSET_TAB_ORDER.length;
        setActiveAssetType(ASSET_TAB_ORDER[nextIdx]);
        setActiveFilter(0);
        setCursor(0);
        setSearchQuery('');
        setFocusedSection('search');
        return;
      }
      if (key.tab) {
        if (!isMarketplace) {
          setActiveFilter((prev) => (prev + 1) % subFilters.length);
        } else {
          setActiveView('My Assets');
        }
        setCursor(0);
        return;
      }
      if (input === ' ' && isMarketplace) {
        toggleCurrent();
        return;
      }
      if (key.return && filteredItems.length > 0 && isMarketplace) {
        if (selected.size === 0 && filteredItems[cursor]) {
          setSelected(new Set([filteredItems[cursor].value]));
        }
        if (selected.size > 0 || filteredItems[cursor]) {
          setMode('scope');
        }
      }
    }
  });

  function toggleCurrent() {
    const item = filteredItems[cursor];
    if (!item) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(item.value)) next.delete(item.value);
      else next.add(item.value);
      return next;
    });
  }

  async function installSelected(scope: Scope) {
    const names = Array.from(selected);
    setMode('installing');
    setMochiState('installing');

    let installedCount = 0;
    let failedCount = 0;
    const installedNames: string[] = [];

    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      setMessage(`Installing ${i + 1}/${names.length}: ${titleize(name)}...`);
      try {
        const candidate = await marketplaceService.findInstallCandidate(name);
        if (!candidate) {
          await assetService.install(name, activeAssetType, scope, undefined, 'bundled');
        } else {
          await assetService.install(
            candidate.name,
            candidate.type,
            scope,
            candidate.sourcePath,
            candidate.source
          );
        }
        installedCount++;
        installedNames.push(name);
      } catch {
        failedCount++;
      }
    }

    const typeLabel = ASSET_TYPE_PLURAL[activeAssetType].toLowerCase();

    if (failedCount > 0) {
      setMochiState('error');
      setMessage(`Installed ${installedCount}, failed ${failedCount}`);
      setMode('done');
      setTimeout(() => handleExit(), 1800);
      return;
    }

    setMochiState('success');
    setMessage(
      installedCount === 1
        ? `Installed ${titleize(installedNames[0])} → ${scopeLabel(scope)}`
        : `Installed ${installedCount} ${typeLabel} → ${scopeLabel(scope)}`
    );
    setMode('done');
    setTimeout(() => handleExit(), 1100);
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

  if (mode === 'loading' || mode === 'installing' || mode === 'done') {
    const showTransition = mode === 'loading' && isMarketplace;
    const content = (
      <Box flexDirection="column" paddingX={1} height={rows} justifyContent="space-between">
        <Box flexDirection="column">
          <Header compact />
          <Narrator state={mochiState} message={message} />
        </Box>
        <Box>
          <Text color={theme.dim}>Please wait...</Text>
        </Box>
      </Box>
    );
    if (showTransition) {
      return <TransitionScreen message={message}>{content}</TransitionScreen>;
    }
    return content;
  }

  if (mode === 'scope') {
    return (
      <Box flexDirection="column" paddingX={1} height={rows} justifyContent="space-between">
        <Box flexDirection="column">
          <Header compact />
          <Text>
            <Text bold>{selected.size}</Text>
            <Text color={theme.dim}>
              {' '}
              {ASSET_TYPE_PLURAL[activeAssetType].toLowerCase()} selected
            </Text>
          </Text>
          <Box marginTop={1}>
            <ScopePrompt onSelect={(scope) => installSelected(scope)} />
          </Box>
        </Box>
        <Box>
          <Text color={theme.dim}>Select installation scope · esc cancel</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1} height={rows} justifyContent="space-between">
      <Box flexDirection="column">
        <Header compact />
        <Text bold color={theme.accent}>Browse Assets</Text>

        <Box marginBottom={1} marginTop={1}>
          {ASSET_TAB_ORDER.map((type) => {
            const isActive = type === activeAssetType;
            return (
              <Box key={type} marginRight={3}>
                <Text color={isActive ? theme.primary : theme.dim} bold={isActive} underline={isActive}>
                  {isActive ? '❯ ' : '  '}
                  {ASSET_TYPE_PLURAL[type]}
                </Text>
              </Box>
            );
          })}
        </Box>

        <Box marginBottom={1}>
          {viewTabs.map((tab) => {
            const isActive = tab === activeView;
            return (
              <Box key={tab} marginRight={3}>
                <Text color={isActive ? theme.text : theme.dim} bold={isActive}>
                  {tab}
                </Text>
              </Box>
            );
          })}
          {!isMarketplace && (
            <Box marginLeft={2}>
              {subFilters.map((filter, idx) => (
                <Box key={filter} marginRight={2}>
                  <Text color={idx === activeFilter ? theme.text : theme.dim} bold={idx === activeFilter}>
                    {filter}
                  </Text>
                </Box>
              ))}
            </Box>
          )}
        </Box>

        <Box marginBottom={1} flexDirection="row">
          <Text color={focusedSection === 'search' ? theme.primary : theme.dim}>
            {focusedSection === 'search' ? ' › ' : '   '}
          </Text>
          <TextInput
            value={searchQuery}
            onChange={(val) => {
              setSearchQuery(val);
              setCursor(0);
            }}
            focus={focusedSection === 'search'}
            placeholder={
              isMarketplace
                ? `Search ${ASSET_TYPE_PLURAL[activeAssetType].toLowerCase()} marketplace...`
                : `Filter installed ${ASSET_TYPE_PLURAL[activeAssetType].toLowerCase()}...`
            }
          />
        </Box>

        <Box flexDirection="column" height={pageSize}>
          {filteredItems.length === 0 ? (
            <Text color={theme.dim}>
              {isMarketplace
                ? `No matching ${ASSET_TYPE_PLURAL[activeAssetType].toLowerCase()} in marketplace.`
                : `No installed ${ASSET_TYPE_PLURAL[activeAssetType].toLowerCase()} matching your query.`}
            </Text>
          ) : (
            visibleItems.map(({ item, index }) => {
              const isCurrent = index === cursor && focusedSection === 'list';
              const isSelected = selected.has(item.value);
              const isInstalled = item.status === 'installed';
              let indicator = '○';
              if (isSelected) indicator = '◆';
              else if (isInstalled) indicator = '●';

              return (
                <Box key={item.value} flexDirection="row">
                  <Text color={isCurrent ? theme.primary : theme.dim}>{isCurrent ? ' › ' : '   '}</Text>
                  <Text color={isSelected ? theme.primary : isCurrent ? theme.text : theme.secondary}>
                    {indicator}{' '}
                  </Text>
                  <Text color={isCurrent ? theme.text : theme.secondary} bold={isCurrent}>
                    {item.label}
                  </Text>
                  {item.badge && <Text color={theme.dim}> [{item.badge}]</Text>}
                  {isInstalled && !isSelected && <Text color={theme.dim}> installed</Text>}
                  {isSelected && <Text color={theme.primary}> selected</Text>}
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
            <Text color={theme.text}>{filteredItems[cursor]?.description || ''}</Text>
          </Box>
        )}
        <Box marginTop={isCompact ? 1 : 0}>
          <Text color={theme.dim}>
            {isCompact
              ? '←→ type  tab view  ↑↓ navigate  esc back'
              : `←→ asset type  tab ${isMarketplace ? 'view' : 'filter'}  ↑↓ navigate  ${
                  isMarketplace ? 'space select  enter install' : 'enter details'
                }  esc back  q quit`}
            {selected.size > 0 ? `  · ${selected.size} selected` : ''}
          </Text>
        </Box>
      </Box>
    </Box>
  );
};

export async function browseCommand(args: string[] = [], options?: { list?: boolean; l?: boolean; json?: boolean }) {
  const wantsList = Boolean(options?.list || options?.l);
  const wantsJson = Boolean(options?.json);

  if (!process.stdin.isTTY) {
    if (wantsList || wantsJson) {
      const types: AssetType[] = ASSET_TAB_ORDER;
      const payload: Record<string, unknown> = { installed: {}, marketplace: {} };

      for (const type of types) {
        const installedGlobal = await assetService.list(type, 'global');
        const installedProject = await assetService.list(type, 'project');
        const marketplace = await marketplaceService.search('', type);
        (payload.installed as Record<string, unknown>)[type] = { global: installedGlobal, project: installedProject };
        (payload.marketplace as Record<string, unknown>)[type] = marketplace;
      }

      if (wantsJson) {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }

      console.log('\n  Browse Assets:\n');
      for (const type of types) {
        console.log(`  ${ASSET_TYPE_PLURAL[type]}:`);
        const ig = await assetService.list(type, 'global');
        const ip = await assetService.list(type, 'project');
        ig.forEach((s) => console.log(`    - [global] ${s.name}`));
        ip.forEach((s) => console.log(`    - [project] ${s.name}`));
        const marketplace = await marketplaceService.search('', type);
        marketplace.slice(0, 5).forEach((s) => console.log(`    - [marketplace] ${s.name}`));
      }
      return;
    }

    console.log('\n  \x1b[31;1mInteractive mode unavailable.\x1b[0m');
    console.log('  Use:');
    console.log('    \x1b[33maman browse --list\x1b[0m');
    console.log('    \x1b[33maman browse --json\x1b[0m\n');
    process.exit(1);
  }

  const { waitUntilExit } = render(<BrowseApp />);
  await waitUntilExit();
}
