// Canonical seniority list shared by the Request Access form and the
// submit-waitlist edge function. The edge function's ALLOWED_SENIORITY MUST
// stay byte-identical to this list (same strings, same order).
export const SENIORITY_LEVELS = [
  "C-Suite",
  "SVP / EVP",
  "VP",
  "Partner",
  "Senior Director",
  "Director",
  "Senior Manager",
  "Manager",
  "Principal / Fellow",
  "Advisor / Board Member",
  "Other",
] as const;

export type SeniorityLevel = typeof SENIORITY_LEVELS[number];