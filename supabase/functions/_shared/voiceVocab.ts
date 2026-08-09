/**
 * The single source of truth for post fingerprint vocabulary.
 *
 * To add a hook style or ending type later you change this constant and the
 * matching CHECK constraint on `linkedin_posts` — nothing else. Every rule
 * branch, every model prompt and every validation step reads from here, so the
 * classifier can never invent a label the database (or the Variation engine)
 * does not understand.
 */
export const HOOK_STYLES = [
  "contrarian_claim",
  "number_first",
  "short_story",
  "question",
  "experience_led",
  "announcement",
  "other",
] as const;

export const ENDING_TYPES = [
  "question",
  "suspended",
  "reframe",
  "equation",
  "number",
  "cta",
  "other",
] as const;

export type HookStyleLabel = typeof HOOK_STYLES[number];
export type EndingTypeLabel = typeof ENDING_TYPES[number];

/** Anything outside the vocabulary collapses to `other` — never a new label. */
export function coerceHook(value: unknown): HookStyleLabel {
  return (HOOK_STYLES as readonly string[]).includes(String(value))
    ? (String(value) as HookStyleLabel)
    : "other";
}

export function coerceEnding(value: unknown): EndingTypeLabel {
  return (ENDING_TYPES as readonly string[]).includes(String(value))
    ? (String(value) as EndingTypeLabel)
    : "other";
}

export const isHook = (v: unknown) => (HOOK_STYLES as readonly string[]).includes(String(v));
export const isEnding = (v: unknown) => (ENDING_TYPES as readonly string[]).includes(String(v));

/** One worked example per opener, used to make the model prompt concrete. */
export const HOOK_DEFINITIONS: Record<Exclude<HookStyleLabel, "other">, string> = {
  contrarian_claim:
    "states a position against the common view. e.g. \"Most transformation programmes fail for the opposite reason everyone assumes.\"",
  number_first:
    "opens on a figure, percentage, amount or date. e.g. \"73% of the boards we advised last year had no succession plan.\"",
  short_story:
    "opens inside a specific scene or moment with a beginning. e.g. \"A client called me at 11pm the night before the board met.\"",
  question:
    "opens by asking the reader something. e.g. \"What does a CFO actually owe the next generation?\"",
  experience_led:
    "opens from the writer's own vantage point or track record, without a scene. e.g. \"In fifteen years advising family groups, I keep meeting the same gap.\"",
  announcement:
    "shares news, a launch, an appointment, a milestone or thanks. e.g. \"Delighted to share that we have joined the regional council.\"",
};

export const ENDING_DEFINITIONS: Record<Exclude<EndingTypeLabel, "other">, string> = {
  question: "closes with a question to the reader.",
  suspended: "closes on an unfinished or trailing line.",
  reframe: "closes by restating the idea in a new light.",
  equation: "closes with a formula-like line, e.g. \"Trust = consistency x time\".",
  number: "closes on a figure that lands the point.",
  cta: "closes by asking for a comment, follow, share or booking.",
};
