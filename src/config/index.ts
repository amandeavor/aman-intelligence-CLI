import fs from 'fs';
import Conf from 'conf';
import { AmanConfig } from '../types/index.js';
import { GLOBAL_CONFIG_DIR } from './paths.js';
import path from 'path';

const defaultConfig: AmanConfig = {
  theme: 'auto',
  defaultScope: 'global',
  environmentPath: undefined,
  storage: undefined,
  marketplaces: ['skills.sh'],
  animationMode: 'normal',
};

class ConfigManager {
  private globalConf!: Conf<AmanConfig>;

  constructor() {
    try {
      this.globalConf = new Conf<AmanConfig>({
        projectName: 'aman',
        cwd: GLOBAL_CONFIG_DIR,
        configName: 'aman',
        defaults: defaultConfig,
      });
    } catch (err) {
      const configPath = path.join(GLOBAL_CONFIG_DIR, 'aman.json');
      if (fs.existsSync(configPath)) {
        const timestamp = new Date().toISOString().slice(0, 10);
        const backupPath = path.join(GLOBAL_CONFIG_DIR, `aman.json.corrupted-${timestamp}`);
        try {
          fs.renameSync(configPath, backupPath);
        } catch {
          // Ignore
        }
      }
      
      console.error('\n  \x1b[31;1mConfiguration file was corrupted.\x1b[0m');
      console.error('  \x1b[33mA backup was created.\x1b[0m');
      console.error('  \x1b[32mDefaults have been restored.\x1b[0m\n');

      this.globalConf = new Conf<AmanConfig>({
        projectName: 'aman',
        cwd: GLOBAL_CONFIG_DIR,
        configName: 'aman',
        defaults: defaultConfig,
      });
    }
  }

  load(): AmanConfig {
    return this.globalConf.store;
  }

  get<K extends keyof AmanConfig>(key: K): AmanConfig[K] {
    return this.globalConf.get(key) as AmanConfig[K];
  }

  set<K extends keyof AmanConfig>(key: K, value: AmanConfig[K]): void {
    this.globalConf.set(key, value);
  }

  reset(): void {
    this.globalConf.clear();
    this.globalConf.store = defaultConfig;
  }

  getTheme(): 'dark' | 'light' {
    const theme = this.get('theme');
    if (theme === 'auto') {
      const colorfgbg = process.env.COLORFGBG;
      if (colorfgbg) {
        const parts = colorfgbg.split(';');
        const bg = parts[parts.length - 1];
        const bgNum = parseInt(bg, 10);
        if (!isNaN(bgNum)) {
          return bgNum >= 7 && bgNum !== 8 ? 'light' : 'dark';
        }
      }
      return 'dark';
    }
    return theme;
  }

  onDidChange<K extends keyof AmanConfig>(key: K, callback: (value?: AmanConfig[K]) => void): () => void {
    return this.globalConf.onDidChange(key, callback);
  }
}

export const config = new ConfigManager();
