import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth
      .getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

    // 1. User's active signals
    const { data: signals, error: signalsErr } = await supabase
      .from("strategic_signals")
      .select("signal_title, theme_tags, confidence, velocity_status")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("confidence", { ascending: false });

    if (signalsErr) throw signalsErr;

    // 2. Recent industry trends (recency, not status=active)
    const thirtyDaysAgo = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { data: trends, error: trendsErr } = await supabase
      .from("industry_trends")
      .select("headline, insight, source, signal_type, final_score")
      .neq("status", "dismissed")
      .gte("fetched_at", thirtyDaysAgo)
      .order("final_score", { ascending: false })
      .limit(20);

    if (trendsErr) throw trendsErr;

    if (!trends || trends.length === 0) {
      return new Response(
        JSON.stringify({
          coverage_score: 1,
          items: [],
          narrative:
            "No recent industry trends to analyze in the last 30 days.",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt =
      "You are a market intelligence analyst. Given a professional's signal portfolio and recent industry trends, classify each trend. Categories: 'covered' (user has signal with confidence > 0.6 in this territory), 'weak' (user has related signal but confidence < 0.4), 'gap' (no matching signal), 'opportunity' (gap + trend final_score >= 7 — hot topic completely missed). Return JSON via the provided tool. Narrative must be 2-3 sentences naming SPECIFIC signals and trends by name.";

    const userPrompt = JSON.stringify({
      user_signals: signals ?? [],
      industry_trends: trends,
    });

    const aiResp = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
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
          tools: [
            {
              type: "function",
              function: {
                name: "report_market_gaps",
                description:
                  "Return market gap analysis comparing user signals to industry trends.",
                parameters: {
                  type: "object",
                  properties: {
                    coverage_score: {
                      type: "number",
                      description:
                        "0-1 score for how well user's signals cover the current market conversation.",
                    },
                    items: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          trend_headline: { type: "string" },
                          category: {
                            type: "string",
                            enum: [
                              "covered",
                              "weak",
                              "gap",
                              "opportunity",
                            ],
                          },
                          matching_signal: { type: ["string", "null"] },
                          signal_confidence: { type: ["number", "null"] },
                          recommendation: { type: "string" },
                        },
                        required: [
                          "trend_headline",
                          "category",
                          "recommendation",
                        ],
                        additionalProperties: false,
                      },
                    },
                    narrative: { type: "string" },
                  },
                  required: ["coverage_score", "items", "narrative"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "report_market_gaps" },
          },
        }),
      },
    );

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(
          JSON.stringify({
            error: "Rate limits exceeded, please try again later.",
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      if (aiResp.status === 402) {
        return new Response(
          JSON.stringify({
            error:
              "Payment required, please add credits to your Lovable AI workspace.",
          }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      const t = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, t);
      throw new Error(`AI gateway error: ${aiResp.status}`);
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      throw new Error("AI did not return structured market gap analysis");
    }

    const result = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("detect-market-gaps error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});