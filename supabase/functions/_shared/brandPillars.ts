// MUST mirror src/lib/brandPillars.ts — keep byte-identical
/**
 * Derive 3–5 brand pillars from a stored brand_assessment_results object.
 * Returns [] when nothing user-specific can be derived; callers must NOT
 * substitute generic placeholders.
 */
export function derivePillars(results: Record<string, any> | null | undefined): string[] {
  if (!results || typeof results !== "object") return [];

  const raw = (results as any).content_pillars;
  if (Array.isArray(raw)) {
    const cleaned = raw
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter((s) => s.length > 0);
    if (cleaned.length > 0) return cleaned.slice(0, 5);
  }

  const prose = typeof (results as any).interpretation === "string"
    ? (results as any).interpretation
    : "";
  if (!prose) return [];

  const headingRe = /(?:YOUR\s+3\s+TOPICS|YOUR\s+3\s+AUTHORITY\s+THEMES|MY\s+3\s+AUTHORITY\s+THEMES)/i;
  const m = prose.match(headingRe);
  if (!m || m.index === undefined) return [];

  // Look at the section after the heading, up to the next ## heading or end.
  const after = prose.slice(m.index + m[0].length);
  const sectionEnd = after.search(/\n#{1,6}\s|\n\*\*[A-Z]{2,}/);
  const section = sectionEnd >= 0 ? after.slice(0, sectionEnd) : after;

  // Extract bolded titles: **Title** or **Title:** (strip trailing colon).
  const titles: string[] = [];
  const boldRe = /\*\*([^*\n]{3,160}?)\*\*/g;
  let bm: RegExpExecArray | null;
  while ((bm = boldRe.exec(section)) !== null) {
    const t = bm[1].replace(/:\s*$/, "").trim();
    if (t && !titles.includes(t)) titles.push(t);
    if (titles.length >= 5) break;
  }

  return titles.slice(0, 5);
}