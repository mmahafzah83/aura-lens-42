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
};

/**
 * The profession a RECORD carries. The title is read first, because a title is
 * an employer's own statement of accountability. Only when the title says
 * nothing, or says nothing more than "general management", may the record's
 * accountability sentences be read — and only those sentences, never the whole
 * body, which names every technology the employer sells. A profession
 * established that way is recorded with the sentence that established it.
 */
export function professionOf(opportunity: any): ProfessionRead {
  const fromTitle = classifyProfession(opportunity?.title, opportunity?.scope);
  if (fromTitle && fromTitle !== "general_management") {
    return { profession: fromTitle, source: "title", quote: null };
  }
  const sentences: string[] = Array.isArray(opportunity?.scope_evidence?.accountability_sentences)
    ? opportunity.scope_evidence.accountability_sentences
    : [];
  for (const sentence of sentences) {
    const p = classifyProfession(sentence);
    if (p && p !== "general_management") {
      return { profession: p, source: "accountability_sentence", quote: String(sentence).slice(0, 400) };
    }
  }
  return fromTitle
    ? { profession: fromTitle, source: "title", quote: null }
    : { profession: null, source: "none", quote: null };
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
  [4, "manager", /\bmanager\b|head of department|مدير/i],
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
  grade: number | null;
  grade_label: string | null;
  tier: Tier;
  tier_label: string;
  standing: number | null;
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
  };
  sectors_delivered: Array<{ sector: string; position: string }>;
  qualifications: Array<{ kind: string; title: string; institution: string | null; year: string | null }>;
  scope_evidence: Array<{ position: string; evidence: string }>;
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

/**
 * Build the member's identity from the saved profile snapshot. Derived, never
 * hand-written: the same function run against another member's snapshot yields
 * that member's professions, standing and sectors.
 */
export function deriveIdentity(snapshot: any, ladder: LadderRow[] = []): MemberIdentity {
  const experience: any[] = Array.isArray(snapshot?.experience) ? snapshot.experience : [];
  const education: any[] = Array.isArray(snapshot?.education) ? snapshot.education : [];
  const certifications: any[] = Array.isArray(snapshot?.certifications) ? snapshot.certifications : [];

  const positions: MemberPosition[] = experience.map((e) => {
    const title = String(e?.position ?? e?.title ?? "").trim();
    const company = String(e?.companyName ?? e?.company ?? "").trim();
    const placed = employerTier(company, ladder);
    const grade = gradeOf(title);
    return {
      title,
      company,
      started: e?.startDate?.text ?? null,
      ended: e?.endDate?.text ?? null,
      // The TITLE carries the accountability. A description is prose: it names
      // every technology the employer sells and would classify a process
      // consultant as a procurement lead.
      profession: classifyProfession(title),
      grade: grade?.rank ?? null,
      grade_label: grade?.label ?? null,
      tier: placed.tier,
      tier_label: placed.label,
      standing: grade ? +(grade.rank + placed.bonus).toFixed(2) : null,
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

  const scope_evidence = positions
    .filter((p) => (p.grade ?? 0) >= 5)
    .map((p) => ({
      position: `${p.title} at ${p.company}`,
      evidence: `${p.grade_label ?? "position"} at ${p.tier_label ?? TIER_LABEL[p.tier]}${periodOf(p) ? `, ${periodOf(p)}` : ""}`,
    }));

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
};

/** GATE 2 — is this his profession? A sector match may never rescue it. */
export function professionGate(identity: MemberIdentity, opportunity: any) {
  const role = classifyProfession(opportunity?.title, opportunity?.scope);
  const held = new Map(identity.professions.map((p) => [p.profession, p.positions]));

  if (!role) {
    return { role, relation: "unstated" as const, bridge: null, sentence: null };
  }
  const own = held.get(role);
  if (own?.length) {
    return { role, relation: "same" as const, bridge: own[0], sentence: null };
  }
  for (const neighbour of ADJACENT[role] ?? []) {
    const via = held.get(neighbour);
    if (via?.length) {
      return {
        role,
        relation: "adjacent" as const,
        bridge: `${via[0]} — ${PROFESSION_LABEL[neighbour]} bridges to ${PROFESSION_LABEL[role]}`,
        sentence: null,
      };
    }
  }
  const mine = identity.professions.map((p) => p.label).join(", ") || "not established from your history";
  return {
    role,
    relation: "different" as const,
    bridge: null,
    sentence:
      `Different profession — the role is ${PROFESSION_LABEL[role]}; your evidence is ${mine}; ` +
      `no position in your history performed this function.`,
  };
}

/** GATE 3 — level direction, adjusted for where the employer sits on the ladder. */
export function levelGate(
  identity: MemberIdentity,
  opportunity: any,
  routeIsSpecific: boolean,
  ladder: LadderRow[] = [],
) {
  const mine = identity.highest_standing;
  const placed = employerTier(opportunity?.issuer_raw, ladder, opportunity?.country ?? null);
  const tier = placed.tier;
  const grade = gradeOf(opportunity?.title) ?? gradeOf(opportunity?.scope);

  if (mine.standing === null || !grade) {
    return {
      direction: "unknown" as const, gap: null, tier, placed, sentence: null,
      reason: !grade ? "role_grade_unreadable" : "member_standing_unreadable",
    };
  }
  if (tier === "unknown") {
    return {
      direction: "unknown" as const, gap: null, tier, placed,
      sentence: null, reason: "employer_tier_unknown",
    };
  }

  const standing = +(grade.rank + placed.bonus).toFixed(2);
  const gap = +(standing - mine.standing).toFixed(2);
  const held = `you held ${mine.title} at ${mine.company}${mine.period ? ` from ${mine.period}` : ""}`;
  const thisOne = `this is ${opportunity?.title} at ${opportunity?.issuer_raw ?? "an employer at the same tier"}`;

  if (gap <= -1) {
    return {
      direction: "below" as const, gap, tier, placed, reason: null,
      sentence: `Below your standing — ${held}; ${thisOne}.`,
    };
  }
  if (gap < 1) {
    if (routeIsSpecific) return { direction: "lateral" as const, gap, tier, placed, sentence: null, reason: null };
    return {
      direction: "lateral" as const, gap, tier, placed, reason: null,
      sentence: `Level with what you already hold — ${held} — and it opens no route your current seat does not already give you.`,
    };
  }
  if (gap < 2) return { direction: "one_above" as const, gap, tier, placed, sentence: null, reason: null };
  return { direction: "two_plus" as const, gap, tier, placed, sentence: null, reason: null };
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
  };
  if (prof.relation === "different") {
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
      level_direction: "not_applicable",
    };
  }

  const lvl = levelGate(identity, opportunity, routeIsSpecific, ladder);
  const withLevel: GateResult = {
    ...withProf, employer_tier: lvl.tier, level_direction: lvl.direction, standing_gap: lvl.gap,
  };
  if (lvl.direction === "below" || (lvl.direction === "lateral" && lvl.sentence)) {
    return { ...withLevel, gate: "level", outcome: "rejected", sentence: lvl.sentence };
  }
  if (lvl.direction === "unknown") {
    return {
      ...withLevel, gate: "level", outcome: "unknown",
      sentence: `Your standing against this seat could not be established — ${String(lvl.reason).replace(/_/g, " ")}; queued for investigation.`,
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
