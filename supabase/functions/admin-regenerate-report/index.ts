import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { withObserve, logEfError } from "../_shared/observe.ts";
import { BRAND_ASSESSMENT_SYSTEM_PROMPT } from "../_shared/brandAssessmentPrompt.ts";
import { logAIUsage } from "../_shared/logAIUsage.ts";
import { isAdmin } from "../_shared/adminRole.ts";
import { buildReadEvidence } from "../_shared/readEvidence.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Mirrors splitInterpretation() in src/components/BrandAssessmentModal.tsx exactly. */
function splitInterpretation(raw: string): { prose: string; json: any | null } {
  if (!raw) return { prose: "", json: null };
  const idx = raw.indexOf("---JSON---");
  if (idx === -1) return { prose: raw, json: null };
  const prose = raw.slice(0, idx).trim();
  const jsonText = raw.slice(idx + "---JSON---".length).trim();
  try {
    const cleaned = jsonText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    return { prose, json: JSON.parse(cleaned) };
  } catch (_e) {
    return { prose, json: null };
  }
}

serve(withObserve("admin-regenerate-report", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // --- auth: must be a signed-in admin -------------------------------------
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data: userData, error: userErr } = await anon.auth.getUser(authHeader.replace("Bearer ", ""));
  if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

  if (!(await isAdmin(admin, userData.user.id))) return json({ error: "Forbidden" }, 403);

  // --- resolve the target user ---------------------------------------------
  const body = await req.json().catch(() => ({}));
  const email: string | undefined = typeof body?.email === "string" ? body.email.trim() : undefined;
  let targetId: string | undefined = typeof body?.user_id === "string" ? body.user_id.trim() : undefined;

  if (!targetId && email) {
    const needle = email.toLowerCase();
    for (let page = 1; page <= 20 && !targetId; page++) {
      const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (listErr) return json({ error: listErr.message }, 500);
      const hit = list.users.find((u) => (u.email || "").toLowerCase() === needle);
      if (hit) targetId = hit.id;
      if (!list.users.length || list.users.length < 200) break;
    }
    if (!targetId) return json({ error: "user not found" }, 404);
  }
  if (!targetId) return json({ error: "email or user_id required" }, 400);

  // --- load their saved answers --------------------------------------------
  const { data: profile, error: profErr } = await admin
    .from("diagnostic_profiles")
    .select("brand_assessment_answers, audit_results, sector_focus")
    .eq("user_id", targetId)
    .maybeSingle();
  if (profErr) return json({ error: profErr.message }, 500);

  const answers = profile?.brand_assessment_answers as Record<string, unknown> | null;
  if (!answers || typeof answers !== "object" || Object.keys(answers).length === 0) {
    return json({ error: "no saved answers" }, 400);
  }

  const auditScores =
    profile?.audit_results && Object.keys(profile.audit_results as object).length > 0
      ? profile.audit_results
      : "No audit scores available yet";

  // Same evidence and same prompt as brand-assessment — one artifact, one builder.
  const { floorMet, userPrompt } = await buildReadEvidence(admin, targetId, {
    answers,
    auditScores,
    sector: profile?.sector_focus ?? null,
    band: null,
  });

  if (!floorMet) {
    await logEfError(admin, {
      function_name: "admin-regenerate-report",
      error: "Evidence floor not met — no read written",
      severity: "high",
      user_id: targetId,
      context: { path: "evidence_floor" },
    });
    return json({ ok: false, pending: true });
  }

  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);

  const callAnthropic = (prompt: string) => fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 8192,
      system: BRAND_ASSESSMENT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const resp = await callAnthropic(userPrompt);

  const anthropic_status = resp.status;
  const rawBody = await resp.text();

  if (!resp.ok) {
    await logEfError(admin, {
      function_name: "admin-regenerate-report",
      error: `Anthropic HTTP ${anthropic_status}: ${rawBody.slice(0, 800)}`,
      severity: "high",
      user_id: targetId,
      context: { anthropic_status, body: rawBody.slice(0, 2000) },
    });
    return json({ error: `Anthropic HTTP ${anthropic_status}`, anthropic_status, details: rawBody.slice(0, 800) }, 502);
  }

  const data = JSON.parse(rawBody);
  try {
    EdgeRuntime.waitUntil(logAIUsage({
      user_id: targetId,
      function_name: "admin-regenerate-report",
      provider: "anthropic",
      model: data.model,
      input_tokens: data.usage?.input_tokens,
      output_tokens: data.usage?.output_tokens,
    }));
  } catch (_) { /* non-blocking */ }

  let interpretation = (data.content || []).map((c: any) => c.text || "").join("") || "";

  // OUTPUT GUARD — mirrors brand-assessment exactly.
  const isBad = (t: string) => /\[[^\]]{2,40}\]/.test(t) || /sector name/i.test(t) || /zone of genius/i.test(t);

  if (interpretation && isBad(interpretation)) {
    console.error("admin-regenerate-report: placeholder detected, retrying once");
    const correction = `${userPrompt}

CORRECTION — your previous attempt contained a bracketed placeholder, the words "sector name", or the phrase "zone of genius". Rewrite the whole output. Every sentence must be finished prose about this specific person. Do not output a square bracket anywhere. Name the sector explicitly, inferring it from the headline and captured claims if it is not stated.`;
    try {
      const retry = await callAnthropic(correction);
      if (retry.ok) {
        const retryData = await retry.json();
        interpretation = (retryData.content || []).map((c: any) => c.text || "").join("") || "";
      }
    } catch (e) {
      console.error("admin-regenerate-report: retry failed", e);
    }
    if (!interpretation || isBad(interpretation)) {
      await logEfError(admin, {
        function_name: "admin-regenerate-report",
        error: "Placeholder output after retry — nothing saved",
        severity: "high",
        user_id: targetId,
        context: { path: "placeholder_guard" },
      });
      return json({ ok: false, pending: true });
    }
  }

  const { prose, json: parsed } = splitInterpretation(interpretation);

  // Same shape the frontend persists.
  let resultsObj: Record<string, any> = { interpretation: prose || interpretation };
  if (parsed && typeof parsed === "object") {
    resultsObj = { ...parsed, ...resultsObj };
  }

  const keyCount = Object.keys(resultsObj).length;
  if (!interpretation || keyCount <= 1) {
    await logEfError(admin, {
      function_name: "admin-regenerate-report",
      error: `Empty or unparseable report (keys=${keyCount})`,
      severity: "high",
      user_id: targetId,
      context: { anthropic_status, body: rawBody.slice(0, 2000) },
    });
    return json({ error: "empty report from model", anthropic_status, result_keys: keyCount }, 502);
  }

  // Mirrors derivePillars() in src/lib/brandPillars.ts — primary branch only.
  // Every read produced by the current system prompt emits content_pillars,
  // so the legacy prose-parsing fallback is not needed here.
  const derivedPillars: string[] = Array.isArray((resultsObj as any).content_pillars)
    ? (resultsObj as any).content_pillars
        .map((v: any) => (typeof v === "string" ? v.trim() : ""))
        .filter((s: string) => s.length > 0)
        .slice(0, 5)
    : [];

  const { error: writeErr } = await admin
    .from("diagnostic_profiles")
    .update({
      brand_assessment_results: resultsObj,
      brand_assessment_completed_at: new Date().toISOString(),
      ...(derivedPillars.length ? { brand_pillars: derivedPillars } : {}),
    })
    .eq("user_id", targetId);
  if (writeErr) return json({ error: writeErr.message, anthropic_status }, 500);

  // Freeze a new report edition for the target user (non-blocking).
  let snapshot_version: number | null = null;
  try {
    const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/capture-report-snapshot`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
        apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
      },
      body: JSON.stringify({ user_id: targetId, created_by: "admin" }),
    });
    const out = await res.json().catch(() => ({}));
    snapshot_version = out?.version ?? null;
    if (!res.ok) {
      await logEfError(admin, {
        function_name: "admin-regenerate-report",
        error: `snapshot capture failed (${res.status})`,
        severity: "high",
        user_id: targetId,
        context: { body: out },
      });
    }
  } catch (e) {
    await logEfError(admin, {
      function_name: "admin-regenerate-report",
      error: e,
      severity: "high",
      user_id: targetId,
      context: { stage: "snapshot" },
    });
  }

  return json({
    ok: true,
    anthropic_status,
    wrote: true,
    result_keys: keyCount,
    snapshot_version,
    brand_pillars: derivedPillars,
    report: resultsObj,
  });
}));
