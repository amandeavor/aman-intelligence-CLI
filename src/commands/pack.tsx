import React, { useEffect, useMemo, useState, useRef } from 'react';
import { render, Box, Text, useApp, useInput } from 'ink';
import { packService } from '../services/pack.service.js';
import { assetService } from '../services/asset.service.js';
import { Narrator } from '../ui/components/Narrator.js';
import { ScopePrompt } from '../ui/components/ScopePrompt.js';
import { Header } from '../ui/components/Header.js';
import { NarratorState, Pack, Scope } from '../types/index.js';
import { theme } from '../ui/theme.js';
import { titleize } from '../ui/marketplaceDisplay.js';
import { ASSET_TYPE_PLURAL, ASSET_TAB_ORDER, assetCompositeKey, parseAssetCompositeKey } from '../ui/assetDisplay.js';
import { AssetType } from '../types/index.js';
import { scanAll } from '../storage/scanner.js';
import { environmentService } from '../services/environment.service.js';
import path from 'path';
import { exists } from '../storage/filesystem.js';
import { ProgressBar } from '../ui/animations/ProgressBar.js';
import { TransitionScreen } from '../ui/animations/TransitionScreen.js';
const PAGE_SIZE = 8;

type PackMode = 'select' | 'creating' | 'done' | 'inspecting' | 'scope' | 'installing';

// ── Pack Create (with skill selector) ───────────────────────────────

interface PackCreateAppProps {
  name: string;
}

export const PackCreateApp: React.FC<PackCreateAppProps & { onBack?: () => void }> = ({ name, onBack }) => {
  const { exit } = useApp();
  const handleExit = () => {
    if (onBack) onBack();
    else exit();
  };
  const [category, setCategory] = useState<AssetType>(ASSET_TAB_ORDER[0]);
  const [allItems, setAllItems] = useState<{ name: string; label: string; type: AssetType }[]>([]);
  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<PackMode>('select');
  const [state, setState] = useState<NarratorState>('idle');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const globalDir = environmentService.getActiveEnvironmentDir();
      const projectDir = environmentService.getProjectEnvironmentDir();

      const globalData = await scanAll(globalDir, 'global');
      let projectData: any = { skills: [], prompts: [], mcps: [] };
      if (exists(projectDir)) {
        projectData = await scanAll(projectDir, 'project');
      }

      function mergeAssets<T extends { name: string; originalName?: string }>(
        items: T[],
        type: AssetType
      ): { name: string; label: string; type: AssetType }[] {
        const merged = new Map<string, { name: string; label: string; type: AssetType }>();
        const seen = new Set<string>();
        for (const item of items) {
          const baseName = (item.originalName || item.name)
            .replace(/[-_\s]+\d+$/, '')
            .toLowerCase()
            .replace(/[-_\s]+/g, ' ')
            .trim();
          if (seen.has(baseName)) continue;
          seen.add(baseName);
          merged.set(item.name, { name: item.name, label: titleize(baseName), type });
        }
        return Array.from(merged.values());
      }

      setAllItems([
        ...mergeAssets([...globalData.skills, ...projectData.skills], 'skill'),
        ...mergeAssets([...globalData.prompts, ...projectData.prompts], 'prompt'),
        ...mergeAssets([...globalData.mcps, ...projectData.mcps], 'mcp'),
      ]);
      setLoading(false);
    }
    load();
  }, []);

  const items = useMemo(() => allItems.filter((i) => i.type === category), [allItems, category]);

  const visibleItems = useMemo(() => {
    if (items.length === 0) return [];
    const half = Math.floor(PAGE_SIZE / 2);
    const start = Math.max(0, Math.min(cursor - half, Math.max(0, items.length - PAGE_SIZE)));
    return items.slice(start, start + PAGE_SIZE).map((item, idx) => ({
      item,
      index: start + idx,
    }));
  }, [cursor, items]);

  useInput((input, key) => {
    if (input === 'q' || key.escape) { handleExit(); return; }
    if (mode !== 'select') return;

    if (key.leftArrow || key.rightArrow) {
      setCategory((prev) => {
        const idx = ASSET_TAB_ORDER.indexOf(prev);
        const next = key.leftArrow
          ? (idx - 1 + ASSET_TAB_ORDER.length) % ASSET_TAB_ORDER.length
          : (idx + 1) % ASSET_TAB_ORDER.length;
        return ASSET_TAB_ORDER[next];
      });
      setCursor(0);
      return;
    }
    if (key.upArrow) { setCursor((p) => Math.max(0, p - 1)); return; }
    if (key.downArrow) { setCursor((p) => Math.min(items.length - 1, p + 1)); return; }

    if (input === ' ') {
      const item = items[cursor];
      if (!item) return;
      const composite = assetCompositeKey(item.type, item.name);
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(composite)) next.delete(composite);
        else next.add(composite);
        return next;
      });
      return;
    }

    if (key.return && selected.size > 0) {
      createPack();
    }
  });

  async function createPack() {
    setMode('creating');
    setState('installing');
    setMessage(`Creating ${name}.amanpack...`);

    try {
      const selectedByType = (type: AssetType) =>
        Array.from(selected)
          .map((key) => parseAssetCompositeKey(key))
          .filter((p): p is { type: AssetType; localName: string } => p !== null && p.type === type)
          .map((p) => p.localName);

      const packDef: Pack = {
        name,
        version: '1.0.0',
        description: `Workflow pack: ${name}`,
        skills: selectedByType('skill'),
        prompts: selectedByType('prompt'),
        mcps: selectedByType('mcp'),
        stacks: [],
        createdAt: new Date().toISOString(),
      };

      const outPath = path.resolve(process.cwd(), `${name}.amanpack`);
      await packService.create(name, packDef, outPath);

      setState('success');
      setMessage(
        `Created ${name}.amanpack (${packDef.skills.length} skills, ${packDef.prompts.length} prompts, ${packDef.mcps.length} MCPs)`
      );
    } catch (err: any) {
      setState('error');
      setMessage(`Error: ${err.message}`);
    }
    setMode('done');
    setTimeout(() => handleExit(), 1000);
  }

  if (loading) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Header compact />
        <Narrator state="searching" message="Loading assets..." />
      </Box>
    );
  }

  if (mode === 'creating' || mode === 'done') {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Narrator state={state} message={message} />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Header compact />
      <Text>Select assets for <Text bold>{name}</Text></Text>
      <Box marginY={1}>
        {ASSET_TAB_ORDER.map((t) => (
          <Box key={t} marginRight={2}>
            <Text color={category === t ? theme.primary : theme.dim} bold={category === t}>
              {category === t ? '❯ ' : '  '}
              {ASSET_TYPE_PLURAL[t]}
            </Text>
          </Box>
        ))}
      </Box>

      {visibleItems.map(({ item, index }) => {
        const isCurrent = index === cursor;
        const isSelected = selected.has(assetCompositeKey(item.type, item.name));

        return (
          <Text key={item.name}>
            <Text color={isCurrent ? theme.primary : theme.dim}>
              {isCurrent ? ' › ' : '   '}
            </Text>
            <Text color={isSelected ? theme.primary : theme.secondary}>
              {isSelected ? '◆ ' : '○ '}
            </Text>
            <Text color={isCurrent ? theme.text : theme.secondary} bold={isCurrent}>
              {item.label}
            </Text>
          </Text>
        );
      })}

      <Box marginTop={1}>
        <Text color={theme.dim}>
          ←→ category  space select  enter create  q quit
          {selected.size > 0 ? `  · ${selected.size} selected` : ''}
        </Text>
      </Box>
    </Box>
  );
};

// ── Pack Inspect ────────────────────────────────────────────────────

interface PackInspectAppProps {
  packPath: string;
}

export const PackInspectApp: React.FC<PackInspectAppProps & { onBack?: () => void }> = ({ packPath, onBack }) => {
  const { exit } = useApp();
  const handleExit = () => {
    if (onBack) onBack();
    else exit();
  };
  const [manifest, setManifest] = useState<Pack | null>(null);
  const [error, setError] = useState<string | null>(null);

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    async function inspect() {
      try {
        const m = await packService.inspect(packPath);
        setManifest(m);
      } catch (err: any) {
        setError(err.message);
      }
      setTimeout(() => handleExit(), 300);
    }
    inspect();
  }, [packPath]);

  useInput((input, key) => {
    if (key.escape || input === 'q') {
      handleExit();
    }
  });

  if (error) {
    return (
      <Box paddingX={1}>
        <Narrator state="error" message={error} />
      </Box>
    );
  }

  if (!manifest) {
    return (
      <Box paddingX={1}>
        <Narrator state="searching" message="Inspecting..." />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>{titleize(manifest.name)}</Text>
      {manifest.version && <Text color={theme.dim}>v{manifest.version}</Text>}
      {manifest.description && <Text color={theme.secondary}>{manifest.description}</Text>}
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.dim}>Skills: {manifest.skills.length}</Text>
        <Text color={theme.dim}>Prompts: {manifest.prompts.length}</Text>
        <Text color={theme.dim}>MCPs: {manifest.mcps.length}</Text>
        <Text color={theme.dim}>Stacks: {manifest.stacks.length}</Text>
      </Box>
      {manifest.skills.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text bold color={theme.primary}>Skills</Text>
          {manifest.skills.map((s) => (
            <Text key={s} color={theme.dim}>
              {'  '}✓ {titleize(s)}
            </Text>
          ))}
        </Box>
      )}
      {manifest.prompts.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text bold color={theme.primary}>Prompts</Text>
          {manifest.prompts.map((p) => (
            <Text key={p} color={theme.dim}>
              {'  '}✓ {titleize(p)}
            </Text>
          ))}
        </Box>
      )}
      {manifest.mcps.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text bold color={theme.primary}>MCPs</Text>
          {manifest.mcps.map((m) => (
            <Text key={m} color={theme.dim}>
              {'  '}✓ {titleize(m)}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
};

// ── Pack Install ────────────────────────────────────────────────────

interface PackInstallAppProps {
  packPath: string;
  initialScope?: Scope;
}

export const PackInstallApp: React.FC<PackInstallAppProps & { onBack?: () => void }> = ({ packPath, initialScope, onBack }) => {
  const { exit } = useApp();
  const handleExit = () => {
    if (onBack) onBack();
    else exit();
  };
  const [scope, setScope] = useState<Scope | undefined>(initialScope);
  const [state, setState] = useState<NarratorState>('idle');
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState(0);

  const started = useRef(false);
  useEffect(() => {
    if (!scope) return;
    if (started.current) return;
    started.current = true;

    async function install() {
      setState('installing');
      setMessage(`Installing pack...`);

      try {
        await packService.install(packPath, scope!, (p) => setProgress(p));
        setState('success');
        setMessage(`Installed pack → ${scope === 'project' ? 'project' : 'global'}`);
      } catch (err: any) {
        setState('error');
        setMessage(`Error: ${err.message}`);
      }
      setTimeout(() => handleExit(), 1000);
    }
    install();
  }, [packPath, scope]);

  useInput((input, key) => {
    if (key.escape || input === 'q') {
      handleExit();
    }
  });

  if (!scope) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Header compact />
        <ScopePrompt onSelect={(s) => setScope(s)} />
      </Box>
    );
  }

  return (
    <Box paddingX={1} flexDirection="column">
      <Narrator state={state} message={message} />
      {state === 'installing' && (
        <Box marginTop={1}>
          <ProgressBar progress={progress} />
        </Box>
      )}
    </Box>
  );
};

// ── Entry point ─────────────────────────────────────────────────────

export async function packCommand(args: string[], options: any) {
  const subcmd = args[0];

  if (subcmd === 'create') {
    const name = args[1];
    if (!name) {
      console.log('  Usage: aman pack create <name>');
      return;
    }
    if (!process.stdin.isTTY) {
      console.log('  ERROR: Selective pack creation requires an interactive TTY terminal.');
      process.exit(1);
    }
    const { waitUntilExit } = render(<PackCreateApp name={name} />);
    await waitUntilExit();
  } else if (subcmd === 'inspect') {
    const packPath = args[1];
    if (!packPath) {
      console.log('  Usage: aman pack inspect <file.amanpack>');
      return;
    }
    if (!process.stdin.isTTY) {
      console.log('  ◌ Inspecting...');
      try {
        const manifest = await packService.inspect(packPath);
        console.log(`  ${titleize(manifest.name)}`);
        console.log(`  v${manifest.version || '1.0.0'}`);
        console.log(`  ${manifest.description || ''}\n`);
        console.log(`  Skills: ${manifest.skills.length}`);
        console.log(`  Prompts: ${manifest.prompts.length}`);
        console.log(`  MCPs: ${manifest.mcps.length}`);
        console.log(`  Stacks: ${manifest.stacks.length}\n`);
        console.log('  Contents:');
        manifest.skills.forEach((s) => console.log(`    ${titleize(s)}`));
      } catch (err: any) {
        console.log(`  ✗ Inspect error: ${err.message}`);
        process.exit(1);
      }
      return;
    }
    const { waitUntilExit } = render(<PackInspectApp packPath={packPath} />);
    await waitUntilExit();
  } else if (subcmd === 'install') {
    const packPath = args[1];
    if (!packPath) {
      console.log('  Usage: aman pack install <file.amanpack>');
      return;
    }
    let scope: Scope | undefined = options.project || options.p
      ? 'project'
      : options.global || options.g
        ? 'global'
        : undefined;

    if (!process.stdin.isTTY && !scope) {
      scope = 'project';
    }

    if (!process.stdin.isTTY) {
      console.log(`  ◌ Installing pack ${packPath} → ${scope}...`);
      try {
        await packService.install(packPath, scope!);
        console.log(`  ✓ Installed pack → ${scope}`);
      } catch (err: any) {
        console.log(`  ✗ Install error: ${err.message}`);
        process.exit(1);
      }
      return;
    }

    const { waitUntilExit } = render(
      <TransitionScreen message={`Preparing pack installation for ${path.basename(packPath)}...`}>
        <PackInstallApp packPath={packPath} initialScope={scope} />
      </TransitionScreen>
    );
    await waitUntilExit();
  } else {
    console.log('  Usage: aman pack <create|inspect|install> [args]');
  }
}
