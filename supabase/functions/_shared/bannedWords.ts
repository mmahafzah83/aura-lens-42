/**
 * THE SINGLE SOURCE for words we refuse to put in generated member-facing copy.
 *
 * Every generator that writes text a member will read imports from here.
 * Changing this list changes every generator — there is no second copy, and a
 * local list anywhere else is a bug.
 */

export const BANNED_WORDS: string[] = [
  "authority", "trajectory", "personal brand", "thought leader", "leverage",
  "utilize", "facilitate", "unlock", "elevate", "empower", "seamless",
  "game-changing", "passionate", "results-driven", "proven track record",
  "I'm excited to", "with over X years of experience",
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A Title Case run of two or more capitalised words — "Saudi Water Authority",
 * "Capital Market Authority". Inside a name a banned word is a name.
 */
const PROPER_NOUN_RUN = /\b(?:[A-Z][\p{L}&'’-]*)(?:\s+(?:of|for|the|and|&|[A-Z][\p{L}&'’-]*)){1,}\b/gu;

function stripProperNouns(text: string): string {
  return text.replace(PROPER_NOUN_RUN, (run) => {
    const caps = run.split(/\s+/).filter((w) => /^[A-Z]/.test(w));
    return caps.length >= 2 ? " " : run;
  });
}

/** "leverage" fails only as a verb; the bare noun passes. */
const LEVERAGE_VERB = /\bleveraging\b|\bleverages?\s+(the|our|a|this|these|its|their|your)\b/i;

const PHRASE_TESTS = BANNED_WORDS
  .filter((w) => w.toLowerCase() !== "leverage")
  .map((w) => ({ word: w, re: new RegExp(`\\b${escape(w)}\\b`, "i") }));

export function hasBanned(text: string): boolean {
  if (!text) return false;
  const cleaned = stripProperNouns(text);
  if (LEVERAGE_VERB.test(cleaned)) return true;
  return PHRASE_TESTS.some((t) => t.re.test(cleaned));
}
