import React from 'react';
import { Box, Text, useInput } from 'ink';
import { theme } from '../theme.js';

interface ConfirmProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const Confirm: React.FC<ConfirmProps> = ({ message, onConfirm, onCancel }) => {
  useInput((input) => {
    if (input === 'y' || input === 'Y') {
      onConfirm();
    } else if (input === 'n' || input === 'N') {
      onCancel();
    }
  });

  return (
    <Box>
      <Text>{message} </Text>
      <Text color={theme.dim}>(y/n)</Text>
    </Box>
  );
};
