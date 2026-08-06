/**
 * Provenance guard, part two: named things.
 *
 * A fabricated organisation, person or date damages a member's credibility
 * exactly as much as a fabricated figure. This module finds every named entity
 * in a generated draft that the evidence behind that generation cannot account
 * for. It only ever DETECTS — nothing is cut out in place. The caller attempts
 * one corrective regeneration and then hands the member the draft with a
 * warning; a member is never blocked and never handed a mutilated sentence.
 */
import { toWesternDigits } from "./voiceStyle.ts";

/** Words that begin a sentence, open a line or otherwise capitalise innocently. */
const COMMON_CAPS = new Set([
  "i","the","a","an","and","but","or","so","if","then","this","that","these","those",
  "we","you","they","he","she","it","my","our","your","their","his","her","its",
  "what","when","where","why","how","who","which","there","here","now","today",
  "yesterday","tomorrow","every","most","many","some","no","not","never","always",
  "in","on","at","for","from","to","of","by","with","without","after","before",
  "one","two","three","four","five","six","seven","eight","nine","ten",
  "monday","tuesday","wednesday","thursday","friday","saturday","sunday",
  "ai","ceo","cfo","coo","cto","hr","kpi","roi","it","us","uk","eu","linkedin","aura",
]);

const MONTHS_EN =
  "january|february|march|april|may|june|july|august|september|october|november|december";
const MONTHS_AR =
  "يناير|فبراير|مارس|أبريل|مايو|يونيو|يوليو|أغسطس|سبتمبر|أكتوبر|نوفمبر|ديسمبر";

/**
 * Specific dates only. A bare year is already the number guard's business; what
 * matters here is a date precise enough to read as a record of an event.
 */
const DATE_PATTERNS: RegExp[] = [
  /\b\d{4}-\d{2}-\d{2}\b/g,
  /\b\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4}\b/g,
  new RegExp(`\\b(?:${MONTHS_EN})\\s+\\d{1,2}(?:,?\\s*\\d{4})?\\b`, "gi"),
  new RegExp(`\\b\\d{1,2}\\s+(?:${MONTHS_EN})(?:\\s+\\d{4})?\\b`, "gi"),
  new RegExp(`(?:${MONTHS_AR})\\s+[0-9]{1,4}`, "g"),
  new RegExp(`[0-9]{1,2}\\s+(?:${MONTHS_AR})(?:\\s+[0-9]{4})?`, "g"),
  /\b(?:Q[1-4])\s*\d{4}\b/g,
];

const ORG_SUFFIX =
  "(?:Inc|Inc\\.|LLC|Ltd|Ltd\\.|PLC|Corp|Corp\\.|Corporation|Company|Co\\.|Group|Holdings|Bank|Ministry|Authority|University|Institute|Foundation|Consulting|Partners|Airlines|Airways|Aramco|Motors|Systems|Technologies|Labs)";

const ARABIC_HEAD = "(?:شركة|وزارة|هيئة|بنك|جامعة|مؤسسة|مجموعة|صندوق|مركز)";

/** Latin proper-name shapes: capitalised runs, and names carrying a corporate suffix. */
const LATIN_PATTERNS: RegExp[] = [
  new RegExp(`\\b(?:[A-Z][\\w&'’-]+\\s+){0,3}${ORG_SUFFIX}\\b`, "g"),
  // Two or more capitalised words in a row: a person or a named organisation.
  /\b[A-Z][a-z’'-]{1,}(?:\s+(?:of|for|and|de|al|bin|bint|the)\s+)?(?:\s?[A-Z][a-z’'-]{1,}){1,3}\b/g,
  // An all-caps acronym of three letters or more.
  /\b[A-Z]{3,}\b/g,
];

/** Arabic proper-name shapes: an organisation head plus what it names. */
const ARABIC_PATTERNS: RegExp[] = [
  new RegExp(`${ARABIC_HEAD}\\s+[\\u0621-\\u064A]+(?:\\s+[\\u0621-\\u064A]+)?`, "g"),
];

/** Comparable form: case, diacritics, punctuation and Arabic definite article dropped. */
export function normaliseEntity(raw: string): string {
  return toWesternDigits(String(raw ?? ""))
    .toLowerCase()
    .replace(/[\u064B-\u0652]/g, "")
    .replace(/[’'`.,؛;:!؟?"“”«»()\[\]]/g, "")
    .replace(/\bال(?=[\u0621-\u064A])/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A haystack of everything the evidence says, plus every individual word of it,
 * so "Aramco" is sourced by "Saudi Aramco" and vice versa.
 */
function sourcedIndex(evidenceText: string): { blob: string; words: Set<string> } {
  const blob = normaliseEntity(evidenceText);
  const words = new Set(blob.split(" ").filter((w) => w.length > 2));
  return { blob, words };
}

function isSourced(candidate: string, idx: { blob: string; words: Set<string> }): boolean {
  const norm = normaliseEntity(candidate);
  if (!norm) return true;
  if (idx.blob.includes(norm)) return true;
  // A multi-word name counts as sourced only when EVERY meaningful part of it
  // appears in the evidence — half a name is still a fabrication.
  const parts = norm.split(" ").filter((w) => w.length > 2 && !COMMON_CAPS.has(w));
  if (parts.length === 0) return true;
  return parts.every((p) => idx.words.has(p));
}

function candidateEntities(text: string): string[] {
  const out: string[] = [];
  const push = (v: string) => {
    const t = v.trim();
    if (t) out.push(t);
  };
  for (const re of DATE_PATTERNS) for (const m of text.matchAll(re)) push(m[0]);
  for (const re of ARABIC_PATTERNS) for (const m of text.matchAll(re)) push(m[0]);
  for (const re of LATIN_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const raw = m[0].trim();
      const words = raw.split(/\s+/);
      // A single capitalised word at the start of a sentence is grammar, not a name.
      const meaningful = words.filter((w) => !COMMON_CAPS.has(normaliseEntity(w)));
      if (meaningful.length === 0) continue;
      if (words.length === 1 && !/^[A-Z]{3,}$/.test(raw)) continue;
      push(raw);
    }
  }
  return out;
}

/**
 * Every named organisation, person or specific date in `draft` that the
 * evidence cannot account for. Detection only.
 */
export function findUnsourcedEntities(draft: string, evidenceText: string): string[] {
  const text = String(draft ?? "");
  if (!text.trim()) return [];
  const idx = sourcedIndex(evidenceText || "");
  const seen = new Set<string>();
  const found: string[] = [];
  for (const candidate of candidateEntities(text)) {
    if (isSourced(candidate, idx)) continue;
    const key = normaliseEntity(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(candidate);
  }
  return found;
}
