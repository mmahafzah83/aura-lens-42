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

// Strict rule: ok is TRUE only when HTTP status is 2xx. Any 4xx/5xx is recorded
// with the code and the first 200 chars of the response body.
async function probe(provider: string, req: () => Promise<Response>): Promise<Result> {
  try {
    const r = await req();
    const is2xx = r.status >= 200 && r.status < 300;
    let bodySnippet = "";
    if (!is2xx) {
      try { bodySnippet = (await r.text()).slice(0, 200); } catch { /* ignore */ }
    }
    return { provider, ok: is2xx, status: r.status, detail: is2xx ? "" : bodySnippet };
  } catch (e) {
    return { provider, ok: false, status: 0, detail: (e as Error).message };
  }
}

const checkOpenAI = (key: string) => probe("openai", () => fetch("https://api.openai.com/v1/embeddings", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({ model: "text-embedding-3-small", input: "ping" }),
}));

const checkAnthropic = (key: string) => probe("anthropic", () => fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
  body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: 1, messages: [{ role: "user", content: "hi" }] }),
}));

const checkPerplexity = (key: string) => probe("perplexity", () => fetch("https://api.perplexity.ai/chat/completions", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({ model: "sonar", max_tokens: 16, messages: [{ role: "user", content: "hi" }] }),
}));

// NOTE: Resend reachability is intentionally NOT probed here.
// Send-only API keys return 401 on GET /emails by design, which produced a
// permanent false-critical alert. Email health is judged by OUTCOME via the
// `email.crons_ran_nothing_sent` check in aura-health-audit, which fires only
// if cron jobs ran in the last 24h and lifecycle_email_log gained zero rows.

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

    const raisedKeys = new Set<string>();

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

    const results = await Promise.all([
      checkOpenAI(OPENAI),
      checkAnthropic(ANTHROPIC),
      checkPerplexity(PERPLEXITY),
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
      const FEATURE: Record<string, string> = {
        anthropic: "writing your Brand Assessments and LinkedIn posts",
        openai: "understanding and filing your captures",
        perplexity: "finding fresh articles and industry trends",
      };
      const STATUS_PAGE: Record<string, string> = {
        anthropic: "https://status.anthropic.com",
        openai: "https://status.openai.com",
        perplexity: "https://status.perplexity.com",
      };
      const KEY_NAME: Record<string, string> = {
        anthropic: "ANTHROPIC_API_KEY",
        openai: "OPENAI_API_KEY",
        perplexity: "PERPLEXITY_API_KEY",
      };

      // Read the two previous runs (before this one was inserted, current insert is rows[0] if included)
      const { data: recentRows } = await admin
        .from("api_health_checks")
        .select("results, run_at")
        .order("run_at", { ascending: false })
        .limit(3);
      const rows = recentRows || [];
      // rows[0] is current run (just inserted). previous two:
      const prev1 = rows[1];
      const prev2 = rows[2];
      const wasFailingIn = (row: any, provider: string): boolean => {
        if (!row || !Array.isArray(row.results)) return false; // missing = was OK
        const entry = row.results.find((x: any) => x.provider === provider);
        return !!entry && entry.ok === false;
      };

      type Klass = "key" | "down" | "transient";
      const classified = failures.map((f) => {
        let klass: Klass;
        if (f.status === 401 || f.status === 403) klass = "key";
        else if (wasFailingIn(prev1, f.provider) && wasFailingIn(prev2, f.provider)) klass = "down";
        else klass = "transient";
        return { provider: f.provider, klass };
      });

      const actionable = classified.filter((c) => c.klass !== "transient");
      if (actionable.some((c) => c.klass === "down")) raisedKeys.add("api-health:down");
      if (actionable.some((c) => c.klass === "key")) raisedKeys.add("api-health:key");
      console.log(
        `[sentinel] api failures classified:`,
        classified.map((c) => `${c.provider}:${c.klass}`).join(", "),
      );

      if (actionable.length > 0) {
        const hasDown = actionable.some((a) => a.klass === "down");
        const overallClass: "down" | "key" = hasDown ? "down" : "key";
        const severity: "critical" | "high" = hasDown ? "critical" : "high";
        const subject =
          overallClass === "down"
            ? "⚠️ Aura: a service is down — action needed"
            : "🔑 Aura: an API key needs a look";

        const intro =
          overallClass === "down"
            ? "One or more services have been failing for three checks in a row. Here's what's affected and what to do:"
            : "An API key looks rejected. Here's what's affected and what to do:";

        const blocks = actionable.map((a) => {
          const feat = FEATURE[a.provider] || "part of Aura";
          if (a.klass === "key") {
            return `${a.provider}\nThis affects: ${feat}\n👉 What to do: Open Lovable → Cloud → Secrets and check/replace ${KEY_NAME[a.provider]} (it may have expired or run out of credit).`;
          }
          return `${a.provider}\nThis affects: ${feat}\n👉 What to do: Check ${STATUS_PAGE[a.provider]} — if they report an outage, just wait. If they're green, check ${KEY_NAME[a.provider]} in Lovable → Cloud → Secrets.`;
        });

        const bodyText = `${intro}\n\n${blocks.join("\n\n")}`;
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
              body: bodyText,
              severity,
              dedupe_key: `api-health:${overallClass}`,
              what: overallClass === "down" ? "A service Aura depends on has been failing for the last hour." : "An API key looks rejected.",
              impact: overallClass === "down" ? "The affected features may be down until it recovers." : "The affected feature is failing until the key is fixed.",
              action: overallClass === "down" ? "Check the provider's status page; if they report an outage, wait it out. If green, check the key in Lovable → Cloud → Secrets." : "Open Lovable → Cloud → Secrets and check or replace the affected API key.",
            }),
          });
          if (!notifyRes.ok) {
            console.error("[sentinel] admin-notify failed", notifyRes.status, (await notifyRes.text()).slice(0, 200));
          }
        } catch (e) {
          console.error("[sentinel] admin-notify error", (e as Error).message);
        }
      }
    }

    // ============ LinkedIn data-health checks ============
    async function notify(
      subject: string,
      bodyText: string,
      dedupe_key: string,
      severity: "critical" | "high" | "info" = "high",
      card?: { what?: string; impact?: string; action?: string },
    ) {
      raisedKeys.add(dedupe_key);
      try {
        const r = await fetch(`${supabaseUrl}/functions/v1/admin-notify`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            apikey: serviceKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            subject,
            body: bodyText,
            severity,
            dedupe_key,
            ...(card?.what ? { what: card.what } : {}),
            ...(card?.impact ? { impact: card.impact } : {}),
            ...(card?.action ? { action: card.action } : {}),
          }),
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
      const staleCutoff = new Date(now - 72 * 60 * 60 * 1000); // LinkedIn analytics lag 1-2 days
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

        // Anchor check — has this user ever had followers > 0?
        const { data: anchor } = await admin
          .from("influence_timeline")
          .select("snapshot_date")
          .eq("user_id", c.user_id)
          .gt("followers", 0)
          .limit(1)
          .maybeSingle();
        const anchorExists = !!anchor;

        const latestDate = latest?.snapshot_date ? new Date(latest.snapshot_date as string) : null;
        const stale = !latestDate || latestDate < staleCutoff;
        const brokenFollowers = !latest || latest.followers === null || latest.followers === 0;

        if (!anchorExists) {
          // COLLECTING — new user, no anchor yet. Info-only (no email).
          dataHealth.push({ user_id: c.user_id, check: "collecting", detail: "no follower anchor yet" });
          await notify(
            `LinkedIn collecting — ${label}`,
            `${label} (${c.user_id}) is new: no influence_timeline row with followers>0 yet. Expected while first sync fills in.`,
            `datahealth:collecting:${c.user_id}`,
            "info",
            {
              what: `${label}'s LinkedIn analytics are still filling in.`,
              impact: "Their numbers look blank until the first sync completes — normal for a new connection.",
              action: "No action needed; it clears itself once LinkedIn returns data.",
            },
          );
        } else if (stale || brokenFollowers) {
          // BEHIND — had data, now stale or dropped to null/0. Actionable.
          const ageTxt = latestDate
            ? `${Math.round((now - latestDate.getTime()) / 3.6e6)}h old (${latest?.snapshot_date})`
            : "no recent rows";
          const detail = stale
            ? `latest is ${ageTxt}`
            : `latest ${latest?.snapshot_date} has followers=${latest?.followers}`;
          dataHealth.push({ user_id: c.user_id, check: "behind", detail });
          await notify(
            `LinkedIn data behind — ${label}`,
            `${label} (${c.user_id}) had follower data but is now behind: ${detail}.\nLinkedIn analytics lag ~1–2 days; >72h means the sync is not landing.`,
            `datahealth:behind:${c.user_id}`,
            "high",
            {
              what: `${label}'s LinkedIn analytics have gone stale.`,
              impact: "Their dashboard is showing numbers more than 3 days old.",
              action: `Re-run linkedin-metrics-sync for ${label}, or check sync_errors.`,
            },
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
            "high",
            {
              what: `${label}'s LinkedIn sync is failing.`,
              impact: "Their metrics won't update until it's fixed.",
              action: `Check sync_errors for ${label} and re-run the sync.`,
            },
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

      const pctBudget = budget > 0 ? (spendMTD / budget) * 100 : 0;
      const projectedPct = budget > 0 ? (projected / budget) * 100 : 0;
      const worstPct = Math.max(pctBudget, projectedPct);
      if (worstPct >= 80) {
        const byFn = new Map<string, number>();
        for (const r of usageRows || []) {
          const k = (r as any).function_name || "unknown";
          byFn.set(k, (byFn.get(k) || 0) + (Number((r as any).est_cost_usd) || 0));
        }
        const top = [...byFn.entries()].sort((a, b) => b[1] - a[1])[0];
        const topTxt = top ? `${top[0]} ($${top[1].toFixed(2)})` : "n/a";
        watchdog.push({ check: "cost", detail: `spend=$${spendMTD.toFixed(2)} projected=$${projected.toFixed(2)}` });
        const costSeverity: "high" | "info" = worstPct >= 100 ? "high" : "info";
        await notify(
          "AI budget alert",
          `Spend MTD: $${spendMTD.toFixed(2)} (${Math.round(pctBudget)}%)\nProjected month-end: $${projected.toFixed(2)} (${Math.round(projectedPct)}%)\nBudget: $${budget.toFixed(2)}\nTop function this month: ${topTxt}`,
          "cost:budget",
          costSeverity,
          {
            what: "AI spending is running high this month.",
            impact: `On track to reach about ${Math.round(worstPct)}% of your $${budget.toFixed(0)} budget.`,
            action: `Review the top spender in /admin/cost and cap or optimize it (top: ${topTxt}).`,
          },
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
          "high",
          {
            what: `AI calls are failing more than usual (${failCount} in 24h).`,
            impact: "Some AI features may be intermittently broken for users.",
            action: `Check /admin/cost and provider status — top failing: ${topTxt}.`,
          },
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
          "high",
          {
            what: `${(cronFails as any[]).length} scheduled job(s) failed in the last day.`,
            impact: "Whatever they do — syncs, scoring, emails — did not run.",
            action: "Open /admin/crons and re-run the failed jobs.",
          },
        );
      }

      // --- CRON HTTP FAILURES (last 90m) ---
      // cron.job_run_details reports 'succeeded' when the HTTP request is SENT,
      // so 401/500 responses from edge functions are invisible there. Inspect
      // net._http_response directly to catch silent failures.
      const { data: httpFails, error: httpErr } = await admin.rpc(
        "recent_cron_http_failures" as never,
        { p_minutes: 90 },
      );
      if (httpErr) console.error("[sentinel] http failures rpc error", httpErr.message);
      if (httpFails && (httpFails as any[]).length > 0) {
        const rows = httpFails as Array<{ status_code: number | null; failures: number; sample_error: string | null }>;
        const total = rows.reduce((s, r) => s + Number(r.failures || 0), 0);
        const list = rows
          .map((r) => `• HTTP ${r.status_code ?? "null"} × ${r.failures} — ${(r.sample_error || "").slice(0, 200)}`)
          .join("\n");
        watchdog.push({ check: "cron_http_failures", detail: `${total} response(s) across ${rows.length} status code(s)` });
        await notify(
          "Cron HTTP failures",
          `Cron scheduler sent requests but got failing responses in the last 90m (cron.job_run_details would mark these as 'succeeded'):\n\n${list}`,
          "cron:http-failure",
          "high",
          {
            what: "A scheduled job got a real failing response.",
            impact: "That job may not have completed its work.",
            action: "Check /admin/crons and the function logs for the failing status code.",
          },
        );
      }
    } catch (e) {
      console.error("[sentinel] watchdog error", (e as Error).message);
    }

    // ============ EF error sink (last 65 minutes) ============
    const efSummary: {
      errors_seen: number;
      alerts_raised: number;
      by_function: Array<{ function_name: string; severity: string; count: number }>;
    } = { errors_seen: 0, alerts_raised: 0, by_function: [] };

    // ============ Pipeline heartbeats (silent stall detection) ============
    const pipelines: {
      scoring_fresh: { newest: string | null; age_hours: number | null; severity: "high" | "ok" };
      onboarding_degraded: { total: number; degraded: number; breakdown: Record<string, number>; severity: "info" | "ok" };
      capture_unprocessed: { count: number; oldest_age_hours: number | null; distinct_users: number; severity: "high" | "ok" };
    } = {
      scoring_fresh: { newest: null, age_hours: null, severity: "ok" },
      onboarding_degraded: { total: 0, degraded: 0, breakdown: {}, severity: "ok" },
      capture_unprocessed: { count: 0, oldest_age_hours: null, distinct_users: 0, severity: "ok" },
    };
    try {
      const now = Date.now();
      // 1) SCORING freshness
      const { data: newestScore } = await admin
        .from("score_snapshots")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const newestTs = newestScore?.created_at ? new Date(newestScore.created_at as string).getTime() : null;
      const ageH = newestTs ? Math.round((now - newestTs) / 3.6e6) : null;
      pipelines.scoring_fresh.newest = (newestScore?.created_at as string) || null;
      pipelines.scoring_fresh.age_hours = ageH;
      if (!newestTs || (ageH ?? 0) > 26) {
        pipelines.scoring_fresh.severity = "high";
        await notify(
          "Scoring stale",
          `Newest score_snapshots row: ${pipelines.scoring_fresh.newest ?? "none"} (${ageH ?? "n/a"}h old).\nThreshold is 26h — the daily scoring cron did not produce output.`,
          "pipeline:scoring-stale",
          "high",
          {
            what: "The daily scoring run has not produced fresh numbers.",
            impact: "Everyone's Imprint may be stuck on yesterday's value.",
            action: "Check calculate-aura-score / compute-imprint — the scoring cron did not complete.",
          },
        );
      }

      // 3) ONBOARDING degradation (last 24h)
      const dayAgoIso = new Date(now - 24 * 60 * 60 * 1000).toISOString();
      const { data: obRows } = await admin
        .from("onboarding_article_log")
        .select("outcome")
        .gte("created_at", dayAgoIso);
      const breakdown: Record<string, number> = {};
      let degraded = 0;
      for (const r of obRows || []) {
        const o = String((r as any).outcome || "none");
        breakdown[o] = (breakdown[o] || 0) + 1;
        if (o !== "perplexity") degraded += 1;
      }
      pipelines.onboarding_degraded.total = (obRows || []).length;
      pipelines.onboarding_degraded.degraded = degraded;
      pipelines.onboarding_degraded.breakdown = breakdown;
      if (degraded > 0) {
        pipelines.onboarding_degraded.severity = "info";
        const breakdownTxt = Object.entries(breakdown)
          .map(([k, v]) => `${k}=${v}`)
          .join(", ");
        await notify(
          "Onboarding using fallback path",
          `Onboarding article discovery in last 24h — total=${pipelines.onboarding_degraded.total}, degraded=${degraded}.\nBreakdown: ${breakdownTxt}\n(perplexity is the healthy primary path; anything else is degraded. Hard failures alert separately via ef_error_log.)`,
          "pipeline:onboarding-fallback",
          "info",
          {
            what: "Onboarding used a backup path to find a new user's first article.",
            impact: "New users still got an article, just not from the primary source.",
            action: "Usually harmless. If it repeats, check the Perplexity API.",
          },
        );
      }

      // 4) CAPTURE UNPROCESSED — entries older than 30m without a processed source_registry row.
      // Uses source_registry.processed (the real per-capture outcome set by extract-evidence),
      // so legitimate empty extractions (processed=true, fragment_count=0) don't fire.
      const thirtyMinAgoIso = new Date(now - 30 * 60 * 1000).toISOString();
      const windowStartIso = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: recentEntries } = await admin
        .from("entries")
        .select("id, user_id, created_at, extract_attempts")
        .lt("created_at", thirtyMinAgoIso)
        .gte("created_at", windowStartIso)
        .gte("extract_attempts", 3);
      const entryList = (recentEntries || []) as Array<{ id: string; user_id: string; created_at: string }>;
      if (entryList.length > 0) {
        const ids = entryList.map((e) => e.id);
        const { data: regRows } = await admin
          .from("source_registry")
          .select("source_id")
          .eq("source_type", "entry")
          .eq("processed", true)
          .in("source_id", ids);
        const processedSet = new Set((regRows || []).map((r: any) => r.source_id as string));
        const unprocessed = entryList.filter((e) => !processedSet.has(e.id));
        if (unprocessed.length > 0) {
          const oldestTs = unprocessed.reduce(
            (m, e) => Math.min(m, new Date(e.created_at).getTime()),
            Number.POSITIVE_INFINITY,
          );
          const oldestAgeH = Math.round((now - oldestTs) / 3.6e6);
          const distinctUsers = new Set(unprocessed.map((e) => e.user_id)).size;
          pipelines.capture_unprocessed = {
            count: unprocessed.length,
            oldest_age_hours: oldestAgeH,
            distinct_users: distinctUsers,
            severity: "high",
          };
          await notify(
            "Capture stuck — unprocessed entries",
            `${unprocessed.length} entr${unprocessed.length === 1 ? "y" : "ies"} older than 30m have no processed source_registry row.\nOldest: ${oldestAgeH}h old · distinct users: ${distinctUsers}.\nThis means extract-evidence is not completing (or never fired) for the capture→signal chain.`,
            "pipeline:capture-unprocessed",
            "high",
            {
              what: `${unprocessed.length} capture(s) are stuck without being processed.`,
              impact: "Those users' captures are not turning into signals.",
              action: "Check extract-evidence and re-run for the stuck entries.",
            },
          );
        }
      }
    } catch (e) {
      console.error("[sentinel] pipelines error", (e as Error).message);
    }

    // ============ Journey heartbeats (did the user get what they came for?) ============
    const journey: Record<string, any> = {};
    try {
      const nowMs = Date.now();
      const dayAgoIso = new Date(nowMs - 24 * 3600_000).toISOString();
      const halfHourAgoIso = new Date(nowMs - 30 * 60_000).toISOString();
      const twoDaysAgoIso = new Date(nowMs - 48 * 3600_000).toISOString();

      // A) fragments -> signal (the chain that broke)
      const { count: fragCount } = await admin
        .from("evidence_fragments")
        .select("id", { count: "exact", head: true })
        .gte("created_at", dayAgoIso)
        .lt("created_at", halfHourAgoIso);
      const { count: sigNew } = await admin
        .from("strategic_signals")
        .select("id", { count: "exact", head: true })
        .gte("created_at", dayAgoIso);
      const { count: sigTouched } = await admin
        .from("strategic_signals")
        .select("id", { count: "exact", head: true })
        .gte("updated_at", dayAgoIso);
      journey.signal_conversion = {
        fragments: fragCount || 0, signals_created: sigNew || 0, signals_updated: sigTouched || 0,
      };
      if ((fragCount || 0) >= 3 && (sigNew || 0) === 0 && (sigTouched || 0) === 0) {
        await notify(
          "Signals not being created",
          `${fragCount} evidence fragments were extracted in the last 24h, but zero signals were created or reinforced.\nThe capture -> signal chain is broken.`,
          "journey:signal-conversion",
          "critical",
          {
            what: "People are capturing, but nobody is getting a signal.",
            impact: "Every user who captures right now gets silence — this is the moment Aura is supposed to prove itself.",
            action: "Check detect-signals-v2 (and any trigger on strategic_signals). Re-run detection for affected users once fixed.",
          },
        );
      }

      // B) onboarded -> first capture (activation)
      const { data: oldProfiles } = await admin
        .from("diagnostic_profiles")
        .select("user_id")
        .lt("created_at", twoDaysAgoIso);
      const { data: entryUsers } = await admin.from("entries").select("user_id");
      const captured = new Set((entryUsers || []).map((r: any) => r.user_id));
      const neverCaptured = (oldProfiles || []).filter((p: any) => !captured.has(p.user_id));
      journey.never_captured = neverCaptured.length;
      if (neverCaptured.length > 0) {
        await notify(
          "Users onboarded but never captured",
          `${neverCaptured.length} user(s) finished onboarding more than 48h ago and have never captured anything.`,
          "journey:activation",
          "high",
          {
            what: `${neverCaptured.length} user(s) signed up, set up their profile, and then stopped.`,
            impact: "They will never see a signal, so they have no reason to come back.",
            action: "Open /admin/people, pick the newest one, and send a personal message with one article worth saving.",
          },
        );
      }
    } catch (e) {
      console.error("[sentinel] journey error", (e as Error).message);
    }

    try {
      const SELF_LOOP = new Set(["api-health-sentinel", "admin-notify", "admin-digest"]);
      const since = new Date(Date.now() - 65 * 60 * 1000).toISOString();
      const { data: efRows, error: efErr } = await admin
        .from("ef_error_log")
        .select("function_name, severity, error_message, created_at")
        .gte("created_at", since);
      if (efErr) console.error("[sentinel] ef_error_log read error", efErr.message);

      const groups = new Map<
        string,
        { function_name: string; severity: string; count: number; sample: string }
      >();
      for (const r of efRows || []) {
        const fn = (r as any).function_name || "unknown";
        const sev = String((r as any).severity || "high").toLowerCase();
        const key = `${fn}::${sev}`;
        const g = groups.get(key) || { function_name: fn, severity: sev, count: 0, sample: "" };
        g.count += 1;
        if (!g.sample) g.sample = String((r as any).error_message || "").slice(0, 200);
        groups.set(key, g);
      }

      efSummary.errors_seen = (efRows || []).length;
      efSummary.by_function = [...groups.values()].map((g) => ({
        function_name: g.function_name,
        severity: g.severity,
        count: g.count,
      }));

      // Per-function totals across severities for burst detection
      const perFn = new Map<string, number>();
      for (const g of groups.values()) {
        perFn.set(g.function_name, (perFn.get(g.function_name) || 0) + g.count);
      }

      const burstAlerted = new Set<string>();

      for (const g of groups.values()) {
        if (SELF_LOOP.has(g.function_name)) continue;
        const total = perFn.get(g.function_name) || 0;

        const sev = String(g.severity || "").toLowerCase();

        if (sev === "critical") {
          await notify(
            `EF critical — ${g.function_name}`,
            `Function ${g.function_name} logged ${g.count} critical error(s) in the last 65m.\nSample: ${g.sample}`,
            `ef:critical:${g.function_name}`,
            "critical",
            {
              what: `${g.function_name} threw a critical error.`,
              impact: "That function is failing for users right now.",
              action: `Check ef_error_log and the logs for ${g.function_name}.`,
            },
          );
          efSummary.alerts_raised += 1;
          continue;
        }

        if (total >= 5 && !burstAlerted.has(g.function_name)) {
          burstAlerted.add(g.function_name);
          await notify(
            `EF burst — ${g.function_name}`,
            `Function ${g.function_name} logged ${total} error(s) in the last 65m.\nSample: ${g.sample}`,
            `ef:burst:${g.function_name}`,
            "high",
            {
              what: `${g.function_name} is erroring repeatedly (${total} in the last hour).`,
              impact: "It is likely broken for multiple users.",
              action: `Check ef_error_log for ${g.function_name}.`,
            },
          );
          efSummary.alerts_raised += 1;
          continue;
        }

        if (sev === "info" || sev === "low") {
          // digest sweeps, no email
          continue;
        }

        // Default fail-loud: 'high', legacy 'error', or any unknown severity.
        await notify(
          `EF ${sev || "unknown"} — ${g.function_name}`,
          `Function ${g.function_name} logged ${g.count} ${sev || "unknown"}-severity error(s) in the last 65m.\nSample: ${g.sample}`,
          `ef:high:${g.function_name}`,
          "high",
          {
            what: `${g.function_name} logged ${g.count} error(s) in the last hour.`,
            impact: "Some users may be hitting failures in that feature.",
            action: `Check ef_error_log for ${g.function_name}.`,
          },
        );
        efSummary.alerts_raised += 1;
      }
    } catch (e) {
      console.error("[sentinel] ef sink error", (e as Error).message);
    }

    let autoResolved = 0;
    try {
      const SENTINEL_PREFIXES = ["api-health:", "datahealth:", "cost:", "cron:", "pipeline:", "ef:", "journey:"];
      const { data: openAlerts } = await admin
        .from("ops_alerts")
        .select("source")
        .eq("status", "open");
      const stale = [...new Set(
        (openAlerts || [])
          .map((r: any) => r.source as string)
          .filter((s) => s && SENTINEL_PREFIXES.some((p) => s.startsWith(p)) && !raisedKeys.has(s)),
      )];
      if (stale.length > 0) {
        const { data: closed } = await admin
          .from("ops_alerts")
          .update({ status: "resolved", resolved_at: new Date().toISOString() })
          .in("source", stale)
          .eq("status", "open")
          .select("id");
        autoResolved = (closed || []).length;
        console.log(`[sentinel] auto-resolved ${autoResolved} recovered alert(s):`, stale.join(", "));
      }
    } catch (e) {
      console.error("[sentinel] auto-resolve error", (e as Error).message);
    }

    return json({
      success: true,
      checked: results.length,
      failed: failures.length,
      results: results.map((r) => ({ provider: r.provider, ok: r.ok, status: r.status })),
      data_health: dataHealth,
      watchdog,
      ef_errors: efSummary,
      pipelines,
      journey,
      auto_resolved: autoResolved,
    });
  } catch (e) {
    console.error("api-health-sentinel error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
