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
PUNCTUATION: Arabic comma «،» and question mark «؟». No comma before «و» or «ثم». Quotes «». Tanween on the alif (مشروعاً). No decorative diacritics; add one only where a word would be misread.
Write tanween fath on the alif: دليلاً، مؤشراً، شيئاً.
TERMS: positioning = التموضع (at most twice). Standing = المكانة. The professional = المهني. The space nobody holds = المساحة التي لم يشغلها أحد. Signal = إشارة. Capability levels: Formation = مشارك, Independence = مستقل, Reference = مرجع. Subjects a person is known for = «يُعرف بها» — never «يملك الموضوع».
BANNED — never write: يُعدّ، في ظلّ، من خلال، يسلّط الضوء، بشكل followed by an adjective، لا شكّ أن، تجدر الإشارة، جدير بالذكر، في عالم اليوم، مما يعزّز، بالإضافة إلى ذلك، على صعيد آخر، يلعب دورًا، في نهاية المطاف، حيث as a filler، رائد فكر، قائد فكر، العلامة الشخصية، رحلة، مشهد، تسخير، تمكين، الارتقاء، سلس، متين، على حدّ سواء، السلطة. No Levantine or Egyptian colloquial words (شو، ليش، هيك، كتير، بس، كمان، عشان، زي).
CALQUE TEST on every sentence: would a native who never saw English have written it? If it mirrors an English idiom (seat at the table, owns the space, moves the needle), rewrite the idea.
ARCHETYPE NAME in Arabic: a definite noun followed by a definite adjective, two words, e.g. «المُصلح الهادئ». The noun comes from what THIS person repeatedly does in their own material — a specific kind of work, not a job family. Banned nouns: المهندس، المعماري، الخبير، القائد، المنفّذ، المستشار، الرائد، صاحب الرؤية. Banned adjectives: الاستراتيجي، الواضح، المتميّز، الفعّال، الناجح. The noun names what the member actually is or does at his real level, read from his current role and record (مؤسس، أستاذ، مدير، باني شيء محدّد، مستشار لنوع مسمّى من العملاء); the adjective names the one thing his evidence shows that distinguishes him. Never a passive or junior noun for a senior person: المراقب، المتابع، المستمع، المتعلّم، الطالب، المدرّس، المعلّم. If the name would fit half of all senior professionals, choose again.
QUOTES from the person's own posts stay verbatim in the language they were written in. Never translate or tidy a quote.
JSON keys and any UPPERCASE section marker lines stay exactly as specified, in English.
READER: Write as a careful Saudi professional writes to a peer: contemporary, plain, confident. Gulf reader first, clear to any Arab reader. Not dialect, not ministry Arabic, not translated English. Short sentences. Say the thing directly.
PRODUCT TERMS (always): the read or report = «ملفك» or «ملف الهوية المهنية». The LinkedIn profile = «صفحتك». Standing = «مكانتك». Position in the market = «موقعك». Evidence = «دليل» / «أدلة». What the member saves = «ما حفظته». Signal = «إشارة». The product name is KnownBy in Latin letters; the score is Imprint in Latin letters. Stage names: «متابع · مستكشف · استراتيجي · صاحب رأي · مرجع». Never write «الحضور المهني», «العلامة الشخصية», «قائد فكر», «أورا» or "Aura".
TECHNICAL WORDS: use the Arabic word when one is in common professional use («الذكاء الاصطناعي», «لوحة المؤشرات», «مؤشرات الأداء»). Keep a Latin term only for a proper name or when no accepted Arabic exists. Never attach «الـ», «لـ», «بـ», «كـ» to a Latin word.
INDUSTRIES AND SECTORS: write industry and sector names in Arabic inside running Arabic text, even when the stored value is English: «الطاقة والمرافق», «الخدمات المالية», «القطاع الحكومي». Do not leave an English industry or sector label inside an Arabic sentence.
STANDALONE TECHNICAL TOKENS: never leave AI, KPI, KPIs, dashboard, roadmap or stakeholders in Latin letters inside Arabic output. Write «الذكاء الاصطناعي», «مؤشرات الأداء», «لوحة المؤشرات», «خارطة الطريق» and «أصحاب المصلحة». Proper names such as LinkedIn, KnownBy and Imprint, and company or product names, stay in Latin letters.
BANNED CONSTRUCTIONS: «كـ» meaning "as" in any form (rewrite with a direct object or «بوصفه»); «تم» / «يتم» + verbal noun; «من خلال»; «يمكنك»; «قم بـ»; «الخاص بك»; «ليس فقط … بل»; the contrast skeleton «ليس X. بل Y» more than once in a text; openers «معظم…», «في عالم اليوم», «لا يخفى على أحد», «في ظل»; «تملك فرصة أن»; empty paired aphorisms; arrows and decorative symbols; Arabic-Indic digits (use 0-9).
DIALECT: no Levantine or Egyptian words («مش», «ما حد», «يحكي», «هيك», «ليش», «عشان», «كتير», «بدّي») in interface text, reads, reports, emails or notifications. Post drafts follow the member's own measured voice and samples; if the samples are not dialect, the draft is not dialect.
ORGANISATIONS: universities, ministries, authorities and companies that have a common Arabic name are written in Arabic inside Arabic sentences: «جامعة الملك سعود», «أرامكو السعودية», «وزارة المالية». Keep Latin letters only for a brand with no Arabic form, and for the member's own name and headline, which are shown exactly as he wrote them.
DASHES: never use an em dash «—» or an en dash «–» in Arabic prose. Use a colon or commas. Join the items of a list with «و»: «وكيل الجامعة للمشاريع، ووكيلها للمرافق والتشغيل، وعمدة الدرعية».
SENIORITY OF LABELS: any label or archetype that describes the member must match or exceed his real seniority. Never «مدرّس» or «معلّم» for university faculty: write «أستاذ» or «أكاديمي». Never a label that sounds junior for a senior person.
SECTION BODIES: the body of a section never starts with that section's own title. Start with the point itself.
LOANWORDS: no loanword when a normal Arabic word exists: not «الأكاديميا», write «العمل الأكاديمي» or «الجامعة».
NUMBER AGREEMENT: a number from 11 to 99 takes a singular accusative noun: «41 عاماً», «25 مشروعاً». Write «أيٍّ منها», not «أيّ منها».
GOOD: «يراك السوق مدير برامج رقمية يعمل داخل جهات حكومية كبيرة.» / «مساحتك: ما يحدث في الشهر الثالث بعد الإطلاق. لم يشغلها أحد.» / «عملت 41 عاماً في جامعة الملك سعود.»
BAD: «لا تنظر إلى المشروع كملف تقني، بل كقرار إداري.» (uses «كـ» twice and the «ليس… بل» skeleton). Write instead: «لا ترى المشروع ملفاً تقنياً، بل قراراً إدارياً.»
BAD: «عمل 41 سنة في King Saud University» and «مناصب كبيرة — وكيل جامعة، عمدة الدرعية — لكن». Write instead: «عملت 41 عاماً في جامعة الملك سعود، وتولّيت مناصب كبيرة: وكيل الجامعة وعمدة الدرعية. لكن».`;

/** The block appended to a system prompt only when the output is Arabic. */
export const withArabicVoice = (system: string, lang: string | null | undefined): string =>
  lang === "ar" ? `${system}\n\n${ARABIC_VOICE_BLOCK}` : system;

/** Whole words / phrases. Matched with diacritics removed on both sides. */
export const ARABIC_BANNED = [
  "تم", "يتم", "يُعدّ", "في ظلّ", "من خلال", "يسلّط الضوء", "لا شكّ أن", "تجدر الإشارة",
  "جدير بالذكر", "في عالم اليوم", "مما يعزّز", "بالإضافة إلى ذلك", "على صعيد آخر",
  "يلعب دورًا", "في نهاية المطاف", "رائد فكر", "قائد فكر", "العلامة الشخصية", "علامتك الشخصية",
  "رحلة", "رحلتك", "مشهد", "تسخير", "تمكين", "الارتقاء", "سلس", "متين", "على حدّ سواء", "السلطة",
  "شو", "ليش", "هيك", "كتير", "بس", "كمان", "عشان", "زي",
  "مش", "ما حد", "يحكي", "بدي", "بدّي",
  "يمكنك", "الخاص بك", "الخاصة بك", "ليس فقط", "تملك فرصة", "الحضور المهني", "أورا", "Aura",
];

/** Sentence openers that mark generic Arabic. */
export const ARABIC_BANNED_OPENERS = ["معظم", "في عالم اليوم", "لا يخفى على أحد", "في ظل"];

export const ARCHETYPE_BANNED_NOUNS = ["المهندس", "المعماري", "الخبير", "القائد", "المنفّذ", "المستشار", "الرائد", "صاحب الرؤية"];
export const ARCHETYPE_BANNED_ADJECTIVES = ["الاستراتيجي", "الواضح", "المتميّز", "الفعّال", "الناجح"];
const KAF_AS = ["كمدير", "كمديرة", "كخبير", "كقائد", "كمستشار", "كمرجع", "كمن", "كشخص", "كمهني", "كشريك", "كمسؤول",
  "كملف", "كقرار", "كمشروع", "كأداة", "كفرصة", "كجزء", "كنتيجة", "كوسيلة", "كطريقة", "كمصدر", "كدليل", "كمفهوم", "كأولوية", "كشرط", "كعائق", "كرسالة", "كخطوة", "كحل", "كبديل", "كمثال", "كنقطة", "كأساس", "كمنصة", "كخدمة", "كمنتج", "كفريق", "كجهة", "كعميل", "كمحترف", "كمتخصص", "كصاحب", "كمؤسس", "كعضو"];

/** Words that begin with ك as a root letter or a particle — never «كـ» = 'as'. */
const KAF_ROOT = new Set(["كل", "كلا", "كلها", "كله", "كلهم", "كان", "كانت", "كانوا", "كما", "كذلك", "كذا", "كثير", "كثيرة", "كثيرا", "كثيراً",
  "كبير", "كبيرة", "كبار", "كتاب", "كتب", "كتابة", "كلمة", "كلمات", "كيف", "كم", "كأن", "كي", "كافة", "كامل", "كاملة", "كاملا", "كفاءة",
  "كمية", "كميات", "كمال", "كمبيوتر", "كمبيوترك", "كمان", "كمين", "كهرباء", "كلية", "كيان", "كوادر", "كفاية", "كسب", "كشف", "كلفة",
  "كلف", "كرسي", "كود", "كتلة", "كتابي", "كتابك", "كبرى", "كتابتك", "كلامك", "كلام", "كنت", "كن", "كأس", "كفى", "كرة", "كسر", "كميل"]);
/** True words starting «كم…» that are not «كـ» + noun; «كمالك» is not one of them. */
const KAF_REAL_PREFIX = [/^كمال(ي|ية|يات)?$/, /^كمي(ة|ات)$/, /^كمين$/, /^كمبيوتر/, /^كمان$/];
const KAF_TOKEN = /(^|[^\u0600-\u06FF])(ك[\u0600-\u06FF]+)/gu;
/** The first «كـ» used as 'as': a known form, «كـ» + noun of the م-pattern, or «كـ» before a Latin word. */
export function findKafAs(text: string): string | null {
  const t = text.replace(/[\u064B-\u0652\u0670]/g, "");
  const latin = /(^|[^\u0600-\u06FF])كـ\s*[A-Za-z]/u.exec(t);
  if (latin) return t.slice(latin.index, latin.index + 14).trim();
  for (const m of t.matchAll(KAF_TOKEN)) {
    const w = m[2];
    if (KAF_ROOT.has(w)) continue;
    const stem = w.slice(1);
    if (KAF_AS.includes(w)) return w;
    if (KAF_REAL_PREFIX.some((p) => p.test(w))) continue;
    if (stem.length >= 3 && stem.startsWith("م")) return w;
  }
  return null;
}

/** More than one «ليس … بل» contrast skeleton in one text. */
export function contrastSkeletons(text: string): number {
  return (text.match(/(^|[^\u0600-\u06FF]|و)ليس[^.؟!?\n]{0,90}?[.،,]?\s*بل(?=$|[^\u0600-\u06FF])/gu) ?? []).length;
}

export type ArabicCheck =
  | "arabic_ratio" | "arabic_indic_digits" | "banned_word" | "kaf_as" | "glued_latin"
  | "glued_digit" | "anta_openers" | "archetype_english" | "archetype_banned"
  | "banned_opener" | "latin_prefix" | "contrast_skeleton" | "latin_technical" | "english_sector"
  | "dash" | "latin_run" | "junior_label" | "title_repeat" | "loanword";

export type ArabicGateDetail = { check: ArabicCheck; field: string; word?: string; fragment?: string };

/** Up to 60 characters of the value around an offending position. */
function frag(v: string, at: number): string {
  const start = Math.max(0, at - 25);
  return v.slice(start, start + 60).trim();
}

/**
 * Mechanical repair of model-written Arabic, applied before the gate:
 * «و» + Latin/digit → space after «و»; «بـ لـ كـ الـ» + Latin/digit → space
 * after the tatweel; Arabic-Indic digits → Western; fathatan moves from the
 * preceding letter onto its alif. A fathatan after shadda stays untouched.
 */
export function normaliseArabicTanween(value: string): string {
  return value.replace(/([\u0621-\u064A])\u064B\u0627/g, "$1\u0627\u064B");
}

export function repairArabic(value: string): string {
  return normaliseArabicTanween(value)
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
  for (const [k, v] of all) {
    const w = findKafAs(v);
    if (w) return { check: "kaf_as", field: k, word: w, fragment: frag(v, Math.max(0, v.indexOf(w))) };
  }
  for (const [k, v] of all) {
    const o = openerIn(v);
    if (o) return { check: "banned_opener", field: k, word: o };
    const lp = LATIN_PREFIX.exec(v);
    if (lp) return { check: "latin_prefix", field: k, fragment: frag(v, lp.index) };
    const technical = LATIN_TECHNICAL.exec(v);
    if (technical) return { check: "latin_technical", field: k, word: technical[0], fragment: frag(v, technical.index) };
    const sector = englishSectorIn(v);
    if (sector) return { check: "english_sector", field: k, word: sector, fragment: frag(v, Math.max(0, v.indexOf(sector))) };
  }
  if (all.reduce((n, [, v]) => n + contrastSkeletons(v), 0) > 1) return { check: "contrast_skeleton", field: "*" };
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

const LATIN_PREFIX = /(^|[^\u0600-\u06FF])(الـ|لـ|بـ|كـ)\s*[A-Za-z]/u;
const LATIN_TECHNICAL = /\b(?:AI|KPIs?|dashboard|roadmap|stakeholders)\b/iu;
const ENGLISH_SECTORS = [
  "Energy & Utilities", "Energy and Utilities", "Financial Services", "Government Sector",
  "Public Sector", "Technology Sector", "Healthcare Sector",
];
function englishSectorIn(v: string): string | null {
  const lower = v.toLowerCase();
  return ENGLISH_SECTORS.find((sector) => lower.includes(sector.toLowerCase())) ?? null;
}
function openerIn(v: string): string | null {
  for (const s of v.split(/[.؟!?\n]/)) {
    const b = bare(s).trim();
    for (const o of ARABIC_BANNED_OPENERS) if (b.startsWith(bare(o))) return o;
  }
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
  banned_opener: "opens a sentence with a banned generic opener. Start with the concrete point",
  latin_prefix: "attaches «الـ», «لـ», «بـ» or «كـ» to a Latin word. Use a full preposition or restructure",
  contrast_skeleton: "uses the «ليس … بل» contrast more than once. Keep at most one; say the rest directly",
  latin_technical: "leaves a common technical term in Latin letters. Use the required Arabic professional term",
  english_sector: "leaves an industry or sector name in English inside Arabic prose. Write the sector name in Arabic",
  dash: "uses an em dash or en dash in Arabic prose. Use a colon or commas, and join list items with «و»",
  latin_run: "leaves an organisation or name in Latin letters inside an Arabic sentence. Write it with its common Arabic name",
  junior_label: "uses a junior or passive noun («مدرّس»، «معلّم»، «المراقب»، «المتابع»، «المستمع»، «المتعلّم»، «الطالب») in a label. Name what the member is or does at his real level. Use «أستاذ» or «أكاديمي», at or above the member's real seniority",
  title_repeat: "starts the section body with the section's own title. Start with the point itself",
  loanword: "uses the loanword «الأكاديميا». Write «العمل الأكاديمي» or «الجامعة»",
};

/** The one correction message: names the failed check. */
export function arabicCorrectionText(d: ArabicGateDetail): string {
  const where = d.field === "*" ? "The text" : `"${d.field}"`;
  const word = d.word ? ` («${d.word}»)` : "";
  const quote = d.fragment ? ` Offending text: «${d.fragment.slice(0, 60)}».` : "";
  return `That was not usable. Failed check: ${d.check}. ${where}${word} ${WHAT[d.check]}.${quote} Apply every rule of the LANGUAGE block again.`;
}

/* ── Two classes for the long results (cv-crosscheck, brand-assessment) ──
   HARD checks reject (the result is not Arabic at all). STYLE checks advise:
   they are recorded with the result, never trigger a retry. mirror-read keeps
   arabicGate / arabicGateDetail above, unchanged. */
export const ARABIC_HARD_CHECKS: ArabicCheck[] = ["arabic_ratio", "archetype_english"];
export const ARABIC_STYLE_CHECKS: ArabicCheck[] = [
  "banned_word", "kaf_as", "glued_latin", "glued_digit", "anta_openers", "archetype_banned", "arabic_indic_digits",
  "banned_opener", "latin_prefix", "contrast_skeleton", "latin_technical", "english_sector",
  "dash", "latin_run", "junior_label", "title_repeat", "loanword",
];

const ARCHETYPE_KEYS = ["archetype", "primary_archetype", "secondary_archetype"];

/** The first hard failure, or null. */
export function arabicHardFail(
  values: Record<string, unknown>,
  opts: { skipKeys?: string[] } = {},
): ArabicGateDetail | null {
  const skip = new Set(opts.skipKeys ?? []);
  for (const k of ARCHETYPE_KEYS) {
    if (!skip.has(k) && typeof values[k] === "string" && /^\s*The\s/.test(values[k] as string)) {
      return { check: "archetype_english", field: k };
    }
  }
  for (const [k, v] of flatten(values, skip)) {
    const letters = (v.match(/[\u0600-\u06FFA-Za-z]/g) ?? []).length;
    if (letters >= PROSE_MIN_LETTERS && arabicShare(v) < 0.6) return { check: "arabic_ratio", field: k };
  }
  return null;
}

/** Every style finding, not just the first. */
export function arabicStyleNotes(
  values: Record<string, unknown>,
  opts: { skipKeys?: string[]; allowLatin?: (string | null | undefined)[] } = {},
): ArabicGateDetail[] {
  const skip = new Set(opts.skipKeys ?? []);
  const out: ArabicGateDetail[] = [];
  for (const k of ARCHETYPE_KEYS) {
    if (skip.has(k) || typeof values[k] !== "string") continue;
    const name = bare(values[k] as string);
    const words = name.split(/\s+/);
    for (const b of [...ARCHETYPE_BANNED_NOUNS, ...ARCHETYPE_BANNED_ADJECTIVES]) {
      const bb = bare(b);
      if (bb.includes(" ") ? name.includes(bb) : words.includes(bb)) out.push({ check: "archetype_banned", field: k, word: b });
    }
  }
  const all = flatten(values, skip);
  let openers = 0;
  let skeletons = 0;
  for (const [k, v] of all) {
    const m = /[\u0660-\u0669]/.exec(v);
    if (m) out.push({ check: "arabic_indic_digits", field: k, fragment: frag(v, m.index) });
    for (const w of ARABIC_BANNED) if (wholeWord(v, w)) out.push({ check: "banned_word", field: k, word: w, fragment: frag(v, Math.max(0, v.indexOf(w))) });
    if (new RegExp(`(^|[^${AR}])بشكل\\s+[${AR}]`, "u").test(v)) out.push({ check: "banned_word", field: k, word: "بشكل" });
    if (new RegExp(`(^|[^${AR}])قام\\s+ب`, "u").test(v)) out.push({ check: "banned_word", field: k, word: "قام بـ" });
    const kw = findKafAs(v);
    if (kw) out.push({ check: "kaf_as", field: k, word: kw, fragment: frag(v, Math.max(0, v.indexOf(kw))) });
    const op = openerIn(v);
    if (op) out.push({ check: "banned_opener", field: k, word: op });
    const lp = LATIN_PREFIX.exec(v);
    if (lp) out.push({ check: "latin_prefix", field: k, fragment: frag(v, lp.index) });
    const technical = LATIN_TECHNICAL.exec(v);
    if (technical) out.push({ check: "latin_technical", field: k, word: technical[0], fragment: frag(v, technical.index) });
    const sector = englishSectorIn(v);
    if (sector) out.push({ check: "english_sector", field: k, word: sector, fragment: frag(v, Math.max(0, v.indexOf(sector))) });
    skeletons += contrastSkeletons(v);
    const gl = /[\u0600-\u063F\u0641-\u06FF][A-Za-z]/.exec(v);
    if (gl) out.push({ check: "glued_latin", field: k, fragment: frag(v, gl.index) });
    const gd = new RegExp(`(^|[^${AR}])(و|الـ|ال)[0-9]`, "u").exec(v);
    if (gd) out.push({ check: "glued_digit", field: k, fragment: frag(v, gd.index) });
    for (const s of v.split(/[.؟!?\n]/)) if (/^\s*أنت\s/.test(s)) openers++;
  }
  if (openers > 2) out.push({ check: "anta_openers", field: "*" });
  if (skeletons > 1) out.push({ check: "contrast_skeleton", field: "*" });
  out.push(...arabicQualityNotes(values, opts));
  return out;
}

/* ── Batch 14b: quality detectors for model-written Arabic ────────────────
   Advisory: each finding feeds the one existing correction call; none of
   them rejects a result on its own. */
const hasArabic = (v: string) => /[\u0600-\u06FF]/.test(v);
const DASH = /[\u2013\u2014]/;
const LATIN_RUN = /[A-Z][A-Za-z'’.&-]*(?:\s+(?:of|and|for|the|&)?\s*[A-Z][A-Za-z'’.&-]*)+/g;
export const LATIN_ALWAYS_ALLOWED = ["KnownBy", "LinkedIn", "Imprint"];
const LABEL_KEYS = new Set(["archetype", "primary_archetype", "secondary_archetype", "label", "kicker"]);
const JUNIOR_STEMS = ["مدرس", "معلم", "مراقب", "متابع", "مستمع", "متعلم", "طالب"];
const JUNIOR_WORDS = JUNIOR_STEMS.flatMap((w) => [w, "ال" + w, "و" + w, "وال" + w]);
/** English nouns that sound passive or junior for a senior person, checked in label fields of English reads. */
export const JUNIOR_EN = ["observer", "watcher", "follower", "listener", "learner", "student", "teacher"];
export function englishJuniorLabel(values: Record<string, unknown>): { field: string; word: string } | null {
  for (const [k, v] of Object.entries(values)) {
    if (!LABEL_KEYS.has(k) || typeof v !== "string") continue;
    const w = v.toLowerCase().split(/[^a-z]+/).find((t) => JUNIOR_EN.includes(t));
    if (w) return { field: k, word: w };
  }
  return null;
}
/** Arabic titles a section may wrongly repeat at the start of its own body. */
export const SECTION_TITLES: Record<string, string[]> = {
  uncontested_space: ["المساحة التي لم يشغلها أحد", "المساحة التي لا يملكها غيرك", "المساحة التي لا يشغلها أحد"],
  honest_gap: ["الفجوة الصريحة", "فجوة واحدة"],
  honest_truth: ["الحقيقة الصريحة"],
  market_read: ["كيف يراك الناس", "كيف يراك السوق"],
  unique_capability: ["ما تنفرد به", "ما لا يقدر عليه غيرك"],
  invest_next: ["أين تضع جهدك القادم"],
};
const lastKey = (path: string) => (path.match(/[^.[\]]+/g) ?? []).filter((t) => !/^\d+$/.test(t)).pop() ?? path;

export function arabicQualityNotes(
  values: Record<string, unknown>,
  opts: { skipKeys?: string[]; allowLatin?: (string | null | undefined)[] } = {},
): ArabicGateDetail[] {
  const skip = new Set(opts.skipKeys ?? []);
  const allow = [...LATIN_ALWAYS_ALLOWED, ...(opts.allowLatin ?? [])]
    .filter((x): x is string => !!x && !!x.trim())
    .sort((a, b) => b.length - a.length);
  const out: ArabicGateDetail[] = [];
  for (const [k, v] of flatten(values, skip)) {
    if (!hasArabic(v)) continue;
    const key = lastKey(k);
    const d = DASH.exec(v);
    if (d) out.push({ check: "dash", field: k, fragment: frag(v, d.index) });
    let masked = v;
    for (const a of allow) masked = masked.split(a).join(" ".repeat(a.length));
    for (const m of masked.matchAll(LATIN_RUN)) {
      const words = m[0].split(/\s+/).filter((w) => /^[A-Z]/.test(w));
      if (words.length >= 2) { out.push({ check: "latin_run", field: k, word: m[0].trim(), fragment: frag(v, m.index ?? 0) }); break; }
    }
    if (LABEL_KEYS.has(key)) {
      const words = bare(v).split(/[\s،,.:]+/);
      const w = JUNIOR_WORDS.find((j) => words.includes(j));
      if (w) out.push({ check: "junior_label", field: k, word: w });
    }
    const titles = SECTION_TITLES[key];
    if (titles) {
      const b = bare(v).trim().replace(/^[«"]/, "");
      const t = titles.find((x) => b.startsWith(bare(x)));
      if (t) out.push({ check: "title_repeat", field: k, word: t });
    }
    if (bare(v).includes("الأكاديميا") || bare(v).includes("الاكاديميا")) out.push({ check: "loanword", field: k, word: "الأكاديميا" });
  }
  return out;
}

/** Style findings for one Arabic text (a post, an answer, a line). */
export function arabicTextNotes(text: string): ArabicGateDetail[] {
  return arabicStyleNotes({ text });
}

/** One correction instruction listing every finding, for a single correction call. */
export function arabicFixInstruction(notes: ArabicGateDetail[]): string {
  const lines = notes.slice(0, 12).map((d) => {
    const where = d.field === "*" ? "The text" : `"${d.field}"`;
    const word = d.word ? ` («${d.word}»)` : "";
    const quote = d.fragment ? ` Offending text: «${d.fragment.slice(0, 60)}».` : "";
    return `- ${where}${word} ${WHAT[d.check]}.${quote}`;
  });
  return `Fix ONLY these Arabic problems and change nothing else. Return exactly the same structure.\n${lines.join("\n")}\nApply every rule of the LANGUAGE block.`;
}

/* ── Batch 12: one field-level correction ─────────────────────────────────
   When the checker finds banned words or «كـ» in model-written Arabic, the
   offending fields only are sent once for correction. A fixed value is kept
   only when it has fewer findings than before; otherwise the original stays. */
const pathTokens = (p: string) => (p.match(/[^.[\]]+/g) ?? []).map((t) => (/^\d+$/.test(t) ? Number(t) : t));
export function pathGet(obj: unknown, p: string): unknown {
  let cur: any = obj;
  for (const t of pathTokens(p)) { if (cur == null) return undefined; cur = cur[t as any]; }
  return cur;
}
export function pathSet(obj: unknown, p: string, v: unknown): boolean {
  const ts = pathTokens(p);
  let cur: any = obj;
  for (let i = 0; i < ts.length - 1; i++) { cur = cur?.[ts[i] as any]; if (cur == null || typeof cur !== "object") return false; }
  if (cur == null || typeof cur[ts[ts.length - 1] as any] !== "string") return false;
  cur[ts[ts.length - 1] as any] = v;
  return true;
}
export const FIELD_FIX_CHECKS = new Set<ArabicCheck>(["banned_word", "kaf_as", "dash", "latin_run", "junior_label", "title_repeat", "loanword"]);
export const FIELD_FIX_SYSTEM = `You correct Arabic text. You receive a JSON object of field paths to Arabic values and a list of problems. Return ONLY a JSON object with the same keys, each value the corrected text. Change only what the problems name. Keep the meaning, every fact, figure and name. No markdown.\n\n${ARABIC_VOICE_BLOCK}`;

/** Builds the one correction request, or null when nothing is fixable. */
export function fieldFixRequest(obj: unknown, notes: ArabicGateDetail[]): { user: string; fields: Record<string, string> } | null {
  const fixable = notes.filter((n) => FIELD_FIX_CHECKS.has(n.check) && n.field !== "*");
  const fields: Record<string, string> = {};
  for (const n of fixable) { const v = pathGet(obj, n.field); if (typeof v === "string") fields[n.field] = v; }
  if (!Object.keys(fields).length) return null;
  return { fields, user: `${arabicFixInstruction(fixable)}\n\nFIELDS:\n${JSON.stringify(fields)}` };
}

/** Applies the model's reply; returns how many fields were replaced. */
export function applyFieldFix(obj: unknown, fields: Record<string, string>, reply: string): number {
  let parsed: Record<string, unknown> | null = null;
  try {
    const m = reply.replace(/```(?:json)?/g, "").match(/\{[\s\S]*\}/);
    parsed = m ? JSON.parse(m[0]) : null;
  } catch { parsed = null; }
  if (!parsed) return 0;
  let n = 0;
  for (const [k, before] of Object.entries(fields)) {
    const after = parsed[k];
    if (typeof after !== "string" || !after.trim()) continue;
    const bad = (s: string) => arabicStyleNotes({ [lastKey(k)]: s }).filter((d) => FIELD_FIX_CHECKS.has(d.check)).length;
    if (bad(after) < bad(before) && pathSet(obj, k, after.trim())) n++;
  }
  return n;
}

/** Rule ids that fired, deduplicated, in order. */
export function firedRules(notes: ArabicGateDetail[]): string[] {
  return [...new Set(notes.map((n) => n.check))];
}

/**
 * One arabic_quality_events row per rule that fired: function name, rule id,
 * and whether the correction call cleared it. No member text, no user id.
 */
export async function logArabicQuality(
  admin: { from: (t: string) => any },
  functionName: string,
  before: ArabicGateDetail[],
  after: ArabicGateDetail[],
): Promise<void> {
  const left = new Set(after.map((n) => n.check));
  const rows = firedRules(before).map((rule_id) => ({ function_name: functionName, rule_id, fixed: !left.has(rule_id as ArabicCheck) }));
  if (!rows.length) return;
  try { await admin.from("arabic_quality_events").insert(rows); } catch (e) { console.error("arabic_quality_events insert failed", e); }
}
