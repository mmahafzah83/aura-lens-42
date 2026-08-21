/**
 * Does the member's profile carry the subjects they actually write about?
 *
 * Token-level, three-state, and honest about halves: a member who put one word
 * of a two-word subject into their headline moved, and must be told they moved.
 *
 * Pure arithmetic — no React, no network.
 */

import { roleDescription } from "@/lib/presenceHealth";

export type ThemeState = "carried" | "partial" | "missing";

/** The four places a subject can show up, in the words the member reads. */
export type ThemeField = "your headline" | "your About" | "your roles" | "your skills";

export interface ThemeMatch {
  state: ThemeState;
  /** The significant tokens of the theme that were found. */
  matched: string[];
  /** The significant tokens of the theme that were not. */
  missing: string[];
  /** Where the matches were found, in reading order. */
  fields: ThemeField[];
  /** Where matches landed in the STATED tier (headline, About). */
  statedFields: ThemeField[];
  /** Where matches landed in the LISTED tier (roles, skills). */
  listedFields: ThemeField[];
  /** Every token is present, but the profile only LISTS it — never states it. */
  listedOnly: boolean;
}

const STOPWORDS = new Set(["of", "the", "and", "for", "in", "to", "a", "an", "on", "with"]);

/** Lowercase, strip punctuation, collapse whitespace. Both sides, always. */
export function normalise(text: string): string {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Significant tokens of a theme — stopwords dropped, order kept. */
export function themeTokens(theme: string): string[] {
  const all = normalise(theme).split(" ").filter(Boolean);
  const significant = all.filter((t) => !STOPWORDS.has(t));
  return significant.length ? significant : all;
}

/** Whole-word presence, bounded on BOTH sides. "ai" never matches "airport". */
function hasToken(haystack: string, token: string): boolean {
  if (!token) return false;
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^| )${escaped}( |$)`).test(haystack);
}

export interface ProfileFields {
  headline?: string | null;
  about?: string | null;
  experience?: unknown;
  skills?: unknown;
}

export type ThemeTier = "stated" | "listed";

interface Haystack { field: ThemeField; text: string; tier: ThemeTier }

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const skillName = (s: unknown): string => {
  if (typeof s === "string") return s;
  if (s && typeof s === "object") {
    const o = s as Record<string, unknown>;
    for (const k of ["title", "name", "skill", "text"]) if (typeof o[k] === "string") return o[k] as string;
  }
  return "";
};

/**
 * The whole profile, not a third of it: headline, About, every role's title and
 * description (via the one existing walker), and every skill name.
 */
export function buildHaystacks(profile: ProfileFields | null | undefined): Haystack[] {
  const p = profile || {};
  const roles = asArray(p.experience).filter((r) => r && typeof r === "object") as Record<string, unknown>[];
  /* The scraper calls the job title "position" on some rows and "title" on
     others. Read every spelling — a missed title reads as a missed subject. */
  const roleTitle = (r: Record<string, unknown>) =>
    ["position", "title", "jobTitle", "role"]
      .map((k) => (typeof r[k] === "string" ? (r[k] as string) : ""))
      .filter(Boolean)
      .join(" ");
  const roleText = roles.map((r) => `${roleTitle(r)} ${roleDescription(r)}`).join(" ");
  const skillText = asArray(p.skills).map(skillName).join(" ");
  /* Two tiers, deliberately unequal. STATED is prose he wrote to present
     himself. LISTED is his record — a skill LinkedIn auto-suggested and he
     accepted once is not evidence of how he positions himself. */
  return [
    { field: "your headline", text: normalise(p.headline || ""), tier: "stated" },
    { field: "your About", text: normalise(p.about || ""), tier: "stated" },
    { field: "your roles", text: normalise(roleText), tier: "listed" },
    { field: "your skills", text: normalise(skillText), tier: "listed" },
  ];
}

/**
 * One theme against the whole profile, weighted by tier.
 * All tokens in STATED → carried. All tokens but at least one only in LISTED,
 * or only some tokens anywhere → partial. None → missing.
 */
export function matchTheme(haystacks: Haystack[], theme: string): ThemeMatch {
  const tokens = themeTokens(theme);
  if (tokens.length === 0) {
    return {
      state: "missing", matched: [], missing: [], fields: [],
      statedFields: [], listedFields: [], listedOnly: false,
    };
  }

  const matched: string[] = [];
  const missing: string[] = [];
  const fields: ThemeField[] = [];
  /* Per tier, never one accumulated list: the listed-only sentence must be
     able to name the record WITHOUT naming the headline it is denying. */
  const statedFields: ThemeField[] = [];
  const listedFields: ThemeField[] = [];
  let anyListedOnly = false;

  for (const token of tokens) {
    let inStated = false;
    let found = false;
    for (const h of haystacks) {
      if (h.text && hasToken(h.text, token)) {
        found = true;
        if (h.tier === "stated") inStated = true;
        const bucket = h.tier === "stated" ? statedFields : listedFields;
        if (!bucket.includes(h.field)) bucket.push(h.field);
        if (!fields.includes(h.field)) fields.push(h.field);
      }
    }
    if (found && !inStated) anyListedOnly = true;
    (found ? matched : missing).push(token);
  }

  const all = matched.length === tokens.length;
  const state: ThemeState = all
    ? (anyListedOnly ? "partial" : "carried")
    : matched.length === 0
      ? "missing"
      : "partial";

  return {
    state, matched, missing, fields, statedFields, listedFields,
    listedOnly: all && anyListedOnly,
  };
}
