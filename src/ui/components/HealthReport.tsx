import React from 'react';
import { Box, Text } from 'ink';
import { HealthCheck } from '../../types/index.js';
import { theme } from '../theme.js';

interface HealthReportProps {
  checks: HealthCheck[];
}

export const HealthReport: React.FC<HealthReportProps> = ({ checks }) => {
  const passed = checks.filter((c) => c.status === 'pass').length;
  const failed = checks.filter((c) => c.status === 'fail').length;
  const warned = checks.filter((c) => c.status === 'warn').length;

  return (
    <Box flexDirection="column">
      {checks.map((check, i) => {
        const icon = check.status === 'pass' ? '✓' : check.status === 'fail' ? '✗' : '!';
        const iconColor = check.status === 'pass' ? theme.success : check.status === 'fail' ? theme.error : theme.warning;

        return (
          <Box key={i} flexDirection="column">
            <Box>
              <Text color={iconColor} bold>{icon} </Text>
              <Box width={20}>
                <Text bold>{check.name}</Text>
              </Box>
              <Text color={theme.dim}>{check.message}</Text>
            </Box>
            {check.fix && (
              <Text color={theme.dim}>    Fix: {check.fix}</Text>
            )}
          </Box>
        );
      })}

      <Box marginTop={1}>
        <Text color={theme.dim}>
          {passed} passed
          {failed > 0 ? `, ${failed} failed` : ''}
          {warned > 0 ? `, ${warned} warnings` : ''}
        </Text>
      </Box>
    </Box>
  );
};
