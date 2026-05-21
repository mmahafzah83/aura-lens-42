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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
    const authHeader = req.headers.get("Authorization") || "";
    const bearer = authHeader.replace("Bearer ", "");
    const apiKey = req.headers.get("apikey") || req.headers.get("x-api-key") || "";
    const cronHeader = req.headers.get("x-cron-secret") || "";
    const isCron = !!CRON_SECRET && cronHeader === CRON_SECRET;
    const isServiceRole = bearer === SERVICE_KEY || apiKey === SERVICE_KEY;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Resolve target user(s)
    let userIds: string[] = [];
    if (isCron || isServiceRole) {
      const { data: profiles } = await admin
        .from("diagnostic_profiles")
        .select("user_id");
      userIds = (profiles || []).map((p: any) => p.user_id).filter(Boolean);
    } else {
      if (!bearer) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      });
      const { data: userData, error: userErr } = await userClient.auth.getUser(bearer);
      if (userErr || !userData?.user?.id) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userIds = [userData.user.id];
    }

    const results: any[] = [];
    for (const userId of userIds) {
      try {
        const r = await processUser(userId, admin);
        if ((isCron || isServiceRole) && r.alarm) {
          await admin.from("notification_events").insert({
            user_id: userId,
            type: "silence_alarm",
            channel: "inapp",
            title: `Silence alarm · ${r.days_silent} days`,
            body: r.alarm_message,
            metadata: { fading_signals: r.fading_signals, market_movements: r.market_movements },
          });
        }
        results.push({ user_id: userId, ...r });
      } catch (e) {
        results.push({ user_id: userId, error: (e as Error).message });
      }
    }

    // Single-user response keeps original shape for the frontend.
    if (userIds.length === 1 && !isCron && !isServiceRole) {
      return new Response(JSON.stringify(results[0]), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ users: userIds.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[generate-silence-alarm] error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function processUser(userId: string, admin: any) {
    // 1. Days since last entry
    const { data: lastEntry } = await admin
      .from("entries")
      .select("created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const now = Date.now();
    const days_silent = lastEntry?.created_at
      ? Math.floor((now - new Date(lastEntry.created_at).getTime()) / 86400000)
      : 999;

    if (days_silent < 3) {
      return { alarm: false, days_silent };
    }

    // 3. Fading/dormant signals
    const { data: fadingRaw } = await admin
      .from("strategic_signals")
      .select("signal_title, confidence, velocity_status, signal_velocity")
      .eq("user_id", userId)
      .in("velocity_status", ["fading", "dormant"])
      .order("confidence", { ascending: false })
      .limit(3);
    const fading_signals = fadingRaw || [];

    // 4. Recent industry trends (recency, not status=active)
    const cutoff = new Date(now - 14 * 86400000).toISOString();
    const { data: trendsRaw } = await admin
      .from("industry_trends")
      .select("headline, source, insight, final_score, signal_type")
      .neq("status", "dismissed")
      .gt("fetched_at", cutoff)
      .order("final_score", { ascending: false })
      .limit(3);
    const market_movements = (trendsRaw || []).map((t: any) => ({
      headline: t.headline,
      source: t.source,
      final_score: t.final_score,
      signal_type: t.signal_type,
      insight: t.insight,
    }));

    // 5. Sector
    const { data: profile } = await admin
      .from("diagnostic_profiles")
      .select("sector_focus, level")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    // 7. AI message
    let alarm_message = "";
    if (fading_signals.length === 0 && market_movements.length === 0) {
      alarm_message = `Your intelligence capture has paused for ${days_silent} days. Signals decay without fresh evidence.`;
    } else {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) {
        alarm_message = `Your intelligence capture has paused for ${days_silent} days. Signals decay without fresh evidence.`;
      } else {
        const fadingDesc = fading_signals
          .map((s: any) => `"${s.signal_title}" (${Math.round((s.confidence || 0) * 100)}% confidence, ${s.velocity_status})`)
          .join("; ");
        const trendsDesc = market_movements
          .map((t: any) => `"${t.headline}" (${t.source})`)
          .join("; ");
        const userMsg = [
          `Days silent: ${days_silent}`,
          profile?.sector_focus ? `Sector: ${profile.sector_focus}` : null,
          profile?.level ? `Level: ${profile.level}` : null,
          fading_signals.length ? `Fading signals: ${fadingDesc}` : null,
          market_movements.length ? `Recent market movements: ${trendsDesc}` : null,
        ].filter(Boolean).join("\n");

        try {
          const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-3-flash-preview",
              messages: [
                {
                  role: "system",
                  content:
                    "You are Aura's Chief of Staff. Compose a 2-3 sentence urgency briefing for a senior executive. Name specific fading signals by title with confidence percentages. Name specific market sources. Tone: direct, professional, not guilt-tripping.",
                },
                { role: "user", content: userMsg },
              ],
            }),
          });
          if (aiResp.ok) {
            const aiData = await aiResp.json();
            alarm_message = aiData.choices?.[0]?.message?.content?.trim() || "";
          } else {
            console.error("AI gateway error", aiResp.status, await aiResp.text());
          }
        } catch (e) {
          console.error("AI call failed", e);
        }
        if (!alarm_message) {
          alarm_message = `Your intelligence capture has paused for ${days_silent} days. Signals decay without fresh evidence.`;
        }
      }
    }

    return {
      alarm: true,
      days_silent,
      fading_signals: fading_signals.map((s: any) => ({
        title: s.signal_title,
        confidence: s.confidence,
        velocity_status: s.velocity_status,
      })),
      market_movements: market_movements.map((m: any) => ({
        headline: m.headline,
        source: m.source,
        final_score: m.final_score,
      })),
      alarm_message,
    };
}