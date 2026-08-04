/**
 * TEMPLATE DESCRIPTORS — layout is DATA, not code.
 *
 * Every geometric and typographic decision the renderer used to hold as a
 * module constant lives here instead, so the renderer, the composer and the
 * exporter all read one source. Adding a second layout family is then a data
 * change, not a fork of Slide.tsx.
 *
 * Standing Law #11 still applies downstream: nothing here is a CSS custom
 * property. These are literal numbers and literal font stacks, because
 * html-to-image cannot resolve custom properties from inside its iframe.
 */
import type { Archetype } from "../deckIR";
import { BAND_MEDIA_SHARE, BAND_TYPE_BOOST, MEDIA_BY_ARCHETYPE, type MediaPlacementMode } from "../slots";

export type TypeRamp = {
  heroEn: number; heroEnLh: number;
  heroAr: number; heroArLh: number;
  stat: number;   statLh: number;
  h2: number;     h2Lh: number;
  body: number;   bodyLhEn: number; bodyLhAr: number;
  chip: number; data: number; source: number;
  gap: number; media: number;
};

export type Geometry = {
  canvasW: number; canvasH: number;
  pad: number;
  safeArea: { top: number; side: number; bottom: number };
  bandMediaShare: number; bandTypeBoost: number; bandLift: number;
  closeFigureW: number; closeFigureH: number;
  radiusChip: number; radiusPanel: number; radiusMedia: number;
};

export type FontSet = {
  displayEn: string; textEn: string; mono: string; arabic: string;
  /** [cssWeightSizeFamily, sampleGlyphs] pairs used to gate the fit ladder */
  gateSpecs: Array<[string, string]>;
};

export type TemplateDescriptor = {
  id: string;
  label: { en: string; ar: string };
  ramp: TypeRamp;
  geometry: Geometry;
  fonts: FontSet;
  media: Record<Archetype, MediaPlacementMode>;
  coverAlign: "start" | "center";
  heroHighlight: "block" | "underline" | "slab";
};

/* ------------------------------------------------------------------ */
/* instrument — the one family that exists today                       */
/* ------------------------------------------------------------------ */

const INSTRUMENT_RAMP: TypeRamp = {
  heroEn: 150, heroEnLh: 0.93,
  heroAr: 92,  heroArLh: 1.42,
  stat: 270,   statLh: 0.84,
  h2: 54,      h2Lh: 1.2,
  body: 38,    bodyLhEn: 1.6, bodyLhAr: 1.9,
  chip: 31, data: 26, source: 22,
  gap: 28, media: 360,
};

const FONT_DISPLAY_EN = '"AuraAnton", Impact, "Arial Narrow", sans-serif';
const FONT_TEXT_EN = '"AuraInter", Helvetica, Arial, sans-serif';
const FONT_MONO = '"AuraMono", ui-monospace, "Courier New", monospace';
/** Anton has no Arabic. Arabic display is Cairo 900 — never a condensed face. */
const FONT_AR = '"AuraCairo", "Segoe UI", Tahoma, sans-serif';

/** The first family in a stack — what `document.fonts.load` must be given. */
function head(stack: string): string {
  const first = stack.split(",")[0].trim();
  return first.startsWith('"') ? first : `"${first}"`;
}

const LATIN_SAMPLE = "AGMTW";
const DIGIT_SAMPLE = "0123";
const ARABIC_SAMPLE = "غثقف";

/**
 * The gate specs are DERIVED from the ramp, never hand-copied. A hero measured
 * against a fallback face ships at the wrong size, and a hand-written list
 * silently drifts the moment a ramp value moves.
 */
function gateSpecsFor(ramp: TypeRamp, fonts: Omit<FontSet, "gateSpecs">): Array<[string, string]> {
  const d = head(fonts.displayEn);
  const t = head(fonts.textEn);
  const m = head(fonts.mono);
  const a = head(fonts.arabic);
  return [
    [`400 ${ramp.heroEn}px ${d}`, LATIN_SAMPLE],
    [`400 ${ramp.body}px ${t}`, LATIN_SAMPLE],
    [`500 ${ramp.body}px ${t}`, LATIN_SAMPLE],
    [`700 ${ramp.chip}px ${t}`, LATIN_SAMPLE],
    [`800 ${ramp.h2}px ${t}`, LATIN_SAMPLE],
    [`400 ${ramp.data}px ${m}`, DIGIT_SAMPLE],
    [`600 ${ramp.data}px ${m}`, DIGIT_SAMPLE],
    [`400 ${ramp.body}px ${a}`, ARABIC_SAMPLE],
    [`700 ${ramp.body}px ${a}`, ARABIC_SAMPLE],
    [`900 ${ramp.heroAr}px ${a}`, ARABIC_SAMPLE],
  ];
}

const INSTRUMENT_FONTS_BASE = {
  displayEn: FONT_DISPLAY_EN,
  textEn: FONT_TEXT_EN,
  mono: FONT_MONO,
  arabic: FONT_AR,
};

const INSTRUMENT: TemplateDescriptor = {
  id: "instrument",
  label: { en: "Instrument", ar: "الأداة" },
  ramp: INSTRUMENT_RAMP,
  geometry: {
    canvasW: 1080,
    canvasH: 1350,
    pad: 82,
    /**
     * X3 — THE SAFE AREA. No image may sit under the page numerals, the
     * identity bar, or the bottom edge. `bottom` is the padding plus the
     * footer row that carries the accent rule and "3 / 8".
     */
    safeArea: { top: 82, side: 82, bottom: 82 + 68 },
    bandMediaShare: BAND_MEDIA_SHARE,
    bandTypeBoost: BAND_TYPE_BOOST,
    bandLift: 26,
    closeFigureW: 430,
    closeFigureH: 470,
    radiusChip: 999,
    radiusPanel: 18,
    radiusMedia: 18,
  },
  fonts: {
    ...INSTRUMENT_FONTS_BASE,
    gateSpecs: gateSpecsFor(INSTRUMENT_RAMP, INSTRUMENT_FONTS_BASE),
  },
  // ONE taxonomy, imported — never duplicated.
  media: MEDIA_BY_ARCHETYPE,
  coverAlign: "start",
  heroHighlight: "block",
};

export const TEMPLATES: Record<string, TemplateDescriptor> = {
  instrument: INSTRUMENT,
};

export const TEMPLATE_IDS: string[] = Object.keys(TEMPLATES);

export const DEFAULT_TEMPLATE = "instrument";

/** Never throws, never returns undefined. An unknown id falls back to instrument. */
export function getTemplate(id?: string | null): TemplateDescriptor {
  if (typeof id === "string" && Object.prototype.hasOwnProperty.call(TEMPLATES, id)) {
    return TEMPLATES[id];
  }
  return TEMPLATES[DEFAULT_TEMPLATE];
}

/** The height of the band media zone for a given descriptor. */
export function bandMediaHeight(tpl: TemplateDescriptor): number {
  return Math.round(tpl.geometry.canvasH * tpl.geometry.bandMediaShare) - tpl.geometry.bandLift;
}
