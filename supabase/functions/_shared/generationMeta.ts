/**
 * Generation metadata for every post Aura writes.
 *
 * Labels are chosen from FIXED vocabularies, never invented per generation,
 * and they are read off the text that was actually produced — a post ending in
 * a question is labelled `question`, always. Nothing here is optional: when a
 * value cannot be read we fall back to the vocabulary's neutral member so the
 * repetition machinery never sees a null.
 */

// One vocabulary for the whole system — see `_shared/voiceVocab.ts`. Generation
// must speak the same seven labels the classifier and the CHECK constraints do,
// otherwise the Variation engine sees one pattern split across two names.
import { ENDING_TYPES, HOOK_STYLES } from "./voiceVocab.ts";

export const HOOK_VOCAB = HOOK_STYLES;
export type HookStyle = (typeof HOOK_VOCAB)[number];

export const ENDING_VOCAB = ENDING_TYPES;
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
  if (!line) return "other";
  // An opening line that ends in a question mark is a question hook. No exceptions.
  if (/[?؟]$/.test(line)) return "question";
  if (hasDigit(line)) return "number_first";
  if (/\b(delighted|pleased|proud to announce|excited to (announce|share)|honoured|honored|thrilled|announcing)\b/i.test(line) ||
      /(يسعدني|بكل فخر|نعلن)/.test(line)) return "announcement";
  if (/\b(i (?:was wrong|got it wrong|used to|never|failed|admit)|i'?ve been wrong|confession)\b/i.test(line) ||
      /(أعترف|كنت مخطئاً|أخطأت)/.test(line)) return "experience_led";
  if (/\b(most|everyone|nobody|no one|stop|forget|wrong|myth|but not|isn'?t)\b/i.test(line) ||
      /(لا أحد|معظم|توقف|ليس)/.test(line)) return "contrarian_claim";
  if (/\b(i|we|my|our)\b/i.test(line) && /\b(was|were|had|walked|sat|stood|remember|arrived)\b/i.test(line)) return "short_story";
  if (/(كنت|جلست|وقفت|حين|عندما)/.test(line)) return "short_story";
  if (/^\s*(i|we|my|our)\b/i.test(line)) return "experience_led";
  return "contrarian_claim";
}

/** How the piece closes. */
export function endingTypeOf(text: string): EndingType {
  const line = lastLine(text || "");
  if (!line) return "suspended";
  // Text that ends in a question mark is a question ending. No exceptions.
  if (/[?؟]$/.test(line)) return "question";
  if (/[=＝]|\s\+\s|\s×\s/.test(line)) return "equation";
  if (/\b(comment|share|follow|dm|message me|let me know|tell me)\b/i.test(line) ||
      /(شاركني|تابعني|علّق)/.test(line)) return "cta";
  if (hasDigit(line)) return "number";
  if (/\b(isn'?t about|not about|the real (?:question|problem)|that'?s not|it'?s not)\b/i.test(line) ||
      /(ليست عن|المسألة ليست|السؤال الحقيقي)/.test(line)) return "reframe";
  if (/\b(lesson|takeaway|in short|that'?s why)\b/i.test(line) || /(الخلاصة|الدرس)/.test(line)) return "equation";
  return "suspended";
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
  };
}
