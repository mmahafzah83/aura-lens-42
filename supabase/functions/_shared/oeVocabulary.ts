/**
 * OE VOCABULARY — the banned words for anything the opportunity engine writes
 * (face summaries, keywords, search queries).
 *
 * THIS IS A MIRROR of the member-facing ban in scripts/check-vocabulary.mjs
 * (BANNED_WORDS_V / AUTHORITY_NOUN_RE / LEVERAGE_VERB_RE). The script is Node
 * and is not importable from Deno, so the two lists live apart — CHANGE BOTH
 * TOGETHER. This file carries the subset that can appear in engine output.
 */

/** Plain phrases, matched whole-word, case-insensitive. */
export const OE_BANNED_PHRASES = [
  "thought leadership",
  "thought leader",
  "personal brand",
  "trajectory",
];

const PHRASE_RE = new RegExp(`\\b(?:${OE_BANNED_PHRASES.join("|")})\\b`, "i");

/**
 * "authority" as a noun. The fixed descriptor "government authority" is the one
 * allowed use — it is what an organisation name is scrubbed down to.
 */
const AUTHORITY_RE = /\bauthorit(?:y|ies)\b/i;
const ALLOWED_AUTHORITY_RE = /\bgovernment\s+authorit(?:y|ies)\b/gi;

/** "leverage" in any form — verb or noun — is out of engine copy. */
const LEVERAGE_RE = /\bleverag(?:e|es|ed|ing)\b/i;

/** The first banned term in the text, or null. */
export function findBannedTerm(text: string): string | null {
  if (!text) return null;
  const cleaned = text.replace(ALLOWED_AUTHORITY_RE, " ");
  let m = cleaned.match(PHRASE_RE);
  if (m) return m[0];
  m = cleaned.match(LEVERAGE_RE);
  if (m) return m[0];
  m = cleaned.match(AUTHORITY_RE);
  if (m) return "authority (as a noun)";
  return null;
}

export const hasBannedTerm = (text: string): boolean => findBannedTerm(text) !== null;

/** The list as told to a model asking for a rewrite. */
export const OE_BANNED_FOR_PROMPT =
  'authority (as a noun), thought leader, thought leadership, personal brand, trajectory, leverage';
