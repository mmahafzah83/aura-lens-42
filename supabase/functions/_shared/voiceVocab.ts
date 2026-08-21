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

/**
 * A rule is written in plain English ("opens with a question", "uses numbers").
 * When the words of the rule do not appear in the writing, the concept behind
 * it still can — this turns a named concept into something findable.
 * Returns null when the rule names no concept we can look for.
 */
const CONCEPTS: Array<{ match: RegExp; find: RegExp }> = [
  { match: /\bquestion/i, find: /[^.!?\n]{5,160}\?/ },
  { match: /\bnumber|figure|stat|percent|metric/i, find: /\b\d[\d,.]*\s?%?\b/ },
  { match: /\bshort sentence|brevity|one line/i, find: /(^|[.!?]\s)[^.!?\n]{1,45}[.!?]/ },
  { match: /\blist|bullet/i, find: /(^|\n)\s*(?:[-–—•*]|\d+[.)])\s+\S/ },
  { match: /\bem dash|dash/i, find: /—/ },
  { match: /\bemoji/i, find: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u },
  { match: /\bhashtag/i, find: /(^|\s)#[\p{L}\d_]+/u },
  { match: /\bfirst person|\bI\b|\bwe\b/i, find: /\b(I|we|my|our)\b/i },
  { match: /\bsecond person|\byou\b/i, find: /\byou(r|rs)?\b/i },
  { match: /\bquote|quotation/i, find: /["“][^"”\n]{5,200}["”]/ },
  { match: /\bcall to action|\bask(s)? the reader/i, find: /\b(tell me|what do you think|share|comment|let me know)\b/i },
];

export function conceptRegexOf(rule: unknown): RegExp | null {
  const text = String(rule ?? "");
  if (!text.trim()) return null;
  for (const c of CONCEPTS) if (c.match.test(text)) return new RegExp(c.find.source, c.find.flags.replace("g", ""));
  return null;
}
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

/* ------------------------------------------------------------------------ *
 * Stored-profile hygiene.
 *
 * `authority_voice_profiles` rows have been written by half a dozen different
 * jobs over a year, so the shapes in the column are not uniform. Everything
 * that reads or writes that column routes through the four helpers below, so
 * there is exactly one definition of "well formed" — and, more importantly,
 * exactly one place where the rule "a human's curated entry is never destroyed
 * by a machine" is enforced.
 * ------------------------------------------------------------------------ */

import { toRules, type VoiceRule } from "./voiceRules.ts";

/**
 * How many example posts a profile row may carry.
 *
 * This is a TRIM limit for machine-observed examples only. It must stay at or
 * above the largest array already stored (10 at the time of writing) so that
 * simply normalising an untouched row can never delete a member's examples.
 */
export const EXAMPLE_CAP = 12;

export interface ExampleEntry {
  source?: string;
  content?: string;
  url?: string | null;
  published_at?: string | null;
  engagement?: number;
  [key: string]: unknown;
}

/** The identity of an example is its text, not its metadata. */
const exampleKey = (e: ExampleEntry) =>
  String(e?.content ?? "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 120);

const engagementOfEntry = (e: ExampleEntry) => Number(e?.engagement ?? 0) || 0;

/**
 * One shape, no duplicates, and a cap that only ever bites machine-observed
 * entries. A curated example — anything whose `source` is not `observedSource`
 * — survives de-duplication and the cap unconditionally: a member (or a human
 * operator) put it there deliberately and no refresh job may drop it.
 *
 * Pure: the input array is never mutated.
 */
export function normalizeExamples(
  entries: unknown,
  cap: number = EXAMPLE_CAP,
  observedSource = "linkedin_own",
): ExampleEntry[] {
  const list: ExampleEntry[] = (Array.isArray(entries) ? entries : [])
    .map((e) => (typeof e === "string" ? { content: e } : e))
    .filter((e): e is ExampleEntry => Boolean(e) && typeof e === "object")
    .filter((e) => String(e.content ?? "").trim().length > 0);

  const isObserved = (e: ExampleEntry) => e.source === observedSource;

  // First occurrence wins, but a curated entry always beats an observed
  // duplicate no matter which came first.
  const byKey = new Map<string, ExampleEntry>();
  const order: string[] = [];
  for (const e of list) {
    const k = exampleKey(e);
    const kept = byKey.get(k);
    if (!kept) { byKey.set(k, e); order.push(k); continue; }
    if (isObserved(kept) && !isObserved(e)) byKey.set(k, e);
  }
  const unique = order.map((k) => byKey.get(k)!);

  const curated = unique.filter((e) => !isObserved(e));
  const observed = unique
    .filter(isObserved)
    .sort((a, b) => engagementOfEntry(b) - engagementOfEntry(a));

  const room = Math.max(0, (Number.isFinite(cap) ? cap : EXAMPLE_CAP) - curated.length);
  return [...curated, ...observed.slice(0, room)];
}

export interface SanitizedVocabulary {
  vocabulary: Record<string, unknown> & { use: VoiceRule[]; avoid: VoiceRule[]; rhythm: string };
  changed: boolean;
  promotedExamples: ExampleEntry[];
}

/**
 * Guarantees the shape of `vocabulary_preferences` without ever losing a key.
 *
 * Callers rely on this never throwing — it is the function that turns whatever
 * is actually in the column (null, a string, an array, a legacy object) into
 * something the rest of the code can trust. Keys it does not understand are
 * passed through untouched; nothing is silently deleted. Long prose that was
 * mistakenly filed under a samples key is lifted out as `promotedExamples`
 * rather than dropped.
 *
 * `changed` says whether the output differs from the input, so a caller can
 * skip a pointless write.
 */
export function sanitizeVocabulary(raw: unknown): SanitizedVocabulary {
  const source: Record<string, unknown> =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? { ...(raw as Record<string, unknown>) }
      : {};

  const promotedExamples: ExampleEntry[] = [];
  for (const key of ["examples", "example_posts", "samples"]) {
    const v = source[key];
    if (Array.isArray(v)) {
      for (const item of v) {
        const content = typeof item === "string" ? item : String((item as any)?.content ?? "");
        if (content.trim().length > 0) {
          promotedExamples.push({
            source: typeof item === "object" && item ? String((item as any)?.source ?? "curated") : "curated",
            content: content.trim(),
          });
        }
      }
      delete source[key];
    }
  }

  const use = dedupeRuleEntries(toRules(source.use));
  const avoid = dedupeRuleEntries(toRules(source.avoid));
  const rhythm = typeof source.rhythm === "string" ? source.rhythm : "";

  const vocabulary = { ...source, use, avoid, rhythm } as SanitizedVocabulary["vocabulary"];
  // `observed` and every other unrecognised key are already carried by the spread.

  const changed = JSON.stringify(raw ?? null) !== JSON.stringify(vocabulary) ||
    promotedExamples.length > 0;

  return { vocabulary, changed, promotedExamples };
}

/**
 * De-duplicates rule entries on the rule text alone.
 *
 * The FIRST occurrence is kept because every call site passes curated rules
 * first on purpose — curated must win. Evidence carried by a later duplicate is
 * merged into the kept entry, so de-duplication can only ever strengthen a
 * rule, never weaken it. Input order is preserved. Pure.
 */
export function dedupeRuleEntries(entries: unknown): VoiceRule[] {
  const out: VoiceRule[] = [];
  const index = new Map<string, number>();
  for (const r of toRules(entries)) {
    const key = r.rule.trim().toLowerCase();
    const at = index.get(key);
    if (at === undefined) {
      index.set(key, out.length);
      out.push({ ...r });
      continue;
    }
    const kept = out[at];
    if (!kept.evidence && r.evidence) {
      out[at] = { ...kept, evidence: r.evidence, verified: true };
    }
    out[at] = {
      ...out[at],
      contradictions: Math.max(out[at].contradictions, r.contradictions),
    };
  }
  return out;
}

/**
 * The plain-string equivalent, for callers that hold a bare list of rule texts.
 * Anything richer is handed to `dedupeRuleEntries` so both paths agree on what
 * counts as the same rule.
 */
export function dedupeRules(rules: unknown): string[] {
  return dedupeRuleEntries(rules).map((r) => r.rule);
}
