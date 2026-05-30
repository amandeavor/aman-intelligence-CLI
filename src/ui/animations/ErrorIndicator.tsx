import React from 'react';
import { Text } from 'ink';
import { theme } from '../theme.js';

interface ErrorIndicatorProps {
  message?: string;
}

export const ErrorIndicator = ({ message }: ErrorIndicatorProps) => {
  return (
    <Text color={theme.error}>
      <Text bold>✗</Text>{message ? ` ${message}` : ''}
    </Text>
  );
};
