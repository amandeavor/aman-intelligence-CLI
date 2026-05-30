import React, { useEffect, useMemo, useState } from 'react';
import { render, Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { assetService } from '../services/asset.service.js';
import { marketplaceService } from '../services/marketplace.service.js';
import { ListItem } from '../ui/list-item.js';
import {
  assetListDescription,
  assetListOriginalName,
} from '../utils/asset-list-fields.js';
import { Header } from '../ui/components/Header.js';
import { Narrator } from '../ui/components/Narrator.js';
import { ScopePrompt } from '../ui/components/ScopePrompt.js';
import { theme } from '../ui/theme.js';
import { useResponsiveLayout, MIN_COLUMNS, MIN_ROWS, PLAIN_OUTPUT_MAX_COLUMNS } from '../ui/layout.js';
import { verifiedBadge, shortDescription } from '../ui/marketplaceDisplay.js';
import { installFromCandidate } from '../marketplace/install-from-candidate.js';
import { MarketplaceInstallConfirm } from '../ui/components/MarketplaceInstallConfirm.js';
import { MarketplaceAsset } from '../marketplace/types.js';
import { MARKETPLACE_ENABLED } from '../config/features.js';
import { TooSmallScreen } from '../ui/components/TooSmallScreen.js';
import { TransitionScreen } from '../ui/animations/TransitionScreen.js';
import { titleize, statusLabel } from '../ui/marketplaceDisplay.js';
import { ASSET_TYPE_PLURAL, ASSET_TAB_ORDER, assetTypeBadge } from '../ui/assetDisplay.js';
import { CustomSelectInput } from '../ui/components/CustomSelect.js';
import { NarratorState, Scope, AssetType } from '../types/index.js';

const viewTabs = MARKETPLACE_ENABLED ? (['Local', 'Marketplace'] as const) : (['Local'] as const);
const MARKETPLACE_PAGE_SIZE = 20;
const subFilters = ['All', 'Project', 'Global'] as const;

type BrowseView = (typeof viewTabs)[number];
type BrowseMode = 'loading' | 'browsing' | 'detail' | 'local-detail' | 'confirm' | 'scope' | 'installing' | 'done';
type MarketplaceSort = 'stars' | 'recent' | 'name';

function scopeLabel(scope: Scope): string {
  return scope === 'project' ? 'project' : 'global';
}

function assetTypeIndex(type: AssetType): number {
  return ASSET_TAB_ORDER.indexOf(type);
}

export const BrowseApp = ({
  onBack,
  initialAssetType = 'mcp',
  initialView = MARKETPLACE_ENABLED ? 'marketplace' : 'local',
}: {
  onBack?: () => void;
  initialAssetType?: AssetType;
  initialView?: 'installed' | 'local' | 'marketplace';
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
    initialView === 'installed'
      ? 'Local'
      : initialView === 'marketplace' && MARKETPLACE_ENABLED
        ? 'Marketplace'
        : 'Local'
  );
  const [marketplacePage, setMarketplacePage] = useState(0);
  const [marketplaceSort, setMarketplaceSort] = useState<MarketplaceSort>('stars');
  const [marketplaceNotice, setMarketplaceNotice] = useState<string | undefined>();
  const [detailAsset, setDetailAsset] = useState<MarketplaceAsset | null>(null);
  const [localDetailItem, setLocalDetailItem] = useState<ListItem | null>(null);
  const [installCandidate, setInstallCandidate] = useState<Awaited<
    ReturnType<typeof marketplaceService.findInstallCandidate>
  > | null>(null);
  const [activeFilter, setActiveFilter] = useState(0);
  const [items, setItems] = useState<ListItem[]>([]);
  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [refreshCount, setRefreshCount] = useState(0);
  const [mode, setMode] = useState<BrowseMode>('loading');
  const [mochiState, setMochiState] = useState<NarratorState>('searching');
  const [message, setMessage] = useState('Loading...');
  const [searchQuery, setSearchQuery] = useState('');
  const [focusedSection, setFocusedSection] = useState<'search' | 'list'>('search');

  const isMarketplace = MARKETPLACE_ENABLED && activeView === 'Marketplace';

  function truncateDescription(text?: string): string | undefined {
    if (!text) return undefined;
    if (physicalColumns <= 70) {
      const max = 40;
      return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
    }
    return shortDescription(text);
  }

  async function loadMarketplaceItems(query: string) {
    const catalog = await marketplaceService.loadGitHubMarketplaceCatalog({
      query,
      typeFilter: activeAssetType,
    });

    if (catalog.message) {
      setMarketplaceNotice(
        catalog.fromCache && catalog.cacheAgeMinutes !== null
          ? `${catalog.message} Results from ${catalog.cacheAgeMinutes} minutes ago.`
          : catalog.message
      );
    } else if (catalog.fromCache && catalog.cacheAgeMinutes !== null) {
      setMarketplaceNotice(`Results from ${catalog.cacheAgeMinutes} minutes ago.`);
    } else {
      setMarketplaceNotice(undefined);
    }

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

    const sorted = [...catalog.assets].sort((a, b) => {
      if (marketplaceSort === 'stars') return b.stars - a.stars || a.name.localeCompare(b.name);
      if (marketplaceSort === 'recent') {
        const ta = a.updatedAt ? Date.parse(a.updatedAt) : 0;
        const tb = b.updatedAt ? Date.parse(b.updatedAt) : 0;
        return tb - ta || b.stars - a.stars;
      }
      return a.name.localeCompare(b.name);
    });

    return sorted.map((asset) => ({
      label: `${titleize(asset.localName)}${verifiedBadge(asset.verified)}`,
      value: asset.slug,
      description: truncateDescription(asset.description),
      metadata: [
        asset.type,
        asset.author,
        physicalColumns > 70 ? `★${asset.stars}` : '',
        `v${asset.version}`,
      ].filter(Boolean),
      status: installedNames.has(asset.localName) ? 'installed' : undefined,
      marketplaceAsset: asset,
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
      const baseName = getBaseName(item.name, assetListOriginalName(item));
      if (seenBaseNames.has(baseName)) continue;
      seenBaseNames.add(baseName);
      merged.set(item.name, {
        label: titleize(baseName),
        value: item.name,
        description: shortDescription(assetListDescription(item)),
        badge: 'global',
        metadata: ['global'],
        status: item.source === 'installed' ? 'installed' : undefined,
        rawAsset: item,
        scope: 'global',
      });
    }

    for (const item of projectAssets) {
      const baseName = getBaseName(item.name, assetListOriginalName(item));
      if (seenBaseNames.has(baseName)) {
        let foundKey = '';
        for (const [k] of merged.entries()) {
          const globalItem = globalAssets.find((s) => s.name === k);
          const kBase = getBaseName(k, globalItem ? assetListOriginalName(globalItem) : undefined);
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
            rawAsset: item,
            scope: 'project',
          });
        }
        continue;
      }
      seenBaseNames.add(baseName);
      merged.set(item.name, {
        label: titleize(baseName),
        value: item.name,
        description: shortDescription(assetListDescription(item)),
        badge: 'project',
        metadata: ['project'],
        status: 'installed',
        rawAsset: item,
        scope: 'project',
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
  }, [activeAssetType, activeView, refreshCount]);

  const paginatedItems = useMemo(() => {
    if (!isMarketplace) return items;
    const start = marketplacePage * MARKETPLACE_PAGE_SIZE;
    return items.slice(start, start + MARKETPLACE_PAGE_SIZE);
  }, [items, isMarketplace, marketplacePage]);

  const filteredItems = useMemo(() => {
    let result = isMarketplace ? paginatedItems : items;
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
  }, [items, paginatedItems, isMarketplace, activeFilter, searchQuery]);

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
      if (selected.size > 0) {
        setSelected(new Set());
        return;
      }
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
        setActiveView((prev) => (prev === 'Local' ? 'Marketplace' : 'Local'));
        setMarketplacePage(0);
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
          setActiveView('Local');
        }
        setCursor(0);
        return;
      }
      if (input === ' ') {
        toggleCurrent();
        return;
      }
      if (input === 'i' && isMarketplace && selected.size > 0) {
        setMode('scope');
        return;
      }
      if (input === 'x' && !isMarketplace && selected.size > 0) {
        setMode('loading');
        setMochiState('searching');
        setMessage(`Removing ${selected.size} selected assets...`);
        
        async function runBulkRemove() {
          const names = Array.from(selected);
          let removedCount = 0;
          let failedCount = 0;
          
          for (const name of names) {
            const item = items.find((i) => i.value === name);
            const scope = item?.scope ?? 'global';
            try {
              await assetService.remove(name, activeAssetType, scope);
              removedCount++;
            } catch {
              failedCount++;
            }
          }
          
          setSelected(new Set());
          
          if (failedCount > 0) {
            setMochiState('error');
            setMessage(`Removed ${removedCount}, failed ${failedCount}`);
          } else {
            setMochiState('success');
            setMessage(`Successfully removed ${removedCount} assets.`);
          }
          setMode('done');
          setTimeout(() => {
            setRefreshCount((c) => c + 1);
          }, 1500);
        }
        
        void runBulkRemove();
        return;
      }
      if (key.return && filteredItems.length > 0) {
        const item = filteredItems[cursor];
        if (isMarketplace) {
          if (item?.marketplaceAsset) {
            setDetailAsset(item.marketplaceAsset);
            setMode('detail');
          }
        } else {
          if (item) {
            setLocalDetailItem(item);
            setMode('local-detail');
          }
        }
      }
      if (input === 'n' && isMarketplace) {
        setMarketplacePage((p) => p + 1);
        setCursor(0);
      }
      if (input === 'p' && isMarketplace) {
        setMarketplacePage((p) => Math.max(0, p - 1));
        setCursor(0);
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
          await installFromCandidate(candidate, scope);
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
      setTimeout(() => {
        setSelected(new Set());
        setRefreshCount((c) => c + 1);
      }, 1800);
      return;
    }

    setMochiState('success');
    setMessage(
      installedCount === 1
        ? `Installed ${titleize(installedNames[0])} → ${scopeLabel(scope)}`
        : `Installed ${installedCount} ${typeLabel} → ${scopeLabel(scope)}`
    );
    setMode('done');
    setTimeout(() => {
      setSelected(new Set());
      setRefreshCount((c) => c + 1);
    }, 1100);
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

  if (mode === 'local-detail' && localDetailItem) {
    const raw = localDetailItem.rawAsset;
    const scope = localDetailItem.scope ?? 'global';
    const provenance = raw?.provenance;
    const localActions = [
      { label: 'Remove Asset', value: 'remove' },
      { label: 'Back', value: 'back' },
    ];
    return (
      <Box flexDirection="column" paddingX={1} height={rows} justifyContent="space-between">
        <Box flexDirection="column">
          <Header compact />
          <Text bold>
            {assetTypeBadge(activeAssetType)} {localDetailItem.value}
          </Text>
          <Text color={theme.dim}>Scope: {scope}</Text>
          <Box marginTop={1} flexDirection="column">
            <Text color={theme.secondary}>{raw?.description || 'No description provided.'}</Text>
            {raw?.installedAt && (
              <Box marginTop={1}>
                <Text color={theme.dim}>Installed: {new Date(raw.installedAt).toLocaleString()}</Text>
              </Box>
            )}
            {provenance && (
              <Box marginTop={1} flexDirection="column">
                <Text bold color={theme.accent}>Provenance:</Text>
                <Text color={theme.dim}>  • Tool: {provenance.tool}</Text>
                <Text color={theme.dim}>  • Path: {provenance.sourcePath}</Text>
                {provenance.importedAt && (
                  <Text color={theme.dim}>  • Time: {new Date(provenance.importedAt).toLocaleString()}</Text>
                )}
              </Box>
            )}
          </Box>
          <Box marginTop={1}>
            <CustomSelectInput
              items={localActions}
              onSelect={async (item) => {
                if (item.value === 'back') {
                  setMode('browsing');
                  return;
                }
                if (item.value === 'remove') {
                  setMode('loading');
                  setMochiState('searching');
                  setMessage(`Removing ${localDetailItem.value}...`);
                  try {
                    await assetService.remove(localDetailItem.value, activeAssetType, scope);
                    setMochiState('success');
                    setMessage(`Removed ${localDetailItem.value} successfully.`);
                  } catch (err: any) {
                    setMochiState('error');
                    setMessage(`Failed to remove: ${err.message}`);
                  }
                  setMode('done');
                  setTimeout(() => {
                    setRefreshCount((c) => c + 1);
                  }, 1500);
                }
              }}
            />
          </Box>
        </Box>
      </Box>
    );
  }

  if (mode === 'detail' && detailAsset) {
    const detailActions = [
      { label: 'Install', value: 'install' },
      { label: 'Back', value: 'back' },
    ];
    return (
      <Box flexDirection="column" paddingX={1} height={rows} justifyContent="space-between">
        <Box flexDirection="column">
          <Header compact />
          <Text bold>
            {assetTypeBadge(detailAsset.type)} {detailAsset.slug}
            {verifiedBadge(detailAsset.verified)}
          </Text>
          <Text color={theme.secondary}>{detailAsset.description}</Text>
          <Text color={theme.dim}>Source: {detailAsset.source}</Text>
          <Text color={theme.dim}>Repository: github.com/{detailAsset.owner}/{detailAsset.repo}</Text>
          <Text color={theme.dim}>Checksum: {detailAsset.checksum}</Text>
          {detailAsset.updatedAt && (
            <Text color={theme.dim}>Updated: {detailAsset.updatedAt}</Text>
          )}
          <Box marginTop={1}>
            <CustomSelectInput
              items={detailActions}
              onSelect={async (item) => {
                if (item.value === 'back') {
                  setMode('browsing');
                  return;
                }
                const candidate = await marketplaceService.findInstallCandidate(detailAsset.slug);
                if (candidate) {
                  setInstallCandidate(candidate);
                  setMode('confirm');
                }
              }}
            />
          </Box>
        </Box>
      </Box>
    );
  }

  if (mode === 'confirm' && installCandidate) {
    return (
      <Box flexDirection="column" paddingX={1}>
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
          onConfirm={async (scope) => {
            setMode('installing');
            try {
              await installFromCandidate(installCandidate, scope);
              setMochiState('success');
              setMessage(`Installed → ${scopeLabel(scope)}`);
            } catch (err: unknown) {
              setMochiState('error');
              setMessage(err instanceof Error ? err.message : String(err));
            }
            setMode('done');
            setTimeout(() => {
              setRefreshCount((c) => c + 1);
            }, 1200);
          }}
          onCancel={() => setMode('detail')}
        />
      </Box>
    );
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
        {marketplaceNotice && isMarketplace && (
          <Text color={theme.warning} wrap="truncate">
            {marketplaceNotice}
          </Text>
        )}

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
                : `Filter registry and installed ${ASSET_TYPE_PLURAL[activeAssetType].toLowerCase()}...`
            }
          />
        </Box>

        <Box flexDirection="column" height={pageSize}>
          {filteredItems.length === 0 ? (
            <Text color={theme.dim}>
              {isMarketplace
                ? `No matching ${ASSET_TYPE_PLURAL[activeAssetType].toLowerCase()} in marketplace.`
                : `No registry or installed ${ASSET_TYPE_PLURAL[activeAssetType].toLowerCase()} matching your query.`}
            </Text>
          ) : (
            visibleItems.map(({ item, index }) => {
              const isCurrent = index === cursor && focusedSection === 'list';
              const isSelected = selected.has(item.value);
              const isInstalled = item.status === 'installed';
              
              const indicatorText = isSelected ? '[✓] ' : isInstalled && isMarketplace ? '[●] ' : '[ ] ';
              const indicatorColor = isSelected
                ? theme.primary
                : isInstalled && isMarketplace
                ? theme.success
                : theme.dim;

              return (
                <Box key={item.value} flexDirection="row">
                  <Text color={isCurrent ? theme.primary : theme.dim}>{isCurrent ? ' › ' : '   '}</Text>
                  <Text color={indicatorColor} bold={isSelected}>
                    {indicatorText}
                  </Text>
                  <Text color={isCurrent ? theme.text : isSelected ? theme.primary : theme.secondary} bold={isCurrent || isSelected}>
                    {item.label}
                  </Text>
                  {item.badge && <Text color={theme.dim}> [{item.badge}]</Text>}
                  {isInstalled && isMarketplace && !isSelected && <Text color={theme.dim}> (installed)</Text>}
                  {isSelected && <Text color={theme.primary} bold> (selected)</Text>}
                </Box>
              );
            })
          )}
        </Box>
      </Box>

      <Box flexDirection="column">
        {selected.size > 0 ? (
          <Box
            flexDirection="column"
            paddingX={2}
            paddingY={1}
            borderStyle="round"
            borderColor={isMarketplace ? theme.primary : theme.error}
            height={isCompact ? 0 : 5}
            justifyContent="center"
          >
            <Box flexDirection="row" justifyContent="space-between" alignItems="center">
              <Box flexDirection="row">
                <Text bold color={isMarketplace ? theme.primary : theme.error}>
                  {isMarketplace ? '⚡ BULK INSTALL' : '⚡ BULK UNINSTALL'}
                </Text>
                <Text color={theme.text}>
                  {' '}| {selected.size} {ASSET_TYPE_PLURAL[activeAssetType].toLowerCase()} selected
                </Text>
              </Box>
              <Box>
                {isMarketplace ? (
                  <Text bold color={theme.primary}>Press [i] to Install All</Text>
                ) : (
                  <Text bold color={theme.error}>Press [x] to Remove All</Text>
                )}
                <Text color={theme.dim}>  ·  [esc] to clear</Text>
              </Box>
            </Box>
          </Box>
        ) : (
          canShowDescriptions && (
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
          )
        )}
        <Box marginTop={isCompact ? 1 : 0}>
          <Text color={theme.dim}>
            {isCompact
              ? `←→ type  tab view  ↑↓ navigate  esc back${selected.size > 0 ? (isMarketplace ? '  [i] install' : '  [x] remove') : ''}`
              : `←→ asset type  tab ${isMarketplace ? 'view' : 'filter'}  ↑↓ navigate  ${
                  isMarketplace ? 'space select  enter install' : 'space select  enter details'
                }  esc back  q quit`}
            {selected.size > 0 ? `  · ${selected.size} selected` : ''}
            {selected.size > 0 && !isCompact ? (
              isMarketplace ? (
                <Text color={theme.primary}>  ·  press [i] to install selected</Text>
              ) : (
                <Text color={theme.error}>  ·  press [x] to remove selected</Text>
              )
            ) : ''}
          </Text>
        </Box>
      </Box>
    </Box>
  );
};

export async function browseCommand(args: string[] = [], options?: { list?: boolean; l?: boolean; json?: boolean }) {
  const wantsList = Boolean(options?.list || options?.l);
  const wantsJson = Boolean(options?.json);
  const columns = process.stdout.columns ?? 80;

  if (columns <= PLAIN_OUTPUT_MAX_COLUMNS) {
    console.error('\n  Terminal too narrow for browse. Use: aman search <query>\n');
    process.exit(1);
  }

  if (!process.stdin.isTTY) {
    if (wantsList || wantsJson) {
      const types: AssetType[] = ASSET_TAB_ORDER;
      const payload: Record<string, unknown> = { installed: {}, catalog: {} };

      for (const type of types) {
        const installedGlobal = await assetService.list(type, 'global');
        const installedProject = await assetService.list(type, 'project');
        const catalog = await marketplaceService.search('', type);
        (payload.installed as Record<string, unknown>)[type] = { global: installedGlobal, project: installedProject };
        (payload.catalog as Record<string, unknown>)[type] = catalog;
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
        ig.forEach((s) => console.log(`    - [installed:global] ${s.name}`));
        ip.forEach((s) => console.log(`    - [installed:project] ${s.name}`));
        const catalog = await marketplaceService.search('', type);
        catalog.slice(0, 5).forEach((s) => {
          const label = s.section === 'marketplace' ? 'marketplace' : 'registry';
          console.log(`    - [${label}] ${s.name}`);
        });
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
