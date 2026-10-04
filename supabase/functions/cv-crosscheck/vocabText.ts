/** Text the banned-vocabulary and platitude checks read: everything except verbatim quotes
 *  (every finding's evidence.cv_line and evidence.profile_line). Pure. */
function allText(v: unknown): string {
  if (typeof v === "string") return ` ${v} `;
  if (Array.isArray(v)) return v.map(allText).join(" ");
  if (v && typeof v === "object") return Object.values(v as Record<string, unknown>).map(allText).join(" ");
  return "";
}

export function vocabText(result: any): string {
  if (!result || typeof result !== "object") return allText(result);
  const copy: any = { ...result };
  if (Array.isArray(result.findings)) {
    copy.findings = result.findings.map((f: any) => {
      if (!f || typeof f !== "object" || !f.evidence || typeof f.evidence !== "object") return f;
      const { cv_line: _c, profile_line: _p, ...restEv } = f.evidence;
      return { ...f, evidence: restEv };
    });
  }
  return allText(copy);
}
