/**
 * Presence health — six deterministic rows scored from a stored LinkedIn snapshot.
 *
 * Pure arithmetic. No React, no network, no invented comparisons: every `fact`
 * traces to a value the member actually has on file.
 */

export interface PresenceSnapshot {
  photo_url?: string | null;
  headline?: string | null;
  about?: string | null;
  experience?: unknown;
  education?: unknown;
  skills?: unknown;
}

export type PresenceKey = "photo" | "headline" | "about" | "experience" | "skills" | "education";

export interface PresenceRow {
  key: PresenceKey;
  label: string;
  /** 0–10 */
  score: number;
  /** The member's own number, in plain words. */
  fact: string;
  /** The plain reason the score is what it is. */
  rule: string;
  weak: boolean;
}

const asArray = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Record<string, unknown>[]) : [];

const arrayLength = (v: unknown): number => (Array.isArray(v) ? v.length : 0);

/** Any nested text that reads as a role description. */
export function roleDescription(role: Record<string, unknown>): string {
  const direct = ["description", "summary", "job_description", "descriptionText"]
    .map((k) => (typeof role[k] === "string" ? (role[k] as string) : ""))
    .join(" ")
    .trim();
  if (direct) return direct;
  const sub = role["subComponents"];
  if (Array.isArray(sub)) {
    const parts: string[] = [];
    for (const s of sub) {
      const d = (s as Record<string, unknown> | null)?.["description"];
      if (Array.isArray(d)) for (const line of d) {
        const t = (line as Record<string, unknown> | null)?.["text"];
        if (typeof t === "string") parts.push(t);
      }
    }
    return parts.join(" ").trim();
  }
  return "";
}

const STRONG_VERBS = ["led", "built", "advised", "delivered", "scaled"];

const wordCount = (s: string): number => (s.trim() ? s.trim().split(/\s+/).length : 0);

export function scorePresence(snapshot: PresenceSnapshot | null | undefined): PresenceRow[] {
  const s = snapshot || {};

  const photoScore = s.photo_url && String(s.photo_url).trim() ? 10 : 0;

  const headline = String(s.headline || "").trim();
  const hLen = headline.length;
  let headlineScore = hLen < 40 ? 3 : hLen < 120 ? 6 : 8;
  const lower = headline.toLowerCase();
  if (/\d/.test(headline) || STRONG_VERBS.some((v) => new RegExp(`\\b${v}\\b`).test(lower))) headlineScore += 2;

  const aboutWords = wordCount(String(s.about || ""));
  const aboutScore =
    aboutWords === 0 ? 0 : aboutWords < 50 ? 3 : aboutWords < 150 ? 6 : aboutWords < 300 ? 9 : 10;

  const roles = asArray(s.experience);
  const withDesc = roles.filter((r) => roleDescription(r).length > 0).length;
  const expScore = roles.length === 0 ? 0 : Math.round((withDesc / roles.length) * 10);

  const skillCount = arrayLength(s.skills);
  const skillScore =
    skillCount === 0 ? 0 : skillCount < 5 ? 3 : skillCount < 10 ? 6 : skillCount < 20 ? 9 : 10;

  const eduCount = arrayLength(s.education);
  const eduScore = eduCount > 0 ? 10 : 0;

  const rows: PresenceRow[] = [
    {
      key: "photo",
      label: "Photo",
      score: photoScore,
      fact: photoScore ? "Photo on file" : "No photo",
      rule: "A profile without a face gets skipped.",
      weak: false,
    },
    {
      key: "headline",
      label: "Headline",
      score: headlineScore,
      fact: `${hLen} characters`,
      rule: "Under 40 characters is a job title, not a position.",
      weak: false,
    },
    {
      key: "about",
      label: "About",
      score: aboutScore,
      fact: `${aboutWords} words`,
      rule: "Under 50 words reads as a placeholder.",
      weak: false,
    },
    {
      key: "experience",
      label: "Experience",
      score: expScore,
      fact: `${withDesc} of ${roles.length} roles described`,
      rule: "A role with no description is a job title on a list.",
      weak: false,
    },
    {
      key: "skills",
      label: "Skills",
      score: skillScore,
      fact: `${skillCount} skills listed`,
      rule: "Skills are how you get found in a search.",
      weak: false,
    },
    {
      key: "education",
      label: "Education",
      score: eduScore,
      fact: eduCount > 0 ? `${eduCount} entries` : "Nothing listed",
      rule: "Blank education raises a question you don't want asked.",
      weak: false,
    },
  ];

  return rows.map((r) => ({ ...r, weak: r.score <= 6 }));
}

/** Earliest start year found anywhere in the experience array. Null when undecidable. */
export function earliestExperienceYear(experience: unknown): number | null {
  const years: number[] = [];
  const walk = (node: unknown, depth: number) => {
    if (depth > 4 || node == null) return;
    if (typeof node === "string") {
      for (const m of node.matchAll(/\b(19|20)\d{2}\b/g)) years.push(Number(m[0]));
      return;
    }
    if (typeof node === "number") {
      if (node >= 1900 && node <= 2100) years.push(node);
      return;
    }
    if (Array.isArray(node)) { for (const v of node) walk(v, depth + 1); return; }
    if (typeof node === "object") { for (const v of Object.values(node as Record<string, unknown>)) walk(v, depth + 1); }
  };
  walk(experience, 0);
  const now = new Date().getFullYear();
  const usable = years.filter((y) => y >= 1950 && y <= now);
  return usable.length ? Math.min(...usable) : null;
}
