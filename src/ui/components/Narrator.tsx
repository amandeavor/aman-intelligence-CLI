import React from 'react';
import { Box, Text } from 'ink';
import { NarratorState } from '../../types/index.js';
import { theme } from '../theme.js';
import { Spinner } from '../animations/Spinner.js';
import { SuccessIndicator } from '../animations/SuccessIndicator.js';
import { ErrorIndicator } from '../animations/ErrorIndicator.js';
import { SyncActivity } from '../animations/SyncActivity.js';

interface NarratorProps {
  state: NarratorState;
  message?: string;
  compact?: boolean;
}

export const Narrator: React.FC<NarratorProps> = ({ state, message, compact = false }) => {
  const text = message || '';

  return (
    <Box marginRight={compact ? 1 : 0}>
      {(() => {
        switch (state) {
          case 'syncing':
            return <SyncActivity label={text} />;
          case 'success':
            return <SuccessIndicator message={text} />;
          case 'error':
            return <ErrorIndicator message={text} />;
          case 'searching':
          case 'installing':
          case 'updating':
            return <Spinner label={text} />;
          default:
            return (
              <Text color={theme.dim}>
                <Text bold>·</Text>{text ? ` ${text}` : ''}
              </Text>
            );
        }
      })()}
    </Box>
  );
};
