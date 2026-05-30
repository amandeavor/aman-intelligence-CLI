import Fuse from 'fuse.js';
import { AssetProvider } from './provider.interface.js';
import { AssetType, ProviderResult, Skill } from '../types/index.js';
import { BUNDLED_SKILLS } from '../config/paths.js';
import { scanSkills } from '../storage/scanner.js';

export class SkillsShProvider implements AssetProvider {
  name = 'skills.sh';

  private bundledSkillsCache: Skill[] | null = null;

  private async getBundledSkills(): Promise<Skill[]> {
    if (!this.bundledSkillsCache) {
      this.bundledSkillsCache = await scanSkills(BUNDLED_SKILLS, this.name);
    }
    return this.bundledSkillsCache;
  }

  async search(query: string, type?: AssetType): Promise<ProviderResult[]> {
    if (type && type !== 'skill') return [];

    const skills = await this.getBundledSkills();
    const results = skills.map((skill) => ({
      type: 'skill' as const,
      name: skill.name,
      source: this.name,
      sources: [this.name],
      description: skill.description,
      tags: skill.tags,
      category: skill.category,
      installs: skill.installs,
      rating: skill.rating,
      updated: skill.updated,
      version: skill.version,
      organization: skill.organization,
      installed: false,
      confidence: 1,
    }));

    if (!query.trim()) return results;

    const fuse = new Fuse(results, {
      keys: ['name', 'description'],
      threshold: 0.3,
    });

    return fuse.search(query).map((result) => result.item);
  }

  async fetch(name: string, type: AssetType): Promise<string> {
    if (type !== 'skill') {
      throw new Error('skills.sh currently provides skills only.');
    }

    const skills = await this.getBundledSkills();
    const skill = skills.find((item) => item.name === name);
    if (!skill) {
      throw new Error(`Skill not found on skills.sh: ${name}`);
    }

    return skill.path;
  }

  async available(): Promise<boolean> {
    return true;
  }
}

export const skillsShProvider = new SkillsShProvider();
