import { CSSProperties } from "react";
export { TYPE_SCALE, snapToScale } from "../fitText";
import type { FrameDecision, FrameZone } from "./FrameCard";

/**
 * Shared props + tokens for every Signature Studio SVG card.
 * Literal hex only — the export pipeline rasterises via canvas and cannot
 * resolve CSS custom properties mid-serialisation.
 */

export type Lang = "en" | "ar";
export type Mood = "oxblood" | "teal" | "amber";

/** 8-point spacing grid (Law 3). Use tokens, never bare literals. */
export const SPACE = { xs: 8, s: 16, m: 24, l: 32, xl: 48 } as const;
/** Nested-radius tokens (Law 4). Inner radius = max(4, outer − padding). */
export const RADII = { l: 24, m: 16, s: 8 } as const;

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

/* ────────────────────────────────────────────────────────────────
   Law 5 — deterministic contrast-aware scrim adjustment.
   Samples the average luminance under the chosen text block and
   escalates scrim (and finally textColor) until WCAG ≥ 4.5.
   ──────────────────────────────────────────────────────────────── */

function relLum(l255: number): number {
  const s = l255 / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function contrastRatio(a: number, b: number): number {
  const L1 = Math.max(a, b);
  const L2 = Math.min(a, b);
  return (L1 + 0.05) / (L2 + 0.05);
}
function zoneRect(z: FrameZone): { u0: number; v0: number; u1: number; v1: number } {
  const left = z.endsWith("left");
  const upper = z.startsWith("upper");
  return {
    u0: left ? 0.10 : 0.50,
    u1: left ? 0.50 : 0.90,
    v0: upper ? 0.12 : 0.55,
    v1: upper ? 0.45 : 0.86,
  };
}
function loadImageEl(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

export async function adjustEffectiveScrim(
  decision: FrameDecision,
  photoUrl: string,
): Promise<{ decision: FrameDecision; ratioBefore: number; ratioAfter: number }> {
  try {
    const img = await loadImageEl(photoUrl);
    const rect = zoneRect(decision.textZone);
    const S = 48;
    const cnv = document.createElement("canvas");
    cnv.width = S; cnv.height = S;
    const c = cnv.getContext("2d")!;
    const sx = img.naturalWidth * rect.u0;
    const sy = img.naturalHeight * rect.v0;
    const sw = img.naturalWidth * (rect.u1 - rect.u0);
    const sh = img.naturalHeight * (rect.v1 - rect.v0);
    c.drawImage(img, sx, sy, sw, sh, 0, 0, S, S);
    const data = c.getImageData(0, 0, S, S).data;
    let sumL = 0;
    const n = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      const r = relLum(data[i]);
      const g = relLum(data[i + 1]);
      const b = relLum(data[i + 2]);
      sumL += 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    const photoL = sumL / n; // 0..1 rel-luminance

    const textL = (tc: "paper" | "ink" | undefined) => (tc === "ink" ? 0.03 : 0.90);
    const scrimAlpha = (s: "none" | "soft" | "strong") =>
      s === "strong" ? 0.55 : s === "soft" ? 0.35 : 0;
    const effectiveL = (s: "none" | "soft" | "strong") => photoL * (1 - scrimAlpha(s));

    let scrim = decision.scrim;
    let textColor = decision.textColor;
    const ratioBefore = contrastRatio(effectiveL(scrim), textL(textColor));
    let ratio = ratioBefore;
    for (let i = 0; i < 4; i++) {
      if (ratio >= 4.5) break;
      if (scrim === "none") scrim = "soft";
      else if (scrim === "soft") scrim = "strong";
      else if (scrim === "strong" && textColor === "ink") { textColor = "paper"; }
      else break;
      ratio = contrastRatio(effectiveL(scrim), textL(textColor));
    }
    return {
      decision: { ...decision, scrim, textColor },
      ratioBefore,
      ratioAfter: ratio,
    };
  } catch {
    return { decision, ratioBefore: NaN, ratioAfter: NaN };
  }
}

/**
 * Contrast-aware emphasis colour. Dark text on a bright zone → OXBLOOD
 * (never mood teal, which would vanish). Light text on scrim → mood as
 * usual, except teal on `scrim: none` bright zones falls back to amber
 * for legibility.
 */
export function emphasisColorFor(
  textColor: "paper" | "ink" | undefined,
  scrim: "none" | "soft" | "strong",
  mood: Mood,
): string {
  if (textColor === "ink") return T.oxblood;
  if (scrim === "none" && mood === "teal") return T.amber;
  return moodColor(mood);
}

/** Caption helpers — Arabic never gets uppercased, tracked, or mono-set. */
export function capsText(text: string, lang: Lang): string {
  return isAr(lang) ? text : text.toUpperCase();
}
export function captionFontFamily(lang: Lang): string {
  return isAr(lang) ? ARABIC : MONO;
}
export function captionTrack(lang: Lang, enTrack: string): string {
  return isAr(lang) ? "0" : enTrack;
}
export function captionWeight(lang: Lang, enWeight: number = 400): number {
  return isAr(lang) ? 600 : enWeight;
}
export function captionSize(lang: Lang, enSize: number): number {
  return isAr(lang) ? enSize + 1 : enSize;
}

export const SERIF = "'Newsreader', Georgia, serif";
export const MONO = "'IBM Plex Mono', ui-monospace, monospace";
export const ARABIC = "'Cairo', system-ui, sans-serif";

export function isAr(lang: Lang): boolean {
  return lang === "ar";
}

// Under `direction=rtl` (which we always set for Arabic), SVG `text-anchor`
// follows the inline progression direction: "start" already means the
// right visual edge in RTL. So the inline-start anchor is "start" for both
// LTR and RTL — we just pair it with the correct x (SAFE_X0 for LTR,
// SAFE_X1 for RTL).
export function anchorStart(_lang: Lang): "start" | "end" {
  return "start";
}
export function anchorEnd(_lang: Lang): "start" | "end" {
  return "end";
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
  width: "auto",
  height: "auto",
  maxWidth: "100%",
  maxHeight: "100%",
};

/**
 * Mood wash colour (very low-alpha rgba) for tinting dark card backgrounds
 * so oxblood / teal / amber produce visibly different cards.
 */
export function moodWashRGBA(m: Mood, alpha = 0.09): string {
  // literal RGB triplets for the three mood hexes
  const rgb =
    m === "oxblood" ? "110,42,38" :
    m === "teal"    ? "54,197,176" :
                      "214,167,72";
  return `rgba(${rgb},${alpha})`;
}

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
  const ar = isAr(lang);
  const track = ar ? undefined : letterSpacing;
  return (
    <g>
      {lines.map((line, i) => {
        // An Arabic card can still contain an entirely Latin proper name.
        // Keep that row LTR as one isolated unit, but mirror its physical
        // anchor so inline-start remains the safe zone's RIGHT edge.
        const latinOnlyInAr = ar && !/[\u0600-\u06FF]/.test(line);
        const resolvedAnchor = latinOnlyInAr
          ? anchor === "start" ? "end" : anchor === "end" ? "start" : "middle"
          : anchor;
        return (
          <text
            key={i}
            x={x}
            y={y + i * lineHeight}
            fill={fill}
            fontFamily={fontFamily}
            fontSize={fontSize}
            fontStyle={fontStyle}
            fontWeight={fontWeight}
            textAnchor={resolvedAnchor}
            direction={latinOnlyInAr ? "ltr" : ar ? "rtl" : "ltr"}
            unicodeBidi={ar ? (latinOnlyInAr ? "isolate" : "plaintext") as any : undefined}
            letterSpacing={track}
          >
            {ar && !latinOnlyInAr ? renderArabicBidi(line) : line}
          </text>
        );
      })}
    </g>
  );
}

/**
 * Split an Arabic line so Latin/digit runs render inside their own
 * isolated LTR tspans. Prevents "AI", "2026", "IoT" etc. from fracturing
 * word order inside RTL text.
 */
export function renderArabicBidi(line: string): React.ReactNode {
  // Force RTL base direction for the whole line by prefixing an RLM
  // (U+200F). This guarantees `text-anchor="start"` under `direction="rtl"`
  // + `unicode-bidi: plaintext` resolves to the visual RIGHT edge even
  // when the content is entirely Latin (e.g. an English name inside an
  // Arabic card). Without the RLM, plaintext infers LTR base direction
  // from Latin-only content and the row anchors to the left, clipping
  // off the right edge of the safe zone.
  //
  // Additionally: if the line has NO Arabic characters at all, wrap the
  // whole content in a single LTR-isolated tspan so multi-word Latin
  // (e.g. a two-word Latin name, or a job title)
  // preserves word order — otherwise the RTL base reorders neutral
  // whitespace-separated Latin runs.
  const hasAr = /[\u0600-\u06FF]/.test(line);
  if (!hasAr) {
    return (
      <>
        <tspan>{"\u200F"}</tspan>
        <tspan direction="ltr" unicodeBidi={"isolate" as any}>{line}</tspan>
      </>
    );
  }
  const parts = ("\u200F" + line).split(/([A-Za-z0-9%]+(?:[\s.,·\-]+[A-Za-z0-9%]+)*)/g);
  return parts.map((part, i) => {
    if (!part) return null;
    if (/^[A-Za-z0-9%]/.test(part)) {
      return (
        <tspan key={i} direction="ltr" unicodeBidi={"isolate" as any}>
          {part}
        </tspan>
      );
    }
    return <tspan key={i}>{part}</tspan>;
  });
}

export function pickQuoteFont(lang: Lang, bold = false) {
  return isAr(lang)
    ? { family: ARABIC, weight: bold ? 700 : 600, style: "normal" as const }
    : { family: SERIF, weight: 500, style: "italic" as const };
}

export function quoteLineHeight(lang: Lang, size: number): number {
  return isAr(lang) ? size * 1.9 : size * 1.18;
}

/** Emphasis segment spec used by EmphasisTextBlock — a verbatim phrase
 *  found inside a rendered line, and how it should be visually emphasized. */
export interface EmphasisSpec {
  phrase: string;
  style: "color" | "bold";
}

/**
 * Text block with per-phrase emphasis via <tspan> segments.
 * Same measurement contract as TextBlock (lines are already wrapped by
 * fitText at base weight — callers pass a slightly reduced maxWidth so
 * bolded segments don't overflow). Phrase matching is a simple
 * left-to-right substring split; a phrase that spans a wrap break is
 * emphasized in each line it appears in.
 */
export function EmphasisTextBlock({
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
  emphasis,
  accentColor,
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
  emphasis?: EmphasisSpec[];
  accentColor?: string;
}) {
  const ar = isAr(lang);
  const dir = ar ? "rtl" : "ltr";
  const track = ar ? undefined : letterSpacing;
  const phrases = (emphasis || []).filter((e) => e && e.phrase && e.phrase.trim());

  function splitLine(line: string): Array<{ text: string; style?: "color" | "bold" }> {
    let segs: Array<{ text: string; style?: "color" | "bold" }> = [{ text: line }];
    for (const p of phrases) {
      const next: typeof segs = [];
      for (const s of segs) {
        if (s.style) { next.push(s); continue; }
        const idx = s.text.indexOf(p.phrase);
        if (idx < 0) { next.push(s); continue; }
        if (idx > 0) next.push({ text: s.text.slice(0, idx) });
        next.push({ text: p.phrase, style: p.style });
        const rest = s.text.slice(idx + p.phrase.length);
        if (rest) next.push({ text: rest });
      }
      segs = next;
    }
    return segs;
  }

  return (
    <g>
      {lines.map((line, i) => {
        const segs = splitLine(line);
        return (
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
            direction={dir}
            unicodeBidi={ar ? ("plaintext" as any) : undefined}
            letterSpacing={track}
          >
            {segs.map((s, j) => (
              <tspan
                key={j}
                fill={s.style === "color" ? (accentColor || fill) : fill}
                fontWeight={
                  s.style === "bold" ? 700 : s.style === "color" ? 600 : fontWeight
                }
              >
                {ar ? renderArabicBidi(s.text) : s.text}
              </tspan>
            ))}
          </text>
        );
      })}
    </g>
  );
}