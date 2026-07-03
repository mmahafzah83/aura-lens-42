// Broadsheet press tokens: literal hex constants for the SVG→canvas export
// pipeline (CSS vars cannot be resolved during rasterisation).
// Each constant is annotated with the System-A token it mirrors.

export const PAPER = '#F1ECE1';       // var(--paper)
export const PAPER2 = '#EAE3D4';      // var(--paper-2)
export const INK = '#1B1712';         // var(--ink)
export const INK2 = '#5C5347';        // var(--ink-2)
export const SPOT = '#6E2A26';        // oxblood spot
export const LIVE = '#36C5B0';        // teal — positive deltas ONLY
export const ACTION = '#D6A748';      // amber

export const RULE = 'rgba(27,23,18,0.24)';
export const RULE_SOFT = 'rgba(27,23,18,0.10)';
export const INK_FAINT = 'rgba(27,23,18,0.16)';

export const SERIF = "'Newsreader', Georgia, serif";
export const MONO = "'IBM Plex Mono', ui-monospace, monospace";
export const ARABIC = "'Cairo', 'DM Sans', sans-serif";