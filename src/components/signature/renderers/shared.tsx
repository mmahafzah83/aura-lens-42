import { CSSProperties } from "react";

/**
 * Shared props + tokens for every Signature Studio SVG card.
 * Literal hex only — the export pipeline rasterises via canvas and cannot
 * resolve CSS custom properties mid-serialisation.
 */

export type Lang = "en" | "ar";
export type Mood = "oxblood" | "teal" | "amber";

export interface RendererProps {
  lang: Lang;
  mood: Mood;
  photoUrl?: string;
  name: string;
  title: string;
  lines: string[];
  meta?: string;
}

/**
 * Geometry helper — single source of canvas + safe-zone constants for
 * every renderer. Pass square=true for 1080×1080 exports; default is 4:5
 * (1080×1350). Every renderer must derive x/y from this — never hardcode.
 */
export interface Geometry {
  W: number;
  H: number;
  PAD: number;
  SAFE_X0: number;
  SAFE_X1: number;
  SAFE_Y0: number;
  SAFE_Y1: number;
  CONTENT_W: number;
  CONTENT_H: number;
  QUOTE_MEASURE: number;
  square: boolean;
}

export function getGeometry(square = false): Geometry {
  const W = 1080;
  const H = square ? 1080 : 1350;
  const PAD = Math.round(W * 0.12);
  const SAFE_X0 = PAD;
  const SAFE_X1 = W - PAD;
  const SAFE_Y0 = PAD;
  const SAFE_Y1 = H - PAD;
  const CONTENT_W = SAFE_X1 - SAFE_X0;
  const CONTENT_H = SAFE_Y1 - SAFE_Y0;
  const QUOTE_MEASURE = Math.round(CONTENT_W * 0.92);
  return { W, H, PAD, SAFE_X0, SAFE_X1, SAFE_Y0, SAFE_Y1, CONTENT_W, CONTENT_H, QUOTE_MEASURE, square };
}

// System-A literal tokens (mirrors src/components/broadsheet/pressTokens.ts).
export const T = {
  paper: "#F1ECE1",
  paper2: "#EAE3D4",
  ink: "#1B1712",
  ink2: "#5C5347",
  ink3: "#8A8272",
  oxblood: "#6E2A26",
  teal: "#36C5B0",
  amber: "#D6A748",
  darkBg1: "#0A0F16",
  darkBg2: "#05080C",
  panel: "#14110D",
  paperFaint: "rgba(241,236,225,0.86)",
  rule: "rgba(27,23,18,0.24)",
  ruleOnDark: "rgba(231,225,211,0.16)",
};

export function moodColor(m: Mood): string {
  if (m === "oxblood") return T.oxblood;
  if (m === "teal") return T.teal;
  return T.amber;
}

export const SERIF = "'Newsreader', Georgia, serif";
export const MONO = "'IBM Plex Mono', ui-monospace, monospace";
export const ARABIC = "'Cairo', system-ui, sans-serif";

export function isAr(lang: Lang): boolean {
  return lang === "ar";
}

export function anchorStart(lang: Lang): "start" | "end" {
  return isAr(lang) ? "end" : "start";
}
export function anchorEnd(lang: Lang): "start" | "end" {
  return isAr(lang) ? "start" : "end";
}
/** X of the inline-start edge inside the safe zone. */
export function xStart(lang: Lang, g: Geometry): number {
  return isAr(lang) ? g.SAFE_X1 : g.SAFE_X0;
}
/** X of the inline-end edge inside the safe zone. */
export function xEnd(lang: Lang, g: Geometry): number {
  return isAr(lang) ? g.SAFE_X0 : g.SAFE_X1;
}

export const DEFAULT_SVG_STYLE: CSSProperties = {
  display: "block",
  width: "100%",
  height: "auto",
};

export interface SvgRootProps {
  children: React.ReactNode;
  role?: string;
  ariaLabel?: string;
  geom: Geometry;
}

export function SvgRoot({ children, role = "img", ariaLabel, geom }: SvgRootProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${geom.W} ${geom.H}`}
      width={geom.W}
      height={geom.H}
      role={role}
      aria-label={ariaLabel}
      style={DEFAULT_SVG_STYLE}
    >
      {children}
    </svg>
  );
}

/**
 * Real Horizon-Eye ray data mirrored from public/aura-mark.svg (native
 * 64×64). Kept inline so the mark rasterises inside svgToImageBlob — an
 * <image href=/aura-mark.svg> would break at export time.
 * Format: [x1, y1, x2, y2, strokeWidth]
 */
const AURA_RAY_LINES: Array<[number, number, number, number, number]> = [
  [32, 18.89, 32, 8.77, 1.2],
  [33.87, 19.03, 34.8, 12.54, 0.78],
  [35.69, 19.42, 37.54, 13.14, 0.78],
  [37.44, 20.08, 40.17, 14.12, 0.78],
  [39.09, 20.97, 44.56, 12.45, 1.2],
  [40.58, 22.09, 44.87, 17.14, 0.78],
  [41.91, 23.42, 46.86, 19.13, 0.78],
  [43.03, 24.91, 48.54, 21.37, 0.78],
  [43.92, 26.56, 53.13, 22.35, 1.2],
  [44.58, 28.31, 50.86, 26.46, 0.78],
  [44.97, 30.13, 51.46, 29.2, 0.78],
  [45.11, 32, 51.66, 32, 0.78],
  [44.97, 33.87, 55, 35.31, 1.2],
  [44.58, 35.69, 50.86, 37.54, 0.78],
  [43.92, 37.44, 49.88, 40.17, 0.78],
  [43.03, 39.09, 48.54, 42.63, 0.78],
  [41.91, 40.58, 49.56, 47.22, 1.2],
  [40.58, 41.91, 44.87, 46.86, 0.78],
  [39.09, 43.03, 42.63, 48.54, 0.78],
  [37.44, 43.92, 40.17, 49.88, 0.78],
  [35.69, 44.58, 38.55, 54.29, 1.2],
  [33.87, 44.97, 34.8, 51.46, 0.78],
  [32, 45.11, 32, 51.66, 0.78],
  [30.13, 44.97, 29.2, 51.46, 0.78],
  [28.31, 44.58, 25.45, 54.29, 1.2],
  [26.56, 43.92, 23.83, 49.88, 0.78],
  [24.91, 43.03, 21.37, 48.54, 0.78],
  [23.42, 41.91, 19.13, 46.86, 0.78],
  [22.09, 40.58, 14.44, 47.22, 1.2],
  [20.97, 39.09, 15.46, 42.63, 0.78],
  [20.08, 37.44, 14.12, 40.17, 0.78],
  [19.42, 35.69, 13.14, 37.54, 0.78],
  [19.03, 33.87, 9, 35.31, 1.2],
  [18.89, 32, 12.34, 32, 0.78],
  [19.03, 30.13, 12.54, 29.2, 0.78],
  [19.42, 28.31, 13.14, 26.46, 0.78],
  [20.08, 26.56, 10.87, 22.35, 1.2],
  [20.97, 24.91, 15.46, 21.37, 0.78],
  [22.09, 23.42, 17.14, 19.13, 0.78],
  [23.42, 22.09, 19.13, 17.14, 0.78],
  [24.91, 20.97, 19.44, 12.45, 1.2],
  [26.56, 20.08, 23.83, 14.12, 0.78],
  [28.31, 19.42, 26.46, 13.14, 0.78],
  [30.13, 19.03, 29.2, 12.54, 0.78],
];

function AuraGlyph({ color }: { color: string }) {
  return (
    <g fill={color} stroke={color} strokeLinecap="round">
      {AURA_RAY_LINES.map((l, i) => (
        <line key={i} x1={l[0]} y1={l[1]} x2={l[2]} y2={l[3]} strokeWidth={l[4]} />
      ))}
      <circle cx="32" cy="32" r="6.85" stroke="none" />
      <g stroke={T.teal} fill={T.teal} strokeLinecap="round">
        <line x1="40.07" y1="21.67" x2="49.24" y2="9.94" strokeWidth="1.55" />
        <circle cx="49.24" cy="9.94" r="1.61" />
      </g>
    </g>
  );
}

/**
 * AuraMark — real Horizon-Eye glyph + AURA wordmark, inlined so it
 * rasterises inside the exported SVG. Placed at the bottom inline-end
 * corner of every card, inside the safe zone.
 */
export function AuraMark({ lang, color = T.paper, geom }: { lang: Lang; color?: string; geom: Geometry }) {
  const ar = isAr(lang);
  const size = 26;
  const gap = 8;
  const wordWidth = 54; // approximate width of "AURA" at fontSize 14 + tracking
  const bottomY = geom.SAFE_Y1;
  if (ar) {
    const wordX = geom.SAFE_X0;
    const glyphX = wordX + wordWidth + gap;
    return (
      <g opacity="0.78">
        <text
          x={wordX}
          y={bottomY - size / 2}
          fill={color}
          fontFamily={MONO}
          fontSize="14"
          letterSpacing="0.32em"
          textAnchor="start"
          dominantBaseline="middle"
        >
          AURA
        </text>
        <g transform={`translate(${glyphX}, ${bottomY - size}) scale(${size / 64})`}>
          <AuraGlyph color={color} />
        </g>
      </g>
    );
  }
  const wordX = geom.SAFE_X1;
  const glyphX = wordX - wordWidth - gap - size;
  return (
    <g opacity="0.78">
      <g transform={`translate(${glyphX}, ${bottomY - size}) scale(${size / 64})`}>
        <AuraGlyph color={color} />
      </g>
      <text
        x={wordX}
        y={bottomY - size / 2}
        fill={color}
        fontFamily={MONO}
        fontSize="14"
        letterSpacing="0.32em"
        textAnchor="end"
        dominantBaseline="middle"
      >
        AURA
      </text>
    </g>
  );
}

/** Quiet placeholder texture when photoUrl is absent. */
export function PhotoPlaceholder({
  x,
  y,
  w,
  h,
  tone = "dark",
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  tone?: "dark" | "paper";
}) {
  const bg = tone === "dark" ? T.darkBg1 : T.paper2;
  const stroke = tone === "dark" ? T.ruleOnDark : T.rule;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={bg} />
      <line x1={x} y1={y} x2={x + w} y2={y + h} stroke={stroke} strokeWidth="1" />
      <line x1={x + w} y1={y} x2={x} y2={y + h} stroke={stroke} strokeWidth="1" />
      <rect x={x} y={y} width={w} height={h} fill="none" stroke={stroke} strokeWidth="1" />
    </g>
  );
}

/** Render one wrapped block anchored to a top y, honouring lang direction. */
export function TextBlock({
  lines,
  x,
  y,
  lineHeight,
  fill,
  fontFamily,
  fontSize,
  fontStyle,
  fontWeight,
  anchor,
  lang,
  letterSpacing,
}: {
  lines: string[];
  x: number;
  y: number;
  lineHeight: number;
  fill: string;
  fontFamily: string;
  fontSize: number;
  fontStyle?: "normal" | "italic";
  fontWeight?: number | string;
  anchor: "start" | "end" | "middle";
  lang: Lang;
  letterSpacing?: string;
}) {
  return (
    <g>
      {lines.map((line, i) => (
        <text
          key={i}
          x={x}
          y={y + i * lineHeight}
          fill={fill}
          fontFamily={fontFamily}
          fontSize={fontSize}
          fontStyle={fontStyle}
          fontWeight={fontWeight}
          textAnchor={anchor}
          direction={isAr(lang) ? "rtl" : "ltr"}
          unicodeBidi={isAr(lang) ? "plaintext" : undefined as any}
          letterSpacing={letterSpacing}
        >
          {line}
        </text>
      ))}
    </g>
  );
}

export function pickQuoteFont(lang: Lang, bold = false) {
  return isAr(lang)
    ? { family: ARABIC, weight: bold ? 700 : 600, style: "normal" as const }
    : { family: SERIF, weight: 500, style: "italic" as const };
}

export function quoteLineHeight(lang: Lang, size: number): number {
  return isAr(lang) ? size * 1.9 : size * 1.18;
}