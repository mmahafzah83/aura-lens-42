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

interface Haystack { field: ThemeField; text: string }

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
  const roleText = roles
    .map((r) => `${typeof r.title === "string" ? r.title : ""} ${roleDescription(r)}`)
    .join(" ");
  const skillText = asArray(p.skills).map(skillName).join(" ");
  return [
    { field: "your headline", text: normalise(p.headline || "") },
    { field: "your About", text: normalise(p.about || "") },
    { field: "your roles", text: normalise(roleText) },
    { field: "your skills", text: normalise(skillText) },
  ];
}

/**
 * One theme against the whole profile.
 * All significant tokens present → carried. Some → partial. None → missing.
 * A single-token theme can only ever be carried or missing.
 */
export function matchTheme(haystacks: Haystack[], theme: string): ThemeMatch {
  const tokens = themeTokens(theme);
  if (tokens.length === 0) return { state: "missing", matched: [], missing: [], fields: [] };

  const matched: string[] = [];
  const missing: string[] = [];
  const fields: ThemeField[] = [];

  for (const token of tokens) {
    let found = false;
    for (const h of haystacks) {
      if (h.text && hasToken(h.text, token)) {
        found = true;
        if (!fields.includes(h.field)) fields.push(h.field);
      }
    }
    (found ? matched : missing).push(token);
  }

  const state: ThemeState =
    matched.length === tokens.length ? "carried" : matched.length === 0 ? "missing" : "partial";

  return { state, matched, missing, fields };
}
