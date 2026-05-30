import React from 'react';
import { Box, Text } from 'ink';
import { CustomSelectInput } from './CustomSelect.js';
import { Scope } from '../../types/index.js';
import { theme } from '../theme.js';
import { exists } from '../../storage/filesystem.js';
import path from 'path';

interface ScopePromptProps {
  label?: string;
  onSelect: (scope: Scope) => void;
}

const scopeItems = [
  { label: 'Project', value: 'project' },
  { label: 'Global', value: 'global' },
];

const scopeItemsGlobalFirst = [
  { label: 'Global', value: 'global' },
  { label: 'Project', value: 'project' },
];

function isInsideProject(): boolean {
  // Check if .aman/ or package.json exists in cwd
  return exists(path.resolve(process.cwd(), '.aman')) || exists(path.resolve(process.cwd(), 'package.json'));
}

export const ScopePrompt: React.FC<ScopePromptProps> = ({ label = 'Install location', onSelect }) => {
  const inProject = isInsideProject();
  const items = inProject ? scopeItems : scopeItemsGlobalFirst;

  return (
    <Box flexDirection="column">
      <Text color={theme.dim}>{label}</Text>
      <Box marginTop={0}>
        <CustomSelectInput
          items={items}
          onSelect={(item) => onSelect(item.value as Scope)}
        />
      </Box>
    </Box>
  );
};
