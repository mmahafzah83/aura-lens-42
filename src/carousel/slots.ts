/**
 * Which slots each archetype must contain. Mirrors
 * supabase/functions/generate-deck/slots.ts — the studio needs it to decide
 * which archetypes a slide may legally be swapped to.
 */
import type { Archetype } from "./deckIR";

export const REQUIRED_SLOTS: Record<Archetype, string[]> = {
  cover_hero: ["chip", "hero_lines", "subline"],
  cover_stat: ["chip", "stat_value", "stat_label", "source"],
  frame: ["headline", "hero_lines", "body"],
  evidence: ["stat_value", "stat_label", "source"],
  benchmark: ["headline", "hero_lines", "media"],
  quote: ["quote", "hero_lines"],
  steps: ["headline", "hero_lines", "checklist"],
  definition: ["term", "term_def", "hero_lines", "body"],
  close: ["headline", "hero_lines", "cta_pill"],
};

export const OPTIONAL_SLOTS: Record<Archetype, string[]> = {
  cover_hero: [],
  cover_stat: [],
  frame: ["chip", "callout_label", "callout_body"],
  evidence: ["headline", "body", "media"],
  benchmark: ["body", "source"],
  quote: ["source"],
  steps: ["chip", "body"],
  definition: ["chip"],
  close: ["body"],
};

/* ------------------------------------------------------------------ */
/* Picture handling — a layout VARIANT, never an inserted block         */
/* ------------------------------------------------------------------ */

/**
 * `cover` — the picture becomes the slide: full bleed behind the type, and
 *           the hero line is the only text that survives.
 * `band`  — a fixed two-zone split. The image always takes the same share of
 *           the slide, the text takes the rest, and the type gets LARGER
 *           because there are fewer words in less room.
 * `none`  — this archetype refuses a member picture, and says why in words.
 *
 * Total `Record`, so a tenth archetype cannot be added without making this
 * decision. Lives here rather than in the renderer because the studio, the
 * edit operations and the renderer all have to agree on one taxonomy.
 */
export type MediaPlacementMode = "cover" | "band" | "none";

export const MEDIA_BY_ARCHETYPE: Record<Archetype, MediaPlacementMode> = {
  cover_hero: "cover",
  cover_stat: "cover",
  frame: "band",
  evidence: "band",
  // The chart is this slide's picture.
  benchmark: "none",
  quote: "cover",
  // The numbered list needs the whole slide.
  steps: "none",
  definition: "band",
  // The closing slide always shows the member.
  close: "none",
};

/**
 * The image's share of the slide in the `band` variant. CONSTANT on purpose:
 * a proportion that drifts with the word count is what makes a deck look
 * assembled rather than designed.
 */
export const BAND_MEDIA_SHARE = 0.45;
/** The text keeps the remainder. The two always sum to one. */
export const BAND_TEXT_SHARE = 1 - BAND_MEDIA_SHARE;

/**
 * Type is BIGGER in a band picture variant, not smaller. Fewer words in less
 * space is a design decision; the same small type with a photo under it reads
 * as a text slide with a photograph stapled on.
 */
export const BAND_TYPE_BOOST = 1.18;

/** Words a slide may carry with no picture at all. */
export const PLAIN_WORD_BUDGET = 60;
/** A cover picture leaves room for one hero line and nothing else. */
export const COVER_WORD_BUDGET = 10;

/** How many words this slide may carry, given whether it holds a picture. */
export function wordBudgetFor(archetype: Archetype, hasPicture: boolean): number {
  if (!hasPicture) return PLAIN_WORD_BUDGET;
  const mode = MEDIA_BY_ARCHETYPE[archetype];
  if (mode === "cover") return COVER_WORD_BUDGET;
  if (mode === "band") return Math.round(PLAIN_WORD_BUDGET * BAND_TEXT_SHARE);
  return PLAIN_WORD_BUDGET;
}