/**
 * Does the member's profile carry the subjects they actually write about?
 *
 * Token-level, three-state, and honest about halves: a member who put one word
 * of a two-word subject into their headline moved, and must be told they moved.
 *
 * All normalising, stemming and alias resolution live in the one shared text
 * layer (`_shared/textMatch`). This file owns the two-tier state rule only.
 */

import { roleDescription } from "@/lib/presenceHealth";
import {
  EMPTY_ALIASES,
  expandWithAliases,
  normaliseText,
  stemToken,
  tokenise,
  type AliasIndex,
} from "../../supabase/functions/_shared/textMatch";

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

/** Kept for callers that still normalise raw strings. One source of truth. */
export function normalise(text: string): string {
  return normaliseText(text);
}

/** Significant tokens of a theme — stopwords dropped, order kept. */
export function themeTokens(theme: string): string[] {
  return tokenise(theme).raw;
}

export interface ProfileFields {
  headline?: string | null;
  about?: string | null;
  experience?: unknown;
  skills?: unknown;
}

export type ThemeTier = "stated" | "listed";

export interface Haystack {
  field: ThemeField;
  text: string;
  tier: ThemeTier;
  /** Stemmed token set — what matching actually reads. */
  tokens: Set<string>;
}

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
  const make = (field: ThemeField, raw: string, tier: ThemeTier): Haystack => {
    const text = normaliseText(raw);
    /* Stopwords stay OUT of the token set; every token is stemmed, so
       "efficiencies" and "efficiency" are the same unit. */
    const tokens = new Set(
      text.split(" ").filter(Boolean).map(stemToken),
    );
    return { field, text, tier, tokens };
  };
  return [
    make("your headline", p.headline || "", "stated"),
    make("your About", p.about || "", "stated"),
    make("your roles", roleText, "listed"),
    make("your skills", skillText, "listed"),
  ];
}

/**
 * One theme against the whole profile, weighted by tier.
 * All tokens in STATED → carried. All tokens but at least one only in LISTED,
 * or only some tokens anywhere → partial. None → missing.
 *
 * Aliases are optional and resolved one hop in both directions. When the alias
 * table cannot be read the caller passes nothing and matching is exact.
 */
export function matchTheme(haystacks: Haystack[], theme: string, aliases: AliasIndex = EMPTY_ALIASES): ThemeMatch {
  const rawTokens = tokenise(theme);
  const tokens = rawTokens.raw;
  const stems = rawTokens.stems;
  if (tokens.length === 0) {
    return {
      state: "missing", matched: [], missing: [], fields: [],
      statedFields: [], listedFields: [], listedOnly: false,
    };
  }

  /* Both sides expand: "ai" on the profile satisfies the theme "artificial
     intelligence", and the theme "ai" is satisfied by a profile that spells it
     out. One hop, computed against the original sets. */
  const expanded = haystacks.map((h) => ({ ...h, tokens: expandWithAliases(h.tokens, aliases) }));

  const matched: string[] = [];
  const missing: string[] = [];
  const fields: ThemeField[] = [];
  /* Per tier, never one accumulated list: the listed-only sentence must be
     able to name the record WITHOUT naming the headline it is denying. */
  const statedFields: ThemeField[] = [];
  const listedFields: ThemeField[] = [];
  let anyListedOnly = false;

  tokens.forEach((token, i) => {
    const stem = stems[i];
    let inStated = false;
    let found = false;
    for (const h of expanded) {
      if (!h.tokens.has(stem)) continue;
      found = true;
      if (h.tier === "stated") inStated = true;
      const bucket = h.tier === "stated" ? statedFields : listedFields;
      if (!bucket.includes(h.field)) bucket.push(h.field);
      if (!fields.includes(h.field)) fields.push(h.field);
    }
    if (found && !inStated) anyListedOnly = true;
    (found ? matched : missing).push(token);
  });

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
