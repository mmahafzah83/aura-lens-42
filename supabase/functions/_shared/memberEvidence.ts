/**
 * WHAT THE MEMBER'S OWN RECORD STATES.
 *
 * The mirror of scopeEvidence.ts. There we read what a posting states about the
 * seat; here we read what the member's own record states about him — his
 * positions' descriptions, his CV, his own answers, his own writing.
 *
 * The same two laws, and one more:
 *   1. A field the source does not state is not written. Nothing is inferred.
 *   2. Every claim carries a verbatim quote that can be found again in its
 *      source. A quote that cannot be found is dropped, and the claim with it.
 *   3. A CV names other people. No third-party name, email or telephone number
 *      is stored in a claim or a quote — the quote is cut before it.
 */

export const MEMBER_EVIDENCE_VERSION = "member-evidence-1.0";

export type MemberEvidenceKind =
  | "decision_rights" | "budget_or_pnl" | "team_size" | "organisational_scope"
  | "delivered_outcome" | "sector_delivered" | "qualification"
  | "stated_position" | "capability";

export const MEMBER_EVIDENCE_KINDS: MemberEvidenceKind[] = [
  "decision_rights", "budget_or_pnl", "team_size", "organisational_scope",
  "delivered_outcome", "sector_delivered", "qualification",
  "stated_position", "capability",
];

export type MemberClaim = {
  kind: MemberEvidenceKind;
  claim: string;
  quote: string;
  position_ref: string | null;
};

const SHAPE =
  `Return strict JSON {claims: [{kind, claim, quote, position_ref}]}. ` +
  `kind is one of: decision_rights (he owns, decides or is accountable for something), ` +
  `budget_or_pnl (a stated budget, contract value or profit and loss), ` +
  `team_size (a stated number of people), ` +
  `organisational_scope (enterprise, division, function or team wide), ` +
  `delivered_outcome (a thing stated as delivered, with its result), ` +
  `sector_delivered (a sector he is stated to have worked in), ` +
  `qualification (a degree, certification or licence), ` +
  `stated_position (a view he states he holds), ` +
  `capability (a capability he states of himself). ` +
  `claim is one short sentence in the third person, under 20 words, using only what the text states. ` +
  `quote is copied character for character from the text given — never paraphrased, never stitched together. ` +
  `position_ref is "title at company" when the text ties the claim to one position, otherwise null. ` +
  `State nothing the text does not state. Do not estimate, round, or use general knowledge of what such a ` +
  `role usually involves. If the text states nothing of these kinds, return {claims: []}. ` +
  `PRIVACY: never include any other person's name, email address or telephone number in a claim or a quote. ` +
  `If a sentence carries one, choose a different sentence or stop the quote before the name.`;

export const MEMBER_EVIDENCE_INSTRUCTION = {
  profile: `You read one professional's own LinkedIn profile — the about text and the descriptions he wrote ` +
    `for his own positions — and report only what it states about what he ran and decided. ` + SHAPE,
  cv: `You read one professional's own CV and report only what it states about what he ran and decided. ` + SHAPE,
  assessment: `You read one professional's own answers to a questionnaire about his work. These are his own ` +
    `words about himself. Report what they state. Prefer kind=capability or stated_position unless an answer ` +
    `plainly states a team, a budget, a scope or a sector. ` + SHAPE,
  writing: `You read one professional's own published writing and notes. Writing is evidence of what he THINKS, ` +
    `never of what he ran: a post is not evidence of a budget or a team. Use ONLY kind=stated_position and ` +
    `kind=sector_delivered, and nothing else. ` + SHAPE,
} as const;

// ── privacy ────────────────────────────────────────────────────────────────

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE = /(\+?\d[\d\s().-]{7,}\d)/;
const TITLED_NAME = /\b(mr|mrs|ms|miss|dr|prof|professor|eng|sheikh|h\.e\.|his excellency)\.?\s+[A-Z][a-z]+/i;

/** Cut a piece of text before the first thing that identifies another person. */
export function scrubThirdParty(text: string): string {
  let out = String(text ?? "");
  for (const re of [EMAIL, PHONE, TITLED_NAME]) {
    const m = re.exec(out);
    if (m && m.index >= 0) out = out.slice(0, m.index);
  }
  return out.replace(/\s+/g, " ").trim();
}

// ── verification ───────────────────────────────────────────────────────────

export const normText = (s: string) =>
  String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

export type Verified = { kept: MemberClaim[]; dropped: Array<{ reason: string; quote: string }> };

/**
 * Keep only the claims the source can prove. A quote that is not findable in
 * the source text did not come from the source, whatever the model says.
 */
export function verifyMemberClaims(raw: any, sourceText: string): Verified {
  const hay = normText(sourceText);
  const kept: MemberClaim[] = [];
  const dropped: Array<{ reason: string; quote: string }> = [];
  const list = Array.isArray(raw?.claims) ? raw.claims : Array.isArray(raw) ? raw : [];

  for (const c of list) {
    const kind = String(c?.kind ?? "").trim() as MemberEvidenceKind;
    const claim = scrubThirdParty(String(c?.claim ?? "")).slice(0, 400);
    const rawQuote = String(c?.quote ?? "");
    const quote = scrubThirdParty(rawQuote).slice(0, 600);

    if (!MEMBER_EVIDENCE_KINDS.includes(kind)) {
      dropped.push({ reason: "kind not one of the nine", quote: rawQuote.slice(0, 120) });
      continue;
    }
    if (claim.length < 8) {
      dropped.push({ reason: "claim empty after privacy scrub", quote: rawQuote.slice(0, 120) });
      continue;
    }
    if (quote.length < 12) {
      dropped.push({ reason: "quote too short after privacy scrub", quote: rawQuote.slice(0, 120) });
      continue;
    }
    // The scrubbed quote must still be findable: we look for the scrubbed head.
    if (!hay.includes(normText(quote))) {
      dropped.push({ reason: "quote not found in the source text", quote: quote.slice(0, 120) });
      continue;
    }
    const position_ref = c?.position_ref ? scrubThirdParty(String(c.position_ref)).slice(0, 160) || null : null;
    kept.push({ kind, claim, quote, position_ref });
  }
  return { kept, dropped };
}

// ── the proxy map, shared with the posting side (Step 29) ──────────────────

export type Proxy = { rank: number; label: string } | null;

/** Identical thresholds to gradeFrom() on the posting side — one ladder, both sides. */
export function standingProxy(input: {
  organisational_scope?: string | null;
  team_size?: number | null;
  has_pnl?: boolean;
}): Proxy {
  const scope = String(input.organisational_scope ?? "").toLowerCase();
  const reports = Number(input.team_size);
  if (scope === "enterprise" || input.has_pnl) return { rank: 8, label: "enterprise scope or stated profit and loss" };
  if (scope === "division" || (Number.isFinite(reports) && reports >= 30)) return { rank: 7, label: "division scope or thirty or more reports" };
  if (scope === "function" || (Number.isFinite(reports) && reports >= 8)) return { rank: 5, label: "function scope or eight or more reports" };
  if (scope === "team") return { rank: 4, label: "team scope" };
  return null;
}

/** The number a claim states, when it states one. Never a guess. */
export function numberIn(text: string): number | null {
  const m = /(\d[\d,]*)\s*(\+)?\s*(people|staff|employees|members|professionals|engineers|consultants|reports|fte)?/i.exec(String(text ?? ""));
  if (!m) return null;
  const n = Number(String(m[1]).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** The scope word a claim states, when it states one. */
export function scopeIn(text: string): "enterprise" | "division" | "function" | "team" | null {
  const t = String(text ?? "").toLowerCase();
  if (/\benterprise|organisation-wide|organization-wide|group-wide|company-wide|nationwide|across the (group|organisation|organization)\b/.test(t)) return "enterprise";
  if (/\bdivision|business unit|sector-wide|portfolio\b/.test(t)) return "division";
  if (/\bfunction|department|practice\b/.test(t)) return "function";
  if (/\bteam\b/.test(t)) return "team";
  return null;
}
