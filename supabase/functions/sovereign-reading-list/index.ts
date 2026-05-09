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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch user's diagnostic profile for skill context
    const { data: profile } = await supabase
      .from("diagnostic_profiles")
      .select("generated_skills, skill_ratings, sector_focus")
      .eq("user_id", user.id)
      .maybeSingle();

    const skills = (profile as any)?.generated_skills || [];
    const ratings = (profile as any)?.skill_ratings || {};

    // Fetch learned intelligence to calculate boosts
    const { data: intelligence } = await supabase
      .from("learned_intelligence" as any)
      .select("skill_pillars, skill_boost_pct")
      .eq("user_id", user.id) as any;

    // Calculate boost per skill
    const boosts: Record<string, number> = {};
    (intelligence || []).forEach((i: any) => {
      (i.skill_pillars || []).forEach((pillar: string) => {
        boosts[pillar] = (boosts[pillar] || 0) + Number(i.skill_boost_pct || 3);
      });
    });

    // Find skill gaps (lowest rated skills)
    const skillGaps = skills
      .map((s: any) => ({
        name: s.name,
        category: s.category,
        currentRating: Math.min(100, (ratings[s.name] || 50) + (boosts[s.name] || 0)),
        gap: 100 - Math.min(100, (ratings[s.name] || 50) + (boosts[s.name] || 0)),
        description: s.description,
      }))
      .sort((a: any, b: any) => b.gap - a.gap)
      .slice(0, 3);

    if (skillGaps.length === 0) {
      return new Response(JSON.stringify({ recommendations: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Discover REAL articles via Exa semantic search to ground recommendations
    const sectorFocus = (profile as any)?.sector_focus || "";
    const EXA_KEY = Deno.env.get("EXA_API_KEY");
    let discoveredArticles = "";
    if (EXA_KEY) {
      try {
        const gapTopics = skillGaps.map((g: any) => g.name).join(", ");
        const query = `${gapTopics}${sectorFocus ? ` in ${sectorFocus}` : ""} executive analysis thought leadership`;
        const exaRes = await fetch("https://api.exa.ai/search", {
          method: "POST",
          headers: {
            "x-api-key": EXA_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query,
            num_results: 10,
            use_autoprompt: true,
            start_published_date: new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0],
            type: "auto",
          }),
        });
        if (exaRes.ok) {
          const exaData = await exaRes.json();
          const results = (exaData.results || []).map((r: any) =>
            `- "${r.title}" (${r.url}) — ${r.published_date || "recent"}`
          ).join("\n");
          if (results) {
            discoveredArticles = `\n\nREAL ARTICLES DISCOVERED (recommend FROM THESE — they are semantically relevant to the user's skill gaps. Include the URL so the user can read them. Explain WHY each fills a specific gap):\n${results}`;
          }
        } else {
          console.warn("[sovereign-reading-list] Exa non-OK:", exaRes.status);
        }
      } catch (e) {
        console.warn("[sovereign-reading-list] Exa search failed:", (e as Error).message);
      }
    }

    const systemPrompt = `You are a Sovereign Learning Advisor for an elite executive coaching platform. You recommend precise, high-authority reading material.

Given the user's top skill gaps, recommend exactly 3 resources — a mix of:
- Published whitepapers or reports (McKinsey Quarterly, HBR, BCG Henderson Institute, Korn Ferry Institute)
- Seminal books or book chapters
- Online frameworks or toolkits from tier-1 consulting firms

Each recommendation must:
1. Directly address one of the skill gaps
2. Be a REAL, verifiable resource (real title, real author/publisher)
3. Include a 1-sentence "Intelligence Value" explaining what the user will extract

When real discovered articles are provided below, recommend FROM THOSE ARTICLES. Include the URL so the user can read them. Explain WHY each article fills a specific gap in their skill coverage.

Output valid JSON:
{
  "recommendations": [
    {
      "title": "Real resource title",
      "author": "Real author or publisher",
      "type": "whitepaper" | "book" | "article" | "toolkit",
      "url": "URL if available, or null",
      "skill_gap": "Name of the skill gap this addresses",
      "intelligence_value": "One sentence on what they'll learn",
      "estimated_read_minutes": 15
    }
  ]
}`;

    const userPrompt = `Generate 3 reading recommendations for these skill gaps:\n\n${skillGaps.map((g: any, i: number) => `${i + 1}. ${g.name} (current: ${g.currentRating}%, gap: ${g.gap}%) — ${g.description}`).join("\n")}`;

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: systemPrompt + discoveredArticles + "\n\nReturn ONLY a valid JSON object. No markdown fences, no preamble.",
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      throw new Error(`AI error: ${aiRes.status} ${errText}`);
    }

    const aiData = await aiRes.json();
    const aiText = (aiData.content || []).map((c: any) => c.text || "").join("") || "{}";
    const cleaned = aiText.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned || "{}");

    return new Response(JSON.stringify({
      skill_gaps: skillGaps,
      recommendations: parsed.recommendations || [],
      boosts,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("sovereign-reading-list error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
