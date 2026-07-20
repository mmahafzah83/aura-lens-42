// Canonical "profile complete" test for router guards and progress hooks.
// Same four fields used to gate the onboarding wizard — keep this the single
// source of truth so an empty diagnostic_profiles row can never read as onboarded.
export const isProfileComplete = (p: any): boolean =>
  !!(p && String(p.first_name ?? "").trim() && p.firm && p.level && p.sector_focus);