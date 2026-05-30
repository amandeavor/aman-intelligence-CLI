import React, { useEffect, useState } from 'react';
import { render, Box, Text, useApp, useInput } from 'ink';
import { CustomSelectInput } from '../ui/components/CustomSelect.js';
import { githubService } from '../services/github.service.js';
import { classificationService, ClassificationResult } from '../services/classification.service.js';
import { assetService } from '../services/asset.service.js';
import { ScopePrompt } from '../ui/components/ScopePrompt.js';
import { Narrator } from '../ui/components/Narrator.js';
import { Header } from '../ui/components/Header.js';
import { NarratorState, Scope } from '../types/index.js';
import { theme } from '../ui/theme.js';
import { titleize } from '../ui/marketplaceDisplay.js';
import { averageConfidence, assetTypeBadge } from '../ui/assetDisplay.js';
import { removeDir, isPathSafe } from '../storage/filesystem.js';
import path from 'path';
import { ProgressBar } from '../ui/animations/ProgressBar.js';
import { TransitionScreen } from '../ui/animations/TransitionScreen.js';

type ImportMode = 'cloning' | 'scanning' | 'preview' | 'review' | 'scope' | 'installing' | 'done';

export interface ImportAppProps {
  source: string;
  initialScope?: Scope;
  onBack?: () => void;
}

export const ImportApp: React.FC<ImportAppProps> = ({ source, initialScope, onBack }) => {
  const { exit } = useApp();
  const handleExit = () => {
    if (onBack) onBack();
    else exit();
  };

  const [mode, setMode] = useState<ImportMode>('cloning');
  const [state, setState] = useState<NarratorState>('searching');
  const [message, setMessage] = useState(`Cloning ${source}...`);
  const [tempDir, setTempDir] = useState('');
  const [classifications, setClassifications] = useState<ClassificationResult[]>([]);
  const [scope, setScope] = useState<Scope | undefined>(initialScope);
  const [progress, setProgress] = useState(0);

  useInput((input, key) => {
    if (input === 'q' || key.escape) {
      if (tempDir) removeDir(tempDir).catch(() => {});
      handleExit();
    }
  });

  // Step 1: Clone
  useEffect(() => {
    async function clone() {
      try {
        const dir = await githubService.import(source);
        setTempDir(dir);
        setMode('scanning');
        setMessage(`Scanning ${source}...`);
      } catch (err: any) {
        setState('error');
        setMessage(`Error: ${err.message}`);
        setMode('done');
        setTimeout(() => handleExit(), 1800);
      }
    }
    clone();
  }, [source]);

  // Step 2: Classify
  useEffect(() => {
    if (mode !== 'scanning' || !tempDir) return;

    async function classify() {
      const results = await classificationService.classifyDirectory(tempDir);
      setClassifications(results);
      setMode('preview');
    }
    classify();
  }, [mode, tempDir]);

  // Step 3: Install after scope selection
  useEffect(() => {
    if (mode !== 'installing' || !scope || !tempDir) return;
    const targetScope = scope;

    async function install() {
      setState('installing');

      const highConf = classificationService.highConfidence(classifications);
      let installed = 0;
      let processed = 0;

      for (const c of highConf) {
        let filePath = path.resolve(tempDir, c.file);
        
        // Priority 2: Security check
        const safe = await isPathSafe(filePath, tempDir);
        if (!safe) {
          setState('error');
          setMessage(`Security Error: Path traversal escape attempt detected inside file: ${c.file}`);
          setMode('done');
          setTimeout(() => handleExit(), 3000);
          return;
        }

        let baseName = c.file.replace(/\.[^.]+$/, '').replace(/[/\\]/g, '-');
        if (c.type === 'skill') {
          filePath = path.dirname(filePath);
          if (filePath === tempDir) {
            baseName = path.basename(source).replace(/\.git$/, '');
          } else {
            baseName = path.basename(filePath);
          }
        }

        try {
          if (c.type === 'skill' || c.type === 'prompt' || c.type === 'mcp') {
            // Priority 4: Collision safety check
            const existingAssets = await assetService.list(c.type, targetScope);
            let name = baseName;
            let suffix = 1;
            while (existingAssets.some((item) => item.name === name)) {
              name = `${baseName}-${suffix}`;
              suffix++;
            }

            const metadataOverride: any = {};
            if (name !== baseName) {
              metadataOverride.originalName = baseName;
              metadataOverride.resolvedName = name;
            }

            await assetService.install(name, c.type, targetScope, filePath, source, metadataOverride);
            installed++;
          }
          // Remember classification for future syncs
          await classificationService.remember(c.file, c.type as any);
        } catch {
          // Skip failures silently
        }
        processed++;
        setProgress(Math.round((processed / highConf.length) * 100));
      }

      setState('success');
      setMessage(`Imported ${installed} assets → ${scope === 'project' ? 'project' : 'global'}`);
      setMode('done');

      // Cleanup
      await removeDir(tempDir).catch(() => {});
      setTimeout(() => handleExit(), 1200);
    }

    install();
  }, [mode, scope, tempDir, classifications]);

  // Cloning / scanning
  if (mode === 'cloning' || mode === 'scanning') {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Header compact />
        <Narrator state={state} message={message} />
      </Box>
    );
  }

  // Installing / done
  if (mode === 'installing' || mode === 'done') {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Narrator state={state} message={message} />
        {mode === 'installing' && (
          <Box marginTop={1}>
            <ProgressBar progress={progress} />
          </Box>
        )}
      </Box>
    );
  }

  // Scope selection
  if (mode === 'scope') {
    const summary = classificationService.summarize(classificationService.highConfidence(classifications));
    return (
      <Box flexDirection="column" paddingX={1}>
        <Header compact />
        <Text>Import {summary.skills + summary.prompts + summary.mcps} assets</Text>
        <Box marginTop={1}>
          <ScopePrompt onSelect={(s) => { setScope(s); setMode('installing'); }} />
        </Box>
      </Box>
    );
  }

  // Preview
  if (mode === 'preview') {
    const summary = classificationService.summarize(classifications);
    const lowConf = classificationService.lowConfidence(classifications);
    const reviewItems = [
      { label: 'Continue', value: 'continue' },
      ...(lowConf.length > 0 ? [{ label: `Review ${lowConf.length} unknown files`, value: 'review' }] : []),
    ];

    return (
      <Box flexDirection="column" paddingX={1}>
        <Header compact />

        <Text bold>Detected Assets in {source}:</Text>
        <Box marginTop={1} flexDirection="column">
          <Text>  Skills: <Text color={theme.primary} bold>{summary.skills}</Text></Text>
          <Text>  Prompts: <Text color={theme.success} bold>{summary.prompts}</Text></Text>
          <Text>  MCPs: <Text color={theme.warning} bold>{summary.mcps}</Text></Text>
          {summary.stacks > 0 && <Text>  Stacks: <Text color={theme.accent} bold>{summary.stacks}</Text></Text>}
          {summary.unknown > 0 && <Text>  Unknown: <Text color={theme.dim}>{summary.unknown}</Text></Text>}
          <Box marginTop={1}>
            <Text>
              {'  '}Confidence (auto-import ≥50%):{' '}
              <Text bold color={theme.primary}>
                {averageConfidence(classificationService.highConfidence(classifications))}%
              </Text>
            </Text>
          </Box>
          <Box marginTop={1} flexDirection="column">
            <Text color={theme.dim}>Ready to import:</Text>
            {classificationService.highConfidence(classifications).slice(0, 10).map((c, i) => (
              <Text key={i} color={theme.dim}>
                {'  '}
                {c.type === 'skill' || c.type === 'prompt' || c.type === 'mcp'
                  ? assetTypeBadge(c.type)
                  : `[${c.type}]`}{' '}
                {c.file} — {c.confidence}% ({c.reason})
              </Text>
            ))}
            {classificationService.highConfidence(classifications).length > 10 && (
              <Text color={theme.dim}>
                {'  '}…and {classificationService.highConfidence(classifications).length - 10} more
              </Text>
            )}
          </Box>
        </Box>

        <Box marginTop={1}>
          <CustomSelectInput
            items={reviewItems}
            onSelect={(item) => {
              if (item.value === 'continue') {
                if (initialScope) {
                  setScope(initialScope);
                  setMode('installing');
                } else {
                  setMode('scope');
                }
              }
              if (item.value === 'review') setMode('review');
            }}
          />
        </Box>
      </Box>
    );
  }

  // Review unknown files
  if (mode === 'review') {
    const lowConf = classificationService.lowConfidence(classifications);

    return (
      <Box flexDirection="column" paddingX={1}>
        <Header compact />
        <Text bold>Review unknown files</Text>
        <Box marginTop={1} flexDirection="column">
          {lowConf.map((c, i) => (
            <Text key={i} color={theme.dim}>
              {c.file} → {c.type} ({c.confidence}%) — {c.reason}
            </Text>
          ))}
        </Box>
        <Box marginTop={1}>
          <CustomSelectInput
            items={[{ label: 'Continue without unknowns', value: 'continue' }]}
            onSelect={() => {
              if (initialScope) {
                setScope(initialScope);
                setMode('installing');
              } else {
                setMode('scope');
              }
            }}
          />
        </Box>
      </Box>
    );
  }

  return null;
};

export async function importCommand(args: string[], options: any) {
  const source = args[0];
  if (!source) {
    console.log('  Usage: aman import <source>');
    console.log('  Examples:');
    console.log('    aman import user/repo');
    console.log('    aman import ./local-folder');
    console.log('    aman import https://github.com/user/repo');
    return;
  }

  const initialScope: Scope | undefined = options.project || options.p
    ? 'project'
    : options.global || options.g
      ? 'global'
      : undefined;

  if (!process.stdin.isTTY) {
    if (!initialScope) {
      console.error('\n  \x1b[31;1mError: Interactive mode unavailable in non-TTY terminals.\x1b[0m');
      console.error('  Please specify target scope using \x1b[33m--project\x1b[0m or \x1b[33m--global\x1b[0m.\n');
      process.exit(1);
    }

    console.log(`\n  ◌ Cloning ${source}...`);
    try {
      const tempDir = await githubService.import(source);
      console.log(`  ◌ Scanning ${source}...`);
      const classifications = await classificationService.classifyDirectory(tempDir);
      const highConf = classificationService.highConfidence(classifications);

      if (highConf.length === 0) {
        await removeDir(tempDir).catch(() => {});
        console.log('  No recognizable assets found in source. Nothing imported.');
        return;
      }

      console.log(`  Found ${highConf.length} high-confidence assets to import.`);
      let installed = 0;
      for (const c of highConf) {
        let filePath = path.resolve(tempDir, c.file);
        const safe = await isPathSafe(filePath, tempDir);
        if (!safe) {
          throw new Error(`Security Exception: Path traversal escape attempt detected inside file: ${c.file}`);
        }
        let baseName = c.file.replace(/\.[^.]+$/, '').replace(/[/\\]/g, '-');
        if (c.type === 'skill') {
          filePath = path.dirname(filePath);
          if (filePath === tempDir) {
            baseName = path.basename(source).replace(/\.git$/, '');
          } else {
            baseName = path.basename(filePath);
          }
        }
        if (c.type === 'skill' || c.type === 'prompt' || c.type === 'mcp') {
          const existingAssets = await assetService.list(c.type, initialScope);
          let name = baseName;
          let suffix = 1;
          while (existingAssets.some((item) => item.name === name)) {
            name = `${baseName}-${suffix}`;
            suffix++;
          }
          const metadataOverride: any = {};
          if (name !== baseName) {
            metadataOverride.originalName = baseName;
            metadataOverride.resolvedName = name;
          }
          await assetService.install(name, c.type, initialScope, filePath, source, metadataOverride);
          installed++;
        }
        await classificationService.remember(c.file, c.type as any);
      }
      
      await removeDir(tempDir).catch(() => {});
      console.log(`  \x1b[32m✓ Imported ${installed} assets to ${initialScope} scope successfully.\x1b[0m\n`);
    } catch (err: any) {
      console.error(`  \x1b[31m✗ Import failed: ${err.message}\x1b[0m\n`);
      process.exit(1);
    }
    return;
  }

  const { waitUntilExit } = render(
    <TransitionScreen message={`Preparing to import ${source}...`}>
      <ImportApp source={source} initialScope={initialScope} />
    </TransitionScreen>
  );
  await waitUntilExit();
}
