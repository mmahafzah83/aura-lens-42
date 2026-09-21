/**
 * WHAT THE POSTING STATES.
 *
 * Years of experience and education barely predict anything; evidence of what
 * was actually done predicts several times better. So a record is read once for
 * the facts that carry accountability — who it reports to, how many people, what
 * budget, what it decides, over what scope — each one carrying the sentence it
 * came from.
 *
 * Two laws:
 *   1. A field the posting does not state is null. Nothing is inferred into a null.
 *   2. Every quote must be findable in the stored page text. A quote that cannot
 *      be found is dropped, and the field with it.
 *
 * Extracted ONCE per record at read time, never per member.
 */

export const SCOPE_EVIDENCE_VERSION = "scope-1.0";

export type Quoted<T> = { value: T; quote: string };

export type ScopeEvidence = {
  reports_to: Quoted<string> | null;
  direct_reports: Quoted<number> | null;
  budget_or_pnl: { amount: number | null; currency: string | null; stated: string; quote: string } | null;
  decision_rights: Quoted<"owns" | "shared" | "contributes"> | null;
  organisational_scope: Quoted<"enterprise" | "division" | "function" | "team"> | null;
  accountability_sentences: string[];
  stated_requirements: string[];
  /** What entry costs, verbatim, when the page states a fee. */
  cost_of_door: Quoted<string> | null;
  version: string;
  extracted_at: string;
};

export const SCOPE_EVIDENCE_INSTRUCTION =
  `Also return scope_evidence: ONLY what this page plainly STATES about the accountability of the seat or engagement, ` +
  `each with the verbatim sentence it came from. Shape: ` +
  `{reports_to:{value,quote}|null, direct_reports:{value:number,quote}|null, ` +
  `budget_or_pnl:{amount:number|null, currency:string|null, stated:string, quote}|null, ` +
  `decision_rights:{value:'owns'|'shared'|'contributes',quote}|null, ` +
  `organisational_scope:{value:'enterprise'|'division'|'function'|'team',quote}|null, ` +
  `accountability_sentences:[up to 5 verbatim sentences containing lead, own, accountable for, responsible for, manage, deliver or decide], ` +
  `stated_requirements:[the must-have list, verbatim, one string per requirement], ` +
  `cost_of_door:{value:'the fee exactly as written, e.g. \`$15,000/year\`', quote}|null}. ` +
  `cost_of_door is set only when the page states a price, fee or subscription to take part. ` +
  `A field the page does not state is null — never infer, never estimate, never round. ` +
  `decision_rights is set only from an accountability verb: 'owns' when the page says own/accountable for/decide, ` +
  `'shared' when it says jointly/with/partner with, 'contributes' when it says support/assist/input to. ` +
  `Every quote must be copied character for character from the page text. If you cannot copy it, leave the field null.`;

const norm = (s: string) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

/** A quote that cannot be found in the page text did not come from the page. */
const found = (quote: unknown, haystack: string): boolean => {
  const q = norm(String(quote ?? ""));
  return q.length >= 12 && haystack.includes(q);
};

const asQuoted = <T,>(raw: any, haystack: string, coerce: (v: any) => T | null): Quoted<T> | null => {
  if (!raw || typeof raw !== "object") return null;
  const value = coerce(raw.value);
  if (value === null || value === undefined) return null;
  if (!found(raw.quote, haystack)) return null;
  return { value, quote: String(raw.quote) };
};

const oneOf = <T extends string>(allowed: readonly T[]) => (v: any): T | null => {
  const s = String(v ?? "").toLowerCase().trim();
  return (allowed as readonly string[]).includes(s) ? (s as T) : null;
};

/**
 * Take the model's scope_evidence and keep only what the page can prove.
 * Returns null when nothing survives — an honest absence, not an empty shell.
 */
export function verifyScopeEvidence(raw: any, pageText: string): ScopeEvidence | null {
  if (!raw || typeof raw !== "object") return null;
  const hay = norm(pageText);
  if (hay.length < 100) return null;

  const budgetRaw = raw.budget_or_pnl;
  const budget = budgetRaw && typeof budgetRaw === "object" && found(budgetRaw.quote, hay)
    ? {
      amount: Number.isFinite(Number(budgetRaw.amount)) ? Number(budgetRaw.amount) : null,
      currency: budgetRaw.currency ? String(budgetRaw.currency).slice(0, 8) : null,
      stated: String(budgetRaw.stated ?? "stated: owns P&L").slice(0, 200),
      quote: String(budgetRaw.quote),
    }
    : null;

  const sentences = (Array.isArray(raw.accountability_sentences) ? raw.accountability_sentences : [])
    .map((s: unknown) => String(s ?? "").trim())
    .filter((s: string) => s.length >= 12 && hay.includes(norm(s)))
    .slice(0, 5);

  const requirements = (Array.isArray(raw.stated_requirements) ? raw.stated_requirements : [])
    .map((s: unknown) => String(s ?? "").trim())
    .filter((s: string) => s.length >= 8 && hay.includes(norm(s)))
    .slice(0, 12);

  const out: ScopeEvidence = {
    reports_to: asQuoted<string>(raw.reports_to, hay, (v) => {
      const s = String(v ?? "").trim();
      return s && s.length <= 120 ? s : null;
    }),
    direct_reports: asQuoted<number>(raw.direct_reports, hay, (v) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 && n < 100000 ? Math.floor(n) : null;
    }),
    budget_or_pnl: budget,
    decision_rights: asQuoted(raw.decision_rights, hay, oneOf(["owns", "shared", "contributes"] as const)),
    organisational_scope: asQuoted(raw.organisational_scope, hay, oneOf(["enterprise", "division", "function", "team"] as const)),
    accountability_sentences: sentences,
    stated_requirements: requirements,
    cost_of_door: asQuoted<string>(raw.cost_of_door, hay, (v) => {
      const s = String(v ?? "").trim();
      return s && s.length <= 120 ? s : null;
    }),
    version: SCOPE_EVIDENCE_VERSION,
    extracted_at: new Date().toISOString(),
  };

  const anything = out.reports_to || out.direct_reports || out.budget_or_pnl || out.decision_rights
    || out.organisational_scope || out.accountability_sentences.length || out.stated_requirements.length
    || out.cost_of_door;
  return anything ? out : null;
}
