import React, { useEffect, useState } from 'react';
import { render, Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { CustomSelectInput } from '../ui/components/CustomSelect.js';
import { assetService } from '../services/asset.service.js';
import { marketplaceService, type InstallCandidate } from '../services/marketplace.service.js';
import { registryService, isRegistryInstallReference } from '../registry/registry.service.js';
import { ScopePrompt } from '../ui/components/ScopePrompt.js';
import { Narrator } from '../ui/components/Narrator.js';
import { Header } from '../ui/components/Header.js';
import { NarratorState, Scope, AssetType } from '../types/index.js';
import { theme } from '../ui/theme.js';
import { metadataParts, shortDescription, titleize } from '../ui/marketplaceDisplay.js';
import { ASSET_TAB_ORDER, ASSET_TYPE_PLURAL } from '../ui/assetDisplay.js';
import { TransitionScreen } from '../ui/animations/TransitionScreen.js';

interface InstallAppProps {
  name: string;
  initialScope?: Scope;
  initialType?: AssetType;
}

function scopeLabel(scope: Scope): string {
  return scope === 'project' ? 'project' : 'global';
}

const InstallApp: React.FC<InstallAppProps> = ({ name, initialScope, initialType }) => {
  const { exit } = useApp();
  const [scope, setScope] = useState<Scope | undefined>(initialScope);
  const [assetType, setAssetType] = useState<AssetType | undefined>(initialType);
  const [candidate, setCandidate] = useState<InstallCandidate | null>(null);
  const [registryRef, setRegistryRef] = useState<{ slug: string; version: string } | null>(null);
  const [lookupDone, setLookupDone] = useState(false);
  const [state, setState] = useState<NarratorState>('searching');
  const [message, setMessage] = useState(`Looking up ${name}...`);

  useInput((input) => {
    if (input === 'q') exit();
  });

  useEffect(() => {
    let active = true;

    async function lookup() {
      try {
        const parsedRegistry = registryService.parseInstallReference(name);
        if (parsedRegistry) {
          if (!active) return;
          setRegistryRef(parsedRegistry);
          setLookupDone(true);
          setMessage(`Registry: ${parsedRegistry.slug}@${parsedRegistry.version}`);
          return;
        }

        const types = assetType ? [assetType] : ASSET_TAB_ORDER;
        let match: InstallCandidate | null = null;

        for (const type of types) {
          const results = await marketplaceService.search(name, type);
          const found = results.find(
            (item) => item.name.toLowerCase() === name.toLowerCase().replace(/\s+/g, '-')
          );
          if (found) {
            match = await marketplaceService.findInstallCandidate(found.name);
            if (match) break;
          }
        }

        if (!match) {
          match = await marketplaceService.findInstallCandidate(name);
        }

        if (!active) return;

        if (!match) {
          setState('error');
          setMessage(`Could not find "${name}" in marketplace or bundled assets`);
          setLookupDone(true);
          setTimeout(() => exit(), 1800);
          return;
        }

        setCandidate(match);
        setAssetType(match.type);
        setLookupDone(true);
        setMessage(`Found ${ASSET_TYPE_PLURAL[match.type].slice(0, -1)}: ${titleize(match.name)}`);
      } catch (err: any) {
        if (!active) return;
        setState('error');
        setMessage(`Error: ${err.message}`);
        setLookupDone(true);
        setTimeout(() => exit(), 1800);
      }
    }

    lookup();
    return () => {
      active = false;
    };
  }, [exit, name, assetType]);

  useEffect(() => {
    if (!scope || !lookupDone || !registryRef) return;

    async function doRegistryInstall() {
      try {
        setState('installing');
        setMessage(`Installing ${registryRef!.slug}@${registryRef!.version}...`);
        const result = await registryService.installFromRegistry(
          registryRef!.slug,
          registryRef!.version,
          scope!
        );
        for (const warning of result.warnings) {
          console.warn(warning);
        }
        setState('success');
        setMessage(
          `Installed ${result.localName} (${registryRef!.slug}@${registryRef!.version}) → ${scopeLabel(scope!)}`
        );
        setTimeout(() => exit(), 800);
      } catch (err: any) {
        setState('error');
        setMessage(`Error: ${err.message}`);
        setTimeout(() => exit(), 1600);
      }
    }

    doRegistryInstall();
  }, [registryRef, exit, lookupDone, scope]);

  useEffect(() => {
    if (!scope || !lookupDone || !candidate || registryRef) return;
    const selectedScope = scope;

    async function doInstall() {
      try {
        setState('installing');
        setMessage(`Installing ${titleize(candidate!.name)}...`);
        await assetService.install(
          candidate!.name,
          candidate!.type,
          selectedScope,
          candidate!.sourcePath,
          candidate!.source
        );
        setState('success');
        setMessage(
          `Installed ${ASSET_TYPE_PLURAL[candidate!.type].slice(0, -1)} ${titleize(candidate!.name)} → ${scopeLabel(selectedScope)}`
        );
        setTimeout(() => exit(), 800);
      } catch (err: any) {
        setState('error');
        setMessage(`Error: ${err.message}`);
        setTimeout(() => exit(), 1600);
      }
    }

    doInstall();
  }, [candidate, exit, lookupDone, scope, name]);

  if (!lookupDone) {
    return (
      <Box paddingX={1} flexDirection="column">
        <Narrator state="searching" message={message} />
      </Box>
    );
  }

  if (!scope && state !== 'error' && (candidate || registryRef)) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text bold>
          {registryRef
            ? `${registryRef.slug}@${registryRef.version}`
            : `${titleize(candidate!.name)} (${candidate!.type})`}
        </Text>
        {candidate?.description && (
          <Text color={theme.dim}>{shortDescription(candidate.description)}</Text>
        )}
        <Box marginTop={1}>
          <ScopePrompt onSelect={(s) => setScope(s)} />
        </Box>
      </Box>
    );
  }

  return (
    <Box paddingX={1} flexDirection="column">
      <Narrator state={state} message={message} />
    </Box>
  );
};

type WizardStep = 'type' | 'source' | 'name' | 'scope' | 'installing' | 'done';

export const InstallWizardApp = ({ onBack }: { onBack?: () => void }) => {
  const { exit } = useApp();
  const handleExit = () => {
    if (onBack) onBack();
    else exit();
  };

  const [step, setStep] = useState<WizardStep>('type');
  const [assetType, setAssetType] = useState<AssetType>(ASSET_TAB_ORDER[0]);
  const [source, setSource] = useState<'marketplace' | 'local' | 'github'>('marketplace');
  const [name, setName] = useState('');
  const [scope, setScope] = useState<Scope | undefined>();
  const [state, setState] = useState<NarratorState>('idle');
  const [message, setMessage] = useState('');

  useInput((input, key) => {
    if (key.escape || input === 'q') handleExit();
  });

  useEffect(() => {
    if (step !== 'installing' || !scope || !name.trim()) return;

    async function run() {
      setState('installing');
      setMessage(`Installing ${titleize(name)}...`);
      try {
        if (source === 'marketplace') {
          const candidate = await marketplaceService.findInstallCandidate(name);
          if (!candidate) throw new Error(`"${name}" not found in marketplace`);
          await assetService.install(
            candidate.name,
            candidate.type,
            scope!,
            candidate.sourcePath,
            candidate.source
          );
        } else {
          await assetService.install(name, assetType, scope!, undefined, source);
        }
        setState('success');
        setMessage(
          `Installed ${ASSET_TYPE_PLURAL[assetType].slice(0, -1)} ${titleize(name)} → ${scopeLabel(scope!)}`
        );
      } catch (err: any) {
        setState('error');
        setMessage(err.message);
      }
      setStep('done');
      setTimeout(() => handleExit(), 1200);
    }

    run();
  }, [step, scope, name, assetType, source]);

  if (step === 'type') {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Header compact />
        <Text bold color={theme.accent}>Install Asset</Text>
        <Text color={theme.dim}>Type</Text>
        <Box marginTop={1}>
          <CustomSelectInput
            items={ASSET_TAB_ORDER.map((t) => ({
              label: `${t === assetType ? '❯ ' : '  '}${ASSET_TYPE_PLURAL[t].slice(0, -1)}`,
              value: t,
            }))}
            onSelect={(item) => {
              setAssetType(item.value as AssetType);
              setStep('source');
            }}
          />
        </Box>
      </Box>
    );
  }

  if (step === 'source') {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Header compact />
        <Text bold color={theme.accent}>Install Asset</Text>
        <Text color={theme.dim}>Source</Text>
        <Box marginTop={1}>
          <CustomSelectInput
            items={[
              { label: '❯ Marketplace', value: 'marketplace' },
              { label: '  Local / Bundled', value: 'local' },
              { label: '  GitHub', value: 'github' },
            ]}
            onSelect={(item) => {
              setSource(item.value as 'marketplace' | 'local' | 'github');
              setStep('name');
            }}
          />
        </Box>
      </Box>
    );
  }

  if (step === 'name') {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Header compact />
        <Text bold color={theme.accent}>Install {ASSET_TYPE_PLURAL[assetType].slice(0, -1)}</Text>
        <Box marginTop={1} flexDirection="row">
          <Text color={theme.primary}>❯ </Text>
          <TextInput
            value={name}
            onChange={setName}
            onSubmit={() => setStep('scope')}
            placeholder="Asset name..."
          />
        </Box>
        <Text color={theme.dim}>press enter to continue</Text>
      </Box>
    );
  }

  if (step === 'scope') {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Header compact />
        <Text bold>{titleize(name)}</Text>
        <Text color={theme.dim}>
          {ASSET_TYPE_PLURAL[assetType].slice(0, -1)} · {source}
        </Text>
        <Box marginTop={1}>
          <ScopePrompt
            onSelect={(s) => {
              setScope(s);
              setStep('installing');
            }}
          />
        </Box>
      </Box>
    );
  }

  return (
    <Box paddingX={1}>
      <Narrator state={state} message={message} />
    </Box>
  );
};

export async function installCommand(args: string[], options: { project?: boolean; p?: boolean; global?: boolean; g?: boolean; type?: string }) {
  const name = args.join(' ').trim();

  if (isRegistryInstallReference(name)) {
    const registryRef = registryService.parseInstallReference(name)!;
    let scope: Scope | undefined = options.project || options.p
      ? 'project'
      : options.global || options.g
        ? 'global'
        : undefined;
    if (!scope && !process.stdin.isTTY) {
      scope = 'project';
    }
    if (!scope) {
      if (!process.stdin.isTTY) {
        console.error('Registry install requires --global or --project when not interactive.');
        process.exit(1);
      }
      const { waitUntilExit } = render(
        <TransitionScreen message={`Preparing registry install for ${name}...`}>
          <InstallApp name={name} initialScope={undefined} />
        </TransitionScreen>
      );
      await waitUntilExit();
      return;
    }
    const result = await registryService.installFromRegistry(registryRef.slug, registryRef.version, scope);
    for (const warning of result.warnings) {
      console.warn(warning);
    }
    console.log(`Installed ${result.localName} (${registryRef.slug}@${registryRef.version}) → ${scope}`);
    return;
  }

  let initialScope: Scope | undefined = options.project || options.p
    ? 'project'
    : options.global || options.g
      ? 'global'
      : undefined;

  const typeFlag = options.type as AssetType | undefined;
  const initialType =
    typeFlag && ASSET_TAB_ORDER.includes(typeFlag) ? typeFlag : undefined;

  if (!name) {
    if (!process.stdin.isTTY) {
      console.log('  Usage: aman install <name> [--global|--project] [--type skill|prompt|mcp]');
      return;
    }
    const { waitUntilExit } = render(<InstallWizardApp />);
    await waitUntilExit();
    return;
  }

  if (!process.stdin.isTTY && !initialScope) {
    initialScope = 'project';
  }

  const { waitUntilExit } = render(
    <TransitionScreen message={`Preparing installation for ${name}...`}>
      <InstallApp name={name} initialScope={initialScope} initialType={initialType} />
    </TransitionScreen>
  );
  await waitUntilExit();
}
