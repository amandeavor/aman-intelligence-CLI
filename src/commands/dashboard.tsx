import React, { useEffect, useState } from 'react';
import { render, Box, Text, useApp, useInput } from 'ink';
import { CustomSelectInput } from '../ui/components/CustomSelect.js';
import TextInput from 'ink-text-input';
import { environmentService } from '../services/environment.service.js';
import { backupService } from '../services/backup.service.js';
import { stackService } from '../services/stack.service.js';
import { lockService } from '../services/lock.service.js';
import { scanAll } from '../storage/scanner.js';
import { exists } from '../storage/filesystem.js';
import { theme } from '../ui/theme.js';
import { useResponsiveLayout, MIN_COLUMNS, MIN_ROWS } from '../ui/layout.js';
import { TooSmallScreen } from '../ui/components/TooSmallScreen.js';
import { GithubIndicator } from '../ui/animations/GithubIndicator.js';
import { Header } from '../ui/components/Header.js';
import { Narrator } from '../ui/components/Narrator.js';
import { Scope, NarratorState, Stack } from '../types/index.js';
import { getRelativeBackupDate, getBackupLabel } from '../ui/date.js';
import { BrowseApp } from './browse.js';
import { SearchApp } from './search.js';
import { PackCreateApp, PackInspectApp, PackInstallApp } from './pack.js';
import { StackCreateApp, StackActivateApp } from './stack.js';
import { BackupApp } from './backup.js';
import { SyncApp } from './sync.js';
import { ConfigApp } from './config.js';
import { DoctorApp } from './doctor.js';
import { ImportApp } from './import.js';
import { InitFlow } from './init.js';
import { InstallWizardApp } from './install.js';
import { execFileSync } from 'child_process';
import path from 'path';

type Screen =
  | 'menu'
  | 'browse'
  | 'my-assets'
  | 'search'
  | 'install'
  | 'packs_menu'
  | 'packs_create_input'
  | 'packs_create_app'
  | 'packs_install_input'
  | 'packs_install_app'
  | 'packs_inspect_input'
  | 'packs_inspect_app'
  | 'stacks_menu'
  | 'stacks_create_name'
  | 'stacks_create_scope'
  | 'stacks_create_app'
  | 'stacks_activate_select'
  | 'stacks_activate_app'
  | 'stacks_list'
  | 'stacks_remove_select'
  | 'backup_menu'
  | 'backup_create_label'
  | 'backup_create_app'
  | 'backup_restore_select'
  | 'backup_restore_app'
  | 'backup_list'
  | 'backup_delete_select'
  | 'backup_delete_app'
  | 'sync_menu'
  | 'sync_push_app'
  | 'sync_pull_app'
  | 'settings'
  | 'doctor'
  | 'import_repo_input'
  | 'import_app'
  | 'github_setup_loading'
  | 'connect_github'
  | 'gh_cli_required';

const InputScreen = ({
  title,
  placeholder,
  onSubmit,
  onBack,
}: {
  title: string;
  placeholder?: string;
  onSubmit: (val: string) => void;
  onBack: () => void;
}) => {
  const [val, setVal] = useState('');
  const { rows } = useResponsiveLayout();
  useInput((input, key) => {
    if (key.escape) onBack();
  });

  return (
    <Box flexDirection="column" paddingX={1} height={rows} justifyContent="space-between">
      <Box flexDirection="column">
        <Header compact />
        <Text bold color={theme.accent}>{title}</Text>
        <Box marginTop={1} flexDirection="row">
          <Text color={theme.primary}>❯ </Text>
          <TextInput value={val} onChange={setVal} onSubmit={onSubmit} placeholder={placeholder} />
        </Box>
      </Box>
      <Box>
        <Text color={theme.dim}>press enter to submit · esc go back</Text>
      </Box>
    </Box>
  );
};

interface MenuItem {
  label: string;
  value: string;
  section: 'Discover' | 'Manage' | 'Environment' | 'System';
  description: string;
}

const StableScreenWrapper = ({ children }: { children: React.ReactNode }) => {
  const { rows } = useResponsiveLayout();
  return (
    <Box flexDirection="column" paddingX={1} height={rows} justifyContent="space-between">
      <Box flexDirection="column">
        {children}
      </Box>
    </Box>
  );
};


const DashboardApp = () => {
  const { rows, columns, isTooSmall, isCompact, canShowDescriptions, physicalColumns, physicalRows } = useResponsiveLayout();
  const { exit } = useApp();
  const [loading, setLoading] = useState(true);
  const [initRequired, setInitRequired] = useState(false);
  const [stats, setStats] = useState({ skills: 0, prompts: 0, mcps: 0, packs: 0, stacks: 0 });
  const [storageInfo, setStorageInfo] = useState({ path: '', repo: '', type: 'local' });
  const [lastSync, setLastSync] = useState('never');
  const [lastBackup, setLastBackup] = useState('none');

  // SPTA navigation states
  const [screen, setScreen] = useState<Screen>('menu');
  const [menuCursor, setMenuCursor] = useState(0);
  const [inputVal, setInputVal] = useState('');
  const [secondInputVal, setSecondInputVal] = useState('');
  const [selectItems, setSelectItems] = useState<{ label: string; value: string }[]>([]);
  const [infoMessage, setInfoMessage] = useState('');
  const [infoState, setInfoState] = useState<'idle' | 'success' | 'error'>('idle');

  // Quick setup states
  const [setupState, setSetupState] = useState<NarratorState>('idle');
  const [setupMessage, setSetupMessage] = useState('');

  const isConnected = storageInfo.type === 'github' && !!storageInfo.repo;

  const currentMenuItems = React.useMemo<MenuItem[]>(() => {
    const items: MenuItem[] = [
      { label: 'Browse Assets', value: 'browse', section: 'Discover', description: 'Explore marketplace — skills, prompts, and MCPs' },
      { label: 'Import Assets', value: 'import_repo_input', section: 'Discover', description: 'Import skills, prompts, and MCPs from GitHub or local paths' },
      { label: 'Search Assets', value: 'search', section: 'Discover', description: 'Universal search across all asset types' },
      { label: 'Install Asset', value: 'install', section: 'Discover', description: 'Install a skill, prompt, or MCP (equal asset types)' },

      { label: 'My Assets', value: 'my-assets', section: 'Manage', description: 'View and manage installed skills, prompts, and MCPs' },
      { label: 'Packs', value: 'packs_menu', section: 'Manage', description: 'Bundle skills, prompts, and MCPs into workflow packs' },
      { label: 'Stacks', value: 'stacks_menu', section: 'Manage', description: 'Create workflow environments with mixed asset types' },
    ];

    if (!isConnected) {
      items.push({ label: 'Connect GitHub', value: 'connect_github', section: 'Environment', description: 'Link your environment to a GitHub repository' });
    } else {
      items.push({ label: 'Sync Environment', value: 'sync_menu', section: 'Environment', description: 'Push or pull environment configurations with GitHub' });
    }

    items.push(
      { label: 'Backup & Restore', value: 'backup_menu', section: 'Environment', description: 'Save and restore snapshots of your workspace' },
      { label: 'Settings', value: 'settings', section: 'System', description: 'Configure CLI options and environment variables' },
      { label: 'Doctor', value: 'doctor', section: 'System', description: 'Run system diagnostics and verify dependencies' },
      { label: 'Exit', value: 'exit', section: 'System', description: 'Quit the Asset Hub' }
    );

    return items;
  }, [isConnected]);

  async function connectGithub(repository: string, mode: 'create' | 'existing') {
    if (!environmentService.isGithubCliAvailable()) {
      setScreen('gh_cli_required');
      return;
    }
    setScreen('github_setup_loading');
    setSetupState('installing');
    setSetupMessage(`Setting up GitHub repository: ${repository}...`);
    try {
      await environmentService.initGithub({ repository, mode });
      setSetupState('success');
      setSetupMessage('GitHub connected successfully!');
      setInitRequired(false);
      setTimeout(() => {
        setScreen('menu');
        loadData();
      }, 1500);
    } catch (err: any) {
      setSetupState('error');
      setSetupMessage(`Failed: ${err.message}`);
      setTimeout(() => {
        setScreen('menu');
      }, 2500);
    }
  }

  async function configureLocal() {
    setScreen('github_setup_loading');
    setSetupState('installing');
    setSetupMessage('Configuring local folder...');
    try {
      await environmentService.initLocal({});
      setSetupState('success');
      setSetupMessage('Local environment initialized successfully!');
      setInitRequired(false);
      setTimeout(() => {
        setScreen('menu');
        loadData();
      }, 1500);
    } catch (err: any) {
      setSetupState('error');
      setSetupMessage(`Failed: ${err.message}`);
      setTimeout(() => {
        setScreen('menu');
      }, 2500);
    }
  }

  useInput((input, key) => {
    if (initRequired) {
      if (key.escape) {
        exit();
      }
      return;
    }

    if (screen !== 'menu') {
      if (key.escape) {
        if (
          screen === 'packs_menu' ||
          screen === 'stacks_menu' ||
          screen === 'backup_menu' ||
          screen === 'sync_menu' ||
          screen === 'import_repo_input'
        ) {
          setScreen('menu');
          return;
        }

        if (screen === 'stacks_create_scope') {
          setScreen('stacks_create_name');
          return;
        }

        if (screen === 'stacks_activate_select' || screen === 'stacks_remove_select') {
          setScreen('stacks_menu');
          return;
        }

        if (screen === 'backup_restore_select' || screen === 'backup_delete_select') {
          setScreen('backup_menu');
          return;
        }
      }
      return;
    }

    // Key handlers for Dashboard menu
    if (key.upArrow) {
      setMenuCursor((prev) => (prev > 0 ? prev - 1 : currentMenuItems.length - 1));
    } else if (key.downArrow) {
      setMenuCursor((prev) => (prev < currentMenuItems.length - 1 ? prev + 1 : 0));
    } else if (key.leftArrow) {
      const leftCount =
        currentMenuItems.filter((i) => i.section === 'Discover').length +
        currentMenuItems.filter((i) => i.section === 'Manage').length;
      setMenuCursor((prev) => (prev >= leftCount ? prev - leftCount : prev));
    } else if (key.rightArrow) {
      const leftCount =
        currentMenuItems.filter((i) => i.section === 'Discover').length +
        currentMenuItems.filter((i) => i.section === 'Manage').length;
      setMenuCursor((prev) => (prev < leftCount ? prev + leftCount : prev));
    } else if (key.return) {
      const activeItem = currentMenuItems[menuCursor];
      handleMainMenuSelect(activeItem);
    } else if (input === 'q') {
      exit();
    }
  });

  async function loadData() {
    const environmentPath = environmentService.getActiveEnvironmentDir();
    const isReady = exists(path.join(environmentPath, 'aman.json'));

    if (!isReady) {
      setInitRequired(true);
      setLoading(false);
      return;
    }

    const data = await scanAll(environmentPath, 'installed');
    const storage = environmentService.getStorage();
    const localStacks = await stackService.list('global');
    const projectStacks = await stackService.list('project');

    const packRefs = new Set<string>();
    for (const scope of ['global', 'project'] as const) {
      try {
        const lock = await lockService.read(scope);
        for (const entry of lock.assets) {
          if (entry.source.kind === 'pack') packRefs.add(entry.source.ref);
        }
      } catch {
        // ignore
      }
    }

    setStats({
      skills: data.skills.length,
      prompts: data.prompts.length,
      mcps: data.mcps.length,
      packs: packRefs.size,
      stacks: localStacks.length + projectStacks.length,
    });

    setStorageInfo({
      path: environmentPath,
      type: storage.type,
      repo: storage.repository || '',
    });

    // Scan Last Sync (Git relative commit date)
    let lastSyncVal = 'never';
    if (storage.type === 'github' && storage.repository) {
      try {
        const res = execFileSync('git', ['-C', environmentPath, 'log', '-1', '--format=%cr'], { stdio: 'pipe' });
        lastSyncVal = res.toString().trim() || 'never';
      } catch {
        lastSyncVal = 'never';
      }
    }
    setLastSync(lastSyncVal);

    // Scan Last Backup (Alphabetically latest directory name)
    let lastBackupVal = 'none';
    try {
      const backups = await backupService.list();
      if (backups && backups.length > 0) {
        lastBackupVal = backups.sort().pop() || 'none';
      }
    } catch {
      lastBackupVal = 'none';
    }
    setLastBackup(lastBackupVal);

    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [screen]);

  if (isTooSmall) {
    return <TooSmallScreen columns={physicalColumns} rows={physicalRows} minColumns={MIN_COLUMNS} minRows={MIN_ROWS} />;
  }

  if (loading) {
    return (
      <Box paddingX={1} height={rows} justifyContent="center" alignItems="center">
        <Narrator state="searching" message="Loading Environment..." />
      </Box>
    );
  }

  if (screen === 'github_setup_loading') {
    return (
      <Box flexDirection="column" paddingX={1} height={rows} justifyContent="space-between">
        <Box flexDirection="column">
          <Header compact />
          <Narrator state={setupState} message={setupMessage} />
        </Box>
      </Box>
    );
  }

  if (screen === 'connect_github') {
    return (
      <InitFlow
        startWithGithub={true}
        exitOnDone={false}
        onDone={async (result) => {
          if (result.action === 'github') {
            await connectGithub(result.repository, result.mode);
          } else {
            setScreen('menu');
          }
        }}
      />
    );
  }

  if (screen === 'gh_cli_required') {
    return (
      <Box flexDirection="column" paddingX={1} height={rows} justifyContent="space-between">
        <Box flexDirection="column">
          <Header compact />
          <Text bold color={theme.error}>GitHub CLI is required.</Text>
          <Box marginTop={1}>
            <Text>Please install it via https://cli.github.com or using your package manager:</Text>
          </Box>
          <Box flexDirection="column" marginTop={1} marginLeft={2}>
            <Text color={theme.secondary}>• Windows:  winget install GitHub.cli</Text>
            <Text color={theme.secondary}>• macOS:    brew install gh</Text>
            <Text color={theme.secondary}>• Linux:    sudo apt install gh</Text>
          </Box>
          <Box marginTop={1}>
            <CustomSelectInput
              items={[
                { label: 'Continue With Local Storage', value: 'local' },
                { label: 'Back', value: 'back' },
              ]}
              onSelect={async (item) => {
                if (item.value === 'local') {
                  await configureLocal();
                } else {
                  setScreen('menu');
                }
              }}
            />
          </Box>
        </Box>
        <Box>
          <Text color={theme.dim}>press enter to select</Text>
        </Box>
      </Box>
    );
  }

  if (initRequired) {
    const quickSetupItems = [
      { label: 'Connect GitHub', value: 'connect_github' },
      { label: 'Configure Local Folder', value: 'local_setup' },
      { label: 'Exit CLI', value: 'exit' },
    ];

    return (
      <Box flexDirection="column" paddingX={1} height={rows} justifyContent="space-between">
        <Box flexDirection="column">
          <Text bold color={theme.accent}>Aman Intelligence</Text>
          <Box marginTop={1}>
            <Text bold>Quick Setup</Text>
          </Box>
          <Box marginTop={1}>
            <CustomSelectInput
              items={quickSetupItems}
              onSelect={async (item) => {
                if (item.value === 'connect_github') {
                  setScreen('connect_github');
                } else if (item.value === 'local_setup') {
                  await configureLocal();
                } else if (item.value === 'exit') {
                  exit();
                }
              }}
            />
          </Box>
        </Box>
        <Box>
          <Text color={theme.dim}>press enter to select · esc exit</Text>
        </Box>
      </Box>
    );
  }

  // Handle menus
  const handleMainMenuSelect = (item: MenuItem) => {
    setInfoState('idle');
    setInfoMessage('');
    if (item.value === 'exit') {
      exit();
      return;
    }
    setScreen(item.value as Screen);
  };

  const handlePacksMenuSelect = (item: { value: string }) => {
    if (item.value === 'back') {
      setScreen('menu');
      return;
    }
    setScreen(item.value as Screen);
  };

  const handleStacksMenuSelect = async (item: { value: string }) => {
    if (item.value === 'back') {
      setScreen('menu');
      return;
    }
    if (item.value === 'stacks_activate_select') {
      const globalStacks = await stackService.list('global');
      const projectStacks = await stackService.list('project');
      const combined = [
        ...globalStacks.map((s) => ({
          label: `[global] ${s.name} (${s.skills.length}s ${s.prompts.length}p ${s.mcps.length}m)`,
          value: `global:${s.name}`,
        })),
        ...projectStacks.map((s) => ({
          label: `[project] ${s.name} (${s.skills.length}s ${s.prompts.length}p ${s.mcps.length}m)`,
          value: `project:${s.name}`,
        })),
      ];
      if (combined.length === 0) {
        setInfoState('error');
        setInfoMessage('No stacks found to activate.');
        return;
      }
      setSelectItems(combined);
    }
    if (item.value === 'stacks_remove_select') {
      const globalStacks = await stackService.list('global');
      const projectStacks = await stackService.list('project');
      const combined = [
        ...globalStacks.map((s) => ({ label: `[global] ${s.name}`, value: `global:${s.name}` })),
        ...projectStacks.map((s) => ({ label: `[project] ${s.name}`, value: `project:${s.name}` })),
      ];
      if (combined.length === 0) {
        setInfoState('error');
        setInfoMessage('No stacks found to remove.');
        return;
      }
      setSelectItems(combined);
    }
    setScreen(item.value as Screen);
  };

  const handleBackupMenuSelect = async (item: { value: string }) => {
    if (item.value === 'back') {
      setScreen('menu');
      return;
    }
    if (item.value === 'backup_restore_select' || item.value === 'backup_delete_select') {
      try {
        const backups = await backupService.list();
        if (backups.length === 0) {
          setInfoState('error');
          setInfoMessage('No backups found.');
          return;
        }
        setSelectItems(backups.map((b) => ({ label: getBackupLabel(b), value: b })));
      } catch (err: any) {
        setInfoState('error');
        setInfoMessage(`Error reading backups: ${err.message}`);
        return;
      }
    }
    setScreen(item.value as Screen);
  };

  const handleSyncMenuSelect = (item: { value: string }) => {
    if (item.value === 'back') {
      setScreen('menu');
      return;
    }
    setScreen(item.value as Screen);
  };

  // ── Screens Routing ──────────────────────────────────────────────────

  // Submenu Screens
  if (screen === 'packs_menu') {
    const packsItems = [
      { label: 'Create a Pack', value: 'packs_create_input' },
      { label: 'Install a Pack (.amanpack)', value: 'packs_install_input' },
      { label: 'Inspect a Pack', value: 'packs_inspect_input' },
      { label: '← Back to Main Menu', value: 'back' },
    ];
    return (
      <Box flexDirection="column" paddingX={1} height={rows} justifyContent="space-between">
        <Box flexDirection="column">
          <Header compact />
          <Text bold color={theme.accent}>Packs Management</Text>
          <Box marginTop={1}>
            <CustomSelectInput items={packsItems} onSelect={handlePacksMenuSelect} />
          </Box>
        </Box>
        <Box>
          <Text color={theme.dim}>press enter to select · esc go back</Text>
        </Box>
      </Box>
    );
  }

  if (screen === 'stacks_menu') {
    const stacksItems = [
      { label: 'Create a Stack', value: 'stacks_create_name' },
      { label: 'Activate a Stack', value: 'stacks_activate_select' },
      { label: 'List Stacks', value: 'stacks_list' },
      { label: 'Remove a Stack', value: 'stacks_remove_select' },
      { label: '← Back to Main Menu', value: 'back' },
    ];
    return (
      <Box flexDirection="column" paddingX={1} height={rows} justifyContent="space-between">
        <Box flexDirection="column">
          <Header compact />
          <Text bold color={theme.accent}>Stacks Management</Text>
          {infoMessage && (
            <Box marginTop={1}>
              <Text color={infoState === 'success' ? theme.success : theme.error}>{infoMessage}</Text>
            </Box>
          )}
          <Box marginTop={1}>
            <CustomSelectInput items={stacksItems} onSelect={handleStacksMenuSelect} />
          </Box>
        </Box>
        <Box>
          <Text color={theme.dim}>press enter to select · esc go back</Text>
        </Box>
      </Box>
    );
  }

  if (screen === 'backup_menu') {
    const backupItems = [
      { label: 'Save a Backup', value: 'backup_create_label' },
      { label: 'Restore a Backup', value: 'backup_restore_select' },
      { label: 'List Backups', value: 'backup_list' },
      { label: 'Delete a Backup', value: 'backup_delete_select' },
      { label: '← Back to Main Menu', value: 'back' },
    ];
    return (
      <Box flexDirection="column" paddingX={1} height={rows} justifyContent="space-between">
        <Box flexDirection="column">
          <Header compact />
          <Text bold color={theme.accent}>Backup & Restore</Text>
          {infoMessage && (
            <Box marginTop={1}>
              <Text color={infoState === 'success' ? theme.success : theme.error}>{infoMessage}</Text>
            </Box>
          )}
          <Box marginTop={1}>
            <CustomSelectInput items={backupItems} onSelect={handleBackupMenuSelect} />
          </Box>
        </Box>
        <Box>
          <Text color={theme.dim}>press enter to select · esc go back</Text>
        </Box>
      </Box>
    );
  }

  if (screen === 'sync_menu') {
    const syncItems = [
      { label: 'Push to GitHub', value: 'sync_push_app' },
      { label: 'Pull from GitHub', value: 'sync_pull_app' },
      { label: '← Back to Main Menu', value: 'back' },
    ];
    return (
      <Box flexDirection="column" paddingX={1} height={rows} justifyContent="space-between">
        <Box flexDirection="column">
          <Header compact />
          <Text bold color={theme.accent}>Sync (GitHub Integration)</Text>
          <Box marginTop={1}>
            <CustomSelectInput items={syncItems} onSelect={handleSyncMenuSelect} />
          </Box>
        </Box>
        <Box>
          <Text color={theme.dim}>press enter to select · esc go back</Text>
        </Box>
      </Box>
    );
  }

  // Active Applications integration
  if (screen === 'browse') {
    return <BrowseApp initialView="marketplace" onBack={() => setScreen('menu')} />;
  }

  if (screen === 'my-assets') {
    return <BrowseApp initialView="installed" onBack={() => setScreen('menu')} />;
  }

  if (screen === 'search') {
    return <SearchApp onBack={() => setScreen('menu')} />;
  }

  if (screen === 'install') {
    return <StableScreenWrapper><InstallWizardApp onBack={() => setScreen('menu')} /></StableScreenWrapper>;
  }

  if (screen === 'settings') {
    return <StableScreenWrapper><ConfigApp onBack={() => setScreen('menu')} /></StableScreenWrapper>;
  }

  if (screen === 'doctor') {
    return <StableScreenWrapper><DoctorApp onBack={() => setScreen('menu')} /></StableScreenWrapper>;
  }

  // Packs workflows
  if (screen === 'packs_create_input') {
    return (
      <InputScreen
        title="Create a New Pack"
        placeholder="Enter pack name..."
        onSubmit={(val) => {
          setInputVal(val);
          setScreen('packs_create_app');
        }}
        onBack={() => setScreen('packs_menu')}
      />
    );
  }

  if (screen === 'packs_create_app') {
    return <StableScreenWrapper><PackCreateApp name={inputVal} onBack={() => setScreen('packs_menu')} /></StableScreenWrapper>;
  }

  if (screen === 'packs_install_input') {
    return (
      <InputScreen
        title="Install a Pack (.amanpack)"
        placeholder="Enter path to .amanpack file..."
        onSubmit={(val) => {
          setInputVal(val);
          setScreen('packs_install_app');
        }}
        onBack={() => setScreen('packs_menu')}
      />
    );
  }

  if (screen === 'packs_install_app') {
    return <StableScreenWrapper><PackInstallApp packPath={inputVal} onBack={() => setScreen('packs_menu')} /></StableScreenWrapper>;
  }

  if (screen === 'packs_inspect_input') {
    return (
      <InputScreen
        title="Inspect a Pack"
        placeholder="Enter path to .amanpack file..."
        onSubmit={(val) => {
          setInputVal(val);
          setScreen('packs_inspect_app');
        }}
        onBack={() => setScreen('packs_menu')}
      />
    );
  }

  if (screen === 'packs_inspect_app') {
    return <StableScreenWrapper><PackInspectApp packPath={inputVal} onBack={() => setScreen('packs_menu')} /></StableScreenWrapper>;
  }

  // Stacks workflows
  if (screen === 'stacks_create_name') {
    return (
      <InputScreen
        title="Create a New Stack"
        placeholder="Enter stack name..."
        onSubmit={(val) => {
          setInputVal(val);
          setScreen('stacks_create_scope');
        }}
        onBack={() => setScreen('stacks_menu')}
      />
    );
  }

  if (screen === 'stacks_create_scope') {
    const scopes = [
      { label: 'Global Scope', value: 'global' },
      { label: 'Project Scope', value: 'project' },
    ];
    return (
      <Box flexDirection="column" paddingX={1} height={rows} justifyContent="space-between">
        <Box flexDirection="column">
          <Header compact />
          <Text bold color={theme.accent}>Select Stack Scope</Text>
          <Box marginTop={1}>
            <CustomSelectInput
              items={scopes}
              onSelect={(item) => {
                setSecondInputVal(item.value);
                setScreen('stacks_create_app');
              }}
            />
          </Box>
        </Box>
        <Box>
          <Text color={theme.dim}>press enter to select · esc go back</Text>
        </Box>
      </Box>
    );
  }

  if (screen === 'stacks_create_app') {
    return <StableScreenWrapper><StackCreateApp name={inputVal} scope={secondInputVal as Scope} onBack={() => setScreen('stacks_menu')} /></StableScreenWrapper>;
  }

  if (screen === 'stacks_activate_select') {
    return (
      <Box flexDirection="column" paddingX={1} height={rows} justifyContent="space-between">
        <Box flexDirection="column">
          <Header compact />
          <Text bold color={theme.accent}>Activate Stack</Text>
          <Box marginTop={1}>
            <CustomSelectInput
              items={selectItems}
              onSelect={(item) => {
                const [scope, name] = item.value.split(':');
                setInputVal(name);
                setSecondInputVal(scope);
                setScreen('stacks_activate_app');
              }}
            />
          </Box>
        </Box>
        <Box>
          <Text color={theme.dim}>Select a stack to activate its assets in your project. · esc go back</Text>
        </Box>
      </Box>
    );
  }

  if (screen === 'stacks_activate_app') {
    return <StableScreenWrapper><StackActivateApp name={inputVal} scope={secondInputVal as Scope} onBack={() => setScreen('stacks_menu')} /></StableScreenWrapper>;
  }

  if (screen === 'stacks_list') {
    interface StackWithScope extends Stack {
      scope: Scope;
    }
    const StacksListScreen = () => {
      const { rows } = useResponsiveLayout();
      const [stacksList, setStacksList] = useState<StackWithScope[]>([]);
      const [loading, setLoading] = useState(true);
      const [currentView, setCurrentView] = useState<'list' | 'detail' | 'add_type' | 'add_select' | 'remove_type' | 'remove_select'>('list');
      const [selectedStack, setSelectedStack] = useState<StackWithScope | null>(null);
      const [activeAssetType, setActiveAssetType] = useState<'skill' | 'prompt' | 'mcp'>('skill');
      const [installedAssets, setInstalledAssets] = useState<{ skills: string[]; prompts: string[]; mcps: string[] }>({ skills: [], prompts: [], mcps: [] });
      const [actionMessage, setActionMessage] = useState<string | null>(null);

      const loadStacks = async () => {
        setLoading(true);
        const [globals, projects] = await Promise.all([
          stackService.list('global'),
          stackService.list('project'),
        ]);
        setStacksList([
          ...globals.map((s) => ({ ...s, scope: 'global' as Scope })),
          ...projects.map((s) => ({ ...s, scope: 'project' as Scope })),
        ]);
        setLoading(false);
      };

      const loadInstalled = async () => {
        const globalDir = environmentService.getActiveEnvironmentDir();
        const projectDir = environmentService.getProjectEnvironmentDir();
        const globalData = await scanAll(globalDir, 'global');
        let projectData: { skills: any[]; prompts: any[]; mcps: any[] } = { skills: [], prompts: [], mcps: [] };
        if (exists(projectDir)) {
          const scanned = await scanAll(projectDir, 'project');
          projectData = {
            skills: scanned.skills,
            prompts: scanned.prompts,
            mcps: scanned.mcps
          };
        }
        const uniqSkills = Array.from(new Set([...globalData.skills, ...projectData.skills].map((s) => s.name)));
        const uniqPrompts = Array.from(new Set([...globalData.prompts, ...projectData.prompts].map((p) => p.name)));
        const uniqMcps = Array.from(new Set([...globalData.mcps, ...projectData.mcps].map((m) => m.name)));

        setInstalledAssets({
          skills: uniqSkills,
          prompts: uniqPrompts,
          mcps: uniqMcps,
        });
      };

      useEffect(() => {
        loadStacks();
        loadInstalled();
      }, []);

      useInput((input, key) => {
        if (key.escape) {
          if (currentView === 'list') {
            setScreen('stacks_menu');
          } else if (currentView === 'detail') {
            setCurrentView('list');
          } else if (currentView === 'add_type' || currentView === 'remove_type') {
            setCurrentView('detail');
          } else if (currentView === 'add_select') {
            setCurrentView('add_type');
          } else if (currentView === 'remove_select') {
            setCurrentView('remove_type');
          }
        }
      });

      const renderList = (items: string[], max = 3) => {
        if (items.length === 0) return <Text color={theme.dim}>  (None)</Text>;
        const visible = items.slice(0, max);
        const diff = items.length - max;
        return (
          <Box flexDirection="column" marginLeft={2}>
            {visible.map((item) => (
              <Text key={item} color={theme.text}>• {item}</Text>
            ))}
            {diff > 0 && <Text color={theme.dim}>• ... and {diff} more</Text>}
          </Box>
        );
      };

      if (currentView === 'list') {
        const stackItems = [
          ...stacksList.map((s) => ({
            label: `[${s.scope}] ${s.name} (${s.skills.length} skills, ${s.prompts.length} prompts, ${s.mcps.length} mcps)`,
            value: `${s.scope}:${s.name}`,
          })),
          { label: '← Back to Stacks Menu', value: 'back' },
        ];

        return (
          <Box flexDirection="column" paddingX={1} height={rows} justifyContent="space-between">
            <Box flexDirection="column">
              <Header compact />
              <Text bold color={theme.accent}>Installed Stacks</Text>
              <Box marginTop={1}>
                {loading ? (
                  <Text color={theme.dim}>Loading stacks...</Text>
                ) : stacksList.length === 0 ? (
                  <Box flexDirection="column">
                    <Text color={theme.dim}>No stacks found.</Text>
                    <Box marginTop={1}>
                      <CustomSelectInput
                        items={[{ label: '← Back to Stacks Menu', value: 'back' }]}
                        onSelect={() => setScreen('stacks_menu')}
                      />
                    </Box>
                  </Box>
                ) : (
                  <CustomSelectInput
                    items={stackItems}
                    onSelect={(item) => {
                      if (item.value === 'back') {
                        setScreen('stacks_menu');
                      } else {
                        const found = stacksList.find((s) => `${s.scope}:${s.name}` === item.value);
                        if (found) {
                          setSelectedStack(found);
                          setCurrentView('detail');
                        }
                      }
                    }}
                  />
                )}
              </Box>
            </Box>
            <Box>
              <Text color={theme.dim}>press enter to inspect/edit · esc go back</Text>
            </Box>
          </Box>
        );
      }

      if (currentView === 'detail' && selectedStack) {
        const detailItems = [
          { label: 'Add Asset', value: 'add' },
          { label: 'Remove Asset', value: 'remove' },
          { label: '← Back to Stacks List', value: 'back' },
        ];

        return (
          <Box flexDirection="column" paddingX={1} height={rows} justifyContent="space-between">
            <Box flexDirection="column">
              <Header compact />
              <Box flexDirection="row" justifyContent="space-between">
                <Text bold color={theme.accent}>{selectedStack.name}</Text>
                <Text color={theme.dim}>Scope: {selectedStack.scope}</Text>
              </Box>
              <Text color={theme.dim}>
                {selectedStack.skills.length} Skills • {selectedStack.prompts.length} Prompts • {selectedStack.mcps.length} MCPs
              </Text>
              <Text color={theme.borderMuted}>────────────────────────────────────────</Text>

              <Box flexDirection="column" marginTop={1}>
                <Text bold color={theme.primary}>Skills</Text>
                {renderList(selectedStack.skills)}
              </Box>

              <Box flexDirection="column" marginTop={1}>
                <Text bold color={theme.primary}>Prompts</Text>
                {renderList(selectedStack.prompts)}
              </Box>

              <Box flexDirection="column" marginTop={1}>
                <Text bold color={theme.primary}>MCPs</Text>
                {renderList(selectedStack.mcps)}
              </Box>

              {actionMessage && (
                <Box marginTop={1}>
                  <Text color={theme.success}>{actionMessage}</Text>
                </Box>
              )}

              <Box marginTop={1}>
                <CustomSelectInput
                  items={detailItems}
                  onSelect={(item) => {
                    if (item.value === 'back') {
                      setCurrentView('list');
                    } else if (item.value === 'add') {
                      setCurrentView('add_type');
                    } else if (item.value === 'remove') {
                      setCurrentView('remove_type');
                    }
                  }}
                />
              </Box>
            </Box>
            <Box>
              <Text color={theme.dim}>press enter to select · esc go back</Text>
            </Box>
          </Box>
        );
      }

      if (currentView === 'add_type' && selectedStack) {
        const addTypes = [
          { label: 'Skills', value: 'skill' },
          { label: 'Prompts', value: 'prompt' },
          { label: 'MCPs', value: 'mcp' },
          { label: '← Back', value: 'back' },
        ];
        return (
          <Box flexDirection="column" paddingX={1} height={rows} justifyContent="space-between">
            <Box flexDirection="column">
              <Header compact />
              <Text bold color={theme.accent}>Add Asset to {selectedStack.name}</Text>
              <Box marginTop={1}>
                <CustomSelectInput
                  items={addTypes}
                  onSelect={(item) => {
                    if (item.value === 'back') {
                      setCurrentView('detail');
                    } else {
                      setActiveAssetType(item.value as 'skill' | 'prompt' | 'mcp');
                      setCurrentView('add_select');
                    }
                  }}
                />
              </Box>
            </Box>
            <Box>
              <Text color={theme.dim}>press enter to select · esc go back</Text>
            </Box>
          </Box>
        );
      }

      if (currentView === 'remove_type' && selectedStack) {
        const removeTypes = [
          { label: `Skills (${selectedStack.skills.length})`, value: 'skill' },
          { label: `Prompts (${selectedStack.prompts.length})`, value: 'prompt' },
          { label: `MCPs (${selectedStack.mcps.length})`, value: 'mcp' },
          { label: '← Back', value: 'back' },
        ];
        return (
          <Box flexDirection="column" paddingX={1} height={rows} justifyContent="space-between">
            <Box flexDirection="column">
              <Header compact />
              <Text bold color={theme.accent}>Remove Asset from {selectedStack.name}</Text>
              <Box marginTop={1}>
                <CustomSelectInput
                  items={removeTypes}
                  onSelect={(item) => {
                    if (item.value === 'back') {
                      setCurrentView('detail');
                    } else {
                      setActiveAssetType(item.value as 'skill' | 'prompt' | 'mcp');
                      setCurrentView('remove_select');
                    }
                  }}
                />
              </Box>
            </Box>
            <Box>
              <Text color={theme.dim}>press enter to select · esc go back</Text>
            </Box>
          </Box>
        );
      }

      if (currentView === 'add_select' && selectedStack) {
        let available: string[] = [];
        if (activeAssetType === 'skill') {
          available = installedAssets.skills.filter((name) => !selectedStack.skills.includes(name));
        } else if (activeAssetType === 'prompt') {
          available = installedAssets.prompts.filter((name) => !selectedStack.prompts.includes(name));
        } else if (activeAssetType === 'mcp') {
          available = installedAssets.mcps.filter((name) => !selectedStack.mcps.includes(name));
        }

        const items = [
          ...available.map((name) => ({ label: name, value: name })),
          { label: '← Back', value: 'back' },
        ];

        const handleAdd = async (item: { value: string }) => {
          if (item.value === 'back') {
            setCurrentView('add_type');
            return;
          }

          const assetName = item.value;
          let updatedSkills = [...selectedStack.skills];
          let updatedPrompts = [...selectedStack.prompts];
          let updatedMcps = [...selectedStack.mcps];

          if (activeAssetType === 'skill') {
            updatedSkills.push(assetName);
          } else if (activeAssetType === 'prompt') {
            updatedPrompts.push(assetName);
          } else if (activeAssetType === 'mcp') {
            updatedMcps.push(assetName);
          }

          try {
            await stackService.update(
              selectedStack.scope,
              selectedStack.name,
              {
                skills: updatedSkills,
                prompts: updatedPrompts,
                mcps: updatedMcps,
              }
            );

            const updatedStack = {
              ...selectedStack,
              skills: updatedSkills,
              prompts: updatedPrompts,
              mcps: updatedMcps,
            };
            setSelectedStack(updatedStack);
            setStacksList((prev) =>
              prev.map((s) => (s.name === selectedStack.name && s.scope === selectedStack.scope ? updatedStack : s))
            );

            setActionMessage(`Added ${activeAssetType} "${assetName}" successfully.`);
            setTimeout(() => setActionMessage(null), 2000);
          } catch (err: any) {
            setActionMessage(`Error adding asset: ${err.message}`);
            setTimeout(() => setActionMessage(null), 3000);
          }

          setCurrentView('detail');
        };

        return (
          <Box flexDirection="column" paddingX={1} height={rows} justifyContent="space-between">
            <Box flexDirection="column">
              <Header compact />
              <Text bold color={theme.accent}>Select {activeAssetType} to Add</Text>
              <Box marginTop={1}>
                {available.length === 0 ? (
                  <Box flexDirection="column">
                    <Text color={theme.dim}>No installed {activeAssetType}s available to add.</Text>
                    <Box marginTop={1}>
                      <CustomSelectInput
                        items={[{ label: '← Back', value: 'back' }]}
                        onSelect={() => setCurrentView('add_type')}
                      />
                    </Box>
                  </Box>
                ) : (
                  <CustomSelectInput
                    items={items}
                    onSelect={handleAdd}
                  />
                )}
              </Box>
            </Box>
            <Box>
              <Text color={theme.dim}>press enter to select · esc go back</Text>
            </Box>
          </Box>
        );
      }

      if (currentView === 'remove_select' && selectedStack) {
        let currentAssets: string[] = [];
        if (activeAssetType === 'skill') {
          currentAssets = selectedStack.skills;
        } else if (activeAssetType === 'prompt') {
          currentAssets = selectedStack.prompts;
        } else if (activeAssetType === 'mcp') {
          currentAssets = selectedStack.mcps;
        }

        const items = [
          ...currentAssets.map((name) => ({ label: name, value: name })),
          { label: '← Back', value: 'back' },
        ];

        const handleRemove = async (item: { value: string }) => {
          if (item.value === 'back') {
            setCurrentView('remove_type');
            return;
          }

          const assetName = item.value;
          let updatedSkills = selectedStack.skills.filter((s) => s !== assetName);
          let updatedPrompts = selectedStack.prompts.filter((p) => p !== assetName);
          let updatedMcps = selectedStack.mcps.filter((m) => m !== assetName);

          try {
            await stackService.update(
              selectedStack.scope,
              selectedStack.name,
              {
                skills: updatedSkills,
                prompts: updatedPrompts,
                mcps: updatedMcps,
              }
            );

            const updatedStack = {
              ...selectedStack,
              skills: updatedSkills,
              prompts: updatedPrompts,
              mcps: updatedMcps,
            };
            setSelectedStack(updatedStack);
            setStacksList((prev) =>
              prev.map((s) => (s.name === selectedStack.name && s.scope === selectedStack.scope ? updatedStack : s))
            );

            setActionMessage(`Removed ${activeAssetType} "${assetName}" successfully.`);
            setTimeout(() => setActionMessage(null), 2000);
          } catch (err: any) {
            setActionMessage(`Error removing asset: ${err.message}`);
            setTimeout(() => setActionMessage(null), 3000);
          }

          setCurrentView('detail');
        };

        return (
          <Box flexDirection="column" paddingX={1} height={rows} justifyContent="space-between">
            <Box flexDirection="column">
              <Header compact />
              <Text bold color={theme.accent}>Select {activeAssetType} to Remove</Text>
              <Box marginTop={1}>
                {currentAssets.length === 0 ? (
                  <Box flexDirection="column">
                    <Text color={theme.dim}>No {activeAssetType}s in this stack.</Text>
                    <Box marginTop={1}>
                      <CustomSelectInput
                        items={[{ label: '← Back', value: 'back' }]}
                        onSelect={() => setCurrentView('remove_type')}
                      />
                    </Box>
                  </Box>
                ) : (
                  <CustomSelectInput
                    items={items}
                    onSelect={handleRemove}
                  />
                )}
              </Box>
            </Box>
            <Box>
              <Text color={theme.dim}>press enter to select · esc go back</Text>
            </Box>
          </Box>
        );
      }

      return null;
    };
    return <StacksListScreen />;
  }

  if (screen === 'stacks_remove_select') {
    const StacksRemoveScreen = () => {
      const { rows } = useResponsiveLayout();
      const handleRemove = async (item: { value: string }) => {
        const [scope, name] = item.value.split(':');
        try {
          await stackService.remove(scope as Scope, name);
          setInfoState('success');
          setInfoMessage(`Stack "${name}" removed successfully.`);
        } catch (err: any) {
          setInfoState('error');
          setInfoMessage(`Error removing stack: ${err.message}`);
        }
        setScreen('stacks_menu');
      };

      return (
        <Box flexDirection="column" paddingX={1} height={rows} justifyContent="space-between">
          <Box flexDirection="column">
            <Header compact />
            <Text bold color={theme.accent}>Remove Stack</Text>
            <Box marginTop={1}>
              <CustomSelectInput items={selectItems} onSelect={handleRemove} />
            </Box>
          </Box>
          <Box>
            <Text color={theme.dim}>press enter to select · esc go back</Text>
          </Box>
        </Box>
      );
    };
    return <StacksRemoveScreen />;
  }

  // Backup & Restore workflows
  if (screen === 'backup_create_label') {
    return (
      <InputScreen
        title="Save a Backup"
        placeholder="Enter backup label (optional)..."
        onSubmit={(val) => {
          setInputVal(val);
          setScreen('backup_create_app');
        }}
        onBack={() => setScreen('backup_menu')}
      />
    );
  }

  if (screen === 'backup_create_app') {
    return <StableScreenWrapper><BackupApp subcmd="create" idOrName={inputVal || undefined} bypassConfirm={true} onBack={() => setScreen('backup_menu')} /></StableScreenWrapper>;
  }

  if (screen === 'backup_restore_select') {
    return (
      <Box flexDirection="column" paddingX={1} height={rows} justifyContent="space-between">
        <Box flexDirection="column">
          <Header compact />
          <Text bold color={theme.accent}>Restore Backup</Text>
          <Box marginTop={1}>
            <CustomSelectInput
              items={selectItems}
              onSelect={(item) => {
                setInputVal(item.value);
                setScreen('backup_restore_app');
              }}
            />
          </Box>
        </Box>
        <Box>
          <Text color={theme.dim}>WARNING: Restore will completely replace your active environments. · esc go back</Text>
        </Box>
      </Box>
    );
  }

  if (screen === 'backup_restore_app') {
    return <StableScreenWrapper><BackupApp subcmd="restore" idOrName={inputVal} bypassConfirm={true} onBack={() => setScreen('backup_menu')} /></StableScreenWrapper>;
  }

  if (screen === 'backup_list') {
    return <StableScreenWrapper><BackupApp subcmd="list" onBack={() => setScreen('backup_menu')} /></StableScreenWrapper>;
  }

  if (screen === 'backup_delete_select') {
    return (
      <Box flexDirection="column" paddingX={1} height={rows} justifyContent="space-between">
        <Box flexDirection="column">
          <Header compact />
          <Text bold color={theme.accent}>Delete Backup</Text>
          <Box marginTop={1}>
            <CustomSelectInput
              items={selectItems}
              onSelect={(item) => {
                setInputVal(item.value);
                setScreen('backup_delete_app');
              }}
            />
          </Box>
        </Box>
        <Box>
          <Text color={theme.dim}>press enter to select · esc go back</Text>
        </Box>
      </Box>
    );
  }

  if (screen === 'backup_delete_app') {
    return <StableScreenWrapper><BackupApp subcmd="delete" idOrName={inputVal} bypassConfirm={true} onBack={() => setScreen('backup_menu')} /></StableScreenWrapper>;
  }

  // Sync workflows
  if (screen === 'sync_push_app') {
    return <StableScreenWrapper><SyncApp action="push" onBack={() => setScreen('sync_menu')} /></StableScreenWrapper>;
  }

  if (screen === 'sync_pull_app') {
    return <StableScreenWrapper><SyncApp action="pull" onBack={() => setScreen('sync_menu')} /></StableScreenWrapper>;
  }

  // Import workflows
  if (screen === 'import_repo_input') {
    return (
      <InputScreen
        title="Import Repository or Local Folder"
        placeholder="Enter repo path (e.g. user/repo or ./path)..."
        onSubmit={(val) => {
          setInputVal(val);
          setScreen('import_app');
        }}
        onBack={() => setScreen('menu')}
      />
    );
  }

  if (screen === 'import_app') {
    return <StableScreenWrapper><ImportApp source={inputVal} onBack={() => setScreen('menu')} /></StableScreenWrapper>;
  }

  // Default Dashboard Home Screen
  const storageStr = storageInfo.type === 'github' ? 'GitHub' : 'Local';
  const repoStr = storageInfo.repo || 'none';

  return (
    <Box flexDirection="column" paddingX={1} height={rows} justifyContent="space-between">
      <Box flexDirection="column">
        {/* Compact Header */}
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color={theme.accent}>Aman Intelligence</Text>
          <Text color={theme.dim}>Assets</Text>
          <Text>
            MCPs: <Text bold>{stats.mcps}</Text> · Prompts: <Text bold>{stats.prompts}</Text> · Skills:{' '}
            <Text bold>{stats.skills}</Text> · Packs: <Text bold>{stats.packs}</Text> · Stacks:{' '}
            <Text bold>{stats.stacks}</Text>
          </Text>
          <Box flexDirection="row" marginTop={1}>
            <Text>Storage: </Text>
            <GithubIndicator isConnected={isConnected} repository={storageInfo.repo} />
          </Box>
          {storageInfo.repo && <Text color={theme.dim}>Repo: {storageInfo.repo}</Text>}
          <Text color={theme.dim}>
            Last sync: {lastSync} · Last backup: {lastBackup}
          </Text>
          {!isCompact && <Text color={theme.borderMuted}>────────────────────────────────────────────────────────────────────────</Text>}
        </Box>

        {/* Grouped Workflow List in 2 columns */}
        <Box flexDirection="row" justifyContent="space-between">
          {/* Left Column: Discover & Manage */}
          <Box flexDirection="column" flexGrow={1} marginRight={2}>
            <Text bold color={theme.accent}>DISCOVER</Text>
            <Box flexDirection="column" marginLeft={2}>
              {currentMenuItems.filter((i) => i.section === 'Discover').map((item) => {
                const globalIdx = currentMenuItems.findIndex((m) => m.value === item.value);
                const isCurrent = globalIdx === menuCursor;
                return (
                  <Box key={item.value} flexDirection="row">
                    <Text color={isCurrent ? theme.primary : theme.dim}>
                      {isCurrent ? ' › ' : '   '}
                    </Text>
                    <Text bold={isCurrent} color={isCurrent ? theme.text : theme.secondary}>
                      {item.label}
                    </Text>
                  </Box>
                );
              })}
            </Box>

            <Box marginTop={1} flexDirection="column">
              <Text bold color={theme.accent}>MANAGE</Text>
              <Box flexDirection="column" marginLeft={2}>
                {currentMenuItems.filter((i) => i.section === 'Manage').map((item, idx) => {
                  const globalIdx = currentMenuItems.findIndex((m) => m.value === item.value);
                  const isCurrent = globalIdx === menuCursor;
                  return (
                    <Box key={item.value} flexDirection="row">
                      <Text color={isCurrent ? theme.primary : theme.dim}>
                        {isCurrent ? ' › ' : '   '}
                      </Text>
                      <Text bold={isCurrent} color={isCurrent ? theme.text : theme.secondary}>
                        {item.label}
                      </Text>
                    </Box>
                  );
                })}
              </Box>
            </Box>
          </Box>

          {/* Right Column: Environment (5, 6) & System (7, 8, 9) */}
          <Box flexDirection="column" flexGrow={1}>
            <Text bold color={theme.accent}>ENVIRONMENT</Text>
            <Box flexDirection="column" marginLeft={2}>
              {currentMenuItems.filter((i) => i.section === 'Environment').map((item) => {
                const globalIdx = currentMenuItems.findIndex((m) => m.value === item.value);
                const isCurrent = globalIdx === menuCursor;
                return (
                  <Box key={item.value} flexDirection="row">
                    <Text color={isCurrent ? theme.primary : theme.dim}>
                      {isCurrent ? ' › ' : '   '}
                    </Text>
                    <Text bold={isCurrent} color={isCurrent ? theme.text : theme.secondary}>
                      {item.label}
                    </Text>
                  </Box>
                );
              })}
            </Box>

            <Box marginTop={1} flexDirection="column">
              <Text bold color={theme.accent}>SYSTEM</Text>
              <Box flexDirection="column" marginLeft={2}>
                {currentMenuItems.filter((i) => i.section === 'System').map((item) => {
                  const globalIdx = currentMenuItems.findIndex((m) => m.value === item.value);
                  const isCurrent = globalIdx === menuCursor;
                  return (
                    <Box key={item.value} flexDirection="row">
                      <Text color={isCurrent ? theme.primary : theme.dim}>
                        {isCurrent ? ' › ' : '   '}
                      </Text>
                      <Text bold={isCurrent} color={isCurrent ? theme.text : theme.secondary}>
                        {item.label}
                      </Text>
                    </Box>
                  );
                })}
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>

      <Box flexDirection="column">
        {/* Description Panel */}
        {canShowDescriptions && (
        <Box
          flexDirection="column"
          paddingX={2}
          paddingY={1}
          borderStyle="round"
          borderColor={theme.borderMuted}
          height={isCompact ? 0 : 5}
          justifyContent="center"
        >
          <Text color={theme.text}>
            {currentMenuItems[menuCursor]?.description || ''}
          </Text>
        </Box>

        )}

        {/* Footer */}
        <Box marginTop={isCompact ? 1 : 0}>
          {isCompact ? <Text color={theme.dim}>↑↓ Navigate · Enter Select · Esc Back</Text> : <Text color={theme.dim}>↑↓←→ Navigate  ·  Enter Select  ·  Esc Back  ·  Q Quit</Text>}
        </Box>
      </Box>
    </Box>
  );
};

export async function dashboardCommand() {
  const environmentPath = environmentService.getActiveEnvironmentDir();
  const isReady = exists(path.join(environmentPath, 'aman.json'));

  if (!process.stdin.isTTY) {
    if (!isReady) {
      console.log(`\n  \x1b[31;1mAman Intelligence is not initialized yet.\x1b[0m`);
      console.log(`  Run the following command to get started:\n`);
      console.log(`  \x1b[38;2;255;157;35maman init\x1b[0m\n`);
      return;
    }
    const data = await scanAll(environmentPath, 'installed');
    const storage = environmentService.getStorage();
    const localStacks = await stackService.list('global');
    const projectStacks = await stackService.list('project');
    const storageStr = storage.type === 'github' ? `github: ${storage.repository}` : 'local';

    console.log(`\n  \x1b[38;2;255;157;35mAman Intelligence — Asset Hub\x1b[0m`);
    console.log(`  Path:        ${environmentPath}`);
    console.log(`  Storage:     ${storageStr}`);
    console.log(`  Assets:`);
    const packRefs = new Set<string>();
    for (const scope of ['global', 'project'] as const) {
      try {
        const lock = await lockService.read(scope);
        for (const entry of lock.assets) {
          if (entry.source.kind === 'pack') packRefs.add(entry.source.ref);
        }
      } catch {
        // ignore
      }
    }
    console.log(`    MCPs:      ${data.mcps.length}`);
    console.log(`    Prompts:   ${data.prompts.length}`);
    console.log(`    Skills:    ${data.skills.length}`);
    console.log(`    Packs:     ${packRefs.size}`);
    console.log(`    Stacks:    ${localStacks.length + projectStacks.length}\n`);
    console.log('  To open the interactive Asset Hub, run "aman" inside a TTY terminal.\n');
    return;
  }

  const { waitUntilExit } = render(<DashboardApp />);
  await waitUntilExit();
}
