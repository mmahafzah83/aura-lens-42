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
  "the","and","for","of","in","a","an","to","with","by","as","at","from",
  "is","are","was","were","be","been","being","have","has","had","do","does","did",
  "will","would","could","should","may","might","shall","can","its","this","that",
  "these","those","their","our","your","my",
  "it","or","on","into","about","what","when","where","how","why","than",
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

function titleSimilarity(newTitle: string, existingTitle: string): number {
  const newWords = keywords(newTitle);
  if (newWords.length === 0) return 0;
  const exSet = new Set(keywords(existingTitle));
  const matchCount = newWords.filter(w => exSet.has(w)).length;
  return matchCount / newWords.length;
}

function isDuplicate(newTags: string[], newTitle: string, existingTags: string[], existingTitle: string): boolean {
  if (tagOverlapCount(newTags, existingTags) >= 2) return true;
  if (titleSimilarity(newTitle, existingTitle) >= 0.6) return true;
  return false;
}

function unique<T>(arr: T[]): T[] { return [...new Set(arr)]; }

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.floor(Math.abs(a.getTime() - b.getTime()) / 86400000));
}

/* ── Confidence formula (shared with detect-signals-v2) ── */
function calcConfidence(
  aiBaseScore: number,
  fragmentCount: number,
  uniqueOrgs: number,
  newestFragmentDate: string,
) {
  return buildConfidenceExplanation(aiBaseScore, fragmentCount, uniqueOrgs, newestFragmentDate);
}

function parseAiJson(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const cleaned = (match ? match[1] : raw).replace(/[\u0000-\u001F\u007F]/g, " ");
    return JSON.parse(cleaned);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_id } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Fetch recent evidence fragments (last 90 days, max 200)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const { data: fragments, error: fragErr } = await adminClient
      .from("evidence_fragments")
      .select("id, title, content, fragment_type, skill_pillars, tags, confidence, entities, created_at")
      .eq("user_id", user_id)
      .gte("created_at", ninetyDaysAgo.toISOString())
      .order("created_at", { ascending: false })
      .limit(200);

    if (fragErr) throw new Error(`Fragments fetch error: ${fragErr.message}`);
    if (!fragments || fragments.length < 3) {
      return new Response(JSON.stringify({
        success: true,
        signals: [],
        message: "Not enough evidence fragments for pattern detection (minimum 3 required)",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user's skill context for relevance
    const { data: profile } = await adminClient
      .from("diagnostic_profiles")
      .select("generated_skills, skill_ratings, sector_focus, core_practice, north_star_goal")
      .eq("user_id", user_id)
      .maybeSingle();

    const profileContext = profile
      ? `User context: Sector=${profile.sector_focus || "N/A"}, Practice=${profile.core_practice || "N/A"}, Goal=${profile.north_star_goal || "N/A"}`
      : "";

    // Get existing signals for dedup (full data needed for reinforcement)
    const { data: existingSignals } = await adminClient
      .from("strategic_signals")
      .select("id, signal_title, theme_tags, confidence, fragment_count, supporting_evidence_ids, unique_orgs, updated_at")
      .eq("user_id", user_id)
      .eq("status", "active");

    const allExisting = existingSignals || [];
    const existingTitles = allExisting.map((s: any) => s.signal_title).join(", ");

    // Prepare fragment summaries for AI
    const fragmentSummaries = fragments.map((f: any, i: number) =>
      `[${i + 1}] (${f.fragment_type}) "${f.title}": ${f.content.slice(0, 150)} | Tags: ${(f.tags || []).join(",")} | Skills: ${(f.skill_pillars || []).join(",")}`
    ).join("\n");

    const systemPrompt = `You are a Strategic Pattern Detection Engine for an executive coaching platform.

Analyze the evidence fragments below and identify CLUSTERS of related insights that form strategic signals.

Rules:
- Only surface patterns supported by 3+ fragments
- Each signal must be ACTIONABLE for a senior consulting Director
- Avoid duplicating these existing signals: ${existingTitles || "none"}
- Focus on patterns relevant to the user's context
${profileContext}

For each detected pattern, output:
- signal_title: Bold, concise title (5-10 words)
- explanation: 2-3 sentences explaining the pattern
- strategic_implications: 2-3 sentences on what this means strategically
- supporting_fragment_indices: array of fragment indices (1-based) that support this
- theme_tags: 3-5 keyword tags
- skill_pillars: relevant skills from ["Strategic Architecture","C-Suite Stewardship","Sector Foresight","Digital Synthesis","Executive Presence","Commercial Velocity","Human-Centric Leadership","Operational Resilience","Geopolitical Fluency","Value-Based P&L"]
- confidence: 0.0-1.0
- framework_opportunity: { title, description, potential_steps: string[] } - a framework that could be built from this pattern
- content_opportunity: { title, hook, angle } - a LinkedIn/thought leadership post opportunity
- consulting_opportunity: { service_name, problem, target_clients, value_proposition } - a potential advisory or consulting theme derived from the signal

Output valid JSON: { "signals": [...] }
Detect 2-5 signals maximum. Quality over quantity.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analyze these ${fragments.length} evidence fragments for strategic patterns:\n\n${fragmentSummaries}` },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds in Settings > Workspace > Usage." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI error: ${aiRes.status} ${errText}`);
    }

    const aiData = await aiRes.json();
    const parsed = parseAiJson(aiData.choices?.[0]?.message?.content || "{}");
    const signals = parsed.signals || [];

    // Process signals with two-layer dedup
    const results: any[] = [];

    // Also track signals we just created in this batch to dedup within the batch itself
    const batchSignals: { id: string; title: string; tags: string[]; }[] = [];

    for (const signal of signals) {
      const newTitle = signal.signal_title || "Untitled Signal";
      const newTags: string[] = Array.isArray(signal.theme_tags) ? signal.theme_tags : [];

      // Map fragment indices to actual IDs
      const evidenceIds = (signal.supporting_fragment_indices || [])
        .map((idx: number) => fragments[idx - 1]?.id)
        .filter(Boolean);

      // Two-layer dedup check against existing DB signals
      const existingMatch = allExisting.find(s =>
        isDuplicate(newTags, newTitle, s.theme_tags || [], s.signal_title || "")
      );

      // Also check against signals we just created in this batch
      const batchMatch = !existingMatch
        ? batchSignals.find(s => isDuplicate(newTags, newTitle, s.tags, s.title))
        : null;

      if (existingMatch) {
        // Reinforce existing signal
        const existing = existingMatch;
        const mergedEvidence = unique([...(existing.supporting_evidence_ids || []), ...evidenceIds]);
        const newFragCount = mergedEvidence.length;

        const nowTs = new Date().toISOString();
        const aiScore = signal.confidence || 0.7;
        const { data: srcFrags1 } = await adminClient
          .from("evidence_fragments").select("source_registry_id").in("id", mergedEvidence);
        const uniqueSources1 = new Set((srcFrags1 || []).map((f: any) => f.source_registry_id).filter(Boolean)).size || 1;
        const { confidence: newConf, confidence_explanation } = calcConfidence(aiScore, uniqueSources1, existing.unique_orgs || 1, nowTs);

        await adminClient.from("strategic_signals").update({
          supporting_evidence_ids: mergedEvidence,
          fragment_count: newFragCount,
          confidence: newConf,
          confidence_explanation,
          updated_at: nowTs,
        }).eq("id", existing.id);

        // Update local copy so subsequent signals in this batch also see the update
        existing.supporting_evidence_ids = mergedEvidence;
        existing.fragment_count = newFragCount;

        results.push({ ...existing, reinforced: true });
      } else if (batchMatch) {
        // Reinforce the signal we just created in this batch
        const batchId = batchMatch.id;
        const { data: current } = await adminClient
          .from("strategic_signals")
          .select("supporting_evidence_ids, fragment_count, confidence")
          .eq("id", batchId)
          .single();

        if (current) {
          const mergedEvidence = unique([...(current.supporting_evidence_ids || []), ...evidenceIds]);
          const nowTs2 = new Date().toISOString();
          const aiScore2 = signal.confidence || 0.7;
          const { data: srcFrags2 } = await adminClient
            .from("evidence_fragments").select("source_registry_id").in("id", mergedEvidence);
          const uniqueSources2 = new Set((srcFrags2 || []).map((f: any) => f.source_registry_id).filter(Boolean)).size || 1;
          const { confidence: newConf2, confidence_explanation: ce2 } = calcConfidence(aiScore2, uniqueSources2, 1, nowTs2);
          await adminClient.from("strategic_signals").update({
            supporting_evidence_ids: mergedEvidence,
            fragment_count: mergedEvidence.length,
            confidence: newConf2,
            confidence_explanation: ce2,
            updated_at: nowTs2,
          }).eq("id", batchId);

          results.push({ id: batchId, reinforced: true });
        }
      } else {
        // Insert new signal
        const nowTs3 = new Date().toISOString();
        const aiScore3 = signal.confidence || 0.7;
        const { data: srcFrags3 } = await adminClient
          .from("evidence_fragments").select("source_registry_id").in("id", evidenceIds);
        const uniqueSources3 = new Set((srcFrags3 || []).map((f: any) => f.source_registry_id).filter(Boolean)).size || 1;
        const { confidence: newConf3, confidence_explanation: ce3 } = calcConfidence(aiScore3, uniqueSources3, 1, nowTs3);

        const { data: row, error: insErr } = await adminClient
          .from("strategic_signals")
          .insert({
            user_id,
            signal_title: newTitle,
            explanation: signal.explanation,
            strategic_implications: signal.strategic_implications,
            supporting_evidence_ids: evidenceIds,
            theme_tags: newTags,
            skill_pillars: signal.skill_pillars || [],
            confidence: newConf3,
            confidence_explanation: ce3,
            fragment_count: evidenceIds.length,
            framework_opportunity: signal.framework_opportunity || {},
            content_opportunity: signal.content_opportunity || {},
            consulting_opportunity: signal.consulting_opportunity || {},
          })
          .select()
          .single();

        if (!insErr && row) {
          results.push(row);
          batchSignals.push({ id: row.id, title: newTitle, tags: newTags });
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      signals_detected: results.length,
      signals: results,
      fragments_analyzed: fragments.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("detect-patterns error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
