/**
 * ONE definition of "onboarded" (D122, law #139).
 *
 * Dashboard and Auth used to disagree — Dashboard tested
 * `onboarding_step >= 4`, Auth tested whether four profile fields were filled.
 * They diverge for any member whose finished journey left `firm` null, which
 * either ping-ponged them between routes or bounced them off a deep link.
 * The step counter is the authority: it is written once, at the ceremony.
 */
export const isOnboarded = (p: any): boolean =>
  Number(p?.onboarding_step ?? 0) >= 4;

/**
 * NOT an onboarding gate. A display-only test of whether the core profile
 * fields are filled, used by the journey/quest progress meters. Never route
 * on this — route on `isOnboarded`.
 */
export const hasCoreProfileFields = (p: any): boolean =>
  !!(p && String(p.first_name ?? "").trim() && p.firm && p.level && p.sector_focus);
