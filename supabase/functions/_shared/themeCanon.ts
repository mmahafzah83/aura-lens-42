// Canonicalizes free-form theme_tags into a single controlled vocabulary.
// Used by detect-signals-v2 (insert + reinforce) and backfill-theme-tags.

const TYPE_STRIP = new Set<string>([
  "market_trend",
  "competitor_move",
  "skill_gap",
]);

const SYNONYM_MAP: Record<string, string> = {
  "skill gap": "Skill Gaps",
  "skill gaps": "Skill Gaps",
  "digital ecosystem": "Digital Ecosystems",
  "digital ecosystems": "Digital Ecosystems",
  "integrated systems": "Integrated Platforms",
  "integrated platforms": "Integrated Platforms",
  "competitive analysis": "Competitive Intelligence",
  "competitive intelligence": "Competitive Intelligence",
  "digital utilities": "Water Utilities",
  "water utilities": "Water Utilities",
  "culture": "Organizational Culture",
  "cultural change": "Organizational Culture",
  "cultural transformation": "Organizational Culture",
  "organizational culture": "Organizational Culture",
  "strategic leadership": "Executive Leadership",
  "executive leadership": "Executive Leadership",
  "ot security": "OT Cybersecurity",
  "ot cybersecurity": "OT Cybersecurity",
  "ai predictive maintenance": "Predictive Maintenance",
  "predictive maintenance": "Predictive Maintenance",
  "due diligence": "Strategic Due Diligence",
  "strategic diligence": "Strategic Due Diligence",
  "strategic due diligence": "Strategic Due Diligence",
  "workforce upskilling": "Workforce Development",
  "workforce readiness": "Workforce Development",
  "digital skills": "Workforce Development",
  "workforce development": "Workforce Development",
  "holistic change management": "Change Management",
  "enterprise change management": "Change Management",
};

const ACRONYMS = [
  "AI", "IoT", "GCC", "ESG", "OT", "IT", "ROI", "CAPEX",
  "GenAI", "GDP", "NTN", "B2B", "5G", "6G",
];
const ACRONYM_LOOKUP: Record<string, string> = Object.fromEntries(
  ACRONYMS.map((a) => [a.toLowerCase(), a]),
);

function titleCaseWord(word: string): string {
  if (!word) return word;
  const lower = word.toLowerCase();
  if (ACRONYM_LOOKUP[lower]) return ACRONYM_LOOKUP[lower];
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function titleCaseToken(token: string): string {
  // Preserve hyphens: title-case each side independently.
  if (token.includes("-")) {
    return token.split("-").map(titleCaseWord).join("-");
  }
  return titleCaseWord(token);
}

function titleCasePhrase(phrase: string): string {
  return phrase
    .split(/\s+/)
    .filter(Boolean)
    .map(titleCaseToken)
    .join(" ");
}

export function canonicalizeTags(tags: string[]): string[] {
  if (!Array.isArray(tags)) return [];
  const out: string[] = [];
  const seen = new Set<string>();

  for (const raw of tags) {
    if (typeof raw !== "string") continue;
    const original = raw.trim();
    if (!original) continue;

    // TYPE_STRIP applies to the ORIGINAL form (snake_case type leaks).
    if (TYPE_STRIP.has(original)) continue;

    // Normalize: trim, underscores→spaces, collapse whitespace.
    const normalized = original
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!normalized) continue;

    const key = normalized.toLowerCase();
    let canonical: string;
    if (SYNONYM_MAP[key]) {
      canonical = SYNONYM_MAP[key];
    } else {
      canonical = titleCasePhrase(normalized);
    }

    const dedupKey = canonical.toLowerCase();
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    out.push(canonical);
  }

  return out;
}