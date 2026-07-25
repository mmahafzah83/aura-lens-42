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

    const { answers, auditScores, sector } = await req.json();

    // Build audit scores context for the AI
    const auditContext = typeof auditScores === "string"
      ? auditScores
      : `The user's Objective Evidence Audit scores are: ${JSON.stringify(auditScores, null, 2)}`;

    const userPrompt = `User's sector: ${sector || "Not specified"}

${auditContext}

Here are the user's Brand Assessment answers:
${JSON.stringify(answers, null, 2)}

Analyse this professional using all six frameworks and provide the complete brand positioning output. Use the audit scores as factual evidence — do not ask the user for them.`;

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const callAnthropic = async () => {
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
            messages: [{ role: "user", content: userPrompt }],
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
    const interpretation = (data.content || []).map((c: any) => c.text || "").join("") || "";

    if (!interpretation) {
      console.error("brand-assessment: empty interpretation from model", data?.stop_reason);
      EdgeRuntime.waitUntil(logError("brand-assessment", `Empty interpretation from model (stop_reason=${data?.stop_reason ?? "unknown"})`, {
        user_id: userData.user.id,
        severity: "high",
        context: { path: "empty_interpretation", anthropic_status: response.status, body: JSON.stringify(data ?? {}).slice(0, 800) },
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