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
  /** Translation keys + params — the screen resolves these in its language. */
  labelKey: string;
  factKey: string;
  factParams: Record<string, number>;
  /** Empty string when there is no rule. */
  ruleKey: string;
  ruleParams: Record<string, number>;
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
  const hasProof = /\d/.test(headline) || STRONG_VERBS.some((v) => new RegExp(`\\b${v}\\b`).test(lower));
  if (hasProof) headlineScore += 2;
  /* The rule names the branch that actually fired, with the member's own number. */
  const headlineRuleKey = hLen < 40 ? "ph.headline.short" : hLen < 120 ? "ph.headline.mid" : hasProof ? "" : "ph.headline.noFigure";
  const headlineRule = hLen < 40
    ? "Under 40 characters is a job title, not a position."
    : hLen < 120
      ? `${hLen} characters. Room for a number or a named sector.`
      : hasProof
        ? ""
        : "No figure in it. A number is the fastest proof you have.";

  const aboutWords = wordCount(String(s.about || ""));
  const aboutScore =
    aboutWords === 0 ? 0 : aboutWords < 50 ? 3 : aboutWords < 150 ? 6 : aboutWords < 300 ? 9 : 10;
  const aboutRuleKey = aboutWords === 0 ? "ph.about.empty" : aboutWords < 50 ? "ph.about.placeholder" : aboutWords < 150 ? "ph.about.facts" : "";
  const aboutRule = aboutWords === 0
    ? "Nothing here. It is the first thing a stranger reads."
    : aboutWords < 50
      ? `${aboutWords} words reads as a placeholder.`
      : aboutWords < 150
        ? `${aboutWords} words covers the facts. It does not say what you would argue.`
        : "";

  const roles = asArray(s.experience);
  const withDesc = roles.filter((r) => roleDescription(r).length > 0).length;
  const blankRoles = roles.length - withDesc;
  const expScore = roles.length === 0 ? 0 : Math.round((withDesc / roles.length) * 10);
  const expRuleKey = roles.length === 0 ? "ph.experience.none" : "ph.experience.blank";
  const expRule = roles.length === 0
    ? "No roles on file. A stranger has nothing to place you against."
    : `${blankRoles} of your ${roles.length} roles carry no description.`;

  const skillCount = arrayLength(s.skills);
  const skillScore =
    skillCount === 0 ? 0 : skillCount < 5 ? 3 : skillCount < 10 ? 6 : skillCount < 20 ? 9 : 10;
  const skillRuleKey = skillCount < 5 ? "ph.skills.few" : skillCount < 20 ? "ph.skills.under20" : "";
  const skillRule = skillCount < 5
    ? `${skillCount} listed. Skills are how you get found in a search.`
    : skillCount < 20
      ? `${skillCount} listed. Under twenty thins your search reach.`
      : "";

  const eduCount = arrayLength(s.education);
  const eduScore = eduCount > 0 ? 10 : 0;

  const rows: PresenceRow[] = [
    {
      key: "photo",
      label: "Photo",
      score: photoScore,
      fact: photoScore ? "Photo on file" : "No photo",
      rule: "A profile without a face gets skipped.",
      labelKey: "ph.photo.label", factKey: photoScore ? "ph.photo.on" : "ph.photo.none", factParams: {},
      ruleKey: "ph.photo.rule", ruleParams: {},
      weak: false,
    },
    {
      key: "headline",
      label: "Headline",
      score: headlineScore,
      fact: `${hLen} characters`,
      rule: headlineRule,
      labelKey: "ph.headline.label", factKey: "ph.headline.fact", factParams: { n: hLen },
      ruleKey: headlineRuleKey, ruleParams: { n: hLen },
      weak: false,
    },
    {
      key: "about",
      label: "About",
      score: aboutScore,
      fact: `${aboutWords} words`,
      rule: aboutRule,
      labelKey: "ph.about.label", factKey: "ph.about.fact", factParams: { n: aboutWords },
      ruleKey: aboutRuleKey, ruleParams: { n: aboutWords },
      weak: false,
    },
    {
      key: "experience",
      label: "Experience",
      score: expScore,
      fact: `${withDesc} of ${roles.length} roles described`,
      rule: expRule,
      labelKey: "ph.experience.label", factKey: "ph.experience.fact", factParams: { a: withDesc, b: roles.length },
      ruleKey: expRuleKey, ruleParams: { a: blankRoles, b: roles.length },
      weak: false,
    },
    {
      key: "skills",
      label: "Skills",
      score: skillScore,
      fact: `${skillCount} skills listed`,
      rule: skillRule,
      labelKey: "ph.skills.label", factKey: "ph.skills.fact", factParams: { n: skillCount },
      ruleKey: skillRuleKey, ruleParams: { n: skillCount },
      weak: false,
    },
    {
      key: "education",
      label: "Education",
      score: eduScore,
      fact: eduCount > 0 ? `${eduCount} entries` : "Nothing listed",
      rule: "Blank education raises a question you don't want asked.",
      labelKey: "ph.education.label", factKey: eduCount > 0 ? "ph.education.fact" : "ph.education.none", factParams: { n: eduCount },
      ruleKey: "ph.education.rule", ruleParams: {},
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
