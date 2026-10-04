import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { withObserve } from "../_shared/observe.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logAIUsage } from "../_shared/logAIUsage.ts";
import { logError } from "../_shared/logError.ts";
import { BRAND_ASSESSMENT_SYSTEM_PROMPT } from "../_shared/brandAssessmentPrompt.ts";
import { buildReadEvidence } from "../_shared/readEvidence.ts";
import { ARABIC_VOICE_BLOCK, arabicGateDetail, arabicCorrectionText } from "../_shared/arabicVoice.ts";

/** Appended after the shared Arabic voice when the report is written in Arabic. */
const ARABIC_REPORT_ADDITION = "The UPPERCASE section header lines (HOW THE MARKET SEES YOU, HOW YOU BUILD TRUST, YOUR NATURAL TONE, YOUR ONE-LINER, WHAT ONLY YOU CAN DO, THE GAP, THE SPACE NOBODY ELSE OWNS, YOUR 3 TOPICS, WHERE TO INVEST NEXT, THE HONEST TRUTH, IN YOUR OWN WORDS) and the line ---JSON--- stay exactly as written, in English: they are markers the system reads, the member never sees them. Everything under each header is Arabic. Every JSON value is Arabic; JSON keys stay English. primary_archetype and secondary_archetype follow the Arabic archetype rule, not 'The [Adjective] [Noun]'. YOUR ONE-LINER is written in the first person in Arabic. Topic titles are what a decision-maker in the member's field would type in Arabic. The member's answers and capability names below are supplied in English; read them, do not copy the English wording.";

const REPORT_HEADERS = [
  "HOW THE MARKET SEES YOU", "HOW YOU BUILD TRUST", "YOUR NATURAL TONE", "YOUR ONE-LINER",
  "WHAT ONLY YOU CAN DO", "THE GAP", "THE SPACE NOBODY ELSE OWNS", "YOUR 3 TOPICS",
  "WHERE TO INVEST NEXT", "THE HONEST TRUTH", "IN YOUR OWN WORDS",
];

/** null = usable Arabic report; otherwise the failed check and, for the gate, its detail. */
function arabicReportCheck(text: string): { check: string; message: string } | null {
  const lines = new Set(text.split("\n").map((l) => l.trim()));
  // IN YOUR OWN WORDS may be omitted when no post text was supplied.
  const missing = REPORT_HEADERS.filter((h) => h !== "IN YOUR OWN WORDS" && !lines.has(h));
  if (missing.length) {
    return { check: "missing_header", message: `That was not usable. Failed check: missing_header. These header lines are missing or changed: ${missing.join(", ")}. Write each one exactly as given, in English, on its own line.` };
  }
  const i = text.indexOf("---JSON---");
  let obj: Record<string, unknown> | null = null;
  if (i >= 0) {
    const tail = text.slice(i + 10);
    const a = tail.indexOf("{"), b = tail.lastIndexOf("}");
    try { obj = a >= 0 && b > a ? JSON.parse(tail.slice(a, b + 1)) : null; } catch { obj = null; }
  }
  if (!obj || typeof obj !== "object") {
    return { check: "json_unreadable", message: "That was not usable. Failed check: json_unreadable. End with the line ---JSON--- followed by one valid JSON object with the exact keys given." };
  }
  const d = arabicGateDetail(obj, { skipKeys: ["own_words_quote"] });
  return d ? { check: d.check, message: arabicCorrectionText(d) } : null;
}
import { LIMITS, QUEUE_MESSAGE } from "../_shared/limits.ts";
import { startRun, runIdFrom, type RunHandle } from "../_shared/operationRun.ts";
import { OPERATION_STAGES } from "../_shared/stageKeys.ts";

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

    const body = await req.json();
    const { answers, auditScores, sector, band } = body;
    const lang: "ar" | "en" = body?.ui_lang === "ar" ? "ar" : "en";

    // Read the member's own material so the report is written from it, not from answers alone.
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const uid = userData.user.id;

    /* One run row per report generation. Today a failed report leaves no
       record anywhere; this is that record. */
    const run: RunHandle = await startRun(admin, {
      id: runIdFrom(body),
      operation: "market_read",
      user_id: uid,
      meta: { sector: sector ?? null, band: band ?? null, lang },
    });
    const [GATHER, WRITE] = OPERATION_STAGES.market_read;
    run.mark(GATHER);
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

    const { floorMet, userPrompt } = await buildReadEvidence(
      admin, uid, lang === "ar" ? { answers, auditScores, sector, band, lang } : { answers, auditScores, sector, band },
    );

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

    run.mark(WRITE);
    // Claim the run now that the evidence floor is met and the spend is about to happen.
    await admin.from("instrument_runs").insert({ user_id: uid, kind: "assessment" });

    const ARABIC_SYSTEM = BRAND_ASSESSMENT_SYSTEM_PROMPT + "\n\n" + ARABIC_VOICE_BLOCK + "\n" + ARABIC_REPORT_ADDITION;
    const callAnthropic = async (promptOverride?: string, systemOverride?: string) => {
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
            system: systemOverride ?? (lang === "ar" ? ARABIC_SYSTEM : BRAND_ASSESSMENT_SYSTEM_PROMPT),
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
        metadata: { lang },
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

    let outLang: "ar" | "en" = lang;
    const textOf = async (r: Response) => ((await r.json()).content || []).map((c: any) => c.text || "").join("") || "";

    /* ARABIC: one correction call shared with the placeholder guard; if still
       unusable, record it and write the English report once instead. */
    if (lang === "ar" && interpretation) {
      const why = () => isBad(interpretation)
        ? { check: "placeholder", message: "That was not usable. Failed check: placeholder. Remove every square bracket, the words \"sector name\" and \"zone of genius\"; name the sector explicitly." }
        : arabicReportCheck(interpretation);
      let fail = why();
      let correctionCalls = 0;
      if (fail) {
        correctionCalls = 1;
        try {
          const retry = await callAnthropic(`${userPrompt}\n\nYOUR PREVIOUS ATTEMPT:\n${interpretation}\n\nCORRECTION — ${fail.message} Rewrite the whole output.`);
          if (retry.ok) interpretation = await textOf(retry);
        } catch (e) { console.error("brand-assessment: Arabic correction failed", e); }
        fail = interpretation ? why() : { check: "empty", message: "" };
      }
      if (fail) {
        EdgeRuntime.waitUntil(logError("brand-assessment", "Arabic report unusable after one correction", {
          user_id: uid, severity: "high",
          context: { path: "arabic_gate", failed_check: fail.check, correction_calls: correctionCalls },
        }));
        outLang = "en";
        interpretation = "";
        try {
          const { userPrompt: enPrompt } = await buildReadEvidence(admin, uid, { answers, auditScores, sector, band });
          const en = await callAnthropic(enPrompt, BRAND_ASSESSMENT_SYSTEM_PROMPT);
          if (en.ok) interpretation = await textOf(en);
        } catch (e) { console.error("brand-assessment: English fallback failed", e); }
        EdgeRuntime.waitUntil(logAIUsage({
          user_id: uid, function_name: "brand-assessment", provider: "anthropic",
          model: "claude-sonnet-4-5-20250929", success: !!interpretation,
          metadata: { lang: "en", fallback_from: "ar" },
        }));
      }
      if (interpretation && isBad(interpretation)) {
        EdgeRuntime.waitUntil(logError("brand-assessment", "Placeholder output after retry — nothing saved", {
          user_id: uid, severity: "high", context: { path: "placeholder_guard", lang: outLang },
        }));
        await finish("failed", "placeholder_guard");
        return pendingResponse();
      }
    }

    if (lang === "en" && interpretation && isBad(interpretation)) {
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

    await finish("ok", outLang !== lang ? "arabic_fallback" : undefined);
    return new Response(JSON.stringify({ interpretation, pending: false, lang: outLang, lang_fallback: outLang !== lang }), {
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