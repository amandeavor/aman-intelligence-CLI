import { AssetType, Scope } from '../types/index.js';

export type ImportSourceId =
  | 'claude-code'
  | 'cursor'
  | 'windsurf'
  | 'continue'
  | 'vscode'
  | 'github-copilot'
  | 'codex'
  | 'local-folder'
  | 'custom-path'
  | 'aman-environment'
  | 'antigravity';

export type ImportCanonicalStatus = 'canonical' | 'convertible' | 'ambiguous' | 'unknown';

export type ImportDestination = 'local' | 'github';

export type TypeSelectionMode = 'all' | 'select' | 'skip';

export type ConflictResolution = 'skip' | 'rename' | 'overwrite';

export type ConflictBulkMode = 'ask' | 'rename-all' | 'skip-all' | 'replace-all';

export interface ImportProvenance {
  tool: string;
  sourcePath: string;
  importedAt: string;
}

export interface ImportAdapterDescriptor {
  id: ImportSourceId;
  label: string;
  description: string;
  available: boolean;
  unavailableReason?: string;
}

export interface DiscoveredImportAsset {
  /** Stable id within a scan result */
  id: string;
  type: AssetType;
  name: string;
  description: string;
  sourcePath: string;
  originLabel: string;
  canonicalStatus: ImportCanonicalStatus;
  canonicalNote?: string;
  confidence: number;
  adapterId: ImportSourceId;
  /** When sourcePath is a multi-server MCP config, the server key to extract */
  mcpServerName?: string;
  /** Provenance tracking for imported assets */
  provenance?: ImportProvenance;
}

export interface TypeImportSelection {
  mode: TypeSelectionMode;
  selectedIds: Set<string>;
}

export interface ImportConflict {
  asset: DiscoveredImportAsset;
  existingLocalName: string;
  resolution: ConflictResolution;
  resolvedName: string;
}

export interface ImportPlan {
  sourceId: ImportSourceId;
  sourceLabel: string;
  destination: ImportDestination;
  scope: Scope;
  items: DiscoveredImportAsset[];
  conflicts: ImportConflict[];
}

export interface ImportResult {
  imported: number;
  skipped: number;
  renamed: number;
  overwritten: number;
  errors: string[];
}

export interface ImportAdapter {
  id: ImportSourceId;
  label: string;
  description: string;
  isAvailable(): boolean;
  unavailableReason(): string;
  scan(options?: { rootPath?: string }): Promise<DiscoveredImportAsset[]>;
}
