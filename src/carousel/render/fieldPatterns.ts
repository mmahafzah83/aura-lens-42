/**
 * FIELD PATTERNS — the deterministic CSS behind the three field/gradient
 * families (salford, blueprint, concept).
 *
 * Pure string builders, not components, for the same reason `paperPatterns`
 * is: the export-safety tests must read the exact CSS the renderer prints, and
 * jsdom's style parser discards gradient values, so asserting against the DOM
 * would assert nothing at all.
 *
 * EVERY value here is a gradient. No `filter`, no `feTurbulence`, no
 * `mix-blend-mode` — html-to-image drops or mis-renders all three. The ghost
 * numeral is drawn with `opacity` only, never a blend mode.
 */

/** salford's dot-matrix field. One radial-gradient dot, tiled. */
export const SALFORD_DOT_PITCH = 26;

export function dotMatrix(color: string): string {
  return `radial-gradient(${color} 2.2px, transparent 2.4px)`;
}

/** blueprint's hairline grid, at the pitch the descriptor declares. */
export function hairlineGrid(line: string, pitch: number): string {
  return (
    `repeating-linear-gradient(90deg, ${line} 0 1px, transparent 1px ${pitch}px), ` +
    `repeating-linear-gradient(180deg, ${line} 0 1px, transparent 1px ${pitch}px)`
  );
}

/**
 * blueprint's dotted leader. A horizontal run of dots that ends in a solid
 * terminal dot — the dot itself is an element, this builds only the run.
 */
export function dottedLeader(color: string): string {
  return `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 14px)`;
}

/**
 * concept's light interior ground. White, washed with the palette's own third
 * stop at low alpha — no new hex enters the registry through the back door.
 */
export function conceptLightGround(base: string, washRgba: string): string {
  return `linear-gradient(168deg, ${base} 0%, ${washRgba} 100%)`;
}
