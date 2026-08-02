/**
 * Which slots each archetype must contain. The manifest names them; the writer
 * fills exactly these and nothing else. No layout decisions live in the model.
 */
import type { Archetype } from "./deckIR.ts";

export const REQUIRED_SLOTS: Record<Archetype, string[]> = {
  cover_hero: ["chip", "hero_lines", "subline"],
  cover_stat: ["chip", "stat_value", "stat_label", "source"],
  frame: ["headline", "body"],
  evidence: ["headline", "stat_value", "stat_label", "source"],
  benchmark: ["headline", "media"],
  quote: ["quote", "source"],
  steps: ["headline", "checklist"],
  definition: ["term", "term_def", "body"],
  close: ["headline", "cta_pill"],
};

/** Slots an archetype may add but does not require. */
export const OPTIONAL_SLOTS: Record<Archetype, string[]> = {
  cover_hero: [],
  cover_stat: ["hero_lines"],
  frame: ["chip", "callout_label", "callout_body"],
  evidence: ["body", "media"],
  benchmark: ["body", "source"],
  quote: ["headline"],
  steps: ["chip", "body"],
  definition: ["chip"],
  close: ["body"],
};