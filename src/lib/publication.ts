// Single source of truth for the user's nameable publication.
// Stored under diagnostic_profiles.identity_intelligence.publication.

export type PublicationStyle = "classic" | "monogram" | "arabic";

export interface PublicationConfig {
  name: string;
  name_ar?: string;
  style: PublicationStyle;
  monogram_char?: string;
}

const BANNED = [
  "authority",
  "thought leader",
  "guru",
  "influencer",
  "ninja",
  "rockstar",
  "zone of genius",
];

function firstWord(s: string | null | undefined): string {
  const t = (s || "").trim();
  if (!t) return "";
  return t.split(/\s+/)[0];
}

export function validate(name: string): string | null {
  const trimmed = (name || "").trim();
  if (trimmed.length < 2 || trimmed.length > 40) {
    return "Publication name must be between 2 and 40 characters.";
  }
  const lower = trimmed.toLowerCase();
  for (const bad of BANNED) {
    if (lower.includes(bad)) {
      return `Try a name without "${bad}" — pick something that sounds like a real publication.`;
    }
  }
  return null;
}

export function getPublication(
  profile: { identity_intelligence?: Record<string, any> | null } | null | undefined,
  lang: "en" | "ar",
  fallbackFirstName?: string | null,
): PublicationConfig {
  const first = firstWord(fallbackFirstName) || (lang === "ar" ? "المحرر" : "Editor");
  const fallback: PublicationConfig =
    lang === "ar"
      ? { name: `نشرة ${first}`, style: "arabic" }
      : { name: `The ${first} Brief`, style: "classic" };

  const ii = (profile?.identity_intelligence as Record<string, any> | undefined) || {};
  const pub = (ii.publication as Partial<PublicationConfig> | undefined) || {};

  const merged: PublicationConfig = {
    name: (pub.name && String(pub.name).trim()) || fallback.name,
    name_ar: pub.name_ar ? String(pub.name_ar) : undefined,
    style: (pub.style as PublicationStyle) || fallback.style,
    monogram_char: pub.monogram_char ? String(pub.monogram_char).slice(0, 1) : undefined,
  };

  // In Arabic mode, prefer the Arabic name if provided.
  if (lang === "ar" && merged.name_ar && merged.name_ar.trim()) {
    return { ...merged, name: merged.name_ar.trim(), style: "arabic" };
  }
  return merged;
}