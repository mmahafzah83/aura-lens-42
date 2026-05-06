import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_USER_ID = "9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3";
const PROMPT = `Evaluate this screenshot of Aura — a strategic intelligence OS for GCC senior executives (CIO/CDO level). Design system: bronze (#B08D3A) primary accent, Cormorant Garamond for display headings, DM Sans for body text, warm paper/cream backgrounds in light mode. Orange (#F97316) is ONLY for signal alerts and time-sensitive indicators.

Score each dimension 1-10 with one-sentence explanation:

1. BRAND_CONSISTENCY: Does this page use bronze consistently? Any misplaced orange?
2. TYPOGRAPHY: Correct fonts? Headings in serif, body in sans-serif?
3. VISUAL_HIERARCHY: Is information prioritized? Does the eye flow naturally?
4. EMOTIONAL_TONE: Does this feel like a premium advisory retainer or a generic SaaS dashboard?
5. CDO_SCREENSHOT_TEST: Would a GCC CDO screenshot this and share it?
6. INFORMATION_DENSITY: Too empty or too cluttered? Whitespace intentional?

Return ONLY valid JSON (no markdown, no backticks, no preamble):
{ "dimensions": [{ "name": "BRAND_CONSISTENCY", "score": 8, "explanation": "..." }, ...], "overall_score": 7.5, "critical_issues": ["..."], "suggestions": ["..."] }`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: claimsErr } = await userClient.auth.getUser(token);
    if (claimsErr || !user) return json({ error: "Unauthorized" }, 401);
    const userId = user.id;
    if (userId !== ADMIN_USER_ID) return json({ error: "Forbidden" }, 403);

    if (!anthropicKey) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);

    const body = await req.json().catch(() => ({}));
    const screenshots: Array<{ page: string; imageBase64: string }> = Array.isArray(body?.screenshots) ? body.screenshots : [];
    const run_id: string = body?.run_id || crypto.randomUUID();
    if (screenshots.length === 0) return json({ error: "screenshots array required" }, 400);

    const admin = createClient(supabaseUrl, serviceKey);
    const evaluations: any[] = [];
    const rows: any[] = [];

    for (const shot of screenshots) {
      const page = shot.page || "unknown";
      let status: "pass" | "warn" | "fail" = "warn";
      let details: any = {};

      try {
        const data = (shot.imageBase64 || "").replace(/^data:image\/\w+;base64,/, "");
        const aRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": anthropicKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1000,
            messages: [{
              role: "user",
              content: [
                { type: "image", source: { type: "base64", media_type: "image/png", data } },
                { type: "text", text: PROMPT },
              ],
            }],
          }),
        });

        if (!aRes.ok) {
          const errTxt = await aRes.text();
          details = { error: `Anthropic ${aRes.status}`, body: errTxt.slice(0, 1000) };
          status = "warn";
        } else {
          const aJson = await aRes.json();
          const text = aJson?.content?.[0]?.text ?? "";
          let parsed: any = null;
          try {
            parsed = JSON.parse(text);
          } catch {
            const m = text.match(/\{[\s\S]*\}/);
            if (m) { try { parsed = JSON.parse(m[0]); } catch { /* ignore */ } }
          }
          if (parsed && typeof parsed === "object") {
            details = parsed;
            const overall = Number(parsed.overall_score);
            status = isFinite(overall)
              ? (overall >= 7 ? "pass" : overall >= 5 ? "warn" : "fail")
              : "warn";
          } else {
            details = { raw: text.slice(0, 4000), parse_error: true };
            status = "warn";
          }
        }
      } catch (e: any) {
        details = { error: e?.message ?? String(e) };
        status = "warn";
      }

      const row = {
        run_id,
        run_by: userId,
        layer: "ai",
        category: "design_evaluation",
        test_id: `ai_eval_${page}`,
        test_name: `AI Design Evaluation: ${page}`,
        status,
        details: { page, ...details },
      };
      rows.push(row);
      evaluations.push(row);
    }

    if (rows.length > 0) {
      const { error: insErr } = await admin.from("qa_audit_results").insert(rows);
      if (insErr) console.error("qa_audit_results insert failed:", insErr.message);
    }

    return json({ ok: true, run_id, evaluations }, 200);
  } catch (e) {
    console.error("qa-ai-evaluate error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});