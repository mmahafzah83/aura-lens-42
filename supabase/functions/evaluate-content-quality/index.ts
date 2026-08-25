import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logAIUsage } from "../_shared/logAIUsage.ts";
import { ENDING_SHAPE_DESC, type EndingType } from "../_shared/voiceStyle.ts";
import { buildGrounding } from "../_shared/grounding.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Stable cache key: the same text judged against the same terms is never re-judged. */
async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const bearerToken = authHeader.replace("Bearer ", "").trim();
  const isServiceRole = !!SERVICE_ROLE && bearerToken === SERVICE_ROLE;
  let requesterUserId: string | null = null;
  if (!isServiceRole) {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data, error } = await sb.auth.getUser(bearerToken);
    if (error || !data?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    requesterUserId = data.user.id;
  }

  try {
    const startedAt = Date.now();
    const {
      post_text, language, signal_title, voice_tone, user_sector,
      target_register, grounding_text, content_kind, expected_ending, signal_id,
    } = await req.json();

    if (!post_text) {
      return new Response(JSON.stringify({ error: "post_text required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    const JUDGE_MODEL = "claude-sonnet-4-5-20250929";
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({
        pass: false,
        score: 0,
        skipped: true,
        skip_reason: "missing_api_key",
        judge_model: JUDGE_MODEL,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isArabic = language === "ar";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const admin = SERVICE_ROLE ? createClient(SUPABASE_URL, SERVICE_ROLE) : null;
    let resolvedGroundingText = typeof grounding_text === "string" ? grounding_text.trim() : "";
    let groundingAvailable = resolvedGroundingText.length > 0;

    if (!groundingAvailable && admin && typeof signal_id === "string" && signal_id.trim()) {
      try {
        let sigQuery = admin.from("strategic_signals")
          .select("id, user_id, signal_title, explanation, strategic_implications, what_it_means_for_you, confidence, supporting_evidence_ids")
          .eq("id", signal_id.trim());
        if (requesterUserId) sigQuery = sigQuery.eq("user_id", requesterUserId);
        const { data: sigData } = await sigQuery.maybeSingle();
        if (sigData) {
          const evidenceIds = Array.isArray((sigData as any).supporting_evidence_ids)
            ? (sigData as any).supporting_evidence_ids.filter(Boolean)
            : [];
          const provenanceRows: any[] = [];
          for (let i = 0; i < evidenceIds.length; i += 100) {
            const { data: batch } = await admin.from("evidence_fragments")
              .select("id, title, content, metadata, confidence")
              .eq("user_id", (sigData as any).user_id)
              .in("id", evidenceIds.slice(i, i + 100));
            if (batch) provenanceRows.push(...batch);
          }
          const byConfidence = [...provenanceRows].sort((a, b) => Number(b?.confidence ?? 0) - Number(a?.confidence ?? 0));
          const selected = byConfidence.slice(0, 6);
          const digitBearing = byConfidence.find((f: any) => /[0-9٠-٩۰-۹]/.test(`${f?.title || ""} ${f?.content || ""} ${JSON.stringify(f?.metadata || "")}`));
          if (digitBearing && !selected.some((f: any) => f?.id === digitBearing.id)) {
            selected.splice(Math.max(0, selected.length - 1), selected.length ? 1 : 0, digitBearing);
          }
          resolvedGroundingText = buildGrounding({
            signal: sigData as any,
            fragments: selected,
            provenanceRows,
            context: null,
            topic: signal_title ?? null,
          });
          groundingAvailable = resolvedGroundingText.trim().length > 0;
        }
      } catch (e) {
        console.warn("[evaluate-content-quality] grounding resolve failed:", (e as Error).message);
      }
    }

    // D121 — the judge must know which close the generator was ordered to write.
    const ending = (ENDING_SHAPE_DESC as Record<string, string>)[String(expected_ending ?? "")]
      ? (String(expected_ending) as EndingType)
      : null;
    const endingRule = ending === "question"
      ? `- ends_on_question: the final line is an uncomfortable, specific question (not a statement, not 'what do you think?').`
      : ending
        ? `- ends_on_question: NOT APPLICABLE for this post — the writer was instructed to close with ${ENDING_SHAPE_DESC[ending]}, and was explicitly told NOT to end on a question. Set ends_on_question = true. Judge the close instead under closes_in_shape: does the final line (ignoring any trailing hashtag lines) land in that named shape?\n- closes_in_shape: true if the final line matches the instructed close described above.`
        : `- ends_on_question: the final line is an uncomfortable, specific question (not a statement, not 'what do you think?').`;

    const cacheKey = await sha256Hex([
      String(post_text ?? ""),
      String(language ?? ""),
      String(target_register ?? ""),
      String(user_sector ?? ""),
      String(resolvedGroundingText ?? ""),
      String(expected_ending ?? ""),
    ].join("\u0000"));

    // Unchanged text is never re-judged.
    if (admin) {
      try {
        const { data: cached } = await admin
          .from("content_gate_cache")
          .select("verdict")
          .eq("content_hash", cacheKey)
          .maybeSingle();
        if (cached?.verdict) {
          return new Response(JSON.stringify({ ...(cached.verdict as any), content_hash: cacheKey, cached: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } catch (_) { /* a cold cache must never block a verdict */ }
    }

    const systemPrompt = `You are a ruthless content quality editor for senior executives. You are NOT the writer — you are the CHALLENGER. Your job is to find weaknesses before the executive publishes under their name.

Score each dimension 0-10:
1. HOOK: Does the first line stop a busy CDO mid-scroll? (0 = generic opener, 10 = can't look away)
2. SPECIFICITY: Does the post contain at least one specific number, named entity, or concrete example? (0 = all abstract, 10 = deeply specific)
3. VOICE: Does this sound like a real senior professional wrote it, or like AI? (0 = obviously AI, 10 = indistinguishable from human)
4. STRUCTURE: Clear flow from hook to close? Short paragraphs? Mobile-readable? (0 = wall of text, 10 = perfect rhythm)
5. SIGNAL_DEPTH: If grounded in a signal, does the post actually demonstrate insight from that signal? (0 = generic take, 10 = couldn't have written this without the signal)
${isArabic ? `6. ARABIC_QUALITY: Is this written in the target register stated below${target_register ? ` (${target_register})` : ""}? Not bureaucratic, not off-register? Technical terms in English? (0 = translation artifact, 10 = native in that register)` : '6. ENGLISH_QUALITY: Native-sounding? No awkward constructions? (0 = non-native patterns, 10 = polished native)'}

${"\n═══ DAHEEH STRUCTURAL ASSERTIONS (report each true/false, with a one-line reason) ═══\n- payoff_withheld: the core insight/number is NOT in the first two lines — tension is built before the reveal.\n- villain_named: the post names a specific misconception or wrong belief it corrects.\n" + endingRule + "\n- one_number_max: the post uses AT MOST one primary statistic (extra raw numbers = weaker).\n- grounded_number: " + (groundingAvailable ? "EVERY specific statistic in the post can be traced to the GROUNDING below. If any number is NOT supported by the grounding, this is FALSE and you MUST list the unsupported number in weaknesses. If the post has no statistics at all, set grounded_number = true." : "NOT MEASURED. Set grounded_number = null because no grounding was available.") + "\n- register_match: The TARGET REGISTER is stated below. Is the text written in that register? Judge the register the post was WRITTEN FOR — a post in the stated register is a match even if you would have phrased it differently. Only set FALSE if tokens belong to a different variety or a different language from the stated register, and list those exact tokens in weaknesses. If no target register was provided, set TRUE.\n- domain_match: The READER DOMAIN and the GROUNDING are stated below. Is the post anchored in the reader's domain, or in a domain present in the grounding? If it is anchored in a domain present in neither, set FALSE and name that foreign domain in weaknesses. If no reader domain was provided, set TRUE.\n\nTARGET REGISTER: " + (target_register || "(none provided)") + "\nINSTRUCTED CLOSE: " + (ending ? ENDING_SHAPE_DESC[ending] : "(none provided)") + "\nREADER DOMAIN: " + (user_sector || "(none provided)") + "\n\nGROUNDING (the only facts/numbers the post may use):\n" + (resolvedGroundingText || "(none provided — grounded_number is unmeasured, not failed)") + "\n"}

Return JSON:
{
  "scores": { "hook": N, "specificity": N, "voice": N, "structure": N, "signal_depth": N, "language_quality": N },
  "overall": N (weighted average: hook 25%, voice 25%, specificity 20%, structure 15%, signal_depth 10%, language 5%),
  "assertions": { "payoff_withheld": bool, "villain_named": bool, "ends_on_question": bool, "closes_in_shape": bool, "one_number_max": bool, "grounded_number": bool, "register_match": bool, "domain_match": bool },
  "pass": true/false (true ONLY if overall >= 70 AND grounded_number is true AND register_match is true (register_match is auto-true when no target register was provided)),
  "weaknesses": ["..."],
  "improved_hook": "A stronger version of the first line, if hook < 7",
  "verdict": "One sentence: would you advise this executive to publish this as-is?"
}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: JUDGE_MODEL,
        max_tokens: 2000,
        // The same text must get the same verdict twice. Anthropic rejects a
        // request that sets BOTH temperature and top_p (400), so determinism
        // here is temperature: 0 alone — top_p is left at its default of 1.
        temperature: 0,
        system: `${systemPrompt}\n\nReturn ONLY the JSON object. No prose, no markdown fences.`,
        messages: [
          { role: "user", content: `Post to evaluate:\n\n${post_text}\n\n${signal_title ? `Signal: "${signal_title}"` : ""}\n${voice_tone ? `Expected voice tone: ${voice_tone}` : ""}\n${user_sector ? `Sector: ${user_sector}` : ""}` },
        ],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      console.error("[evaluate-content-quality] judge API error:", response.status, errBody.slice(0, 500));
      return new Response(JSON.stringify({
        pass: false,
        score: 0,
        skipped: true,
        skip_reason: "judge_api_error",
        judge_model: JUDGE_MODEL,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const rawText = (data.content || []).map((c: any) => (typeof c?.text === "string" ? c.text : "")).join("").trim();
    const cleaned = rawText.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    const jsonSlice = firstBrace >= 0 && lastBrace > firstBrace ? cleaned.slice(firstBrace, lastBrace + 1) : cleaned;
    const result = JSON.parse(jsonSlice || "{}");
    result.judge_model = JUDGE_MODEL;
    result.content_hash = cacheKey;
    result.expected_ending = expected_ending ?? null;
    result.grounding_available = groundingAvailable;
    if (!groundingAvailable) {
      result.assertions = result.assertions && typeof result.assertions === "object" ? result.assertions : {};
      result.assertions.grounded_number = null;
    }
    if (ending && ending !== "question" && result?.assertions) {
      // The generator was ordered not to end on a question — not applicable.
      result.assertions.ends_on_question = true;
    }

    // ── ONE CATEGORY, NEVER PROSE ────────────────────────────────────────
    // Callers that face a member must have something they can turn into their
    // OWN sentence. The judge's wording is internal and stays internal.
    const a = result?.assertions ?? {};
    const scores = result?.scores ?? {};
    let category: "unsupported_number" | "language" | "generic" | "other" = "other";
    if (a.grounded_number === false) category = "unsupported_number";
    else if (a.register_match === false) category = "language";
    else if (Number(scores.specificity ?? 10) < 6 || a.domain_match === false) category = "generic";
    result.category = category;

    if (admin) {
      try {
        const store = admin.from("content_gate_cache").upsert({
          content_hash: cacheKey,
          verdict: result,
          judge_model: JUDGE_MODEL,
        }, { onConflict: "content_hash" }).then(() => {}, () => {});
        // @ts-ignore EdgeRuntime is available in Supabase runtime
        if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) EdgeRuntime.waitUntil(store);
      } catch (_) { /* a cache write never blocks a verdict */ }
    }

    try {
      const usagePayload = {
        function_name: "evaluate-content-quality",
        provider: "anthropic",
        model: JUDGE_MODEL,
        input_tokens: data?.usage?.input_tokens ?? 0,
        output_tokens: data?.usage?.output_tokens ?? 0,
        success: true,
        metadata: { latency_ms: Date.now() - startedAt, language: language ?? null, content_kind: content_kind ?? null },
      };
      // Never sit on the critical path: both callers race this function.
      // @ts-ignore EdgeRuntime is available in Supabase runtime
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
        // @ts-ignore EdgeRuntime is available in Supabase runtime
        EdgeRuntime.waitUntil(logAIUsage(usagePayload));
      } else {
        void logAIUsage(usagePayload);
      }
    } catch (_) { /* never block the verdict */ }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[evaluate-content-quality] error:", e);
    return new Response(JSON.stringify({
      pass: false,
      score: 0,
      skipped: true,
      skip_reason: "gate_exception",
      judge_model: "claude-sonnet-4-5-20250929",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});