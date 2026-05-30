import { config } from '../config/index.js';

export const darkPalette = {
  primary: '#FF9D23',       // Signature Aman Amber
  accent: '#A78BFA',        // Violet supporting accent
  highlight: '#FF9D23',     // Highlight (Primary Amber)
  cyan: '#22D3EE',
  secondary: '#CBD5E1',     // Slate 300
  success: '#34D399',       // Emerald 400
  error: '#F87171',         // Red 400
  warning: '#FBBF24',       // Amber 400
  dim: '#94A3B8',           // Slate 400
  border: '#475569',        // Slate 600
  borderMuted: '#334155',    // Slate 700
  text: '#F8FAFC',          // Slate 50
};

export const lightPalette = {
  primary: '#D97706',       // High-contrast Dark Amber
  accent: '#7C3AED',        // High-contrast Violet
  highlight: '#D97706',     // Highlight
  cyan: '#0891B2',          // Cyan 600
  secondary: '#475569',     // Slate 600
  success: '#059669',       // Emerald 600
  error: '#DC2626',         // Red 600
  warning: '#D97706',       // Amber 600
  dim: '#64748B',           // Slate 500
  border: '#CBD5E1',        // Slate 300
  borderMuted: '#E2E8F0',   // Slate 200
  text: '#0F172A',          // Slate 900
};

function getActivePalette() {
  const activeTheme = config.getTheme();
  return activeTheme === 'light' ? lightPalette : darkPalette;
}

export const theme = {
  get primary() { return getActivePalette().primary; },
  get accent() { return getActivePalette().accent; },
  get highlight() { return getActivePalette().highlight; },
  get cyan() { return getActivePalette().cyan; },
  get secondary() { return getActivePalette().secondary; },
  get success() { return getActivePalette().success; },
  get error() { return getActivePalette().error; },
  get warning() { return getActivePalette().warning; },
  get dim() { return getActivePalette().dim; },
  get border() { return getActivePalette().border; },
  get borderMuted() { return getActivePalette().borderMuted; },
  get text() { return getActivePalette().text; },
};

