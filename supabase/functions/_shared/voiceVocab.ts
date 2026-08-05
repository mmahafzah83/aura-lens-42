/**
 * Voice profile hygiene.
 *
 * Two things rot in `authority_voice_profiles` if left alone:
 *   - `vocabulary_preferences.avoid` grows every distillation, so the same
 *     rule ("avoid hedging like 'perhaps'") lands a dozen times in slightly
 *     different words and every copy is injected into the prompt.
 *   - `example_posts` mixes bare strings with objects, and once held the
 *     literal text "undefined".
 *
 * Everything here is pure so both the live write path and the one-off
 * backfill can share it.
 */

export const RULE_CAP = 12;
export const EXAMPLE_CAP = 10;
export const MIN_EXAMPLE_LENGTH = 40;

const STOP = new Set([
  "a","an","the","and","or","of","to","in","on","for","with","without","that",
  "this","these","those","is","are","be","being","been","it","its","as","at",
  "by","from","not","no","any","all","use","using","used","avoid","avoiding",
  "never","dont","do","does","language","words","word","phrases","phrase",
  "style","such","like","e.g","eg","etc","too","very","overly","more","most",
  "your","you","their","them","they","we","our","i","me","my",
]);

/** The meaning-bearing words of a rule, order-independent. */
function signature(rule: string): string {
  const words = String(rule)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter((w) => w.length > 2 && !STOP.has(w));
  return [...new Set(words)].sort().join(" ");
}

function tokenSet(rule: string): Set<string> {
  return new Set(signature(rule).split(" ").filter(Boolean));
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / Math.min(a.size, b.size);
}

/**
 * Merge rules that express the same constraint in different words, then keep
 * the most specific ones (longest, most concrete) up to `cap`.
 */
export function dedupeRules(input: unknown, cap = RULE_CAP): string[] {
  const raw = (Array.isArray(input) ? input : [])
    .map((r) => (typeof r === "string" ? r : String((r as any)?.rule ?? (r as any)?.text ?? "")))
    .map((r) => r.replace(/\s+/g, " ").trim())
    .filter((r) => r.length > 1);

  // Most specific first, so a merge keeps the richer wording.
  const ranked = [...new Set(raw)].sort((a, b) => {
    const sa = tokenSet(a).size, sb = tokenSet(b).size;
    return sb - sa || b.length - a.length;
  });

  const kept: { text: string; tokens: Set<string> }[] = [];
  for (const rule of ranked) {
    const tokens = tokenSet(rule);
    const dup = kept.some((k) => k.tokens.size && overlap(tokens, k.tokens) >= 0.6);
    if (dup) continue;
    kept.push({ text: rule, tokens });
    if (kept.length >= cap) break;
  }
  return kept.map((k) => k.text);
}

export interface VoiceExample {
  content: string;
  source: string;
  added_at: string;
  [key: string]: unknown;
}

const timeOf = (e: any): number => {
  const t = Date.parse(String(e?.added_at ?? e?.published_at ?? ""));
  return Number.isNaN(t) ? 0 : t;
};

/**
 * Every entry becomes `{content, source, added_at}`. Bare strings arrive as
 * `legacy`, junk ("undefined", stubs under 40 characters) is dropped, and the
 * most recent `cap` survive.
 */
export function normalizeExamples(
  input: unknown,
  cap = EXAMPLE_CAP,
  defaultSource = "legacy",
): VoiceExample[] {
  const list = Array.isArray(input) ? input : [];
  const out: VoiceExample[] = [];
  const seen = new Set<string>();

  for (const raw of list) {
    let content = "";
    let source = defaultSource;
    let added_at = "";
    let rest: Record<string, unknown> = {};

    if (typeof raw === "string") {
      content = raw;
    } else if (raw && typeof raw === "object") {
      const o = raw as Record<string, unknown>;
      content = String(o.content ?? o.text ?? o.post_text ?? "");
      source = String(o.source ?? defaultSource) || defaultSource;
      added_at = String(o.added_at ?? o.published_at ?? "");
      const { content: _c, source: _s, added_at: _a, ...others } = o;
      rest = others;
    } else {
      continue;
    }

    content = content.replace(/\r\n/g, "\n").trim();
    if (!content) continue;
    if (content.includes("undefined")) continue;
    if (content.length < MIN_EXAMPLE_LENGTH) continue;

    const key = content.replace(/\s+/g, " ").toLowerCase().slice(0, 160);
    if (seen.has(key)) continue;
    seen.add(key);

    if (!added_at || Number.isNaN(Date.parse(added_at))) added_at = new Date(0).toISOString();
    out.push({ ...rest, content, source, added_at });
  }

  return out.sort((a, b) => timeOf(b) - timeOf(a)).slice(0, cap);
}

/**
 * The single gate every write to `vocabulary_preferences` goes through:
 * caps `avoid` and `use`, and lifts any nested example backup out of the
 * vocabulary blob so it can be folded into `example_posts`.
 */
export function sanitizeVocabulary(vocab: unknown): {
  vocabulary: Record<string, unknown>;
  promotedExamples: VoiceExample[];
} {
  const v = (vocab && typeof vocab === "object" ? { ...(vocab as Record<string, unknown>) } : {});
  const promoted = normalizeExamples(v.example_posts_levantine_backup, EXAMPLE_CAP, "levantine_backup");
  delete v.example_posts_levantine_backup;
  v.avoid = dedupeRules(v.avoid);
  v.use = dedupeRules(v.use);
  return { vocabulary: v, promotedExamples: promoted };
}
