/**
 * secondPerson.ts — his record speaks of him; a line shown to him speaks TO him.
 *
 * Deterministic. No model. It moves the pronoun AND the verb that follows it:
 *   He has → you have · He is → you are · He was → you were
 *   He led / managed / designed / oversaw → you led / managed / designed / oversaw
 *   his → your · him → you
 * A past-tense verb is already right in the second person, so it is left alone.
 */

/** Present-tense third-person forms that are not simply "verb + s". */
const IRREGULAR: Record<string, string> = {
  has: "have",
  is: "are",
  was: "were",
  does: "do",
  goes: "go",
  says: "say",
};

/** A word that ends in s but is not a third-person verb. */
const NOT_A_VERB = /(?:ss|us|is|ous|ics|ies$)/;

/** Past tense and participles need no change in the second person. */
const PAST = /(?:ed|led|built|ran|won|held|made|took|gave|drove|grew|oversaw|sold|left|set|put|led)$/;

export function verbToYou(verb: string): string {
  const low = verb.toLowerCase();
  if (IRREGULAR[low]) return IRREGULAR[low];
  if (PAST.test(low)) return low;
  if (!low.endsWith("s") || NOT_A_VERB.test(low)) return low;
  if (low.endsWith("ies")) return `${low.slice(0, -3)}y`;
  if (low.endsWith("ches") || low.endsWith("shes") || low.endsWith("oes") || low.endsWith("xes")) return low.slice(0, -2);
  return low.slice(0, -1);
}

const SUBJECT = /^(?:he|the member|mohammad(?:\s+[a-z]+)?)\s+/i;

export function secondPerson(claim: string): string {
  let c = String(claim ?? "").replace(/\s+/g, " ").trim().replace(/[.\s]+$/, "");

  const m = c.match(/^(?:he|the member|mohammad(?:\s+[a-z]+)?)\s+([A-Za-z']+)\b(.*)$/i);
  if (m) c = `${verbToYou(m[1])}${m[2]}`;
  else c = c.replace(SUBJECT, "");

  // Possessives and objects anywhere in the sentence.
  return c
    .replace(/\bhis\b/gi, "your")
    .replace(/\bhim\b/gi, "you")
    .replace(/\bhimself\b/gi, "yourself")
    .replace(/\bhe\b/gi, "you")
    .replace(/\byou has\b/g, "you have")
    .replace(/\byou is\b/g, "you are")
    .replace(/\byou was\b/g, "you were")
    .replace(/[.\s]+$/, "");
}
