import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};


const EMPTY_RESPONSE = {
  recommendations: [],
  source: "unavailable",
  message: "Reading intelligence is refreshing. Check back shortly.",
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
      .select("generated_skills, skill_ratings, sector_focus, audit_results")
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

    // Fallback: derive skill gaps from audit_results if generated_skills is empty
    if (skillGaps.length === 0 && (profile as any)?.audit_results) {
      const auditScores = (profile as any).audit_results;
      if (typeof auditScores === "object" && Object.keys(auditScores).length > 0) {
        const sorted = Object.entries(auditScores)
          .map(([name, score]) => ({ name, currentRating: Number(score), gap: 100 - Number(score) }))
          .sort((a, b) => b.gap - a.gap);

        const top3 = sorted.slice(0, 3);
        top3.forEach((item) => {
          skillGaps.push({
            name: item.name,
            currentRating: item.currentRating,
            gap: item.gap,
            description: `Score: ${item.currentRating}/100 — this is a growth area that would strengthen market positioning.`,
          });
        });
      }
    }

    if (skillGaps.length === 0) {
      return new Response(JSON.stringify({ recommendations: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const PERPLEXITY_KEY = Deno.env.get("PERPLEXITY_API_KEY");
    // Perplexity is REQUIRED — we will not fall back to pure Claude hallucination.
    if (!PERPLEXITY_KEY) {
      console.warn("[sovereign-reading-list] PERPLEXITY_API_KEY missing — returning empty");
      return new Response(JSON.stringify(EMPTY_RESPONSE), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let perplexityContent = "";
    let perplexityCitations: string[] = [];
    try {
      const sectorFocus = (profile as any)?.sector_focus || "consulting";
      const gapNames = skillGaps.map((g: any) => g.name).join(", ");
      const perpRes = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PERPLEXITY_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "sonar",
          messages: [{
            role: "user",
            content: `Find 5 recent executive-level articles, whitepapers, or reports about ${gapNames} in the ${sectorFocus} sector. For each, provide the exact title, author/publisher, URL, and a one-sentence summary. Focus on sources like McKinsey, HBR, BCG, Deloitte, EY, Gartner, and industry-specific publications. Only include 2025-2026 content.`,
          }],
          search_recency_filter: "month",
        }),
      });
      if (perpRes.ok) {
        const perpData = await perpRes.json();
        perplexityContent = perpData?.choices?.[0]?.message?.content || "";
        perplexityCitations = (perpData?.citations || [])
          .filter((u: unknown): u is string => typeof u === "string" && u.startsWith("http"));
      }
    } catch (e) {
      console.warn("[sovereign-reading-list] Perplexity search failed:", (e as Error).message);
    }

    if (perplexityCitations.length === 0) {
      return new Response(JSON.stringify(EMPTY_RESPONSE), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const discoveredArticles = `\n\nCRITICAL URL RULE: You may ONLY use URLs from the VERIFIED URLS list below. Do NOT invent, modify, append paths to, or construct any URL yourself. If no verified URL matches a recommendation, set the url field to null.\n\nVERIFIED URLS:\n${perplexityCitations.map((u, i) => `${i + 1}. ${u}`).join("\n")}\n\nPERPLEXITY SUMMARIES (use to choose which verified URL fits each recommendation):\n${perplexityContent}`;

    const systemPrompt = `You are a Sovereign Learning Advisor for an elite executive coaching platform. You recommend precise, high-impact reading material.

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
        model: "claude-sonnet-4-5-20250929",
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

    // Validate every URL: must be exact-match against Perplexity citations AND reachable.
    const recommendations: any[] = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];
    for (const rec of recommendations) {
      // Check 1: exact match against Perplexity citations
      if (rec.url && !perplexityCitations.includes(rec.url)) {
        rec.url = null;
      }
      // Check 2: HEAD-validate surviving URLs
      if (rec.url) {
        const ok = await validateLink(rec.url).catch(() => false);
        if (!ok) rec.url = null;
      }
      // Check 3: fallback — try to find a citation whose URL contains keywords from the title
      if (!rec.url && typeof rec.title === "string" && rec.title.trim()) {
        const titleWords = rec.title.toLowerCase().split(/\s+/).filter((w: string) => w.length > 4).slice(0, 3);
        if (titleWords.length >= 2) {
          const matched = perplexityCitations.find((citUrl) => {
            const lower = citUrl.toLowerCase();
            return titleWords.filter((w: string) => lower.includes(w)).length >= 2;
          });
          if (matched) {
            const ok = await validateLink(matched).catch(() => false);
            if (ok) rec.url = matched;
          }
        }
      }
    }

    return new Response(JSON.stringify({
      skill_gaps: skillGaps,
      recommendations,
      source: "perplexity+claude",
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
