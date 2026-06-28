import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const ADMIN_USER_ID = "9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3";
const ADMIN_EMAIL = "mohammad.mahafdhah@aura-intel.org";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Result = { provider: string; ok: boolean; status: number; detail?: string };

async function checkOpenAI(key: string): Promise<Result> {
  try {
    const r = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "text-embedding-3-small", input: "ping" }),
    });
    return { provider: "openai", ok: r.ok, status: r.status, detail: r.ok ? "" : (await r.text()).slice(0, 200) };
  } catch (e) {
    return { provider: "openai", ok: false, status: 0, detail: (e as Error).message };
  }
}

async function checkAnthropic(key: string): Promise<Result> {
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
    });
    return { provider: "anthropic", ok: r.ok, status: r.status, detail: r.ok ? "" : (await r.text()).slice(0, 200) };
  } catch (e) {
    return { provider: "anthropic", ok: false, status: 0, detail: (e as Error).message };
  }
}

async function checkPerplexity(key: string): Promise<Result> {
  try {
    const r = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "sonar",
        max_tokens: 16,
        messages: [{ role: "user", content: "hi" }],
      }),
    });
    return { provider: "perplexity", ok: r.ok, status: r.status, detail: r.ok ? "" : (await r.text()).slice(0, 200) };
  } catch (e) {
    return { provider: "perplexity", ok: false, status: 0, detail: (e as Error).message };
  }
}

async function checkResend(key: string): Promise<Result> {
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
    });

    if (r.ok) return { provider: "resend", ok: true, status: r.status, detail: "" };

    const text = (await r.text()).slice(0, 200);
    // A restricted (send-only) key correctly rejects GET /emails with 401
    // restricted_api_key. That is the healthy production state — POST /emails
    // (sending) is unaffected. Treat ONLY this exact signature as healthy.
    const isSendOnly =
      r.status === 401 && /restricted_api_key|restricted to only send/i.test(text);

    if (isSendOnly) {
      return { provider: "resend", ok: true, status: r.status, detail: "send-only key (healthy)" };
    }

    return { provider: "resend", ok: false, status: r.status, detail: text };
  } catch (e) {
    return { provider: "resend", ok: false, status: 0, detail: (e as Error).message };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.replace("Bearer ", "");
    const cronHeader = req.headers.get("x-cron-secret") || "";
    const apiKeyHeader = req.headers.get("apikey") || req.headers.get("x-api-key") || "";
    const isServiceRole = !!bearer && (bearer === serviceKey || apiKeyHeader === serviceKey);
    const isCron = !!CRON_SECRET && cronHeader === CRON_SECRET;
    if (!isServiceRole && !isCron) return json({ error: "Unauthorized" }, 401);

    const OPENAI = Deno.env.get("OPENAI_API_KEY") || "";
    const ANTHROPIC = Deno.env.get("ANTHROPIC_API_KEY") || "";
    const PERPLEXITY = Deno.env.get("PERPLEXITY_API_KEY") || "";
    const RESEND = Deno.env.get("RESEND_API_KEY") || "";

    const results = await Promise.all([
      checkOpenAI(OPENAI),
      checkAnthropic(ANTHROPIC),
      checkPerplexity(PERPLEXITY),
      checkResend(RESEND),
    ]);

    for (const r of results) {
      console.log(`[sentinel] ${r.provider} ${r.ok ? "ok" : "fail"} ${r.status}`);
    }

    const failures = results.filter((r) => !r.ok);
    const admin = createClient(supabaseUrl, serviceKey);

    if (failures.length > 0) {
      const rows = failures.map((f) => ({
        user_id: ADMIN_USER_ID,
        title: `API DOWN: ${f.provider} ${f.status}`,
        body: (f.detail || "request failed").slice(0, 500),
        type: "system",
        metadata: { urgency: "high", provider: f.provider, status: f.status, source: "api-health-sentinel" },
      }));
      const { error: notifErr } = await admin.from("notifications").insert(rows);
      if (notifErr) console.error("[sentinel] notif insert failed", notifErr.message);

      const resendDown = failures.some((f) => f.provider === "resend");
      if (!resendDown && RESEND) {
        const summary = failures
          .map((f) => `• ${f.provider} — HTTP ${f.status}: ${(f.detail || "").slice(0, 160)}`)
          .join("\n");
        const html = `<p>The daily API health check detected failures:</p><pre style="font:13px/1.5 monospace;background:#0f0e0c;color:#ededed;padding:12px;border-radius:8px;white-space:pre-wrap;">${summary.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!))}</pre><p>Run timestamp: ${new Date().toISOString()}</p>`;
        const er = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "Aura <Mohammad.Mahafdhah@aura-intel.org>",
            to: [ADMIN_EMAIL],
            subject: `API DOWN: ${failures.map((f) => f.provider).join(", ")}`,
            html,
          }),
        });
        if (!er.ok) console.error("[sentinel] alert email failed", er.status, (await er.text()).slice(0, 200));
      }
    }

    return json({
      success: true,
      checked: results.length,
      failed: failures.length,
      results: results.map((r) => ({ provider: r.provider, ok: r.ok, status: r.status })),
    });
  } catch (e) {
    console.error("api-health-sentinel error", e);
    return json({ error: (e as Error).message }, 500);
  }
});