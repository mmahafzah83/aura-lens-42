/**
 * Guess the sector from what Aura already read. Aura never says on screen that
 * it couldn't tell something — it makes its best guess and lets the member
 * change it in one tap.
 */
import { SECTORS, SECTOR_NORMALIZATION } from "@/constants/sectors";

const HINTS: [string, RegExp][] = [
  ["Energy & Utilities", /\b(energy|utility|utilities|power|grid|renewab|solar|electric)/i],
  ["Water & Infrastructure", /\b(water|wastewater|desalinat|infrastructure)/i],
  ["Oil & Gas", /\b(oil|gas|petro|upstream|downstream|refin)/i],
  ["Finance & Banking", /\b(bank|finance|financial|invest|capital|fintech|treasur)/i],
  ["Government & Public Sector", /\b(government|ministry|public sector|municipal|policy)/i],
  ["Technology & IT", /\b(software|technolog|digital|data|cloud|ai\b|cyber|platform|saas)/i],
  ["Healthcare & Pharma", /\b(health|clinic|hospital|pharma|medical|life science)/i],
  ["Real Estate & Construction", /\b(real estate|property|construction|contracting|built environment)/i],
  ["Telecom", /\b(telecom|telco|mobile network|5g)/i],
  ["Education & Academia", /\b(universit|education|academ|school|professor|lecturer)/i],
  ["Manufacturing & Industrial", /\b(manufactur|factory|industrial|production line|supply plant)/i],
  ["Defense & Aerospace", /\b(defen[cs]e|aerospace|aviation|military)/i],
  ["Retail & Consumer", /\b(retail|consumer|ecommerce|e-commerce|fmcg|brand marketing)/i],
  ["Transportation & Logistics", /\b(logistic|transport|shipping|freight|ports|supply chain)/i],
  ["Consulting & Professional Services", /\b(consult|advisory|partner at|professional services|strategy firm)/i],
];

/** Headline, top skills and about, in that order of weight. */
export function inferSector(parts: { headline?: string | null; topSkills?: string[]; about?: string | null }): string | null {
  const haystack = [
    parts.headline || "",
    (parts.topSkills || []).join(" "),
    (parts.about || "").slice(0, 600),
  ].join(" ");
  if (!haystack.trim()) return null;

  const exact = (SECTORS as readonly string[]).find((s) => haystack.toLowerCase().includes(s.toLowerCase()));
  if (exact) return exact;

  for (const [sector, re] of HINTS) if (re.test(haystack)) return sector;

  const alias = Object.keys(SECTOR_NORMALIZATION)
    .sort((a, b) => b.length - a.length)
    .find((k) => k.length > 4 && haystack.toLowerCase().includes(k));
  return alias ? SECTOR_NORMALIZATION[alias] : null;
}
