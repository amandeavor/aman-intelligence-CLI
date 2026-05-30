import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../theme.js';

interface HeaderProps {
  compact?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ compact }) => {
  if (compact) {
    return (
      <Box marginBottom={1}>
        <Text color={theme.primary} bold>aman</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={theme.primary} bold>aman</Text>
      <Text color={theme.dim}>AI environment manager</Text>
    </Box>
  );
};
