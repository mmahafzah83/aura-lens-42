/**
 * PAPER PATTERNS — the deterministic CSS behind the two paper families.
 *
 * These are pure string builders, not components, for one reason: the export
 * safety tests must be able to read the exact CSS the renderer will print.
 * jsdom's style parser discards gradient values, so asserting against the DOM
 * would assert nothing at all.
 *
 * EVERY value here is a gradient. No `filter`, no `feTurbulence`, no
 * `mix-blend-mode` — html-to-image drops or mis-renders all three.
 */

/** Where the five crumple creases fall, as a percentage across the sheet. */
export const CRUMPLE_FOLDS: ReadonlyArray<{ pos: number; vertical: boolean }> = [
  { pos: 17, vertical: true },
  { pos: 41, vertical: false },
  { pos: 58, vertical: true },
  { pos: 73, vertical: false },
  { pos: 88, vertical: true },
];

/** One crease plus its catch-light, as a single linear gradient. */
export function crumpleFoldLayer(pos: number, vertical: boolean): string {
  return (
    `linear-gradient(${vertical ? "90deg" : "180deg"}, ` +
    `transparent ${pos - 0.35}%, rgba(22,22,22,.10) ${pos}%, ` +
    `rgba(255,255,255,.85) ${pos + 0.32}%, transparent ${pos + 0.9}%)`
  );
}

/** The corner vignette. One radial gradient, nothing else. */
export const CRUMPLE_VIGNETTE =
  "radial-gradient(130% 105% at 50% 42%, transparent 58%, rgba(110,95,60,.10))";

/** The graph rule, at the pitch the descriptor declares. */
export function gridpaperRule(line: string, pitch: number): string {
  return (
    `repeating-linear-gradient(90deg, ${line} 0 1.5px, transparent 1.5px ${pitch}px), ` +
    `repeating-linear-gradient(180deg, ${line} 0 1.5px, transparent 1.5px ${pitch}px)`
  );
}

/** The halftone corner: two dot fields, faded by a gradient mask. */
export function gridpaperHalftone(color: string): string {
  return (
    `radial-gradient(${color} 3.4px, transparent 3.6px), ` +
    `radial-gradient(${color} 1.8px, transparent 2px)`
  );
}

export function gridpaperHalftoneMask(rtl: boolean): string {
  return `radial-gradient(120% 120% at ${rtl ? "0% 100%" : "100% 100%"}, #000 10%, transparent 68%)`;
}
