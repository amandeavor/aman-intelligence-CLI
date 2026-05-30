import { randomUUID } from 'crypto';
import path from 'path';
import { LOCAL_DIR } from '../config/paths.js';
import { writeJson, removeDir, exists, ensureDir, readJson } from '../storage/filesystem.js';
import { scanStacks } from '../storage/scanner.js';
import { Stack, Scope } from '../types/index.js';
import { promises as fs } from 'fs';
import { environmentService } from './environment.service.js';
import { defaultSlugForName } from '../utils/slug.js';

function buildMembers(
  skills: string[],
  prompts: string[],
  mcps: string[],
  version = '1.0.0'
): NonNullable<Stack['members']> {
  return {
    skills: skills.map((localName) => ({
      localName,
      slug: defaultSlugForName(localName),
      version,
    })),
    prompts: prompts.map((localName) => ({
      localName,
      slug: defaultSlugForName(localName),
      version,
    })),
    mcps: mcps.map((localName) => ({
      localName,
      slug: defaultSlugForName(localName),
      version,
    })),
  };
}

export class StackService {
  private getTargetDir(scope: Scope): string {
    return scope === 'global'
      ? path.join(environmentService.getActiveEnvironmentDir(), 'stacks')
      : path.join(LOCAL_DIR, 'stacks');
  }

  async create(
    scope: Scope,
    name: string,
    skills: string[],
    prompts: string[],
    mcps: string[],
    description?: string
  ): Promise<void> {
    const now = new Date().toISOString();
    const stack: Stack = {
      schemaVersion: 1,
      recordType: 'stack',
      id: randomUUID(),
      slug: `@local/${name}`,
      name,
      description,
      visibility: 'private',
      members: buildMembers(skills, prompts, mcps),
      skills,
      prompts,
      mcps,
      packs: [],
      deprecated: null,
      createdAt: now,
      updatedAt: now,
    };

    const targetDir = this.getTargetDir(scope);
    await ensureDir(targetDir);
    const destPath = path.join(targetDir, `${name}.json`);
    await writeJson(destPath, stack);
  }

  async update(
    scope: Scope,
    name: string,
    updates: Partial<Pick<Stack, 'skills' | 'prompts' | 'mcps' | 'description'>>
  ): Promise<void> {
    const targetDir = this.getTargetDir(scope);
    const destPath = path.join(targetDir, `${name}.json`);
    if (!exists(destPath)) {
      throw new Error(`Stack "${name}" not found in scope "${scope}"`);
    }
    const stack = await readJson<Stack>(destPath);
    if (!stack) {
      throw new Error(`Failed to read stack "${name}" in scope "${scope}"`);
    }

    const skills = updates.skills ?? stack.skills;
    const prompts = updates.prompts ?? stack.prompts;
    const mcps = updates.mcps ?? stack.mcps;

    const updatedStack: Stack = {
      ...stack,
      ...updates,
      skills,
      prompts,
      mcps,
      members: buildMembers(skills, prompts, mcps),
      updatedAt: new Date().toISOString(),
    };
    await writeJson(destPath, updatedStack);
  }

  async remove(scope: Scope, name: string): Promise<void> {
    const targetDir = this.getTargetDir(scope);
    const destPath = path.join(targetDir, `${name}.json`);
    if (exists(destPath)) {
      await fs.unlink(destPath);
    }
  }

  async list(scope: Scope): Promise<Stack[]> {
    const targetDir = this.getTargetDir(scope);
    return await scanStacks(targetDir, scope);
  }
}

export const stackService = new StackService();
