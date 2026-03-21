import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { news_item } = await req.json();
    if (!news_item) {
      return new Response(JSON.stringify({ error: "news_item required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch user profile for brand pillars and voice
    const { data: profile } = await supabase
      .from("diagnostic_profiles")
      .select("firm, level, core_practice, sector_focus, brand_pillars, north_star_goal")
      .eq("user_id", user.id)
      .maybeSingle();

    const p = profile as any || {};
    const brandPillars = (p.brand_pillars || []).join(", ") || "Strategy, Innovation, Leadership";
    const firm = p.firm || "Big 4";
    const level = p.level || "Director";

    // Fetch expert frameworks for context
    const { data: frameworks } = await supabase
      .from("master_frameworks")
      .select("title, summary, framework_steps")
      .eq("user_id", user.id)
      .limit(3);

    const frameworkContext = (frameworks || []).map((f: any) =>
      `Framework: ${f.title}\nSummary: ${f.summary}\nSteps: ${JSON.stringify(f.framework_steps)}`
    ).join("\n\n");

    const systemPrompt = `You are an Elite Executive Brand Strategist for a ${level} at ${firm}.

BRAND PILLAR GUARDRAILS — every post MUST align with at least one of these pillars:
${brandPillars}

SIGNATURE VOICE RULES (Big 3/Big 4 standard):
1. High-Authority Hook: Open with a provocative insight or counterintuitive observation
2. Strategic Whitespace: Use short paragraphs (2-3 lines max), strategic line breaks
3. 70-20-10 Content Mix:
   - 70% Awareness: Industry insights, trends, market perspectives
   - 20% Authority: Original frameworks, case studies, proven methodologies
   - 10% Conversion: Subtle positioning as a thought leader
4. Executive Tone: Confident but not arrogant. Data-informed, not data-heavy.
5. End with a provocative question or call-to-reflection

SELF-AUDIT CHECKLIST (verify before output):
✓ Does this align with at least one Brand Pillar?
✓ Does the hook stop a busy executive from scrolling?
✓ Is the whitespace strategic and mobile-optimized?
✓ Does it position the author as a peer to the C-suite, not a subordinate?
✓ Would a McKinsey Senior Partner share this?

${frameworkContext ? `\nEXPERT FRAMEWORKS TO APPLY:\n${frameworkContext}` : ""}

Output valid JSON:
{
  "post": "The full LinkedIn post text with strategic formatting",
  "brand_pillar_alignment": "Which brand pillar(s) this aligns to",
  "content_mix_category": "awareness" | "authority" | "conversion",
  "hook_type": "counterintuitive" | "data-driven" | "question" | "provocative",
  "audit_passed": true/false,
  "audit_notes": "Brief note on alignment"
}`;

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
          {
            role: "user",
            content: `Transform this market intelligence into a high-authority LinkedIn post:\n\nTitle: ${news_item.title}\nSummary: ${news_item.summary}\nSource: ${news_item.source}\nPost Angle: ${news_item.post_angle || ""}\nRelevance: ${news_item.relevance_tag || ""}`,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiRes.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI error: ${aiRes.status}`);
    }

    const aiData = await aiRes.json();
    const parsed = JSON.parse(aiData.choices?.[0]?.message?.content || "{}");

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-branded-post error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
