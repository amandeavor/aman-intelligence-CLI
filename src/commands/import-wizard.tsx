import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { CustomSelectInput } from '../ui/components/CustomSelect.js';
import { ScopePrompt } from '../ui/components/ScopePrompt.js';
import { Header } from '../ui/components/Header.js';
import { Narrator } from '../ui/components/Narrator.js';
import { ProgressBar } from '../ui/animations/ProgressBar.js';
import { theme } from '../ui/theme.js';
import { assetTypeBadge, ASSET_TYPE_PLURAL } from '../ui/assetDisplay.js';
import { useResponsiveLayout, MIN_COLUMNS, MIN_ROWS } from '../ui/layout.js';
import { TooSmallScreen } from '../ui/components/TooSmallScreen.js';
import { NarratorState, Scope, AssetType } from '../types/index.js';
import { importDiscoveryService } from '../import/discovery.service.js';
import {
  applyAutoRenameConflicts,
  detectImportConflicts,
  executeImportPlan,
  isGithubDestinationAvailable,
  summarizeByType,
} from '../import/import.service.js';
import {
  DiscoveredImportAsset,
  ImportAdapterDescriptor,
  ImportDestination,
  ImportSourceId,
  TypeImportSelection,
  TypeSelectionMode,
  ImportConflict,
  ConflictBulkMode,
} from '../import/types.js';
import { ASSET_TAB_ORDER } from '../ui/assetDisplay.js';

type WizardStep =
  | 'source'
  | 'custom-path'
  | 'scanning'
  | 'results'
  | 'type-select'
  | 'destination'
  | 'scope'
  | 'conflict-bulk'
  | 'conflict-item'
  | 'confirm'
  | 'importing'
  | 'done';

const TYPE_ORDER: AssetType[] = ASSET_TAB_ORDER;

function defaultTypeSelections(): Record<AssetType, TypeImportSelection> {
  return {
    skill: { mode: 'all', selectedIds: new Set() },
    prompt: { mode: 'all', selectedIds: new Set() },
    mcp: { mode: 'all', selectedIds: new Set() },
  };
}

function canonicalLabel(status: DiscoveredImportAsset['canonicalStatus']): string {
  if (status === 'canonical') return 'canonical';
  if (status === 'convertible') return 'convertible';
  if (status === 'ambiguous') return 'ambiguous';
  return 'unknown';
}

function applyTypeSelections(
  assets: DiscoveredImportAsset[],
  selections: Record<AssetType, TypeImportSelection>
): DiscoveredImportAsset[] {
  const out: DiscoveredImportAsset[] = [];
  for (const type of TYPE_ORDER) {
    const group = assets.filter((a) => a.type === type);
    const sel = selections[type];
    if (sel.mode === 'skip' || group.length === 0) continue;
    if (sel.mode === 'all') {
      out.push(...group);
      continue;
    }
    out.push(...group.filter((a) => sel.selectedIds.has(a.id)));
  }
  return out;
}

export const ImportWizardApp = ({ onBack }: { onBack?: () => void }) => {
  const { exit } = useApp();
  const handleExit = () => {
    if (onBack) onBack();
    else exit();
  };

  const { isTooSmall, isCompact, physicalColumns, physicalRows, rows } = useResponsiveLayout();

  const [step, setStep] = useState<WizardStep>('source');
  const [adapters, setAdapters] = useState<ImportAdapterDescriptor[]>([]);
  const [sourceId, setSourceId] = useState<ImportSourceId | null>(null);
  const [customPath, setCustomPath] = useState('');
  const [discovered, setDiscovered] = useState<DiscoveredImportAsset[]>([]);
  const [typeSelections, setTypeSelections] = useState(defaultTypeSelections());
  const [typeQueueIndex, setTypeQueueIndex] = useState(0);
  const typesWithAssets = useMemo(
    () => TYPE_ORDER.filter((t) => discovered.some((d) => d.type === t)),
    [discovered]
  );
  const [pickCursor, setPickCursor] = useState(0);
  const [destination, setDestination] = useState<ImportDestination>('local');
  const [scope, setScope] = useState<Scope | undefined>();
  const [conflicts, setConflicts] = useState<ImportConflict[]>([]);
  const [conflictBulkMode, setConflictBulkMode] = useState<ConflictBulkMode>('ask');
  const [conflictCursor, setConflictCursor] = useState(0);
  const [state, setState] = useState<NarratorState>('idle');
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState(0);
  const [resultSummary, setResultSummary] = useState('');

  const githubReady = isGithubDestinationAvailable();
  const selectedItems = useMemo(
    () => applyTypeSelections(discovered, typeSelections),
    [discovered, typeSelections]
  );
  const counts = useMemo(() => summarizeByType(selectedItems), [selectedItems]);
  const activeType = typesWithAssets[typeQueueIndex] ?? null;
  const activeGroup = activeType ? discovered.filter((a) => a.type === activeType) : [];

  useImportPickInput(
    step === 'type-select' && activeType !== null && typeSelections[activeType].mode === 'select',
    activeGroup,
    pickCursor,
    setTypeSelections,
    activeType ?? 'skill',
    setPickCursor
  );

  useEffect(() => {
    setAdapters(importDiscoveryService.listAdapters());
  }, []);

  useInput((input, key) => {
    if (input === 'q' || (key.escape && step === 'source')) {
      handleExit();
    } else if (key.escape && step !== 'importing') {
      if (step === 'custom-path') setStep('source');
      else if (step === 'type-select') setStep('results');
      else if (step === 'results') setStep('source');
      else if (step === 'destination') setStep('results');
      else if (step === 'scope') setStep('destination');
      else if (step === 'conflict-bulk') setStep('scope');
      else if (step === 'conflict-item') setStep('conflict-bulk');
      else if (step === 'confirm') setStep(conflicts.length ? 'conflict-bulk' : 'scope');
    }
  });

  async function runScan(id: ImportSourceId, rootPath?: string) {
    setStep('scanning');
    setState('searching');
    setMessage('Scanning for assets...');
    try {
      const items = await importDiscoveryService.scan(id, rootPath ? { rootPath } : undefined);
      setDiscovered(items);
      setTypeSelections(defaultTypeSelections());
      setTypeQueueIndex(0);
      setStep('results');
    } catch (err: unknown) {
      setState('error');
      setMessage(err instanceof Error ? err.message : String(err));
      setStep('done');
    }
  }

  async function prepareConflicts(nextScope: Scope) {
    const items = applyTypeSelections(discovered, typeSelections);
    const found = await detectImportConflicts(items, nextScope);
    const withRename = applyAutoRenameConflicts(found, 'suffix');
    setConflicts(withRename);
    setScope(nextScope);
    setConflictCursor(0);
    setConflictBulkMode('ask');
    if (withRename.length > 0) setStep('conflict-bulk');
    else setStep('confirm');
  }

  function advanceTypeQueue() {
    if (typeQueueIndex + 1 < typesWithAssets.length) {
      setTypeQueueIndex((i) => i + 1);
      setPickCursor(0);
    } else {
      setStep('destination');
    }
  }

  useEffect(() => {
    if (step !== 'importing' || !scope || !sourceId) return;

    async function run() {
      if (!sourceId || !scope) return;
      setState('installing');
      setMessage('Importing assets...');
      setProgress(10);
      try {
        const plan = {
          sourceId,
          sourceLabel: adapters.find((a) => a.id === sourceId)?.label ?? sourceId,
          destination,
          scope,
          items: selectedItems,
          conflicts,
        };
        const result = await executeImportPlan(plan);
        setProgress(100);
        setState('success');
        setResultSummary(
          `Imported ${result.imported} · skipped ${result.skipped} · renamed ${result.renamed} · overwritten ${result.overwritten}`
        );
        setMessage(`Import complete → ${scope}`);
        setStep('done');
        setTimeout(() => handleExit(), 2000);
      } catch (err: unknown) {
        setState('error');
        setMessage(err instanceof Error ? err.message : String(err));
        setStep('done');
      }
    }

    run();
  }, [step, scope, sourceId, destination, selectedItems, conflicts, adapters]);

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

  if (step === 'scanning' || step === 'importing' || (step === 'done' && state !== 'idle')) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Header compact />
        <Narrator state={state} message={message} />
        {step === 'importing' && (
          <Box marginTop={1}>
            <ProgressBar progress={progress} />
          </Box>
        )}
        {resultSummary && step === 'done' && (
          <Text color={theme.dim}>{resultSummary}</Text>
        )}
      </Box>
    );
  }

  if (step === 'source') {
    const items = adapters
      .filter((a) => a.available)
      .map((a) => ({ label: a.label, value: a.id }));
    const unavailable = adapters.filter((a) => !a.available);

    return (
      <Box flexDirection="column" paddingX={1} height={rows}>
        <Header compact />
        <Text bold color={theme.accent}>Import from another tool</Text>
        <Text color={theme.dim}>Choose where to import skills, prompts, and MCPs from</Text>
        <Box marginTop={1}>
          <CustomSelectInput
            items={items}
            onSelect={(item) => {
              setSourceId(item.value as ImportSourceId);
              if (item.value === 'custom-path' || item.value === 'local-folder') setStep('custom-path');
              else void runScan(item.value as ImportSourceId);
            }}
          />
        </Box>
        {unavailable.length > 0 && (
          <Box marginTop={1} flexDirection="column">
            <Text color={theme.dim}>Unavailable on this machine:</Text>
            {unavailable.map((a) => (
              <Text key={a.id} color={theme.dim} wrap="truncate">
                {a.label}: {a.unavailableReason}
              </Text>
            ))}
          </Box>
        )}
        {!isCompact && (
          <Box marginTop={1}>
            <Text color={theme.dim}>↑↓ navigate · Enter select · Esc/q back</Text>
          </Box>
        )}
      </Box>
    );
  }

  if (step === 'custom-path') {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Header compact />
        <Text bold>Folder path</Text>
        <Box marginTop={1} flexDirection="row">
          <Text color={theme.primary}>❯ </Text>
          <TextInput
            value={customPath}
            onChange={setCustomPath}
            onSubmit={() => {
              if (!sourceId) return;
              void runScan(sourceId, customPath.trim() || process.cwd());
            }}
            placeholder="./path-to-assets"
          />
        </Box>
        <Text color={theme.dim}>Enter path · Enter submit · Esc back</Text>
      </Box>
    );
  }

  if (step === 'results') {
    const byType = TYPE_ORDER.map((t) => ({
      type: t,
      items: discovered.filter((a) => a.type === t),
    }));

    return (
      <Box flexDirection="column" paddingX={1} height={rows}>
        <Header compact />
        <Text bold>Discovered assets</Text>
        <Text color={theme.dim}>
          Source: {adapters.find((a) => a.id === sourceId)?.label ?? sourceId}
        </Text>
        <Box marginTop={1} flexDirection="column">
          {byType.map(({ type, items }) => (
            <Text key={type}>
              {assetTypeBadge(type)} {ASSET_TYPE_PLURAL[type]}: {items.length}
            </Text>
          ))}
          {discovered.length === 0 && (
            <Text color={theme.warning}>No recognizable assets found at this source.</Text>
          )}
        </Box>
        {!isCompact && discovered.length > 0 && (
          <Box marginTop={1} flexDirection="column">
            {discovered.slice(0, 8).map((item) => (
              <Text key={item.id} color={theme.dim} wrap="truncate">
                {assetTypeBadge(item.type)} {item.name} — {canonicalLabel(item.canonicalStatus)} — {item.originLabel}
                {item.canonicalNote ? ` (${item.canonicalNote})` : ''}
              </Text>
            ))}
            {discovered.length > 8 && (
              <Text color={theme.dim}>…and {discovered.length - 8} more</Text>
            )}
          </Box>
        )}
        <Box marginTop={1}>
          <CustomSelectInput
            items={[
              { label: discovered.length ? 'Configure import selection' : 'Choose another source', value: discovered.length ? 'select' : 'back' },
              ...(discovered.length ? [{ label: 'Import all discovered assets', value: 'all' }] : []),
            ]}
            onSelect={(item) => {
              if (item.value === 'back') {
                setStep('source');
                return;
              }
              if (item.value === 'all') {
                setTypeSelections({
                  skill: { mode: 'all', selectedIds: new Set() },
                  prompt: { mode: 'all', selectedIds: new Set() },
                  mcp: { mode: 'all', selectedIds: new Set() },
                });
                setStep('destination');
                return;
              }
              setStep('type-select');
              setTypeQueueIndex(0);
              setPickCursor(0);
            }}
          />
        </Box>
      </Box>
    );
  }

  if (step === 'type-select' && activeType) {
    const group = discovered.filter((a) => a.type === activeType);
    const sel = typeSelections[activeType];

    if (sel.mode === 'select') {
      return (
        <Box flexDirection="column" paddingX={1} height={rows}>
          <Header compact />
          <Text bold>
            Select {ASSET_TYPE_PLURAL[activeType].toLowerCase()} ({typeQueueIndex + 1}/{typesWithAssets.length})
          </Text>
          <Text color={theme.dim}>Space toggle · Enter done · Esc back</Text>
          <Box marginTop={1} flexDirection="column">
            {group.map((item, idx) => {
              const picked = sel.selectedIds.has(item.id);
              return (
                <Text key={item.id} color={idx === pickCursor ? theme.primary : theme.dim}>
                  {picked ? '◉' : '○'} {item.name} — {item.originLabel}
                </Text>
              );
            })}
          </Box>
          <Box marginTop={1}>
            <CustomSelectInput
              items={[{ label: 'Done selecting this type', value: 'done' }]}
              onSelect={() => advanceTypeQueue()}
            />
          </Box>
        </Box>
      );
    }

    return (
      <Box flexDirection="column" paddingX={1}>
        <Header compact />
        <Text bold>
          {ASSET_TYPE_PLURAL[activeType]} ({group.length} found) — step {typeQueueIndex + 1}/{typesWithAssets.length}
        </Text>
        <Box marginTop={1}>
          <CustomSelectInput
            items={[
              { label: `Import all ${ASSET_TYPE_PLURAL[activeType].toLowerCase()}`, value: 'all' },
              { label: `Select specific ${ASSET_TYPE_PLURAL[activeType].toLowerCase()}`, value: 'select' },
              { label: `Skip ${ASSET_TYPE_PLURAL[activeType].toLowerCase()}`, value: 'skip' },
            ]}
            onSelect={(item) => {
              const mode = item.value as TypeSelectionMode;
              setTypeSelections((prev) => ({
                ...prev,
                [activeType]: {
                  mode,
                  selectedIds: new Set(mode === 'select' ? group.map((g) => g.id) : []),
                },
              }));
              if (mode === 'select') {
                setPickCursor(0);
                return;
              }
              advanceTypeQueue();
            }}
          />
        </Box>
      </Box>
    );
  }

  if (step === 'destination') {
    const destItems: { label: string; value: ImportDestination }[] = [
      { label: 'Local environment', value: 'local' },
    ];
    if (githubReady) {
      destItems.push({ label: 'GitHub-backed environment', value: 'github' });
    }

    return (
      <Box flexDirection="column" paddingX={1}>
        <Header compact />
        <Text bold>Destination</Text>
        <Text color={theme.dim}>
          Selected: {selectedItems.length} assets ({counts.skill} skills · {counts.prompt} prompts · {counts.mcp} MCPs)
        </Text>
        {!githubReady && (
          <Box marginTop={1}>
            <Text color={theme.warning}>
              GitHub is not configured. Use `aman init --github` or connect GitHub first.
            </Text>
            <Text color={theme.dim}>Only Local destination is available.</Text>
          </Box>
        )}
        <Box marginTop={1}>
          <CustomSelectInput
            items={destItems}
            onSelect={(item) => {
              setDestination(item.value as ImportDestination);
              setStep('scope');
            }}
          />
        </Box>
      </Box>
    );
  }

  if (step === 'scope') {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Header compact />
        <Text bold>Scope</Text>
        <Text color={theme.dim}>Where should imported assets be installed?</Text>
        <Box marginTop={1}>
          <ScopePrompt
            onSelect={(s) => {
              void prepareConflicts(s);
            }}
          />
        </Box>
      </Box>
    );
  }

  if (step === 'conflict-bulk') {
    return (
      <Box flexDirection="column" paddingX={1} height={rows}>
        <Header compact />
        <Text bold color={theme.warning}>Name conflicts detected ({conflicts.length})</Text>
        <Text color={theme.dim}>Existing assets with the same name — choose how to resolve</Text>
        <Box marginTop={1} flexDirection="column">
          {conflicts.slice(0, isCompact ? 4 : 8).map((c) => (
            <Text key={c.asset.id} color={theme.dim} wrap="truncate">
              {assetTypeBadge(c.asset.type)} {c.asset.name} → conflicts with "{c.existingLocalName}"
            </Text>
          ))}
          {conflicts.length > (isCompact ? 4 : 8) && (
            <Text color={theme.dim}>…and {conflicts.length - (isCompact ? 4 : 8)} more</Text>
          )}
        </Box>
        <Box marginTop={1}>
          <CustomSelectInput
            items={[
              { label: 'Ask for each conflict', value: 'ask' },
              { label: 'Rename all conflicting items', value: 'rename-all' },
              { label: 'Skip all conflicting items', value: 'skip-all' },
              { label: 'Replace all existing items', value: 'replace-all' },
            ]}
            onSelect={(item) => {
              const mode = item.value as ConflictBulkMode;
              setConflictBulkMode(mode);
              if (mode === 'rename-all') {
                setConflicts(applyAutoRenameConflicts(conflicts, 'suffix'));
                setStep('confirm');
              } else if (mode === 'skip-all') {
                setConflicts(conflicts.map((c) => ({ ...c, resolution: 'skip' as const })));
                setStep('confirm');
              } else if (mode === 'replace-all') {
                setConflicts(conflicts.map((c) => ({ ...c, resolution: 'overwrite' as const, resolvedName: c.existingLocalName })));
                setStep('confirm');
              } else {
                // ask mode — walk through each conflict
                setConflictCursor(0);
                setStep('conflict-item');
              }
            }}
          />
        </Box>
      </Box>
    );
  }

  if (step === 'conflict-item' && conflictCursor < conflicts.length) {
    const c = conflicts[conflictCursor];
    return (
      <Box flexDirection="column" paddingX={1}>
        <Header compact />
        <Text bold color={theme.warning}>Conflict {conflictCursor + 1} of {conflicts.length}</Text>
        <Box marginTop={1} flexDirection="column">
          <Text>{assetTypeBadge(c.asset.type)} <Text bold>{c.asset.name}</Text> already exists as "{c.existingLocalName}"</Text>
          <Text color={theme.dim}>Source: {c.asset.originLabel}</Text>
        </Box>
        <Box marginTop={1}>
          <CustomSelectInput
            items={[
              { label: `Rename to "${c.resolvedName}"`, value: 'rename' },
              { label: 'Skip this asset', value: 'skip' },
              { label: 'Replace existing', value: 'replace' },
            ]}
            onSelect={(item) => {
              const updated = [...conflicts];
              if (item.value === 'rename') {
                updated[conflictCursor] = { ...c, resolution: 'rename' };
              } else if (item.value === 'skip') {
                updated[conflictCursor] = { ...c, resolution: 'skip' };
              } else {
                updated[conflictCursor] = { ...c, resolution: 'overwrite', resolvedName: c.existingLocalName };
              }
              setConflicts(updated);
              if (conflictCursor + 1 < conflicts.length) {
                setConflictCursor(conflictCursor + 1);
              } else {
                setStep('confirm');
              }
            }}
          />
        </Box>
      </Box>
    );
  }

  if (step === 'confirm') {
    const renames = conflicts.filter((c) => c.resolution === 'rename').length;
    const skips = conflicts.filter((c) => c.resolution === 'skip').length;
    const replaces = conflicts.filter((c) => c.resolution === 'overwrite').length;

    return (
      <Box flexDirection="column" paddingX={1}>
        <Header compact />
        <Text bold>Confirm import</Text>
        <Box marginTop={1} flexDirection="column">
          <Text>Source:      <Text bold>{adapters.find((a) => a.id === sourceId)?.label}</Text></Text>
          <Text>Skills:      <Text bold color={theme.primary}>{counts.skill}</Text></Text>
          <Text>Prompts:     <Text bold color={theme.success}>{counts.prompt}</Text></Text>
          <Text>MCPs:        <Text bold color={theme.warning}>{counts.mcp}</Text></Text>
          <Text>Destination: {destination === 'github' ? 'GitHub environment' : 'Local'}</Text>
          <Text>Scope:       {scope}</Text>
          {conflicts.length > 0 && (
            <Text>Conflicts:   {renames > 0 ? `${renames} rename` : ''}{skips > 0 ? `${renames > 0 ? ' · ' : ''}${skips} skip` : ''}{replaces > 0 ? `${renames > 0 || skips > 0 ? ' · ' : ''}${replaces} replace` : ''}</Text>
          )}
        </Box>
        <Box marginTop={1}>
          <CustomSelectInput
            items={[
              { label: 'Import now', value: 'go' },
              { label: 'Cancel', value: 'cancel' },
            ]}
            onSelect={(item) => {
              if (item.value === 'cancel') {
                handleExit();
                return;
              }
              setStep('importing');
            }}
          />
        </Box>
      </Box>
    );
  }

  return null;
};

// Space toggle handler for type-select pick mode
export function useImportPickInput(
  enabled: boolean,
  group: DiscoveredImportAsset[],
  pickCursor: number,
  setSelections: React.Dispatch<React.SetStateAction<Record<AssetType, TypeImportSelection>>>,
  activeType: AssetType,
  setPickCursor: React.Dispatch<React.SetStateAction<number>>
) {
  useInput((input, key) => {
    if (!enabled) return;
    if (key.upArrow) setPickCursor((p) => Math.max(0, p - 1));
    if (key.downArrow) setPickCursor((p) => Math.min(group.length - 1, p + 1));
    if (input === ' ') {
      const id = group[pickCursor]?.id;
      if (!id) return;
      setSelections((prev) => {
        const next = new Set(prev[activeType].selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return { ...prev, [activeType]: { ...prev[activeType], selectedIds: next } };
      });
    }
  });
}
