const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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

    const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
    if (!PERPLEXITY_API_KEY) {
      return new Response(JSON.stringify({ error: "Perplexity connector not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    // Fetch user's diagnostic profile for context
    const { data: profile } = await supabase
      .from("diagnostic_profiles")
      .select("sector_focus, core_practice, generated_skills, brand_pillars")
      .eq("user_id", user.id)
      .maybeSingle();

    const sector = (profile as any)?.sector_focus || "consulting";
    const practice = (profile as any)?.core_practice || "strategy";
    const skills = ((profile as any)?.generated_skills || []).slice(0, 5).map((s: any) => s.name).join(", ");
    const pillars = ((profile as any)?.brand_pillars || []).join(", ");

    const query = `Latest ${sector} sector trends and strategic insights for ${practice} professionals. Focus areas: ${skills}. Brand themes: ${pillars}. Executive-level whitepapers, research, and market intelligence from the past week.`;

    const response = await fetch("https://api.perplexity.ai/chat/completions", {
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
            content: `You are a Market Intelligence Analyst for an elite executive coaching platform. Return exactly 6 news items as a JSON array.

Each item must have:
- "title": headline (max 80 chars)
- "summary": 2-sentence executive summary
- "source": publication name
- "url": source URL
- "relevance_tag": which brand pillar or skill this relates to
- "content_type": "trend" | "whitepaper" | "insight" | "regulation"
- "post_angle": A 1-sentence suggestion for how to turn this into a LinkedIn thought leadership post

Output valid JSON: { "items": [...] }`,
          },
          { role: "user", content: query },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Perplexity credits exhausted" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      throw new Error(`Perplexity error: ${response.status} ${errText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const citations = data.citations || [];

    // Try to parse JSON from the response
    let items = [];
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        items = parsed.items || [];
      }
    } catch {
      // If JSON parsing fails, return raw content
      items = [{ title: "Market Intelligence Update", summary: content, source: "Perplexity", url: citations[0] || "", relevance_tag: "General", content_type: "insight", post_angle: "" }];
    }

    return new Response(JSON.stringify({ items, citations }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("market-intelligence error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
