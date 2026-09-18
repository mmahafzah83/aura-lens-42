/**
 * ARABIC REGISTER UNDER A CODE GATE.
 *
 * The prompt asks for a senior Arabic register; this file is what actually
 * enforces it. Every generated Arabic line passes through here before it is
 * stored: reject → regenerate once → drop the line. The English ban (authority
 * as a noun, thought leader, personal brand, trajectory, leverage) rides along
 * so one call covers both languages.
 */

/** Tashkeel and tatweel are stripped before matching so a diacritic cannot hide a phrase. */
const stripMarks = (s: string) => String(s ?? "").replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, "");

/** Newsroom filler and passive constructions that flatten a senior voice. */
const AR_PHRASES = [
  "يعد",
  "في ظل",
  "من خلال",
  "يسلط الضوء",
  "بشكل كبير",
  "لا شك ان",
  "لا شك أن",
  "تجدر الاشارة",
  "تجدر الإشارة",
  "في عالم اليوم",
  "مما يعزز",
  "قام ب",
  "يتم",
  "تم ",
  "مما يجعل",
  "وهو ما يتماشى",
  "وهو ما يتماشي",
];

/** كـ immediately prefixing a word — "as a", which reads as translated Arabic. */
const KAF_AS = /كـ\s*[\u0621-\u064A]/;
/** Arabic prose says الذكاء الاصطناعي, never the Latin "AI". */
const LATIN_AI = /\bAI\b/;
/** A Latin digit glued to و or الـ. */
const GLUED_DIGIT = /(?:و|الـ)\s*\d|\d\s*(?:و|الـ)(?=\d)/;
/** A range written with an en dash instead of من X إلى Y. */
const DIGIT_DASH = /\d\s*[–—]\s*\d/;

/** English words that are out of the product's mouth, in either language. */
const EN_BANNED = /\bthought leader(?:ship)?\b|\bpersonal brand\b|\btrajectory\b|\bleverag(?:e|es|ed|ing)\b|\bauthorit(?:y|ies)\b/i;

/** The first rule this line breaks, or null when the line is clean. */
export function registerFault(text: string, lang: "en" | "ar"): string | null {
  const raw = String(text ?? "");
  if (!raw.trim()) return "empty";
  if (EN_BANNED.test(raw)) return `banned word: ${raw.match(EN_BANNED)?.[0]}`;
  if (lang !== "ar") return null;

  const flat = stripMarks(raw);
  for (const phrase of AR_PHRASES) {
    const p = stripMarks(phrase);
    if (p.endsWith(" ") ? flat.includes(p) : new RegExp(`(?:^|[^\\u0621-\\u064A])${p}(?![\\u0621-\\u064A])`).test(flat)) {
      return `arabic register: ${phrase.trim()}`;
    }
  }
  if (KAF_AS.test(flat)) return "arabic register: كـ as a";
  if (LATIN_AI.test(raw)) return "arabic register: write الذكاء الاصطناعي";
  if (GLUED_DIGIT.test(flat)) return "arabic register: digit glued to و or الـ";
  if (DIGIT_DASH.test(raw)) return "arabic register: write من X إلى Y";
  return null;
}

export const registerOk = (text: string, lang: "en" | "ar"): boolean => registerFault(text, lang) === null;

/** The same rules, told to the model. */
export const OE_REGISTER_FOR_PROMPT =
  'Arabic register: never write يُعدّ، في ظلّ، من خلال، يسلّط الضوء، بشكل كبير، لا شكّ أن، تجدر الإشارة، في عالم اليوم، مما يعزّز، قام بـ، يتم، تمّ، مما يجعل، وهو ما يتماشى. ' +
  'Never use كـ to mean "as a". Never write the Latin "AI" — write الذكاء الاصطناعي. ' +
  'Never glue a Latin digit to و or الـ. For a range write «من X إلى Y», never an en dash between digits. ' +
  'In either language never write: authority as a noun, thought leader, personal brand, trajectory, leverage.';
