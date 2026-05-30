import React, { useEffect, useState } from 'react';
import { render, Box, Text, useApp } from 'ink';
import { packService } from '../services/pack.service.js';
import { Narrator } from '../ui/components/Narrator.js';
import { NarratorState, Pack, AssetType } from '../types/index.js';
import { scanAll } from '../storage/scanner.js';
import { environmentService } from '../services/environment.service.js';
import { ASSET_TYPE_PLURAL } from '../ui/assetDisplay.js';
import path from 'path';

interface ExportAppProps {
  name?: string;
  all: boolean;
  assetType?: AssetType;
}

const ExportApp: React.FC<ExportAppProps> = ({ name, all, assetType }) => {
  const { exit } = useApp();
  const [state, setState] = useState<NarratorState>('installing');
  const [message, setMessage] = useState('Exporting...');

  useEffect(() => {
    async function doExport() {
      try {
        const envDir = environmentService.getActiveEnvironmentDir();
        const data = await scanAll(envDir, 'global');

        let skillsToExport = data.skills;
        let promptsToExport = data.prompts;
        let mcpsToExport = data.mcps;
        let stacksToExport = data.stacks;
        let exportName = name || 'aman-export';

        if (assetType) {
          if (assetType === 'skill') {
            promptsToExport = [];
            mcpsToExport = [];
          } else if (assetType === 'prompt') {
            skillsToExport = [];
            mcpsToExport = [];
          } else {
            skillsToExport = [];
            promptsToExport = [];
          }
          stacksToExport = [];
          exportName = name || `${assetType}-export`;
        }

        if (name && !all && !assetType) {
          skillsToExport = data.skills.filter((s) => s.name === name);
          promptsToExport = data.prompts.filter((p) => p.name === name);
          mcpsToExport = data.mcps.filter((m) => m.name === name);
          stacksToExport = [];
          exportName = name;

          if (skillsToExport.length === 0 && promptsToExport.length === 0 && mcpsToExport.length === 0) {
            setState('error');
            setMessage(`Could not find asset "${name}"`);
            setTimeout(() => exit(), 1200);
            return;
          }
        }

        const packDef: Pack = {
          name: exportName,
          version: '1.0.0',
          description: all
            ? 'Full environment export'
            : assetType
              ? `Export of all ${ASSET_TYPE_PLURAL[assetType].toLowerCase()}`
              : `Export of ${exportName}`,
          skills: skillsToExport.map((s) => s.name),
          prompts: promptsToExport.map((p) => p.name),
          mcps: mcpsToExport.map((m) => m.name),
          stacks: stacksToExport.map((st) => st.name),
          createdAt: new Date().toISOString(),
        };

        const outPath = path.resolve(process.cwd(), `${exportName}.amanpack`);
        await packService.create(exportName, packDef, outPath);

        const total = packDef.skills.length + packDef.prompts.length + packDef.mcps.length;
        const typeLabel = assetType ? ASSET_TYPE_PLURAL[assetType] : 'assets';
        setState('success');
        setMessage(`Exported ${total} ${typeLabel.toLowerCase()} → ${exportName}.amanpack`);
      } catch (err: any) {
        setState('error');
        setMessage(`Error: ${err.message}`);
      }
      setTimeout(() => exit(), 1000);
    }

    doExport();
  }, [all, assetType, exit, name]);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Narrator state={state} message={message} />
    </Box>
  );
};

function parseExportType(raw?: string): AssetType | undefined {
  if (!raw) return undefined;
  const t = raw.toLowerCase();
  if (t === 'skill' || t === 'prompt' || t === 'mcp') return t;
  return undefined;
}

export async function exportCommand(args: string[], options: any) {
  const name = args[0];
  const all = Boolean(options.all) || (!name && !options.type);
  const assetType = parseExportType(options.type);

  if (options.type && !assetType) {
    console.log('  Usage: aman export [name] [--all] [--type skill|prompt|mcp]');
    return;
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    const envDir = environmentService.getActiveEnvironmentDir();
    const data = await scanAll(envDir, 'global');
    const skills = assetType === 'prompt' || assetType === 'mcp' ? [] : data.skills;
    const prompts = assetType === 'skill' || assetType === 'mcp' ? [] : data.prompts;
    const mcps = assetType === 'skill' || assetType === 'prompt' ? [] : data.mcps;
    const total = skills.length + prompts.length + mcps.length;
    if (!all && name && total === 0) {
      console.error(`  No installed assets match "${name}".`);
      process.exit(1);
    }
    if (all && total === 0) {
      console.log('  No installed assets to export.');
      return;
    }
    const packDef: Pack = {
      name: name || 'aman-export',
      version: '1.0.0',
      description: 'CLI export',
      skills: all ? skills.map((s) => s.name) : skills.filter((s) => s.name === name).map((s) => s.name),
      prompts: all ? prompts.map((p) => p.name) : prompts.filter((p) => p.name === name).map((p) => p.name),
      mcps: all ? mcps.map((m) => m.name) : mcps.filter((m) => m.name === name).map((m) => m.name),
      stacks: [],
      createdAt: new Date().toISOString(),
    };
    const exportTotal = packDef.skills.length + packDef.prompts.length + packDef.mcps.length;
    if (exportTotal === 0) {
      console.error(`  Could not find asset "${name}" to export.`);
      process.exit(1);
    }
    const outPath = path.resolve(process.cwd(), `${packDef.name}.amanpack`);
    await packService.create(packDef.name, packDef, outPath);
    console.log(`  Exported ${exportTotal} asset(s) → ${outPath}`);
    return;
  }

  const { waitUntilExit } = render(<ExportApp name={name} all={all} assetType={assetType} />);
  await waitUntilExit();
}
