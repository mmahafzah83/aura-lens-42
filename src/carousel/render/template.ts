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
  /** Identity chrome (highlighter and later families). Optional: instrument has none. */
  identityName?: number;
  identitySub?: number;
  /**
   * The smallest a size may ever be printed, whatever the fit ladder says.
   * Enforced at render time — see INV-22 in ../invariants.
   */
  floors?: { content: number; meta: number };
};

export type Geometry = {
  canvasW: number; canvasH: number;
  pad: number;
  safeArea: { top: number; side: number; bottom: number };
  bandMediaShare: number; bandTypeBoost: number; bandLift: number;
  closeFigureW: number; closeFigureH: number;
  radiusChip: number; radiusPanel: number; radiusMedia: number;
  /** Where the content column starts, measured from the canvas edge. */
  contentX?: number;
  /** The widest a line of type may be set. */
  maxTextW?: number;
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

/* ------------------------------------------------------------------ */
/* highlighter — paper ground, marker emphasis, dashed arrows          */
/* ------------------------------------------------------------------ */

const HIGHLIGHTER_RAMP: TypeRamp = {
  // The cover display face and the headline face are the two display sizes.
  heroEn: 104, heroEnLh: 1.12,
  heroAr: 88,  heroArLh: 1.5,
  stat: 104,   statLh: 1.12,
  h2: 76,      h2Lh: 1.14,
  body: 40,    bodyLhEn: 1.8, bodyLhAr: 1.8,
  chip: 29, data: 28, source: 27,
  gap: 28, media: 360,
  identityName: 38,
  identitySub: 29,
  floors: { content: 38, meta: 22 },
};

const FONT_POPPINS = '"AuraPoppins", "Helvetica Neue", Helvetica, Arial, sans-serif';
/** Poppins has no Arabic. Arabic is IBM Plex Sans Arabic, 700 display / 400 body. */
const FONT_AR_TEXT = '"AuraArabicText", "Segoe UI", Tahoma, sans-serif';
/** Archivo Black ships a single weight (400) and is a display face only. */
const FONT_ARCHIVO = '"AuraArchivo", "Arial Black", Impact, sans-serif';

const HIGHLIGHTER_FONTS_BASE = {
  displayEn: FONT_POPPINS,
  textEn: FONT_POPPINS,
  // Meta is Poppins too: this family has no monospace voice.
  mono: FONT_POPPINS,
  arabic: FONT_AR_TEXT,
};

/** Derived from the ramp, exactly as instrument's is. Never hand-copied. */
function highlighterGateSpecs(ramp: TypeRamp, fonts: Omit<FontSet, "gateSpecs">): Array<[string, string]> {
  const d = head(fonts.displayEn);
  const t = head(fonts.textEn);
  const a = head(fonts.arabic);
  return [
    [`800 ${ramp.heroEn}px ${d}`, LATIN_SAMPLE],
    [`800 ${ramp.h2}px ${d}`, LATIN_SAMPLE],
    [`500 ${ramp.body}px ${t}`, LATIN_SAMPLE],
    [`600 ${ramp.chip}px ${t}`, LATIN_SAMPLE],
    [`700 ${ramp.heroAr}px ${a}`, ARABIC_SAMPLE],
    [`400 ${ramp.body}px ${a}`, ARABIC_SAMPLE],
  ];
}

const HIGHLIGHTER: TemplateDescriptor = {
  id: "highlighter",
  label: { en: "Highlighter", ar: "القلم" },
  ramp: HIGHLIGHTER_RAMP,
  geometry: {
    canvasW: 1080,
    canvasH: 1350,
    pad: 96,
    safeArea: { top: 96, side: 96, bottom: 96 + 68 },
    bandMediaShare: BAND_MEDIA_SHARE,
    bandTypeBoost: BAND_TYPE_BOOST,
    bandLift: 26,
    closeFigureW: 430,
    closeFigureH: 470,
    radiusChip: 999,
    radiusPanel: 18,
    radiusMedia: 18,
    contentX: 120,
    maxTextW: 860,
  },
  fonts: {
    ...HIGHLIGHTER_FONTS_BASE,
    gateSpecs: highlighterGateSpecs(HIGHLIGHTER_RAMP, HIGHLIGHTER_FONTS_BASE),
  },
  media: MEDIA_BY_ARCHETYPE,
  coverAlign: "start",
  heroHighlight: "block",
};

/* ------------------------------------------------------------------ */
/* Shared derivation for the paper-texture families                    */
/* ------------------------------------------------------------------ */

/**
 * One derivation, two families. The weights differ per family (Archivo Black
 * has only 400; Poppins sets its display at 700), so they are an argument
 * rather than a constant — but the SIZES are still read from the ramp, so a
 * ramp change cannot leave the fit ladder measuring a fallback face.
 */
function paperGateSpecs(
  ramp: TypeRamp,
  fonts: Omit<FontSet, "gateSpecs">,
  w: { display: number; body: number; meta: number; arDisplay: number; arBody: number },
): Array<[string, string]> {
  const d = head(fonts.displayEn);
  const t = head(fonts.textEn);
  const a = head(fonts.arabic);
  return [
    [`${w.display} ${ramp.heroEn}px ${d}`, LATIN_SAMPLE],
    [`${w.display} ${ramp.h2}px ${d}`, LATIN_SAMPLE],
    [`${w.display} ${ramp.stat}px ${d}`, DIGIT_SAMPLE],
    [`${w.body} ${ramp.body}px ${t}`, LATIN_SAMPLE],
    [`${w.meta} ${ramp.chip}px ${t}`, LATIN_SAMPLE],
    [`${w.meta} ${ramp.source}px ${t}`, DIGIT_SAMPLE],
    [`${w.arDisplay} ${ramp.heroAr}px ${a}`, ARABIC_SAMPLE],
    [`${w.arBody} ${ramp.body}px ${a}`, ARABIC_SAMPLE],
  ];
}

/* ------------------------------------------------------------------ */
/* crumple — pressed paper, Archivo Black, one rotated amber slab      */
/* ------------------------------------------------------------------ */

const CRUMPLE_RAMP: TypeRamp = {
  // Cover display 104 sits inside the locked 100–108 band.
  heroEn: 104, heroEnLh: 1.06,
  // Arabic display never tighter than 1.4 — Cairo 900 needs the room.
  heroAr: 88,  heroArLh: 1.44,
  stat: 104,   statLh: 1.06,
  // Interior headline 84, inside the locked 76–92 band.
  h2: 84,      h2Lh: 1.1,
  body: 40,    bodyLhEn: 1.7, bodyLhAr: 1.75,
  chip: 28, data: 28, source: 26,
  gap: 28, media: 360,
  identityName: 37,
  identitySub: 28,
  floors: { content: 38, meta: 22 },
};

const CRUMPLE_FONTS_BASE = {
  displayEn: FONT_ARCHIVO,
  textEn: FONT_TEXT_EN,
  // Meta is Inter. This family has no monospace voice.
  mono: FONT_TEXT_EN,
  arabic: FONT_AR,
};

const CRUMPLE: TemplateDescriptor = {
  id: "crumple",
  label: { en: "Crumple", ar: "الورق المطوي" },
  ramp: CRUMPLE_RAMP,
  geometry: {
    canvasW: 1080,
    canvasH: 1350,
    pad: 96,
    safeArea: { top: 96, side: 96, bottom: 96 + 68 },
    bandMediaShare: BAND_MEDIA_SHARE,
    bandTypeBoost: BAND_TYPE_BOOST,
    bandLift: 26,
    closeFigureW: 430,
    closeFigureH: 470,
    radiusChip: 999,
    radiusPanel: 0,
    radiusMedia: 0,
    contentX: 120,
    maxTextW: 860,
  },
  fonts: {
    ...CRUMPLE_FONTS_BASE,
    // Archivo Black is 400-only; Cairo carries 900 display and 400 body.
    gateSpecs: paperGateSpecs(CRUMPLE_RAMP, CRUMPLE_FONTS_BASE, {
      display: 400, body: 500, meta: 700, arDisplay: 900, arBody: 400,
    }),
  },
  media: MEDIA_BY_ARCHETYPE,
  coverAlign: "start",
  heroHighlight: "slab",
};

/* ------------------------------------------------------------------ */
/* gridpaper — graph ground, Poppins, alternating dark slides          */
/* ------------------------------------------------------------------ */

const GRIDPAPER_RAMP: TypeRamp = {
  heroEn: 100, heroEnLh: 1.08,
  heroAr: 86,  heroArLh: 1.48,
  stat: 100,   statLh: 1.08,
  h2: 80,      h2Lh: 1.12,
  body: 40,    bodyLhEn: 1.7, bodyLhAr: 1.75,
  chip: 29, data: 28, source: 26,
  gap: 28, media: 360,
  identityName: 38,
  identitySub: 29,
  floors: { content: 38, meta: 22 },
};

const GRIDPAPER_FONTS_BASE = {
  displayEn: FONT_POPPINS,
  textEn: FONT_POPPINS,
  mono: FONT_POPPINS,
  arabic: FONT_AR_TEXT,
};

/** The graph rule pitch, in px at 1080×1350. Read by the renderer, not typed in it. */
export const GRIDPAPER_GRID_PITCH = 54;

const GRIDPAPER: TemplateDescriptor = {
  id: "gridpaper",
  label: { en: "Grid paper", ar: "الورق المربّع" },
  ramp: GRIDPAPER_RAMP,
  geometry: {
    canvasW: 1080,
    canvasH: 1350,
    // A multiple of the 54px rule, so the content column lands on the grid.
    pad: 108,
    safeArea: { top: 108, side: 108, bottom: 108 + 68 },
    bandMediaShare: BAND_MEDIA_SHARE,
    bandTypeBoost: BAND_TYPE_BOOST,
    bandLift: 26,
    closeFigureW: 430,
    closeFigureH: 470,
    radiusChip: 999,
    radiusPanel: 0,
    radiusMedia: 0,
    contentX: 108,
    maxTextW: 864,
  },
  fonts: {
    ...GRIDPAPER_FONTS_BASE,
    gateSpecs: paperGateSpecs(GRIDPAPER_RAMP, GRIDPAPER_FONTS_BASE, {
      display: 700, body: 500, meta: 500, arDisplay: 700, arBody: 400,
    }),
  },
  media: MEDIA_BY_ARCHETYPE,
  coverAlign: "start",
  heroHighlight: "slab",
};

/* ------------------------------------------------------------------ */
/* The field and gradient families                                     */
/*                                                                     */
/* `paperGateSpecs` is not paper-specific — it derives gate specs from  */
/* a ramp and a weight set, which is exactly what these three need too. */
/* Reusing it is what keeps the fit ladder honest across seven          */
/* families; a second copy would be a second thing to forget.           */
/* ------------------------------------------------------------------ */

/** Montserrat carries salford's display at 800 and its meta at 500/600. */
const FONT_MONTSERRAT = '"AuraMontserrat", "Helvetica Neue", Helvetica, Arial, sans-serif';

/* ------------------------------------------------------------------ */
/* salford — flat navy and mint, alternating, Montserrat 800           */
/* ------------------------------------------------------------------ */

const SALFORD_RAMP: TypeRamp = {
  heroEn: 102, heroEnLh: 1.06,
  heroAr: 88,  heroArLh: 1.44,
  stat: 102,   statLh: 1.06,
  h2: 82,      h2Lh: 1.1,
  body: 40,    bodyLhEn: 1.7, bodyLhAr: 1.75,
  chip: 30, data: 30, source: 26,
  gap: 28, media: 360,
  identityName: 38,
  identitySub: 29,
  floors: { content: 38, meta: 22 },
};

const SALFORD_FONTS_BASE = {
  displayEn: FONT_MONTSERRAT,
  textEn: FONT_MONTSERRAT,
  // Montserrat is the whole voice. This family has no monospace.
  mono: FONT_MONTSERRAT,
  arabic: FONT_AR,
};

/** The dot-matrix pitch, in px at 1080×1350. Read by the renderer, not typed in it. */
export const SALFORD_DOT_PITCH = 26;

const SALFORD: TemplateDescriptor = {
  id: "salford",
  label: { en: "Salford", ar: "سالفورد" },
  ramp: SALFORD_RAMP,
  geometry: {
    canvasW: 1080,
    canvasH: 1350,
    pad: 96,
    safeArea: { top: 96, side: 96, bottom: 96 + 68 },
    bandMediaShare: BAND_MEDIA_SHARE,
    bandTypeBoost: BAND_TYPE_BOOST,
    bandLift: 26,
    closeFigureW: 430,
    closeFigureH: 470,
    radiusChip: 999,
    radiusPanel: 0,
    radiusMedia: 0,
    contentX: 112,
    maxTextW: 856,
  },
  fonts: {
    ...SALFORD_FONTS_BASE,
    gateSpecs: paperGateSpecs(SALFORD_RAMP, SALFORD_FONTS_BASE, {
      display: 800, body: 500, meta: 600, arDisplay: 900, arBody: 400,
    }),
  },
  media: MEDIA_BY_ARCHETYPE,
  coverAlign: "start",
  heroHighlight: "block",
};

/* ------------------------------------------------------------------ */
/* blueprint — near-black field, hairline grid, Poppins 700            */
/* ------------------------------------------------------------------ */

const BLUEPRINT_RAMP: TypeRamp = {
  heroEn: 100, heroEnLh: 1.08,
  heroAr: 86,  heroArLh: 1.48,
  stat: 100,   statLh: 1.08,
  h2: 78,      h2Lh: 1.12,
  body: 40,    bodyLhEn: 1.7, bodyLhAr: 1.75,
  chip: 28, data: 28, source: 26,
  gap: 28, media: 360,
  identityName: 37,
  identitySub: 28,
  floors: { content: 38, meta: 22 },
};

const BLUEPRINT_FONTS_BASE = {
  displayEn: FONT_POPPINS,
  textEn: FONT_POPPINS,
  mono: FONT_POPPINS,
  arabic: FONT_AR_TEXT,
};

/** The hairline grid pitch, in px at 1080×1350. */
export const BLUEPRINT_GRID_PITCH = 98;

const BLUEPRINT: TemplateDescriptor = {
  id: "blueprint",
  label: { en: "Blueprint", ar: "المخطط" },
  ramp: BLUEPRINT_RAMP,
  geometry: {
    canvasW: 1080,
    canvasH: 1350,
    // A multiple of the 98px hairline, so the column lands on the grid.
    pad: 98,
    safeArea: { top: 98, side: 98, bottom: 98 + 68 },
    bandMediaShare: BAND_MEDIA_SHARE,
    bandTypeBoost: BAND_TYPE_BOOST,
    bandLift: 26,
    closeFigureW: 430,
    closeFigureH: 470,
    radiusChip: 999,
    radiusPanel: 0,
    radiusMedia: 0,
    contentX: 98,
    maxTextW: 884,
  },
  fonts: {
    ...BLUEPRINT_FONTS_BASE,
    gateSpecs: paperGateSpecs(BLUEPRINT_RAMP, BLUEPRINT_FONTS_BASE, {
      display: 700, body: 400, meta: 500, arDisplay: 700, arBody: 400,
    }),
  },
  media: MEDIA_BY_ARCHETYPE,
  coverAlign: "start",
  heroHighlight: "underline",
};

/* ------------------------------------------------------------------ */
/* concept — violet gradient, nested wireframes, Inter 700             */
/* ------------------------------------------------------------------ */

const CONCEPT_RAMP: TypeRamp = {
  heroEn: 100, heroEnLh: 1.08,
  heroAr: 86,  heroArLh: 1.46,
  stat: 100,   statLh: 1.08,
  h2: 80,      h2Lh: 1.12,
  body: 40,    bodyLhEn: 1.7, bodyLhAr: 1.75,
  chip: 29, data: 28, source: 26,
  gap: 28, media: 360,
  identityName: 38,
  identitySub: 29,
  floors: { content: 38, meta: 22 },
};

const CONCEPT_FONTS_BASE = {
  displayEn: FONT_TEXT_EN,
  textEn: FONT_TEXT_EN,
  mono: FONT_TEXT_EN,
  arabic: FONT_AR,
};

const CONCEPT: TemplateDescriptor = {
  id: "concept",
  label: { en: "Concept", ar: "التصور" },
  ramp: CONCEPT_RAMP,
  geometry: {
    canvasW: 1080,
    canvasH: 1350,
    pad: 96,
    safeArea: { top: 96, side: 96, bottom: 96 + 68 },
    bandMediaShare: BAND_MEDIA_SHARE,
    bandTypeBoost: BAND_TYPE_BOOST,
    bandLift: 26,
    closeFigureW: 430,
    closeFigureH: 470,
    radiusChip: 999,
    radiusPanel: 28,
    radiusMedia: 28,
    contentX: 112,
    maxTextW: 856,
  },
  fonts: {
    ...CONCEPT_FONTS_BASE,
    // Inter ships 400/500/700/800 — meta is 500, never a 600 that would
    // silently synthesise.
    gateSpecs: paperGateSpecs(CONCEPT_RAMP, CONCEPT_FONTS_BASE, {
      display: 700, body: 400, meta: 500, arDisplay: 900, arBody: 400,
    }),
  },
  media: MEDIA_BY_ARCHETYPE,
  coverAlign: "start",
  heroHighlight: "block",
};

export const TEMPLATES: Record<string, TemplateDescriptor> = {
  instrument: INSTRUMENT,
  highlighter: HIGHLIGHTER,
  crumple: CRUMPLE,
  gridpaper: GRIDPAPER,
  salford: SALFORD,
  blueprint: BLUEPRINT,
  concept: CONCEPT,
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
