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

export function buildBrandPaper(
  results: Record<string, any> | null | undefined,
  profile: BrandPaperProfile | null | undefined,
): BrandPaper {
  const r = results || {};
  const interpretation: string = typeof r.interpretation === "string" ? r.interpretation : "";
  const { prose, json } = splitInterpretation(interpretation);
  // Merge stored top-level fields with any JSON tail we recover.
  const src: Record<string, any> = { ...(json || {}), ...r };

  const primary_archetype = nullOr(stripMd(src.primary_archetype));
  const secondary_archetype = nullOr(stripMd(src.secondary_archetype));

  const positioning_statement = nullOr(
    stripMd(src.positioning_statement)
      || stripMd(extractSection(prose, "YOUR ONE-LINER"))
      || stripMd(extractSection(prose, "YOUR POSITIONING STATEMENT")),
  );

  const market_read = nullOr(
    stripMd(src.market_read) || stripMd(extractSection(prose, "HOW THE MARKET SEES YOU")),
  );
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
  );
  const honest_truth = nullOr(
    stripMd(src.honest_truth) || stripMd(extractSection(prose, "THE HONEST TRUTH")),
  );

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

  let invest_next: BrandPaperInvest[] = [];
  if (Array.isArray(src.invest_next) && src.invest_next.length) {
    invest_next = src.invest_next
      .map((x: any) => ({
        area: stripMd(x?.area || ""),
        insight: stripMd(x?.insight || ""),
      }))
      .filter(x => x.area)
      .slice(0, 2);
  }
  if (invest_next.length === 0) {
    invest_next = parseInvestFromProse(prose);
  }

  return {
    primary_archetype,
    secondary_archetype,
    positioning_statement,
    market_read,
    trust_pattern,
    natural_tone,
    unique_capability,
    uncontested_space,
    topics,
    invest_next,
    honest_truth,
    profile: {
      first_name: profile?.first_name ?? null,
      last_name: profile?.last_name ?? null,
      level: profile?.level ?? null,
      sector_focus: profile?.sector_focus ?? null,
    },
    generated_at: new Date().toISOString(),
  };
}

export default buildBrandPaper;