/** Display-only names for stored notification titles. Stored rows stay as written. */
const AR_TITLES: Record<string, string> = {
  "Your week in Aura": "أسبوعك في KnownBy",
  "Your first signal is live ✦": "أول إشارة لك ظهرت",
  "Strategic Nudge from Aura": "تنبيه من KnownBy",
};
const EN_TITLES: Record<string, string> = {
  "Your week in Aura": "Your week in KnownBy",
  "Strategic Nudge from Aura": "A nudge from KnownBy",
};
export function displayNotificationTitle(title: string, lang: string): string {
  const key = String(title ?? "").trim();
  return (lang === "ar" ? AR_TITLES[key] : EN_TITLES[key]) ?? title;
}
