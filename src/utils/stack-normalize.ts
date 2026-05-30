import { randomUUID } from 'crypto';
import { Stack, StackMemberRef } from '../types/index.js';
import { defaultSlugForName } from './slug.js';

function namesFromMembers(members: StackMemberRef[] | undefined): string[] {
  return (members ?? []).map((m) => m.localName);
}

/** Normalize legacy stack JSON to AMAN-STACK-SPEC-V1 compatible shape. */
export function normalizeStack(raw: Stack | null): Stack | null {
  if (!raw || !raw.name) return null;

  const skills = raw.skills?.length ? raw.skills : namesFromMembers(raw.members?.skills);
  const prompts = raw.prompts?.length ? raw.prompts : namesFromMembers(raw.members?.prompts);
  const mcps = raw.mcps?.length ? raw.mcps : namesFromMembers(raw.members?.mcps);

  const buildRefs = (names: string[], existing?: StackMemberRef[]): StackMemberRef[] => {
    if (existing?.length) return existing;
    return names.map((localName) => ({
      localName,
      slug: defaultSlugForName(localName),
      version: '1.0.0',
    }));
  };

  return {
    schemaVersion: raw.schemaVersion ?? 1,
    recordType: raw.recordType ?? 'stack',
    id: raw.id ?? randomUUID(),
    slug: raw.slug ?? `@local/${raw.name}`,
    name: raw.name,
    description: raw.description,
    visibility: raw.visibility ?? 'private',
    members: {
      skills: buildRefs(skills, raw.members?.skills),
      prompts: buildRefs(prompts, raw.members?.prompts),
      mcps: buildRefs(mcps, raw.members?.mcps),
    },
    skills,
    prompts,
    mcps,
    packs: raw.packs ?? [],
    deprecated: raw.deprecated ?? null,
    createdAt: raw.createdAt ?? new Date().toISOString(),
    updatedAt: raw.updatedAt ?? new Date().toISOString(),
  };
}
