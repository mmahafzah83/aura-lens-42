import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    // Get existing signals to avoid duplicates
    const { data: existingSignals } = await adminClient
      .from("strategic_signals")
      .select("signal_title")
      .eq("user_id", user_id)
      .eq("status", "active");

    const existingTitles = (existingSignals || []).map((s: any) => s.signal_title).join(", ");

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
        model: "google/gemini-2.5-flash",
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

    // Insert signals
    const inserted = [];
    for (const signal of signals) {
      // Map fragment indices to actual IDs
      const evidenceIds = (signal.supporting_fragment_indices || [])
        .map((idx: number) => fragments[idx - 1]?.id)
        .filter(Boolean);

      const { data: row, error: insErr } = await adminClient
        .from("strategic_signals")
        .insert({
          user_id,
          signal_title: signal.signal_title,
          explanation: signal.explanation,
          strategic_implications: signal.strategic_implications,
          supporting_evidence_ids: evidenceIds,
          theme_tags: signal.theme_tags || [],
          skill_pillars: signal.skill_pillars || [],
          confidence: signal.confidence || 0.7,
          fragment_count: evidenceIds.length,
          framework_opportunity: signal.framework_opportunity || {},
          content_opportunity: signal.content_opportunity || {},
        })
        .select()
        .single();

      if (!insErr && row) inserted.push(row);
    }

    return new Response(JSON.stringify({
      success: true,
      signals_detected: inserted.length,
      signals: inserted,
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
