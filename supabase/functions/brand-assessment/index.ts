import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { withObserve } from "../_shared/observe.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logAIUsage } from "../_shared/logAIUsage.ts";
import { logError } from "../_shared/logError.ts";
import { BRAND_ASSESSMENT_SYSTEM_PROMPT } from "../_shared/brandAssessmentPrompt.ts";
import { buildReadEvidence } from "../_shared/readEvidence.ts";
import { LIMITS, QUEUE_MESSAGE } from "../_shared/limits.ts";
import { startRun, type RunHandle } from "../_shared/operationRun.ts";

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

    /* One run row per report generation. Today a failed report leaves no
       record anywhere; this is that record. */
    const run: RunHandle = await startRun(admin, {
      operation: "market_read",
      user_id: uid,
      meta: { sector: sector ?? null, band: band ?? null },
    });
    const finish = async (outcome: "ok" | "refused" | "failed", reason_code?: string) => {
      try { await run.finish({ outcome, reason_code: reason_code ?? null }); }
      catch (e) { console.error("[brand-assessment] run finish failed:", (e as Error)?.message); }
    };

    /* ── cost controls · enforced here, never in the UI ── */
    if (LIMITS.REQUIRE_VERIFIED_EMAIL && !userData.user.email_confirmed_at) {
      await finish("refused", "email_unconfirmed");
      return new Response(
        JSON.stringify({ error: "Confirm your email first — the link is in your inbox. Then this starts." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { count: ownRuns } = await admin
      .from("instrument_runs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", uid);
    if ((ownRuns ?? 0) >= LIMITS.INSTRUMENT_RUNS_PER_ACCOUNT) {
      await finish("refused", "already_written");
      return new Response(
        JSON.stringify({ error: "Your report has already been written. Open it from My Story." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
    const { count: today } = await admin
      .from("instrument_runs")
      .select("id", { count: "exact", head: true })
      .gte("created_at", dayStart.toISOString());
    if ((today ?? 0) >= LIMITS.DAILY_INSTRUMENT_RUN_CEILING) {
      await finish("refused", "daily_ceiling");
      return new Response(
        JSON.stringify({ queued: true, error: QUEUE_MESSAGE }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { floorMet, userPrompt } = await buildReadEvidence(admin, uid, { answers, auditScores, sector, band });

    if (!floorMet) {
      console.error("brand-assessment: evidence floor not met — nothing written");
      EdgeRuntime.waitUntil(logError("brand-assessment", "Evidence floor not met — no read written", {
        user_id: uid,
        severity: "high",
        context: { path: "evidence_floor" },
      }));
      await finish("refused", "evidence_floor");
      return new Response(
        JSON.stringify({
          interpretation: "",
          pending: true,
          message: "Saved. Your write-up will be ready shortly — you can ask for it again from My Story.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }


    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      await finish("failed", "not_configured");
      throw new Error("ANTHROPIC_API_KEY not configured");
    }

    // Claim the run now that the evidence floor is met and the spend is about to happen.
    await admin.from("instrument_runs").insert({ user_id: uid, kind: "assessment" });

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
      try {
        EdgeRuntime.waitUntil(logAIUsage({
          user_id: uid, function_name: "brand-assessment", provider: "anthropic",
          model: "claude-sonnet-4-5-20250929", success: false,
          error_code: lastStatus ? `http_${lastStatus}` : "unreachable",
        }));
      } catch (_) { /* non-blocking */ }
      await finish("failed", "provider_unreachable");
      return new Response(
        JSON.stringify({
          interpretation: "",
          pending: true,
          message: "Saved. Your write-up will be ready shortly — you can ask for it again from My Story.",
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
      try {
        EdgeRuntime.waitUntil(logAIUsage({
          user_id: uid, function_name: "brand-assessment", provider: "anthropic",
          model: "claude-sonnet-4-5-20250929", success: false,
          error_code: `http_${response.status}`,
        }));
      } catch (_) { /* non-blocking */ }
      if (response.status === 429) {
        await finish("failed", "provider_limit");
        return new Response(JSON.stringify({ error: "Rate limited — please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        await finish("failed", "credits_exhausted");
        return new Response(JSON.stringify({ error: "Credits exhausted — please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await finish("failed", `http_${response.status}`);
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
        await finish("failed", "placeholder_guard");
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
      await finish("failed", "empty_interpretation");
      return pendingResponse();
    }

    await finish("ok");
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
        message: "Saved. Your write-up will be ready shortly — you can ask for it again from My Story.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}));