/**
 * THE SINGLE SOURCE for banned vocabulary in generated member-facing copy.
 *
 * The list itself is data: it lives in admin_settings.banned_words and is
 * edited on the admin screen. This file is the matcher and the fallback.
 * A local list anywhere else is a bug.
 */

export const DEFAULT_BANNED_WORDS: string[] = [
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

/** Read the editable list. Falls back to the default when the row is missing or malformed. */
export async function loadBannedWords(admin: any): Promise<string[]> {
  try {
    const { data, error } = await admin
      .from("admin_settings")
      .select("value")
      .eq("key", "banned_words")
      .maybeSingle();
    if (error) throw new Error(error.message);
    const value = (data as any)?.value;
    const ok = Array.isArray(value) && value.length > 0 &&
      value.every((w: unknown) => typeof w === "string" && w.trim().length > 0);
    if (!ok) {
      console.info("[bannedWords] admin_settings.banned_words missing or malformed — using the default list");
      return DEFAULT_BANNED_WORDS;
    }
    return value.map((w: string) => w.trim());
  } catch (e) {
    console.info("[bannedWords] could not read admin_settings.banned_words — using the default list:", (e as Error)?.message);
    return DEFAULT_BANNED_WORDS;
  }
}

export function hasBanned(text: string, words: string[]): boolean {
  if (!text) return false;
  const list = Array.isArray(words) && words.length ? words : DEFAULT_BANNED_WORDS;
  const cleaned = stripProperNouns(text);
  if (list.some((w) => w.toLowerCase() === "leverage") && LEVERAGE_VERB.test(cleaned)) return true;
  return list
    .filter((w) => w.toLowerCase() !== "leverage")
    .some((w) => new RegExp(`\\b${escape(w)}\\b`, "i").test(cleaned));
}
