import React from 'react';
import { Box, Text } from 'ink';
import { CustomSelectInput } from './CustomSelect.js';
import { ScopePrompt } from './ScopePrompt.js';
import { theme } from '../theme.js';
import { AssetType, Scope } from '../../types/index.js';
import { ASSET_TYPE_PLURAL } from '../assetDisplay.js';
import { titleize } from '../marketplaceDisplay.js';

export interface MarketplaceInstallDetails {
  name: string;
  type: AssetType;
  slug?: string;
  author?: string;
  version?: string;
  source: string;
  checksum?: string;
  verified?: boolean;
}

interface MarketplaceInstallConfirmProps {
  details: MarketplaceInstallDetails;
  onConfirm: (scope: Scope) => void;
  onCancel: () => void;
}

export const MarketplaceInstallConfirm: React.FC<MarketplaceInstallConfirmProps> = ({
  details,
  onConfirm,
  onCancel,
}) => {
  const [phase, setPhase] = React.useState<'review' | 'scope'>('review');

  if (phase === 'scope') {
    return (
      <Box flexDirection="column">
        <Text bold>Install {titleize(details.name)}?</Text>
        <Box marginTop={1}>
          <ScopePrompt onSelect={(s) => onConfirm(s)} />
        </Box>
        <Box marginTop={1}>
          <Text color={theme.dim}>Select scope · esc cancel</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold>Install {titleize(details.name)}?</Text>
      <Text>{' '}</Text>
      <Text>
        Type: <Text color={theme.text}>{ASSET_TYPE_PLURAL[details.type].slice(0, -1)}</Text>
      </Text>
      {details.author && (
        <Text>
          Author: <Text color={theme.text}>{details.author}</Text>
          {details.verified ? <Text color={theme.success}> ✓ Aman</Text> : null}
        </Text>
      )}
      {details.version && (
        <Text>
          Version: <Text color={theme.text}>{details.version}</Text>
        </Text>
      )}
      <Text>
        Source: <Text color={theme.text}>{details.source}</Text>
      </Text>
      {details.checksum && (
        <Text>
          Checksum: <Text color={theme.dim}>{details.checksum}</Text>
        </Text>
      )}
      <Box marginTop={1}>
        <CustomSelectInput
          items={[
            { label: '❯ Install', value: 'install' },
            { label: '  Cancel', value: 'cancel' },
          ]}
          onSelect={(item) => {
            if (item.value === 'cancel') onCancel();
            else setPhase('scope');
          }}
        />
      </Box>
    </Box>
  );
};
