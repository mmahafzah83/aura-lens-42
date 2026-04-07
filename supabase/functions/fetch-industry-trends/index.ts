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
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    const adminClient = createClient(supabaseUrl, serviceKey);

    // Step 1: Read diagnostic profile
    const { data: profile } = await adminClient
      .from("diagnostic_profiles")
      .select("firm, level, core_practice, sector_focus, north_star_goal, leadership_style")
      .eq("user_id", userId)
      .single();

    if (!profile) {
      return new Response(JSON.stringify({ error: "No profile found", inserted: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 2: Build search queries from profile fields
    const year = new Date().getFullYear();
    const parts = [
      profile.sector_focus,
      profile.core_practice,
      profile.firm,
      profile.level,
      profile.north_star_goal,
      profile.leadership_style,
    ].filter(Boolean);

    const queries = [
      `${profile.sector_focus || ""} ${profile.core_practice || ""} digital transformation ${year}`.trim(),
      `${profile.north_star_goal || ""} ${profile.sector_focus || ""} consulting ${year}`.trim(),
      `${profile.level || ""} ${profile.core_practice || ""} ${profile.sector_focus || ""} trends`.trim(),
      `${profile.sector_focus || ""} AI transformation consulting ${year}`.trim(),
    ].filter(q => q.length > 10);

    if (queries.length === 0) {
      return new Response(JSON.stringify({ error: "Insufficient profile data", inserted: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 3: Call AI gateway
    const searchPrompt = queries.map((q, i) => `Search query ${i + 1}: "${q}"`).join("\n");
    const profileContext = parts.join(", ");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a strategic intelligence filter. The user is a professional with this profile: ${profileContext}. You will receive search queries representing their interests. Search the web for recent, relevant results for each query.`,
          },
          {
            role: "user",
            content: `Search the web for the following queries and return only genuinely relevant industry news and trends:\n\n${searchPrompt}\n\nFor each relevant result return exactly this JSON structure:\n{ "headline": "max 10 words, plain language", "insight": "max 20 words, why it matters to this user specifically", "source": "domain name only", "url": "full URL", "published_at": "ISO date if available, null otherwise" }\n\nReturn a JSON array of maximum 5 items total. Exclude general news with no strategic relevance. Return ONLY the JSON array, no markdown wrapping.`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_trends",
              description: "Return filtered industry trends as structured data",
              parameters: {
                type: "object",
                properties: {
                  trends: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        headline: { type: "string" },
                        insight: { type: "string" },
                        source: { type: "string" },
                        url: { type: "string" },
                        published_at: { type: "string", nullable: true },
                      },
                      required: ["headline", "insight", "source", "url"],
                    },
                  },
                },
                required: ["trends"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_trends" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      return new Response(JSON.stringify({ error: "AI gateway error", inserted: 0 }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    let trends: any[] = [];

    // Parse from tool call response
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        trends = parsed.trends || [];
      } catch {
        console.error("Failed to parse tool call arguments");
      }
    }

    // Fallback: try parsing content directly
    if (trends.length === 0) {
      const content = aiData.choices?.[0]?.message?.content;
      if (content) {
        try {
          const cleaned = content.replace(/```json\n?/g, "").replace(/```/g, "").trim();
          trends = JSON.parse(cleaned);
          if (!Array.isArray(trends)) trends = [];
        } catch {
          console.error("Failed to parse content as JSON");
        }
      }
    }

    // Step 4: Get existing "new" trends for cleanup
    const { data: existingRows } = await adminClient
      .from("industry_trends")
      .select("id, url")
      .eq("user_id", userId)
      .eq("status", "new");

    const existingTrends = (existingRows || []) as { id: string; url: string }[];
    const existingUrls = new Set(existingTrends.map(r => r.url));

    // Build set of fresh URLs from AI
    const freshUrls = new Set(trends.map((t: any) => t.url).filter(Boolean));

    // Step 5: Expire old trends whose URLs are NOT in the fresh batch
    const toExpire = existingTrends
      .filter(r => !freshUrls.has(r.url))
      .map(r => r.id);

    if (toExpire.length > 0) {
      await adminClient
        .from("industry_trends")
        .update({ status: "expired" })
        .in("id", toExpire);
    }

    // Step 6: Insert only genuinely new URLs
    const newTrends = trends
      .filter((t: any) => t.url && !existingUrls.has(t.url))
      .slice(0, 5)
      .map((t: any) => ({
        user_id: userId,
        headline: (t.headline || "").slice(0, 200),
        insight: (t.insight || "").slice(0, 500),
        source: (t.source || "").slice(0, 100),
        url: t.url,
        published_at: t.published_at || null,
        status: "new",
      }));

    if (newTrends.length > 0) {
      const { error: insertErr } = await adminClient
        .from("industry_trends")
        .insert(newTrends);

      if (insertErr) {
        console.error("Insert error:", insertErr);
      }
    }

    // Step 7: Cap active trends at 5 — expire oldest beyond 5
    const { data: activeAfter } = await adminClient
      .from("industry_trends")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "new")
      .order("fetched_at", { ascending: false });

    const activeIds = (activeAfter || []) as { id: string }[];
    if (activeIds.length > 5) {
      const idsToExpire = activeIds.slice(5).map(r => r.id);
      await adminClient
        .from("industry_trends")
        .update({ status: "expired" })
        .in("id", idsToExpire);
    }

    return new Response(JSON.stringify({
      inserted: newTrends.length,
      expired: toExpire.length,
      total_active: Math.min(activeIds.length, 5),
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("fetch-industry-trends error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error", inserted: 0 }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
