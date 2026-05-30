/**
 * Render a skill/gap key as a human-readable label.
 * - snake_case or all-lowercase → Title Case with spaces
 * - already has spaces with mixed/upper case → pass through unchanged
 */
export function formatSkillLabel(key: string | null | undefined): string {
  if (!key) return "";
  const raw = String(key).trim();
  if (!raw) return "";

  const hasUnderscore = raw.includes("_");
  const isAllLower = raw === raw.toLowerCase();

  if (!hasUnderscore && !isAllLower) {
    // Already readable (e.g. "Strategic Architecture", "Value-Based P&L")
    return raw;
  }

  return raw
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}