import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { withObserve } from "../_shared/observe.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildConfidenceExplanation } from "../_shared/confidence.ts";
import { canonicalizeTags } from "../_shared/themeCanon.ts";
import { logError } from "../_shared/logError.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ── helpers ── */

function normalizeText(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function stemWord(w: string): string {
  if (w.endsWith("ies") && w.length > 4) return w.slice(0, -3) + "y";
  if (w.endsWith("s") && !w.endsWith("ss") && w.length > 4) return w.slice(0, -1);
  return w;
}

const STOP = new Set([
  "the","and","for","with","from","that","this","into","about","your","their",
  "have","been","will","what","when","where","how","why","are","was","were",
  "is","a","an","of","in","on","to","by","or","as","at","it","its","than",
  "through","across","over","under","between",
]);

function keywords(text: string): string[] {
  return [...new Set(
    normalizeText(text).split(" ").map(stemWord).filter(w => w.length > 2 && !STOP.has(w))
  )];
}

function tagOverlapCount(a: string[], b: string[]): number {
  const setB = new Set(b.map(t => normalizeText(t)));
  return a.map(t => normalizeText(t)).filter(t => setB.has(t)).length;
}

function titleSharesCoreTopic(newTitle: string, existingTitle: string): boolean {
  const newKw = keywords(newTitle);
  const exKw = new Set(keywords(existingTitle));
  return newKw.filter(k => exKw.has(k)).length >= 2;
}

function extractDomain(text: string): string | null {
  const m = text.match(/https?:\/\/([^\/\s]+)/);
  return m ? m[1].replace(/^www\./, "") : null;
}

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.floor(Math.abs(a.getTime() - b.getTime()) / 86400000));
}

function calcConfidence(
  aiBaseScore: number,
  fragmentCount: number,
  uniqueOrgs: number,
  newestFragmentDate: string,
) {
  return buildConfidenceExplanation(aiBaseScore, fragmentCount, uniqueOrgs, newestFragmentDate);
}

/* Derived strength: breadth-led with diminishing returns. Fixed reference ceilings. */
function computeStrength(breadth: number, depth: number): number {
  const b = Math.log(1 + Math.max(0, breadth)) / Math.log(16); // breadth, ref ceiling 15
  const d = Math.log(1 + Math.max(0, depth))   / Math.log(51); // depth,  ref ceiling 50
  return Math.min(1, Math.max(0, 0.60 * b + 0.40 * d));
}

/* Count unique sources via source_registry_id (one row per distinct source) */
async function countUniqueOrgs(
  admin: any,
  fragmentIds: string[],
): Promise<number> {
  if (fragmentIds.length === 0) return 1;
  const { data: frags } = await admin
    .from("evidence_fragments")
    .select("source_registry_id")
    .in("id", fragmentIds);
  const sources = new Set<string>();
  (frags || []).forEach((f: any) => {
    if (f.source_registry_id) sources.add(f.source_registry_id);
  });
  return Math.max(sources.size, 1);
}

/* Count unique underlying sources (entries/documents) for a set of fragment IDs */
async function countUniqueSources(
  admin: any,
  fragmentIds: string[],
): Promise<number> {
  if (fragmentIds.length === 0) return 1;
  const { data: frags } = await admin
    .from("evidence_fragments")
    .select("source_registry_id")
    .in("id", fragmentIds);
  const ids = new Set<string>();
  (frags || []).forEach((f: any) => { if (f.source_registry_id) ids.add(f.source_registry_id); });
  return Math.max(ids.size, 1);
}

async function calcPriorityScore(
  confidence: number,
  updatedAt: string,
  profileRelevance: number,
  fragmentCount: number,
  admin: any,
  userId: string,
  themeTags: string[],
  contentGap: number = 1.0,
): Promise<number> {
  const daysSinceUpdate = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86400000);
  const momentum = daysSinceUpdate <= 2 ? 0.8 : daysSinceUpdate <= 7 ? 0.5 : 0.2;
  let base = (profileRelevance * 0.35) + (confidence * 0.30) + (momentum * 0.20) + (contentGap * 0.15) + (fragmentCount / 1000);
  if (themeTags.length > 0) {
    const { data: prefs } = await admin
      .from("signal_topic_preferences")
      .select("preference_score")
      .eq("user_id", userId)
      .in("theme_tag", themeTags);
    if (prefs && prefs.length > 0) {
      const avgPref = prefs.reduce((sum: number, p: any) => sum + (p.preference_score || 0), 0) / prefs.length;
      base = Math.min(Math.max(base + (avgPref * 0.10), 0.0), 1.0);
    }
  }
  return base;
}

// Robust JSON parser for LLM output. Never throws.
// Returns the parsed object, or null if the response cannot be salvaged.
// The gateway intermittently ignores response_format:json_object and returns a
// top-level ARRAY wrapping the object. Normalise the shape once, here.
function unwrapObject(v: any): any | null {
  if (Array.isArray(v)) {
    for (const el of v) {
      if (el && typeof el === "object" && !Array.isArray(el)) return el;
    }
    return null;
  }
  if (v && typeof v === "object") return v;
  return null;
}

function parseAiJson(raw: string): any | null {
  if (!raw) return null;
  // 1) direct parse
  try { return unwrapObject(JSON.parse(raw)); } catch { /* fall through */ }
  // 2) strip ``` fences + control chars, retry
  try {
    const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const cleaned = (m ? m[1] : raw).replace(/[\u0000-\u001F\u007F]/g, " ");
    return unwrapObject(JSON.parse(cleaned));
  } catch { /* fall through */ }
  // 3) extract first balanced {...} block and try that (handles trailing prose)
  try {
    const cleaned = raw.replace(/[\u0000-\u001F\u007F]/g, " ");
    const start = cleaned.indexOf("{");
    if (start >= 0) {
      let depth = 0;
      for (let i = start; i < cleaned.length; i++) {
        const c = cleaned[i];
        if (c === "{") depth++;
        else if (c === "}") {
          depth--;
          if (depth === 0) {
            return unwrapObject(JSON.parse(cleaned.slice(start, i + 1)));
          }
        }
      }
    }
  } catch { /* fall through */ }
  return null;
}

function unique<T>(arr: T[]): T[] { return [...new Set(arr)]; }

/* ── main ── */

Deno.serve(withObserve("detect-signals-v2", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Always authenticate first. Derive user_id from verified JWT.
    // Body user_id is only honored for service-role / cron callers.
    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.replace("Bearer ", "");
    const cronHeader = req.headers.get("x-cron-secret") || "";
    const apiKeyHeader = req.headers.get("apikey") || req.headers.get("x-api-key") || "";
    const isServiceRole = !!bearer && (bearer === serviceKey || apiKeyHeader === serviceKey);
    const isCron = !!CRON_SECRET && cronHeader === CRON_SECRET;

    let body: any = {};
    try { body = await req.json(); } catch (_) { /* no body */ }

    let user_id: string | null = null;
    if (isServiceRole || isCron) {
      if (body && typeof body.user_id === "string") user_id = body.user_id;
    } else {
      if (!bearer) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const userClient = createClient(supabaseUrl, ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      });
      const { data: { user }, error: userErr } = await userClient.auth.getUser(bearer);
      if (userErr || !user) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      user_id = user.id;
    }

    const { fragment_ids, source_registry_id } = body || {};
    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Resolve fragments: either passed directly or fetched from source_registry_id
    let targetFragmentIds: string[] = fragment_ids || [];

    if (targetFragmentIds.length === 0 && source_registry_id) {
      const { data: frags } = await admin
        .from("evidence_fragments")
        .select("id")
        .eq("source_registry_id", source_registry_id)
        .eq("user_id", user_id);
      targetFragmentIds = (frags || []).map((f: any) => f.id);
    }

    if (targetFragmentIds.length === 0) {
      return new Response(JSON.stringify({ skipped: true, reason: "no fragments to process" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the actual fragment data
    const { data: fragments, error: fragErr } = await admin
      .from("evidence_fragments")
      .select("id, title, content, fragment_type, tags, skill_pillars, confidence, entities, created_at")
      .in("id", targetFragmentIds)
      .eq("user_id", user_id);

    if (fragErr) throw new Error(`Fragment fetch: ${fragErr.message}`);
    if (!fragments || fragments.length === 0) {
      return new Response(JSON.stringify({ skipped: true, reason: "fragments not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch profile for relevance filter + AI context
    const { data: profile } = await admin
      .from("diagnostic_profiles")
      .select("sector_focus, core_practice, north_star_goal, level, firm, brand_pillars")
      .eq("user_id", user_id).maybeSingle();

    // Combine fragment content for relevance check
    const combinedContent = normalizeText(
      fragments.map(f => `${f.title || ""} ${f.content || ""}`).join(" ")
    );

    // Profile-based relevance filter
    const profileTerms: string[] = [];
    if (profile) {
      [profile.sector_focus, profile.core_practice, profile.north_star_goal, profile.firm]
        .filter(Boolean).forEach(v => profileTerms.push(...keywords(v!)));
      if (Array.isArray(profile.brand_pillars)) {
        profile.brand_pillars.filter(Boolean).forEach((p: string) => profileTerms.push(...keywords(p)));
      }
    }

    // Relevance is a soft hint only — never a hard drop. The AI classifier's
    // ai_base_confidence is the real relevance judge; the CONFIDENCE_FLOOR below
    // routes weak clusters to 'dormant' instead of discarding the user's capture.
    const profileRelevanceHint = profileTerms.length === 0 || profileTerms.some(term => combinedContent.includes(term));

    const identityCtx = profile
      ? `User context: Level=${profile.level || "N/A"}, Firm=${profile.firm || "N/A"}, Sector=${profile.sector_focus || "N/A"}, Practice=${profile.core_practice || "N/A"}, Goal=${profile.north_star_goal || "N/A"}`
      : "No user profile available.";

    /* ── Phase A: cluster fragment titles into coherent themes ── */
    const targetClusters = Math.max(1, Math.min(8, Math.round(fragments.length / 8)));
    const fragmentIndex = fragments.map((f: any, i: number) => ({ i, id: f.id, title: f.title || "", content: f.content || "", tags: f.tags || [], fragment_type: f.fragment_type }));

    type Cluster = { theme?: string; fragment_indexes: number[] };
    let clusters: Cluster[] = [];

    if (fragments.length <= 4 || targetClusters === 1) {
      clusters = [{ theme: "all", fragment_indexes: fragmentIndex.map((f: any) => f.i) }];
    } else {
      const titlesForGrouping = fragmentIndex
        .map((f: any) => `${f.i}: ${(f.title || "").slice(0, 160)}`)
        .join("\n");
      const groupSystem = `You group evidence fragment titles into coherent themes.
Return ONLY valid JSON: {"clusters":[{"theme":"short label","fragment_indexes":[integers]}]}
Rules:
- Aim for about ${targetClusters} clusters (min 1, max 8).
- Every fragment index must appear in exactly one cluster.
- Group by subject/theme, not by fragment type.
- Theme labels are 2-5 words, plain language, no jargon.`;

      try {
        const grpRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: groupSystem },
              { role: "user", content: `Fragment titles (index: title):\n${titlesForGrouping}` },
            ],
            response_format: { type: "json_object" },
          }),
        });
        if (grpRes.ok) {
          const grpData = await grpRes.json();
          const parsed = parseAiJson(grpData.choices?.[0]?.message?.content || "{}");
          const rawClusters = Array.isArray(parsed?.clusters) ? parsed.clusters : [];
          const seen = new Set<number>();
          for (const c of rawClusters) {
            const idxs = Array.isArray(c?.fragment_indexes)
              ? c.fragment_indexes.filter((n: any) => Number.isInteger(n) && n >= 0 && n < fragments.length && !seen.has(n))
              : [];
            idxs.forEach((n: number) => seen.add(n));
            if (idxs.length > 0) clusters.push({ theme: String(c?.theme || "").slice(0, 60), fragment_indexes: idxs });
          }
          // Attach any unassigned fragments to the largest cluster
          const missing = fragmentIndex.filter((f: any) => !seen.has(f.i)).map((f: any) => f.i);
          if (missing.length > 0) {
            if (clusters.length === 0) clusters.push({ theme: "all", fragment_indexes: missing });
            else {
              const biggest = clusters.reduce((a, b) => (a.fragment_indexes.length >= b.fragment_indexes.length ? a : b));
              biggest.fragment_indexes.push(...missing);
            }
          }
        }
      } catch (e) {
        console.warn("[detect-signals-v2] clustering failed, falling back to single cluster:", (e as Error).message);
      }
      if (clusters.length === 0) {
        clusters = [{ theme: "all", fragment_indexes: fragmentIndex.map((f: any) => f.i) }];
      }
    }

    /* ── Phase B: classify each cluster with existing prompt ── */
    const systemPrompt = `You are a Strategic Signal Detector.
Given evidence fragments and user context, classify them and return valid JSON with these exact fields:
{
  "title": "plain language statement of fact, max 10 words, no jargon",
  "summary": "2 sentences, plain language",
  "type": "market_trend|skill_gap|competitor_move|career_opportunity|content_gap",
  "theme_tags": ["3 to 5 short topic strings"],
  "ai_base_confidence": 0.0 to 1.0 (be strict: 0.9+ = direct evidence with named sources, 0.7-0.89 = strong thematic match to user's industry, 0.5-0.69 = tangentially related, 0.3-0.49 = weak or generic connection, below 0.3 = barely relevant),
  "what_it_means_for_you": "one sentence connecting this signal to the user's career target and industry, personalised"
}

theme_tags are subject themes only — never signal types like market_trend or competitor_move.

${identityCtx}`;

    let lastRawSample = "";
    async function classifyCluster(clusterFragIds: string[], repair = false): Promise<any | null> {
      const clusterFrags = fragmentIndex.filter((f: any) => clusterFragIds.includes(f.id)).slice(0, 12);
      const text = clusterFrags.map((f: any) =>
        `[${f.fragment_type}] "${f.title}": ${(f.content || "").slice(0, 400)} | Tags: ${(f.tags || []).join(",")}`
      ).join("\n\n");
      const repairInstruction = repair
        ? `\n\nIMPORTANT REPAIR INSTRUCTION: your previous response was missing a usable "title" or "summary". Return BOTH fields populated. "title" must be a specific, meaningful headline of at least 10 characters (never "Untitled Signal"), and "summary" must be a non-empty explanation.`
        : "";
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Analyze these evidence fragments:\n\n${text}${repairInstruction}` },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (!res.ok) {
        if (res.status === 429 || res.status === 402) {
          const errBody = { status: res.status };
          throw Object.assign(new Error(`ai_${res.status}`), errBody);
        }
        const errText = await res.text();
        throw new Error(`AI error: ${res.status} ${errText}`);
      }
      const data = await res.json();
      const raw = data.choices?.[0]?.message?.content || "{}";
      lastRawSample = String(raw).slice(0, 300);
      const parsed = parseAiJson(raw);
      if (!parsed) {
        EdgeRuntime.waitUntil(
          logError("detect-signals-v2", new Error("ai_json_parse_failed"), {
            user_id,
            severity: "info",
            context: { raw_sample: String(raw).slice(0, 300) },
          }),
        );
        return null;
      }
      return parsed;
    }

    /* ── Compute content gap based on user's prior posts on these tags ── */
    async function computeContentGap(tags: string[], title: string): Promise<number> {
      const topTags = (tags || []).filter(Boolean).slice(0, 2);
      if (topTags.length === 0) {
        console.log(`[detect-signals-v2] contentGap=1.0 for "${title}" (no tags)`);
        return 1.0;
      }
      const orFilter = topTags.map(t => `post_text.ilike.%${t.replace(/[,()]/g, " ")}%`).join(",");
      const { count, error } = await admin
        .from("linkedin_posts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user_id)
        .or(orFilter);
      if (error) {
        console.warn(`[detect-signals-v2] contentGap query failed:`, error.message);
        return 1.0;
      }
      const matchCount = count || 0;
      const gap = matchCount === 0 ? 1.0 : matchCount === 1 ? 0.6 : 0.2;
      console.log(`[detect-signals-v2] contentGap=${gap} for "${title}" (${matchCount} posts match)`);
      return gap;
    }

    /* ── Dedup check against existing signals ── */
    const { data: existingSignals } = await admin
      .from("strategic_signals")
      .select("id, signal_title, theme_tags, confidence, fragment_count, supporting_evidence_ids, unique_orgs, updated_at, status")
      .eq("user_id", user_id).in("status", ["active", "dormant"]);

    const allSignals: any[] = existingSignals || [];
    // Signals created in this invocation, eligible for matching by later clusters
    const runtimeSignals: any[] = [];

    function findMatches(tags: string[], title: string): any[] {
      const pool = [...allSignals, ...runtimeSignals];
      return pool.filter(s => {
        const overlap = tagOverlapCount(tags, s.theme_tags || []);
        const titleMatch = titleSharesCoreTopic(title, s.signal_title || "");
        return (overlap >= 2 && titleMatch) || overlap >= 3;
      });
    }

    /* ── Reinforce an existing signal with a specific fragment set ── */
    async function reinforceSignal(
      signalRow: any,
      clusterFragmentIds: string[],
      newTags: string[],
      aiBaseConfidence: number,
      whatItMeans: string,
      contentGap: number,
    ): Promise<{ signal_id: string; fragments_attached: number }> {
      const existingEvidence: string[] = signalRow.supporting_evidence_ids || [];
      const newIds = clusterFragmentIds.filter(id => !existingEvidence.includes(id));
      if (newIds.length === 0) return { signal_id: signalRow.id, fragments_attached: 0 };

      const mergedEvidence = unique([...existingEvidence, ...newIds]);
      const newFragCount = mergedEvidence.length;
      const newUniqueOrgs = await countUniqueOrgs(admin, mergedEvidence);
      const newUniqueSources = await countUniqueSources(admin, mergedEvidence);
      const now = new Date().toISOString();
      const { confidence, confidence_explanation } = calcConfidence(aiBaseConfidence, newUniqueSources, newUniqueOrgs, now);
      const mergedTags = canonicalizeTags([...(signalRow.theme_tags || []), ...newTags]);
      const priorityScore = await calcPriorityScore(confidence, now, 1.0, newFragCount, admin, user_id, mergedTags, contentGap);

      await admin.from("strategic_signals").update({
        supporting_evidence_ids: mergedEvidence,
        fragment_count: newFragCount,
        unique_orgs: newUniqueOrgs,
        strength_score: computeStrength(newUniqueOrgs, newFragCount),
        confidence,
        confidence_explanation,
        what_it_means_for_you: whatItMeans,
        priority_score: priorityScore,
        theme_tags: mergedTags,
        updated_at: now,
        ...(signalRow.status === "dormant" && confidence >= 0.15
          ? { status: "active", velocity_status: "stable" }
          : {}),
      }).eq("id", signalRow.id);

      // Update runtime cache so later clusters can match against the reinforced row
      signalRow.supporting_evidence_ids = mergedEvidence;
      signalRow.fragment_count = newFragCount;
      signalRow.theme_tags = mergedTags;
      signalRow.status = signalRow.status === "dormant" && confidence >= 0.15 ? "active" : signalRow.status;

      return { signal_id: signalRow.id, fragments_attached: newIds.length };
    }

    /* ── Iterate clusters ── */
    const MAX_NEW_SIGNALS = 5;
    const CONFIDENCE_FLOOR = 0.35; // ai_base_confidence below this → create as 'dormant', never active. TODO: validate via metrics.
    const resultSignals: Array<{ signal_id: string; is_new: boolean; fragments_attached: number }> = [];
    let newCount = 0;
    let reinforcedCount = 0;
    let droppedCount = 0;
    const dropReasons: string[] = [];
    let dormantCount = 0;

    for (let ci = 0; ci < clusters.length; ci++) {
      const cluster = clusters[ci];
      const clusterFragIds = cluster.fragment_indexes
        .map((idx) => fragmentIndex[idx]?.id)
        .filter((x: any): x is string => typeof x === "string");
      if (clusterFragIds.length === 0) { droppedCount++; dropReasons.push("empty_cluster"); continue; }

      let signal: any;
      try {
        signal = await classifyCluster(clusterFragIds);
      } catch (e: any) {
        if (e?.status === 429 || e?.status === 402) {
          return new Response(JSON.stringify({ error: e.status === 429 ? "Aura is busy — try again in a moment." : "Aura is temporarily unavailable. Try again later." }), { status: e.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        throw e;
      }
      if (!signal) { droppedCount++; dropReasons.push("ai_json_parse_failed"); continue; }

      const passesGate = (s: any) => {
        const t = (s?.title || "").trim();
        const su = (s?.summary || "").trim();
        return !!t && t !== "Untitled Signal" && t.length >= 10 && !!su;
      };

      // Quality gate per cluster — NEVER discard the user's capture.
      // Retry once with a repair instruction, then fall back to a dormant signal.
      if (!passesGate(signal)) {
        const firstRaw = lastRawSample;
        let retried: any = null;
        try {
          retried = await classifyCluster(clusterFragIds, true);
        } catch (e: any) {
          if (e?.status === 429 || e?.status === 402) {
            return new Response(JSON.stringify({ error: e.status === 429 ? "Aura is busy — try again in a moment." : "Aura is temporarily unavailable. Try again later." }), { status: e.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          console.error("[detect-signals-v2] repair retry threw:", e?.message);
        }

        await logError("detect-signals-v2", new Error("low_quality_signal"), {
          user_id,
          severity: "high",
          context: {
            stage: passesGate(retried) ? "retry_recovered" : "retry_failed_dormant_fallback",
            source_registry_id: source_registry_id ?? null,
            fragment_ids: clusterFragIds,
            raw_sample: (passesGate(retried) ? firstRaw : lastRawSample) || firstRaw,
          },
        });

        if (passesGate(retried)) {
          signal = retried;
        } else {
          // Deterministic dormant signal built from the cluster's most frequent tags.
          const tagCounts = new Map<string, number>();
          for (const f of fragmentIndex) {
            if (!clusterFragIds.includes(f.id)) continue;
            for (const t of (f.tags || [])) {
              const k = String(t).trim();
              if (k) tagCounts.set(k, (tagCounts.get(k) || 0) + 1);
            }
          }
          const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
          const fallbackTags = canonicalizeTags(topTags.slice(0, 5));
          const themeLabel = topTags.slice(0, 2).join(" · ") || "Emerging theme";
          const fallbackTitle = `Emerging theme: ${themeLabel}`;
          const nowIso = new Date().toISOString();
          const uOrgs = await countUniqueOrgs(admin, clusterFragIds);
          const uSources = await countUniqueSources(admin, clusterFragIds);
          const { confidence: fbConf, confidence_explanation: fbExpl } =
            calcConfidence(0.3, uSources, uOrgs, nowIso);

          const { data: dormantRow, error: dormErr } = await admin.from("strategic_signals").insert({
            user_id,
            signal_title: fallbackTitle,
            explanation: `This theme was detected in your capture but is not yet strong enough to stand on its own. Aura is holding it until more evidence arrives.`,
            strategic_implications: "",
            theme_tags: fallbackTags,
            confidence: fbConf,
            confidence_explanation: fbExpl,
            what_it_means_for_you: "",
            priority_score: 0,
            status: "dormant",
            lifecycle_tier: "emerging",
            supporting_evidence_ids: clusterFragIds,
            fragment_count: clusterFragIds.length,
            unique_orgs: uOrgs,
            strength_score: computeStrength(uOrgs, clusterFragIds.length),
          }).select("id").single();

          if (dormErr) throw new Error(`Dormant insert: ${dormErr.message}`);

          resultSignals.push({ signal_id: dormantRow.id, is_new: true, fragments_attached: clusterFragIds.length });
          newCount++;
          dormantCount++;
          runtimeSignals.push({
            id: dormantRow.id,
            signal_title: fallbackTitle,
            theme_tags: fallbackTags,
            supporting_evidence_ids: clusterFragIds,
            fragment_count: clusterFragIds.length,
            status: "dormant",
          });
          continue;
        }
      }

      const newTitle = (signal.title || "").trim();
      const newSummary = (signal.summary || "").trim();
      const rawTags: string[] = Array.isArray(signal.theme_tags) ? signal.theme_tags.slice(0, 5) : [];
      const newTags: string[] = canonicalizeTags(rawTags);
      const aiBaseConfidence = Math.min(1, Math.max(0, signal.ai_base_confidence ?? 0.5));
      const whatItMeans = signal.what_it_means_for_you || "";

      const contentGap = await computeContentGap(newTags, newTitle);
      const matches = findMatches(newTags, newTitle);

      if (matches.length > 0) {
        const best = matches.sort((a, b) => (b.fragment_count || 0) - (a.fragment_count || 0))[0];
        const r = await reinforceSignal(best, clusterFragIds, newTags, aiBaseConfidence, whatItMeans, contentGap);
        resultSignals.push({ signal_id: r.signal_id, is_new: false, fragments_attached: r.fragments_attached });
        reinforcedCount++;
        continue;
      }

      // No matches: create new, but cap at MAX_NEW_SIGNALS
      if (newCount >= MAX_NEW_SIGNALS) {
        droppedCount++;
        dropReasons.push("new_signal_cap_reached");
        continue;
      }

      const belowFloor = aiBaseConfidence < CONFIDENCE_FLOOR;
      const now = new Date().toISOString();
      const initialUniqueOrgs = await countUniqueOrgs(admin, clusterFragIds);
      const initialUniqueSources = await countUniqueSources(admin, clusterFragIds);
      const { confidence, confidence_explanation } = calcConfidence(aiBaseConfidence, initialUniqueSources, initialUniqueOrgs, now);
      const priorityScore = await calcPriorityScore(confidence, now, 1.0, clusterFragIds.length, admin, user_id, newTags, contentGap);

      const { data: row, error: insErr } = await admin.from("strategic_signals").insert({
        user_id,
        signal_title: newTitle,
        explanation: newSummary,
        strategic_implications: whatItMeans,
        theme_tags: newTags,
        confidence,
        confidence_explanation,
        what_it_means_for_you: whatItMeans,
        priority_score: priorityScore,
        status: belowFloor ? "dormant" : "active",
        lifecycle_tier: "emerging",
        supporting_evidence_ids: clusterFragIds,
        fragment_count: clusterFragIds.length,
        unique_orgs: initialUniqueOrgs,
        strength_score: computeStrength(initialUniqueOrgs, clusterFragIds.length),
      }).select("id").single();

      if (insErr) throw new Error(`Insert: ${insErr.message}`);

      resultSignals.push({ signal_id: row.id, is_new: true, fragments_attached: clusterFragIds.length });
      newCount++;
      if (belowFloor) dormantCount++;

      // Cache for later clusters so they can reinforce rather than duplicate
      runtimeSignals.push({
        id: row.id,
        signal_title: newTitle,
        theme_tags: newTags,
        supporting_evidence_ids: clusterFragIds,
        fragment_count: clusterFragIds.length,
        status: belowFloor ? "dormant" : "active",
      });
    }

    // Mark the source as signalled so the outcome is a fact, not an inference.
    if (source_registry_id) {
      const { error: statusErr } = await admin
        .from("source_registry")
        .update({ signal_status: "done" })
        .eq("id", source_registry_id);
      if (statusErr) console.error("[detect-signals-v2] signal_status update failed:", statusErr.message);
    }

    // Summary log. Silence on a user's capture is not an info event.
    const summarySeverity = (newCount === 0 && reinforcedCount === 0) ? "high" : "info";
    await logError("detect-signals-v2", new Error("cluster_summary"), {
        user_id,
        severity: summarySeverity,
        context: {
          clusters_found: clusters.length,
          new_count: newCount,
          reinforced_count: reinforcedCount,
          dropped_count: droppedCount,
          drop_reasons: dropReasons,
          fragments: fragments.length,
          dormant_count: dormantCount,
          relevance_hint: profileRelevanceHint,
        },
      });

    // Trigger score recalc in background (non-blocking)
    try {
      // @ts-ignore EdgeRuntime is available in Supabase Edge
      EdgeRuntime.waitUntil((async () => {
        try {
          await admin.functions.invoke("calculate-aura-score", {
            body: { user_id },
          });
          console.log(`[detect-signals-v2] score recalc triggered for ${user_id}`);
        } catch (e) {
          console.error(`[detect-signals-v2] score recalc failed (non-blocking):`, e);
        }
      })());
    } catch (_) { /* EdgeRuntime not available */ }

    return new Response(JSON.stringify({
      success: true,
      signals: resultSignals,
      clusters_found: clusters.length,
      new_count: newCount,
      reinforced_count: reinforcedCount,
      dropped_count: droppedCount,
      fragments_processed: targetFragmentIds.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("detect-signals-v2 error:", error);
    EdgeRuntime.waitUntil(logError("detect-signals-v2", error, { user_id: null }));
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}));
