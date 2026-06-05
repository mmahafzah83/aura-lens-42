// W2-G-1: single data-assembly module for the Strategic Identity Report.
// Each section is present-or-null for empty-state gating. No rendering here.
//
// Canonical-source notes:
// - SCORE: read-only from score_snapshots (matches HomeTab.tsx:442 arc).
// - FOOTPRINT: mirrors IntelligenceTab.tsx:1005-1008 header queries.
// - MARKET MIRROR: labels by cached gaps.persona_set (not current rank),
//   via shared PERSONA_LABELS from @/lib/marketPersonas.
// - CAPABILITIES: 10 canonical names/order from AuditRadarWidget.tsx:7-17.
// - CONTENT publishedCount: mirrors calculate-aura-score/index.ts:97-104.

import { supabase } from "@/integrations/supabase/client";
import {
  PERSONA_LABELS,
  type RankBucket,
} from "@/lib/marketPersonas";

// ── Canonical capability dimensions (AuditRadarWidget.tsx:7-17) ──
export const CAPABILITY_DIMENSIONS: readonly string[] = [
  "Strategic Architecture",
  "C-Suite Stewardship",
  "Sector Foresight",
  "Digital Synthesis",
  "Executive Presence",
  "Commercial Velocity",
  "Human-Centric Leadership",
  "Operational Resilience",
  "Geopolitical Fluency",
  "Value-Based P&L",
] as const;

// ── Section types ──
export interface ProfileSection {
  first_name: string | null;
  last_name: string | null;
  level: string | null;
  firm: string | null;        // lead label only (parenthetical stripped)
  firm_raw: string | null;
  core_practice: string | null;
  sector_focus: string | null;
  north_star_goals: string[]; // " | " split
  north_star_goal_raw: string | null;
  linkedin_handle: string | null;
  years_experience_raw: string | null;
  years_experience_total: number | null;
  primary_strength: string | null;
}

export interface PositioningSection {
  title: string;
  statement: string;
}

export interface ProfileIntelligenceSection {
  identity_summary: string | null;
  authority_themes: { theme: string; rationale: string }[];
  expertise_areas: string[];
  knowledge_domains: string[];
}

export interface ScoreSection {
  score: number;
  tier: string | null;
  components: {
    signal: number;
    content: number;
    capture: number;
    weights: { signal: 40; content: 40; capture: 20 };
  };
  snapshot_at: string;
}

export interface BrandPositionSection {
  statement: string | null;
  archetype: string | null;
  pillars: string[];
}

export type CapabilitiesSection = { name: string; score: number }[];

export interface MarketMirrorPerspective {
  who: string;
  sees: string;
  gap: string;
}
export interface MarketMirrorSection {
  persona_set: RankBucket;
  generated_at: string;
  perspectives: MarketMirrorPerspective[]; // length 3
}

export type TerritoriesSection = string[];

export interface FootprintSection {
  sources: number;   // entries + documents
  evidence: number;  // evidence_fragments
  signals: number;   // active strategic_signals
  themes: number;    // territories.length
}

export interface ContentSection {
  publishedCount: number; // last 30d, aura source, tracking_status='published'
  trackedCount: number;   // tracking_status NOT NULL
  frameworks: { framework_type: string; count: number }[];
}

export interface VoiceSection {
  tone: string;
  preferred_structures: string[];
  storytelling_patterns: string[];
  vocabulary_preferences: {
    prefer?: string[];
    avoid?: string[];
  };
}

export interface ReportData {
  user_id: string;
  generated_at: string;
  profile: ProfileSection | null;
  positioning: PositioningSection | null;
  profile_intelligence: ProfileIntelligenceSection | null;
  score: ScoreSection | null;
  brand_position: BrandPositionSection | null;
  capabilities: CapabilitiesSection | null;
  market_mirror: MarketMirrorSection | null;
  territories: TerritoriesSection | null;
  footprint: FootprintSection | null;
  content: ContentSection | null;
  voice: VoiceSection | null;
}

// ── Small formatters ──
function stripParenthetical(s: string | null | undefined): string | null {
  if (!s) return null;
  const out = s.replace(/\s*\([^)]*\)\s*$/g, "").trim();
  return out || null;
}

function splitPipes(s: string | null | undefined): string[] {
  if (!s) return [];
  return s.split("|").map((x) => x.trim()).filter(Boolean);
}

function parseYearsTotal(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = s.match(/(\d+)\s*y[a-z]*\s*total/i);
  return m ? parseInt(m[1], 10) : null;
}

function asStrArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x) => typeof x === "string") as string[] : [];
}

function nonEmpty<T>(v: T | null | undefined): v is T {
  return v !== null && v !== undefined && v !== "";
}

// ── Builder ──
export async function buildIdentityReport(userId: string): Promise<ReportData> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString();

  const [
    profileRes,
    snapRes,
    mirrorRes,
    signalsRes,
    entriesCountRes,
    documentsCountRes,
    evidenceCountRes,
    activeSignalsCountRes,
    auraPublishedRes,
    trackedCountRes,
    frameworkRowsRes,
    voiceRes,
  ] = await Promise.all([
    (supabase.from("diagnostic_profiles" as any) as any)
      .select(
        "first_name,last_name,level,firm,core_practice,sector_focus,north_star_goal,linkedin_handle,years_experience,primary_strength,brand_pillars,brand_assessment_results,identity_intelligence,audit_interpretation,audit_results,skill_ratings,generated_skills",
      )
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("score_snapshots")
      .select("score, tier, components, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    (supabase.from("market_mirror_cache" as any) as any)
      .select("headhunter_text, client_cio_text, curator_text, gaps, generated_at")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("strategic_signals")
      .select("theme_tags")
      .eq("user_id", userId)
      .eq("status", "active"),
    supabase.from("entries").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("documents").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("evidence_fragments").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("strategic_signals").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "active"),
    supabase
      .from("linkedin_posts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("source_type", ["aura", "aura_generated"])
      .eq("tracking_status", "published")
      .gte("created_at", thirtyDaysAgo),
    supabase
      .from("linkedin_posts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .not("tracking_status", "is", null),
    supabase
      .from("linkedin_posts")
      .select("framework_type")
      .eq("user_id", userId)
      .not("framework_type", "is", null),
    supabase
      .from("authority_voice_profiles")
      .select("tone, preferred_structures, storytelling_patterns, vocabulary_preferences")
      .eq("user_id", userId)
      .eq("is_primary", true)
      .maybeSingle(),
  ]);

  const p: any = (profileRes as any)?.data || null;

  // 1. PROFILE
  let profile: ProfileSection | null = null;
  if (p) {
    const hasAny =
      nonEmpty(p.first_name) || nonEmpty(p.firm) || nonEmpty(p.sector_focus) || nonEmpty(p.north_star_goal);
    if (hasAny) {
      profile = {
        first_name: p.first_name || null,
        last_name: p.last_name || null,
        level: p.level || null,
        firm: stripParenthetical(p.firm),
        firm_raw: p.firm || null,
        core_practice: p.core_practice || null,
        sector_focus: p.sector_focus || null,
        north_star_goals: splitPipes(p.north_star_goal),
        north_star_goal_raw: p.north_star_goal || null,
        linkedin_handle: p.linkedin_handle || null,
        years_experience_raw: p.years_experience || null,
        years_experience_total: parseYearsTotal(p.years_experience),
        primary_strength: p.primary_strength || null,
      };
    }
  }

  const brandResults: any = p?.brand_assessment_results || {};
  const identityIntel: any = p?.identity_intelligence || {};

  // 2. POSITIONING — exact precedence from IdentityTab.tsx:461-463
  const positioningTitle =
    brandResults?.positioning_title ||
    brandResults?.primary_archetype ||
    identityIntel?.primary_role ||
    p?.primary_strength ||
    "";
  const positioningStatement =
    brandResults?.positioning_statement ||
    identityIntel?.identity_summary ||
    brandResults?.interpretation ||
    "";
  const positioning: PositioningSection | null =
    positioningTitle || positioningStatement
      ? { title: positioningTitle, statement: positioningStatement }
      : null;

  // 3. PROFILE INTELLIGENCE
  let profile_intelligence: ProfileIntelligenceSection | null = null;
  if (identityIntel && Object.keys(identityIntel).length > 0) {
    const themes = Array.isArray(identityIntel.authority_themes)
      ? identityIntel.authority_themes
          .filter((t: any) => t && (t.theme || t.rationale))
          .map((t: any) => ({ theme: String(t.theme || ""), rationale: String(t.rationale || "") }))
      : [];
    profile_intelligence = {
      identity_summary: identityIntel.identity_summary || null,
      authority_themes: themes,
      expertise_areas: asStrArr(identityIntel.expertise_areas),
      knowledge_domains: asStrArr(identityIntel.knowledge_domains),
    };
  }

  // 4. SCORE — score_snapshots (read-only; matches Home arc)
  let score: ScoreSection | null = null;
  const snap: any = (snapRes as any)?.data || null;
  if (snap && typeof snap.score === "number") {
    const c: any = snap.components || {};
    score = {
      score: Number(snap.score) || 0,
      tier: snap.tier || null,
      components: {
        signal: Number(c.signal_score) || 0,
        content: Number(c.content_score) || 0,
        capture: Number(c.capture_score) || 0,
        weights: { signal: 40, content: 40, capture: 20 },
      },
      snapshot_at: snap.created_at,
    };
  }

  // 5. BRAND POSITION
  const pillars = asStrArr(p?.brand_pillars);
  const brandStatement = brandResults?.positioning_statement || null;
  const brandArchetype = brandResults?.primary_archetype || null;
  const brand_position: BrandPositionSection | null =
    (brandResults && Object.keys(brandResults).length > 0) || pillars.length > 0
      ? { statement: brandStatement, archetype: brandArchetype, pillars }
      : null;

  // 6. CAPABILITIES — skill_ratings (fallback audit_results)
  const ratingsRaw: Record<string, unknown> =
    (p?.skill_ratings && Object.keys(p.skill_ratings).length > 0
      ? p.skill_ratings
      : p?.audit_results) || {};
  const filled: { name: string; score: number }[] = [];
  const SLUG_MAP: Record<string, string> = {
    "Strategic Architecture": "strategic_architecture",
    "C-Suite Stewardship": "csuite_stewardship",
    "Sector Foresight": "sector_foresight",
    "Digital Synthesis": "digital_synthesis",
    "Executive Presence": "executive_presence",
    "Commercial Velocity": "commercial_velocity",
    "Human-Centric Leadership": "human_centric_leadership",
    "Operational Resilience": "operational_resilience",
    "Geopolitical Fluency": "geopolitical_fluency",
    "Value-Based P&L": "value_based_pnl",
  };
  for (const dim of CAPABILITY_DIMENSIONS) {
    // Some users have keys in snake_case slug form (e.g. "value_based_pnl");
    // others in canonical form ("Value-Based P&L"). Try canonical first, then slug.
    const v = (ratingsRaw as any)[dim] ?? (ratingsRaw as any)[SLUG_MAP[dim]];
    if (typeof v === "number" && !Number.isNaN(v)) {
      filled.push({ name: dim, score: Math.round(v) });
    }
  }
  const capabilities: CapabilitiesSection | null = filled.length > 0 ? filled : null;

  // 7. MARKET MIRROR — label by cached gaps.persona_set
  let market_mirror: MarketMirrorSection | null = null;
  const row: any = (mirrorRes as any)?.data || null;
  if (row) {
    const allNull = !row.headhunter_text && !row.client_cio_text && !row.curator_text;
    if (!allNull) {
      const personaSet: RankBucket = (row.gaps?.persona_set as RankBucket) || "director";
      const labels = PERSONA_LABELS[personaSet];
      const slots: { textKey: string; whoKey: keyof typeof labels; gapKey: string; gapWho: keyof typeof labels }[] = [
        { textKey: "headhunter_text", whoKey: "slot1", gapKey: "headhunter_gap", gapWho: "gap1" },
        { textKey: "client_cio_text", whoKey: "slot2", gapKey: "client_cio_gap", gapWho: "gap2" },
        { textKey: "curator_text",    whoKey: "slot3", gapKey: "curator_gap",    gapWho: "gap3" },
      ];
      market_mirror = {
        persona_set: personaSet,
        generated_at: row.generated_at,
        perspectives: slots.map((s) => ({
          who: labels[s.whoKey],
          sees: (row[s.textKey] as string) || "",
          gap: (row.gaps?.[s.gapKey] as string) || "",
        })),
      };
    }
  }

  // 8. TERRITORIES — distinct theme_tags by frequency, cap 5
  const themeCounts = new Map<string, number>();
  // Defensive dedupe key: lowercased + trimmed + whitespace-collapsed.
  // Root cause of duplicates (e.g. "Digital Transformation" twice) is dirty
  // theme_tags upstream; tracked separately. The report must still render
  // a clean list regardless.
  const seenKeys = new Map<string, string>(); // key → canonical display
  for (const r of (signalsRes.data || []) as any[]) {
    for (const t of (r.theme_tags || []) as string[]) {
      if (!t) continue;
      const key = t.trim().toLowerCase().replace(/\s+/g, " ");
      if (!key) continue;
      const display = seenKeys.get(key) ?? t.trim();
      if (!seenKeys.has(key)) seenKeys.set(key, display);
      themeCounts.set(display, (themeCounts.get(display) || 0) + 1);
    }
  }
  const territoriesList = Array.from(themeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t]) => t);
  const territories: TerritoriesSection | null = territoriesList.length > 0 ? territoriesList : null;

  // 9. FOOTPRINT — mirrors IntelligenceTab.tsx:1005-1008
  const entriesCount = entriesCountRes.count ?? 0;
  const documentsCount = documentsCountRes.count ?? 0;
  const evidenceCount = evidenceCountRes.count ?? 0;
  const activeSignalsCount = activeSignalsCountRes.count ?? 0;
  const fpSources = entriesCount + documentsCount;
  const fpThemes = territoriesList.length;
  const allZero = fpSources === 0 && evidenceCount === 0 && activeSignalsCount === 0 && fpThemes === 0;
  const footprint: FootprintSection | null = allZero
    ? null
    : { sources: fpSources, evidence: evidenceCount, signals: activeSignalsCount, themes: fpThemes };

  // 10. CONTENT
  const trackedCount = trackedCountRes.count ?? 0;
  const publishedCount = auraPublishedRes.count ?? 0;
  const fwCounts = new Map<string, number>();
  for (const r of (frameworkRowsRes.data || []) as any[]) {
    const k = r.framework_type;
    if (!k) continue;
    fwCounts.set(k, (fwCounts.get(k) || 0) + 1);
  }
  const frameworks = Array.from(fwCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([framework_type, count]) => ({ framework_type, count }));
  const content: ContentSection | null =
    trackedCount > 0 ? { publishedCount, trackedCount, frameworks } : null;

  // 11. VOICE
  const vp: any = (voiceRes as any)?.data || null;
  let voice: VoiceSection | null = null;
  if (vp) {
    const tone = (vp.tone || "").toString();
    const preferred_structures = asStrArr(vp.preferred_structures);
    const storytelling_patterns = asStrArr(vp.storytelling_patterns);
    const vpRaw: any = vp.vocabulary_preferences || {};
    const vocabulary_preferences = {
      prefer: asStrArr(vpRaw.prefer),
      avoid: asStrArr(vpRaw.avoid),
    };
    const empty =
      !tone &&
      preferred_structures.length === 0 &&
      storytelling_patterns.length === 0 &&
      vocabulary_preferences.prefer.length === 0 &&
      vocabulary_preferences.avoid.length === 0;
    if (!empty) {
      voice = { tone, preferred_structures, storytelling_patterns, vocabulary_preferences };
    }
  }

  return {
    user_id: userId,
    generated_at: new Date().toISOString(),
    profile,
    positioning,
    profile_intelligence,
    score,
    brand_position,
    capabilities,
    market_mirror,
    territories,
    footprint,
    content,
    voice,
  };
}