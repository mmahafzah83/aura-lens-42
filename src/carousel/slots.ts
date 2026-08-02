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