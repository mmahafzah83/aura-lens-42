import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

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

    let isAdmin = false;
    let userClient = null;

    if (!isServiceRole && !isCron && bearer) {
      userClient = createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      });
      const { data: { user }, error: userErr } = await userClient.auth.getUser();
      if (user && !userErr) {
        const { data: adminFlag } = await userClient.rpc("is_current_user_admin" as never);
        isAdmin = !!adminFlag;
      }
    }

    if (!isServiceRole && !isCron && !isAdmin) {
      return json({ error: "Unauthorized" }, 401);
    }

    let body: any = {};
    if (req.method !== "GET") {
      const text = await req.text();
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }
      }
    }

    const admin = createClient(supabaseUrl, serviceKey);

    if (body.latest === true) {
      const client = userClient || admin;
      const { data, error } = await client
        .from("api_health_checks")
        .select("id, run_at, results, checked, failed")
        .order("run_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error("[sentinel] latest read error", error.message);
        return json({ error: error.message }, 500);
      }
      return json({ success: true, latest: data });
    }

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

    const { error: insertErr } = await admin.from("api_health_checks").insert({
      run_at: new Date().toISOString(),
      results: results.map((r) => ({ provider: r.provider, ok: r.ok, status: r.status, detail: r.detail })),
      checked: results.length,
      failed: failures.length,
    });
    if (insertErr) console.error("[sentinel] insert failed", insertErr.message);

    if (failures.length > 0) {
      const summary = failures
        .map((f) => `• ${f.provider} — HTTP ${f.status}: ${(f.detail || "").slice(0, 160)}`)
        .join("\n");
      const subject = `API DOWN: ${failures.map((f) => f.provider).join(", ")}`;
      try {
        const notifyRes = await fetch(`${supabaseUrl}/functions/v1/admin-notify`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            apikey: serviceKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            subject,
            body: `The daily API health check detected failures:\n\n${summary}\n\nRun timestamp: ${new Date().toISOString()}`,
            severity: "high",
            dedupe_key: "api-health-sentinel",
          }),
        });
        if (!notifyRes.ok) {
          console.error("[sentinel] admin-notify failed", notifyRes.status, (await notifyRes.text()).slice(0, 200));
        }
      } catch (e) {
        console.error("[sentinel] admin-notify error", (e as Error).message);
      }
    }

    // ============ LinkedIn data-health checks ============
    async function notify(subject: string, bodyText: string, dedupe_key: string) {
      try {
        const r = await fetch(`${supabaseUrl}/functions/v1/admin-notify`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            apikey: serviceKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ subject, body: bodyText, severity: "high", dedupe_key }),
        });
        if (!r.ok) console.error("[sentinel] datahealth notify failed", r.status, (await r.text()).slice(0, 200));
      } catch (e) {
        console.error("[sentinel] datahealth notify error", (e as Error).message);
      }
    }

    const dataHealth: Array<{ user_id: string; check: string; detail: string }> = [];
    try {
      const { data: conns } = await admin
        .from("linkedin_connections")
        .select("user_id, display_name, handle, status")
        .eq("status", "active");

      const now = Date.now();
      const staleCutoff = new Date(now - 48 * 60 * 60 * 1000);
      const dayCutoff = new Date(now - 24 * 60 * 60 * 1000).toISOString();

      for (const c of conns || []) {
        const label = c.display_name || c.handle || c.user_id;

        // Newest influence_timeline row for user
        const { data: latest } = await admin
          .from("influence_timeline")
          .select("snapshot_date, followers")
          .eq("user_id", c.user_id)
          .order("snapshot_date", { ascending: false })
          .limit(1)
          .maybeSingle();

        // CHECK 1 — Stale (or missing entirely)
        const latestDate = latest?.snapshot_date ? new Date(latest.snapshot_date as string) : null;
        if (!latestDate || latestDate < staleCutoff) {
          const ageTxt = latestDate
            ? `${Math.round((now - latestDate.getTime()) / 3.6e6)}h old (${latest?.snapshot_date})`
            : "no rows found";
          dataHealth.push({ user_id: c.user_id, check: "stale", detail: ageTxt });
          await notify(
            `LinkedIn data stale — ${label}`,
            `Newest influence_timeline row for ${label} (${c.user_id}) is ${ageTxt}.\nLinkedIn analytics lag is ~1–2 days; >48h suggests the sync is not landing rows.`,
            `datahealth:stale:${c.user_id}`,
          );
        }

        // CHECK 2 — Broken followers
        if (latest && (latest.followers === null || latest.followers === 0)) {
          dataHealth.push({ user_id: c.user_id, check: "followers_broken", detail: `followers=${latest.followers}` });
          await notify(
            `LinkedIn followers broken — ${label}`,
            `Newest influence_timeline row for ${label} (${c.user_id}) on ${latest.snapshot_date} has followers=${latest.followers}. Anchor logic likely failed to resolve.`,
            `datahealth:followers:${c.user_id}`,
          );
        }

        // CHECK 3 — Sync failing in last 24h
        const { count: failedRuns } = await admin
          .from("sync_runs")
          .select("id", { count: "exact", head: true })
          .eq("user_id", c.user_id)
          .eq("status", "failed")
          .gte("created_at", dayCutoff);

        const { count: syncErrs } = await admin
          .from("sync_errors")
          .select("id", { count: "exact", head: true })
          .eq("user_id", c.user_id)
          .gte("created_at", dayCutoff);

        if ((failedRuns || 0) > 0 || (syncErrs || 0) > 0) {
          dataHealth.push({
            user_id: c.user_id,
            check: "sync_failing",
            detail: `failed_runs=${failedRuns || 0}, errors=${syncErrs || 0}`,
          });
          await notify(
            `LinkedIn sync failing — ${label}`,
            `In the last 24h for ${label} (${c.user_id}): failed sync_runs=${failedRuns || 0}, sync_errors=${syncErrs || 0}.`,
            `datahealth:sync:${c.user_id}`,
          );
        }
      }
    } catch (e) {
      console.error("[sentinel] datahealth error", (e as Error).message);
    }

    // ============ Watchdog: cost / AI failures / cron failures ============
    const watchdog: Array<{ check: string; detail: string }> = [];
    try {
      // --- COST ---
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const dayOfMonth = now.getDate();

      let budget = 150;
      const { data: setting } = await admin
        .from("admin_settings")
        .select("value")
        .eq("key", "monthly_ai_budget_usd")
        .maybeSingle();
      const amt = (setting?.value as any)?.amount;
      if (typeof amt === "number" && amt > 0) budget = amt;

      const { data: usageRows } = await admin
        .from("ai_usage_log")
        .select("est_cost_usd, function_name")
        .gte("created_at", monthStart.toISOString());

      const spendMTD = (usageRows || []).reduce(
        (s, r) => s + (Number((r as any).est_cost_usd) || 0),
        0,
      );
      const projected = dayOfMonth > 0 ? (spendMTD / dayOfMonth) * daysInMonth : spendMTD;

      if (spendMTD >= budget || projected >= budget) {
        const byFn = new Map<string, number>();
        for (const r of usageRows || []) {
          const k = (r as any).function_name || "unknown";
          byFn.set(k, (byFn.get(k) || 0) + (Number((r as any).est_cost_usd) || 0));
        }
        const top = [...byFn.entries()].sort((a, b) => b[1] - a[1])[0];
        const topTxt = top ? `${top[0]} ($${top[1].toFixed(2)})` : "n/a";
        watchdog.push({ check: "cost", detail: `spend=$${spendMTD.toFixed(2)} projected=$${projected.toFixed(2)}` });
        await notify(
          "AI budget alert",
          `Spend MTD: $${spendMTD.toFixed(2)}\nProjected month-end: $${projected.toFixed(2)}\nBudget: $${budget.toFixed(2)}\nTop function this month: ${topTxt}`,
          "cost:budget",
        );
      }

      // --- AI FAILURES (last 24h) ---
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count: failCount } = await admin
        .from("ai_usage_log")
        .select("id", { count: "exact", head: true })
        .eq("success", false)
        .gte("created_at", dayAgo);

      if ((failCount || 0) > 10) {
        const { data: failRows } = await admin
          .from("ai_usage_log")
          .select("function_name")
          .eq("success", false)
          .gte("created_at", dayAgo);
        const byFn = new Map<string, number>();
        for (const r of failRows || []) {
          const k = (r as any).function_name || "unknown";
          byFn.set(k, (byFn.get(k) || 0) + 1);
        }
        const top = [...byFn.entries()].sort((a, b) => b[1] - a[1])[0];
        const topTxt = top ? `${top[0]} (${top[1]})` : "n/a";
        watchdog.push({ check: "ai_failures", detail: `count=${failCount}` });
        await notify(
          "AI failures spiking",
          `AI failures in last 24h: ${failCount}\nTop failing function: ${topTxt}`,
          "cost:ai-failures",
        );
      }

      // --- CRON FAILURES (last 24h) ---
      const { data: cronFails, error: cronErr } = await admin.rpc("admin_cron_failures_24h" as never);
      if (cronErr) console.error("[sentinel] cron rpc error", cronErr.message);
      if (cronFails && (cronFails as any[]).length > 0) {
        const list = (cronFails as any[])
          .map((r) => `• ${r.jobname} — ${r.failed} failure(s), last ${r.last_fail}`)
          .join("\n");
        watchdog.push({ check: "cron_failures", detail: `${(cronFails as any[]).length} job(s)` });
        await notify(
          `Cron failure(s)`,
          `Failed cron runs in last 24h:\n\n${list}`,
          "cron:failures",
        );
      }
    } catch (e) {
      console.error("[sentinel] watchdog error", (e as Error).message);
    }

    return json({
      success: true,
      checked: results.length,
      failed: failures.length,
      results: results.map((r) => ({ provider: r.provider, ok: r.ok, status: r.status })),
      data_health: dataHealth,
      watchdog,
    });
  } catch (e) {
    console.error("api-health-sentinel error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
