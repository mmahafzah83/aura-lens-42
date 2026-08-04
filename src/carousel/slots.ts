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
/**
 * A TRIM TARGET, not a warning threshold. "Shorten it for me" uses this to
 * decide how far to cut a cover's hero. Nothing warns off it: on a cover the
 * picture is a full-bleed background behind scrims, so it costs no layout
 * room and a word count can never prove the slide is too full. Only the fit
 * ladder — which measures the real DOM — may say a slide overflows.
 */
export const COVER_TRIM_TARGET = 10;

/**
 * How many words this slide may carry. A picture no longer buys a smaller
 * budget on a cover (the photo sits behind the type); the band variant keeps
 * a soft budget used only by the deterministic shorten action.
 */
export function wordBudgetFor(archetype: Archetype, hasPicture: boolean): number {
  if (!hasPicture) return PLAIN_WORD_BUDGET;
  const mode = MEDIA_BY_ARCHETYPE[archetype];
  if (mode === "band") return Math.round(PLAIN_WORD_BUDGET * BAND_TEXT_SHARE);
  return PLAIN_WORD_BUDGET;
}

/* ------------------------------------------------------------------ */
/* Z2 — THE COMPOSITION RULE, AND WHAT IT COSTS                        */
/* ------------------------------------------------------------------ */

/**
 * NOTHING IS DROPPED BY COUNTING. A picture slide keeps every filled slot
 * until MEASUREMENT proves the words do not fit: the renderer runs the fit
 * ladder to exhaustion first, and only then asks for one more slot to be
 * dropped, lowest priority first. `overflowDrops` is that measured number.
 *
 * A cover never drops anything at all — the photo is a background behind
 * scrims and consumes no layout space.
 *
 * The renderer draws `kept`; the inspector NAMES `dropped` to the member.
 * Nothing may be omitted from a slide without the member being told which
 * field it was.
 */

/**
 * Which slot is the hook, and which supporting slot earns the second place.
 * Ordered by how much the slide depends on it, most first.
 */
export const PICTURE_SLOT_PRIORITY = [
  "hero_lines",
  "stat_value",
  "headline",
  "quote",
  "term_def",
  "body",
  "stat_label",
  "subline",
  "checklist",
  "callout_body",
  "callout_label",
  "term",
  "chip",
  "source",
  "cta_pill",
] as const;

type LooseSlots = Record<string, unknown>;

function slotIsFilled(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

export interface PictureTextPlan {
  /** Slot names the picture variant draws. */
  kept: string[];
  /** Filled slot names the picture variant cannot draw. NEVER silent. */
  dropped: string[];
}

/**
 * What a picture variant can actually show on this slide, and what it cannot.
 * `plain` slides keep everything: the rule exists because a picture took the
 * room, so with no picture there is nothing to give up.
 */
export function pictureTextPlan(
  archetype: Archetype,
  slots: LooseSlots,
  hasPicture: boolean,
  /** Measured overflow drops, supplied by the renderer's fit ladder. */
  overflowDrops = 0,
): PictureTextPlan {
  const mode = hasPicture ? MEDIA_BY_ARCHETYPE[archetype] : "none";
  const filled = PICTURE_SLOT_PRIORITY.filter((k) => slotIsFilled(slots[k]));
  // No picture, an archetype that refuses one, or a cover: keep everything.
  if (mode !== "band" || overflowDrops <= 0) return { kept: filled.slice(), dropped: [] };
  // The hook always survives, so never drop the last remaining slot.
  const drops = Math.min(overflowDrops, Math.max(0, filled.length - 1));
  const keepCount = filled.length - drops;
  return { kept: filled.slice(0, keepCount), dropped: filled.slice(keepCount) };
}

/** How many slots this slide could still give up before only the hook is left. */
export function droppableSlotCount(slots: LooseSlots): number {
  return Math.max(0, PICTURE_SLOT_PRIORITY.filter((k) => slotIsFilled(slots[k])).length - 1);
}