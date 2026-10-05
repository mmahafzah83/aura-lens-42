/**
 * Milestone names arrive in English from the score function. Display maps
 * them by that English name; unknown names fall through unchanged.
 */
const KEYS: Record<string, string> = {
  "Profile complete": "msn.profileComplete",
  "First signal": "msn.firstSignal",
  "Voice trained": "msn.voiceTrained",
  "Published through Aura": "msn.publishedThrough",
  "Brand assessment": "msn.brandAssessment",
  "Five signals": "msn.fiveSignals",
  "Sector depth": "msn.sectorDepth",
  "Weekly rhythm": "msn.weeklyRhythm",
};

export function milestoneNameKey(name: string): string | null {
  return KEYS[name] ?? null;
}

export function milestoneName(name: string, t: (key: string) => string): string {
  const k = KEYS[name];
  return k ? t(k) : name;
}
