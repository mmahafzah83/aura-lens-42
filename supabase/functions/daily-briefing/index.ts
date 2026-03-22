import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PARTNER_BENCHMARK: Record<string, number> = {
  "Strategic Architecture": 95,
  "C-Suite Stewardship": 100,
  "Sector Foresight": 90,
  "Digital Synthesis": 85,
  "Executive Presence": 100,
  "Commercial Velocity": 95,
  "Human-Centric Leadership": 90,
  "Operational Resilience": 80,
  "Geopolitical Fluency": 90,
  "Value-Based P&L": 95,
};

const HIGH_AUTHORITY_SOURCES = [
  "McKinsey Insights", "McKinsey Quarterly", "BCG Henderson Institute",
  "Korn Ferry Institute", "HBR (Harvard Business Review)",
  "MEWA (Ministry of Environment, Water and Agriculture)",
  "NWC (National Water Company)", "Vision 2030 Reports",
  "Gartner Utilities", "Deloitte Insights", "EY Parthenon",
  "PwC Strategy&", "World Economic Forum",
];

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

    const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");

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

    // Fetch profile
    const { data: profile } = await supabase
      .from("diagnostic_profiles")
      .select("generated_skills, skill_ratings, sector_focus, core_practice, years_experience, brand_pillars")
      .eq("user_id", user.id)
      .maybeSingle();

    const skills = (profile as any)?.generated_skills || [];
    const ratings = (profile as any)?.skill_ratings || {};
    const sectorFocus = (profile as any)?.sector_focus || "Consulting";
    const corePractice = (profile as any)?.core_practice || "Strategy";
    const brandPillars = (profile as any)?.brand_pillars || [];

    // Intelligence boosts
    const { data: intelligence } = await supabase
      .from("learned_intelligence" as any)
      .select("skill_pillars, skill_boost_pct")
      .eq("user_id", user.id) as any;

    const boosts: Record<string, number> = {};
    (intelligence || []).forEach((i: any) => {
      (i.skill_pillars || []).forEach((pillar: string) => {
        boosts[pillar] = (boosts[pillar] || 0) + Number(i.skill_boost_pct || 3);
      });
    });

    // Experience bonus
    const yearsExp = (profile as any)?.years_experience || "";
    const totalMatch = yearsExp.match?.(/^(\d+)y total/);
    const totalYears = totalMatch ? parseInt(totalMatch[1]) : 0;
    const expBonus = totalYears > 15;

    // Calculate gaps vs Partner Benchmark
    const skillGaps = skills
      .map((s: any) => {
        let current = Math.min(100, (ratings[s.name] || 10) + (boosts[s.name] || 0));
        if (expBonus && (s.name === "Sector Foresight" || s.name === "Geopolitical Fluency")) {
          current = Math.min(100, current + 10);
        }
        const target = PARTNER_BENCHMARK[s.name] || 90;
        return {
          name: s.name,
          category: s.category,
          current,
          target,
          delta: target - current,
        };
      })
      .filter((g: any) => g.delta > 0)
      .sort((a: any, b: any) => b.delta - a.delta);

    const top2Gaps = skillGaps.slice(0, 2);

    if (top2Gaps.length === 0) {
      return new Response(JSON.stringify({ items: [], gaps: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Try Perplexity for real-time market trend
    let marketTrend: any = null;
    if (PERPLEXITY_API_KEY) {
      try {
        const searchQuery = `Latest ${sectorFocus} industry trends 2026 ${top2Gaps[0].name} consulting leadership`;
        const perplexityRes = await fetch("https://api.perplexity.ai/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "sonar",
            messages: [
              {
                role: "system",
                content: `You are a market intelligence analyst. Return a JSON object with: {"title": "headline", "source": "publisher", "url": "link or null", "summary": "2-sentence summary of the trend"}. Focus on ${sectorFocus} sector from sources like ${HIGH_AUTHORITY_SOURCES.slice(0, 5).join(", ")}.`,
              },
              { role: "user", content: searchQuery },
            ],
            search_recency_filter: "week",
          }),
        });

        if (perplexityRes.ok) {
          const perplexityData = await perplexityRes.json();
          const content = perplexityData.choices?.[0]?.message?.content || "";
          const citations = perplexityData.citations || [];
          try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              marketTrend = JSON.parse(jsonMatch[0]);
              if (citations.length > 0 && !marketTrend.url) {
                marketTrend.url = citations[0];
              }
            }
          } catch {
            marketTrend = {
              title: content.slice(0, 100),
              source: "Market Intelligence",
              url: citations[0] || null,
              summary: content.slice(0, 200),
            };
          }
        }
      } catch (err) {
        console.error("Perplexity search failed:", err);
      }
    }

    // Use AI to generate deep-dive + influence opportunity
    const gapNames = top2Gaps.map((g: any) => `${g.name} (gap: ${g.delta}%)`).join(", ");
    const brandContext = brandPillars.length > 0 ? `Brand Pillars: ${brandPillars.join(", ")}` : "";

    const systemPrompt = `You are an elite executive intelligence advisor for a ${sectorFocus} consulting Director in Saudi Arabia.

AUTHORIZED SOURCES ONLY: MEWA, SWA (Saudi Water Authority), PIF, NWC (National Water Company), EY, and their official publications.
If sector is Finance/Banking, also include: SAMA, Ministry of Finance, MISA, PIF.

CONTEXTUAL FILTER: Prioritize items that map directly to these skill gaps: ${gapNames}.
Focus on Saudi ${sectorFocus} sector signals from 2026.

Generate exactly 2 briefing items as JSON:
{
  "items": [
    {
      "type": "deep_dive",
      "title": "Specific report/article title from authorized sources",
      "source": "Publisher (MUST be from: ${HIGH_AUTHORITY_SOURCES.slice(0, 8).join(", ")})",
      "url": "Real URL or null",
      "skill_target": "Which skill gap this closes",
      "bluf": "[SIGNAL]: One sentence on the core market shift/disruption | [ACTION]: Immediate Director-level strategic advisory move | [VALUE]: Specific impact on Client P&L or Authority Index",
      "estimated_minutes": 15
    },
    {
      "type": "influence",
      "title": "LinkedIn post topic/hook for authority positioning",
      "source": "Influence Pipeline",
      "url": null,
      "skill_target": "Which skill gap this demonstrates",
      "bluf": "[SIGNAL]: Market signal triggering this post | [ACTION]: Publish this to demonstrate authority | [VALUE]: Expected boost to thought leadership and client engagement",
      "prompt": "A 2-line LinkedIn post draft starter the user can refine"
    }
  ]
}

BLUF FORMAT IS MANDATORY: Every bluf field MUST use the 3-part pipe-separated format:
[SIGNAL]: ... | [ACTION]: ... | [VALUE]: ...

Focus on real, verifiable resources from authorized sources only.`;

    const userPrompt = `Sector: ${sectorFocus}
Practice: ${corePractice}
${brandContext}
Top skill gaps: ${gapNames}

Generate a deep-dive recommendation and an influence opportunity for today's briefing.`;

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
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      throw new Error(`AI error: ${aiRes.status} ${errText}`);
    }

    const aiData = await aiRes.json();
    const parsed = JSON.parse(aiData.choices?.[0]?.message?.content || "{}");
    const aiItems = parsed.items || [];

    // Combine: deep-dive + market trend + influence
    const briefingItems: any[] = [];

    // 1. Deep-dive
    const deepDive = aiItems.find((i: any) => i.type === "deep_dive");
    if (deepDive) {
      briefingItems.push({
        ...deepDive,
        icon: "📄",
      });
    }

    // 2. Market trend (from Perplexity or AI fallback)
    if (marketTrend) {
      briefingItems.push({
        type: "market_trend",
        title: marketTrend.title,
        source: marketTrend.source || "Market Intelligence",
        url: marketTrend.url,
        skill_target: top2Gaps[0]?.name || "Sector Foresight",
        bluf: `Director's BLUF: ${marketTrend.summary}`,
        icon: "📈",
      });
    } else {
      // Fallback: generate a market trend from AI
      briefingItems.push({
        type: "market_trend",
        title: `${sectorFocus} Sector: Key Developments This Week`,
        source: "Aura Market Intelligence",
        url: null,
        skill_target: top2Gaps[0]?.name || "Sector Foresight",
        bluf: `Director's BLUF: Stay current on ${sectorFocus} shifts to maintain your sector authority and close your ${top2Gaps[0]?.name} gap.`,
        icon: "📈",
      });
    }

    // 3. Influence opportunity
    const influence = aiItems.find((i: any) => i.type === "influence");
    if (influence) {
      briefingItems.push({
        ...influence,
        icon: "💡",
      });
    }

    return new Response(JSON.stringify({
      items: briefingItems,
      gaps: top2Gaps,
      sector: sectorFocus,
      generated_at: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("daily-briefing error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
