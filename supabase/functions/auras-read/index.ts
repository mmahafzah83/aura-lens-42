import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are Aura — a strategic advisor, not a summariser.

You have full context on this professional's signals, captures, publishing history, and authority score.

Return exactly 3 action items. No more, no fewer.

Each item must have:
- action_type: one of PUBLISH | CAPTURE | WATCH | IDLE
- title: max 8 words — the specific thing to do or monitor
- reason: max 12 words — the precise why, data-driven
- urgency: one of HIGH | MEDIUM | LOW | MONITOR

Rules:
- PUBLISH only if fragment_count >= 5 AND days_since_last_post > 5
- CAPTURE if total captures this week < 3 OR a signal has low fragment_count
- WATCH for signals or trends that are emerging but not ready
- IDLE for anything that has not moved
- Be direct. Never use the words "consider", "explore", "leverage", "journey"
- If data is insufficient, return urgency: LOW and say exactly what's missing

Return valid JSON only:
{
  "items": [
    { "action_type": "PUBLISH", "title": "...", "reason": "...", "urgency": "HIGH" },
    { "action_type": "CAPTURE", "title": "...", "reason": "...", "urgency": "MEDIUM" },
    { "action_type": "WATCH",   "title": "...", "reason": "...", "urgency": "MONITOR" }
  ]
}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString();

    const [signalsRes, trendsRes, entriesRes, postRes, scoreRes] = await Promise.all([
      supabase.from("strategic_signals")
        .select("signal_title, confidence, fragment_count, status, theme_tags")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("confidence", { ascending: false })
        .limit(3),
      supabase.from("industry_trends")
        .select("headline, impact_level, decision_label")
        .eq("user_id", user.id)
        .eq("status", "new")
        .order("fetched_at", { ascending: false })
        .limit(5),
      supabase.from("entries")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", sevenDaysAgo),
      supabase.from("linkedin_posts")
        .select("published_at, engagement_score")
        .eq("user_id", user.id)
        .order("published_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("authority_scores")
        .select("authority_score, momentum_score")
        .eq("user_id", user.id)
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const lastPost = postRes.data;
    const daysSinceLastPost = lastPost?.published_at
      ? Math.floor((Date.now() - new Date(lastPost.published_at).getTime()) / 86400_000)
      : null;

    const context = {
      top_signals: signalsRes.data || [],
      recent_trends: trendsRes.data || [],
      captures_last_7_days: entriesRes.count ?? 0,
      last_post: lastPost ? {
        published_at: lastPost.published_at,
        engagement_score: lastPost.engagement_score,
        days_since_last_post: daysSinceLastPost,
      } : null,
      authority: scoreRes.data || null,
    };

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Context data:\n${JSON.stringify(context, null, 2)}\n\nReturn the 3-item JSON now.` },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "rate_limit" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "credits" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await aiRes.text();
      console.error("AI gateway error:", aiRes.status, t);
      throw new Error("AI gateway error");
    }

    const aiData = await aiRes.json();
    const content = aiData.choices?.[0]?.message?.content || "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(content); } catch (_e) {
      const m = content.match(/\{[\s\S]*\}/);
      if (m) try { parsed = JSON.parse(m[0]); } catch {}
    }

    const items = Array.isArray(parsed.items) ? parsed.items.slice(0, 3) : [];

    return new Response(JSON.stringify({ items, context_summary: {
      signals: context.top_signals.length,
      trends: context.recent_trends.length,
      captures_7d: context.captures_last_7_days,
      days_since_last_post: daysSinceLastPost,
    }}), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("auras-read error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
