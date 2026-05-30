import React from 'react';
import { Box, Text } from 'ink';
import { useResponsiveLayout } from '../layout.js';
import { theme } from '../theme.js';

interface ProgressBarProps {
  progress: number;
}

export const ProgressBar = ({ progress }: ProgressBarProps) => {
  const { isCompact } = useResponsiveLayout();
  const clampedProgress = Math.min(100, Math.max(0, progress));

  const barWidth = isCompact ? 15 : 30;
  const filledCount = Math.round((clampedProgress / 100) * barWidth);
  const emptyCount = Math.max(0, barWidth - filledCount);

  const filled = '█'.repeat(filledCount);
  const empty = '░'.repeat(emptyCount);

  const percentText = `${Math.round(clampedProgress)}%`.padStart(4);

  return (
    <Box flexDirection="row" alignItems="center">
      <Text color={theme.primary}>{filled}</Text>
      <Text color={theme.borderMuted}>{empty}</Text>
      <Text color={theme.secondary}> {percentText}</Text>
    </Box>
  );
};
