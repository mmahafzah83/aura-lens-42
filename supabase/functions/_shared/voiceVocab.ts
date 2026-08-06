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
 * The constraints members actually keep restating. Two rules that hit the same
 * concept ARE the same rule, however differently they are worded — this is what
 * makes the merge semantic rather than a truncation at twelve.
 */
const CONCEPTS: { id: string; re: RegExp }[] = [
  { id: "hedging", re: /\b(hedg\w*|perhaps|maybe|might|possibly|tentative|qualifier|wishy|softener|caveat)\b/i },
  { id: "jargon", re: /\b(jargon|buzzword\w*|corporate\s?speak|management\s?speak|consultant\s?speak|cliché\w*|cliche\w*|platitude\w*)\b/i },
  { id: "emoji", re: /\b(emoji\w*|emoticon\w*)\b|[\u{1F300}-\u{1FAFF}]/iu },
  { id: "hashtag", re: /\b(hashtag\w*)\b/i },
  { id: "exclamation", re: /\b(exclamation|hype|hyperbol\w*|shout\w*|all\s?caps)\b/i },
  { id: "self_promo", re: /\b(self[-\s]?promot\w*|humble\s?brag|brag\w*|boast\w*)\b/i },
  { id: "cta", re: /\b(call\s?to\s?action|cta|engagement\s?bait|like\s?and\s?share|follow\s?me)\b/i },
  { id: "abstraction", re: /\b(abstract\w*|vague\w*|generic\w*|generalit\w*|fluff|filler)\b/i },
  { id: "listicle", re: /\b(listicle|numbered\s?list|bullet\s?point\w*)\b/i },
  { id: "motivational", re: /\b(motivat\w*|inspiration\w*|guru|preach\w*|lectur\w*)\b/i },
  { id: "long_sentence", re: /\b(long\s?sentence\w*|run[-\s]?on|dense\s?paragraph\w*|wall\s?of\s?text)\b/i },
  { id: "first_person_absence", re: /\b(third\s?person|impersonal|passive\s?voice)\b/i },
  { id: "question_opener", re: /\b(question\s?(?:opener|hook)|open\w*\s+with\s+a\s+question)\b/i },
  { id: "apology", re: /\b(apolog\w*|sorry|excuse)\b/i },
  { id: "promo_ar", re: /(ترويجي\w*|البيعية|بيعية|sales\s?pitch|إعلاني)/i },
  { id: "cta_ar", re: /(شاركنا رأيك|شاركونا|ما رأيكم|دعوات? .{0,12}للتفاعل|دعوة للتفاعل|نهاية المنشور|دعوات? .{0,12}للعمل)/ },
  { id: "motivational_hollow_ar", re: /(تحفيز\w*|ملهم\w*|شعارات|حماس\w*|نفخر|تفاؤل)/ },
  { id: "long_sentence_ar", re: /(الجمل الطويلة|تراكيب فرعية|جمل معقدة)/ },
  { id: "academic_ar", re: /(أكاديمية|المصطلحات التقنية المعقدة|لغة معقدة)/ },
  { id: "rhetorical_question_ar", re: /(الأسئلة البلاغية|أسئلة مفتوحة)/ },
  { id: "hedging_ar", re: /(ربما|قد يكون|تحفظ|تردد)/ },
  { id: "jargon_ar", re: /(مصطلحات|لغة تسويقية|كلام إنشائي|عبارات جاهزة)/ },
  { id: "emoji_ar", re: /(إيموجي|رموز تعبيرية)/ },
  { id: "motivational_ar", re: /(تحفيزي|وعظ|خطابة)/ },
];

function conceptOf(rule: string): string | null {
  for (const c of CONCEPTS) if (c.re.test(rule)) return c.id;
  return null;
}

/**
 * The pattern that would make this rule VISIBLE in a piece of writing, so a
 * rule can be checked against the member's own text rather than assumed.
 */
export function conceptRegexOf(rule: string): RegExp | null {
  for (const c of CONCEPTS) {
    if (c.re.test(String(rule))) return new RegExp(c.re.source, c.re.flags.replace("g", ""));
  }
  return null;
}

/**
 * Merge rules that express the same constraint in different words — first by
 * concept, then by token overlap — and keep the most specific survivor of each
 * group, up to `cap`. Nothing is dropped that still means something new.
 */
export function dedupeRules(input: unknown, cap = RULE_CAP): string[] {
  return dedupeRuleEntries(input, cap).map((e) => String((e as any).rule));
}

/**
 * The same semantic merge, but entries keep everything they carry — evidence,
 * verification and contradiction count survive deduplication.
 */
export function dedupeRuleEntries(input: unknown, cap = RULE_CAP): Record<string, unknown>[] {
  const entries = (Array.isArray(input) ? input : [])
    .map((r) => {
      const obj = typeof r === "string" ? { rule: r } : { ...(r as Record<string, unknown>) };
      const rule = String((obj as any).rule ?? (obj as any).text ?? "").replace(/\s+/g, " ").trim();
      delete (obj as any).text;
      return { ...obj, rule };
    })
    .filter((e) => e.rule.length > 1);

  // One entry per distinct wording, richest survivor first.
  const byRule = new Map<string, Record<string, unknown>>();
  for (const e of entries) {
    const prev = byRule.get(e.rule);
    if (!prev || (!prev.evidence && e.evidence)) byRule.set(e.rule, e);
  }
  const raw = [...byRule.keys()];

  // Most specific first, so a merge keeps the richer wording.
  const ranked = raw.sort((a, b) => {
    const sa = tokenSet(a).size, sb = tokenSet(b).size;
    return sb - sa || b.length - a.length;
  });

  const kept: { text: string; tokens: Set<string>; concept: string | null }[] = [];
  const seenConcepts = new Set<string>();
  for (const rule of ranked) {
    const tokens = tokenSet(rule);
    const concept = conceptOf(rule);
    if (concept && seenConcepts.has(concept)) continue;
    const dup = kept.some((k) => k.tokens.size && overlap(tokens, k.tokens) >= 0.45);
    if (dup) continue;
    if (concept) seenConcepts.add(concept);
    kept.push({ text: rule, tokens, concept });
    if (kept.length >= cap) break;
  }
  return kept.map((k) => byRule.get(k.text) as Record<string, unknown>);
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
  // Entries, not strings: evidence and contradiction counts must survive.
  v.avoid = dedupeRuleEntries(v.avoid);
  v.use = dedupeRuleEntries(v.use);
  return { vocabulary: v, promotedExamples: promoted };
}
