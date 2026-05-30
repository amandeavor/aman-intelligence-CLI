import path from 'path';
import { registryService } from '../registry/registry.service.js';
import { RegistryError } from '../registry/errors.js';
import { parseRegistryReference } from '../registry/slug-utils.js';
import { AssetType } from '../types/index.js';
import { assetDir, isCanonicalAssetDir } from '../storage/asset-layout.js';
import { exists } from '../storage/filesystem.js';
import { environmentService } from '../services/environment.service.js';
import { localNameFromSlug } from '../utils/slug.js';

function printRegistryError(err: unknown): void {
  if (err instanceof RegistryError) {
    console.error(`Registry error [${err.code}]: ${err.message}`);
    return;
  }
  console.error(err);
}

export async function registryCommand(args: string[], options: { github?: boolean }) {
  const sub = args[0];
  const rest = args.slice(1);

  if (options.github) {
    registryService.setBackend('github');
  }

  switch (sub) {
    case 'publish':
      await publishSubcommand(rest);
      break;
    case 'deprecate':
      await deprecateSubcommand(rest);
      break;
    case 'list':
      await listSubcommand(rest);
      break;
    case 'search':
      await searchSubcommand(rest.join(' '));
      break;
    case 'resolve':
      await resolveSubcommand(rest);
      break;
    default:
      console.log(`Usage: aman registry <command>

Commands:
  publish   Publish a canonical asset directory to the registry
  deprecate Mark a published version deprecated
  list      List published versions for a slug
  search    Search the registry index
  resolve   Resolve slug@version metadata

Examples:
  aman registry publish ./skills/caveman --slug @aman/caveman --version 1.0.0 --type skill
  aman registry deprecate @aman/caveman@1.0.0 --reason "Superseded" --successor @aman/caveman@1.0.1
  aman registry list @aman/caveman
  aman registry search react
  aman install @aman/caveman@1.0.0 --global
`);
  }
}

async function publishSubcommand(args: string[]) {
  const contentArg = args[0];
  if (!contentArg) {
    console.error('Usage: aman registry publish <content-dir> --slug @scope/name --version X.Y.Z --type skill|prompt|mcp');
    process.exit(1);
  }

  let slug = '';
  let version = '';
  let type: AssetType = 'skill';
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--slug' && args[i + 1]) slug = args[++i];
    else if (args[i] === '--version' && args[i + 1]) version = args[++i];
    else if (args[i] === '--type' && args[i + 1]) type = args[++i] as AssetType;
  }

  if (!slug || !version) {
    console.error('Required: --slug @scope/name --version X.Y.Z');
    process.exit(1);
  }

  const contentDirectory = path.resolve(contentArg);
  if (!exists(contentDirectory) || !isCanonicalAssetDir(type, contentDirectory)) {
    console.error(`Not a canonical ${type} directory: ${contentDirectory}`);
    process.exit(1);
  }

  const name = localNameFromSlug(slug);
  const id = registryService.newPublishId();

  try {
    const result = await registryService.publish({
      slug,
      version,
      type,
      contentDirectory,
      metadata: {
        id,
        slug,
        type,
        name,
        description: '',
        version,
        author: 'local',
        tags: [],
        visibility: 'public',
        dependencies: [],
      },
    });
    console.log(`Published ${result.record.slug}@${result.record.version}`);
    console.log(`  id: ${result.record.id}`);
    console.log(`  checksum: ${result.record.integrity.checksum}`);
  } catch (err) {
    printRegistryError(err);
    process.exit(1);
  }
}

async function deprecateSubcommand(args: string[]) {
  const ref = parseRegistryReference(args[0] ?? '');
  if (!ref) {
    console.error('Usage: aman registry deprecate @scope/name@X.Y.Z --reason "..." [--successor @scope/name@X.Y.Z]');
    process.exit(1);
  }

  let reason = '';
  let successor: string | undefined;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--reason' && args[i + 1]) reason = args[++i];
    else if (args[i] === '--successor' && args[i + 1]) successor = args[++i];
  }
  if (!reason) {
    console.error('Required: --reason');
    process.exit(1);
  }

  try {
    const result = await registryService.deprecate({
      slug: ref.slug,
      version: ref.version,
      reason,
      successor,
    });
    console.log(`Deprecated ${ref.slug}@${ref.version}`);
    console.log(`  reason: ${result.record.deprecated?.reason}`);
  } catch (err) {
    printRegistryError(err);
    process.exit(1);
  }
}

async function listSubcommand(args: string[]) {
  const slug = args[0];
  if (!slug?.startsWith('@')) {
    console.error('Usage: aman registry list @scope/name');
    process.exit(1);
  }
  try {
    const result = await registryService.list({ slug });
    console.log(`${result.slug} (${result.id})`);
    for (const v of result.versions) {
      const dep = v.deprecated ? ' [deprecated]' : '';
      console.log(`  ${v.version}${dep}  ${v.integrity.checksum}`);
    }
  } catch (err) {
    printRegistryError(err);
    process.exit(1);
  }
}

async function searchSubcommand(query: string) {
  const result = await registryService.search({ query });
  for (const hit of result.hits) {
    const dep = hit.record.deprecated ? ' [deprecated]' : '';
    const verified = hit.record.trust.verified ? ' verified' : '';
    console.log(`${hit.slug}@${hit.latestVersion}${dep}${verified}  downloads:${hit.record.trust.downloads}`);
  }
  if (result.hits.length === 0) {
    console.log('No matches.');
  }
}

async function resolveSubcommand(args: string[]) {
  const ref = parseRegistryReference(args[0] ?? '');
  if (!ref) {
    console.error('Usage: aman registry resolve @scope/name@X.Y.Z');
    process.exit(1);
  }
  try {
    const resolved = await registryService.resolve(ref);
    console.log(JSON.stringify(resolved.record, null, 2));
  } catch (err) {
    printRegistryError(err);
    process.exit(1);
  }
}

/** Publish from an installed global asset path (convenience for bootstrapping). */
export async function publishInstalledAsset(
  localName: string,
  type: AssetType,
  slug: string,
  version: string
): Promise<void> {
  const root = environmentService.getActiveEnvironmentDir();
  const typeRoot =
    type === 'skill'
      ? path.join(root, 'skills')
      : type === 'prompt'
        ? path.join(root, 'prompts')
        : path.join(root, 'mcps');
  const contentDirectory = assetDir(type, typeRoot, localName);
  await registryService.publish({
    slug,
    version,
    type,
    contentDirectory,
    metadata: {
      id: registryService.newPublishId(),
      slug,
      type,
      name: localName,
      description: '',
      version,
      author: 'local',
      tags: [],
      visibility: 'public',
      dependencies: [],
    },
  });
}
