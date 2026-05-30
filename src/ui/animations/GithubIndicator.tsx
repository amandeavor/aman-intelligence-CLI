import React from 'react';
import { Text } from 'ink';
import { theme } from '../theme.js';

interface GithubIndicatorProps {
  isConnected: boolean;
  repository?: string;
}

export const GithubIndicator = ({ isConnected, repository }: GithubIndicatorProps) => {
  if (isConnected && repository) {
    return (
      <Text color={theme.success}>
        <Text bold>◉</Text> {repository}
      </Text>
    );
  }

  return (
    <Text color={theme.dim}>
      <Text bold>○</Text> Local Storage
    </Text>
  );
};
