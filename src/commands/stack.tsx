import React, { useEffect, useMemo, useState, useRef } from 'react';
import { render, Box, Text, useApp, useInput } from 'ink';
import { stackService } from '../services/stack.service.js';
import { assetService } from '../services/asset.service.js';
import { Narrator } from '../ui/components/Narrator.js';
import { Header } from '../ui/components/Header.js';
import { NarratorState, Scope, Stack, AssetType } from '../types/index.js';
import { theme } from '../ui/theme.js';
import { titleize } from '../ui/marketplaceDisplay.js';
import { scanAll } from '../storage/scanner.js';
import { environmentService } from '../services/environment.service.js';
import { exists } from '../storage/filesystem.js';
import {
  ASSET_TAB_ORDER,
  ASSET_TYPE_PLURAL,
  assetCompositeKey,
  parseAssetCompositeKey,
} from '../ui/assetDisplay.js';

const PAGE_SIZE = 8;

async function installStackMembers(stack: Stack, stackName: string): Promise<{ installed: number; skills: number; prompts: number; mcps: number }> {
  let installed = 0;
  let skills = 0;
  let prompts = 0;
  let mcps = 0;

  const members: Array<{ name: string; type: AssetType }> = [
    ...stack.skills.map((name) => ({ name, type: 'skill' as const })),
    ...stack.prompts.map((name) => ({ name, type: 'prompt' as const })),
    ...stack.mcps.map((name) => ({ name, type: 'mcp' as const })),
  ];

  for (const { name, type } of members) {
    try {
      await assetService.install(name, type, 'project', undefined, `stack:${stackName}`);
      installed++;
      if (type === 'skill') skills++;
      if (type === 'prompt') prompts++;
      if (type === 'mcp') mcps++;
    } catch {
      // Already installed or not found
    }
  }

  return { installed, skills, prompts, mcps };
}

function activationSummary(counts: { skills: number; prompts: number; mcps: number }): string {
  const parts: string[] = [];
  if (counts.skills > 0) parts.push(`${counts.skills} skill${counts.skills !== 1 ? 's' : ''}`);
  if (counts.prompts > 0) parts.push(`${counts.prompts} prompt${counts.prompts !== 1 ? 's' : ''}`);
  if (counts.mcps > 0) parts.push(`${counts.mcps} MCP${counts.mcps !== 1 ? 's' : ''}`);
  return parts.length > 0 ? parts.join(', ') : '0 assets';
}

// ── Stack Create (all asset types) ──────────────────────────────────

interface StackCreateAppProps {
  name: string;
  scope: Scope;
}

export const StackCreateApp: React.FC<StackCreateAppProps & { onBack?: () => void }> = ({ name, scope, onBack }) => {
  const { exit } = useApp();
  const handleExit = () => {
    if (onBack) onBack();
    else exit();
  };
  const [category, setCategory] = useState<AssetType>(ASSET_TAB_ORDER[0]);
  const [allItems, setAllItems] = useState<{ name: string; label: string; type: AssetType }[]>([]);
  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [done, setDone] = useState(false);
  const [state, setState] = useState<NarratorState>('idle');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const globalDir = environmentService.getActiveEnvironmentDir();
      const projectDir = environmentService.getProjectEnvironmentDir();

      const globalData = await scanAll(globalDir, 'global');
      let projectData: { skills: { name: string; originalName?: string }[]; prompts: { name: string; originalName?: string }[]; mcps: { name: string; originalName?: string }[] } = {
        skills: [],
        prompts: [],
        mcps: [],
      };
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
    if (input === 'q' || key.escape) {
      handleExit();
      return;
    }
    if (done) return;

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
    if (key.upArrow) {
      setCursor((p) => Math.max(0, p - 1));
      return;
    }
    if (key.downArrow) {
      setCursor((p) => Math.min(items.length - 1, p + 1));
      return;
    }

    if (input === ' ') {
      const item = items[cursor];
      if (!item) return;
      const keyId = assetCompositeKey(item.type, item.name);
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(keyId)) next.delete(keyId);
        else next.add(keyId);
        return next;
      });
      return;
    }

    if (key.return && selected.size > 0) {
      createStack();
    }
  });

  async function createStack() {
    setDone(true);
    setState('installing');
    setMessage(`Creating stack: ${name}...`);

    try {
      const skills: string[] = [];
      const prompts: string[] = [];
      const mcps: string[] = [];

      for (const keyId of selected) {
        const parsed = parseAssetCompositeKey(keyId);
        if (!parsed) continue;
        if (parsed.type === 'skill') skills.push(parsed.localName);
        if (parsed.type === 'prompt') prompts.push(parsed.localName);
        if (parsed.type === 'mcp') mcps.push(parsed.localName);
      }

      await stackService.create(scope, name, skills, prompts, mcps, `Stack: ${name}`);
      setState('success');
      setMessage(
        `Created stack: ${name} (${skills.length} skills, ${prompts.length} prompts, ${mcps.length} MCPs)`
      );
    } catch (err: any) {
      setState('error');
      setMessage(`Error: ${err.message}`);
    }
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

  if (done) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Narrator state={state} message={message} />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Header compact />
      <Text>
        Select assets for <Text bold>{name}</Text> stack
      </Text>
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

      {items.length === 0 ? (
        <Text color={theme.dim}>No installed {ASSET_TYPE_PLURAL[category].toLowerCase()} in this environment.</Text>
      ) : (
        visibleItems.map(({ item, index }) => {
          const isCurrent = index === cursor;
          const isSelected = selected.has(assetCompositeKey(item.type, item.name));
          return (
            <Text key={assetCompositeKey(item.type, item.name)}>
              <Text color={isCurrent ? theme.primary : theme.dim}>{isCurrent ? ' › ' : '   '}</Text>
              <Text color={isSelected ? theme.primary : theme.secondary}>{isSelected ? '◆ ' : '○ '}</Text>
              <Text color={isCurrent ? theme.text : theme.secondary} bold={isCurrent}>
                {item.label}
              </Text>
            </Text>
          );
        })
      )}

      <Box marginTop={1}>
        <Text color={theme.dim}>
          ←→ type · space select · enter create · q quit
          {selected.size > 0 ? ` · ${selected.size} selected` : ''}
        </Text>
      </Box>
    </Box>
  );
};

// ── Stack Activate ──────────────────────────────────────────────────

interface StackActivateAppProps {
  name: string;
  scope: Scope;
}

export const StackActivateApp: React.FC<StackActivateAppProps & { onBack?: () => void }> = ({ name, scope, onBack }) => {
  const { exit } = useApp();
  const handleExit = () => {
    if (onBack) onBack();
    else exit();
  };
  const [state, setState] = useState<NarratorState>('installing');
  const [message, setMessage] = useState(`Activating ${name}...`);

  useInput((input, key) => {
    if (key.escape || input === 'q') {
      handleExit();
    }
  });

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    async function activate() {
      try {
        const stacks = await stackService.list(scope);
        const stack = stacks.find((s) => s.name === name);
        if (!stack) {
          setState('error');
          setMessage(`Stack "${name}" not found`);
          setTimeout(() => handleExit(), 1200);
          return;
        }

        const counts = await installStackMembers(stack, name);

        setState('success');
        setMessage(`Activated ${name} → ${activationSummary(counts)} loaded into project`);
      } catch (err: any) {
        setState('error');
        setMessage(`Error: ${err.message}`);
      }
      setTimeout(() => handleExit(), 1000);
    }
    activate();
  }, [name, scope]);

  return (
    <Box paddingX={1}>
      <Narrator state={state} message={message} />
    </Box>
  );
};

async function listStacks(scope: Scope) {
  const stacks = await stackService.list(scope);
  if (stacks.length === 0) {
    console.log(`  No stacks in ${scope}.`);
    return;
  }

  for (const s of stacks) {
    const parts: string[] = [];
    if (s.skills.length > 0) parts.push(`${s.skills.length} skills`);
    if (s.prompts.length > 0) parts.push(`${s.prompts.length} prompts`);
    if (s.mcps.length > 0) parts.push(`${s.mcps.length} mcps`);
    console.log(`  ${s.name}${parts.length > 0 ? `  ${parts.join(', ')}` : ''}`);
  }
}

export async function stackCommand(args: string[], options: any) {
  const subcmd = args[0];
  const scope: Scope = options.project || options.p ? 'project' : 'global';

  if (subcmd === 'create') {
    const name = args[1];
    if (!name) {
      console.log('  Usage: aman stack create <name>');
      return;
    }
    if (!process.stdin.isTTY) {
      console.log('  ERROR: Stack creation requires an interactive TTY terminal.');
      process.exit(1);
    }
    const { waitUntilExit } = render(<StackCreateApp name={name} scope={scope} />);
    await waitUntilExit();
  } else if (subcmd === 'activate') {
    const name = args[1];
    if (!name) {
      console.log('  Usage: aman stack activate <name>');
      return;
    }
    if (!process.stdin.isTTY) {
      console.log(`  ◌ Activating stack ${name} → project...`);
      try {
        const stacks = await stackService.list(scope);
        const stack = stacks.find((s) => s.name === name);
        if (!stack) {
          console.log(`  ✗ Error: Stack "${name}" not found`);
          process.exit(1);
        }
        const counts = await installStackMembers(stack, name);
        console.log(`  ✓ Activated ${name} → ${activationSummary(counts)} loaded into project`);
      } catch (err: any) {
        console.log(`  ✗ Activation error: ${err.message}`);
        process.exit(1);
      }
      return;
    }
    const { waitUntilExit } = render(<StackActivateApp name={name} scope={scope} />);
    await waitUntilExit();
  } else if (subcmd === 'list') {
    await listStacks(scope);
  } else if (subcmd === 'remove') {
    const name = args[1];
    if (!name) {
      console.log('  Usage: aman stack remove <name>');
      return;
    }
    try {
      await stackService.remove(scope, name);
      console.log(`  ✓ Stack ${name} removed`);
    } catch (err: any) {
      console.error(`  ✗ Error: ${err.message}`);
    }
  } else {
    console.log('  Usage: aman stack <create|activate|list|remove> [name]');
  }
}
