import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../theme.js';

interface TooSmallScreenProps {
  columns: number;
  rows: number;
  minColumns: number;
  minRows: number;
}

export const TooSmallScreen = ({
  columns,
  rows,
  minColumns,
  minRows,
}: TooSmallScreenProps) => {
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color={theme.error}>
        Terminal too small
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text>
          Current: {columns}×{rows}
        </Text>
        <Text>
          Required: {minColumns}×{minRows}
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text color={theme.primary}>
          Please enlarge the terminal.
        </Text>
      </Box>
    </Box>
  );
};
