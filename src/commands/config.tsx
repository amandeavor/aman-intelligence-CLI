import React, { useEffect, useState } from 'react';
import { render, Box, Text, useApp, useInput } from 'ink';
import { CustomSelectInput } from '../ui/components/CustomSelect.js';
import { configService } from '../services/config.service.js';
import { theme } from '../ui/theme.js';
import { Header } from '../ui/components/Header.js';
import { Narrator } from '../ui/components/Narrator.js';
import { NarratorState } from '../types/index.js';

type ConfigMode = 'menu' | 'resetting' | 'done';

export const ConfigApp = ({ onBack }: { onBack?: () => void }) => {
  const { exit } = useApp();
  const handleExit = () => {
    if (onBack) onBack();
    else exit();
  };

  const [mode, setMode] = useState<ConfigMode>('menu');
  const [mochiState, setMochiState] = useState<NarratorState>('searching');
  const [message, setMessage] = useState('');
  const [currentConfig, setCurrentConfig] = useState(configService.list());

  useInput((input, key) => {
    if (input === 'q' || key.escape) handleExit();
  });

  const handleSelectSetting = (item: { label: string; value: string }) => {
    if (item.value === 'quit') {
      handleExit();
      return;
    }

    if (item.value === 'reset') {
      setMode('resetting');
      setMochiState('installing');
      setMessage('Resetting configuration to defaults...');
      setTimeout(() => {
        configService.reset();
        setCurrentConfig(configService.list());
        setMochiState('success');
        setMessage('Configuration reset successfully!');
        setMode('done');
        setTimeout(() => handleExit(), 1000);
      }, 800);
      return;
    }

    // Toggle values in place
    if (item.value === 'theme') {
      const nextTheme = currentConfig.theme === 'auto' ? 'dark' : currentConfig.theme === 'dark' ? 'light' : 'auto';
      configService.set('theme', nextTheme);
      setCurrentConfig(configService.list());
    } else if (item.value === 'defaultScope') {
      const nextScope = currentConfig.defaultScope === 'global' ? 'project' : 'global';
      configService.set('defaultScope', nextScope);
      setCurrentConfig(configService.list());
    } else if (item.value === 'animationMode') {
      const currentMode = currentConfig.animationMode || 'normal';
      const nextMode = currentMode === 'off' ? 'reduced' : currentMode === 'reduced' ? 'normal' : 'off';
      configService.set('animationMode', nextMode);
      setCurrentConfig(configService.list());
    }
  };

  if (mode === 'resetting' || mode === 'done') {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Narrator state={mochiState} message={message} />
      </Box>
    );
  }

  const storageStr = currentConfig.storage
    ? `${currentConfig.storage.type}${currentConfig.storage.repository ? ` (${currentConfig.storage.repository})` : ''}`
    : 'not initialized';

  const menuItems = [
    { label: `Theme: ${currentConfig.theme}`, value: 'theme' },
    { label: `Default Scope: ${currentConfig.defaultScope}`, value: 'defaultScope' },
    { label: `Animations: ${currentConfig.animationMode || 'normal'}`, value: 'animationMode' },
    { label: 'Reset Configuration', value: 'reset' },
    { label: onBack ? 'Back to Main Menu' : 'Save & Exit', value: 'quit' },
  ];

  return (
    <Box flexDirection="column" paddingX={1}>
      <Header compact />
      <Text bold color={theme.accent}>Settings</Text>
      <Box flexDirection="column" marginTop={1}>
        <Text color={theme.dim}>Environment: {currentConfig.environmentPath || '~/.aman'}</Text>
        <Text color={theme.dim}>Storage: {storageStr}</Text>
      </Box>
      <Box marginTop={1}>
        <CustomSelectInput items={menuItems} onSelect={handleSelectSetting} />
      </Box>
    </Box>
  );
};

export async function configCommand(args: string[]) {
  const subcmd = args[0];

  if (!subcmd) {
    if (!process.stdin.isTTY) {
      await configCommand(['list']);
      return;
    }
    const { waitUntilExit } = render(<ConfigApp />);
    await waitUntilExit();
    return;
  }

  if (subcmd === 'list') {
    const data = configService.list();
    console.log(`\n  \x1b[38;2;255;157;35mAman Configuration:\x1b[0m`);
    console.log(`  theme:        ${data.theme}`);
    console.log(`  defaultScope: ${data.defaultScope}`);
    console.log(`  envPath:      ${data.environmentPath || 'default (~/.aman)'}`);
    console.log(`  storage:      ${data.storage ? data.storage.type : 'local'}`);
    console.log(`  animations:   ${data.animationMode || 'normal'}\n`);
  } else if (subcmd === 'get') {
    const key = args[1] as any;
    if (!key) {
      console.log('  Usage: aman config get <key>');
      return;
    }
    const val = configService.get(key);
    if (typeof val === 'object' && val !== null) {
      console.log(JSON.stringify(val, null, 2));
    } else {
      console.log(val);
    }
  } else if (subcmd === 'set') {
    const key = args[1] as any;
    const value = args[2];
    if (!key || value === undefined) {
      console.log('  Usage: aman config set <key> <value>');
      return;
    }

    let parsedValue: any = value;
    if (value === 'true') parsedValue = true;
    else if (value === 'false') parsedValue = false;
    else if (!isNaN(Number(value))) parsedValue = Number(value);

    // Support nested keys or structure if needed, otherwise direct
    if (key === 'animations' || key === 'animationMode') {
      let mode = parsedValue;
      if (parsedValue === true) mode = 'normal';
      if (parsedValue === false) mode = 'off';
      configService.set('animationMode', mode as any);
    } else {
      configService.set(key, parsedValue);
    }
    console.log(`  ✓ Set ${key} → ${parsedValue}`);
  } else if (subcmd === 'reset') {
    configService.reset();
    console.log('  ✓ Configuration reset to defaults.');
  } else {
    console.log('  Unknown config command. Use: list, get, set, reset, or run "aman config" for interactive mode.');
  }
}
