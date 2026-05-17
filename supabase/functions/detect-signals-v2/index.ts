import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildConfidenceExplanation } from "../_shared/confidence.ts";

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

/* Count unique orgs from evidence fragment content */
async function countUniqueOrgs(
  admin: any,
  fragmentIds: string[],
): Promise<number> {
  if (fragmentIds.length === 0) return 1;
  const { data: frags } = await admin
    .from("evidence_fragments")
    .select("content, metadata")
    .in("id", fragmentIds);
  const domains = new Set<string>();
  (frags || []).forEach((f: any) => {
    const d = extractDomain(f.content || "");
    if (d) domains.add(d);
    // Also check metadata.source_title for URL domains
    const metaTitle = f.metadata?.source_title || "";
    const md = extractDomain(metaTitle);
    if (md) domains.add(md);
  });
  return Math.max(domains.size, 1);
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
): Promise<number> {
  const daysSinceUpdate = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86400000);
  const momentum = daysSinceUpdate <= 2 ? 0.8 : daysSinceUpdate <= 7 ? 0.5 : 0.2;
  const contentGap = 1.0;
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

function parseAiJson(raw: string): any {
  try { return JSON.parse(raw); } catch {
    const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    return JSON.parse((m ? m[1] : raw).replace(/[\u0000-\u001F\u007F]/g, " "));
  }
}

function unique<T>(arr: T[]): T[] { return [...new Set(arr)]; }

/* ── main ── */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { fragment_ids, source_registry_id, user_id } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

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

    // Use profile terms for relevance (no hardcoded RELEVANCE_TERMS)
    const hasRelevance = profileTerms.length === 0 || profileTerms.some(term => combinedContent.includes(term));
    if (!hasRelevance) {
      return new Response(JSON.stringify({ skipped: true, reason: "not relevant to profile" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const identityCtx = profile
      ? `User context: Level=${profile.level || "N/A"}, Firm=${profile.firm || "N/A"}, Sector=${profile.sector_focus || "N/A"}, Practice=${profile.core_practice || "N/A"}, Goal=${profile.north_star_goal || "N/A"}`
      : "No user profile available.";

    // Build content for AI from fragments
    const fragmentText = fragments.map(f =>
      `[${f.fragment_type}] "${f.title}": ${(f.content || "").slice(0, 500)} | Tags: ${(f.tags || []).join(",")}`
    ).join("\n\n");

    /* ── AI classification ── */
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

${identityCtx}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analyze these evidence fragments:\n\n${fragmentText.slice(0, 4000)}` },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      if (aiRes.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiRes.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI error: ${aiRes.status} ${errText}`);
    }

    const aiData = await aiRes.json();
    const signal = parseAiJson(aiData.choices?.[0]?.message?.content || "{}");

    const newTitle = signal.title || "Untitled Signal";
    const newSummary = signal.summary || "";
    const newType = signal.type || "market_trend";
    const newTags: string[] = Array.isArray(signal.theme_tags) ? signal.theme_tags.slice(0, 5) : [];
    if (!newTags.includes(newType)) newTags.unshift(newType);
    const aiBaseConfidence = Math.min(1, Math.max(0, signal.ai_base_confidence ?? 0.5));
    const whatItMeans = signal.what_it_means_for_you || "";

    // Quality gate: only accept signals with a real title and explanation
    const cleanTitle = (newTitle || "").trim();
    const cleanSummary = (newSummary || "").trim();
    if (
      !cleanTitle ||
      cleanTitle === "Untitled Signal" ||
      cleanTitle.length < 10 ||
      !cleanSummary
    ) {
      console.warn("Skipping low-quality signal:", JSON.stringify({ title: cleanTitle, summary: cleanSummary }));
      return new Response(JSON.stringify({
        skipped: true,
        reason: "low_quality_signal",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    /* ── Dedup check against existing signals ── */
    const { data: existingSignals } = await admin
      .from("strategic_signals")
      .select("id, signal_title, theme_tags, confidence, fragment_count, supporting_evidence_ids, unique_orgs, updated_at")
      .eq("user_id", user_id).eq("status", "active");

    const allSignals = existingSignals || [];

    function findMatches(tags: string[], title: string): typeof allSignals {
      return allSignals.filter(s => {
        const overlap = tagOverlapCount(tags, s.theme_tags || []);
        const titleMatch = titleSharesCoreTopic(title, s.signal_title || "");
        return overlap >= 2 || titleMatch;
      });
    }

    const matches = findMatches(newTags, newTitle);

    /* ── Reinforce an existing signal ── */
    async function reinforceSignal(signalRow: any): Promise<string> {
      const existingEvidence: string[] = signalRow.supporting_evidence_ids || [];
      // Check if ALL new fragments are already linked
      const newIds = targetFragmentIds.filter(id => !existingEvidence.includes(id));
      if (newIds.length === 0) return signalRow.id;

      const mergedEvidence = unique([...existingEvidence, ...newIds]);
      const newFragCount = mergedEvidence.length;
      const newUniqueOrgs = await countUniqueOrgs(admin, mergedEvidence);
      const now = new Date().toISOString();
      const { confidence, confidence_explanation } = calcConfidence(aiBaseConfidence, newFragCount, newUniqueOrgs, now);
      const priorityScore = await calcPriorityScore(confidence, now, 1.0, newFragCount, admin, user_id, signalRow.theme_tags || []);

      await admin.from("strategic_signals").update({
        supporting_evidence_ids: mergedEvidence,
        fragment_count: newFragCount,
        unique_orgs: newUniqueOrgs,
        confidence,
        confidence_explanation,
        what_it_means_for_you: whatItMeans,
        priority_score: priorityScore,
        updated_at: now,
      }).eq("id", signalRow.id);

      return signalRow.id;
    }

    let primarySignalId: string;
    let isNew: boolean;

    if (matches.length > 0) {
      const best = matches.sort((a, b) => (b.fragment_count || 0) - (a.fragment_count || 0))[0];
      primarySignalId = await reinforceSignal(best);
      isNew = false;
    } else {
      const now = new Date().toISOString();
      const initialUniqueOrgs = await countUniqueOrgs(admin, targetFragmentIds);
      const { confidence, confidence_explanation } = calcConfidence(aiBaseConfidence, targetFragmentIds.length, initialUniqueOrgs, now);
      const priorityScore = await calcPriorityScore(confidence, now, 1.0, targetFragmentIds.length, admin, user_id, newTags);

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
        status: "active",
        supporting_evidence_ids: targetFragmentIds,
        fragment_count: targetFragmentIds.length,
        unique_orgs: initialUniqueOrgs,
      }).select("id").single();

      if (insErr) throw new Error(`Insert: ${insErr.message}`);
      primarySignalId = row.id;
      isNew = true;
    }

    return new Response(JSON.stringify({
      success: true,
      signal_id: primarySignalId,
      is_new: isNew,
      reinforced: !isNew,
      fragments_processed: targetFragmentIds.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("detect-signals-v2 error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
