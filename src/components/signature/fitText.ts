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
  // Strip surrounding quotes/fallbacks — canvas `font` wants a single family
  // token to reliably match a loaded face.
  const fam = String(spec.family).split(",")[0].replace(/['"]/g, "").trim();
  return `${style} ${weight} ${size}px "${fam}"`;
}

/**
 * Load every font face fitText/measureText and the SVG renderers depend on.
 * Must be awaited once before any renderer measures text — otherwise
 * canvas.measureText silently falls back to a default face, returning
 * wildly wrong widths (Arabic words then each land on their own line and
 * spill past the safe zone).
 */
let _fontsLoadedPromise: Promise<void> | null = null;
export function ensureCardFontsLoaded(): Promise<void> {
  if (_fontsLoadedPromise) return _fontsLoadedPromise;
  const specs: string[] = [
    // Cairo — Arabic quote font
    '400 24px "Cairo"',
    '600 24px "Cairo"',
    '700 24px "Cairo"',
    // Newsreader — EN quote font (normal + italic)
    '400 24px "Newsreader"',
    '500 24px "Newsreader"',
    'italic 400 24px "Newsreader"',
    'italic 500 24px "Newsreader"',
    // IBM Plex Mono — captions / wordmark
    '400 14px "IBM Plex Mono"',
    '600 14px "IBM Plex Mono"',
  ];
  const anyDoc: any = typeof document !== "undefined" ? document : null;
  if (!anyDoc?.fonts?.load) {
    _fontsLoadedPromise = Promise.resolve();
    return _fontsLoadedPromise;
  }
  _fontsLoadedPromise = (async () => {
    try {
      await Promise.all(specs.map((s) => anyDoc.fonts.load(s).catch(() => null)));
      await anyDoc.fonts.ready;
    } catch {
      /* non-fatal — measurement will still run, guard #2 caps damage */
    }
  })();
  return _fontsLoadedPromise;
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
  let overflow = false;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const trial = current ? current + " " + w : w;
    if (c.measureText(trial).width <= maxWidth) {
      current = trial;
      continue;
    }
    // Trial doesn't fit. Flush current line (if any) and try w alone.
    if (current) {
      if (lines.length >= maxLines) { overflow = true; break; }
      lines.push(current);
      current = "";
    }
    // Word-split guard: if a single word alone is wider than maxWidth,
    // this is the pathological case (fonts not loaded / genuinely long
    // token). Do NOT keep pushing single-word lines forever — mark
    // overflow so fitText drops to a smaller size and stop.
    if (c.measureText(w).width > maxWidth) {
      overflow = true;
      // Still emit it as one line if capacity remains, so caller can
      // fall back at min size.
      if (lines.length < maxLines) lines.push(w);
      // Skip remaining words — we've already overflowed.
      if (i < words.length - 1) overflow = true;
      break;
    }
    current = w;
    if (lines.length >= maxLines) { overflow = true; break; }
  }
  if (current) {
    if (lines.length < maxLines) lines.push(current);
    else overflow = true;
  }
  // Never emit more than maxLines lines.
  if (lines.length > maxLines) {
    lines.length = maxLines;
    overflow = true;
  }
  // If not every word made it into lines, report overflow.
  const emittedWords = lines.join(" ").split(/\s+/).filter(Boolean).length;
  if (emittedWords < words.length) overflow = true;
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