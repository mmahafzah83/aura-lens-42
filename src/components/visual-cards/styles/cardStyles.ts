export type CardStyleName = 'blackboard' | 'ember' | 'teal' | 'paper' | 'navy' | 'sand';

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
    accent: '#C5A55A',
    accentBar: {
      position: 'left',
      size: 4,
      length: '100%',
      background: 'linear-gradient(180deg, #C5A55A, #8a7440)',
    },
    tagColor: '#C5A55A',
    tagFont: MONO,
    headlineFont: DM,
    headlineWeight: 700,
    headlineSize: 26,
    headlineColor: '#e8e4d9',
    bodyFont: DM,
    bodySize: 14,
    bodyColor: '#9e9a8e',
    footerColor: '#5a5850',
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
    accent: '#E85D24',
    accentBar: {
      position: 'top',
      size: 4,
      length: '100%',
      background: 'linear-gradient(90deg, #E85D24, #F4845F, transparent)',
    },
    tagColor: '#F4845F',
    tagFont: MONO,
    headlineFont: DM,
    headlineWeight: 700,
    headlineSize: 28,
    headlineColor: '#ffffff',
    bodyFont: DM,
    bodySize: 14,
    bodyColor: 'rgba(255,255,255,0.6)',
    footerColor: 'rgba(255,255,255,0.45)',
    footerAccentColor: '#F4845F',
    footerBorder: '1px solid rgba(232,93,36,0.15)',
    grain: true,
    grainOpacity: 0.12,
  },
  teal: {
    name: 'teal',
    background: 'linear-gradient(160deg, #071F1F, #0A2E2E 40%, #0D3B3B 70%, #071F1F)',
    overlay: 'radial-gradient(circle at 60% 30%, rgba(94,234,212,0.06), transparent 60%)',
    accent: '#5EEAD4',
    accentBar: {
      position: 'bottom',
      size: 3,
      length: 'calc(100% - 160px)',
      background: '#5EEAD4',
      rounded: true,
      centered: true,
    },
    tagColor: '#5EEAD4',
    tagFont: MONO,
    headlineFont: COR,
    headlineWeight: 600,
    headlineSize: 26,
    headlineColor: '#ffffff',
    bodyFont: DM,
    bodySize: 14,
    bodyColor: 'rgba(255,255,255,0.55)',
    footerColor: 'rgba(255,255,255,0.45)',
    footerAccentColor: '#5EEAD4',
    footerBorder: '1px solid rgba(94,234,212,0.1)',
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
    footerColor: 'rgba(255,255,255,0.4)',
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