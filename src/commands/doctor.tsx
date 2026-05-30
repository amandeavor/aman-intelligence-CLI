import React, { useEffect, useState } from 'react';
import { render, Box, Text, useApp, useInput } from 'ink';
import { doctorService } from '../services/doctor.service.js';
import { HealthReport } from '../ui/components/HealthReport.js';
import { HealthCheck } from '../types/index.js';
import { Narrator } from '../ui/components/Narrator.js';
import { theme } from '../ui/theme.js';
import { useResponsiveLayout, MIN_COLUMNS, MIN_ROWS } from '../ui/layout.js';

export const DoctorApp = ({ onBack }: { onBack?: () => void }) => {
  const { exit } = useApp();
  const [checks, setChecks] = useState<HealthCheck[] | null>(null);
  const { rows, columns, isTooSmall, isCompact, physicalColumns, physicalRows } = useResponsiveLayout();

  useEffect(() => {
    doctorService.runChecks('global').then((result) => {
      setChecks(result);
      if (!onBack) {
        setTimeout(() => exit(), 300);
      }
    });
  }, [exit, onBack]);

  useInput((input, key) => {
    if (key.escape || input === 'q') {
      if (onBack) onBack();
      else exit();
    }
  });

  if (!checks) {
    return (
      <Box paddingX={1} flexDirection="column" height={rows} justifyContent="space-between">
        <Box flexDirection="column">
          <Narrator state="searching" compact />
          <Box marginLeft={1}>
            <Text>Running health checks...</Text>
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box paddingX={1} flexDirection="column" height={rows} justifyContent="space-between">
      <Box flexDirection="column">
        <Box marginBottom={1} flexDirection="column">
          <Text bold color={theme.accent}>Terminal</Text>
          <Text color={theme.borderMuted}>────────</Text>
          <Text>Size: {physicalColumns}×{physicalRows}</Text>
          <Text>Mode: {isCompact ? 'Compact' : 'Normal'}</Text>
          {isTooSmall ? (
             <Text color={theme.error}>✗ Below minimum supported size ({MIN_COLUMNS}x{MIN_ROWS})</Text>
          ) : (
             <Text color={theme.success}>✓ Supported</Text>
          )}
        </Box>
        <HealthReport checks={checks} />
      </Box>
      {onBack && (
        <Box marginTop={1}>
          <Text color={theme.dim}>Press esc or q to go back</Text>
        </Box>
      )}
    </Box>
  );
};

export async function doctorCommand() {
  if (!process.stdin.isTTY) {
    const checks = await doctorService.runChecks('global');
    console.log('\n  Aman Diagnostics (Non-TTY Fallback):\n');
    let allPassed = true;
    for (const check of checks) {
      const statusSymbol = check.status === 'pass' ? '✓' : check.status === 'warn' ? '⚠' : '✗';
      console.log(`  ${statusSymbol} ${check.name}: ${check.message}`);
      if (check.status === 'fail') {
        allPassed = false;
      }
    }
    console.log('');
    if (!allPassed) {
      process.exit(1);
    }
    return;
  }

  const { waitUntilExit } = render(<DoctorApp />);
  await waitUntilExit();
}
