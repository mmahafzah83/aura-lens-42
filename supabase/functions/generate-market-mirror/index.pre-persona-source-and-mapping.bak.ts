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
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await userClient.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = user.id;
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

    // Rank bucket from free-text level (case-insensitive match).
    const levelLower = String(level).toLowerCase();
    const rankBucket: "c_suite" | "partner" | "director" =
      /\b(chief|c-suite|c level|c-level|ceo|cfo|cio|cto|cdo)\b/.test(levelLower)
        ? "c_suite"
        : /\b(partner|managing director)\b/.test(levelLower)
        ? "partner"
        : "director";

    // Persona trio per rank — POSITIONAL (slot 1/2/3 maps to existing
    // headhunter_text / client_cio_text / curator_text columns).
    const PERSONAS: Record<typeof rankBucket, { slot1: string; slot2: string; slot3: string; p1Desc: string; p2Desc: string; p3Desc: string }> = {
      c_suite: {
        slot1: "BOARD MEMBER",
        slot2: "PEER CEO",
        slot3: "INDUSTRY ANALYST",
        p1Desc: `What a board member assessing a '${level}' in '${sector}' would conclude about this person's strategic judgement, governance posture, and external credibility.`,
        p2Desc: `What a peer CEO in '${sector}' would think when sizing this person up as an equal — leadership signal, market read, and willingness to take a position.`,
        p3Desc: `What an industry analyst covering '${sector}' would write about this person's positioning, thesis, and visibility against the field.`,
      },
      partner: {
        slot1: "PROSPECTIVE CLIENT",
        slot2: "PRACTICE LEADERSHIP",
        slot3: "TOP TALENT RECRUIT",
        p1Desc: `What a prospective client evaluating a '${level}' in '${sector}' would conclude about this person's expertise, point of view, and fit for a serious engagement.`,
        p2Desc: `What practice leadership inside the firm would see when reviewing this person's market footprint, thought leadership, and book-of-business signal in '${sector}'.`,
        p3Desc: `What a top talent recruit weighing joining this practice would notice about this person's voice, the brand they project, and what working with them would look like.`,
      },
      director: {
        slot1: "HEADHUNTER",
        slot2: "CLIENT CIO",
        slot3: "CONFERENCE CURATOR",
        p1Desc: `What a headhunter recruiting for '${level}' roles in '${sector}' would find when they research this person.`,
        p2Desc: `What a CIO in '${sector}' evaluating advisory partners would see.`,
        p3Desc: `What a conference curator in '${sector}' would assess for speaker selection.`,
      },
    };
    const personaSet = PERSONAS[rankBucket];

    const systemPrompt = `You are analyzing a professional's market positioning. Generate three perspectives, written FROM each persona's point of view:

PERSPECTIVE 1 — THE ${personaSet.slot1}: ${personaSet.p1Desc}
PERSPECTIVE 2 — THE ${personaSet.slot2}: ${personaSet.p2Desc}
PERSPECTIVE 3 — THE ${personaSet.slot3}: ${personaSet.p3Desc}

RULES:
- Each perspective must be ~150 words.
- Each must cite specific signal names + confidence percentages from the data.
- Each must include EXACTLY ONE explicit expertise gap.
- Gaps must reference industry trends when available.
- Tone: direct, professional, observational. No flattery.

Return STRICT JSON ONLY (no markdown, no prose) with this exact shape:
{
  "perspective_1": "string ~150 words — from THE ${personaSet.slot1}'s POV",
  "perspective_2": "string ~150 words — from THE ${personaSet.slot2}'s POV",
  "perspective_3": "string ~150 words — from THE ${personaSet.slot3}'s POV",
  "gaps": {
    "perspective_1_gap": "string, one sentence — what THE ${personaSet.slot1} would call out",
    "perspective_2_gap": "string, one sentence — what THE ${personaSet.slot2} would call out",
    "perspective_3_gap": "string, one sentence — what THE ${personaSet.slot3} would call out"
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

    // Fetch real competitor content from Perplexity for grounded analysis
    let competitorContext = "";
    const PERPLEXITY_KEY = Deno.env.get("PERPLEXITY_API_KEY");
    if (PERPLEXITY_KEY && p.sector_focus) {
      try {
        const perpAbort = new AbortController();
        const perpTimer = setTimeout(() => perpAbort.abort(), 12000);
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
              content: `What have McKinsey, PwC, BCG, Deloitte, and EY published about ${p.sector_focus} in the last 30 days? List specific article titles, dates, and key arguments. Focus on thought leadership and LinkedIn content, not press releases.`,
            }],
          }),
          signal: perpAbort.signal,
        }).finally(() => clearTimeout(perpTimer));
        if (perpRes.ok) {
          const perpData = await perpRes.json();
          const content = perpData?.choices?.[0]?.message?.content || "No recent competitor content found.";
          competitorContext = `\n\nREAL COMPETITOR CONTENT (from the last 30 days — use this for grounded analysis, cite specific articles):\n${content}`;
        } else {
          console.warn("[market-mirror] Perplexity non-OK status:", perpRes.status);
        }
      } catch (e) {
        console.warn("[market-mirror] Perplexity search failed:", (e as Error).message);
      }
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");
    const mirrorAbort = new AbortController();
    const mirrorTimer = setTimeout(() => mirrorAbort.abort(), 30000);
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
        system: systemPrompt + competitorContext + "\n\nReturn ONLY a valid JSON object. No markdown fences, no preamble.",
        messages: [{ role: "user", content: userPrompt }],
      }),
      signal: mirrorAbort.signal,
    }).finally(() => clearTimeout(mirrorTimer));

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      console.error("AI gateway error", aiRes.status, txt);
      return new Response(JSON.stringify({ error: "ai_failed", status: aiRes.status }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const aiJson = await aiRes.json();
    const raw = (aiJson?.content || []).map((c: any) => c.text || "").join("") || "{}";
    let parsed: any;
    try { parsed = JSON.parse(raw); } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : {};
    }

    // Read positionally, with legacy-key fallback in case the model emits old keys.
    const slot1Text = String(parsed.perspective_1 ?? parsed.headhunter ?? "").trim();
    const slot2Text = String(parsed.perspective_2 ?? parsed.client_cio ?? "").trim();
    const slot3Text = String(parsed.perspective_3 ?? parsed.curator ?? "").trim();
    const rawGaps = parsed.gaps || {};
    // Map positional → existing column-friendly keys. Stamp persona_set.
    const gaps = {
      headhunter_gap: String(rawGaps.perspective_1_gap ?? rawGaps.headhunter_gap ?? "").trim(),
      client_cio_gap: String(rawGaps.perspective_2_gap ?? rawGaps.client_cio_gap ?? "").trim(),
      curator_gap: String(rawGaps.perspective_3_gap ?? rawGaps.curator_gap ?? "").trim(),
      persona_set: rankBucket,
    };
    // Reuse columns as POSITIONAL slots (slot1 → headhunter_text, etc.).
    const headhunter_text = slot1Text;
    const client_cio_text = slot2Text;
    const curator_text = slot3Text;

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