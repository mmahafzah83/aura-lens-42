/**
 * ONE Arabic voice for every model-written result: the instruction block the
 * model is given, and the gate the answer must pass. Pure — no Deno, no
 * network — so vitest imports it directly.
 */

export const ARABIC_VOICE_BLOCK = `LANGUAGE — write every value in Arabic, as a careful native Saudi professional would write it first in Arabic. You are not translating: decide what you want to say, then say it in Arabic.
REGISTER: contemporary simple Arabic for a senior Saudi and Gulf reader, clear to a Levantine or Egyptian reader. Not dialect. Not ministry Arabic. It should sound like a sharp executive talking to a peer over coffee.
ADDRESS: speak to the reader as أنت, masculine singular, through the verb and the attached pronoun (تكتب، سجلّك، يراك السوق). Do NOT open sentences with the word «أنت». Use the standalone pronoun at most once in the whole output, and only for contrast.
SENTENCES: vary length between 6 and 20 words. Verb or subject first, active voice, one idea each. Put one short sentence beside a longer one. Never three parallel clauses in a row. End on the concrete point, a number, or the consequence.
VERBS OVER NOUNS: «تقيس الأثر» not «تقوم بقياس الأثر». No «تم», «يتم», «قام بـ». No passive when the doer is known.
NO «كـ» MEANING 'as': never «كمدير», «كمن», «كخبير», «كمرجع». Write «بوصفك مديرًا», or better, restructure: «يراك السوق مدير برامج…».
LATIN NAMES: company, product and programme names and acronyms stay in Latin letters and never take an attached Arabic letter. Not «وSPL», «بـEY», «لـZATCA», «الـPMO». Use a full preposition or a comma: «في NWC، ثم SPL، ثم ZATCA». Job titles are written in Arabic.
DIGITS: Western digits 0-9 only. A number never attaches to «و» or «الـ»; write small numbers after «و» in words («وثلاثة منشورات»). Write ranges as «من 16 إلى 20». Percentages as 40%.
PUNCTUATION: Arabic comma «،» and question mark «؟». No comma before «و» or «ثم». Quotes «». Tanween on the alif (مشروعًا). No decorative diacritics; add one only where a word would be misread.
TERMS: positioning = التموضع (at most twice). Standing = المكانة. The professional = المهني. The space nobody holds = المساحة التي لم يشغلها أحد. Signal = إشارة. Capability levels: Formation = التكوين, Independence = الاستقلال, Reference = المرجعية. Subjects a person is known for = «يُعرف بها» — never «يملك الموضوع».
BANNED — never write: يُعدّ، في ظلّ، من خلال، يسلّط الضوء، بشكل followed by an adjective، لا شكّ أن، تجدر الإشارة، جدير بالذكر، في عالم اليوم، مما يعزّز، بالإضافة إلى ذلك، على صعيد آخر، يلعب دورًا، في نهاية المطاف، حيث as a filler، رائد فكر، قائد فكر، العلامة الشخصية، رحلة، مشهد، تسخير، تمكين، الارتقاء، سلس، متين، على حدّ سواء، السلطة. No Levantine or Egyptian colloquial words (شو، ليش، هيك، كتير، بس، كمان، عشان، زي).
CALQUE TEST on every sentence: would a native who never saw English have written it? If it mirrors an English idiom (seat at the table, owns the space, moves the needle), rewrite the idea.
ARCHETYPE NAME in Arabic: a definite noun followed by a definite adjective, two words, e.g. «المُصلح الهادئ». The noun comes from what THIS person repeatedly does in their own material — a specific kind of work, not a job family. Banned nouns: المهندس، المعماري، الخبير، القائد، المنفّذ، المستشار، الرائد، صاحب الرؤية. Banned adjectives: الاستراتيجي، الواضح، المتميّز، الفعّال، الناجح. If the name would fit half of all senior professionals, choose again.
QUOTES from the person's own posts stay verbatim in the language they were written in. Never translate or tidy a quote.
JSON keys and any UPPERCASE section marker lines stay exactly as specified, in English.`;

/** Whole words / phrases. Matched with diacritics removed on both sides. */
export const ARABIC_BANNED = [
  "تم", "يتم", "يُعدّ", "في ظلّ", "من خلال", "يسلّط الضوء", "لا شكّ أن", "تجدر الإشارة",
  "جدير بالذكر", "في عالم اليوم", "مما يعزّز", "بالإضافة إلى ذلك", "على صعيد آخر",
  "يلعب دورًا", "في نهاية المطاف", "رائد فكر", "قائد فكر", "العلامة الشخصية", "علامتك الشخصية",
  "رحلة", "رحلتك", "مشهد", "تسخير", "تمكين", "الارتقاء", "سلس", "متين", "على حدّ سواء", "السلطة",
  "شو", "ليش", "هيك", "كتير", "بس", "كمان", "عشان", "زي",
];

export const ARCHETYPE_BANNED_NOUNS = ["المهندس", "المعماري", "الخبير", "القائد", "المنفّذ", "المستشار", "الرائد", "صاحب الرؤية"];
export const ARCHETYPE_BANNED_ADJECTIVES = ["الاستراتيجي", "الواضح", "المتميّز", "الفعّال", "الناجح"];
const KAF_AS = ["كمدير", "كمديرة", "كخبير", "كقائد", "كمستشار", "كمرجع", "كمن", "كشخص", "كمهني", "كشريك", "كمسؤول"];

export type ArabicCheck =
  | "arabic_ratio" | "arabic_indic_digits" | "banned_word" | "kaf_as" | "glued_latin"
  | "glued_digit" | "anta_openers" | "archetype_english" | "archetype_banned";

export type ArabicGateDetail = { check: ArabicCheck; field: string; word?: string; fragment?: string };

/** Up to 60 characters of the value around an offending position. */
function frag(v: string, at: number): string {
  const start = Math.max(0, at - 25);
  return v.slice(start, start + 60).trim();
}

/**
 * Mechanical repair of model-written Arabic, applied before the gate:
 * «و» + Latin/digit → space after «و»; «بـ لـ كـ الـ» + Latin/digit → space
 * after the tatweel; Arabic-Indic digits → Western. Nothing else changes.
 */
export function repairArabic(value: string): string {
  return value
    .replace(/(^|[^\u0600-\u06FF])و(?=[A-Za-z0-9])/gu, "$1و ")
    .replace(/(^|[^\u0600-\u06FF])(بـ|لـ|كـ|الـ)(?=[A-Za-z0-9])/gu, "$1$2 ")
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

/** repairArabic on every string inside an object, except skipped top-level keys. */
export function repairValues<T>(values: T, skipKeys: string[] = []): T {
  const skip = new Set(skipKeys);
  const walk = (v: unknown): unknown =>
    typeof v === "string" ? repairArabic(v)
    : Array.isArray(v) ? v.map(walk)
    : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
    : v;
  if (!values || typeof values !== "object") return values;
  return Object.fromEntries(
    Object.entries(values as Record<string, unknown>).map(([k, v]) => [k, skip.has(k) ? v : walk(v)]),
  ) as T;
}

const AR = "\\u0600-\\u06FF";
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Strip harakat, tanween and the superscript alif so «يُعدّ» matches «يعد». */
const bare = (s: string) => s.replace(/[\u064B-\u0652\u0670]/g, "");
const wholeWord = (text: string, phrase: string) =>
  new RegExp(`(^|[^${AR}A-Za-z])${esc(bare(phrase))}($|[^${AR}A-Za-z])`, "u").test(bare(text));

export function arabicShare(text: string): number {
  const ar = (text.match(/[\u0600-\u06FF]/g) ?? []).length;
  const la = (text.match(/[A-Za-z]/g) ?? []).length;
  return ar + la === 0 ? 0 : ar / (ar + la);
}

/** Every string under a key, nested arrays and objects flattened. */
function flatten(values: Record<string, unknown>, skip: Set<string>): [string, string][] {
  const out: [string, string][] = [];
  const walk = (k: string, v: unknown) => {
    if (typeof v === "string") out.push([k, v]);
    else if (Array.isArray(v)) v.forEach((x, i) => walk(`${k}[${i}]`, x));
    else if (v && typeof v === "object") for (const [kk, vv] of Object.entries(v)) walk(`${k}.${kk}`, vv);
  };
  for (const [k, v] of Object.entries(values)) if (!skip.has(k)) walk(k, v);
  return out;
}

/** Prose = enough letters to judge. A short label may carry a Latin name. */
const PROSE_MIN_LETTERS = 12;

export function arabicGateDetail(
  values: Record<string, unknown>,
  opts: { skipKeys?: string[] } = {},
): ArabicGateDetail | null {
  const skip = new Set(opts.skipKeys ?? []);
  const archetypes = ["archetype", "primary_archetype", "secondary_archetype"].filter(
    (k) => !skip.has(k) && typeof values[k] === "string",
  );
  for (const k of archetypes) {
    if (/^\s*The\s/.test(values[k] as string)) return { check: "archetype_english", field: k };
  }
  for (const k of archetypes) {
    const words = bare(values[k] as string).split(/\s+/);
    const name = bare(values[k] as string);
    for (const b of [...ARCHETYPE_BANNED_NOUNS, ...ARCHETYPE_BANNED_ADJECTIVES]) {
      const bb = bare(b);
      if (bb.includes(" ") ? name.includes(bb) : words.includes(bb)) return { check: "archetype_banned", field: k, word: b };
    }
  }

  const all = flatten(values, skip);
  for (const [k, v] of all) {
    const letters = (v.match(/[\u0600-\u06FFA-Za-z]/g) ?? []).length;
    if (letters >= PROSE_MIN_LETTERS && arabicShare(v) < 0.6) return { check: "arabic_ratio", field: k };
  }
  for (const [k, v] of all) {
    const m = /[\u0660-\u0669]/.exec(v);
    if (m) return { check: "arabic_indic_digits", field: k, fragment: frag(v, m.index) };
  }
  for (const [k, v] of all) {
    for (const w of ARABIC_BANNED) if (wholeWord(v, w)) return { check: "banned_word", field: k, word: w, fragment: frag(v, Math.max(0, v.indexOf(w))) };
    if (new RegExp(`(^|[^${AR}])بشكل\\s+[${AR}]`, "u").test(v)) return { check: "banned_word", field: k, word: "بشكل" };
    if (new RegExp(`(^|[^${AR}])قام\\s+ب`, "u").test(v)) return { check: "banned_word", field: k, word: "قام بـ" };
  }
  for (const [k, v] of all) for (const w of KAF_AS) if (wholeWord(v, w)) return { check: "kaf_as", field: k, word: w, fragment: frag(v, Math.max(0, v.indexOf(w))) };
  // After repair: only an Arabic letter (not the tatweel) fused to a Latin letter.
  for (const [k, v] of all) {
    const m = /[\u0600-\u063F\u0641-\u06FF][A-Za-z]/.exec(v);
    if (m) return { check: "glued_latin", field: k, fragment: frag(v, m.index) };
  }
  for (const [k, v] of all) {
    const m = new RegExp(`(^|[^${AR}])(و|الـ|ال)[0-9]`, "u").exec(v);
    if (m) return { check: "glued_digit", field: k, fragment: frag(v, m.index) };
  }
  let openers = 0;
  for (const [, v] of all) {
    for (const s of v.split(/[.؟!?\n]/)) if (/^\s*أنت\s/.test(s)) openers++;
  }
  if (openers > 2) return { check: "anta_openers", field: "*" };
  return null;
}

/** The name of the first failed check, or null when usable. */
export function arabicGate(
  values: Record<string, string | string[] | null> | Record<string, unknown>,
  opts: { skipKeys?: string[] } = {},
): ArabicCheck | null {
  return arabicGateDetail(values as Record<string, unknown>, opts)?.check ?? null;
}

const WHAT: Record<ArabicCheck, string> = {
  arabic_ratio: "is not written in Arabic. Write it in Arabic",
  arabic_indic_digits: "uses Arabic-Indic digits. Use Western digits (0-9) only",
  banned_word: "uses a banned word or phrase. Remove it and every other banned word; rewrite the idea",
  kaf_as: "uses «كـ» to mean 'as' before a role. Restructure the sentence",
  glued_latin: "attaches an Arabic letter directly to a Latin name. Use a full preposition or a comma before the name",
  glued_digit: "attaches «و» or «الـ» directly to a digit. Write the number in words or restructure",
  anta_openers: "opens more than two sentences with «أنت». Address the reader through the verb and attached pronoun",
  archetype_english: "is in English. Write it in Arabic as a definite noun followed by a definite adjective",
  archetype_banned: "uses a banned archetype noun or adjective. Choose a name from what this person repeatedly does",
};

/** The one correction message: names the failed check. */
export function arabicCorrectionText(d: ArabicGateDetail): string {
  const where = d.field === "*" ? "The text" : `"${d.field}"`;
  const word = d.word ? ` («${d.word}»)` : "";
  const quote = d.fragment ? ` Offending text: «${d.fragment.slice(0, 60)}».` : "";
  return `That was not usable. Failed check: ${d.check}. ${where}${word} ${WHAT[d.check]}.${quote} Apply every rule of the LANGUAGE block again.`;
}
