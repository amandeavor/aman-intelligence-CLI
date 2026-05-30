import React from 'react';
import { Text } from 'ink';
import { theme } from '../theme.js';

interface SuccessIndicatorProps {
  message?: string;
}

export const SuccessIndicator = ({ message }: SuccessIndicatorProps) => {
  return (
    <Text color={theme.success}>
      <Text bold>✓</Text>{message ? ` ${message}` : ''}
    </Text>
  );
};
