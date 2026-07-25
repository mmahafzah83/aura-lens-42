// Freezes the Strategic Identity Report into a versioned snapshot.
//
// SOURCE-OF-TRUTH NOTE: a single shared assembly module across the browser
// client and Deno is NOT practical here — src/lib/buildIdentityReport.ts
// imports through the Vite "@/" alias (marketPersonas, postProvenance) and
// the generated Database types, none of which resolve inside the edge
// runtime; and edge bundles do not include files outside supabase/functions.
// So the ReportData shape is mirrored here field for field. Any change to
// src/lib/buildIdentityReport.ts MUST be mirrored in this file.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { withObserve, logEfError } from "../_shared/observe.ts";
import {
  applyPublishedFilter,
  applyCatalogFilter,
  filterPublishedRows,
} from "../_shared/postProvenance.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  // x-cron-secret: trusted server-to-server path (backfills / scheduled freezes)
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// KEEP IN SYNC with src/lib/marketPersonas.ts
const PERSONA_LABELS: Record<string, Record<string, string>> = {
  c_suite: {
    slot1: "Board member", slot2: "Peer CEO", slot3: "Industry analyst",
    gap1: "board member", gap2: "peer CEO", gap3: "industry analyst",
  },
  partner: {
    slot1: "Prospective client", slot2: "Practice leadership", slot3: "Top talent recruit",
    gap1: "prospective client", gap2: "practice leader", gap3: "top recruit",
  },
  director: {
    slot1: "Headhunter", slot2: "Client CIO", slot3: "Conference curator",
    gap1: "headhunter", gap2: "CIO", gap3: "curator",
  },
};

// KEEP IN SYNC with src/lib/buildIdentityReport.ts CAPABILITY_DIMENSIONS
const CAPABILITY_DIMENSIONS = [
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
];

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
  return Array.isArray(v) ? (v.filter((x) => typeof x === "string") as string[]) : [];
}
function nonEmpty(v: unknown): boolean {
  return v !== null && v !== undefined && v !== "";
}
function clampAtSentence(s: string, max: number): string {
  if (!s || s.length <= max) return s;
  const slice = s.slice(0, max);
  const boundary = Math.max(slice.lastIndexOf(" · "), slice.lastIndexOf(". "), slice.lastIndexOf("。"));
  let cut = boundary > Math.floor(max * 0.5) ? slice.slice(0, boundary) : slice.replace(/\s+\S*$/, "");
  cut = cut.replace(/[\s·\.,،;:]+$/u, "");
  return cut + "…";
}

async function buildIdentityReport(db: any, userId: string): Promise<Record<string, any>> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString();

  const [
    profileRes, snapRes, mirrorRes, signalsRes,
    entriesCountRes, documentsCountRes, evidenceCountRes, activeSignalsCountRes,
    auraPublishedRes, trackedCountRes, frameworkRowsRes, voiceRes,
  ] = await Promise.all([
    db.from("diagnostic_profiles")
      .select("first_name,last_name,level,firm,core_practice,sector_focus,north_star_goal,linkedin_handle,years_experience,primary_strength,brand_pillars,brand_assessment_results,identity_intelligence,audit_interpretation,audit_results,skill_ratings,generated_skills")
      .eq("user_id", userId).maybeSingle(),
    db.from("imprint_snapshots").select("imprint, tier, components, created_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("market_mirror_cache")
      .select("headhunter_text, client_cio_text, curator_text, gaps, generated_at")
      .eq("user_id", userId).maybeSingle(),
    db.from("strategic_signals").select("theme_tags").eq("user_id", userId).eq("status", "active"),
    db.from("entries").select("id", { count: "exact", head: true }).eq("user_id", userId),
    db.from("documents").select("id", { count: "exact", head: true }).eq("user_id", userId),
    db.from("evidence_fragments").select("id", { count: "exact", head: true }).eq("user_id", userId),
    db.from("strategic_signals").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "active"),
    applyPublishedFilter(
      db.from("linkedin_posts").select("source_type, tracking_status, published_at")
        .eq("user_id", userId).gte("published_at", thirtyDaysAgo),
    ),
    applyCatalogFilter(
      db.from("linkedin_posts").select("id", { count: "exact", head: true }).eq("user_id", userId),
    ),
    db.from("linkedin_posts").select("framework_type").eq("user_id", userId).not("framework_type", "is", null),
    db.from("authority_voice_profiles")
      .select("tone, preferred_structures, storytelling_patterns, vocabulary_preferences")
      .eq("user_id", userId).eq("is_primary", true).maybeSingle(),
  ]);

  const p: any = profileRes?.data || null;

  let profile: any = null;
  if (p) {
    const hasAny = nonEmpty(p.first_name) || nonEmpty(p.firm) || nonEmpty(p.sector_focus) || nonEmpty(p.north_star_goal);
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

  const positioningTitle =
    brandResults?.positioning_title || brandResults?.primary_archetype ||
    identityIntel?.primary_role || p?.primary_strength || "";
  const positioningStatement =
    brandResults?.positioning_statement || identityIntel?.identity_summary ||
    brandResults?.interpretation || "";
  const positioning = positioningTitle || positioningStatement
    ? { title: positioningTitle, statement: positioningStatement }
    : null;

  let profile_intelligence: any = null;
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

  let score: any = null;
  const snap: any = snapRes?.data || null;
  const imprintVal = snap ? Number(snap.imprint) : NaN;
  if (snap && Number.isFinite(imprintVal)) {
    const c: any = (snap.components && (snap.components.score_components || snap.components)) || {};
    score = {
      score: imprintVal,
      tier: snap.tier || null,
      components: {
        signal: Number(c.signal_score) || 0,
        content: Number(c.content_score) || 0,
        capture: Number(c.capture_score) || 0,
        weights: { signal: 40, content: 40, capture: 20 },
        signal_weighted: null,
        content_weighted: null,
        capture_weighted: null,
      },
      snapshot_at: snap.created_at,
    };
  }

  const pillars = asStrArr(p?.brand_pillars);
  const brand_position =
    (brandResults && Object.keys(brandResults).length > 0) || pillars.length > 0
      ? {
          statement: brandResults?.positioning_statement || null,
          archetype: brandResults?.primary_archetype || null,
          pillars,
        }
      : null;

  const ratingsRaw: Record<string, unknown> =
    (p?.skill_ratings && Object.keys(p.skill_ratings).length > 0 ? p.skill_ratings : p?.audit_results) || {};
  const filled: { name: string; score: number }[] = [];
  for (const dim of CAPABILITY_DIMENSIONS) {
    const v = (ratingsRaw as any)[dim] ?? (ratingsRaw as any)[SLUG_MAP[dim]];
    if (typeof v === "number" && !Number.isNaN(v)) filled.push({ name: dim, score: Math.round(v) });
  }
  const capabilities = filled.length > 0 ? filled : null;

  let market_mirror: any = null;
  const row: any = mirrorRes?.data || null;
  if (row) {
    const allNull = !row.headhunter_text && !row.client_cio_text && !row.curator_text;
    if (!allNull) {
      const personaSet: string = row.gaps?.persona_set || "director";
      const labels = PERSONA_LABELS[personaSet] || PERSONA_LABELS.director;
      const slots = [
        { textKey: "headhunter_text", whoKey: "slot1", gapKey: "headhunter_gap" },
        { textKey: "client_cio_text", whoKey: "slot2", gapKey: "client_cio_gap" },
        { textKey: "curator_text", whoKey: "slot3", gapKey: "curator_gap" },
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

  const themeCounts = new Map<string, number>();
  const seenKeys = new Map<string, string>();
  const SYNONYMS: Record<string, string> = {
    "artificial intelligence": "AI",
    "ai": "AI",
    "operational excellence": "Operational Efficiency",
    "operational efficiency": "Operational Efficiency",
  };
  for (const r of (signalsRes.data || []) as any[]) {
    for (const t of (r.theme_tags || []) as string[]) {
      if (!t) continue;
      const norm = t.trim().toLowerCase().replace(/\s+/g, " ");
      if (!norm) continue;
      const mapped = SYNONYMS[norm];
      const key = mapped ? mapped.toLowerCase() : norm;
      const display = mapped ?? seenKeys.get(key) ?? t.trim();
      if (!seenKeys.has(key)) seenKeys.set(key, display);
      themeCounts.set(display, (themeCounts.get(display) || 0) + 1);
    }
  }
  const territoriesList = Array.from(themeCounts.entries())
    .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => t);
  const territories = territoriesList.length > 0 ? territoriesList : null;

  const entriesCount = entriesCountRes.count ?? 0;
  const documentsCount = documentsCountRes.count ?? 0;
  const evidenceCount = evidenceCountRes.count ?? 0;
  const activeSignalsCount = activeSignalsCountRes.count ?? 0;
  const fpSources = entriesCount + documentsCount;
  const fpThemes = territoriesList.length;
  const allZero = fpSources === 0 && evidenceCount === 0 && activeSignalsCount === 0 && fpThemes === 0;
  const footprint = allZero
    ? null
    : { sources: fpSources, evidence: evidenceCount, signals: activeSignalsCount, themes: fpThemes };

  const trackedCount = trackedCountRes.count ?? 0;
  const publishedCount = filterPublishedRows(auraPublishedRes.data || []).length;
  const fwCounts = new Map<string, number>();
  for (const r of (frameworkRowsRes.data || []) as any[]) {
    const k = r.framework_type;
    if (!k) continue;
    fwCounts.set(k, (fwCounts.get(k) || 0) + 1);
  }
  const frameworks = Array.from(fwCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([framework_type, count]) => ({ framework_type, count }));
  const content = trackedCount > 0 ? { publishedCount, trackedCount, frameworks } : null;

  const vp: any = voiceRes?.data || null;
  let voice: any = null;
  if (vp) {
    const tone = clampAtSentence((vp.tone || "").toString(), 1200);
    const preferred_structures = asStrArr(vp.preferred_structures).map((s) => s.trim()).filter(Boolean);
    const storytelling_patterns = asStrArr(vp.storytelling_patterns).map((s) => s.trim()).filter(Boolean);
    const vpRaw: any = vp.vocabulary_preferences || {};
    const vocabulary_preferences = { prefer: asStrArr(vpRaw.prefer), avoid: asStrArr(vpRaw.avoid) };
    const empty = !tone && preferred_structures.length === 0 && storytelling_patterns.length === 0 &&
      vocabulary_preferences.prefer.length === 0 && vocabulary_preferences.avoid.length === 0;
    if (!empty) voice = { tone, preferred_structures, storytelling_patterns, vocabulary_preferences };
  }

  return {
    user_id: userId,
    generated_at: new Date().toISOString(),
    profile, positioning, profile_intelligence, score, brand_position,
    capabilities, market_mirror, territories, footprint, content, voice,
  };
}

serve(withObserve("capture-report-snapshot", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let targetId: string | null = null;
  try {
    let body: any = {};
    try { body = await req.json(); } catch (_) { body = {}; }
    const requested = typeof body?.user_id === "string" ? body.user_id : null;

    // Trusted server-to-server path (no end-user session).
    const cronSecret = Deno.env.get("CRON_SECRET") || "";
    const cronHeader = req.headers.get("x-cron-secret") || "";
    if (cronSecret && cronHeader === cronSecret) {
      if (!requested) return json({ error: "user_id required" }, 400);
      targetId = requested;
      const data = await buildIdentityReport(admin, targetId);
      const version = await writeSnapshot(admin, targetId, data, "system");
      return json({ ok: true, version, keys: countSections(data) });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: userData, error: userErr } = await anon.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const callerId = userData.user.id;

    const { data: callerProfile } = await admin
      .from("diagnostic_profiles").select("is_admin").eq("user_id", callerId).maybeSingle();
    const isAdmin = callerProfile?.is_admin === true;

    if (requested && requested !== callerId && !isAdmin) {
      return json({ error: "Forbidden" }, 403);
    }
    targetId = requested && isAdmin ? requested : callerId;
    const created_by = targetId !== callerId ? "admin" : (body?.created_by === "admin" ? "admin" : body?.created_by === "system" ? "system" : "user");

    const data = await buildIdentityReport(admin, targetId);

    const nextVersion = await writeSnapshot(admin, targetId, data, created_by);
    return json({ ok: true, version: nextVersion, keys: countSections(data) });
  } catch (e) {
    await logEfError(admin, {
      function_name: "capture-report-snapshot",
      error: e,
      severity: "high",
      user_id: targetId,
      context: { stage: "capture" },
    });
    return json({ error: (e as Error)?.message || "capture failed" }, 500);
  }
}));
