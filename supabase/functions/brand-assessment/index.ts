import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { withObserve } from "../_shared/observe.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logAIUsage } from "../_shared/logAIUsage.ts";
import { logError } from "../_shared/logError.ts";
import { BRAND_ASSESSMENT_SYSTEM_PROMPT } from "../_shared/brandAssessmentPrompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};




serve(withObserve("brand-assessment", async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: userData, error: claimsErr } = await supa.auth.getUser(authHeader.replace("Bearer ", ""));
    if (claimsErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { answers, auditScores, sector, band } = await req.json();

    // Read the member's own material so the report is written from it, not from answers alone.
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const uid = userData.user.id;

    const [snapRes, fragRes, profRes] = await Promise.all([
      admin.from("linkedin_profile_snapshots")
        .select("headline, about, experience, skills, followers")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(1),
      admin.from("evidence_fragments")
        .select("title, content, confidence")
        .eq("user_id", uid)
        .order("confidence", { ascending: false })
        .limit(12),
      admin.from("diagnostic_profiles")
        .select("seniority_band, sector_focus")
        .eq("user_id", uid)
        .maybeSingle(),
    ]);

    const snap: any = snapRes.data?.[0] ?? null;
    const frags: any[] = fragRes.data ?? [];
    const prof: any = profRes.data ?? {};
    const resolvedSector = sector || prof.sector_focus || null;
    const resolvedBand = band || prof.seniority_band || null;

    const bandLine = resolvedBand === "room"
      ? "They operate at board and owner level — write for someone who sets the agenda in the room."
      : resolvedBand === "table"
      ? "They sit at the executive table — write for someone who shapes decisions alongside peers."
      : resolvedBand === "work"
      ? "They lead the work itself — write for someone whose credibility comes from delivery."
      : "";

    const profileBlock = snap
      ? `THEIR LINKEDIN PROFILE
Headline: ${snap.headline ?? "Not on file"}
About: ${typeof snap.about === "string" ? snap.about.slice(0, 2000) : "Not on file"}
Followers: ${snap.followers ?? "Not on file"}
Experience: ${JSON.stringify(snap.experience ?? []).slice(0, 3000)}
Skills: ${JSON.stringify(snap.skills ?? []).slice(0, 1000)}`
      : "THEIR LINKEDIN PROFILE\nNothing on file.";

    const claimsBlock = frags.length
      ? `WHAT THEY HAVE CAPTURED (their own claims, strongest first)
${frags.map((f, i) => `${i + 1}. ${f.title}${f.content ? ` — ${String(f.content).slice(0, 400)}` : ""}`).join("\n")}`
      : "WHAT THEY HAVE CAPTURED\nNothing captured yet.";

    // Build audit scores context for the AI
    const auditContext = typeof auditScores === "string"
      ? auditScores
      : `The user's Objective Evidence Audit scores are: ${JSON.stringify(auditScores, null, 2)}`;

    const userPrompt = `User's sector: ${resolvedSector || "Not stated — infer it from the headline and captured claims and name it explicitly."}
Their seniority: ${resolvedBand || "Not stated"}. ${bandLine}

${profileBlock}

${claimsBlock}

${auditContext}

Here are the user's Brand Assessment answers:
${JSON.stringify(answers, null, 2)}

Analyse this professional using all six frameworks and provide the complete brand positioning output. Use the audit scores as factual evidence — do not ask the user for them. Reference at least one of their own captured claims, by its substance, inside THE HONEST TRUTH section. Write for their seniority band. Never write a bracketed placeholder and never write the words "sector name".`;

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const callAnthropic = async (promptOverride?: string) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 110000);
      try {
        return await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-5-20250929",
            max_tokens: 4096,
            system: BRAND_ASSESSMENT_SYSTEM_PROMPT,
            messages: [{ role: "user", content: promptOverride ?? userPrompt }],
          }),
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(t);
      }
    };

    let response: Response | null = null;
    let lastErr: unknown = null;
    let lastStatus = 0;
    let lastBody = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        response = await callAnthropic();
        if (response.ok) break;
        lastStatus = response.status;
        lastBody = (await response.clone().text()).slice(0, 800);
        console.error(`AI gateway error attempt ${attempt + 1}:`, response.status, lastBody);
        if (response.status === 429 || response.status === 402) break;
        response = null;
      } catch (e) {
        lastErr = e;
        lastBody = String((e as Error)?.message ?? e).slice(0, 800);
        console.error(`AI gateway fetch failed attempt ${attempt + 1}:`, e);
      }
    }

    if (!response) {
      console.error("brand-assessment: returning graceful fallback", lastErr);
      EdgeRuntime.waitUntil(logError("brand-assessment", `Anthropic unreachable after retries (status ${lastStatus}): ${lastBody}`, {
        user_id: userData.user.id,
        severity: "high",
        context: { path: "retries_exhausted", anthropic_status: lastStatus, body: lastBody },
      }));
      return new Response(
        JSON.stringify({
          interpretation: "",
          pending: true,
          message: "Assessment saved. Your positioning will be generated shortly — you can regenerate it from My Story.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!response.ok) {
      EdgeRuntime.waitUntil(logError("brand-assessment", `Anthropic HTTP ${response.status}: ${lastBody}`, {
        user_id: userData.user.id,
        severity: "high",
        context: { path: "non_ok_status", anthropic_status: response.status, body: lastBody },
      }));
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited — please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted — please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const data = await response.json();
    try {
      EdgeRuntime.waitUntil(logAIUsage({
        user_id: userData.user.id,
        function_name: "brand-assessment",
        provider: "anthropic",
        model: data.model,
        input_tokens: data.usage?.input_tokens,
        output_tokens: data.usage?.output_tokens,
      }));
    } catch (_) { /* non-blocking */ }
    let interpretation = (data.content || []).map((c: any) => c.text || "").join("") || "";

    // OUTPUT GUARD — a report with a bracketed placeholder is never persisted.
    const isBad = (t: string) => /\[[^\]]{2,40}\]/.test(t) || /sector name/i.test(t) || /zone of genius/i.test(t);
    const pendingResponse = () => new Response(
      JSON.stringify({
        interpretation: "",
        pending: true,
        message: "Saved. Your write-up will be ready shortly — you can ask for it again from My Story.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

    if (interpretation && isBad(interpretation)) {
      console.error("brand-assessment: placeholder detected, retrying once");
      const correction = `${userPrompt}

CORRECTION — your previous attempt contained a bracketed placeholder, the words "sector name", or the phrase "zone of genius". Rewrite the whole output. Every sentence must be finished prose about this specific person. Do not output a square bracket anywhere. Name the sector explicitly, inferring it from the headline and captured claims if it is not stated.`;
      try {
        const retry = await callAnthropic(correction);
        if (retry.ok) {
          const retryData = await retry.json();
          const retryText = (retryData.content || []).map((c: any) => c.text || "").join("") || "";
          interpretation = retryText;
        }
      } catch (e) {
        console.error("brand-assessment: retry failed", e);
      }
      if (!interpretation || isBad(interpretation)) {
        EdgeRuntime.waitUntil(logError("brand-assessment", "Placeholder output after retry — nothing saved", {
          user_id: userData.user.id,
          severity: "high",
          context: { path: "placeholder_guard" },
        }));
        return pendingResponse();
      }
    }

    if (!interpretation) {
      console.error("brand-assessment: empty interpretation from model", data?.stop_reason);
      EdgeRuntime.waitUntil(logError("brand-assessment", `Empty interpretation from model (stop_reason=${data?.stop_reason ?? "unknown"})`, {
        user_id: userData.user.id,
        severity: "high",
        context: { path: "empty_interpretation", anthropic_status: response.status, body: JSON.stringify(data ?? {}).slice(0, 800) },
      }));
      return pendingResponse();
    }

    return new Response(JSON.stringify({ interpretation, pending: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("brand-assessment error:", e);
    EdgeRuntime.waitUntil(logError("brand-assessment", e, { user_id: null }));
    return new Response(
      JSON.stringify({
        interpretation: "",
        pending: true,
        message: "Assessment saved. Your positioning will be generated shortly — you can regenerate it from My Story.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}));