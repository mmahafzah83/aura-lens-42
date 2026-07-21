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

export const CANVAS = { W: 1080, H: 1350 };
export const SAFE = 0.12;
export const PAD = Math.round(CANVAS.W * SAFE); // 130
export const SAFE_X0 = PAD;
export const SAFE_X1 = CANVAS.W - PAD;
export const SAFE_Y0 = PAD;
export const SAFE_Y1 = CANVAS.H - PAD;
export const CONTENT_W = SAFE_X1 - SAFE_X0;
export const CONTENT_H = SAFE_Y1 - SAFE_Y0;
export const QUOTE_MEASURE = Math.round(CONTENT_W * 0.92); // ~76% of full width

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
export function xStart(lang: Lang): number {
  return isAr(lang) ? SAFE_X1 : SAFE_X0;
}
/** X of the inline-end edge inside the safe zone. */
export function xEnd(lang: Lang): number {
  return isAr(lang) ? SAFE_X0 : SAFE_X1;
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
}

export function SvgRoot({ children, role = "img", ariaLabel }: SvgRootProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${CANVAS.W} ${CANVAS.H}`}
      width={CANVAS.W}
      height={CANVAS.H}
      role={role}
      aria-label={ariaLabel}
      style={DEFAULT_SVG_STYLE}
    >
      {children}
    </svg>
  );
}

/**
 * AuraMark — quiet horizon-eye glyph + AURA wordmark. Placed at the
 * bottom inline-end corner of every card, inside the safe zone.
 */
export function AuraMark({ lang, color = T.paper }: { lang: Lang; color?: string }) {
  const ar = isAr(lang);
  // Anchor to the inline-end corner just inside the safe zone.
  const x = ar ? SAFE_X0 : SAFE_X1;
  const y = SAFE_Y1;
  const glyph = (
    <g transform={`translate(${ar ? 0 : -14}, -6)`} fill={color} stroke={color}>
      <ellipse cx="0" cy="0" rx="14" ry="6" fill="none" strokeWidth="1.4" />
      <circle cx="0" cy="0" r="2.2" />
    </g>
  );
  const word = (
    <text
      x={ar ? 22 : -22}
      y="0"
      fill={color}
      fontFamily={MONO}
      fontSize="14"
      letterSpacing="0.32em"
      textAnchor={ar ? "start" : "end"}
      dominantBaseline="middle"
    >
      AURA
    </text>
  );
  return (
    <g transform={`translate(${x} ${y})`} opacity="0.7">
      {glyph}
      {word}
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