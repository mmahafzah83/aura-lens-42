/**
 * A voice profile describes HOW a member writes — never WHAT is true.
 *
 * Two rots are handled here:
 *   1. Style fields used to carry concrete facts ("uses specific numbers as
 *      turning points (45 million riyal, 85%)"). The generator then reproduced
 *      those figures as if they were sourced. Every style field is stripped of
 *      figures, currency, percentages, dates and organisation names before it
 *      is persisted or read into a prompt.
 *   2. Style fields used to carry ending mandates ("ends with a provocative
 *      question"), which locked every post into the same close. Mandates are
 *      lifted out into `allowed_endings`, a rotatable set.
 *
 * Pure functions only: the live write path, the read path and the backfill all
 * share exactly this behaviour.
 */

export const ENDING_VOCAB = [
  "hanging_line",
  "equation",
  "number",
  "reframe",
  "question",
  "signature",
] as const;
export type EndingType = (typeof ENDING_VOCAB)[number];

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

export const STANCE_VOCAB = ["asserts", "story", "teaches", "doubts", "analysis"] as const;
export type Stance = (typeof STANCE_VOCAB)[number];

/** Arabic-Indic digits normalised so one set of patterns covers both scripts. */
export function toWesternDigits(text: string): string {
  return String(text ?? "").replace(/[٠-٩۰-۹]/g, (d) => {
    const code = d.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}

const DIGIT = "[0-9٠-٩۰-۹]";

const ORG_SUFFIX =
  "(?:Inc|Inc\\.|LLC|Ltd|Ltd\\.|PLC|Corp|Corp\\.|Corporation|Company|Co\\.|Group|Holdings|Bank|Ministry|Authority|University|Institute|Foundation|Consulting|Partners|Aramco|Airlines)";

/**
 * Every concrete fact a style field must never carry. Order matters: the
 * richest shapes (parentheticals, amounts with units) go first so the generic
 * digit sweep only ever sees leftovers.
 */
const FACT_PATTERNS: RegExp[] = [
  // Parentheticals or brackets that contain a figure — the classic leak shape.
  new RegExp(`[\\(\\[（][^\\)\\]）]*${DIGIT}[^\\)\\]）]*[\\)\\]）]`, "g"),
  // Currency amounts, either side of the figure, both scripts.
  new RegExp(`(?:[$€£¥]|SAR|AED|USD|EUR|GBP|ر\\.?س)\\s*${DIGIT}[\\d٠-٩۰-۹,.]*\\s*(?:million|billion|thousand|k|m|bn|مليون|مليار|ألف)?`, "gi"),
  new RegExp(`${DIGIT}[\\d٠-٩۰-۹,.]*\\s*(?:million|billion|thousand|trillion|k|m|bn|مليون|مليار|ألف|تريليون)?\\s*(?:riyals?|ريال|dollars?|دولار|euros?|يورو|pounds?|درهم|SAR|AED|USD)`, "gi"),
  // Percentages.
  new RegExp(`${DIGIT}[\\d٠-٩۰-۹,.]*\\s*(?:%|٪|per\\s?cent|percent|بالمئة|في\\s?المئة|بالمائة)`, "gi"),
  // Dates: ISO, slashed, month names, bare years.
  /\b\d{4}-\d{2}-\d{2}\b/g,
  /\b\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4}\b/g,
  /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b\s*\d{0,4}/gi,
  /\b(?:يناير|فبراير|مارس|أبريل|مايو|يونيو|يوليو|أغسطس|سبتمبر|أكتوبر|نوفمبر|ديسمبر)\b\s*[0-9٠-٩]{0,4}/g,
  new RegExp(`\\b(?:19|20)${DIGIT}{2}\\b`, "g"),
  // Multiples and scale words attached to a figure.
  new RegExp(`${DIGIT}[\\d٠-٩۰-۹,.]*\\s*(?:x|×|أضعاف|ضعف)`, "gi"),
  // Named organisations: capitalised name plus a corporate suffix.
  new RegExp(`\\b(?:[A-Z][\\w&'-]*\\s+){0,3}${ORG_SUFFIX}\\b`, "g"),
  new RegExp(`\\b${ORG_SUFFIX}\\s+(?:of\\s+)?(?:[A-Z][\\w&'-]*\\s*){1,3}`, "g"),
  // Arabic organisation heads plus the following one or two words.
  /(?:شركة|وزارة|هيئة|بنك|جامعة|مؤسسة|مجموعة)\s+\S+(?:\s+\S+)?/g,
  // Any remaining bare figure.
  new RegExp(`${DIGIT}[\\d٠-٩۰-۹,.]*`, "g"),
];

/** Whitespace and punctuation left behind once facts are cut out. */
function tidy(text: string): string {
  return text
    .replace(/[\(\[（][\s،,.-]*[\)\]）]/g, "")
    .replace(/\s*،\s*،+/g, "، ")
    .replace(/\s*,\s*,+/g, ", ")
    .replace(/\s+([,.،؛;:])/g, "$1")
    .replace(/([,،])\s*([.؟?!])/g, "$2")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*[-–—]\s*$/g, "")
    .replace(/[\s,،;؛]+$/g, "")
    .trim();
}

/**
 * Strip every concrete fact from a style observation, keeping the observation.
 * "uses specific numbers as turning points (45 million riyal, 85%)" becomes
 * "uses specific numbers as turning points".
 */
export function sanitizeStyleText(input: unknown): string {
  let text = typeof input === "string" ? input : "";
  if (!text.trim()) return "";
  for (const re of FACT_PATTERNS) text = text.replace(re, " ");
  return tidy(text);
}

export function sanitizeStyleList(input: unknown): string[] {
  const list = Array.isArray(input) ? input : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    const clean = sanitizeStyleText(typeof raw === "string" ? raw : String(raw ?? ""));
    if (clean.length < 3) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

/** Ending mandates, mapped onto the controlled ending vocabulary. */
const ENDING_MANDATES: { ending: EndingType; re: RegExp }[] = [
  { ending: "question", re: /(?:always\s+)?(?:ends?|closes?|finishes?|closing)\s+(?:the\s+\w+\s+)?with\s+(?:a|an|the)?\s*[\w\s-]*question[^.،؛;]*/gi },
  { ending: "question", re: /(?:ي|ت)(?:ختم|نهي)[^.،؛;]*بسؤال[^.،؛;]*/g },
  { ending: "signature", re: /(?:ends?|closes?)\s+with\s+(?:a|an|the)?\s*(?:signature\s+line|sign-?off|call\s+to\s+action|cta)[^.،؛;]*/gi },
  { ending: "signature", re: /(?:ي|ت)(?:ختم|نهي)[^.،؛;]*(?:بتوقيع|بعبارة توقيع|بدعوة للتفاعل)[^.،؛;]*/g },
  { ending: "number", re: /(?:ends?|closes?)\s+with\s+(?:a|an|the)?\s*(?:number|figure|statistic)[^.،؛;]*/gi },
  { ending: "number", re: /(?:ي|ت)(?:ختم|نهي)[^.،؛;]*برقم[^.،؛;]*/g },
  { ending: "reframe", re: /(?:ends?|closes?)\s+with\s+(?:a|an|the)?\s*re-?frame[^.،؛;]*/gi },
  { ending: "reframe", re: /(?:ي|ت)(?:ختم|نهي)[^.،؛;]*بإعادة\s*تأطير[^.،؛;]*/g },
  { ending: "equation", re: /(?:ends?|closes?)\s+with\s+(?:a|an|the)?\s*(?:equation|formula|takeaway)[^.،؛;]*/gi },
  { ending: "equation", re: /(?:ي|ت)(?:ختم|نهي)[^.،؛;]*(?:بمعادلة|بخلاصة)[^.،؛;]*/g },
  { ending: "hanging_line", re: /(?:ends?|closes?)\s+with\s+(?:a|an|the)?\s*(?:hanging|single|one-?line|short)\s+line[^.،؛;]*/gi },
  { ending: "hanging_line", re: /(?:ي|ت)(?:ختم|نهي)[^.،؛;]*بجملة\s*(?:معلقة|قصيرة|واحدة)[^.،؛;]*/g },
];

/**
 * Pull ending mandates out of a style entry. The entry keeps everything that
 * was genuinely about style; the mandate becomes a rotatable ending value.
 */
export function extractEndingMandates(input: unknown): { cleaned: string; endings: EndingType[] } {
  let text = typeof input === "string" ? input : "";
  const endings: EndingType[] = [];
  if (!text.trim()) return { cleaned: "", endings };
  for (const { ending, re } of ENDING_MANDATES) {
    re.lastIndex = 0;
    if (re.test(text)) {
      re.lastIndex = 0;
      text = text.replace(re, " ");
      if (!endings.includes(ending)) endings.push(ending);
    }
  }
  return { cleaned: tidy(text), endings };
}

export interface StyleFields {
  tone: string;
  preferred_structures: string[];
  storytelling_patterns: string[];
  vocabulary_preferences: Record<string, unknown>;
  allowed_endings: EndingType[];
}

/**
 * The single gate for every write to a voice profile's style fields:
 * facts stripped, ending mandates lifted into `allowed_endings`, and a member
 * who mandated nothing is left free to use the whole ending vocabulary.
 */
export function sanitizeStyleFields(row: {
  tone?: unknown;
  preferred_structures?: unknown;
  storytelling_patterns?: unknown;
  vocabulary_preferences?: unknown;
  allowed_endings?: unknown;
}): StyleFields {
  const endings = new Set<EndingType>(
    (Array.isArray(row.allowed_endings) ? row.allowed_endings : [])
      .filter((e): e is EndingType => (ENDING_VOCAB as readonly string[]).includes(String(e))),
  );

  const cleanList = (input: unknown): string[] => {
    const out: string[] = [];
    for (const raw of Array.isArray(input) ? input : []) {
      const { cleaned, endings: found } = extractEndingMandates(String(raw ?? ""));
      found.forEach((e) => endings.add(e));
      const safe = sanitizeStyleText(cleaned);
      if (safe.length >= 3) out.push(safe);
    }
    return [...new Set(out)];
  };

  const toneMandate = extractEndingMandates(row.tone);
  toneMandate.endings.forEach((e) => endings.add(e));

  const vocabIn =
    row.vocabulary_preferences && typeof row.vocabulary_preferences === "object"
      ? { ...(row.vocabulary_preferences as Record<string, unknown>) }
      : {};
  for (const key of ["rhythm", "texture", "notes"]) {
    if (typeof vocabIn[key] === "string") {
      const m = extractEndingMandates(vocabIn[key] as string);
      m.endings.forEach((e) => endings.add(e));
      vocabIn[key] = sanitizeStyleText(m.cleaned);
    }
  }

  return {
    tone: sanitizeStyleText(toneMandate.cleaned),
    preferred_structures: cleanList(row.preferred_structures),
    storytelling_patterns: cleanList(row.storytelling_patterns),
    vocabulary_preferences: vocabIn,
    // Nothing detected means the member is not locked to one close.
    allowed_endings: endings.size ? [...endings] : [...ENDING_VOCAB],
  };
}

/** One ending per generation, drawn from what the profile allows. */
export function pickEnding(allowed: unknown): EndingType {
  const pool = (Array.isArray(allowed) ? allowed : [])
    .filter((e): e is EndingType => (ENDING_VOCAB as readonly string[]).includes(String(e)));
  const list = pool.length ? pool : [...ENDING_VOCAB];
  return list[Math.floor(Math.random() * list.length)];
}

export const ENDING_DIRECTIVE_EN: Record<EndingType, string> = {
  hanging_line: "Close on a short hanging line — a single unresolved sentence. Do NOT end with a question.",
  equation: "Close with a compact equation or formula that names the trade-off. Do NOT end with a question.",
  number: "Close on a single figure that already appears in the evidence. Do NOT end with a question.",
  reframe: "Close by reframing the opening claim into a different shape. Do NOT end with a question.",
  question: "Close with one specific, uncomfortable question.",
  signature: "Close with a short signature line in the writer's own register. Do NOT end with a question.",
};

export const ENDING_DIRECTIVE_AR: Record<EndingType, string> = {
  hanging_line: "اختم بجملة معلّقة قصيرة غير محسومة. لا تختم بسؤال.",
  equation: "اختم بمعادلة مختصرة تسمّي المفاضلة. لا تختم بسؤال.",
  number: "اختم برقم واحد وارد فعلاً في الأدلة. لا تختم بسؤال.",
  reframe: "اختم بإعادة تأطير للادعاء الافتتاحي. لا تختم بسؤال.",
  question: "اختم بسؤال واحد محدد وغير مريح.",
  signature: "اختم بجملة توقيع قصيرة بصوت الكاتب. لا تختم بسؤال.",
};
