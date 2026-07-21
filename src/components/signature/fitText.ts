// Shared auto-fit text measurement for Signature Studio SVG cards.
// Uses an offscreen canvas measureText — same technique the broadsheet
// pipeline relies on — so measurement matches raster output.

let _ctx: CanvasRenderingContext2D | null = null;
function ctx(): CanvasRenderingContext2D {
  if (_ctx) return _ctx;
  const c = document.createElement("canvas");
  _ctx = c.getContext("2d")!;
  return _ctx;
}

export interface FontSpec {
  family: string;
  weight?: number | string;
  style?: "normal" | "italic";
}

function fontString(spec: FontSpec, size: number): string {
  const style = spec.style ?? "normal";
  const weight = spec.weight ?? 400;
  return `${style} ${weight} ${size}px ${spec.family}`;
}

/** Greedy word-wrap into up to `maxLines` lines that each fit within maxWidth. */
export function wrapLines(
  text: string,
  font: FontSpec,
  size: number,
  maxWidth: number,
  maxLines: number,
): { lines: string[]; overflow: boolean } {
  const c = ctx();
  c.font = fontString(font, size);
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const trial = current ? current + " " + w : w;
    if (c.measureText(trial).width <= maxWidth) {
      current = trial;
    } else {
      if (current) lines.push(current);
      // Never split a word: if the word alone exceeds width, still keep it
      // as its own line — rendering can shrink further via fitText.
      current = w;
      if (lines.length >= maxLines) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  const overflow = lines.join(" ").split(/\s+/).length < words.length;
  return { lines, overflow };
}

export interface FitResult {
  size: number;
  lines: string[];
  lineHeight: number;
}

export interface FitOptions {
  font: FontSpec;
  maxWidth: number;
  minSize: number;
  maxSize: number;
  /** Preferred max lines. If min size can't fit here, we allow +1 line. */
  maxLines?: number;
  /** Multiplier applied to size to derive line height. */
  lineHeightRatio?: number;
}

/**
 * Pick the largest font size that fits `text` inside `maxWidth` within
 * `maxLines`. If min size cannot fit within maxLines, allow one extra line
 * at min size rather than truncating (renderers enforce safe-zone clipping).
 */
export function fitText(text: string, opts: FitOptions): FitResult {
  const { font, maxWidth, minSize, maxSize } = opts;
  const maxLines = opts.maxLines ?? 2;
  const lhr = opts.lineHeightRatio ?? 1.15;
  for (let size = maxSize; size >= minSize; size--) {
    const w = wrapLines(text, font, size, maxWidth, maxLines);
    if (!w.overflow && w.lines.length <= maxLines) {
      return { size, lines: w.lines, lineHeight: size * lhr };
    }
  }
  // Fallback: min size with one extra line.
  const wrapped = wrapLines(text, font, minSize, maxWidth, maxLines + 1);
  return { size: minSize, lines: wrapped.lines, lineHeight: minSize * lhr };
}