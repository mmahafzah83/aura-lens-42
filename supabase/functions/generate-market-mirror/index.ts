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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: authErr } = await userClient.auth.getClaims(token);
    if (authErr || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;
    const admin = createClient(supabaseUrl, serviceKey);

    // Rate limit: once per 7 days
    const { data: existing } = await admin
      .from("market_mirror_cache")
      .select("generated_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (existing) {
      const ageMs = Date.now() - new Date((existing as any).generated_at).getTime();
      if (ageMs < 7 * 24 * 60 * 60 * 1000) {
        return new Response(
          JSON.stringify({ error: "rate_limited", retry_in_days: Math.ceil((7 * 24 * 60 * 60 * 1000 - ageMs) / (24 * 60 * 60 * 1000)) }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const [{ data: profile }, { data: signals }, { data: posts }, { data: trends }] = await Promise.all([
      admin.from("diagnostic_profiles")
        .select("first_name,level,firm,sector_focus,core_practice")
        .eq("user_id", userId).maybeSingle(),
      admin.from("strategic_signals")
        .select("signal_title,confidence,velocity_status")
        .eq("user_id", userId).eq("status", "active")
        .order("confidence", { ascending: false }).limit(15),
      admin.from("linkedin_posts")
        .select("theme")
        .eq("user_id", userId).not("theme", "is", null),
      admin.from("industry_trends")
        .select("headline,insight,signal_type")
        .neq("status", "dismissed")
        .gte("fetched_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .order("final_score", { ascending: false }).limit(10),
    ]);

    const themeMap = new Map<string, number>();
    (posts || []).forEach((p: any) => {
      const t = (p.theme || "").trim();
      if (t) themeMap.set(t, (themeMap.get(t) || 0) + 1);
    });
    const themes = Array.from(themeMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([theme, count]) => ({ theme, count }));

    const p = (profile as any) || {};
    const level = p.level || "senior leader";
    const sector = p.sector_focus || "their sector";

    const signalLines = (signals || []).map((s: any) =>
      `- ${s.signal_title} (${Math.round(Number(s.confidence) * 100)}% confidence, ${s.velocity_status || "stable"})`
    ).join("\n") || "(no active signals)";
    const trendLines = (trends || []).map((t: any) =>
      `- ${t.headline}${t.insight ? ` — ${t.insight}` : ""}`
    ).join("\n") || "(no recent market trends)";
    const themeLines = themes.length
      ? themes.map((t) => `- ${t.theme} (${t.count} posts)`).join("\n")
      : "(no published themes)";

    const systemPrompt = `You are analyzing a professional's market positioning. Generate three perspectives:

PERSPECTIVE 1 — THE HEADHUNTER: What a headhunter for '${level}' in '${sector}' would find when they research this person.
PERSPECTIVE 2 — THE CLIENT CIO: What a CIO evaluating advisory partners would see.
PERSPECTIVE 3 — THE CONFERENCE CURATOR: What a conference organizer would assess for speaker selection.

RULES:
- Each perspective must be ~150 words.
- Each must cite specific signal names + confidence percentages from the data.
- Each must include EXACTLY ONE explicit authority gap.
- Gaps must reference industry trends when available.
- Tone: direct, professional, observational. No flattery.

Return STRICT JSON ONLY (no markdown, no prose) with this exact shape:
{
  "headhunter": "string ~150 words",
  "client_cio": "string ~150 words",
  "curator": "string ~150 words",
  "gaps": {
    "headhunter_gap": "string, one sentence",
    "client_cio_gap": "string, one sentence",
    "curator_gap": "string, one sentence"
  }
}`;

    const userPrompt = `PROFILE
Name: ${p.first_name || "(unknown)"}
Level: ${level}
Firm: ${p.firm || "(unspecified)"}
Sector focus: ${sector}
Core practice: ${p.core_practice || "(unspecified)"}

ACTIVE STRATEGIC SIGNALS
${signalLines}

PUBLISHED THEMES
${themeLines}

RECENT INDUSTRY TRENDS (last 30 days)
${trendLines}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableKey}` },
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
      const txt = await aiRes.text();
      console.error("AI gateway error", aiRes.status, txt);
      return new Response(JSON.stringify({ error: "ai_failed", status: aiRes.status }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const aiJson = await aiRes.json();
    const raw = aiJson?.choices?.[0]?.message?.content || "{}";
    let parsed: any;
    try { parsed = JSON.parse(raw); } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : {};
    }

    const headhunter_text = String(parsed.headhunter || "").trim();
    const client_cio_text = String(parsed.client_cio || "").trim();
    const curator_text = String(parsed.curator || "").trim();
    const gaps = parsed.gaps || {};

    const { data: upserted, error: upErr } = await admin
      .from("market_mirror_cache")
      .upsert(
        { user_id: userId, headhunter_text, client_cio_text, curator_text, gaps, generated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      )
      .select()
      .maybeSingle();
    if (upErr) {
      console.error("upsert failed", upErr);
      return new Response(JSON.stringify({ error: "save_failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(upserted), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-market-mirror error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});