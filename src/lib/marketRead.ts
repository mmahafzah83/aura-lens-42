/**
 * The market read — the one-page picture the member sees at the end of the
 * Collection journey. Everything that talks to the brand-* backend lives here
 * so the journey page itself stays free of back-office words.
 */
import { supabase } from "@/integrations/supabase/client";
import { derivePillars } from "@/lib/brandPillars";
import type { RevealData } from "@/components/onboarding/RevealCard";

const stripMd = (s: unknown): string =>
  String(s ?? "").replace(/[*_`#]/g, "").replace(/\s+/g, " ").trim();

const firstSentence = (s: string): string => {
  const t = stripMd(s);
  if (!t) return "";
  const m = t.match(/^(.{20,190}?[.!?])(\s|$)/);
  return m ? m[1] : t.slice(0, 190);
};

function splitTail(raw: string): { prose: string; json: any | null } {
  if (!raw) return { prose: "", json: null };
  const idx = raw.indexOf("---JSON---");
  if (idx === -1) return { prose: raw, json: null };
  const prose = raw.slice(0, idx).trim();
  const tail = raw.slice(idx + "---JSON---".length).trim()
    .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return { prose, json: JSON.parse(tail) };
  } catch {
    return { prose, json: null };
  }
}

/** Counts behind a section, so it can name its own source honestly. */
export interface ReadSources {
  /** The member's own posts Aura read. */
  posts?: number;
  /** Things they saved and kept. */
  saved?: number;
  /** Questions they answered in their own words. */
  answers?: number;
  /** Sliders they moved. */
  sliders?: number;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * "From 3 things you saved and 2 of your posts." Every figure is counted, none
 * is fixed. With nothing to count, the section says nothing.
 */
function evidenceLine(s: ReadSources): string | undefined {
  const parts: string[] = [];
  if (s.saved) parts.push(`${plural(s.saved, "thing", "things")} you saved`);
  if (s.posts) parts.push(`${s.posts} of your posts`);
  if (!parts.length) return undefined;
  return `From ${parts.join(" and ")}.`;
}

function ownWordsLine(s: ReadSources): string | undefined {
  const parts: string[] = [];
  if (s.answers) parts.push(`your own ${plural(s.answers, "answer", "answers")}`);
  if (s.sliders) parts.push(`${plural(s.sliders, "slider", "sliders")} you moved`);
  if (!parts.length) return undefined;
  return `From ${parts.join(" and ")}.`;
}

function postsLine(s: ReadSources): string | undefined {
  if (!s.posts) return evidenceLine(s);
  return `From ${plural(s.posts, "post", "posts")} Aura read${s.saved ? ` and ${plural(s.saved, "thing", "things")} you saved` : ""}.`;
}

export function toRevealData(
  results: Record<string, any> | null | undefined,
  extras: {
    figures?: { value: string; label: string }[];
    /** Slider names for this member's band — never legitimate soft ground. */
    excludeSoft?: string[];
    /** Real counts, so every section can name what produced it. */
    sources?: ReadSources;
  } = {},
): RevealData | null {
  if (!results) return null;
  const archetype = stripMd(results.primary_archetype);
  let marketRead = firstSentence(results.market_read || results.positioning_statement || results.interpretation || "");
  // The heading already says the archetype — never print it twice.
  if (archetype) {
    const echo = new RegExp(`^\\s*(you\\s+are\\s+)?(the\\s+)?${archetype.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[.:—-]*\\s*`, "i");
    marketRead = marketRead.replace(echo, "").trim();
    if (marketRead.toLowerCase() === archetype.toLowerCase()) marketRead = "";
  }
  const subjects: string[] = Array.isArray(results.content_pillars) && results.content_pillars.length
    ? results.content_pillars.map(stripMd)
    : (Array.isArray(results.topics) ? results.topics.map((t: any) => stripMd(t?.title)) : []);
  const rawSoft: string[] = Array.isArray(results.invest_next) && results.invest_next.length
    ? results.invest_next.map((t: any) => stripMd(t?.area))
    : (Array.isArray(results.growth_areas) ? results.growth_areas.map(stripMd) : []);
  // Slider names are capability dimensions, not gaps — drop them entirely.
  const banned = new Set((extras.excludeSoft || []).map((s) => stripMd(s).toLowerCase()));
  const soft = rawSoft.filter((s) => s && !banned.has(s.toLowerCase()));
  const src = extras.sources ?? {};
  if (!archetype && subjects.length === 0) return null;
  return {
    archetype: archetype || "Your read",
    marketRead,
    subjects: subjects.filter(Boolean).slice(0, 3),
    softGround: soft.slice(0, 2),
    figures: extras.figures ?? [],
    provenance: {
      read: postsLine(src),
      subjects: evidenceLine(src),
      softGround: ownWordsLine(src),
    },
  };
}

/** Read whatever is already on file — used when the member comes back. */
export async function loadMarketRead(userId: string): Promise<Record<string, any> | null> {
  const { data } = await (supabase.from("diagnostic_profiles" as any) as any)
    .select("brand_assessment_results")
    .eq("user_id", userId)
    .maybeSingle();
  const r = (data as any)?.brand_assessment_results;
  return r && typeof r === "object" ? r : null;
}

/** Save the six answers immediately, so a failed generation never loses them. */
export async function saveAnswers(userId: string, answers: Record<string, string>): Promise<void> {
  try {
    await (supabase.from("diagnostic_profiles" as any) as any)
      .update({ brand_assessment_answers: answers })
      .eq("user_id", userId);
  } catch (e) {
    console.warn("[marketRead] answers save failed", e);
  }
}

/**
 * Generate and persist the market read. Never throws — a null return means
 * "not ready yet", and the journey continues regardless.
 */
export async function generateMarketRead(
  userId: string,
  answers: Record<string, string>,
  sector: string | null,
  band: string | null,
): Promise<Record<string, any> | null> {
  try {
    const { data: prof } = await (supabase.from("diagnostic_profiles" as any) as any)
      .select("audit_results")
      .eq("user_id", userId)
      .maybeSingle();
    const scores = (prof as any)?.audit_results && Object.keys((prof as any).audit_results).length
      ? (prof as any).audit_results
      : null;

    const { data, error } = await supabase.functions.invoke("brand-assessment", {
      body: {
        answers,
        auditScores: scores || "No scores on file yet",
        sector: sector || null,
        band: band || null,
      },
    });
    if (error) throw error;
    const interpretation = (data as any)?.interpretation;
    if (!interpretation) return null;

    const { prose, json } = splitTail(String(interpretation));
    const results: Record<string, any> = { ...(json && typeof json === "object" ? json : {}), interpretation: prose || interpretation };
    const pillars = derivePillars(results);

    await (supabase.from("diagnostic_profiles" as any) as any)
      .update({
        brand_assessment_results: results,
        brand_assessment_completed_at: new Date().toISOString(),
        ...(pillars.length ? { brand_pillars: pillars } : {}),
      })
      .eq("user_id", userId);

    return results;
  } catch (e) {
    console.warn("[marketRead] generation failed", e);
    return null;
  }
}