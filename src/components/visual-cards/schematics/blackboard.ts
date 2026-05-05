import { createContext, useContext } from 'react';

export const BLACKBOARD = {
  bg: '#0d0d0d',
  chalk: '#e8e4d9',
  chalkDim: '#9e9a8e',
  chalkFaint: '#5a5850',
  gold: '#C5A55A',
  goldDim: '#8a7440',
  goldBright: '#e0c675',
  ember: '#E85D24',
  teal: '#5EEAD4',
  fonts: {
    title: "'DM Sans', sans-serif",
    body: "'DM Sans', sans-serif",
    mono: "'JetBrains Mono', monospace",
    display: "'Cormorant Garamond', serif",
    handwritten: "'Caveat', cursive",
  },
  nodeStroke: '#5a5850',
  nodeStrokeHighlighted: '#C5A55A',
  nodeFill: 'rgba(232,228,217,0.03)',
  nodeFillHighlighted: 'rgba(197,165,90,0.08)',
} as const;

export interface SchematicNode {
  id: string;
  label: string;
  value?: string;
  highlighted?: boolean;
  position?: { x: number; y: number };
}

export interface SchematicEdge {
  from: string;
  to: string;
  label?: string;
  style?: 'solid' | 'dashed' | 'gold';
}

export interface SchematicAnnotation {
  text: string;
  position: { x: number; y: number };
  style?: 'handwritten' | 'label' | 'accent';
}

export interface SchematicSpec {
  type:
    | 'flow' | 'cycle' | 'matrix' | 'funnel' | 'timeline' | 'layers' | 'radar' | 'bar_chart'
    | 'bridge' | 'pyramid' | 'gauge' | 'scatter' | 'venn' | 'process' | 'equation' | 'ecosystem';
  title: string;
  subtitle?: string;
  tag?: string;
  nodes: SchematicNode[];
  edges?: SchematicEdge[];
  annotations?: SchematicAnnotation[];
  author: { name: string; title: string };
}

export function annotationStyle(a: SchematicAnnotation) {
  switch (a.style) {
    case 'handwritten':
      return { fontFamily: BLACKBOARD.fonts.handwritten, fill: BLACKBOARD.ember, fontSize: 28 };
    case 'accent':
      return { fontFamily: BLACKBOARD.fonts.mono, fill: BLACKBOARD.gold, fontSize: 16, letterSpacing: 1 };
    case 'label':
    default:
      return { fontFamily: BLACKBOARD.fonts.body, fill: BLACKBOARD.chalkDim, fontSize: 16 };
  }
}

export function edgeStroke(style?: 'solid' | 'dashed' | 'gold') {
  if (style === 'gold') return { stroke: BLACKBOARD.gold, strokeWidth: 2, strokeDasharray: undefined };
  if (style === 'dashed') return { stroke: BLACKBOARD.chalkFaint, strokeWidth: 1.5, strokeDasharray: '6 6' };
  return { stroke: BLACKBOARD.chalkDim, strokeWidth: 1.5, strokeDasharray: undefined };
}

export const SchematicLangContext = createContext<'en' | 'ar'>('en');
export function useSchematicFonts() {
  const lang = useContext(SchematicLangContext);
  const isRtl = lang === 'ar';
  const arabic = "'Cairo', 'DM Sans', sans-serif";
  return {
    isRtl,
    body: isRtl ? arabic : BLACKBOARD.fonts.body,
    title: isRtl ? arabic : BLACKBOARD.fonts.title,
    mono: isRtl ? arabic : BLACKBOARD.fonts.mono,
    handwritten: isRtl ? arabic : BLACKBOARD.fonts.handwritten,
    direction: isRtl ? ('rtl' as const) : ('ltr' as const),
  };
}
