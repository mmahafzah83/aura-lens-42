import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are Aura — a direct strategic advisor. You have one job: tell this professional exactly what to do right now, in order of urgency. Not what is happening. What to DO.

You will receive:
- Their signals (title, confidence, fragment_count)
- Recent industry trends (headline, impact_level, decision_label)
- Captures this week (count)
- Days since last LinkedIn post
- Authority score direction (rising/declining)

RULES — follow exactly:
1. Return 2 or 3 items. NEVER return a LOW urgency item. If only 2 items are HIGH or MEDIUM, return 2.
2. ALWAYS include a PUBLISH item if days_since_last_post >= 5. Pick the signal with the highest fragment_count as the publish topic.
3. NEVER contradict the briefing above. If the briefing says "publishing window open", one item must be PUBLISH.
4. Reasons must be specific and action-oriented — name the actual signal or trend. NEVER say "existing content not ready" or "more input needed" — those are not actions.
5. action_type must be one of: PUBLISH | CAPTURE | WATCH
6. urgency must be HIGH or MEDIUM only. Never LOW or MONITOR.

GOOD reason examples:
- "Your Digital Transformation signal has 9 fragments — strongest it's been. Publish today."
- "Add the Accenture AI adoption report — it directly fills the gap in your top signal."
- "EU water regulation signal confirmed by 3 new trends this week. One more capture locks it."

BAD reason examples (never use these):
- "Existing content not ready for publication yet."
- "Multiple high-impact trends require more input."
- "This is an emerging trend."
- "Competitor insight is critical."

Return valid JSON only:
{
  "items": [
    {
      "action_type": "PUBLISH",
      "title": "max 8 words — the specific thing to do",
      "reason": "max 15 words — specific, names the signal or trend, action-oriented",
      "urgency": "HIGH",
      "destination": "/publish"
    }
  ]
}

destination must be:
- PUBLISH → "/publish"
- CAPTURE → "capture_modal"
- WATCH → "/intelligence"`;

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
