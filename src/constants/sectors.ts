export const SECTORS = [
  "Consulting & Professional Services",
  "Energy & Utilities",
  "Water & Infrastructure",
  "Oil & Gas",
  "Finance & Banking",
  "Government & Public Sector",
  "Technology & IT",
  "Healthcare & Pharma",
  "Real Estate & Construction",
  "Telecom",
  "Education & Academia",
  "Manufacturing & Industrial",
  "Defense & Aerospace",
  "Retail & Consumer",
  "Transportation & Logistics",
  "Other",
] as const;

export type Sector = typeof SECTORS[number];

// Mapping from common AI-extracted / legacy sector names to canonical names.
// Keys are lower-cased; the normalizer lower-cases inputs before lookup.
export const SECTOR_NORMALIZATION: Record<string, string> = {
  "consulting": "Consulting & Professional Services",
  "professional services": "Consulting & Professional Services",
  "consulting & professional services": "Consulting & Professional Services",
  "consulting (cross-industry)": "Consulting & Professional Services",

  "energy": "Energy & Utilities",
  "energy & utilities": "Energy & Utilities",
  "utilities": "Energy & Utilities",
  "energy and resources": "Energy & Utilities",

  "water": "Water & Infrastructure",
  "water & infrastructure": "Water & Infrastructure",
  "water utilities": "Water & Infrastructure",
  "water & utilities": "Water & Infrastructure",
  "utilities and infrastructure": "Water & Infrastructure",

  "oil & gas": "Oil & Gas",
  "oil and gas": "Oil & Gas",
  "petroleum": "Oil & Gas",

  "finance": "Finance & Banking",
  "finance & banking": "Finance & Banking",
  "financial services": "Finance & Banking",
  "banking": "Finance & Banking",

  "government": "Government & Public Sector",
  "government & public sector": "Government & Public Sector",
  "public sector": "Government & Public Sector",

  "technology": "Technology & IT",
  "technology & it": "Technology & IT",
  "technology and digital": "Technology & IT",
  "it": "Technology & IT",
  "tech": "Technology & IT",

  "healthcare": "Healthcare & Pharma",
  "healthcare & pharma": "Healthcare & Pharma",
  "health & life sciences": "Healthcare & Pharma",
  "pharma": "Healthcare & Pharma",
  "pharmaceutical": "Healthcare & Pharma",

  "real estate": "Real Estate & Construction",
  "real estate & construction": "Real Estate & Construction",
  "construction": "Real Estate & Construction",

  "telecom": "Telecom",
  "telecommunications": "Telecom",
  "tmt": "Telecom",
  "tmt (tech, media, telecom)": "Telecom",

  "education": "Education & Academia",
  "education & academia": "Education & Academia",
  "academia": "Education & Academia",

  "manufacturing": "Manufacturing & Industrial",
  "manufacturing & industrial": "Manufacturing & Industrial",
  "industrial": "Manufacturing & Industrial",

  "defense": "Defense & Aerospace",
  "defense & aerospace": "Defense & Aerospace",
  "aerospace": "Defense & Aerospace",

  "retail": "Retail & Consumer",
  "retail & consumer": "Retail & Consumer",
  "consumer": "Retail & Consumer",

  "transportation": "Transportation & Logistics",
  "transportation & logistics": "Transportation & Logistics",
  "logistics": "Transportation & Logistics",
};

export function normalizeSector(raw: string | null | undefined): string {
  if (!raw) return "Other";
  const trimmed = raw.trim();
  if (!trimmed) return "Other";
  const lower = trimmed.toLowerCase();
  if (SECTOR_NORMALIZATION[lower]) return SECTOR_NORMALIZATION[lower];
  // Already canonical?
  const match = (SECTORS as readonly string[]).find((s) => s.toLowerCase() === lower);
  return match || "Other";
}