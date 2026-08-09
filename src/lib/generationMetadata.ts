/**
 * Generation metadata for every post Aura writes.
 *
 * Labels are chosen from FIXED vocabularies, never invented per generation,
 * and they are read off the text that was actually produced — a post ending in
 * a question is labelled `question`, always. Nothing here is optional: when a
 * value cannot be read we fall back to the vocabulary's neutral member so the
 * repetition machinery never sees a null.
 */

export const HOOK_VOCAB = [
  "scene",
  "number",
  "confession",
  "claim",
  "question",
  "dialogue",
  "contrast",
] as const;
export type HookStyle = (typeof HOOK_VOCAB)[number];

export const ENDING_VOCAB = [
  "hanging_line",
  "equation",
  "number",
  "reframe",
  "question",
  "signature",
] as const;
export type EndingType = (typeof ENDING_VOCAB)[number];

export const STANCE_VOCAB = ["asserts", "story", "teaches", "doubts", "analysis"] as const;
export type Stance = (typeof STANCE_VOCAB)[number];

/**
 * Trailing quotes, brackets, emoji and stray spaces hide the real terminal
 * punctuation, which is how a question-ending post ended up labelled
 * `hanging_line`. Every derivation reads the trimmed form.
 */
const TRAILING_NOISE = /[\s"\u201d\u00bb'\u2019)\]}\u2026]*$/u;
const EMOJI_GLYPH = /[\u{1F000}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{20E3}\u{2190}-\u{21FF}\u{2300}-\u{23FF}]/gu;

const normalizeLine = (line: string) =>
  line.replace(EMOJI_GLYPH, "").replace(TRAILING_NOISE, "").trim();

const firstLine = (text: string) =>
  normalizeLine(text.split("\n").map((l) => l.trim()).find(Boolean) ?? "");

const lastLine = (text: string) => {
  const lines = text.split("\n").map((l) => normalizeLine(l)).filter(Boolean);
  return lines[lines.length - 1] ?? "";
};

const hasDigit = (s: string) => /[0-9٠-٩۰-۹]/.test(s);

/** How the piece opens. */
export function hookStyleOf(text: string): HookStyle {
  const line = firstLine(text || "");
  if (!line) return "claim";
  // An opening line that ends in a question mark is a question hook. No exceptions.
  if (/[?؟]$/.test(line)) return "question";
  if (/^["“«"']/.test(line) || /["“«][^"”»]{8,}["”»]/.test(line)) return "dialogue";
  if (hasDigit(line)) return "number";
  if (/\b(i (?:was wrong|got it wrong|used to|never|failed|admit)|i'?ve been wrong|confession)\b/i.test(line) ||
      /(أعترف|كنت مخطئاً|أخطأت)/.test(line)) return "confession";
  if (/\b(most|everyone|nobody|no one|stop|forget|wrong|myth|but not|isn'?t)\b/i.test(line) ||
      /(لا أحد|معظم|توقف|ليس)/.test(line)) return "contrast";
  if (/\b(i|we|my|our)\b/i.test(line) && /\b(was|were|had|walked|sat|stood|remember|arrived)\b/i.test(line)) return "scene";
  if (/(كنت|جلست|وقفت|حين|عندما)/.test(line)) return "scene";
  return "claim";
}

/** How the piece closes. */
export function endingTypeOf(text: string): EndingType {
  const line = lastLine(text || "");
  if (!line) return "hanging_line";
  // Text that ends in a question mark is a question ending. No exceptions.
  if (/[?؟]$/.test(line)) return "question";
  if (/[=＝]|\s\+\s|\s×\s/.test(line)) return "equation";
  if (/\b(comment|share|follow|dm|message me|let me know|tell me)\b/i.test(line) ||
      /(شاركني|تابعني|علّق)/.test(line)) return "signature";
  if (hasDigit(line)) return "number";
  if (/\b(isn'?t about|not about|the real (?:question|problem)|that'?s not|it'?s not)\b/i.test(line) ||
      /(ليست عن|المسألة ليست|السؤال الحقيقي)/.test(line)) return "reframe";
  if (/\b(lesson|takeaway|in short|that'?s why)\b/i.test(line) || /(الخلاصة|الدرس)/.test(line)) return "equation";
  return "hanging_line";
}

/** The position the piece takes. */
export function stanceOf(text: string): Stance {
  const t = (text || "").toLowerCase();
  if (!t.trim()) return "analysis";
  if (/\b(i learned|i realised|i realized|my experience|when i|years ago)\b/.test(t) || /(تجربتي|تعلمت|قبل سنوات)/.test(text)) return "story";
  if (/\b(step \d|here'?s how|start by|do this|the framework|checklist)\b/.test(t) || /(الخطوة|إليك كيف|ابدأ بـ)/.test(text)) return "teaches";
  if (/\b(caution|risk|careful|beware|danger|warning|i'?m not sure|maybe we)\b/.test(t) || /(تحذير|مخاطرة|احذر)/.test(text)) return "doubts";
  if (/\b(the pattern|across|data|evidence|three reasons|because)\b/.test(t) || /(النمط|الأدلة|السبب)/.test(text)) return "analysis";
  return "asserts";
}

export interface GenerationMetadata {
  hook_style: HookStyle;
  ending_type: EndingType;
  stance: Stance;
  content_type: string;
  original_generated_text: string;
  source_signal_id: string | null;
  unsourced_numbers_removed: number;
  unsourced_entities_removed: number;
}

/**
 * The full metadata block for an `aura_generated` insert. Spread this into
 * every such insert; `originalText` is the text as generated, before any edit.
 */
export function generationMetadata(
  originalText: string,
  opts: {
    contentType?: string | null;
    signalId?: string | null;
    unsourcedRemoved?: number | null;
    unsourcedEntitiesRemoved?: number | null;
  } = {},
): GenerationMetadata {
  const text = String(originalText ?? "");
  return {
    hook_style: hookStyleOf(text),
    ending_type: endingTypeOf(text),
    stance: stanceOf(text),
    content_type: (opts.contentType ?? "").trim() || "post",
    original_generated_text: text,
    source_signal_id: opts.signalId || null,
    unsourced_numbers_removed: Number(opts.unsourcedRemoved) > 0 ? Number(opts.unsourcedRemoved) : 0,
    unsourced_entities_removed:
      Number(opts.unsourcedEntitiesRemoved) > 0 ? Number(opts.unsourcedEntitiesRemoved) : 0,
  };
}

/**
 * The content fingerprint as reported by the generator plus the request
 * parameters the client already chose. A column is only ever set when a real,
 * non-empty value exists — never an empty string, never a placeholder.
 */
export function fingerprintFields(opts: {
  endingType?: unknown;
  hookStyle?: unknown;
  frameworkType?: unknown;
  theme?: unknown;
}): Record<string, string> {
  const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const out: Record<string, string> = {};
  const ending = clean(opts.endingType);
  const hook = clean(opts.hookStyle);
  const framework = clean(opts.frameworkType);
  const theme = clean(opts.theme);
  if (ending) out.ending_type = ending;
  if (hook) out.hook_style = hook;
  if (framework && framework !== "auto") out.framework_type = framework;
  if (theme) out.theme = theme;
  return out;
}

function generationMetadataLegacyUnused(
  originalText: string,
  opts: {
    contentType?: string | null;
    signalId?: string | null;
    unsourcedRemoved?: number | null;
    unsourcedEntitiesRemoved?: number | null;
  } = {},
): GenerationMetadata {
  const text = String(originalText ?? "");
  return {
    hook_style: hookStyleOf(text),
    ending_type: endingTypeOf(text),
    stance: stanceOf(text),
    content_type: (opts.contentType ?? "").trim() || "post",
    original_generated_text: text,
    source_signal_id: opts.signalId || null,
    unsourced_numbers_removed: Number(opts.unsourcedRemoved) > 0 ? Number(opts.unsourcedRemoved) : 0,
    unsourced_entities_removed:
      Number(opts.unsourcedEntitiesRemoved) > 0 ? Number(opts.unsourcedEntitiesRemoved) : 0,
  };
}
