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

    // ===== ERRORS (24h from ef_error_log) =====
    const SELF_LOOP_ERR = new Set(["api-health-sentinel", "admin-notify", "admin-digest"]);
    const { data: errRows } = await admin
      .from("ef_faults")
      .select("function_name, severity")
      .gte("created_at", dayAgo);
    const filteredErrs = (errRows || []).filter(
      (r: any) => !SELF_LOOP_ERR.has(r.function_name),
    );
    const errTotal = filteredErrs.length;
    const sevRank: Record<string, number> = { critical: 3, high: 2, info: 1 };
    const errByFn = new Map<string, { count: number; worst: string }>();
    let hasCriticalOrHigh = false;
    for (const r of filteredErrs) {
      const fn = (r as any).function_name || "unknown";
      const sev = String((r as any).severity || "high").toLowerCase();
      if (sev === "critical" || sev === "high") hasCriticalOrHigh = true;
      const cur = errByFn.get(fn) || { count: 0, worst: "info" };
      cur.count += 1;
      if ((sevRank[sev] || 2) > (sevRank[cur.worst] || 1)) cur.worst = sev;
      errByFn.set(fn, cur);
    }
    const topErrFns = [...errByFn.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 3);
    const errorsOk = errTotal === 0 || !hasCriticalOrHigh;

    // ===== PIPELINES =====
    const nowMs = Date.now();
    // Scoring freshness
    const { data: newestScore } = await admin
      .from("score_snapshots")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const scoreTs = newestScore?.created_at ? new Date(newestScore.created_at as string).getTime() : null;
    const scoreAgeH = scoreTs ? Math.round((nowMs - scoreTs) / 3.6e6) : null;
    const scoringStale = !scoreTs || (scoreAgeH ?? 0) > 26;

    // Onboarding (last 24h)
    const { data: obRows } = await admin
      .from("onboarding_article_log")
      .select("outcome")
      .gte("created_at", dayAgo);
    const obBreakdown: Record<string, number> = {};
    let obDegraded = 0;
    for (const r of obRows || []) {
      const o = String((r as any).outcome || "none");
      obBreakdown[o] = (obBreakdown[o] || 0) + 1;
      if (o !== "perplexity") obDegraded += 1;
    }
    const obTotal = (obRows || []).length;
    const onboardingOk = obDegraded === 0;

    // Capture unprocessed — entries >30m old without a processed source_registry row.
    const thirtyMinAgoIso = new Date(nowMs - 30 * 60 * 1000).toISOString();
    const windowStartIso = new Date(nowMs - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentEntries } = await admin
      .from("entries")
      .select("id, user_id, created_at, extract_attempts")
      .lt("created_at", thirtyMinAgoIso)
      .gte("created_at", windowStartIso)
      .gte("extract_attempts", 3);
    const entryList = (recentEntries || []) as Array<{ id: string; user_id: string; created_at: string }>;
    let captureUnprocessedCount = 0;
    let captureOldestAgeH: number | null = null;
    let captureDistinctUsers = 0;
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
      captureUnprocessedCount = unprocessed.length;
      if (unprocessed.length > 0) {
        const oldestTs = unprocessed.reduce(
          (m, e) => Math.min(m, new Date(e.created_at).getTime()),
          Number.POSITIVE_INFINITY,
        );
        captureOldestAgeH = Math.round((nowMs - oldestTs) / 3.6e6);
        captureDistinctUsers = new Set(unprocessed.map((e) => e.user_id)).size;
      }
    }
    const captureOk = captureUnprocessedCount === 0;

    const pipelinesOk = !scoringStale && onboardingOk && captureOk;

    // Retained for reference in stats payload
    const anyApiFailed = !!(apiLatest && (apiLatest.failed || 0) > 0);
    const cronFailCount = failedList.length;
    const aiFail24 = fail24hCount || 0;

    // ===== ALERTS (one brain — ops_alerts) =====
    const { data: alertRows } = await admin
      .from("ops_alerts")
      .select("severity, source, subject, what, impact, action, created_at")
      .gte("created_at", dayAgo)
      .not("source", "ilike", "admin-digest%")
      .order("created_at", { ascending: false });
    const alerts = (alertRows || []) as any[];
    const needsYou = alerts.filter((a) => a.severity === "critical");
    const keepEye = alerts.filter((a) => a.severity === "high");
    const handledCount = alerts.filter((a) => a.severity === "info").length;

    let verdictHtml: string;
    if (needsYou.length > 0) {
      const head = needsYou.length === 1 ? "1 thing needs you" : `${needsYou.length} things need you`;
      const tail = keepEye.length ? ` · ${keepEye.length} to keep an eye on` : "";
      verdictHtml = `<div style="background:#F1E1DD;border:1px solid #d9b3ad;color:#6E2A26;padding:14px 16px;border-radius:8px;font-weight:600">🔴 ${head}${tail}</div>`;
    } else if (keepEye.length > 0) {
      verdictHtml = `<div style="background:#F5EBD3;border:1px solid #e3cd97;color:#9A7218;padding:14px 16px;border-radius:8px;font-weight:600">🟡 ${keepEye.length === 1 ? "1 thing" : keepEye.length + " things"} to keep an eye on</div>`;
    } else {
      verdictHtml = `<div style="background:#E6F1ED;border:1px solid #a7d8cc;color:#1F8F7B;padding:14px 16px;border-radius:8px;font-weight:600">🟢 All clear — nothing needs you today.${handledCount ? ` ${handledCount} minor item${handledCount === 1 ? "" : "s"} handled automatically.` : ""}</div>`;
    }

    const alertCard = (a: any, accent: string) => `
      <div style="border-left:3px solid ${accent};background:#FBF8F1;border:1px solid #E2DACB;border-radius:6px;padding:12px 14px;margin-top:10px">
        <div style="font-weight:600;color:#1B1712;font-size:15px">${esc(a.what || a.subject || "Issue")}</div>
        ${a.impact ? `<div style="color:#6B6255;font-size:13px;margin-top:4px">This affects: ${esc(a.impact)}</div>` : ""}
        ${a.action ? `<div style="color:#6E2A26;font-size:13px;margin-top:6px">👉 ${esc(a.action)}</div>` : ""}
      </div>`;
    const alertsSection = (needsYou.length || keepEye.length)
      ? `<div style="margin-top:16px">${needsYou.map((a) => alertCard(a, "#6E2A26")).join("")}${keepEye.map((a) => alertCard(a, "#D6A748")).join("")}</div>`
      : "";

    // ===== BUILD HTML =====
    const meaning = (t: string) =>
      `<div style="color:#6b7280;font-style:italic;font-size:13px;margin:4px 0 8px">${t}</div>`;
    const sectionTitle = (emoji: string, name: string, _ok: boolean) =>
      `<div style="margin-top:22px;margin-bottom:2px"><h3 style="margin:0;font-size:16px">${emoji} ${name}</h3></div>`;

    // Cost section
    const costOk = pctBudget < 80 && aiFail24 <= 10;
    const top3Html = top3.length
      ? top3.map(([fn, v]) => `<li>${esc(fn)} — $${v.toFixed(2)}</li>`).join("")
      : "<li><em>no usage</em></li>";

    // API section
    const apiOk = !anyApiFailed && !!apiLatest;

    // LinkedIn section
    const liOk = behind === 0;
    const behindHtml = behindNames.length
      ? `<div style="margin-top:6px">Behind: <strong>${esc(behindNames.join(", "))}</strong></div>`
      : "";
    const collectingHtml = collectingNames.length
      ? `<div style="color:#6b7280;font-size:13px;margin-top:2px">Collecting (new, filling in): ${esc(collectingNames.join(", "))}</div>`
      : "";

    // Cron section
    const cronOk = cronFailCount === 0;
    const cronHtml = failedList.length
      ? failedList.map((r: any) => `<li>${esc(r.jobname)} — ${r.failed} failure(s)${r.last_fail ? ` · last ${esc(String(r.last_fail))}` : ""}</li>`).join("")
      : "<li>All green ✅</li>";

    // Growth — informational, always OK
    const growthOk = true;

    // Errors section HTML
    const topErrHtml = topErrFns.length
      ? topErrFns
          .map(
            ([fn, v]) =>
              `<li>${esc(fn)} — <strong>${v.count}</strong> error${v.count === 1 ? "" : "s"} · worst: ${esc(v.worst)}</li>`,
          )
          .join("")
      : "<li>All green ✅</li>";

    // Pipelines section HTML
    const scoringLine = scoringStale
      ? `Scoring: ⚠️ newest snapshot ${scoreAgeH === null ? "never" : `<strong>${scoreAgeH}h</strong> old`} (threshold 26h)`
      : `Scoring: ✅ newest snapshot <strong>${scoreAgeH}h</strong> old`;
    const obBreakdownTxt = Object.entries(obBreakdown)
      .map(([k, v]) => `${esc(k)}=${v}`)
      .join(", ") || "none";
    const onboardingLine = onboardingOk
      ? `Onboarding: ✅ ${obTotal} run${obTotal === 1 ? "" : "s"} in 24h${obTotal > 0 ? " — all perplexity" : ""}`
      : `Onboarding: ⚠️ ${obDegraded}/${obTotal} degraded · ${obBreakdownTxt}`;
    const captureLine = captureOk
      ? `Capture → Signal: ✅ no entries stuck`
      : `Capture → Signal: ⚠️ <strong>${captureUnprocessedCount}</strong> unprocessed · oldest <strong>${captureOldestAgeH}h</strong> · users: <strong>${captureDistinctUsers}</strong>`;

    const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;max-width:640px;margin:0 auto;color:#111;line-height:1.5;padding:8px">
  <h2 style="margin:0 0 4px;font-size:20px">Aura — Daily Admin Digest</h2>
  <div style="color:#6b7280;font-size:12px;margin-bottom:14px">${esc(todayStr)}</div>

  ${verdictHtml}
  ${alertsSection}

  <div style="margin-top:24px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.05em">Snapshot — reference</div>

  ${sectionTitle("💸", "Cost", costOk)}
  ${meaning("What Aura spent on AI this month.")}
  <div>Spend MTD: <strong>$${spendMTD.toFixed(2)}</strong> of <strong>$${budget.toFixed(2)}</strong> budget (<strong>${pctBudget}%</strong>)</div>
  <div style="color:#374151">At this pace, ~<strong>$${projected.toFixed(2)}</strong> by month-end.</div>
  <div style="margin-top:4px">24h AI calls: <strong>${total24hCount || 0}</strong> · failed: <strong>${aiFail24}</strong> · success rate: <strong>${successRate === null ? "n/a" : successRate + "%"}</strong></div>
  <div style="margin-top:6px;font-size:13px;color:#374151">Top 3 spenders this month:</div>
  <ol style="margin:2px 0 0 20px;font-size:13px">${top3Html}</ol>

  ${sectionTitle("🩺", "API Health", apiOk)}
  ${meaning("Are the AI providers responding right now?")}
  <div>${apiLatest ? `${providerRows} — <strong>${apiLatest.checked}</strong> checked, <strong>${apiLatest.failed}</strong> failed` : "No runs yet."}</div>
  ${apiLatest ? `<div style="color:#6b7280;font-size:12px">Last checked ${esc(String(apiLatest.run_at))}</div>` : ""}

  ${sectionTitle("🔗", "LinkedIn Data", liOk)}
  ${meaning("Is each user's analytics current? (LinkedIn lags 1–2 days.)")}
  <div>Active users: <strong>${(conns || []).length}</strong> · up to date: <strong>${upToDate}</strong> · collecting: <strong>${collecting}</strong> · behind: <strong>${behind}</strong></div>
  ${behindHtml}
  ${collectingHtml}

  ${sectionTitle("⏰", "Background Jobs", cronOk)}
  ${meaning("Scheduled syncs — all should run daily.")}
  <div>Failed jobs (24h): <strong>${cronFailCount}</strong> · total failures: <strong>${totalFailed}</strong>${totalRunsCount !== null ? ` · total runs: <strong>${totalRunsCount}</strong>` : ""}</div>
  <ul style="margin:4px 0 0 20px;font-size:13px">${cronHtml}</ul>

  ${sectionTitle("🐞", "Errors (24h)", errorsOk)}
  ${meaning("Functions that threw errors in the last day.")}
  <div>Total errors: <strong>${errTotal}</strong>${errByFn.size > 0 ? ` · functions affected: <strong>${errByFn.size}</strong>` : ""}</div>
  <div style="margin-top:6px;font-size:13px;color:#374151">Top offenders:</div>
  <ol style="margin:2px 0 0 20px;font-size:13px">${topErrHtml}</ol>

  ${sectionTitle("🔧", "Pipelines", pipelinesOk)}
  ${meaning("Is each core loop actually moving?")}
  <div style="margin-top:4px">${scoringLine}</div>
  <div style="margin-top:4px">${onboardingLine}</div>
  <div style="margin-top:4px">${captureLine}</div>

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

    const HEARTBEAT_URL = Deno.env.get("HEARTBEAT_URL");
    if (HEARTBEAT_URL && notifyRes.ok) {
      try { await fetch(HEARTBEAT_URL); } catch (_) { /* never let the ping break or delay the digest */ }
    }

    return json({ success: true, sent: notifyRes.ok, notify: notifyBody, stats: {
      spendMTD, projected, budget,
      linkedin: { upToDate, behind, collecting },
      cron_failed_jobs: failedList.length,
      errors_24h: errTotal,
      pipelines: {
        scoring_age_hours: scoreAgeH,
        onboarding: { total: obTotal, degraded: obDegraded, breakdown: obBreakdown },
        capture_unprocessed: {
          count: captureUnprocessedCount,
          oldest_age_hours: captureOldestAgeH,
          distinct_users: captureDistinctUsers,
        },
      },
      new_profiles: newProfiles || 0, active_users: activeUsers,
    } });
  } catch (e) {
    console.error("admin-digest error", e);
    return json({ error: (e as Error).message }, 500);
  }
});