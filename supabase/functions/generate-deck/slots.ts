/**
 * Which slots each archetype must contain. The manifest names them; the writer
 * fills exactly these and nothing else. No layout decisions live in the model.
 */
import type { Archetype } from "./deckIR.ts";

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

/** Slots an archetype may add but does not require. */
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