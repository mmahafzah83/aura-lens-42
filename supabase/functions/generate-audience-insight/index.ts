import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await userClient.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // 1. Load demographics
    const { data: demoData } = await admin
      .from("audience_demographics")
      .select("category, value, percentage, percentage_numeric")
      .eq("user_id", user.id)
      .order("percentage_numeric", { ascending: false });

    if (!demoData || demoData.length === 0) {
      return new Response(JSON.stringify({ error: "No demographics data found. Upload LinkedIn analytics first." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Cache check via demographics hash
    const demoHash = JSON.stringify(demoData.map((d: any) => `${d.category}:${d.value}:${d.percentage}`)).slice(0, 200);
    const { data: cached } = await admin
      .from("audience_insights")
      .select("*")
      .eq("user_id", user.id)
      .eq("demographics_hash", demoHash)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cached) {
      return new Response(JSON.stringify(cached), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Load profile and signals for context
    const { data: profile } = await admin
      .from("diagnostic_profiles")
      .select("first_name, level, firm, sector_focus, north_star_goal, core_practice")
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: signals } = await admin
      .from("strategic_signals")
      .select("signal_title, confidence, theme_tags")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("priority_score", { ascending: false })
      .limit(3);

    // 4. Build demographic summary
    const demoByCategory: Record<string, Array<{ value: string; pct: string }>> = {};
    for (const row of demoData as any[]) {
      if (!demoByCategory[row.category]) demoByCategory[row.category] = [];
      demoByCategory[row.category].push({ value: row.value, pct: row.percentage });
    }

    const demoSummary = Object.entries(demoByCategory)
      .map(([cat, items]) => `${cat}:\n${items.map(i => `  ${i.value}: ${i.pct}`).join("\n")}`)
      .join("\n\n");

    const profileContext = profile
      ? `The professional is ${profile.first_name}, ${profile.level} at ${profile.firm}. Sector focus: ${profile.sector_focus || "not specified"}. Core practice: ${profile.core_practice || "not specified"}. North star goal: ${profile.north_star_goal || "not specified"}.`
      : "No profile information available.";

    const signalContext = signals && signals.length > 0
      ? `Active strategic signals: ${signals.map((s: any) => s.signal_title).join(", ")}.`
      : "No active strategic signals.";

    // 5. Call AI
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        max_tokens: 800,
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content: `You are a Senior LinkedIn Audience Strategist at a top consulting firm. You analyze WHO follows a professional to give strategic advice on content positioning.

You speak in direct, confident language. No fluff. Every sentence should feel like it came from a board advisor, not a marketing blog. Use the professional's first name.

You must return ONLY valid JSON with this exact structure:
{
  "insight_headline": "One sentence (max 15 words) — the most striking finding about their audience. Start with a number or contrast.",
  "insight_body": "2-3 sentences explaining the strategic implication. What does this audience composition MEAN for their positioning? What opportunity or risk does it reveal? Be specific — reference actual industries, seniority levels, or companies from the data.",
  "audience_strengths": ["Strength 1 (max 10 words)", "Strength 2"],
  "audience_gaps": ["Gap 1 (max 10 words)", "Gap 2"],
  "next_action": "One specific, actionable recommendation (max 20 words). Not generic. Reference a specific audience segment or industry from the data."
}

Rules:
- The headline must start with a number, percentage, or contrast ("Your X but not Y").
- Strengths = what the audience composition proves about their positioning.
- Gaps = what's missing or underrepresented that they should care about.
- The next_action must be a content recommendation, not a profile change.
- Do NOT use the words: leverage, utilize, facilitate, trajectory, thought leader, personal brand, zone of genius.
- Keep language at a senior executive level — direct, specific, commercial.`
          },
          {
            role: "user",
            content: `${profileContext}

${signalContext}

LinkedIn audience demographics:

${demoSummary}

Analyze this audience and provide strategic insight.`
          }
        ]
      })
    });

    if (aiRes.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limits exceeded, please try again later." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (aiRes.status === 402) {
      return new Response(JSON.stringify({ error: "Payment required, please add credits to your Lovable AI workspace." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    const rawContent: string = aiData?.choices?.[0]?.message?.content ?? "";

    let insight: any = null;
    try {
      const cleaned = rawContent.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
      insight = JSON.parse(cleaned);
    } catch {
      const start = rawContent.indexOf("{");
      const end = rawContent.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try { insight = JSON.parse(rawContent.slice(start, end + 1)); } catch { insight = null; }
      }
    }

    if (!insight || !insight.insight_headline) {
      return new Response(JSON.stringify({ error: "Failed to generate insight" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 6. Cache result (keep only latest)
    await admin.from("audience_insights").delete().eq("user_id", user.id);

    const { data: saved } = await admin
      .from("audience_insights")
      .insert({
        user_id: user.id,
        insight_headline: insight.insight_headline,
        insight_body: insight.insight_body,
        audience_strengths: insight.audience_strengths || [],
        audience_gaps: insight.audience_gaps || [],
        next_action: insight.next_action || "",
        demographics_hash: demoHash,
      })
      .select()
      .single();

    return new Response(JSON.stringify(saved), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-audience-insight error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});