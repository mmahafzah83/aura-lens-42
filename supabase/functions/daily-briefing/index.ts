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
  "MEWA (Ministry of Environment, Water and Agriculture)",
  "SWA (Saudi Water Authority)",
  "NWC (National Water Company)",
  "EY",
  "McKinsey",
  "PIF (Public Investment Fund)",
  "Deloitte Insights",
  "PwC Strategy&",
  "BCG Henderson Institute",
  "Korn Ferry Institute",
  "HBR (Harvard Business Review)",
  "Vision 2030 Reports",
  "Gartner Utilities",
  "World Economic Forum",
  "SAMA",
  "Ministry of Finance",
  "MISA",
];

/** Validate a URL is a deep article link, not a homepage or 404 */
async function validateLink(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    // Reject top-level domains (homepages)
    const parsed = new URL(url);
    const pathSegments = parsed.pathname.split("/").filter(Boolean);
    if (pathSegments.length < 1) return null; // homepage only

    // Health check — HEAD request
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    if (!res.ok) return null;

    // Check final URL isn't a homepage redirect
    const finalUrl = res.url || url;
    const finalParsed = new URL(finalUrl);
    const finalSegments = finalParsed.pathname.split("/").filter(Boolean);
    if (finalSegments.length < 1) return null;

    return finalUrl;
  } catch {
    return null;
  }
}

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

    // Calculate gaps vs Partner Benchmark — sorted by largest gap first (gap-prioritized)
    const skillGaps = skills
      .map((s: any) => {
        let current = Math.min(100, (ratings[s.name] || 10) + (boosts[s.name] || 0));
        if (expBonus && (s.name === "Sector Foresight" || s.name === "Geopolitical Fluency")) {
          current = Math.min(100, current + 10);
        }
        const target = PARTNER_BENCHMARK[s.name] || 90;
        return { name: s.name, category: s.category, current, target, delta: target - current };
      })
      .filter((g: any) => g.delta > 0)
      .sort((a: any, b: any) => b.delta - a.delta);

    const top3Gaps = skillGaps.slice(0, 3);

    if (top3Gaps.length === 0) {
      return new Response(JSON.stringify({ items: [], gaps: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check read history to avoid duplication
    const { data: readHistory } = await supabase
      .from("learned_intelligence" as any)
      .select("title")
      .eq("user_id", user.id)
      .like("title", "Read:%")
      .order("created_at", { ascending: false })
      .limit(50) as any;

    const readTitles = new Set((readHistory || []).map((r: any) => r.title?.replace("Read: ", "") || ""));

    // Try Perplexity for real-time market signals
    let marketTrend: any = null;
    if (PERPLEXITY_API_KEY) {
      try {
        const searchQuery = `Latest ${sectorFocus} industry trends 2026 ${top3Gaps[0].name} ${top3Gaps[1]?.name || ""} consulting leadership Saudi Arabia`;
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
                content: `You are a market intelligence analyst. Return a JSON object with: {"title": "headline", "source": "publisher", "url": "direct article URL (not a homepage)", "summary": "2-sentence summary"}. Focus on ${sectorFocus} sector from sources like ${HIGH_AUTHORITY_SOURCES.slice(0, 8).join(", ")}. CRITICAL: The URL must be a direct link to a specific article page, NOT a homepage or category page. Only include content from 2026.`,
              },
              { role: "user", content: searchQuery },
            ],
            search_recency_filter: "month",
            search_after_date_filter: "01/01/2026",
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

    // Use AI to generate gap-prioritized briefing items
    const gapNames = top3Gaps.map((g: any) => `${g.name} (gap: ${g.delta}%)`).join(", ");
    const brandContext = brandPillars.length > 0 ? `Brand Pillars: ${brandPillars.join(", ")}` : "";
    const readHistoryContext = readTitles.size > 0 ? `\n\nALREADY READ (do NOT repeat these):\n${Array.from(readTitles).slice(0, 20).join("\n")}` : "";

    const systemPrompt = `You are an elite executive intelligence advisor for a ${sectorFocus} consulting Director in Saudi Arabia.

AUTHORIZED SOURCES ONLY: MEWA, SWA (Saudi Water Authority), PIF, NWC (National Water Company), EY, McKinsey.
If sector is Finance/Banking, also include: SAMA, Ministry of Finance, MISA, PIF.

GAP-PRIORITIZED SCANNING: You MUST prioritize the user's lowest-scoring skills first.
Current skill gaps (ordered by severity): ${gapNames}
Every item MUST map to one of these specific gaps.

RECENCY GUARDRAIL: STRICTLY reject any content dated before January 1, 2026. Only include 2026 content.

CONTEXTUAL FILTER: Focus on Saudi ${sectorFocus} sector signals from 2026.
${readHistoryContext}

Generate exactly 3 briefing items as JSON:
{
  "items": [
    {
      "type": "deep_dive",
      "title": "Specific report/article title from authorized sources",
      "source": "Publisher (MUST be from authorized list)",
      "url": "Direct article URL or null (NEVER a homepage)",
      "skill_target": "Exact skill gap name this closes",
      "bluf": "[SIGNAL]: One sentence on the core market shift/disruption | [ACTION]: Immediate Director-level strategic advisory move | [VALUE]: Specific impact on Client P&L or Authority Index",
      "estimated_minutes": 15,
      "gap_alignment": "Closes: <skill name>"
    },
    {
      "type": "market_trend",
      "title": "Specific market trend headline",
      "source": "Publisher",
      "url": "Direct article URL or null",
      "skill_target": "Exact skill gap name",
      "bluf": "[SIGNAL]: ... | [ACTION]: ... | [VALUE]: ...",
      "gap_alignment": "Closes: <skill name>"
    },
    {
      "type": "influence",
      "title": "LinkedIn post topic/hook for authority positioning",
      "source": "Influence Pipeline",
      "url": null,
      "skill_target": "Exact skill gap name this demonstrates",
      "bluf": "[SIGNAL]: Market signal triggering this post | [ACTION]: Publish this to demonstrate authority | [VALUE]: Expected boost to thought leadership",
      "prompt": "A 2-line LinkedIn post draft starter",
      "gap_alignment": "Closes: <skill name>"
    }
  ]
}

BLUF FORMAT IS MANDATORY: Every bluf field MUST use the 3-part pipe-separated format:
[SIGNAL]: ... | [ACTION]: ... | [VALUE]: ...

S-A-V FRAMEWORK: Every generated briefing MUST strictly use [SIGNAL], [ACTION], [VALUE] structure. No exceptions.

Focus on real, verifiable resources from authorized sources only. URLs must be direct article links, not homepages.`;

    const userPrompt = `Sector: ${sectorFocus}
Practice: ${corePractice}
${brandContext}
Top skill gaps (ordered by severity): ${gapNames}

Generate 3 gap-prioritized briefing items for today's intelligence scan. Each item must directly address one of the skill gaps listed above.`;

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

    // Build final briefing with link validation
    const briefingItems: any[] = [];

    for (const item of aiItems) {
      // Validate links — discard if 404 or homepage
      const validatedUrl = await validateLink(item.url);

      // Skip items that were already read
      if (readTitles.has(item.title)) continue;

      briefingItems.push({
        ...item,
        url: validatedUrl,
        icon: item.type === "deep_dive" ? "📄" : item.type === "market_trend" ? "📈" : "💡",
        gap_alignment: item.gap_alignment || `Closes: ${item.skill_target}`,
      });
    }

    // Insert market trend from Perplexity if available and not already covered
    if (marketTrend && !briefingItems.some(b => b.type === "market_trend")) {
      const validatedTrendUrl = await validateLink(marketTrend.url);
      briefingItems.splice(1, 0, {
        type: "market_trend",
        title: marketTrend.title,
        source: marketTrend.source || "Market Intelligence",
        url: validatedTrendUrl,
        skill_target: top3Gaps[0]?.name || "Sector Foresight",
        bluf: `[SIGNAL]: ${marketTrend.summary} | [ACTION]: Review and assess strategic implications | [VALUE]: Enhanced sector authority and client advisory positioning`,
        icon: "📈",
        gap_alignment: `Closes: ${top3Gaps[0]?.name || "Sector Foresight"}`,
      });
    }

    return new Response(JSON.stringify({
      items: briefingItems.slice(0, 3),
      gaps: top3Gaps,
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
