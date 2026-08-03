/**
 * Friendly names for slots. A member edits "The number", never "stat_value".
 * Order here is the order of the edit panel.
 */
import type { Slots } from "../deckIR";

export const SLOT_ORDER: Array<keyof Slots> = [
  "chip",
  "hero_lines",
  "headline",
  "subline",
  "term",
  "term_def",
  "quote",
  "stat_value",
  "stat_label",
  "source",
  "body",
  "checklist",
  "callout_label",
  "callout_body",
  "cta_pill",
];

export const SLOT_LABEL: Record<string, string> = {
  chip: "Label",
  hero_lines: "Hook",
  headline: "Headline",
  subline: "Framing",
  term: "Term",
  term_def: "Definition",
  quote: "Quote",
  stat_value: "The number",
  stat_label: "What it measures",
  source: "Source",
  body: "Key insight",
  checklist: "Steps",
  callout_label: "Callout label",
  callout_body: "Callout",
  cta_pill: "Closing question",
  media: "Image",
};

export const ARCHETYPE_LABEL: Record<string, string> = {
  cover_hero: "Cover",
  cover_stat: "Cover with a number",
  frame: "Framing",
  evidence: "Evidence",
  benchmark: "Comparison",
  quote: "Quote",
  steps: "Steps",
  definition: "Definition",
  close: "Close",
};

const GENERIC = "Aura needed to adjust something and will try again.";

/** Plain-English rewrite of an invariant failure. Members do not read INV codes. */
export function plainFailure(raw: string): string {
  const body = raw.replace(/^INV-\d+[a-z]?:\s*/, "");
  // One filter, applied to every branch below: no code, no field paths, no
  // rule numbers ever reach a member.
  const leaks = /schema|Array must contain|slots|INV-|slides\.\d+|\bZod\b|\bnull\b|undefined|\{|\}/i;
  const safe = (out: string) => (leaks.test(out) || !out.trim() ? GENERIC : out);
  if (raw.startsWith("INV-13")) {
    const m = body.match(/hero line "(.+?)" is (\d+) characters, over the (en|ar) budget of (\d+)/);
    if (m) return `The hook line "${m[1]}" is ${m[2]} characters. It must be ${m[4]} or fewer, or it wraps.`;
    return GENERIC;
  }
  if (raw.startsWith("INV-04")) return safe(`${body.split(" — ")[0]} Each slide may carry one emphasis only.`);
  if (raw.startsWith("INV-05")) return "A number is shown without a source. Add where it came from.";
  if (raw.startsWith("INV-01")) return "A slide has nothing on it. Add text or remove the slide.";
  if (raw.startsWith("INV-06")) return "Two slides next to each other use the same layout.";
  if (raw.startsWith("INV-02")) return safe(body.replace("content overflows the canvas", "The text is too long for the slide"));
  if (raw.startsWith("INV-12") || raw.startsWith("INV-10")) {
    return leaks.test(body) ? GENERIC : body;
  }
  if (leaks.test(raw) || leaks.test(body)) return GENERIC;
  return body.trim() ? body : GENERIC;
}