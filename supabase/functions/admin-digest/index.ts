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

function esc(s: string) {
  return String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const CRON_SECRET = Deno.env.get("cron_secret") || Deno.env.get("CRON_SECRET") || "";

    const bearer = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const apiKeyHeader = req.headers.get("apikey") || "";
    const cronHeader = req.headers.get("x-cron-secret") || "";
    const isServiceRole = !!bearer && (bearer === serviceKey || apiKeyHeader === serviceKey);
    const isCron = !!CRON_SECRET && cronHeader === CRON_SECRET;
    if (!isServiceRole && !isCron) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth = now.getDate();
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // ===== COST =====
    let budget = 150;
    const { data: setting } = await admin
      .from("admin_settings")
      .select("value")
      .eq("key", "monthly_ai_budget_usd")
      .maybeSingle();
    const amt = (setting?.value as any)?.amount;
    if (typeof amt === "number" && amt > 0) budget = amt;

    const { data: usageMonth } = await admin
      .from("ai_usage_log")
      .select("est_cost_usd, function_name, success")
      .gte("created_at", monthStart.toISOString());

    const spendMTD = (usageMonth || []).reduce((s, r) => s + (Number((r as any).est_cost_usd) || 0), 0);
    const projected = dayOfMonth > 0 ? (spendMTD / dayOfMonth) * daysInMonth : spendMTD;
    const pctBudget = budget > 0 ? Math.round((spendMTD / budget) * 100) : 0;

    const byFn = new Map<string, number>();
    for (const r of usageMonth || []) {
      const k = (r as any).function_name || "unknown";
      byFn.set(k, (byFn.get(k) || 0) + (Number((r as any).est_cost_usd) || 0));
    }
    const top3 = [...byFn.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

    const total24 = (usageMonth || []).length;
    const { count: total24hCount } = await admin
      .from("ai_usage_log")
      .select("id", { count: "exact", head: true })
      .gte("created_at", dayAgo);
    const { count: fail24hCount } = await admin
      .from("ai_usage_log")
      .select("id", { count: "exact", head: true })
      .eq("success", false)
      .gte("created_at", dayAgo);
    const successRate =
      total24hCount && total24hCount > 0
        ? Math.round((1 - (fail24hCount || 0) / total24hCount) * 100)
        : null;

    // ===== API HEALTH =====
    const { data: apiLatest } = await admin
      .from("api_health_checks")
      .select("run_at, results, checked, failed")
      .order("run_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const providerRows = ((apiLatest?.results as any[]) || [])
      .map((r) => `${esc(r.provider)}: ${r.ok ? "✅" : `❌ (${r.status})`}`)
      .join(" · ");

    // ===== LINKEDIN DATA =====
    const { data: conns } = await admin
      .from("linkedin_connections")
      .select("user_id, display_name, handle")
      .eq("status", "active");
    const staleCutoff = Date.now() - 72 * 60 * 60 * 1000; // LinkedIn analytics lag 1-2 days
    let upToDate = 0, behind = 0, collecting = 0;
    const behindNames: string[] = [];
    const collectingNames: string[] = [];
    for (const c of conns || []) {
      const label = c.display_name || c.handle || c.user_id;
      const { data: latest } = await admin
        .from("influence_timeline")
        .select("snapshot_date, followers")
        .eq("user_id", c.user_id)
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data: anchor } = await admin
        .from("influence_timeline")
        .select("snapshot_date")
        .eq("user_id", c.user_id)
        .gt("followers", 0)
        .limit(1)
        .maybeSingle();
      const anchorExists = !!anchor;
      if (!anchorExists) {
        collecting++;
        collectingNames.push(label);
        continue;
      }
      const d = latest?.snapshot_date ? new Date(latest.snapshot_date as string).getTime() : 0;
      const stale = !d || d < staleCutoff;
      const brokenFollowers = !latest || latest.followers === null || latest.followers === 0;
      if (stale || brokenFollowers) {
        behind++;
        behindNames.push(label);
      } else {
        upToDate++;
      }
    }

    // ===== CRONS =====
    const { data: cronFails } = await admin.rpc("admin_cron_failures_24h" as never);
    const failedList = (cronFails as any[]) || [];
    const totalFailed = failedList.reduce((s, r) => s + (r.failed || 0), 0);
    // Total jobs run in last 24h via SECURITY DEFINER helper if present; else use cron.job count as proxy
    const { data: totalRuns } = await admin.rpc("admin_cron_runs_24h" as never).then(
      (r) => r,
      () => ({ data: null } as any),
    );
    const totalRunsCount = typeof totalRuns === "number" ? totalRuns : null;

    // ===== GROWTH =====
    const { count: newProfiles } = await admin
      .from("diagnostic_profiles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", dayAgo);

    const { data: activeRows } = await admin
      .from("ai_usage_log")
      .select("user_id")
      .gte("created_at", dayAgo);
    const activeUsers = new Set((activeRows || []).map((r: any) => r.user_id).filter(Boolean)).size;

    // ===== VERDICT =====
    const anyApiFailed = !!(apiLatest && (apiLatest.failed || 0) > 0);
    const cronFailCount = failedList.length;
    const aiFail24 = fail24hCount || 0;
    const attentionFlags = [
      pctBudget >= 80,
      anyApiFailed,
      cronFailCount > 0,
      behind > 0,
      aiFail24 > 10,
    ];
    const attentionCount = attentionFlags.filter(Boolean).length;
    const critical = anyApiFailed || cronFailCount > 0 || pctBudget >= 100;
    let verdictHtml: string;
    if (attentionCount === 0) {
      verdictHtml = `<div style="background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;padding:14px 16px;border-radius:8px;font-weight:600">🟢 All systems healthy — nothing needs you today.</div>`;
    } else if (critical) {
      verdictHtml = `<div style="background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:14px 16px;border-radius:8px;font-weight:600">🔴 ${attentionCount} item${attentionCount === 1 ? "" : "s"} need attention</div>`;
    } else {
      verdictHtml = `<div style="background:#fffbeb;border:1px solid #fde68a;color:#92400e;padding:14px 16px;border-radius:8px;font-weight:600">🟡 ${attentionCount} item${attentionCount === 1 ? "" : "s"} to review</div>`;
    }

    // ===== BUILD HTML =====
    const pill = (ok: boolean) =>
      ok
        ? `<span style="display:inline-block;background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:600;vertical-align:middle">✅ OK</span>`
        : `<span style="display:inline-block;background:#fef3c7;color:#92400e;border:1px solid #fde68a;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:600;vertical-align:middle">⚠️ Needs attention</span>`;
    const meaning = (t: string) =>
      `<div style="color:#6b7280;font-style:italic;font-size:13px;margin:4px 0 8px">${t}</div>`;
    const action = (t: string) =>
      `<div style="margin-top:8px;color:#7c2d12;font-size:13px">→ ${t}</div>`;
    const sectionTitle = (emoji: string, name: string, ok: boolean) =>
      `<div style="display:flex;align-items:center;justify-content:space-between;margin-top:22px;margin-bottom:2px"><h3 style="margin:0;font-size:16px">${emoji} ${name}</h3>${pill(ok)}</div>`;

    // Cost section
    const costOk = pctBudget < 80 && aiFail24 <= 10;
    const top3Html = top3.length
      ? top3.map(([fn, v]) => `<li>${esc(fn)} — $${v.toFixed(2)}</li>`).join("")
      : "<li><em>no usage</em></li>";
    const costAction =
      pctBudget >= 100
        ? action("Over budget. Review top spenders and cap or optimize prompts.")
        : pctBudget >= 80
          ? action("Tracking above 80% of budget. Review top spenders before month-end.")
          : aiFail24 > 10
            ? action(`${aiFail24} AI calls failed in 24h. Check /admin/cost and provider status.`)
            : "";

    // API section
    const apiOk = !anyApiFailed && !!apiLatest;
    const apiAction = anyApiFailed
      ? action("One or more providers failed. Check API health page and rotate keys if needed.")
      : !apiLatest
        ? action("No health check has run yet. Verify the sentinel cron is active.")
        : "";

    // LinkedIn section
    const liOk = behind === 0;
    const behindHtml = behindNames.length
      ? `<div style="margin-top:6px">Behind: <strong>${esc(behindNames.join(", "))}</strong></div>`
      : "";
    const collectingHtml = collectingNames.length
      ? `<div style="color:#6b7280;font-size:13px;margin-top:2px">Collecting (new, filling in): ${esc(collectingNames.join(", "))}</div>`
      : "";
    const liAction = behind > 0
      ? action("Run linkedin-metrics-sync for affected users, or check sync_errors.")
      : "";

    // Cron section
    const cronOk = cronFailCount === 0;
    const cronHtml = failedList.length
      ? failedList.map((r: any) => `<li>${esc(r.jobname)} — ${r.failed} failure(s)${r.last_fail ? ` · last ${esc(String(r.last_fail))}` : ""}</li>`).join("")
      : "<li>All green ✅</li>";
    const cronAction = cronFailCount > 0
      ? action("Open /admin/crons and re-run failed jobs; check edge-function logs.")
      : "";

    // Growth — informational, always OK
    const growthOk = true;

    const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;max-width:640px;margin:0 auto;color:#111;line-height:1.5;padding:8px">
  <h2 style="margin:0 0 4px;font-size:20px">Aura — Daily Admin Digest</h2>
  <div style="color:#6b7280;font-size:12px;margin-bottom:14px">${esc(todayStr)}</div>

  ${verdictHtml}

  ${sectionTitle("💸", "Cost", costOk)}
  ${meaning("What Aura spent on AI this month.")}
  <div>Spend MTD: <strong>$${spendMTD.toFixed(2)}</strong> of <strong>$${budget.toFixed(2)}</strong> budget (<strong>${pctBudget}%</strong>)</div>
  <div style="color:#374151">At this pace, ~<strong>$${projected.toFixed(2)}</strong> by month-end.</div>
  <div style="margin-top:4px">24h AI calls: <strong>${total24hCount || 0}</strong> · failed: <strong>${aiFail24}</strong> · success rate: <strong>${successRate === null ? "n/a" : successRate + "%"}</strong></div>
  <div style="margin-top:6px;font-size:13px;color:#374151">Top 3 spenders this month:</div>
  <ol style="margin:2px 0 0 20px;font-size:13px">${top3Html}</ol>
  ${costAction}

  ${sectionTitle("🩺", "API Health", apiOk)}
  ${meaning("Are the AI providers responding right now?")}
  <div>${apiLatest ? `${providerRows} — <strong>${apiLatest.checked}</strong> checked, <strong>${apiLatest.failed}</strong> failed` : "No runs yet."}</div>
  ${apiLatest ? `<div style="color:#6b7280;font-size:12px">Last checked ${esc(String(apiLatest.run_at))}</div>` : ""}
  ${apiAction}

  ${sectionTitle("🔗", "LinkedIn Data", liOk)}
  ${meaning("Is each user's analytics current? (LinkedIn lags 1–2 days.)")}
  <div>Active users: <strong>${(conns || []).length}</strong> · up to date: <strong>${upToDate}</strong> · collecting: <strong>${collecting}</strong> · behind: <strong>${behind}</strong></div>
  ${behindHtml}
  ${collectingHtml}
  ${liAction}

  ${sectionTitle("⏰", "Background Jobs", cronOk)}
  ${meaning("Scheduled syncs — all should run daily.")}
  <div>Failed jobs (24h): <strong>${cronFailCount}</strong> · total failures: <strong>${totalFailed}</strong>${totalRunsCount !== null ? ` · total runs: <strong>${totalRunsCount}</strong>` : ""}</div>
  <ul style="margin:4px 0 0 20px;font-size:13px">${cronHtml}</ul>
  ${cronAction}

  ${sectionTitle("📈", "Growth", growthOk)}
  ${meaning("New signups + who used Aura in 24h.")}
  <div>New profiles: <strong>${newProfiles || 0}</strong> · Active users: <strong>${activeUsers}</strong></div>

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:22px 0 10px" />
  <div style="color:#6b7280;font-size:12px;line-height:1.6">
    <strong>Legend:</strong> <em>Collecting</em> = new user, no follower total yet (expected).
    <em>Behind</em> = we have a baseline but the latest snapshot is &gt;72h old or missing followers.
    <em>MTD</em> = month-to-date spend. <em>Projected</em> = extrapolated month-end at current pace.
  </div>
</div>`.trim();

    // ===== SEND via admin-notify =====
    const dedupe_key = `admin-digest:${todayStr}`;
    const subject = `Aura Daily Digest — ${todayStr}`;
    const notifyRes = await fetch(`${supabaseUrl}/functions/v1/admin-notify`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject,
        body: html,
        severity: "info",
        dedupe_key,
        html: true,
        force_email: true,
      }),
    });
    const notifyBody = await notifyRes.json().catch(() => ({}));

    return json({ success: true, sent: notifyRes.ok, notify: notifyBody, stats: {
      spendMTD, projected, budget, fresh, stale, followersBroken: followersBroken.length,
      cron_failed_jobs: failedList.length, new_profiles: newProfiles || 0, active_users: activeUsers,
    } });
  } catch (e) {
    console.error("admin-digest error", e);
    return json({ error: (e as Error).message }, 500);
  }
});