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
    const staleCutoff = Date.now() - 48 * 60 * 60 * 1000;
    let fresh = 0, stale = 0;
    const followersBroken: string[] = [];
    for (const c of conns || []) {
      const { data: latest } = await admin
        .from("influence_timeline")
        .select("snapshot_date, followers")
        .eq("user_id", c.user_id)
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      const d = latest?.snapshot_date ? new Date(latest.snapshot_date as string).getTime() : 0;
      if (d && d >= staleCutoff) fresh++;
      else stale++;
      if (latest && (latest.followers === null || latest.followers === 0)) {
        followersBroken.push(c.display_name || c.handle || c.user_id);
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

    // ===== BUILD HTML =====
    const top3Html = top3.length
      ? top3.map(([fn, v]) => `<li>${esc(fn)} — $${v.toFixed(2)}</li>`).join("")
      : "<li><em>no usage</em></li>";
    const cronHtml = failedList.length
      ? failedList.map((r: any) => `<li>${esc(r.jobname)} — ${r.failed} failure(s)</li>`).join("")
      : "<li>All green ✅</li>";
    const brokenHtml = followersBroken.length
      ? `<div style="color:#b45309">Followers null/0 for: ${esc(followersBroken.join(", "))}</div>`
      : "";

    const html = `
<div style="font-family:system-ui,sans-serif;max-width:640px;color:#111;line-height:1.5">
  <h2 style="margin:0 0 4px">Aura — Daily Admin Digest</h2>
  <div style="color:#666;font-size:12px;margin-bottom:16px">${esc(todayStr)}</div>

  <h3>💸 Cost</h3>
  <div>Spend MTD: <strong>$${spendMTD.toFixed(2)}</strong> · Projected: <strong>$${projected.toFixed(2)}</strong> · Budget: $${budget.toFixed(2)} (<strong>${pctBudget}%</strong>)</div>
  <div>AI success rate (24h): <strong>${successRate === null ? "n/a" : successRate + "%"}</strong> (${total24hCount || 0} calls, ${fail24hCount || 0} failed)</div>
  <div style="margin-top:6px">Top 3 by spend this month:</div>
  <ol style="margin:4px 0 12px 20px">${top3Html}</ol>

  <h3>🩺 API Health</h3>
  <div>${apiLatest ? `Latest run ${esc(String(apiLatest.run_at))}: ${providerRows} — ${apiLatest.checked} checked, ${apiLatest.failed} failed` : "no runs yet"}</div>

  <h3>🔗 LinkedIn Data</h3>
  <div>Active connections: <strong>${(conns || []).length}</strong> · fresh (&lt;48h): <strong>${fresh}</strong> · stale: <strong>${stale}</strong></div>
  ${brokenHtml}

  <h3>⏰ Crons (24h)</h3>
  <div>Failed jobs: <strong>${failedList.length}</strong> · total failures: <strong>${totalFailed}</strong>${totalRunsCount !== null ? ` · total runs: <strong>${totalRunsCount}</strong>` : ""}</div>
  <ul style="margin:4px 0 12px 20px">${cronHtml}</ul>

  <h3>📈 Growth (24h)</h3>
  <div>New profiles: <strong>${newProfiles || 0}</strong> · Active users (AI usage): <strong>${activeUsers}</strong></div>
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