import { useState, useEffect } from 'react';
import { useStdout } from 'ink';

export interface StdoutDimensions {
  columns: number;
  rows: number;
}

export function useStdoutDimensions(): StdoutDimensions {
  const { stdout } = useStdout();
  const [dimensions, setDimensions] = useState<StdoutDimensions>({
    columns: stdout.columns || 80,
    rows: stdout.rows || 24,
  });

  useEffect(() => {
    const handler = () => {
      setDimensions({
        columns: stdout.columns || 80,
        rows: stdout.rows || 24,
      });
    };

    stdout.on('resize', handler);
    return () => {
      stdout.off('resize', handler);
    };
  }, [stdout]);

  return dimensions;
}

export interface ResponsiveLayout {
  columns: number;
  rows: number;
  physicalColumns: number;
  physicalRows: number;
  isTooSmall: boolean;
  isCompact: boolean;
  canShowDescriptions: boolean;
  canShowFooter: boolean;
  canShowDetailsPanel: boolean;
}

/** Below this width: browse/search use plain output only. */
export const PLAIN_OUTPUT_MAX_COLUMNS = 60;

export const MIN_COLUMNS = 70;
export const MIN_ROWS = 20;

export const COMPACT_MAX_COLUMNS = 90;
export const COMPACT_MAX_ROWS = 28;

export function useResponsiveLayout(): ResponsiveLayout {
  const { columns, rows } = useStdoutDimensions();

  const isTooSmall = columns < MIN_COLUMNS || rows < MIN_ROWS;
  const isCompact = columns < COMPACT_MAX_COLUMNS || rows < COMPACT_MAX_ROWS;

  return {
    columns,
    rows: Math.max(1, rows - 1),
    physicalColumns: columns,
    physicalRows: rows,
    isTooSmall,
    isCompact,
    canShowDescriptions: !isCompact,
    canShowFooter: true, // Always show footer for now, adjust if needed
    canShowDetailsPanel: !isCompact && columns > 120, // Optional future use
  };
}

