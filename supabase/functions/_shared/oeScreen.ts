/**
 * THE SCREENING BRAIN.
 *
 * A similarity score will hand a man his own former job one grade lower, and
 * will hand a transformation architect an irrigation engineering seat because
 * both sentences contain the word "water". Neither is a scoring failure. There
 * was no screen. This file is the screen.
 *
 * Nothing here is written for one member. Every threshold is read off the
 * member's own history: the professions he has actually performed, the highest
 * standing he has actually held, the employers he held it at. A second member
 * with a different history screens differently from exactly this code.
 *
 * Three gates, in order. Nothing is scored until it survives all three.
 *   1. LICENCE     — a stated requirement he demonstrably cannot meet.
 *   2. PROFESSION  — does a position in his own history perform this function?
 *   3. LEVEL       — is this above, level with, or beneath what he has held,
 *                    adjusted for the calibre of the employer?
 *
 * LAW: a sector match may never rescue a profession mismatch. "Water" is not a
 * bridge from utilities transformation to irrigation engineering.
 */

import { numberIn, scopeIn, standingProxy } from "./memberEvidence.ts";

// ── PROFESSIONS ────────────────────────────────────────────────────────────
// The function that actually carries a role's accountability. Ordered: the
// most specific accountability wins, because every senior title contains the
// word "director" and half of them contain the word "strategy".

export type Profession =
  | "board_governance" | "engineering_operations" | "healthcare_admin"
  | "finance" | "hr" | "supply_chain" | "sales_marketing"
  | "legal_compliance" | "security_risk" | "data_ai" | "digital_strategy"
  | "transformation" | "programme_governance" | "operating_model"
  | "strategy_consulting" | "policy_research" | "education"
  | "document_management" | "general_management";

export const PROFESSION_LABEL: Record<Profession, string> = {
  board_governance: "board and committee governance",
  engineering_operations: "engineering and operations",
  healthcare_admin: "healthcare administration",
  finance: "finance",
  hr: "human resources",
  supply_chain: "procurement and supply chain",
  sales_marketing: "sales and marketing",
  legal_compliance: "legal and compliance",
  security_risk: "information security and risk",
  data_ai: "data and artificial intelligence",
  digital_strategy: "digital strategy",
  transformation: "transformation",
  programme_governance: "programme and project governance",
  operating_model: "operating model and process design",
  strategy_consulting: "strategy consulting and advisory",
  policy_research: "policy and research",
  education: "education",
  document_management: "document and records management",
  general_management: "general management",
};

const PROFESSION_PATTERNS: Array<[Profession, RegExp]> = [
  ["board_governance", /\bboard (member|of directors|seat|nomination|directorship)|non-?executive director|board and committee|audit committee|committee (member|chair|for)|عضوية مجلس|لجنة المراجعة|مجلس إدارة|الترشيح لعضوية/i],
  ["engineering_operations", /irrigation|civil engineer|mechanical|electrical engineer|construction supervision|engineering design|site (manager|director|industriel)|plant (manager|director)|maintenance|hydropower|\bdam\b|sludge|wastewater|water supply system|sanitation infrastructure|bureau d'étude|contrôle des travaux|industriel/i],
  ["healthcare_admin", /hospital (managing )?director|healthcare (administration|operations|management)|clinical (director|operations)|medical director/i],
  ["finance", /\bcfo\b|chief financial|finance (manager|director|lead|interim)|financial control|treasur|investment (manager|director|associate)|hedge fund|private (equity|markets)|relationship support manager|banking/i],
  ["hr", /human resources|\bhr\b|total rewards|organisational development|organizational development|\bod &|talent acquisition|compensation and benefits|saudization/i],
  ["supply_chain", /procurement|supply chain|logistics manager|sourcing|tender board|prequalification of (suppliers|contractors)/i],
  ["sales_marketing", /sales (director|manager)|marketing (manager|director)|business development manager|advertising|media partner(ship)?|ecosystem partner|premium ev/i],
  ["legal_compliance", /legal counsel|data protection officer|\bgdpr\b|compliance (manager|officer)|regulatory affairs/i],
  ["security_risk", /information security|cyber ?security|governance & assurance|assurance manager|risk management/i],
  ["data_ai", /\bai\b|artificial intelligence|machine learning|\bdata\b|analytics|high-?performance computing|\bhpc|biotechnolog/i],
  ["digital_strategy", /digital (transformation|strategy|advisor|access|practice)|technology strategy|it (applications|manager|strategy)|automation|digitalization|digitalisation/i],
  ["transformation", /transformation|change management|modernis|moderniz|\breform\b/i],
  ["programme_governance", /programme management|program management|project management|\bpmo\b|portfolio (management|director)|delivery (director|manager)|program\b/i],
  ["operating_model", /operating model|process (design|management|improvement|control)|business process|organisation design|shared services|processes control/i],
  ["strategy_consulting", /strateg|management consult|advisory|consultant|consultancy|consulting|\bpartner\b/i],
  ["policy_research", /policy|research (associate|fellow|project)|think tank|task force|seminar|symposium|curator|biennale|training program|membership program|speaker|macroeconomic|poverty/i],
  ["education", /education|academic|university|school|teaching|skills/i],
  ["document_management", /document(ation)? (management|control)|records management|archiv/i],
  ["general_management", /general manager|managing director|\bceo\b|chief executive|country manager|site director/i],
];

/** The profession a piece of text carries. Null when nothing is stated. */
export function classifyProfession(...parts: Array<string | null | undefined>): Profession | null {
  const text = parts.filter(Boolean).join(" ");
  if (!text.trim()) return null;
  for (const [p, re] of PROFESSION_PATTERNS) if (re.test(text)) return p;
  return null;
}

export type ProfessionRead = {
  profession: Profession | null;
  source: "title" | "accountability_sentence" | "none";
  quote: string | null;
  /** whether the posting's own body could be read at all */
  body_readable?: boolean;
};

/**
 * THE PROFESSION IS READ, NOT GUESSED.
 *
 * The posting's own body is read first — the sentences that say what the holder
 * is accountable for, and the requirements it states — and the sentence that
 * established the profession is carried with it. A title is a label an employer
 * chose; it is read ONLY when there is no body to read, and a record read that
 * way can never be refused on profession. It passes as unconfirmed and says so.
 */
export function professionOf(opportunity: any): ProfessionRead {
  const ev = opportunity?.scope_evidence ?? {};
  const body: string[] = [
    ...(Array.isArray(ev?.accountability_sentences) ? ev.accountability_sentences : []),
    ...(Array.isArray(ev?.stated_requirements) ? ev.stated_requirements : []),
    ...String(opportunity?.scope ?? "").split(/(?<=[.!?])\s+/),
  ].map((s) => String(s ?? "").replace(/\s+/g, " ").trim()).filter((s) => s.length > 25);

  if (body.length) {
    for (const sentence of body) {
      const p = classifyProfession(sentence);
      if (p && p !== "general_management") {
        return { profession: p, source: "accountability_sentence", quote: sentence.slice(0, 400), body_readable: true };
      }
    }
    for (const sentence of body) {
      const p = classifyProfession(sentence);
      if (p) {
        return { profession: p, source: "accountability_sentence", quote: sentence.slice(0, 400), body_readable: true };
      }
    }
    // The body was read and it names no profession. That is an unstated
    // profession, not a title to fall back on.
    return { profession: null, source: "none", quote: null, body_readable: true };
  }

  const fromTitle = classifyProfession(opportunity?.title, opportunity?.scope);
  return fromTitle
    ? { profession: fromTitle, source: "title", quote: null, body_readable: false }
    : { profession: null, source: "none", quote: null, body_readable: false };
}


/**
 * Adjacency. A neighbouring profession is a bridge ONLY when a named position
 * in the member's own history sits in it. Sector never appears here, and never
 * will: the engine matched the word and ignored the work.
 */
const ADJACENT: Record<Profession, Profession[]> = {
  transformation: ["digital_strategy", "operating_model", "programme_governance", "strategy_consulting", "general_management"],
  digital_strategy: ["transformation", "data_ai", "strategy_consulting", "programme_governance"],
  data_ai: ["digital_strategy", "transformation", "strategy_consulting"],
  programme_governance: ["transformation", "operating_model", "digital_strategy"],
  operating_model: ["transformation", "programme_governance", "strategy_consulting"],
  strategy_consulting: ["transformation", "digital_strategy", "operating_model", "policy_research"],
  policy_research: ["strategy_consulting", "education"],
  board_governance: ["general_management", "strategy_consulting", "finance", "transformation"],
  general_management: ["transformation", "board_governance"],
  finance: ["board_governance"],
  hr: ["general_management"],
  supply_chain: ["operating_model"],
  healthcare_admin: ["general_management"],
  engineering_operations: ["supply_chain"],
  security_risk: ["data_ai"],
  sales_marketing: [],
  legal_compliance: ["security_risk"],
  education: ["policy_research"],
  document_management: ["operating_model"],
};

// ── EMPLOYER LADDER ────────────────────────────────────────────────────────
// A Director at a boutique is not a Senior Manager at EY — and a Director at
// Aramco is not a Director at a two-person consultancy either. The ladder is
// a JUDGEMENT about employers, so it lives in data (oe_employer_ladder), one
// row per employer pattern per country, editable without a deploy. Nothing
// here is a hard-coded list of firms.
//
// Short forms such as SAR, SAB and NCA are seeded anchored to the WHOLE name
// (^\s*sar\s*$), and every pattern is matched against an employer-name field
// only — never against scope, requirements or salary prose.

export type Tier = "tier_1" | "tier_2" | "tier_3" | "unknown";
export type Band = "anchor" | "major" | "local";

export type LadderRow = {
  country: string;
  band: Band;
  pattern: string;
  label_en: string;
  standing_bonus: number | string | null;
  active?: boolean | null;
};

export type Placement = {
  tier: Tier;
  band: Band | null;
  label: string;
  bonus: number;
  matched: string | null;
};

export const TIER_LABEL: Record<Tier, string> = {
  tier_1: "a national anchor or top-tier firm",
  tier_2: "a major employer",
  tier_3: "a local or in-house employer",
  unknown: "an employer we could not place",
};

const BAND_TIER: Record<Band, Tier> = { anchor: "tier_1", major: "tier_2", local: "tier_3" };
const BAND_ORDER: Band[] = ["anchor", "major", "local"];

/** An intermediary does not disclose the employer, so the employer cannot be tiered. */
const INTERMEDIARY = /michael page|page group|hays\b|robert half|robert walters|korn ferry|heidrick|egon zehnder|spencer stuart|recruit|talent search|headhunt/i;

const RE_CACHE = new Map<string, RegExp | null>();
const compiled = (pattern: string): RegExp | null => {
  if (!RE_CACHE.has(pattern)) {
    try { RE_CACHE.set(pattern, new RegExp(pattern, "i")); } catch { RE_CACHE.set(pattern, null); }
  }
  return RE_CACHE.get(pattern) ?? null;
};

const UNPLACED: Placement = { tier: "unknown", band: null, label: TIER_LABEL.unknown, bonus: 0, matched: null };
const LOCAL: Placement = { tier: "tier_3", band: "local", label: TIER_LABEL.tier_3, bonus: 0, matched: null };

/**
 * Place an employer on the ladder. Rows for the record's country and the
 * global rows ('XX') are both consulted, anchors before majors. Nothing
 * matched means 'local' — never a guess, and never a code list.
 */
export function employerTier(
  name: string | null | undefined,
  ladder: LadderRow[],
  country?: string | null,
): Placement {
  const n = String(name ?? "").trim();
  if (!n) return UNPLACED;
  if (INTERMEDIARY.test(n)) return { ...UNPLACED, matched: "intermediary" };

  const ctry = String(country ?? "").trim().toUpperCase();
  const rows = (ladder ?? []).filter((r) =>
    r.active !== false && (r.country === "XX" || !ctry || String(r.country).toUpperCase() === ctry));

  for (const band of BAND_ORDER) {
    for (const r of rows) {
      if (r.band !== band) continue;
      const re = compiled(r.pattern);
      if (re && re.test(n)) {
        return {
          tier: BAND_TIER[band],
          band,
          label: r.label_en || TIER_LABEL[BAND_TIER[band]],
          bonus: Number(r.standing_bonus ?? 0) || 0,
          matched: r.pattern,
        };
      }
    }
  }
  return LOCAL;
}


// ── THE GRADE LADDER ───────────────────────────────────────────────────────
// Within a tier. Ordered, most senior first, because every senior title also
// contains a junior word somewhere.

const GRADES: Array<[number, string, RegExp]> = [
  [11, "board seat", /\bboard (member|of directors|seat|nomination|directorship)|non-?executive director|committee (member|chair)|عضوية مجلس|لجنة المراجعة/i],
  [10, "chief executive", /\bchief\b|\bceo\b|\bcfo\b|\bcoo\b|\bcto\b|\bcio\b|chief executive|president\b|managing director|general manager|رئيس تنفيذي/i],
  [9, "partner or vice president", /\bpartner\b|vice president|\bvp\b|managing partner|نائب رئيس/i],
  [8, "senior director or head of function", /senior director|head of\b|group director|رئيس قطاع/i],
  [7, "director", /\bdirector\b|مدير تنفيذي/i],
  [5, "senior manager", /senior manager|principal consultant|مدير أول/i],
  [4, "manager", /\bmanager\b|head of department|team leader|section head|مدير/i],
  [3, "lead or senior consultant", /\blead\b|senior consultant|senior .* consultant|senior specialist/i],
  [2, "consultant or specialist", /consultant|advisor|adviser|specialist|associate|analyst|officer|engineer|curator|speaker|researcher/i],
];

export function gradeOf(title?: string | null): { rank: number; label: string } | null {
  const t = String(title ?? "").trim();
  if (!t) return null;
  for (const [rank, label, re] of GRADES) if (re.test(t)) return { rank, label };
  return null;
}

/**
 * Seniority is decision rights, magnitude and scope — not a title. When the
 * posting states any of those, they decide the grade and the title becomes the
 * tie-breaker (a title reading higher than the stated scope is not thrown away).
 * When the posting states none of them, the title stands alone.
 */
export type GradeRead = { rank: number; label: string; basis: "title" | "proxies" } | null;

export function gradeFrom(opportunity: any): GradeRead {
  const title = gradeOf(opportunity?.title) ?? gradeOf(opportunity?.scope);
  const ev = opportunity?.scope_evidence ?? null;

  const reports = Number(ev?.direct_reports?.value);
  const scope = String(ev?.organisational_scope?.value ?? "");
  const hasPnl = !!ev?.budget_or_pnl;

  let proxy: { rank: number; label: string } | null = null;
  if (scope === "enterprise" || hasPnl) proxy = { rank: 8, label: "enterprise scope or stated profit and loss" };
  else if (scope === "division" || (Number.isFinite(reports) && reports >= 30)) proxy = { rank: 7, label: "division scope or thirty or more reports" };
  else if (scope === "function" || (Number.isFinite(reports) && reports >= 8)) proxy = { rank: 5, label: "function scope or eight or more reports" };
  else if (scope === "team") proxy = { rank: 4, label: "team scope" };

  if (!proxy) return title ? { ...title, basis: "title" } : null;
  if (title && title.rank > proxy.rank) return { ...title, basis: "proxies" };
  return { ...proxy, basis: "proxies" };
}


// ── THE MEMBER, DERIVED ────────────────────────────────────────────────────

export type MemberPosition = {
  title: string;
  company: string;
  started: string | null;
  ended: string | null;
  profession: Profession | null;
  /** how the profession was established, so a verdict is auditable */
  profession_source: "title" | "accountability_sentence";
  profession_source_quote: string | null;
  grade: number | null;
  grade_label: string | null;
  /** title, or the stated scope, reports and profit and loss in his own record */
  grade_basis: "title" | "proxies" | "none";
  tier: Tier;
  tier_label: string;
  standing: number | null;
};

/**
 * A claim the member's own record STATES about him, with the quote that proves
 * it. Extracted once by oe-extract-member-evidence, read here — never inferred.
 */
export type MemberEvidenceRow = {
  id: string;
  kind: string;
  claim: string;
  quote: string;
  position_ref: string | null;
  confidence: number | string | null;
  source_table: string | null;
};

export type MemberIdentity = {
  positions: MemberPosition[];
  professions: Array<{ profession: Profession; label: string; positions: string[] }>;
  highest_standing: {
    standing: number | null;
    title: string | null;
    company: string | null;
    tier: Tier | null;
    grade_label: string | null;
    period: string | null;
    /** the title, or what his own record states he ran */
    basis: "title" | "proxies" | "none";
  };
  sectors_delivered: Array<{ sector: string; position: string }>;
  qualifications: Array<{ kind: string; title: string; institution: string | null; year: string | null }>;
  scope_evidence: Array<{ position: string; evidence: string; evidence_id?: string; kind?: string; quote?: string }>;
};

const periodOf = (p: MemberPosition) => [p.started, p.ended].filter(Boolean).join(" to ");

/** Named as a position was held at it — the sector he actually delivered in. */
const SECTOR_PATTERNS: Array<[string, RegExp]> = [
  ["water and utilities", /\bnwc\b|water|utilit|sanitation/i],
  ["transport and infrastructure", /metro|rail|transport|infrastructure|construction|contracting|contractors/i],
  ["energy", /energy|power|oil|gas|petro/i],
  ["government and public sector", /ministry|authority|government|public sector|municipal/i],
  ["professional services", /consult|advisory|\bey\b|deloitte|pwc|kpmg|wipro|devoteam|accenture|capgemini/i],
  ["education", /university|school|institute|academy|education/i],
  ["healthcare", /hospital|health|clinic|medical/i],
  ["financial services", /bank|insurance|finance|capital|invest/i],
];

const normRef = (s: string) =>
  String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

/** Claims his own record ties to this position. */
function evidenceFor(evidence: MemberEvidenceRow[], ref: string): MemberEvidenceRow[] {
  const want = normRef(ref);
  if (!want) return [];
  return evidence.filter((row) => {
    const got = normRef(row.position_ref ?? "");
    return !!got && (got === want || want.includes(got) || got.includes(want));
  });
}

/**
 * Build the member's identity from the saved profile snapshot AND from what his
 * own record states about him — his position descriptions, his CV, his answers.
 * Derived, never hand-written: the same function run against another member's
 * record yields that member's professions, standing and sectors.
 *
 * A title is still read first. It is simply no longer the only thing read: a
 * seat is judged by decision rights, magnitude and scope, and where his record
 * states those, they decide.
 */
export function deriveIdentity(
  snapshot: any,
  ladder: LadderRow[] = [],
  evidence: MemberEvidenceRow[] = [],
): MemberIdentity {
  const experience: any[] = Array.isArray(snapshot?.experience) ? snapshot.experience : [];
  const education: any[] = Array.isArray(snapshot?.education) ? snapshot.education : [];
  const certifications: any[] = Array.isArray(snapshot?.certifications) ? snapshot.certifications : [];

  const positions: MemberPosition[] = experience.map((e) => {
    const title = String(e?.position ?? e?.title ?? "").trim();
    const company = String(e?.companyName ?? e?.company ?? "").trim();
    const placed = employerTier(company, ladder);
    const grade = gradeOf(title);
    const mine = evidenceFor(evidence, `${title} at ${company}`);

    // PROFESSION — the title first, because a title is an employer's own
    // statement of accountability. Only when it says nothing, or nothing more
    // than "general management", may what he stated he was accountable for be
    // read, and only those sentences.
    const fromTitle = classifyProfession(title);
    let profession: Profession | null = fromTitle;
    let profession_source: "title" | "accountability_sentence" = "title";
    let profession_source_quote: string | null = null;
    if (!fromTitle || fromTitle === "general_management") {
      for (const row of mine) {
        if (!["decision_rights", "delivered_outcome", "organisational_scope"].includes(row.kind)) continue;
        const p = classifyProfession(row.claim, row.quote);
        if (p && p !== "general_management") {
          profession = p;
          profession_source = "accountability_sentence";
          profession_source_quote = String(row.quote).slice(0, 400);
          break;
        }
      }
    }

    // GRADE — the same proxy map the posting side uses, read off what his own
    // record states he ran. The title is the tie-breaker, never thrown away.
    const team = mine.filter((r) => r.kind === "team_size")
      .map((r) => numberIn(`${r.claim} ${r.quote}`)).filter((n): n is number => n !== null);
    const scopeWord = mine.filter((r) => r.kind === "organisational_scope")
      .map((r) => scopeIn(`${r.claim} ${r.quote}`)).find(Boolean) ?? null;
    const hasPnl = mine.some((r) => r.kind === "budget_or_pnl");
    const proxy = standingProxy({
      organisational_scope: scopeWord,
      team_size: team.length ? Math.max(...team) : null,
      has_pnl: hasPnl,
    });

    let rank = grade?.rank ?? null;
    let grade_label = grade?.label ?? null;
    let grade_basis: "title" | "proxies" | "none" = grade ? "title" : "none";
    if (proxy) {
      grade_basis = "proxies";
      if (!grade || proxy.rank > grade.rank) { rank = proxy.rank; grade_label = proxy.label; }
    }

    return {
      title,
      company,
      started: e?.startDate?.text ?? null,
      ended: e?.endDate?.text ?? null,
      profession,
      profession_source,
      profession_source_quote,
      grade: rank,
      grade_label,
      grade_basis,
      tier: placed.tier,
      tier_label: placed.label,
      standing: rank !== null ? +(rank + placed.bonus).toFixed(2) : null,
    };
  }).filter((p) => p.title);


  const byProfession = new Map<Profession, string[]>();
  for (const p of positions) {
    if (!p.profession) continue;
    const list = byProfession.get(p.profession) ?? [];
    list.push(`${p.title} at ${p.company}${periodOf(p) ? ` (${periodOf(p)})` : ""}`);
    byProfession.set(p.profession, list);
  }

  let top: MemberPosition | null = null;
  for (const p of positions) {
    if (p.standing === null) continue;
    if (!top || (top.standing ?? -1) < p.standing) top = p;
  }

  const sectors: Array<{ sector: string; position: string }> = [];
  for (const p of positions) {
    for (const [sector, re] of SECTOR_PATTERNS) {
      if (!re.test(`${p.company} ${p.title}`)) continue;
      if (sectors.some((s) => s.sector === sector)) continue;
      sectors.push({ sector, position: `${p.title} at ${p.company}` });
    }
  }
  // A sector his own record STATES he delivered in, named where he named it.
  for (const row of evidence) {
    if (row.kind !== "sector_delivered") continue;
    for (const [sector, re] of SECTOR_PATTERNS) {
      if (!re.test(`${row.claim} ${row.quote}`)) continue;
      if (sectors.some((s) => s.sector === sector)) continue;
      sectors.push({ sector, position: row.position_ref ?? "stated in your own record" });
    }
  }

  const qualifications = [
    ...education.map((e) => ({
      kind: "degree",
      title: [e?.degree, e?.fieldOfStudy].filter(Boolean).join(", "),
      institution: e?.schoolName ?? null,
      year: e?.endDate?.text ?? e?.period ?? null,
    })),
    ...certifications.map((c) => ({
      kind: "certification",
      title: String(c?.title ?? ""),
      institution: c?.issuedBy ?? null,
      year: String(c?.issuedAt ?? "").replace(/^Issued\s*/i, "") || null,
    })),
  ].filter((q) => q.title);

  // What he ran: the standing his positions carry, and — first, because it is
  // evidence rather than inference — what his own record states he ran, each
  // line carrying the row it came from so the member can see where it came from.
  const scope_evidence = [
    ...evidence
      .filter((row) => ["decision_rights", "budget_or_pnl", "team_size", "organisational_scope", "delivered_outcome"].includes(row.kind))
      .map((row) => ({
        position: row.position_ref ?? "stated in your own record",
        evidence: row.claim,
        evidence_id: row.id,
        kind: row.kind,
        quote: row.quote,
      })),
    ...positions
      .filter((p) => (p.grade ?? 0) >= 5)
      .map((p) => ({
        position: `${p.title} at ${p.company}`,
        evidence: `${p.grade_label ?? "position"} at ${p.tier_label ?? TIER_LABEL[p.tier]}${periodOf(p) ? `, ${periodOf(p)}` : ""}`,
      })),
  ];

  return {
    positions,
    professions: [...byProfession.entries()].map(([profession, list]) => ({
      profession, label: PROFESSION_LABEL[profession], positions: list,
    })),
    highest_standing: {
      standing: top?.standing ?? null,
      title: top?.title ?? null,
      company: top?.company ?? null,
      tier: top?.tier ?? null,
      grade_label: top?.grade_label ?? null,
      period: top ? periodOf(top) : null,
      basis: top?.grade_basis ?? "none",
    },
    sectors_delivered: sectors,
    qualifications,
    scope_evidence,
  };
}

// ── THE GATES ──────────────────────────────────────────────────────────────

export type GateResult = {
  gate:
    | "place" | "nationality" | "licence" | "certification" | "clearance" | "language" | "other"
    | "profession" | "level" | "presentation" | "scored";
  outcome: "rejected" | "unknown" | "survivor";
  sentence: string | null;
  role_profession: Profession | null;
  profession_relation: "same" | "adjacent" | "different" | "unstated" | null;
  employer_tier: Tier | null;
  level_direction: "below" | "lateral" | "one_above" | "two_plus" | "unknown" | "not_applicable" | null;
  standing_gap: number | null;
  bridge: string | null;
  stretch: boolean;
  /** how the record's profession and grade were established, so a verdict is auditable */
  profession_source: "title" | "accountability_sentence" | "none" | null;
  profession_source_quote: string | null;
  grade_basis: "title" | "proxies" | "none" | null;
  /** an unknown that was carried rather than dropped, and the line it must answer for */
  gate_note?: string | null;
  answer_for?: string | null;

};

/** GATE 2 — is this his profession? A sector match may never rescue it. */
export function professionGate(identity: MemberIdentity, opportunity: any) {
  const read = professionOf(opportunity);
  const role = read.profession;
  const held = new Map(identity.professions.map((p) => [p.profession, p.positions]));

  if (!role) {
    return { role, read, relation: "unstated" as const, bridge: null, sentence: null };
  }
  const own = held.get(role);
  if (own?.length) {
    return { role, read, relation: "same" as const, bridge: own[0], sentence: null };
  }
  for (const neighbour of ADJACENT[role] ?? []) {
    const via = held.get(neighbour);
    if (via?.length) {
      return {
        role,
        read,
        relation: "adjacent" as const,
        bridge: `${via[0]} — ${PROFESSION_LABEL[neighbour]} bridges to ${PROFESSION_LABEL[role]}`,
        sentence: null,
      };
    }
  }
  const mine = identity.professions.map((p) => p.label).join(", ") || "not established from your history";
  return {
    role,
    read,
    relation: "different" as const,
    bridge: null,
    sentence:
      `Different profession — the role is ${PROFESSION_LABEL[role]}; your evidence is ${mine}; ` +
      `no position in your history performed this function.`,
  };
}

/**
 * WHO WE MATCH HIM AS — the CURRENT role, normalised to a market level
 * (oe_identity, resolved in SQL). History is evidence; it never sets the bar.
 */
export type CurrentIdentity = {
  market_level: string | null;
  title: string | null;
  employer: string | null;
  status: "confirmed" | "inferred" | "needs_confirmation";
  step_up: boolean;
};

const LADDER = ["ic", "manager", "senior_manager", "director", "senior_director", "vp", "c_suite", "board"];
const ladderIndex = (level?: string | null) => LADDER.indexOf(String(level ?? "").trim());
const ladderLabel = (level: string) => level === "c_suite" ? "C-suite" : level === "ic" ? "individual role" : level.replace(/_/g, " ");

/** Weight of a position's evidence by how long ago it ended. Half-life five years; current = 1. */
export function recencyWeight(ended?: string | null, now = new Date()): number {
  const text = String(ended ?? "").trim();
  if (!text || /present|current|now|حتى الآن|حاليا/i.test(text)) return 1;
  const year = Number((/(19|20)\d{2}/.exec(text) ?? [])[0]);
  if (!Number.isFinite(year) || !year) return 0.5;
  const years = Math.max(0, now.getUTCFullYear() - year);
  return +Math.pow(0.5, years / 5).toFixed(3);
}

/** GATE 3 — level direction, adjusted for where the employer sits on the ladder. */
export function levelGate(
  identity: MemberIdentity,
  opportunity: any,
  routeIsSpecific: boolean,
  ladder: LadderRow[] = [],
  current: CurrentIdentity | null = null,
) {
  const mine = identity.highest_standing;
  const placed = employerTier(opportunity?.issuer_raw, ladder, opportunity?.country ?? null);
  const tier = placed.tier;

  // The member's current market level sets the band: market .. market+1
  // (+2 on a step-up move); below market-1 is below. While his roles
  // disagree, a mismatch is unknown — no verdict without his answer.
  if (current?.market_level && ladderIndex(current.market_level) >= 0) {
    const band = String(opportunity?.level_band ?? "").trim();
    const roleLevel = ladderIndex(band) >= 0 ? band : null;
    if (!roleLevel) {
      return { direction: "unknown" as const, gap: null, tier, placed, sentence: null, basis: "none" as const, reason: "role_grade_unreadable" };
    }
    const gap = ladderIndex(roleLevel) - ladderIndex(current.market_level);
    const top = current.step_up ? 2 : 1;
    const as = `we match you as ${ladderLabel(current.market_level)} (${current.title ?? "your current role"}${current.employer ? ` at ${current.employer}` : ""})`;
    const thisOne = `this is ${opportunity?.title} at ${opportunity?.issuer_raw ?? "an employer at the same tier"}, a ${ladderLabel(roleLevel)} seat`;
    if (gap < -1) {
      if (current.status === "needs_confirmation") {
        return { direction: "unknown" as const, gap, tier, placed, sentence: null, basis: "title" as const, reason: "identity_unconfirmed" };
      }
      return { direction: "below" as const, gap, tier, placed, reason: null, basis: "title" as const, sentence: `Below your level — ${as}; ${thisOne}.` };
    }
    if (gap <= 0) return { direction: "lateral" as const, gap, tier, placed, sentence: null, reason: null, basis: "title" as const };
    if (gap === 1) return { direction: "one_above" as const, gap, tier, placed, sentence: null, reason: null, basis: "title" as const };
    return { direction: "two_plus" as const, gap, tier, placed, sentence: null, reason: gap > top ? "above_band" : null, basis: "title" as const };
  }

  // The grade is read from what the posting states about scope, reports and
  // profit and loss where it states them, and from the title where it does not.
  const grade = gradeFrom(opportunity);
  const basis = (grade?.basis ?? "none") as "title" | "proxies" | "none";

  if (mine.standing === null || !grade) {
    return {
      direction: "unknown" as const, gap: null, tier, placed, sentence: null, basis,
      reason: !grade ? "role_grade_unreadable" : "member_standing_unreadable",
    };
  }
  // The ladder ADJUSTS a grade; it never decides one. An employer we have not
  // placed yet carries no bonus, and the title still reads.
  const bonus = tier === "unknown" ? 0 : placed.bonus;

  const standing = +(grade.rank + bonus).toFixed(2);

  const gap = +(standing - mine.standing).toFixed(2);
  const held = `you held ${mine.title} at ${mine.company}${mine.period ? ` from ${mine.period}` : ""}`;
  const thisOne = `this is ${opportunity?.title} at ${opportunity?.issuer_raw ?? "an employer at the same tier"}`;

  if (gap <= -1) {
    return {
      direction: "below" as const, gap, tier, placed, reason: null, basis,
      sentence: `Below your standing — ${held}; ${thisOne}.`,
    };
  }
  if (gap < 1) {
    if (routeIsSpecific) return { direction: "lateral" as const, gap, tier, placed, sentence: null, reason: null, basis };
    return {
      direction: "lateral" as const, gap, tier, placed, reason: null, basis,
      sentence: `Level with what you already hold — ${held} — and it opens no route your current seat does not already give you.`,
    };
  }
  if (gap < 2) return { direction: "one_above" as const, gap, tier, placed, sentence: null, reason: null, basis };
  return { direction: "two_plus" as const, gap, tier, placed, sentence: null, reason: null, basis };
}

// ── GATE 1, NAMED HONESTLY ─────────────────────────────────────────────────
// The first gate is not "licence". It is whatever the eligibility screen
// actually found. A man told he was "ruled out on licence" for a seat in
// Singapore has been told something untrue.

export type GateOneCause =
  | "place" | "nationality" | "licence" | "certification" | "clearance" | "language" | "other";

export function causeOf(fail: string): GateOneCause {
  const f = String(fail ?? "").toLowerCase();
  if (f.startsWith("place")) return "place";
  if (f.includes("nationality") || f.includes("citizen")) return "nationality";
  if (f.includes("licen") || f.includes("registration") || f.includes("bar admission")) return "licence";
  if (f.includes("certif") || f.includes("accredit") || f.includes("chartered")) return "certification";
  if (f.includes("clearance") || f.includes("vetting") || f.includes("security_check")) return "clearance";
  if (f.includes("language") || f.includes("arabic") || f.includes("english")) return "language";
  return "other";
}

export type MemberPlace = { where?: string | null; nationality?: string | null };

/** The sentence a person would write, naming the actual cause. */
export function gateOneSentence(cause: GateOneCause, fail: string, opportunity: any, member: MemberPlace): string {
  const seat = String(opportunity?.title ?? "this seat");
  const where = String(opportunity?.location ?? "").trim();
  const mine = String(member?.where ?? "").trim();
  switch (cause) {
    case "place":
      return where && mine
        ? `Wrong place — ${seat} is in ${where}, and you work from ${mine}. A full-time seat there is not one you can hold from here.`
        : `Wrong place — this seat sits outside the countries you work in.`;
    case "nationality": {
      const phrase = fail.split(":").slice(1).join(":").trim();
      const has = String(member?.nationality ?? "").trim();
      return phrase
        ? `Nationality — the record asks for "${phrase}"${has ? `, and your record states ${has}` : ""}.`
        : `Nationality — the record states a citizenship requirement you do not meet.`;
    }
    case "licence":
      return `Licence — this seat requires a licence to practise that your record does not show.`;
    case "certification":
      return `Certification — this seat requires a certification your record does not show.`;
    case "clearance":
      return `Clearance — this seat requires a security clearance your record does not show.`;
    case "language":
      return `Language — this seat states a language requirement your record does not show.`;
    default:
      return `Ruled out — the record states ${String(fail).replace(/_/g, " ")}, which your record cannot satisfy.`;
  }
}

/**
 * The three gates in order. Gate 1 is the eligibility screen already built in
 * oeEligibility; its verdict is passed in rather than recomputed here — but
 * its NAME is taken from what it found, never assumed.
 */
export function runGates(
  identity: MemberIdentity,
  opportunity: any,
  licence: { outcome: "excluded" | "unknown" | "eligible"; fails: string[]; unknowns: string[] },
  routeIsSpecific: boolean,
  ctx: { ladder?: LadderRow[]; member?: MemberPlace } = {},
): GateResult {
  const ladder = ctx.ladder ?? [];
  const base: GateResult = {
    gate: "scored", outcome: "survivor", sentence: null, role_profession: null,
    profession_relation: null, employer_tier: null, level_direction: null,
    standing_gap: null, bridge: null, stretch: false,
    profession_source: null, profession_source_quote: null, grade_basis: null,
  };

  if (licence.outcome === "excluded") {
    // Nationality is named ahead of the rest only because it is the one a
    // member most often disputes; otherwise the first stated failure stands.
    const fail = licence.fails.find((f) => f.toLowerCase().includes("nationality"))
      ?? licence.fails[0] ?? "a stated requirement";
    const cause = causeOf(fail);
    return {
      ...base, gate: cause, outcome: "rejected",
      sentence: gateOneSentence(cause, fail, opportunity, ctx.member ?? {}),
    };
  }

  const prof = professionGate(identity, opportunity);
  const withProf: GateResult = {
    ...base, role_profession: prof.role, profession_relation: prof.relation, bridge: prof.bridge,
    profession_source: prof.read.source, profession_source_quote: prof.read.quote,
  };
  if (prof.relation === "different") {
    // A profession read off a label, because the posting's own body could not
    // be read, is not a verdict. It is carried, marked, and answered for.
    if (prof.read.source === "title") {
      return {
        ...withProf, gate: "scored", outcome: "survivor", sentence: null,
        gate_note: "profession_unconfirmed",
        answer_for: "We could not read what this role is accountable for",
      };
    }
    return { ...withProf, gate: "profession", outcome: "rejected", sentence: prof.sentence };
  }

  // GATE 3 applies only to kinds that carry a seat with a grade. The catalogue
  // says which; a record whose kind has no seat passes on licence and
  // profession alone, and the gate is recorded as not applicable.
  if ((opportunity as any)?.level_gate_applies === false) {
    return {
      ...withProf,
      gate: "scored", outcome: "survivor", sentence: null,
      employer_tier: employerTier(opportunity?.issuer_raw, ladder, opportunity?.country ?? null).tier,
      level_direction: "not_applicable", grade_basis: "none",
    };
  }

  const lvl = levelGate(identity, opportunity, routeIsSpecific, ladder);
  const withLevel: GateResult = {
    ...withProf, employer_tier: lvl.tier, level_direction: lvl.direction, standing_gap: lvl.gap,
    grade_basis: lvl.basis,
  };
  // "At or above my level" includes equality: a lateral record is AT the
  // member's level and passes. Only below the member's standing is a refusal.
  if (lvl.direction === "below") {
    return { ...withLevel, gate: "level", outcome: "rejected", sentence: lvl.sentence };
  }
  // Unknown is marked, carried and answered for — never silently dropped.
  if (lvl.direction === "unknown") {
    return {
      ...withLevel, gate: "scored", outcome: "survivor", sentence: null,
      gate_note: "level_unconfirmed",
      answer_for: "We could not confirm the level of this role",
    };
  }

  return {
    ...withLevel, gate: "scored", outcome: "survivor", sentence: null,
    stretch: lvl.direction === "two_plus",
  };
}

/**
 * WRITING IS JUDGED SEPARATELY AND HARDER. Standing to comment means he has
 * done it, advised in that sector, or already holds a stated position on it.
 * A transformation architect writing about irrigation engineering is a man
 * commenting outside his lane.
 */
export function writingStanding(identity: MemberIdentity, opportunity: any, stands?: string | null) {
  const role = classifyProfession(opportunity?.title, opportunity?.scope);
  const held = new Map(identity.professions.map((p) => [p.profession, p.positions]));

  if (role && held.get(role)?.length) {
    return { has_standing: true, reason: `He has done this work: ${held.get(role)![0]}.` };
  }
  if (role) {
    for (const neighbour of ADJACENT[role] ?? []) {
      const via = held.get(neighbour);
      if (via?.length) {
        return { has_standing: true, reason: `Adjacent to work he has done: ${via[0]}.` };
      }
    }
  }
  const text = `${opportunity?.sector ?? ""} ${opportunity?.title ?? ""} ${opportunity?.scope ?? ""}`.toLowerCase();
  const sector = identity.sectors_delivered.find((s) =>
    s.sector.split(" and ").some((word) => word.length > 3 && text.includes(word.toLowerCase())));
  if (sector) {
    return { has_standing: true, reason: `He has delivered in this sector: ${sector.position}.` };
  }
  const stated = String(stands ?? "").toLowerCase();
  if (stated && role && stated.includes(PROFESSION_LABEL[role].split(" and ")[0])) {
    return { has_standing: true, reason: "He already holds a stated position on this subject." };
  }
  return {
    has_standing: false,
    reason: role
      ? `Outside his lane — the subject is ${PROFESSION_LABEL[role]}; he has neither done it nor advised in it.`
      : "Outside his lane — nothing in his history speaks to this subject.",
  };
}
