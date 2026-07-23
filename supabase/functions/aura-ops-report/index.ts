// aura-ops-report
// Daily plain-English operations report emailed to the founder.
// ALWAYS sends — its arrival IS the outermost heartbeat. Never make sending conditional.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { emailShell, heading as headingHtml, INK, INK_BODY, INK_MUTE, RULE, SERIF, BODY, MONO } from "../_shared/email-theme.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const FOUNDER_USER_ID = "9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3";
const FROM = "Aura <invites@aura-intel.org>";

type Verdict = "GREEN" | "AMBER" | "RED";
function worse(a: Verdict, b: Verdict): Verdict {
  const rank = { GREEN: 0, AMBER: 1, RED: 2 } as const;
  return rank[a] >= rank[b] ? a : b;
}

function ageMinutes(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / 60000);
}

function fmtAge(mins: number | null): string {
  if (mins == null) return "unknown";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  if (h < 48) return `${h} hours ago`;
  const d = Math.floor(h / 24);
  return `${d} days ago`;
}

function esc(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Heartbeats: only functions that ACTUALLY write to ef_error_log with a heartbeat row.
// "cron ran but wrote no heartbeat" is a rare secondary problem — AMBER, not RED.
// Do NOT list functions that report through health_findings/notifications instead
// (e.g. api-health-sentinel, aura-health-audit). Those are covered by Section A on
// cron.job_run_details.
type Heartbeat = {
  key: string;
  label: string;
  windowMin: number;
  functionName: string;
  match?: string;
};

const HEARTBEATS: Heartbeat[] = [
  { key: "reap-stuck-jobs", label: "Job queue reaper", windowMin: 20, functionName: "reap-stuck-jobs", match: "JOB_QUEUE_HEALTH" },
  { key: "publish-invariants-check", label: "Publish invariants", windowMin: 26 * 60, functionName: "publish-invariants-check" },
  { key: "reconcile-signal-counts", label: "Signal-count reconciler", windowMin: 26 * 60, functionName: "reconcile-signal-counts" },
  { key: "draft-ready-email", label: "Draft-ready email (dry run)", windowMin: 26 * 60, functionName: "draft-ready-email" },
  { key: "aura-ops-report", label: "This report itself", windowMin: 26 * 60, functionName: "aura-ops-report" },
];

// Parse a cron schedule string into an expected max-gap window in minutes.
// Falls back to generous defaults per class so a weekly job is never flagged
// simply because it is not Monday.
function scheduleWindowMin(schedule: string): number {
  const s = (schedule || "").trim();
  // Interval form: "N seconds/minutes/hours"
  const iv = s.match(/^(\d+)\s+(second|minute|hour)s?$/i);
  if (iv) {
    const n = parseInt(iv[1], 10);
    if (/second/i.test(iv[2])) return Math.max(30, Math.ceil(n / 60) + 5);
    if (/minute/i.test(iv[2])) return n + 10;
    if (/hour/i.test(iv[2])) return Math.max(3 * 60, n * 60 + 30);
  }
  // Standard 5-field cron: min hour dom month dow
  const p = s.split(/\s+/);
  if (p.length === 5) {
    const [mi, hr, dom, _mon, dow] = p;
    // Weekly (day-of-week pinned to specific day)
    if (dow !== "*" && !/[*/,]/.test(dow.replace(/^\d+$/, ""))) return 8 * 24 * 60;
    // Every N minutes: "*/N"
    if (mi.startsWith("*/")) {
      const n = parseInt(mi.slice(2), 10) || 5;
      return Math.max(15, n * 3 + 5);
    }
    if (mi === "*") return 30; // every minute
    // Hourly (specific minute, hour="*")
    if (hr === "*") return 3 * 60;
    // Daily (specific hour, no day pinning)
    if (dom === "*") return 26 * 60;
    // Monthly (dom pinned)
    if (/^\d+$/.test(dom)) return 32 * 24 * 60;
  }
  // Unknown — be generous rather than crying wolf.
  return 26 * 60;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const CRON_SECRET = Deno.env.get("cron_secret") || Deno.env.get("CRON_SECRET") || "";
  const cronHeader = req.headers.get("x-cron-secret") || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const bearer = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const isServiceRole = !!bearer && bearer === serviceKey;
  if (!(CRON_SECRET && cronHeader === CRON_SECRET) && !isServiceRole) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const bodyIn = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const dryRun = url.searchParams.get("dry_run") === "1" || bodyIn?.dry_run === true;
  // Optional override for the silence detector proof step.
  const heartbeatWindowOverride: Record<string, number> = bodyIn?.heartbeat_window_override_min || {};

  const admin = createClient(supabaseUrl, serviceKey);
  const RESEND = Deno.env.get("RESEND_API_KEY") || "";

  // Resolve founder email.
  let founderEmail = Deno.env.get("ADMIN_ALERT_EMAIL") || "";
  try {
    const { data: userRes } = await (admin as any).auth.admin.getUserById(FOUNDER_USER_ID);
    if (userRes?.user?.email) founderEmail = userRes.user.email;
  } catch (_) { /* fall back to env */ }

  let verdict: Verdict = "GREEN";
  let worstReason = "everything reporting, nothing stuck";

  // ---------- SECTION A: Did every scheduled job fire? ----------
  // Source of truth: cron.job_run_details via public.ops_cron_status().
  type CronRow = {
    jobid: number; jobname: string; schedule: string; active: boolean;
    last_end: string | null; last_status: string | null;
    succeeded_24h: number; failed_24h: number;
  };
  type CronReport = {
    row: CronRow; windowMin: number;
    state: "OK" | "NOT_RUN" | "NEVER" | "FAILING";
    ageMin: number | null;
  };
  const cronReport: CronReport[] = [];
  let notRunCount = 0, failingCount = 0;
  const { data: cronRows, error: cronErr } = await admin.rpc("ops_cron_status", { p_hours: 24 });
  if (cronErr) {
    // Cron visibility itself failed — that is RED. Do not silently continue.
    verdict = worse(verdict, "RED");
    worstReason = `Cannot read cron status: ${cronErr.message}`;
  }
  for (const raw of (cronRows || []) as CronRow[]) {
    const win = heartbeatWindowOverride[raw.jobname] ?? scheduleWindowMin(raw.schedule);
    const age = raw.last_end ? ageMinutes(raw.last_end) : null;
    let state: CronReport["state"] = "OK";
    if (!raw.last_end) {
      state = "NEVER";
      notRunCount++;
      verdict = worse(verdict, "RED");
      worstReason = `Cron ${raw.jobname} has never run`;
    } else if (age != null && age > win) {
      state = "NOT_RUN";
      notRunCount++;
      verdict = worse(verdict, "RED");
      worstReason = `Cron ${raw.jobname} last ran ${fmtAge(age)}`;
    } else if ((raw.failed_24h || 0) > 0 && (raw.succeeded_24h || 0) === 0) {
      state = "FAILING";
      failingCount++;
      verdict = worse(verdict, "RED");
      worstReason = `Cron ${raw.jobname} failed ${raw.failed_24h}× in 24h`;
    }
    cronReport.push({ row: raw, windowMin: win, state, ageMin: age });
  }

  // ---------- SECTION A2: heartbeat presence for functions that DO write one ----------
  type HbReport = { hb: Heartbeat; state: "OK" | "MUTE" | "NEVER"; lastSeen: string | null; ageMin: number | null; windowMin: number };
  const heartbeats: HbReport[] = [];
  let muteCount = 0;
  for (const hb of HEARTBEATS) {
    const win = heartbeatWindowOverride[hb.key] ?? hb.windowMin;
    let q = admin.from("ef_error_log")
      .select("created_at, error_message")
      .eq("function_name", hb.functionName)
      .order("created_at", { ascending: false })
      .limit(1);
    if (hb.match) q = q.like("error_message", `${hb.match}%`);
    const { data: rows } = await q;
    const last = rows && rows[0] ? (rows[0] as any).created_at as string : null;
    if (!last) {
      heartbeats.push({ hb, state: "NEVER", lastSeen: null, ageMin: null, windowMin: win });
      // NEVER-SEEN heartbeat + we don't know the cron ran → AMBER (cron layer will catch a genuinely dead cron).
      muteCount++;
      verdict = worse(verdict, "AMBER");
      if (verdict === "AMBER") worstReason = `${hb.label} has never written a heartbeat`;
      continue;
    }
    const age = ageMinutes(last)!;
    if (age > win) {
      heartbeats.push({ hb, state: "MUTE", lastSeen: last, ageMin: age, windowMin: win });
      muteCount++;
      verdict = worse(verdict, "AMBER");
      if (verdict === "AMBER") worstReason = `${hb.label} cron ran but wrote no heartbeat`;
    } else {
      heartbeats.push({ hb, state: "OK", lastSeen: last, ageMin: age, windowMin: win });
    }
  }

  // ---------- Health findings summary (the other health channel) ----------
  let openFindings = 0;
  let newestFinding: { title: string; at: string } | null = null;
  try {
    const { data: hf } = await admin.rpc("ops_health_findings_summary", { p_hours: 24 });
    const row = Array.isArray(hf) ? hf[0] : hf;
    if (row) {
      openFindings = Number((row as any).open_count || 0);
      const t = (row as any).newest_title;
      const at = (row as any).newest_at;
      if (t) newestFinding = { title: String(t), at: String(at || "") };
    }
  } catch (_) { /* keep zero */ }

  // ---------- SECTION B: Failures 24h ----------
  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: failRows } = await admin.from("ef_error_log")
    .select("function_name, error_message, created_at")
    .eq("severity", "high")
    .gt("created_at", since24h)
    .order("created_at", { ascending: false })
    .limit(500);
  const failByFn = new Map<string, { count: number; newest: string; created_at: string }>();
  for (const r of failRows || []) {
    const fn = (r as any).function_name as string;
    const cur = failByFn.get(fn);
    if (!cur) failByFn.set(fn, { count: 1, newest: ((r as any).error_message || "").slice(0, 160), created_at: (r as any).created_at });
    else cur.count++;
  }
  const failures = Array.from(failByFn.entries()).sort((a, b) => b[1].count - a[1].count);
  if (failures.length > 0) {
    verdict = worse(verdict, "AMBER");
    if (verdict === "AMBER") worstReason = `${failures[0][1].count} failures in ${failures[0][0]}`;
  }

  // ---------- SECTION C: Job queue ----------
  const [{ count: qPending }, { count: qClaimed }, { count: qDead }] = await Promise.all([
    admin.from("job_queue").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("job_queue").select("id", { count: "exact", head: true }).eq("status", "claimed"),
    admin.from("job_queue").select("id", { count: "exact", head: true }).eq("status", "dead"),
  ]);
  const { data: oldestPending } = await admin.from("job_queue")
    .select("scheduled_for").eq("status", "pending")
    .order("scheduled_for", { ascending: true }).limit(1).maybeSingle();
  const oldestPendingMin = oldestPending?.scheduled_for ? ageMinutes((oldestPending as any).scheduled_for) : null;
  const { data: deadRows } = await admin.from("job_queue")
    .select("job_type, user_id, last_error, updated_at").eq("status", "dead")
    .order("updated_at", { ascending: false }).limit(20);
  if ((qDead ?? 0) > 0) {
    verdict = worse(verdict, "RED");
    worstReason = `${qDead} dead job${qDead === 1 ? "" : "s"} in the queue`;
  } else if (oldestPendingMin != null && oldestPendingMin > 60) {
    verdict = worse(verdict, "AMBER");
    if (verdict === "AMBER") worstReason = `Oldest pending job is ${oldestPendingMin} min old`;
  }

  // ---------- SECTION D: Pipeline freshness ----------
  async function newestAge(table: string, col = "created_at"): Promise<number | null> {
    const { data } = await admin.from(table).select(col).order(col, { ascending: false }).limit(1).maybeSingle();
    const iso = data ? (data as any)[col] : null;
    return iso ? ageMinutes(iso) : null;
  }
  const [entriesAge, fragAge, sigAge, imprintAge, metricsAge] = await Promise.all([
    newestAge("entries"),
    newestAge("evidence_fragments"),
    newestAge("strategic_signals"),
    newestAge("imprint_snapshots"),
    newestAge("linkedin_post_metrics"),
  ]);
  const freshRows: Array<{ label: string; ageMin: number | null; amber: boolean }> = [
    { label: "New captures (entries)", ageMin: entriesAge, amber: false },
    { label: "New evidence fragments", ageMin: fragAge, amber: false },
    { label: "New strategic signals", ageMin: sigAge, amber: sigAge != null && sigAge > 48 * 60 },
    { label: "New imprint snapshots", ageMin: imprintAge, amber: imprintAge != null && imprintAge > 26 * 60 },
    { label: "New LinkedIn post metrics", ageMin: metricsAge, amber: false },
  ];
  for (const r of freshRows) {
    if (r.amber) {
      verdict = worse(verdict, "AMBER");
      if (verdict === "AMBER") worstReason = `${r.label} is ${fmtAge(r.ageMin)}`;
    }
  }

  // ---------- SECTION E: Publish integrity ----------
  const { data: invRows } = await admin.from("ef_error_log")
    .select("context, created_at")
    .eq("function_name", "publish-invariants-check")
    .order("created_at", { ascending: false })
    .limit(2);
  const invNow = invRows && invRows[0] ? ((invRows[0] as any).context || {}) : {};
  const invPrev = invRows && invRows[1] ? ((invRows[1] as any).context || {}) : {};
  const unclassifiedNow = Number(invNow?.unclassified?.count ?? 0);
  const unclassifiedPrev = Number(invPrev?.unclassified?.count ?? 0);
  const { count: stuckPublishing } = await admin.from("linkedin_posts")
    .select("id", { count: "exact", head: true }).eq("tracking_status", "publishing");
  const { count: needsReview } = await admin.from("linkedin_posts")
    .select("id", { count: "exact", head: true }).eq("tracking_status", "needs_review");
  if ((stuckPublishing ?? 0) > 0 || (needsReview ?? 0) > 0) {
    verdict = worse(verdict, "RED");
    worstReason = `${(stuckPublishing ?? 0)} stuck publishing, ${(needsReview ?? 0)} needs review`;
  } else if (unclassifiedNow > unclassifiedPrev) {
    verdict = worse(verdict, "AMBER");
    if (verdict === "AMBER") worstReason = `Unclassified posts rising: ${unclassifiedPrev} → ${unclassifiedNow}`;
  }

  // ---------- SECTION F: The funnel ----------
  const since7d = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
  const { data: recentCaptures } = await admin.from("entries")
    .select("user_id, created_at").gt("created_at", since7d).limit(10000);
  const activeUsers = new Set<string>();
  for (const r of recentCaptures || []) activeUsers.add((r as any).user_id);
  const captureCount = (recentCaptures || []).length;
  const { data: drafts } = await admin.from("content_items")
    .select("id, user_id").eq("status", "draft").limit(10000);
  const draftUsers = new Set<string>();
  for (const r of drafts || []) draftUsers.add((r as any).user_id);
  const draftCount = (drafts || []).length;
  const { data: published } = await admin.from("linkedin_posts")
    .select("user_id, published_at").gt("published_at", since7d).limit(10000);
  let founderPublished = 0, nonFounderPublished = 0;
  for (const r of published || []) {
    if ((r as any).user_id === FOUNDER_USER_ID) founderPublished++; else nonFounderPublished++;
  }

  // ---------- Compose subject ----------
  const shortReason = worstReason.split(/[.,\n]/)[0].trim().split(/\s+/).slice(0, 6).join(" ");
  const subject =
    verdict === "GREEN" ? "Aura ops — GREEN" :
    verdict === "AMBER" ? `Aura ops — AMBER: ${shortReason}` :
                          `Aura ops — RED: ${shortReason}`;

  // ---------- Compose email body ----------
  const RED = "#6E2A26", AMBER = "#9A7218", GREEN = "#2F5D3A";
  const verdictColor = verdict === "RED" ? RED : verdict === "AMBER" ? AMBER : GREEN;

  const asOf = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";

  let html = "";
  html += `<p style="font-family:${MONO};font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:${INK_MUTE};margin:0 0 6px;">Daily operations report · ${esc(asOf)}</p>`;
  html += `<div style="font-family:${SERIF};font-size:22px;font-weight:500;color:${verdictColor};margin:0 0 6px;">${verdict} — ${esc(worstReason)}</div>`;
  html += `<p style="font-family:${BODY};font-size:14px;color:${INK_BODY};margin:0 0 22px;">If you did not receive this email today, that is itself the alert.</p>`;

  // Section A — every active scheduled job
  html += `<h2 style="font-family:${SERIF};font-size:16px;color:${INK};margin:22px 0 8px;">A. Did every scheduled job fire?</h2>`;
  html += `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-family:${BODY};font-size:14px;color:${INK_BODY};border-collapse:collapse;">`;
  for (const c of cronReport) {
    const color =
      c.state === "OK" ? GREEN :
      c.state === "NEVER" ? RED :
      c.state === "NOT_RUN" ? RED : RED;
    const text =
      c.state === "OK"      ? `OK — last run ${fmtAge(c.ageMin)} (${c.row.succeeded_24h}/24h ok, ${c.row.failed_24h} failed)` :
      c.state === "NEVER"   ? `NEVER RUN` :
      c.state === "NOT_RUN" ? `NOT RUN since ${esc((c.row.last_end || "").replace("T"," ").slice(0,16))} (expected inside ${c.windowMin} min)` :
                              `FAILING — ${c.row.failed_24h} failed runs in 24h`;
    html += `<tr><td style="padding:4px 8px 4px 0;color:${INK};white-space:nowrap;">${esc(c.row.jobname)}</td><td style="padding:4px 0;color:${color};">${text}</td></tr>`;
  }
  html += `</table>`;

  // Section A2 — heartbeat presence
  html += `<h2 style="font-family:${SERIF};font-size:16px;color:${INK};margin:22px 0 8px;">A2. Heartbeats from functions that write one</h2>`;
  html += `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-family:${BODY};font-size:14px;color:${INK_BODY};border-collapse:collapse;">`;
  for (const h of heartbeats) {
    const color = h.state === "OK" ? GREEN : AMBER;
    const text =
      h.state === "OK"    ? `OK — last heard ${fmtAge(h.ageMin)}` :
      h.state === "NEVER" ? `never wrote a heartbeat` :
                            `cron ran but wrote no heartbeat since ${esc((h.lastSeen || "").replace("T"," ").slice(0,16))}`;
    html += `<tr><td style="padding:4px 8px 4px 0;color:${INK};white-space:nowrap;">${esc(h.hb.label)}</td><td style="padding:4px 0;color:${color};">${text}</td></tr>`;
  }
  html += `</table>`;

  // Health findings summary
  html += `<p style="font-family:${BODY};font-size:14px;color:${INK_BODY};margin:10px 0 0;">`
       + `Open health findings in the last 24h: <span style="color:${openFindings > 0 ? AMBER : INK_BODY};">${openFindings}</span>`
       + (newestFinding ? ` — newest: ${esc(newestFinding.title)}` : "")
       + `.</p>`;

  // Section B
  html += `<h2 style="font-family:${SERIF};font-size:16px;color:${INK};margin:22px 0 8px;">B. Failures in the last 24 hours</h2>`;
  if (failures.length === 0) {
    html += `<p style="font-family:${BODY};font-size:14px;color:${INK_BODY};margin:0;">No failures in 24h.</p>`;
  } else {
    html += `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-family:${BODY};font-size:14px;color:${INK_BODY};border-collapse:collapse;">`;
    for (const [fn, info] of failures) {
      html += `<tr><td style="padding:4px 8px 4px 0;color:${INK};white-space:nowrap;">${esc(fn)}</td><td style="padding:4px 8px;color:${AMBER};">${info.count}× failed</td><td style="padding:4px 0;color:${INK_MUTE};">${esc(info.newest)}</td></tr>`;
    }
    html += `</table>`;
  }

  // Section C
  html += `<h2 style="font-family:${SERIF};font-size:16px;color:${INK};margin:22px 0 8px;">C. Job queue</h2>`;
  html += `<p style="font-family:${BODY};font-size:14px;color:${INK_BODY};margin:0 0 6px;">${qPending ?? 0} pending, ${qClaimed ?? 0} in progress, <span style="color:${(qDead ?? 0) > 0 ? RED : INK_BODY};">${qDead ?? 0} dead</span>. Oldest pending: ${oldestPendingMin == null ? "none" : `${oldestPendingMin} min old`}.</p>`;
  if ((deadRows || []).length > 0) {
    html += `<ul style="font-family:${BODY};font-size:14px;color:${RED};margin:6px 0 0 20px;padding:0;">`;
    for (const d of deadRows!) {
      html += `<li>${esc((d as any).job_type)} for user ${esc((d as any).user_id || "unknown")}</li>`;
    }
    html += `</ul>`;
  }

  // Section D
  html += `<h2 style="font-family:${SERIF};font-size:16px;color:${INK};margin:22px 0 8px;">D. Pipeline freshness</h2>`;
  html += `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-family:${BODY};font-size:14px;color:${INK_BODY};border-collapse:collapse;">`;
  for (const r of freshRows) {
    const c = r.amber ? AMBER : INK_BODY;
    html += `<tr><td style="padding:4px 8px 4px 0;color:${INK};">${esc(r.label)}</td><td style="padding:4px 0;color:${c};">${fmtAge(r.ageMin)}</td></tr>`;
  }
  html += `</table>`;

  // Section E
  html += `<h2 style="font-family:${SERIF};font-size:16px;color:${INK};margin:22px 0 8px;">E. Publish integrity</h2>`;
  const trendArrow = unclassifiedNow === unclassifiedPrev ? "steady" : unclassifiedNow > unclassifiedPrev ? "rising" : "falling";
  const trendColor = unclassifiedNow > unclassifiedPrev ? AMBER : INK_BODY;
  html += `<p style="font-family:${BODY};font-size:14px;color:${INK_BODY};margin:0 0 4px;">`
       + `<span style="color:${trendColor};">${unclassifiedNow} unclassified posts</span> (yesterday ${unclassifiedPrev} — ${trendArrow}). `
       + `<span style="color:${(stuckPublishing ?? 0) > 0 ? RED : INK_BODY};">${stuckPublishing ?? 0} stuck in publishing</span>. `
       + `<span style="color:${(needsReview ?? 0) > 0 ? RED : INK_BODY};">${needsReview ?? 0} needs review</span>.`
       + `</p>`;

  // Section F
  html += `<h2 style="font-family:${SERIF};font-size:16px;color:${INK};margin:22px 0 8px;">F. The funnel</h2>`;
  html += `<p style="font-family:${BODY};font-size:14px;color:${INK_BODY};margin:0;line-height:1.7;">`
       + `${activeUsers.size} users captured something in the last 7 days.<br/>`
       + `${captureCount} captures in the last 7 days.<br/>`
       + `${draftUsers.size} users hold ${draftCount} unpublished drafts right now.<br/>`
       + `${founderPublished + nonFounderPublished} posts published in the last 7 days (${founderPublished} by founder, ${nonFounderPublished} by others).`
       + `</p>`;

  const emailHtml = emailShell({ preheader: `${verdict}. ${worstReason}.`, body: html });

  // Plain text version for the acceptance dump.
  const lines: string[] = [];
  lines.push(`Daily operations report — ${asOf}`);
  lines.push(`${verdict} — ${worstReason}`);
  lines.push(`If you did not receive this email today, that is itself the alert.`);
  lines.push("");
  lines.push(`A. Did every scheduled job fire?`);
  for (const c of cronReport) {
    if (c.state === "OK") lines.push(`  ${c.row.jobname}: OK — last run ${fmtAge(c.ageMin)} (${c.row.succeeded_24h}/24h ok, ${c.row.failed_24h} failed)`);
    else if (c.state === "NEVER") lines.push(`  ${c.row.jobname}: NEVER RUN`);
    else if (c.state === "NOT_RUN") lines.push(`  ${c.row.jobname}: NOT RUN since ${c.row.last_end} (expected inside ${c.windowMin} min)`);
    else lines.push(`  ${c.row.jobname}: FAILING — ${c.row.failed_24h} failed runs in 24h`);
  }
  lines.push("");
  lines.push(`A2. Heartbeats from functions that write one`);
  for (const h of heartbeats) {
    if (h.state === "OK") lines.push(`  ${h.hb.label}: OK — last heard ${fmtAge(h.ageMin)}`);
    else if (h.state === "NEVER") lines.push(`  ${h.hb.label}: never wrote a heartbeat`);
    else lines.push(`  ${h.hb.label}: cron ran but wrote no heartbeat since ${h.lastSeen}`);
  }
  lines.push(`  Open health findings (24h): ${openFindings}${newestFinding ? ` — newest: ${newestFinding.title}` : ""}`);
  lines.push("");
  lines.push(`B. Failures in the last 24 hours`);
  if (failures.length === 0) lines.push(`  No failures in 24h.`);
  else for (const [fn, info] of failures) lines.push(`  ${fn}: ${info.count}× failed — ${info.newest}`);
  lines.push("");
  lines.push(`C. Job queue`);
  lines.push(`  ${qPending ?? 0} pending, ${qClaimed ?? 0} in progress, ${qDead ?? 0} dead. Oldest pending: ${oldestPendingMin == null ? "none" : `${oldestPendingMin} min old`}.`);
  for (const d of deadRows || []) lines.push(`  DEAD: ${(d as any).job_type} for user ${(d as any).user_id || "unknown"}`);
  lines.push("");
  lines.push(`D. Pipeline freshness`);
  for (const r of freshRows) lines.push(`  ${r.label}: ${fmtAge(r.ageMin)}${r.amber ? " (AMBER)" : ""}`);
  lines.push("");
  lines.push(`E. Publish integrity`);
  lines.push(`  ${unclassifiedNow} unclassified posts (yesterday ${unclassifiedPrev} — ${trendArrow}). ${stuckPublishing ?? 0} stuck in publishing. ${needsReview ?? 0} needs review.`);
  lines.push("");
  lines.push(`F. The funnel`);
  lines.push(`  ${activeUsers.size} users captured something in the last 7 days.`);
  lines.push(`  ${captureCount} captures in the last 7 days.`);
  lines.push(`  ${draftUsers.size} users hold ${draftCount} unpublished drafts right now.`);
  lines.push(`  ${founderPublished + nonFounderPublished} posts published in the last 7 days (${founderPublished} by founder, ${nonFounderPublished} by others).`);
  const plainText = lines.join("\n");

  // ALWAYS-SEND. Not wrapped in a conditional that could skip on green.
  let resendStatus = 0;
  let resendError = "";
  if (!dryRun) {
    if (!RESEND || !founderEmail) {
      resendError = !RESEND ? "RESEND_API_KEY missing" : "founder email unresolved";
    } else {
      try {
        const resp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: FROM, to: [founderEmail], subject, html: emailHtml }),
        });
        resendStatus = resp.status;
        if (!resp.ok) resendError = (await resp.text()).slice(0, 300);
      } catch (e) {
        resendError = (e as Error).message;
      }
    }
  }

  // Own heartbeat — one row per run, no matter what.
  await admin.from("ef_error_log").insert({
    function_name: "aura-ops-report",
    severity: "info",
    error_message: `OPS_REPORT verdict=${verdict} silent=${notRunCount + failingCount} mute=${muteCount} failures=${failures.length} dead_jobs=${qDead ?? 0} unclassified=${unclassifiedNow}`,
    context: {
      verdict, worst_reason: worstReason, subject,
      silent: notRunCount + failingCount, mute: muteCount,
      not_run: notRunCount, failing: failingCount,
      failures: failures.length,
      dead_jobs: qDead ?? 0, unclassified: unclassifiedNow,
      open_findings: openFindings,
      dry_run: dryRun, resend_status: resendStatus,
      resend_error: resendError || null,
      founder_email_present: !!founderEmail,
    },
  });

  return new Response(JSON.stringify({
    ok: true, verdict, subject, dry_run: dryRun,
    resend_status: resendStatus, resend_error: resendError || null,
    plain_text: plainText,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});