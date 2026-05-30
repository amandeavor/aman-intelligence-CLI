import { config } from '../config/index.js';
import { AmanConfig } from '../types/index.js';

export class ConfigService {
  get<K extends keyof AmanConfig>(key: K): AmanConfig[K] {
    return config.get(key);
  }

  set<K extends keyof AmanConfig>(key: K, value: AmanConfig[K]): void {
    config.set(key, value);
  }

  reset(): void {
    config.reset();
  }

  list(): AmanConfig {
    return config.load();
  }

  validate(): boolean {
    const data = this.list();
    return typeof data === 'object' && data !== null;
  }
}

export const configService = new ConfigService();
