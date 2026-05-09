import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Fetch profile for skill gaps
    const { data: profile } = await supabase
      .from("diagnostic_profiles")
      .select("*")
      .eq("user_id", user.id)
      .eq("completed", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!profile) {
      return new Response(JSON.stringify({ nudge: null, reason: "No diagnostic profile" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if last_active_at was >48h ago
    const lastActive = profile.last_active_at ? new Date(profile.last_active_at) : new Date(profile.created_at);
    const hoursSinceActive = (Date.now() - lastActive.getTime()) / (1000 * 60 * 60);

    if (hoursSinceActive < 48) {
      // Update last_active_at and return no nudge
      await adminClient
        .from("diagnostic_profiles")
        .update({ last_active_at: new Date().toISOString() })
        .eq("id", profile.id);

      return new Response(JSON.stringify({ nudge: null, reason: "Active within 48h" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Calculate top 2 skill gaps
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

    const ratings = (profile.skill_ratings || {}) as Record<string, number>;
    const gaps = Object.entries(PARTNER_BENCHMARK)
      .map(([skill, target]) => ({
        skill,
        gap: target - (ratings[skill] || 10),
        current: ratings[skill] || 10,
        target,
      }))
      .filter(g => g.gap > 0)
      .sort((a, b) => b.gap - a.gap);

    const topGaps = gaps.slice(0, 2);
    const sector = profile.sector_focus || "utilities and infrastructure";

    // Generate nudge with AI
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
            content: `You are Aura, an Executive Chief of Staff. Generate a brief, urgent strategic nudge for a Director who has been inactive for ${Math.round(hoursSinceActive)} hours. 

Their biggest skill gaps: ${topGaps.map(g => `${g.skill} (${g.current}% vs ${g.target}% target)`).join(", ")}.
Their sector: ${sector}.

Rules:
- Address them as "Director"
- Reference a plausible market shift in their sector
- Connect it to their specific skill gap
- Keep it to 2-3 sentences max
- Use terms like "macro-driver," "strategic pivot," "value realization"
- Sound like a peer delivering urgent intelligence, NOT a reminder bot
- Do NOT use exclamation marks
- Output ONLY the nudge text, nothing else`,
          },
          {
            role: "user",
            content: "Generate the strategic nudge notification.",
          },
        ],
      }),
    });

    if (!aiRes.ok) {
      console.error("AI nudge error:", aiRes.status);
      // Fallback static nudge
      const fallbackGap = topGaps[0]?.skill || "Sector Foresight";
      const nudgeTitle = "Strategic Nudge";
      const nudgeBody = `Director, a ${Math.round(hoursSinceActive)}-hour gap in your operating rhythm risks missing macro-drivers in ${sector}. Your ${fallbackGap} score remains ${topGaps[0]?.gap || 20}% below Partner standard — this window is closing.`;

      await adminClient.from("notifications").insert({
        user_id: user.id,
        title: nudgeTitle,
        body: nudgeBody,
        type: "nudge",
        metadata: { skill_gaps: topGaps, hours_inactive: Math.round(hoursSinceActive) },
      });

      // Update last_active_at
      await adminClient.from("diagnostic_profiles").update({ last_active_at: new Date().toISOString() }).eq("id", profile.id);

      return new Response(JSON.stringify({ nudge: { title: nudgeTitle, body: nudgeBody } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    const nudgeBody = aiData.choices?.[0]?.message?.content?.trim() ||
      `Director, your ${topGaps[0]?.skill || "strategic radar"} requires attention. A ${Math.round(hoursSinceActive)}-hour gap creates blind spots.`;

    const nudgeTitle = "Strategic Nudge from Aura";

    // Insert notification
    await adminClient.from("notifications").insert({
      user_id: user.id,
      title: nudgeTitle,
      body: nudgeBody,
      type: "nudge",
      metadata: { skill_gaps: topGaps, hours_inactive: Math.round(hoursSinceActive) },
    });

    // Update last_active_at
    await adminClient.from("diagnostic_profiles").update({ last_active_at: new Date().toISOString() }).eq("id", profile.id);

    return new Response(JSON.stringify({ nudge: { title: nudgeTitle, body: nudgeBody } }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("strategic-nudge error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
