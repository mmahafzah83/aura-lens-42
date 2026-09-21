/**
 * WRITING VALUE — the four tests, and the subject-overlap test beneath them.
 *
 * What fails the act lane is NOT automatically writing material. A record only
 * enters the write lane when all four of the blueprint's tests hold:
 *   1. the subject fits the member's audience
 *   2. the member has a view or experience on it
 *   3. there is something useful to add
 *   4. it fits how the member is positioned
 * Anything else is discarded — no lane, no card, no generic "Your angle" line.
 *
 * Deterministic. No model. Every test carries the sentence that decided it.
 */
import { tokenise, stemToken, normaliseText } from "./textMatch.ts";
import { classifyProfession } from "./oeScreen.ts";
import type { MemberEvidenceRow, MemberIdentity } from "./oeScreen.ts";
import { secondPersonClause } from "./secondPerson.ts";

/** Words that appear in every professional sentence ever written. They cannot
 *  carry a subject, so an overlap made only of these is not an overlap. */
const GENERIC = new Set([
  "team", "people", "staff", "work", "role", "senior", "manager", "management",
  "lead", "led", "leading", "experience", "year", "company", "organisation",
  "organization", "business", "support", "service", "solution", "process",
  "workflow", "project", "programme", "program", "delivery", "deliver",
  "improve", "improvement", "streamline", "streamlined", "responsible",
  "ensure", "across", "within", "including", "various", "multiple", "large",
  "global", "client", "stakeholder", "objective", "member", "level",
].map((w) => stemToken(normaliseText(w))));

/** An evidence row that only repeats a capability adds nothing to a subject. */
const SUBSTANTIVE = new Set([
  "decision_rights", "budget_or_pnl", "organisational_scope", "team_size",
  "delivered_outcome", "sector_delivered", "stated_position", "qualification",
]);

/** The same bar the requirement matcher holds itself to: a real subject in
 *  common, not a shared word. Cosine over stemmed term frequencies. */
export const LISTING_OVERLAP_MIN = 0.30;
export const SUBJECT_OVERLAP_MIN = 0.12;

export type Overlap = {
  score: number;
  shared: string[];
  /** shared terms that actually name a subject */
  specific: string[];
  passes: boolean;
};

function counts(text: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of tokenise(text).stems) m.set(s, (m.get(s) ?? 0) + 1);
  return m;
}

export function subjectOverlap(subject: string, evidenceText: string): Overlap {
  const a = counts(subject);
  const b = counts(evidenceText);
  let dot = 0;
  const shared: string[] = [];
  for (const [t, n] of a) {
    const o = b.get(t);
    if (o) { dot += n * o; shared.push(t); }
  }
  const norm = (m: Map<string, number>) =>
    Math.sqrt([...m.values()].reduce((s, n) => s + n * n, 0));
  const denom = norm(a) * norm(b);
  const score = denom > 0 ? dot / denom : 0;
  const specific = shared.filter((t) => !GENERIC.has(t) && t.length > 3);
  return {
    score: +score.toFixed(4),
    shared,
    specific,
    passes: score >= SUBJECT_OVERLAP_MIN && shared.length >= 2 && specific.length >= 1,
  };
}

/** The evidence sentence that is actually about this record's subject. */
export function bestStanding(opportunity: any, evidence: MemberEvidenceRow[]) {
  // The subject is what the record is ABOUT — its title and its scope. The
  // sector alone is not a subject: "Saudi public sector" is true of hundreds
  // of records and of half his record, and matching on it is how a radar
  // engineering vacancy acquired an angle.
  const subject = `${opportunity?.title ?? ""} ${opportunity?.scope ?? ""}`;
  let best: { row: MemberEvidenceRow; overlap: Overlap } | null = null;
  for (const row of evidence) {
    const overlap = subjectOverlap(subject, `${row.claim} ${row.quote}`);
    if (!overlap.passes) continue;
    if (!best || overlap.score > best.overlap.score) best = { row, overlap };
  }
  return best;
}

export type WriteTest = { passed: boolean; sentence: string };
export type WriteTests = {
  subject_fits_audience: WriteTest;
  you_have_a_view: WriteTest;
  something_to_add: WriteTest;
  fits_your_positioning: WriteTest;
  all_true: boolean;
  overlap: number | null;
  evidence_id: string | null;
};

const held = (identity: MemberIdentity) =>
  new Set(identity.professions.map((p) => String(p.profession)));

export function writeTests(input: {
  identity: MemberIdentity;
  opportunity: any;
  standing: { has_standing: boolean; reason: string };
  best: { row: MemberEvidenceRow; overlap: Overlap } | null;
  /** sectors the member states he works in, from his own active rules */
  preferredSectors?: string[];
}): WriteTests {
  const { identity, opportunity, standing, best } = input;

  // A JOB LISTING IS THE HARDER CASE. Adjacency and a shared sector word are
  // enough to comment on a market signal; they are not enough to write about
  // somebody else's vacancy. For a listing the subject must be work he has
  // actually done, by profession — a foreign engineering vacancy fails here.
  const role = classifyProfession(opportunity?.title, opportunity?.scope);
  // A record with no established access state is a listing whatever kind it
  // carries — the kind is not a free pass into writing either.
  const isListing = String(opportunity?.kind ?? "") === "executive_role"
    || !String(opportunity?.access_state ?? "").trim();
  const holdsRole = !!role && held(identity).has(String(role));
  const titleStems = new Set(tokenise(String(opportunity?.title ?? "")).stems);
  const titleTerms = (best?.overlap.specific ?? []).filter((t) => titleStems.has(t));
  // For a listing the bar is the subject of the job itself: his own work, and a
  // strong, title-level overlap. A near miss on one shared word is not standing.
  const strongEnough = !!best
    && best.overlap.score >= LISTING_OVERLAP_MIN
    && titleTerms.length >= 2;
  const t1: WriteTest = isListing
    ? holdsRole && strongEnough
      ? { passed: true, sentence: "This is work you have done yourself." }
      : {
        passed: false,
        sentence: holdsRole
          ? "This job is not close enough to what you have done to be worth writing about."
          : "This is a vacancy in work you have not done — not your audience.",
      }
    : {
      passed: standing.has_standing,
      sentence: secondPersonClause(standing.reason) || standing.reason,
    };

  const t2: WriteTest = best
    ? {
      passed: true,
      sentence: `Your own record speaks to this subject: ${secondPersonClause(best.row.claim)}.`,
    }
    : { passed: false, sentence: "Nothing in your record speaks to this subject." };

  const t3: WriteTest = best && SUBSTANTIVE.has(String(best.row.kind))
    ? { passed: true, sentence: "You have done it, not only described it." }
    : { passed: false, sentence: "Nothing here goes beyond a general capability." };

  const text = normaliseText(
    `${opportunity?.sector ?? ""} ${opportunity?.title ?? ""} ${opportunity?.scope ?? ""}`,
  );
  const sectorHit = identity.sectors_delivered.find((s) =>
    s.sector.split(" and ").some((w) => w.length > 3 && text.includes(normaliseText(w)))
  );
  const prefHit = (input.preferredSectors ?? []).find((s) => {
    const key = normaliseText(String(s).replace(/_/g, " "));
    return key.length > 3 && text.includes(key.split(" ")[0]);
  });
  const roleHeld = held(identity).size > 0 && !!best && best.overlap.specific.length >= 2;
  const t4: WriteTest = sectorHit
    ? { passed: true, sentence: `You have delivered in this sector: ${sectorHit.position}.` }
    : prefHit
    ? { passed: true, sentence: "This sits in a sector you have said you work in." }
    : roleHeld
    ? { passed: true, sentence: "The subject sits squarely in the work you are known for." }
    : { passed: false, sentence: "This sits outside how you are positioned." };

  const all_true = t1.passed && t2.passed && t3.passed && t4.passed;
  return {
    subject_fits_audience: t1,
    you_have_a_view: t2,
    something_to_add: t3,
    fits_your_positioning: t4,
    all_true,
    overlap: best ? best.overlap.score : null,
    evidence_id: best ? String(best.row.id) : null,
  };
}
