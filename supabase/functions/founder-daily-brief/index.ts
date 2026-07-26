// founder-daily-brief — the single daily heartbeat email.
// Computes the whole founder picture once, stores it as one row, renders it,
// sends it. Always sends. Every headline number is computed twice.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const FOUNDER_ID = "9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// ---------- palette / type ----------
const PAPER = "#F1ECE1";
const CARD = "#FBF8F1";
const INK = "#1B1712";
const RULE = "#E2DACB";
const MUTED = "#6B6255";
const TEAL = "#36C5B0";
const AMBER = "#D6A748";
const DAMBER = "#B5762A";
const OX = "#6E2A26";
const SERIF = "Georgia,'Times New Roman',serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

// Never use array.length for a displayed number.
const size = (a: unknown[] | null | undefined): number =>
  (a ?? []).reduce((n: number) => n + 1, 0);

function esc(s: unknown): string {
  return String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Telemetry must never abort the work it describes.
async function safeLog(admin: SupabaseClient, severity: string, message: string, context: Record<string, unknown> = {}) {
  try {
    await admin.from("ef_error_log").insert({
      function_name: "founder-daily-brief",
      severity,
      error_message: message.slice(0, 1000),
      context,
    });
  } catch (_) { /* swallow */ }
}

// ---------- audit ----------
type Pair = {
  key: string;
  label: string;
  route_a: string;
  route_b: string;
  a: number | null;
  b: number | null;
  agree: boolean;
  note?: string;
};

class Audit {
  pairs: Pair[] = [];
  add(p: Pair) { this.pairs.push(p); return p; }
  get(key: string): Pair | undefined { return this.pairs.find((p) => p.key === key); }
  disagreements(): Pair[] { return this.pairs.filter((p) => !p.agree); }
  /** Render a headline number honestly. */
  n(key: string): string {
    const p = this.get(key);
    if (!p) return "?";
    if (p.agree) return String(p.a ?? "?");
    return `? <span style="font-size:12px;font-family:${MONO};color:${OX}">(${p.a ?? "?"} vs ${p.b ?? "?"} — disagree)</span>`;
  }
  /** Plain value for arithmetic; null when disputed. */
  v(key: string): number | null {
    const p = this.get(key);
    if (!p || !p.agree) return null;
    return p.a;
  }
}

// ---------- counting helpers ----------
function makeCounters(admin: SupabaseClient) {
  async function headCount(table: string, build: (q: any) => any = (q) => q): Promise<number> {
    const { count, error } = await build(admin.from(table).select("*", { count: "exact", head: true }));
    if (error) throw new Error(`${table}: ${error.message}`);
    return count ?? 0;
  }
  async function distinctUsers(table: string, build: (q: any) => any, ids: string[]): Promise<number> {
    let n = 0;
    for (const id of ids) {
      const c = await headCount(table, (q) => build(q).eq("user_id", id));
      if (c > 0) n += 1;
    }
    return n;
  }
  return { headCount, distinctUsers };
}

// ---------- html primitives ----------
function label(t: string): string {
  return `<div style="font-family:${MONO};font-size:11px;text-transform:uppercase;letter-spacing:.16em;color:${MUTED};padding:0 0 10px">${esc(t)}</div>`;
}
function prose(t: string): string {
  return `<div style="font-family:${SERIF};font-size:15px;line-height:1.6;color:${INK}">${t}</div>`;
}
function whatId(t: string): string {
  return `<div style="font-family:${SERIF};font-size:14px;line-height:1.6;color:${INK};padding-top:12px"><b>&rarr; What I'd do:</b> ${esc(t)}</div>`;
}
function sectionOpen(title: string): string {
  return `<tr><td style="padding:26px 22px 0;border-top:1px solid ${RULE}">${label(title)}`;
}
function sectionClose(advice: string): string {
  return `${whatId(advice)}</td></tr>`;
}
function bar(name: string, n: number | string, total: number, colour: string, sub?: string): string {
  const pct = total > 0 && typeof n === "number" ? Math.max(2, Math.round((n / total) * 100)) : 2;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px"><tr>
    <td width="150" style="font-family:${SERIF};font-size:13px;color:${INK};padding-right:8px">${esc(name)}</td>
    <td>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td width="${pct}%" bgcolor="${colour}" style="height:11px;line-height:11px;font-size:1px">&nbsp;</td>
        <td width="${100 - pct}%" bgcolor="${RULE}" style="height:11px;line-height:11px;font-size:1px">&nbsp;</td>
      </tr></table>
    </td>
    <td width="70" align="right" style="font-family:${MONO};font-size:13px;color:${INK};padding-left:8px">${typeof n === "number" ? n : n}</td>
  </tr></table>${sub ? `<div style="font-family:${SERIF};font-size:12px;color:${MUTED};padding:0 0 10px 16px">&#8629; ${esc(sub)}</div>` : ""}`;
}
function callout(colour: string, title: string, lines: string[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 10px"><tr>
    <td width="4" bgcolor="${colour}" style="font-size:1px;line-height:1px">&nbsp;</td>
    <td bgcolor="${CARD}" style="padding:10px 12px;font-family:${SERIF};font-size:14px;color:${INK}">
      <b>${esc(title)}</b>${lines.map((l) => `<div style="font-size:13px;color:${MUTED};padding-top:3px">${esc(l)}</div>`).join("")}
    </td></tr></table>`;
}
function dotLine(colour: string, text: string): string {
  return `<div style="font-family:${SERIF};font-size:13px;color:${INK};padding:3px 0"><span style="color:${colour}">&#9679;</span> ${esc(text)}</div>`;
}
function statBox(v: string, l: string, colour: string): string {
  return `<td width="25%" bgcolor="${CARD}" style="padding:12px 8px;border:1px solid ${RULE}" align="center">
    <div style="font-family:${MONO};font-size:22px;color:${colour}">${v}</div>
    <div style="font-family:${MONO};font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:${MUTED};padding-top:5px">${esc(l)}</div>
  </td>`;
}
function gridCell(n: number, max: number): string {
  if (!n) return `<td bgcolor="${CARD}" align="center" style="border:1px solid ${RULE};font-family:${MONO};font-size:10px;color:${RULE};padding:4px 0">&middot;</td>`;
  const ratio = max > 0 ? n / max : 0;
  const bg = ratio > 0.66 ? "#B9DED4" : ratio > 0.33 ? "#D6ECE5" : "#EDF6F3";
  return `<td bgcolor="${bg}" align="center" style="border:1px solid ${RULE};font-family:${MONO};font-size:10px;color:${INK};padding:4px 0">${n}</td>`;
}

// ---------- main ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  try {
    const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
    const bearer = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const apiKeyHeader = req.headers.get("apikey") || "";
    const cronHeader = req.headers.get("x-cron-secret") || "";
    let authorised =
      bearer === serviceKey || apiKeyHeader === serviceKey || (!!CRON_SECRET && cronHeader === CRON_SECRET);

    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dry_run === true;

    // Admin cockpit: a signed-in admin may compute a dry run (never a send).
    if (!authorised && dryRun && bearer) {
      const asUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      });
      const { data: isAdmin } = await asUser.rpc("is_current_user_admin");
      if (isAdmin === true) authorised = true;
    }
    if (!authorised) return json({ error: "Unauthorized" }, 401);

    const { headCount, distinctUsers } = makeCounters(admin);
    const audit = new Audit();

    // ===== ROUTE A: one SQL pass =====
    const { data: sqlData, error: sqlErr } = await admin.rpc("founder_brief_data");
    if (sqlErr) throw new Error(`founder_brief_data: ${sqlErr.message}`);
    const A: any = sqlData ?? {};
    const fa = A.funnel ?? {};

    // Real user ids (founder + any email containing 'test' excluded).
    const { data: userRows, error: uErr } = await admin.rpc("founder_brief_user_ids");
    if (uErr) throw new Error(`founder_brief_user_ids: ${uErr.message}`);
    const ids: string[] = (userRows ?? []).map((r: any) => r.user_id);
    const signedInIds: string[] = (userRows ?? []).filter((r: any) => r.last_sign_in_at).map((r: any) => r.user_id);
    const invitedB = ids.reduce((n: number) => n + 1, 0);
    const signedInB = signedInIds.reduce((n: number) => n + 1, 0);
    const crossCheckable = invitedB <= 80; // per-user exact counts stay cheap below this

    // ===== ROUTE B: independent per-entity exact counts =====
    const P = (key: string, lbl: string, ra: string, rb: string, a: number | null, b: number | null, note?: string) =>
      audit.add({ key, label: lbl, route_a: ra, route_b: rb, a, b, agree: a !== null && b !== null && a === b, note });

    P("invited", "Invited", "auth.users (sql)", "auth.users id list", fa.invited ?? null, invitedB);
    P("signed_in", "Signed in", "auth.users.last_sign_in_at (sql)", "auth.users id list filtered", fa.signed_in ?? null, signedInB,
      "cross-check 'has a profile row' = " + (fa.signed_in_xc ?? "?") + " — these legitimately differ");
    P("finished_setup", "Finished setup", "diagnostic_profiles (sql)", "diagnostic_profiles exact head count",
      fa.finished_setup ?? null, crossCheckable ? await distinctUsers("diagnostic_profiles", (q) => q, ids) : null);
    P("captured", "Captured something", "entries distinct user (sql)", "entries per-user exact counts",
      fa.captured ?? null, crossCheckable ? await distinctUsers("entries", (q) => q, ids) : null,
      "second capture table `captures` gives " + (fa.captured_xc ?? "?") + " — both reported until one is retired");
    P("got_signal", "Got a signal", "strategic_signals distinct user (sql)", "strategic_signals per-user exact counts",
      fa.got_signal ?? null, crossCheckable ? await distinctUsers("strategic_signals", (q) => q, ids) : null);
    P("linkedin_live", "LinkedIn live", "linkedin_connections status=active (sql)", "linkedin_connections per-user exact counts",
      fa.linkedin_live ?? null,
      crossCheckable ? await distinctUsers("linkedin_connections", (q) => q.eq("status", "active"), ids) : null,
      "token-present cross-check = " + (fa.linkedin_live_xc ?? "?"));
    P("opened_writer", "Opened the writer", "product_events composer_opened (sql)", "product_events per-user exact counts",
      fa.opened_writer ?? null,
      crossCheckable ? await distinctUsers("product_events", (q) => q.eq("event", "composer_opened"), ids) : null);
    P("has_draft", "Holds a draft", "content_items + linkedin_posts union (sql)", "per-user exact counts on both tables",
      fa.has_draft ?? null,
      crossCheckable
        ? await (async () => {
          let n = 0;
          for (const id of ids) {
            const c1 = await headCount("content_items", (q) => q.eq("user_id", id).eq("status", "draft"));
            const c2 = await headCount("linkedin_posts", (q) =>
              q.eq("user_id", id).eq("tracking_status", "draft").in("source_type", ["aura_generated", "carousel_studio"]));
            if (c1 + c2 > 0) n += 1;
          }
          return n;
        })()
        : null);
    P("published", "Published", "linkedin_posts tracking_status=published (sql)", "linkedin_posts per-user exact counts",
      fa.published ?? null,
      crossCheckable ? await distinctUsers("linkedin_posts", (q) => q.eq("tracking_status", "published"), ids) : null,
      "product_events post_published cross-check = " + (fa.published_xc ?? "?"));

    // Drafts — never the whole linkedin_posts table.
    const draftsCiB = await headCount("content_items", (q) => q.in("user_id", ids).eq("status", "draft"));
    const draftsLiB = await headCount("linkedin_posts", (q) =>
      q.in("user_id", ids).eq("tracking_status", "draft").in("source_type", ["aura_generated", "carousel_studio"]));
    P("drafts_total", "Drafts waiting", "content_items + linkedin_posts filtered by source_type (sql)",
      "same two tables, exact head counts",
      (A.drafts?.content_items ?? 0) + (A.drafts?.linkedin_posts ?? 0), draftsCiB + draftsLiB,
      "linkedin_export and search_discovery are the user's own imported history and are NOT drafts");

    const failedB = await headCount("linkedin_posts", (q) => q.in("user_id", ids).eq("tracking_status", "failed"));
    P("failed_publishes", "Failed publishes", "linkedin_posts tracking_status=failed (sql)", "exact head count",
      size(A.failed_publishes ?? []), failedB);

    const engagementsB = await headCount("signal_engagements", (q) => q.in("user_id", ids));
    P("signal_engagement_rows", "Signal engagement rows", "signal_engagements (sql)", "exact head count",
      A.signal_reads?.engagements ?? null, engagementsB);

    const disagreed = audit.disagreements();
    const disagreedN = size(disagreed);

    // ===== derived items =====
    const seen = new Set<string>();
    const needs_you: any[] = [];
    const decide: any[] = [];
    const watch: any[] = [];
    const push = (bucket: any[], fp: string, what: string, impact: string, action: string) => {
      if (seen.has(fp)) return;
      seen.add(fp);
      bucket.push({ fingerprint: fp, what, impact, action });
    };

    for (const f of (A.failed_publishes ?? [])) {
      push(needs_you, `failed_publish:${f.first_name}:${f.date}`,
        `${f.first_name}'s post failed to publish on ${f.date}`,
        "A real user pressed publish and nothing went out.",
        `Open their draft, read the error (“${String(f.error).slice(0, 120)}”), republish for them and tell them it is done.`);
    }
    for (const e of (A.machine?.errors_24h ?? [])) {
      if (e.severity === "critical") {
        push(needs_you, `critical:${e.fn}`, `${e.fn} failed ${e.n} times in 24 hours`,
          "Whatever that function does for users is not happening.",
          `Open the logs for ${e.fn} and fix the top error.`);
      } else {
        push(watch, `high:${e.fn}`, `${e.fn} logged ${e.n} errors`, "Not user-visible yet.", "Keep an eye on it this week.");
      }
    }
    for (const al of (A.machine?.open_alerts ?? [])) {
      const fp = `alert:${al.source}`;
      if (al.severity === "critical") push(needs_you, fp, al.what || al.subject, al.impact || "Open critical alert.", al.action || "Open /admin and clear it.");
      else push(watch, fp, al.what || al.subject, al.impact || "Recorded, not urgent.", al.action || "No action needed today.");
    }
    const spend = Number(A.machine?.spend_mtd ?? 0);
    if (spend > 200) push(needs_you, "spend", `AI spend is $${spend} month to date`, "You are above the comfortable threshold.", "Check which function is burning it in Admin → AI cost.");
    const hoursSinceCapture = A.machine?.hours_since_capture;
    if (hoursSinceCapture !== null && hoursSinceCapture !== undefined && hoursSinceCapture > 72) {
      push(needs_you, "capture_chain", `No user has captured anything for ${hoursSinceCapture} hours`,
        "The whole product starts with a capture. Nothing is flowing in.",
        "Message your two most engaged users and ask what stopped them.");
    }
    if ((A.machine?.queue_failed ?? 0) > 0) {
      push(watch, "queue_failed", `${A.machine.queue_failed} background jobs are sitting failed`, "Some work silently did not finish.", "Retry them from the jobs table.");
    }

    // decide[] — draft-ready-email is built and held in dry-run
    const draftHolders = audit.v("has_draft");
    push(decide, "draft_ready_email",
      "draft-ready-email is built and still held in dry-run",
      `${draftHolders ?? "?"} users hold a draft right now and would receive it if you switched it on.`,
      "Decide: switch it live, or say out loud that it stays off for another week.");

    // jobs — suppression rule
    const jobsOk: any[] = [];
    const jobsFailed: any[] = [];
    const jobsNotDue: any[] = [];
    const jobsDead: any[] = [];
    const nowMs = Date.now();
    for (const j of (A.jobs?.all ?? [])) {
      if (!j.active) continue;
      const parts = String(j.schedule).trim().split(/\s+/);
      const dow = parts[4] ?? "*";
      const dom = parts[2] ?? "*";
      const weekly = dow !== "*" || dom !== "*";
      const lastMs = j.last_run ? new Date(j.last_run).getTime() : 0;
      const ranRecently = lastMs > 0 && nowMs - lastMs < 26 * 3600 * 1000;
      if (j.failed_24h > 0) { jobsFailed.push(j); continue; }
      if (weekly) {
        // Only a fault once its own moment has passed and it did nothing.
        const staleWeekly = lastMs > 0 && nowMs - lastMs > 8 * 24 * 3600 * 1000;
        if (staleWeekly) jobsDead.push(j);
        else jobsNotDue.push(j);
        continue;
      }
      if (j.ok_24h > 0 || ranRecently) jobsOk.push(j);
      else jobsDead.push(j);
    }
    for (const j of jobsFailed) {
      push(needs_you, `job_failed:${j.name}`, `${j.name} failed in the last 24 hours`,
        "A piece of automated work did not happen.", `Run ${j.name} by hand from Admin → Crons and read the error.`);
    }
    for (const j of jobsDead) {
      push(watch, `job_silent:${j.name}`, `${j.name} has not run when it should have`,
        "Scheduled work is silent.", "Check the schedule is still active.");
    }

    const needsN = size(needs_you);
    const decideN = size(decide);
    const watchAll = watch;
    const watchShown = watchAll.slice(0, 5);
    const watchN = size(watchAll);
    const handledN = A.machine?.handled_24h ?? 0;

    // ===== findings (up to 4) =====
    const findings: { colour: string; lead: string; body: string; from: string }[] = [];
    if (needsN > 0) {
      findings.push({
        colour: OX, lead: `${needsN} ${needsN === 1 ? "thing is" : "things are"} blocking a real person right now.`,
        body: "These are not warnings. Somebody tried to do something in Aura and it did not work.",
        from: "linkedin_posts (failed), ef_error_log (critical), ops_alerts (open)",
      });
    }
    const capturedV = audit.v("captured");
    const publishedV = audit.v("published");
    if (capturedV !== null && publishedV !== null && capturedV > 0) {
      findings.push({
        colour: publishedV === 0 ? AMBER : TEAL,
        lead: `${capturedV} people have captured something; ${publishedV} have published.`,
        body: publishedV === 0
          ? "The intake works. The last mile does not. Nothing a user makes is reaching an audience yet."
          : "The chain from capture to published post is intact end to end.",
        from: "entries, linkedin_posts.tracking_status='published'",
      });
    }
    const draftsV = audit.v("drafts_total");
    if (draftsV !== null && draftsV > 0) {
      findings.push({
        colour: DAMBER,
        lead: `${draftsV} drafts are written and waiting, the oldest for ${A.drafts?.oldest_days ?? "?"} days.`,
        body: "Work already exists for these people. They just have not been nudged to send it.",
        from: "content_items status='draft' + linkedin_posts source_type in (aura_generated, carousel_studio)",
      });
    }
    if (!A.signal_reads?.product_event_exists) {
      findings.push({
        colour: MUTED, lead: "We still cannot say whether users read their signals.",
        body: "There is no signal-open event in the product event log at all. This is a gap in our instrumentation, not a fact about users.",
        from: "product_events (no matching event name exists)",
      });
    }
    const findingsShown = findings.slice(0, 4);

    // ===== recommendations =====
    const recommendations: string[] = [];
    if (needsN > 0) recommendations.push(`Unblock the ${needsN} ${needsN === 1 ? "person" : "people"} listed under "needs you" before anything else today.`);
    if (draftsV !== null && draftsV > 0 && publishedV === 0) recommendations.push(`Personally walk one user with a waiting draft all the way to a published post.`);
    if (decideN > 0) recommendations.push(`Make the call on draft-ready-email — it is finished and costing you nothing but delay.`);
    if (size(recommendations) < 3 && !A.signal_reads?.product_event_exists) recommendations.push("Add a signal-open event so tomorrow's brief can tell you whether the intelligence is actually being read.");
    if (size(recommendations) < 3 && watchN > 0) recommendations.push("Clear one item from the watch list so it stops reappearing.");
    if (size(recommendations) === 0) recommendations.push("Nothing needs you. Spend the day on one user conversation.");
    const recs = recommendations.slice(0, 3);

    // ===== coverage =====
    const areas: { name: string; measured: boolean }[] = [
      { name: "Journey funnel", measured: true },
      { name: "Drafts and publishing", measured: true },
      { name: "LinkedIn connection health", measured: true },
      { name: "Overnight agent", measured: true },
      { name: "Automated jobs", measured: true },
      { name: "AI spend", measured: true },
      { name: "Whether signals are read", measured: !!A.signal_reads?.product_event_exists },
      { name: "Email open and click rates", measured: false },
      { name: "Time spent in the app per session", measured: false },
      { name: "Why a user stopped coming back", measured: false },
    ];
    const measuredN = size(areas.filter((a) => a.measured));
    const totalAreas = size(areas);
    const unmeasured = areas.filter((a) => !a.measured).map((a) => a.name);

    // ===== payload =====
    const now = new Date();
    const briefDate = now.toISOString().slice(0, 10);
    const hhmm = now.toISOString().slice(11, 16);
    const weekday = now.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
    const dayNum = now.getUTCDate();
    const monthName = now.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });

    const payload = {
      brief_date: briefDate,
      counted_at_utc: hhmm,
      excluded: { founder: FOUNDER_ID, test_users: A.excluded_test_users ?? 0 },
      funnel: fa,
      drafts: A.drafts,
      failed_publishes: A.failed_publishes,
      signal_reads: A.signal_reads,
      grid: A.grid,
      people: A.people,
      assets: A.assets,
      voc: A.voc,
      agent: A.agent,
      machine: A.machine,
      needs_you, decide, watch: watchShown, handled: handledN,
      coverage: { measured_areas: measuredN, total_areas: totalAreas, unmeasured },
      recommendations: recs,
      findings: findingsShown,
      jobs: { ok: jobsOk, failed: jobsFailed, not_due: jobsNotDue, dead: jobsDead },
    };
    const auditObj = {
      disagreements: disagreedN,
      pairs: audit.pairs,
      cross_check_mode: crossCheckable ? "full" : "skipped (too many users for per-user counts)",
    };

    // ===== render =====
    const subject = `Aura — ${weekday} ${dayNum} ${monthName}: ${needsN} need you`;

    const gridRows = (() => {
      const g = A.grid ?? [];
      const rows: { k: string; l: string }[] = [
        { k: "captures", l: "Captures" }, { k: "signals", l: "Signals made" },
        { k: "composer", l: "Writer opened" }, { k: "published", l: "Published" },
      ];
      let head = `<tr><td style="font-family:${MONO};font-size:9px;color:${MUTED}"></td>` +
        g.map((d: any) => `<td align="center" style="font-family:${MONO};font-size:9px;color:${MUTED};padding-bottom:3px">${esc(d.d)}</td>`).join("") + `</tr>`;
      const bodyRows = rows.map((r) => {
        let max = 0;
        for (const d of g) max = Math.max(max, Number(d[r.k] ?? 0));
        return `<tr><td style="font-family:${MONO};font-size:10px;color:${MUTED};padding-right:6px;white-space:nowrap">${r.l}</td>` +
          g.map((d: any) => gridCell(Number(d[r.k] ?? 0), max)).join("") + `</tr>`;
      }).join("");
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${head}${bodyRows}</table>`;
    })();

    const invitedTotal = audit.v("invited") ?? invitedB ?? 1;
    const funnelStages: { key: string; name: string; lost: string }[] = [
      { key: "invited", name: "Invited", lost: "Everyone with an account, founder and test accounts removed." },
      { key: "signed_in", name: "Signed in", lost: `${(audit.v("invited") ?? 0) - (audit.v("signed_in") ?? 0)} were invited and never came in.` },
      { key: "finished_setup", name: "Finished setup", lost: `${(audit.v("signed_in") ?? 0) - (audit.v("finished_setup") ?? 0)} signed in and stopped before finishing setup.` },
      { key: "captured", name: "Captured something", lost: `${(audit.v("finished_setup") ?? 0) - (audit.v("captured") ?? 0)} finished setup and never put anything in.` },
      { key: "got_signal", name: "Got a signal", lost: `${(audit.v("captured") ?? 0) - (audit.v("got_signal") ?? 0)} captured but nothing rose to a signal yet.` },
      { key: "linkedin_live", name: "LinkedIn live", lost: `Read from the connections table only — profile text fields are ignored.` },
      { key: "opened_writer", name: "Opened the writer", lost: `${(audit.v("got_signal") ?? 0) - (audit.v("opened_writer") ?? 0)} got a signal and never opened the writer.` },
      { key: "has_draft", name: "Holds a draft", lost: `Drafts only — imported LinkedIn history is excluded.` },
      { key: "published", name: "Published", lost: `${(audit.v("has_draft") ?? 0) - (audit.v("published") ?? 0)} hold a written draft that has never gone out.` },
    ];

    const assets = A.assets ?? {};
    const assetTotal = Number(assets.total ?? 0) || 1;

    const html = `<!doctype html><html><body style="margin:0;padding:0;background:${PAPER}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${PAPER}" style="background:${PAPER};padding:18px 10px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${CARD}" style="max-width:680px;background:${CARD};border:1px solid ${RULE}">

<!-- 1 masthead -->
<tr><td style="padding:22px 22px 16px;border-bottom:1px solid ${RULE}">
  <div style="font-family:${SERIF};font-size:22px;color:${INK}">AURA &middot; Daily Brief</div>
  <div style="font-family:${SERIF};font-size:14px;color:${MUTED};padding-top:3px">${esc(weekday)} ${dayNum} ${esc(monthName)}</div>
  <div style="font-family:${MONO};font-size:10px;text-transform:uppercase;letter-spacing:.16em;color:${MUTED};padding-top:8px">Counted live at ${hhmm} UTC</div>
  <div style="font-family:${SERIF};font-size:12px;color:${MUTED};padding-top:4px">Every number below was counted at that moment. Nothing is copied from yesterday.</div>
  ${disagreedN > 0 ? `<div style="font-family:${SERIF};font-size:14px;color:${OX};padding-top:10px"><b>${disagreedN} number${disagreedN === 1 ? "" : "s"} disagreed with their cross-check today.</b></div>` : ""}
  ${A.excluded_test_users ? `<div style="font-family:${MONO};font-size:10px;color:${MUTED};padding-top:6px">${A.excluded_test_users} test account${A.excluded_test_users === 1 ? "" : "s"} and the founder account excluded from every user number.</div>` : ""}
</td></tr>

<!-- 2 verdict strip -->
<tr><td style="padding:16px 22px 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
  ${statBox(String(needsN), "Needs you", OX)}
  ${statBox(String(decideN), "Decide", DAMBER)}
  ${statBox(String(watchN), "Watch", AMBER)}
  ${statBox(String(handledN), "Handled", TEAL)}
</tr></table>
<!-- 3 legend -->
<div style="font-family:${MONO};font-size:10px;color:${MUTED};padding:8px 0 0;line-height:1.7">
  <span style="color:${OX}">&#9679;</span> a user is blocked right now &nbsp;
  <span style="color:${DAMBER}">&#9679;</span> waiting on your decision &nbsp;
  <span style="color:${AMBER}">&#9679;</span> keep an eye, no action &nbsp;
  <span style="color:${TEAL}">&#9679;</span> healthy
</div>
</td></tr>

<!-- 4 findings -->
${sectionOpen("What today's numbers say")}
${findingsShown.map((f) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px"><tr>
  <td width="7" bgcolor="${f.colour}" style="font-size:1px;line-height:1px">&nbsp;</td>
  <td style="padding-left:12px">
    ${prose(`<b>${esc(f.lead)}</b>`)}
    ${prose(`<span style="color:${MUTED}">${esc(f.body)}</span>`)}
    <div style="font-family:${MONO};font-size:10px;color:${MUTED};padding-top:5px">counted from: ${esc(f.from)}</div>
  </td></tr></table>`).join("")}
${sectionClose(needsN > 0 ? "Start at the top of the needs-you list — it is the only part of this brief a user can feel." : "Nothing here is on fire. Use the day for one real user conversation.")}

<!-- 5 three things -->
<tr><td style="padding:22px 22px 0">
${label("If you do three things today")}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#EDF6F3" style="border:1px solid #BFE3DA"><tr><td style="padding:14px 16px">
${recs.map((r, i) => `<div style="font-family:${SERIF};font-size:15px;color:${INK};padding:4px 0"><b>${i + 1}.</b> ${esc(r)}</div>`).join("")}
</td></tr></table>
</td></tr>

<!-- 6 journey -->
${sectionOpen("The journey")}
${funnelStages.map((s) => bar(s.name, audit.get(s.key)?.agree ? (audit.v(s.key) ?? 0) : audit.n(s.key), invitedTotal, s.key === "published" ? TEAL : AMBER, s.lost)).join("")}
${sectionClose("Find the single widest drop above and fix only that one this week.")}

<!-- 7 fourteen days -->
${sectionOpen("Last 14 days")}
${gridRows}
${sectionClose("A row of dots means the product went quiet. That is worth a message, not a dashboard.")}

<!-- 8 assets -->
${sectionOpen("What your users actually have")}
${bar("Finished setup", Number(assets.onboarding_completed ?? 0), assetTotal, AMBER, `out of ${assetTotal} who started`)}
${bar("Did the audit", Number(assets.audit ?? 0), assetTotal, AMBER)}
${bar("Brand assessment", Number(assets.brand ?? 0), assetTotal, AMBER)}
${bar("LinkedIn connected", Number(assets.linkedin ?? 0), assetTotal, AMBER)}
${bar("Has a report", Number(assets.report ?? 0), assetTotal, AMBER)}
${bar("Has a photo", Number(assets.avatar ?? 0), assetTotal, AMBER)}
${bar("Has published", Number(assets.published ?? 0), assetTotal, TEAL)}
${sectionClose("The lowest bar is the thing your users are quietly missing. Give it to them rather than asking for it.")}

<!-- 9 intelligence -->
${sectionOpen("The intelligence you are delivering")}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
  ${statBox(audit.n("got_signal"), "Users with signals", INK)}
  ${statBox(String(A.signal_reads?.engagements ?? 0), "Signal opens logged", INK)}
  ${statBox(A.signal_reads?.product_event_exists ? String(A.signal_reads?.product_event_rows ?? 0) : `?`, A.signal_reads?.product_event_exists ? "Signal view events" : "Not measured", MUTED)}
  ${statBox(audit.n("drafts_total"), "Drafts waiting", DAMBER)}
</tr></table>
${sectionClose("If opens stay unmeasured, you are guessing about the one thing the product is for.")}

<!-- 10 overnight agent -->
${sectionOpen("The overnight agent")}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${CARD}" style="border:1px solid ${RULE}"><tr><td style="padding:12px 14px">
${dotLine(TEAL, `${A.agent?.findings_7d ?? 0} findings in the last 7 days`)}
${dotLine(TEAL, `${A.agent?.users_covered ?? 0} users covered`)}
${dotLine((A.agent?.pending ?? 0) > 0 ? AMBER : TEAL, `${A.agent?.pending ?? 0} still waiting to be reviewed`)}
${dotLine(TEAL, `${A.agent?.became_entries ?? 0} became a saved entry`)}
${dotLine((A.agent?.last_night ?? 0) > 0 ? TEAL : AMBER, `${A.agent?.last_night ?? 0} produced last night`)}
</td></tr></table>
${sectionClose("If last night produced nothing, the agent is asleep — that is a fault, not a quiet day.")}

<!-- 11 people -->
${sectionOpen("Who needs you today")}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>${["", "Person", "Captures", "Drafts", "LinkedIn", "Last capture", "Next move"].map((h) => `<td style="font-family:${MONO};font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:${MUTED};padding:0 5px 5px">${esc(h)}</td>`).join("")}</tr>
${(A.people ?? []).map((p: any) => {
      const stalled = p.days_since_capture === null || p.days_since_capture === undefined || p.days_since_capture > 14;
      const colour = p.drafts > 0 && p.published === 0 ? DAMBER : stalled ? OX : TEAL;
      const next = p.captures === 0
        ? "Has never captured — ask them what they were hoping for."
        : p.drafts > 0 && p.published === 0
          ? "Has a draft and has never published — walk them through one post."
          : p.linkedin !== "live"
            ? "LinkedIn is not connected — reconnect it with them."
            : stalled ? "Gone quiet — send a personal message." : "Healthy. Leave them alone.";
      return `<tr>
    <td style="padding:5px;color:${colour};font-size:13px">&#9679;</td>
    <td style="font-family:${SERIF};font-size:13px;color:${INK};padding:5px">${esc(p.first_name)}</td>
    <td style="font-family:${MONO};font-size:12px;color:${INK};padding:5px">${p.captures ?? 0}</td>
    <td style="font-family:${MONO};font-size:12px;color:${INK};padding:5px">${p.drafts ?? 0}</td>
    <td style="font-family:${MONO};font-size:11px;color:${MUTED};padding:5px">${esc(p.linkedin)}</td>
    <td style="font-family:${MONO};font-size:11px;color:${MUTED};padding:5px">${p.days_since_capture === null || p.days_since_capture === undefined ? "never" : p.days_since_capture + "d"}</td>
    <td style="font-family:${SERIF};font-size:12px;color:${MUTED};padding:5px">${esc(next)}</td>
  </tr>`;
    }).join("")}
</table>
${sectionClose("Pick the top oxblood dot and write to that person by name today.")}

<!-- 12 buckets -->
${sectionOpen("Needs you")}
${needsN > 0 ? needs_you.map((i) => callout(OX, i.what, [i.impact, "→ " + i.action])).join("") : prose(`<span style="color:${MUTED}">Nothing is blocking a user right now.</span>`)}
${sectionClose(needsN > 0 ? "Do these before opening anything else." : "No action. This is what a good day looks like.")}

${sectionOpen("Decide")}
${decide.map((i) => callout(DAMBER, i.what, [i.impact, "→ " + i.action])).join("")}
${sectionClose("A decision deferred is a feature you paid for and are not using.")}

${sectionOpen("Watch")}
${watchN > 0 ? watchShown.map((i) => callout(AMBER, i.what, [i.impact, "→ " + i.action])).join("") + (watchN > 5 ? `<div style="font-family:${MONO};font-size:10px;color:${MUTED}">${watchN - 5} more not shown</div>` : "") : prose(`<span style="color:${MUTED}">Nothing on the watch list.</span>`)}
${sectionClose("Watch items need attention only if the same one appears three mornings running.")}

${sectionOpen("Closed")}
${prose(`<b>${handledN}</b> routine events were handled automatically in the last 24 hours and are not listed.`)}
${sectionClose("This number going to zero means logging broke, not that the system went quiet.")}

<!-- 13 automated work -->
${sectionOpen("The automated work")}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
  <td width="50%" bgcolor="${CARD}" style="border:1px solid ${RULE};padding:12px" valign="top">
    <div style="font-family:${MONO};font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:${MUTED}">Ran clean</div>
    <div style="font-family:${MONO};font-size:22px;color:${TEAL};padding-top:5px">${size(jobsOk)}</div>
  </td>
  <td width="50%" bgcolor="${CARD}" style="border:1px solid ${RULE};padding:12px" valign="top">
    <div style="font-family:${MONO};font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:${MUTED}">Not due yet</div>
    <div style="font-family:${MONO};font-size:22px;color:${MUTED};padding-top:5px">${size(jobsNotDue)}</div>
  </td>
</tr></table>
${size(jobsNotDue) > 0 ? `<div style="padding-top:10px">${jobsNotDue.map((j: any) => `<div style="font-family:${MONO};font-size:11px;color:${MUTED};padding:2px 0">${esc(j.name)} — last ran ${j.last_run ? esc(String(j.last_run).slice(0, 10)) : "never"} · schedule ${esc(j.schedule)} · not due yet</div>`).join("")}</div>` : ""}
${size(jobsFailed) > 0 ? `<div style="padding-top:8px">${jobsFailed.map((j: any) => `<div style="font-family:${MONO};font-size:11px;color:${OX};padding:2px 0">${esc(j.name)} — ${j.failed_24h} failures in 24h</div>`).join("")}</div>` : ""}
${sectionClose("A weekly job that ran cleanly last week is not a problem on a Sunday. Only the red lines matter.")}

<!-- 14 engine room -->
${sectionOpen("The engine room")}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#EAE3D5" style="border:1px solid ${RULE}"><tr>
<td width="50%" valign="top" style="padding:12px 14px">
  ${dotLine(size(jobsFailed) === 0 ? TEAL : OX, `${size(jobsOk)} jobs ran clean`)}
  ${dotLine((A.machine?.queue_failed ?? 0) === 0 ? TEAL : AMBER, `${A.machine?.queue_pending ?? 0} queued, ${A.machine?.queue_failed ?? 0} failed`)}
  ${dotLine((A.machine?.open_findings ?? 0) === 0 ? TEAL : AMBER, `${A.machine?.open_findings ?? 0} invariants failing`)}
</td>
<td width="50%" valign="top" style="padding:12px 14px">
  ${dotLine((A.machine?.api_health?.failed ?? 0) === 0 ? TEAL : OX, `AI providers: ${(A.machine?.api_health?.checked ?? 0) - (A.machine?.api_health?.failed ?? 0)}/${A.machine?.api_health?.checked ?? 0} up`)}
  ${dotLine(spend > 200 ? OX : TEAL, `$${spend} spent this month`)}
  ${dotLine((hoursSinceCapture ?? 999) > 72 ? OX : TEAL, `${hoursSinceCapture ?? "?"}h since the last user capture`)}
</td>
</tr></table>
${sectionClose("The engine is only interesting when a light is not teal.")}

<!-- 15 not measured -->
${sectionOpen("Not measured yet")}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border:1px dashed ${RULE};padding:12px 14px">
${prose(`We can honestly speak to <b>${measuredN} of ${totalAreas}</b> areas.`)}
${unmeasured.map((u) => `<div style="font-family:${MONO};font-size:11px;color:${MUTED};padding:2px 0">— ${esc(u)}</div>`).join("")}
</td></tr></table>
${sectionClose("Every line here is a question you cannot answer yet. Pick one and instrument it.")}

<!-- 16 audit -->
${sectionOpen("How every headline number was checked")}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>${["Claim", "Counted from", "Cross-check", "", ""].map((h) => `<td style="font-family:${MONO};font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:${MUTED};padding:0 5px 5px">${esc(h)}</td>`).join("")}</tr>
${audit.pairs.map((p) => `<tr>
  <td style="font-family:${SERIF};font-size:12px;color:${INK};padding:4px 5px;border-top:1px solid ${RULE}">${esc(p.label)}</td>
  <td style="font-family:${MONO};font-size:10px;color:${MUTED};padding:4px 5px;border-top:1px solid ${RULE}">${esc(p.route_a)}</td>
  <td style="font-family:${MONO};font-size:10px;color:${MUTED};padding:4px 5px;border-top:1px solid ${RULE}">${esc(p.route_b)}</td>
  <td style="font-family:${MONO};font-size:11px;color:${INK};padding:4px 5px;border-top:1px solid ${RULE}">${p.a ?? "?"} / ${p.b ?? "?"}</td>
  <td style="font-family:${MONO};font-size:13px;color:${p.agree ? TEAL : OX};padding:4px 5px;border-top:1px solid ${RULE}">${p.agree ? "&#10003;" : "&#10007;"}</td>
</tr>${p.note ? `<tr><td colspan="5" style="font-family:${MONO};font-size:10px;color:${MUTED};padding:0 5px 4px">${esc(p.note)}</td></tr>` : ""}`).join("")}
</table>
${sectionClose("A cross on any row means do not act on that number until it is reconciled.")}

<!-- 17 footer -->
<tr><td style="padding:20px 22px 24px;border-top:1px solid ${RULE}">
<div style="font-family:${SERIF};font-size:13px;color:${MUTED};line-height:1.6">This brief arrives every morning even when nothing is wrong. If it does not arrive, that is the alarm.</div>
</td></tr>

</table></td></tr></table></body></html>`;

    // ===== store (never let a write be the last thing that can throw before send) =====
    try {
      await admin.from("daily_brief_snapshots")
        .upsert({ brief_date: briefDate, payload, audit: auditObj }, { onConflict: "brief_date" });
    } catch (e) {
      await safeLog(admin, "high", `snapshot write failed: ${(e as Error).message}`);
    }

    // ===== send =====
    let sent = false;
    let resendStatus = 0;
    let resendError = "";
    if (!dryRun) {
      const RESEND = Deno.env.get("RESEND_API_KEY") || "";
      const TO = Deno.env.get("ADMIN_ALERT_EMAIL") || "";
      if (!RESEND || !TO) {
        resendError = !RESEND ? "RESEND_API_KEY missing" : "ADMIN_ALERT_EMAIL missing";
      } else {
        try {
          const resp = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
            body: JSON.stringify({ from: "Aura <alerts@aura-intel.org>", to: [TO], subject, html }),
          });
          resendStatus = resp.status;
          sent = resp.ok;
          if (!resp.ok) resendError = (await resp.text()).slice(0, 300);
        } catch (e) {
          resendError = (e as Error).message;
        }
      }
    }

    await safeLog(admin, "info",
      `FOUNDER_BRIEF needs=${needsN} decide=${decideN} watch=${watchN} handled=${handledN} disagreements=${disagreedN} sent=${sent}`,
      { brief_date: briefDate, dry_run: dryRun, resend_status: resendStatus });

    return json({
      ok: true, dry_run: dryRun, subject, sent, resend_status: resendStatus,
      resend_error: resendError || null, audit: auditObj, payload,
      ...(dryRun && body?.include_html === true ? { html } : {}),
    });
  } catch (e) {
    await safeLog(admin, "critical", `founder-daily-brief failed: ${(e as Error).message}`);
    return json({ error: (e as Error).message }, 500);
  }
});
