/**
 * Gate for the fit ladder: the bundled faces must be rasterised before any
 * measurement, otherwise fallback metrics (much wider than Anton) report a
 * wrap that does not exist. `document.fonts.ready` can settle before these
 * faces are even requested, so each family is loaded explicitly.
 *
 * The list is DERIVED from every registered template descriptor. A
 * hand-written array hand-copies ramp sizes, and with more than one family it
 * silently drifts — at which point a hero is measured against a fallback face
 * and ships at the wrong size.
 */
import { TEMPLATES } from "./template";

function deriveSpecs(): Array<[string, string]> {
  const seen = new Map<string, [string, string]>();
  for (const tpl of Object.values(TEMPLATES)) {
    for (const [spec, sample] of tpl.fonts.gateSpecs) {
      const key = `${spec}|${sample}`;
      if (!seen.has(key)) seen.set(key, [spec, sample]);
    }
  }
  return Array.from(seen.values());
}

const SPECS: Array<[string, string]> = deriveSpecs();

let loaded = false;
let pending: Promise<void> | null = null;

export function carouselFontsLoaded(): boolean {
  return loaded;
}

export function ensureCarouselFonts(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (pending) return pending;
  if (typeof document === "undefined" || !document.fonts) {
    loaded = true;
    return Promise.resolve();
  }
  pending = Promise.all(
    SPECS.map(([spec, sample]) => document.fonts.load(spec, sample).catch(() => undefined)),
  )
    .then(() => document.fonts.ready)
    .then(() => {
      loaded = true;
    });
  return pending;
}
