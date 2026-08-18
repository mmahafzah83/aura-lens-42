// buildBrandPaper — normalise a diagnostic_profiles.brand_assessment_results
// blob into the fixed slots the BrandPaperDocument expects. Prefers the
// structured JSON keys emitted by the new brand-assessment SYSTEM_PROMPT,
// falls back to legacy prose parsing (splitInterpretation + section headers)
// so historic rows still render. All fields are string | null (or arrays);
// stray markdown residue (*, #) is stripped defensively.

export interface BrandPaperTopic {
  title: string;
  description: string;
}

export interface BrandPaperInvest {
  area: string;
  insight: string;
}

export interface BrandPaperProfile {
  first_name?: string | null;
  last_name?: string | null;
  level?: string | null;
  sector_focus?: string | null;
}

/** The member's own placements — his words, his numbers. Not a grade. */
export interface BrandPaperPlacement {
  name: string;
  score: number;
}

/**
 * The read as `mirror_reads.read` stores it. Its key names do not match the
 * paper's slots, so every producer maps it through `buildBrandPaper`.
 */
export interface MirrorReadBlob {
  archetype?: string | null;
  market_read?: string | null;
  uncontested_space?: string | null;
  honest_gap?: string | null;
  own_words_quote?: string | null;
  own_words_read?: string | null;
  themes?: any;
}

export interface BrandPaperExtras {
  /** `mirror_reads.read` — fills every gap `brand_assessment_results` leaves. */
  mirrorRead?: MirrorReadBlob | null;
  /** `diagnostic_profiles.skill_ratings` — prose keys, 0-100 integers. */
  skillRatings?: Record<string, unknown> | null;
  /** `report_snapshots.data.territories` — the topics fallback. */
  territories?: string[] | null;
}

export interface BrandPaper {
  primary_archetype: string | null;
  secondary_archetype: string | null;
  positioning_statement: string | null;
  market_read: string | null;
  trust_pattern: string | null;
  natural_tone: string | null;
  unique_capability: string | null;
  uncontested_space: string | null;
  topics: BrandPaperTopic[];
  invest_next: BrandPaperInvest[];
  honest_truth: string | null;
  /** The private half of the read — what their own writing shows. */
  the_gap: string | null;
  own_words_quote: string | null;
  own_words_read: string | null;
  /** SLICE 4d — extra narrative slots surfaced on the paper's Voice sheet. */
  zone_of_genius: string | null;
  voice_signature: string | null;
  authority_style: string | null;
  key_barrier: string | null;
  content_pillars: string[];
  growth_areas: string[];
  /** His own placements, in his own words. Rendered, never graded. */
  capabilities: BrandPaperPlacement[];
  profile: BrandPaperProfile;
  generated_at: string;
}

const SECTION_KEYS = [
  "HOW THE MARKET SEES YOU",
  "HOW YOU BUILD TRUST",
  "YOUR NATURAL TONE",
  "YOUR ONE-LINER",
  "YOUR POSITIONING STATEMENT",
  "WHAT ONLY YOU CAN DO",
  "THE SPACE NOBODY ELSE OWNS",
  "YOUR 3 TOPICS",
  "MY 3 AUTHORITY THEMES",
  "WHERE TO INVEST NEXT",
  "THE HONEST TRUTH",
];

function stripMd(s: unknown): string {
  if (typeof s !== "string") return "";
  return s
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/[*#`]/g, "")
    .trim();
}

function nullOr(s: string): string | null {
  const t = s.trim();
  return t.length ? t : null;
}

function splitInterpretation(raw: string): { prose: string; json: any | null } {
  if (!raw) return { prose: "", json: null };
  const idx = raw.indexOf("---JSON---");
  if (idx === -1) return { prose: raw, json: null };
  const prose = raw.slice(0, idx).trim();
  const jsonText = raw.slice(idx + "---JSON---".length).trim();
  try {
    const cleaned = jsonText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    return { prose, json: JSON.parse(cleaned) };
  } catch {
    return { prose, json: null };
  }
}

function extractSection(prose: string, header: string): string {
  if (!prose) return "";
  const escapedAll = SECTION_KEYS
    .map(h => h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const escThis = header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `(?:^|\\n)\\s*(?:#{1,6}\\s*)?\\*{0,2}${escThis}\\*{0,2}\\s*\\n+([\\s\\S]*?)(?=\\n\\s*(?:#{1,6}\\s*)?\\*{0,2}(?:${escapedAll})\\*{0,2}\\s*\\n|$)`,
    "i",
  );
  const m = prose.match(re);
  return (m?.[1] || "").trim();
}

function parseTopicsFromProse(prose: string): BrandPaperTopic[] {
  const sec = extractSection(prose, "YOUR 3 TOPICS") || extractSection(prose, "MY 3 AUTHORITY THEMES");
  if (!sec) return [];
  const lines = sec.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const topics: BrandPaperTopic[] = [];
  for (let i = 0; i < lines.length && topics.length < 3; i++) {
    const raw = lines[i].replace(/^[\-\*\d\.\)\s]+/, "");
    const clean = stripMd(raw);
    if (!clean) continue;
    // Split on ":" or "—" or "-" between title and description if present.
    const parts = clean.split(/\s*[:—–]\s*/, 2);
    if (parts.length === 2 && parts[0].length < 100) {
      topics.push({ title: parts[0].trim(), description: parts[1].trim() });
    } else if (clean.length < 100 && !/[.!?]$/.test(clean)) {
      // Title-only line; check next line for the description.
      const next = lines[i + 1] ? stripMd(lines[i + 1]) : "";
      if (next && next.length > 20) {
        topics.push({ title: clean, description: next });
        i++;
      } else {
        topics.push({ title: clean, description: "" });
      }
    }
  }
  return topics;
}

function parseInvestFromProse(prose: string): BrandPaperInvest[] {
  const sec = extractSection(prose, "WHERE TO INVEST NEXT");
  if (!sec) return [];
  const lines = sec.split(/\n+/).map(l => stripMd(l)).filter(Boolean).slice(0, 4);
  const out: BrandPaperInvest[] = [];
  for (let i = 0; i < lines.length && out.length < 2; i++) {
    const raw = lines[i].replace(/^[\-\*\d\.\)\s]+/, "");
    const parts = raw.split(/\s*[:—–]\s*/, 2);
    if (parts.length === 2) {
      out.push({ area: parts[0].trim(), insight: parts[1].trim() });
    } else {
      out.push({ area: raw.trim(), insight: "" });
    }
  }
  return out;
}

/**
 * Sheets are fixed 794×1123 boxes with overflow hidden — content is budgeted,
 * not reflowed. Trim to the last full sentence inside the cap.
 */
function capAtSentence(s: string | null, max: number): string | null {
  if (!s || s.length <= max) return s;
  const slice = s.slice(0, max);
  const cut = slice.lastIndexOf(". ");
  if (cut > max * 0.4) return slice.slice(0, cut + 1);
  const word = slice.lastIndexOf(" ");
  const base = (word > max * 0.4 ? slice.slice(0, word) : slice).trim();
  return (base.replace(/[\s,;:\u2014\u2013-]+$/, "") + ".") || null;
}

export function buildBrandPaper(
  results: Record<string, any> | null | undefined,
  profile: BrandPaperProfile | null | undefined,
  extras?: BrandPaperExtras | null,
): BrandPaper {
  const r = results || {};
  const interpretation: string = typeof r.interpretation === "string" ? r.interpretation : "";
  const { prose, json } = splitInterpretation(interpretation);
  // Merge stored top-level fields with any JSON tail we recover.
  const src: Record<string, any> = { ...(json || {}), ...r };

  // The read lives in `mirror_reads` under different key names. Map it here,
  // once, and let it fill every gap `brand_assessment_results` leaves.
  const mr = extras?.mirrorRead || null;
  const fromRead = (v: unknown) => nullOr(stripMd(v));

  const primary_archetype = nullOr(stripMd(src.primary_archetype)) || fromRead(mr?.archetype);
  const secondary_archetype = nullOr(stripMd(src.secondary_archetype));

  const positioning_statement = nullOr(
    stripMd(src.positioning_statement)
      || stripMd(extractSection(prose, "YOUR ONE-LINER"))
      || stripMd(extractSection(prose, "YOUR POSITIONING STATEMENT")),
  );

  const market_read = nullOr(
    stripMd(src.market_read) || stripMd(extractSection(prose, "HOW THE MARKET SEES YOU")),
  ) || fromRead(mr?.market_read);
  const trust_pattern = nullOr(
    stripMd(src.trust_pattern) || stripMd(extractSection(prose, "HOW YOU BUILD TRUST")),
  );
  const natural_tone = nullOr(
    stripMd(src.natural_tone) || stripMd(extractSection(prose, "YOUR NATURAL TONE")),
  );
  const unique_capability = nullOr(
    stripMd(src.unique_capability) || stripMd(extractSection(prose, "WHAT ONLY YOU CAN DO")),
  );
  const uncontested_space = nullOr(
    stripMd(src.uncontested_space) || stripMd(extractSection(prose, "THE SPACE NOBODY ELSE OWNS")),
  ) || fromRead(mr?.uncontested_space);
  const honest_truth = nullOr(
    stripMd(src.honest_truth) || stripMd(extractSection(prose, "THE HONEST TRUTH")),
  );
  const the_gap = nullOr(stripMd(src.the_gap)) || fromRead(mr?.honest_gap);
  const own_words_quote = nullOr(stripMd(src.own_words_quote)) || fromRead(mr?.own_words_quote);
  const own_words_read = nullOr(stripMd(src.own_words_read)) || fromRead(mr?.own_words_read);

  let topics: BrandPaperTopic[] = [];
  if (Array.isArray(src.topics) && src.topics.length) {
    topics = src.topics
      .map((t: any) => ({
        title: stripMd(t?.title || ""),
        description: stripMd(t?.description || ""),
      }))
      .filter(t => t.title)
      .slice(0, 3);
  }
  if (topics.length === 0 && Array.isArray(src.content_pillars) && src.content_pillars.length) {
    topics = src.content_pillars
      .slice(0, 3)
      .map((p: any) => ({ title: stripMd(p), description: "" }))
      .filter((t: BrandPaperTopic) => t.title);
  }
  if (topics.length === 0) {
    topics = parseTopicsFromProse(prose);
  }
  if (topics.length === 0 && Array.isArray(mr?.themes) && mr!.themes.length) {
    topics = (mr!.themes as any[])
      .slice(0, 3)
      .map((t: any) =>
        typeof t === "string"
          ? { title: stripMd(t), description: "" }
          : { title: stripMd(t?.title || t?.name || ""), description: stripMd(t?.description || "") },
      )
      .filter((t: BrandPaperTopic) => t.title);
  }
  if (topics.length === 0 && Array.isArray(extras?.territories) && extras!.territories!.length) {
    topics = extras!.territories!
      .slice(0, 3)
      .map((t) => ({ title: stripMd(t), description: "" }))
      .filter((t) => t.title);
  }

  let invest_next: BrandPaperInvest[] = [];
  if (Array.isArray(src.invest_next) && src.invest_next.length) {
    invest_next = src.invest_next
      .map((x: any) => ({
        area: stripMd(x?.area || ""),
        insight: capAtSentence(stripMd(x?.insight || ""), 280) || "",
      }))
      .filter(x => x.area)
      .slice(0, 2);
  }
  if (invest_next.length === 0) {
    invest_next = parseInvestFromProse(prose)
      .map((x) => ({ area: x.area, insight: capAtSentence(x.insight, 280) || "" }));
  }

  const asList = (v: any, max = 8): string[] =>
    Array.isArray(v) ? v.map((x) => stripMd(x)).filter(Boolean).slice(0, max) : [];

  // GENERIC pass — whatever keys the member actually placed, in their order.
  // No legacy dimension filter: that is what dropped all eight placements.
  const capabilities: BrandPaperPlacement[] = Object.entries(extras?.skillRatings || {})
    .map(([name, raw]) => {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n)) return null;
      const pretty = name.includes("_")
        ? name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
        : name;
      return { name: stripMd(pretty), score: Math.round(Math.max(0, Math.min(100, n))) };
    })
    .filter((x): x is BrandPaperPlacement => !!x && !!x.name);

  return {
    primary_archetype,
    secondary_archetype,
    positioning_statement,
    market_read: capAtSentence(market_read, 620),
    trust_pattern: capAtSentence(trust_pattern, 620),
    natural_tone,
    unique_capability: capAtSentence(unique_capability, 620),
    uncontested_space,
    topics,
    invest_next,
    honest_truth: capAtSentence(honest_truth, 620),
    the_gap,
    own_words_quote,
    own_words_read,
    zone_of_genius: nullOr(stripMd(src.zone_of_genius)),
    voice_signature: nullOr(stripMd(src.voice_signature)),
    authority_style: nullOr(stripMd(src.authority_style)),
    key_barrier: nullOr(stripMd(src.key_barrier)),
    content_pillars: asList(src.content_pillars).slice(0, 3),
    growth_areas: asList(src.growth_areas).slice(0, 2),
    capabilities,
    profile: {
      first_name: profile?.first_name ?? null,
      last_name: profile?.last_name ?? null,
      level: profile?.level ?? null,
      sector_focus: profile?.sector_focus ?? null,
    },
    generated_at: new Date().toISOString(),
  };
}

/**
 * A masthead over nothing is a lie. If the paper carries no member content,
 * the surfaces render the honest "not ready" state instead of printing it.
 */
export function brandPaperHasContent(bp: BrandPaper | null | undefined): boolean {
  if (!bp) return false;
  return !!(
    bp.primary_archetype || bp.market_read || bp.positioning_statement ||
    bp.trust_pattern || bp.natural_tone || bp.unique_capability ||
    bp.uncontested_space || bp.honest_truth || bp.the_gap ||
    bp.own_words_quote || bp.own_words_read ||
    bp.zone_of_genius || bp.voice_signature || bp.authority_style || bp.key_barrier ||
    bp.topics.length || bp.invest_next.length ||
    bp.content_pillars.length || bp.growth_areas.length || bp.capabilities.length
  );
}

export default buildBrandPaper;