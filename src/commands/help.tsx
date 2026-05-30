import { render } from 'ink';
import React, { useEffect } from 'react';
import { Box, Text, useApp } from 'ink';
import { theme } from '../ui/theme.js';
import { Header } from '../ui/components/Header.js';

const HelpOutput = () => {
  const { exit } = useApp();

  useEffect(() => {
    setTimeout(() => exit(), 100);
  }, [exit]);

  return (
    <Box flexDirection="column" paddingX={1} marginY={1}>
      <Header compact />

      <Box flexDirection="column" marginTop={1}>
        <Box><Text bold color={theme.accent}>Usage</Text></Box>
        <Box paddingLeft={2}><Text>aman [command] [options]</Text></Box>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Box><Text bold color={theme.accent}>Commands</Text></Box>
        {[
        ['(none)', 'Open dashboard'],
        ['init', 'Set up local or GitHub-backed storage'],
        ['browse', 'Browse assets — skills, prompts, and MCPs'],
        ['search <query>', 'Universal search across all asset types'],
        ['info <name>', 'View details for any asset type'],
        ['install [name]', 'Install asset (wizard if no name). --type skill|prompt|mcp'],
        ['remove <name>', 'Remove an installed item'],
        ['update [name]', 'Update assets'],
        ['import <source>', 'Import from GitHub or a local folder'],
        ['export [name]', 'Export assets or environment (--all, --type skill|prompt|mcp)'],
        ['pack <cmd>', 'Create, inspect, or install shareable packs'],
        ['stack <cmd>', 'Manage workflow stacks'],
        ['sync <push|pull>', 'Push or pull environment from GitHub'],
        ['backup <cmd>', 'Save or restore your environment'],
        ['doctor', 'Check environment health'],
        ['config <cmd>', 'Manage settings'],
        ['registry <cmd>', 'Publish and query the canonical asset registry'],
        ['help', 'Show this help'],
        ].map(([cmd, desc]) => (
          <Box key={cmd}>
            <Box width={22} paddingLeft={2}>
              <Text color={theme.primary}>{cmd}</Text>
            </Box>
            <Box>
              <Text color={theme.dim}>{desc}</Text>
            </Box>
          </Box>
        ))}
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Box><Text bold color={theme.accent}>Registry</Text></Box>
        <Box paddingLeft={2} marginBottom={1}>
          <Text color={theme.dim}>
            Canonical store for published asset versions (slug, checksum, immutability).
          </Text>
        </Box>
        {[
          ['registry publish', 'Publish an immutable asset version from a canonical directory'],
          ['registry deprecate', 'Mark a published version deprecated without removing it'],
          ['registry list', 'List all published versions for an asset slug'],
          ['registry search', 'Search published assets by name, slug, tags, or description'],
          ['registry resolve', 'Show metadata for an exact slug@version'],
        ].map(([cmd, desc]) => (
          <Box key={cmd}>
            <Box width={22} paddingLeft={2}>
              <Text color={theme.primary}>{cmd}</Text>
            </Box>
            <Box>
              <Text color={theme.dim}>{desc}</Text>
            </Box>
          </Box>
        ))}
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Box><Text bold color={theme.accent}>Global Options</Text></Box>
        <Box>
          <Box width={22} paddingLeft={2}><Text color={theme.primary}>--global, -g</Text></Box>
          <Box><Text color={theme.dim}>Target global scope</Text></Box>
        </Box>
        <Box>
          <Box width={22} paddingLeft={2}><Text color={theme.primary}>--project, -p</Text></Box>
          <Box><Text color={theme.dim}>Target project scope</Text></Box>
        </Box>
        <Box>
          <Box width={22} paddingLeft={2}><Text color={theme.primary}>--github</Text></Box>
          <Box><Text color={theme.dim}>Use GitHub storage for init</Text></Box>
        </Box>
        <Box>
          <Box width={22} paddingLeft={2}><Text color={theme.primary}>--local</Text></Box>
          <Box><Text color={theme.dim}>Use local storage for init</Text></Box>
        </Box>
      </Box>
    </Box>
  );
};

export async function helpCommand() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    const { printHelpText } = await import('../cli/help-text.js');
    printHelpText();
    return;
  }
  const { waitUntilExit } = render(<HelpOutput />);
  await waitUntilExit();
}
