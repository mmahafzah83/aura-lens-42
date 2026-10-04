/** Repairs the parts of a crosscheck answer that code can fix without the model. Pure. */
export function normaliseCrosscheck(parsed: any): { result: any; changes: string[] } {
  const changes: string[] = [];
  if (!parsed || typeof parsed !== "object") return { result: parsed, changes };
  const findings: any[] = Array.isArray(parsed.findings) ? parsed.findings : [];
  for (const f of findings) {
    if (f && typeof f.do_first === "string") {
      const s = f.do_first.trim().toLowerCase();
      if (s === "true" || s === "false") { f.do_first = s === "true"; changes.push("do_first_coerced"); }
    }
  }
  const firsts = findings.filter((f) => f?.do_first === true).length;
  if (findings.length && firsts !== 1) {
    for (const f of findings) if (f) f.do_first = false;
    const pick = findings.find((f) => f?.weight === "high") ?? findings[0];
    if (pick) pick.do_first = true;
    changes.push(firsts === 0 ? "do_first_none_set" : "do_first_several_reduced");
  }
  if (Array.isArray(parsed.recommendations) && parsed.recommendations.length > 5) {
    parsed.recommendations = parsed.recommendations.slice(0, 5);
    changes.push("recommendations_trimmed");
  }
  return { result: parsed, changes };
}
