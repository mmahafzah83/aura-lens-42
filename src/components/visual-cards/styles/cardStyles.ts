export type CardStyleName = 'blackboard' | 'ember' | 'teal' | 'paper' | 'navy' | 'sand';

/* ──────────────────────────────────────────────────────────────────────
 * Canvas-export palette constants (single source of truth).
 * html2canvas runs inside an isolated iframe that cannot read CSS vars,
 * so these MUST stay as literal hex. Each constant is annotated with
 * the Standard token it mirrors and matches the canonical Wave-A values.
 * ────────────────────────────────────────────────────────────────────── */
const C = {
  // Brand / bronze family
  BRONZE:        '#B08D3A', // mirrors var(--bronze)
  BRONZE_TEXT:   '#D4B056', // mirrors dark-mode var(--bronze-text) (AA on dark)
  BRONZE_DEEP:   '#8a7440', // mirrors var(--bronze-deep)
  // Signal orange — Wave-A canonical --signal family
  SIGNAL:        '#F97316', // mirrors light var(--signal)
  SIGNAL_LIGHT:  '#FB923C', // signal-400 (decorative gradient stop)
  // Paper / ink (light-mode export backgrounds)
  PAPER:         '#FAF6EE', // mirrors light var(--paper)
  INK:           '#1C1812', // mirrors var(--ink) (export ink)
  INK_MUTED:     '#6B6456', // mirrors var(--ink-3)
  // Editorial gold (teal-card display accent — dark surface only)
  GOLD_LIGHT:    '#D4B056', // mirrors var(--bronze-text) / gold-light
  CREAM:         '#F4EFE2', // mirrors var(--paper-2) on warm dark surface
  // Dark display surfaces (no light-mode equivalent — decorative)
  BOARD:         '#0d0d0d',
  EMBER_DEEP:    '#1a0a04',
  EMBER_MID:     '#2d1108',
  EMBER_RIM:     '#3d1a0c',
  TEAL_DEEP:     '#1C1812',
  TEAL_MID:      '#2A1F14',
  NAVY_DEEP:     '#060E1A',
  NAVY_MID:      '#0C1B33',
  NAVY_RIM:      '#122848',
  NAVY_ACCENT:   '#4A9EE0', // mirrors var(--info)
  SAND_HI:       '#F5F0E4',
  SAND_MID:      '#E8DCC8',
  SAND_LO:       '#DDD2BC',
  SAND_INK:      '#1C1812',
  SAND_INK_MUTED:'#4A4236',
};

export interface CardStyleConfig {
  name: CardStyleName;
  background: string;
  overlay?: string;
  border?: string;
  accent: string;
  accentGradient?: string;
  accentBar: {
    position: 'left' | 'right' | 'top' | 'bottom';
    size: number; // thickness in px
    length?: string; // e.g. '100%' or '80px'
    offset?: number; // offset from edge for partial bars
    background: string;
    rounded?: boolean;
    centered?: boolean;
  };
  tagColor: string;
  tagFont: string;
  headlineFont: string;
  headlineWeight: number;
  headlineSize: number;
  headlineColor: string;
  bodyFont: string;
  bodySize: number;
  bodyColor: string;
  footerColor: string;
  footerAccentColor: string;
  footerBorder: string;
  grain?: boolean;
  grainOpacity?: number;
  radialGlow?: string;
}

const DM = '"DM Sans", system-ui, sans-serif';
const COR = '"Cormorant Garamond", Georgia, serif';
const CAIRO = '"Cairo", system-ui, sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, monospace';

export const CARD_STYLES: Record<CardStyleName, CardStyleConfig> = {
  blackboard: {
    name: 'blackboard',
    background: '#0d0d0d',
    accent: '#B08D3A',
    accentBar: {
      position: 'left',
      size: 4,
      length: '100%',
      background: 'linear-gradient(180deg, #B08D3A, #8a7440)',
    },
    tagColor: '#B08D3A',
    tagFont: MONO,
    headlineFont: DM,
    headlineWeight: 700,
    headlineSize: 26,
    headlineColor: '#e8e4d9',
    bodyFont: DM,
    bodySize: 14,
    bodyColor: '#9e9a8e',
    footerColor: '#9e9a8e',
    footerAccentColor: '#8a7440',
    footerBorder: '1px solid rgba(232,228,217,0.08)',
    grain: true,
    grainOpacity: 0.12,
    radialGlow: 'radial-gradient(circle at 30% 20%, rgba(197,165,90,0.06), transparent 60%)',
  },
  ember: {
    name: 'ember',
    background: 'linear-gradient(145deg, #1a0a04, #2d1108 30%, #3d1a0c 60%, #1a0a04)',
    overlay: 'radial-gradient(circle at 80% 20%, rgba(232,93,36,0.15), transparent 60%)',
    accent: C.SIGNAL,
    accentBar: {
      position: 'top',
      size: 4,
      length: '100%',
      background: `linear-gradient(90deg, ${C.SIGNAL}, ${C.SIGNAL_LIGHT}, transparent)`,
    },
    tagColor: C.SIGNAL_LIGHT,
    tagFont: MONO,
    headlineFont: DM,
    headlineWeight: 700,
    headlineSize: 28,
    headlineColor: '#ffffff',
    bodyFont: DM,
    bodySize: 14,
    bodyColor: 'rgba(255,255,255,0.6)',
    footerColor: 'rgba(255,255,255,0.7)',
    footerAccentColor: C.SIGNAL_LIGHT,
    footerBorder: '1px solid rgba(232,93,36,0.15)',
    grain: true,
    grainOpacity: 0.12,
  },
  teal: {
    name: 'teal',
    background: 'linear-gradient(160deg, #1C1812, #2A1F14 50%, #1C1812)',
    overlay: 'radial-gradient(circle at 60% 30%, rgba(212,176,86,0.08), transparent 60%)',
    accent: '#D4B056',
    accentBar: {
      position: 'bottom',
      size: 3,
      length: 'calc(100% - 160px)',
      background: '#D4B056',
      rounded: true,
      centered: true,
    },
    tagColor: '#D4B056',
    tagFont: MONO,
    headlineFont: COR,
    headlineWeight: 600,
    headlineSize: 26,
    headlineColor: '#F4EFE2',
    bodyFont: DM,
    bodySize: 14,
    bodyColor: 'rgba(244,239,226,0.6)',
    footerColor: 'rgba(244,239,226,0.7)',
    footerAccentColor: '#D4B056',
    footerBorder: '1px solid rgba(212,176,86,0.12)',
    grain: true,
    grainOpacity: 0.08,
  },
  paper: {
    name: 'paper',
    background: '#FAF6EE',
    border: '1px solid rgba(176,141,58,0.15)',
    accent: '#B08D3A',
    accentBar: {
      position: 'left',
      size: 4,
      length: '100%',
      background: '#B08D3A',
    },
    tagColor: '#B08D3A',
    tagFont: MONO,
    headlineFont: COR,
    headlineWeight: 600,
    headlineSize: 28,
    headlineColor: '#1C1812',
    bodyFont: DM,
    bodySize: 14,
    bodyColor: '#6B6456',
    footerColor: '#6B6456',
    footerAccentColor: '#B08D3A',
    footerBorder: '1px solid rgba(176,141,58,0.12)',
  },
  navy: {
    name: 'navy',
    background: 'linear-gradient(155deg, #060E1A, #0C1B33 40%, #122848 70%, #0C1B33)',
    overlay: 'radial-gradient(circle at 70% 25%, rgba(74,158,224,0.08), transparent 60%)',
    accent: '#4A9EE0',
    accentBar: {
      position: 'right',
      size: 4,
      length: '100%',
      background: 'linear-gradient(180deg, #4A9EE0, transparent)',
    },
    tagColor: '#4A9EE0',
    tagFont: MONO,
    headlineFont: DM,
    headlineWeight: 700,
    headlineSize: 24,
    headlineColor: '#ffffff',
    bodyFont: DM,
    bodySize: 14,
    bodyColor: 'rgba(255,255,255,0.5)',
    footerColor: 'rgba(255,255,255,0.65)',
    footerAccentColor: '#4A9EE0',
    footerBorder: '1px solid rgba(74,158,224,0.12)',
    grain: true,
    grainOpacity: 0.08,
  },
  sand: {
    name: 'sand',
    background: 'linear-gradient(170deg, #F5F0E4, #E8DCC8 50%, #DDD2BC)',
    border: '1px solid rgba(28,24,18,0.08)',
    accent: '#1C1812',
    accentBar: {
      position: 'right',
      size: 4,
      length: '80px',
      offset: 32,
      background: '#1C1812',
    },
    tagColor: '#1C1812',
    tagFont: MONO,
    headlineFont: CAIRO,
    headlineWeight: 800,
    headlineSize: 24,
    headlineColor: '#1C1812',
    bodyFont: CAIRO,
    bodySize: 14,
    bodyColor: '#4A4236',
    footerColor: '#4A4236',
    footerAccentColor: '#1C1812',
    footerBorder: '1px solid rgba(28,24,18,0.1)',
  },
};

export const FONTS = { DM, COR, CAIRO, MONO };