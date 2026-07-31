// qa-sentinel — daily outcome assertions over the live platform.
//
// Every check asserts an OUTCOME (something a user would notice), never a
// dependency. Each check can genuinely pass AND fail on real data.
// One qa_runs row is written per check per run.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { isAuraPublishedPost } from "../_shared/postProvenance.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const FOUNDER_ID = "9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3";

type Status = "pass" | "fail" | "warn";
type Check = { check_key: string; status: Status; detail: string; value_json: Record<string, unknown> };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

/** Real user ids: founder and any test-looking email excluded. */
async function realUserIds(admin: any): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    const users = data?.users ?? [];
    for (const u of users) {
      const email = (u.email ?? "").toLowerCase();
      if (u.id === FOUNDER_ID) continue;
      if (email.includes("test")) continue;
      ids.add(u.id);
    }
    if (users.length < 200) break;
  }
  return ids;
}

async function checkOvernightFreshness(admin: any, real: Set<string>): Promise<Check> {
  const since = hoursAgo(36);
  const ids = [...real];
  const countIn = async (table: string) => {
    if (!ids.length) return 0;
    const { count } = await admin
      .from(table)
      .select("id", { count: "exact", head: true })
      .gte("created_at", since)
      .in("user_id", ids);
    return count ?? 0;
  };
  const signals = await countIn("strategic_signals");
  const fragments = await countIn("evidence_fragments");
  const entries = await countIn("entries");
  const value = { window_hours: 36, signals, fragments, entries, users: ids.length };

  if (signals + fragments > 0) {
    return {
      check_key: "overnight_freshness",
      status: "pass",
      detail: `${signals} signals and ${fragments} evidence fragments written in the last 36h.`,
      value_json: value,
    };
  }
  if (entries === 0) {
    return {
      check_key: "overnight_freshness",
      status: "warn",
      detail: "No signals or fragments in 36h, but nobody captured anything either — nothing to work from.",
      value_json: value,
    };
  }
  return {
    check_key: "overnight_freshness",
    status: "fail",
    detail: `${entries} captures in the last 36h but zero signals or evidence fragments were produced.`,
    value_json: value,
  };
}

async function checkCronHeartbeat(admin: any): Promise<Check> {
  const { data, error } = await admin.rpc("qa_cron_success_jobs", { p_hours: 26 });
  if (error) {
    return {
      check_key: "cron_heartbeat",
      status: "fail",
      detail: `Could not read scheduled job history: ${error.message}`,
      value_json: { error: error.message },
    };
  }
  const rows = (data ?? []) as Array<{ jobname: string; runs: number; last_end: string }>;
  const names = rows.map((r) => r.jobname);
  const imprint = rows.find((r) => (r.jobname || "").includes("imprint"));
  if (!imprint) {
    return {
      check_key: "cron_heartbeat",
      status: "fail",
      detail: `compute-imprint has not succeeded in the last 26h. Jobs that did run: ${names.join(", ") || "none"}.`,
      value_json: { window_hours: 26, jobs: names },
    };
  }
  return {
    check_key: "cron_heartbeat",
    status: "pass",
    detail: `${names.length} scheduled jobs succeeded in the last 26h, including ${imprint.jobname}.`,
    value_json: { window_hours: 26, jobs: names, imprint_last_end: imprint.last_end },
  };
}

async function checkFaults(admin: any): Promise<Check> {
  const since = hoursAgo(24);
  const { data, error } = await admin
    .from("ef_faults")
    .select("function_name, created_at")
    .gte("created_at", since)
    .limit(500);
  if (error) {
    return {
      check_key: "faults_last_24h",
      status: "fail",
      detail: `Could not read the fault log: ${error.message}`,
      value_json: { error: error.message },
    };
  }
  const rows = (data ?? []) as Array<{ function_name: string }>;
  const n = rows.length;
  const names = [...new Set(rows.map((r) => r.function_name).filter(Boolean))];
  if (n === 0) {
    return {
      check_key: "faults_last_24h",
      status: "pass",
      detail: "No faults recorded in the last 24 hours.",
      value_json: { count: 0 },
    };
  }
  const status: Status = n > 3 ? "fail" : "warn";
  return {
    check_key: "faults_last_24h",
    status,
    detail: `${n} fault${n === 1 ? "" : "s"} in the last 24h from: ${names.join(", ")}.`,
    value_json: { count: n, functions: names },
  };
}

async function checkFoundingSeats(admin: any): Promise<Check> {
  const { data, error } = await admin.rpc("founding_seats");
  if (error) {
    return {
      check_key: "founding_seats_sane",
      status: "fail",
      detail: `Seat count could not be read: ${error.message}`,
      value_json: { error: error.message },
    };
  }
  const row = Array.isArray(data) ? data[0] : data;
  const claimed = Number(row?.claimed);
  const cap = Number(row?.cap);
  const ok = Number.isFinite(claimed) && claimed >= 1 && claimed <= 50;
  return {
    check_key: "founding_seats_sane",
    status: ok ? "pass" : "fail",
    detail: ok
      ? `${claimed} of ${cap} founding seats taken — the number on the landing page is sane.`
      : `Founding seat count is ${row?.claimed} — outside the sane range of 1 to 50.`,
    value_json: { claimed: row?.claimed ?? null, cap: row?.cap ?? null },
  };
}

async function checkLandingUp(): Promise<Check> {
  const url = "https://www.aura-intel.org";
  const started = Date.now();
  try {
    const res = await fetch(url, { method: "GET", redirect: "follow" });
    const ms = Date.now() - started;
    const ok = res.status === 200;
    // Drain the body so the connection is released.
    await res.text().catch(() => "");
    return {
      check_key: "landing_up",
      status: ok ? "pass" : "fail",
      detail: ok
        ? `The public site answered 200 in ${ms}ms.`
        : `The public site answered ${res.status}.`,
      value_json: { url, status: res.status, ms },
    };
  } catch (e) {
    return {
      check_key: "landing_up",
      status: "fail",
      detail: `The public site could not be reached: ${(e as Error).message}`,
      value_json: { url, error: (e as Error).message },
    };
  }
}

async function checkPublishedCounts(admin: any, real: Set<string>): Promise<Check> {
  const rows: Array<{ user_id: string; source_type: string; tracking_status: string; published_at: string | null }> = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("linkedin_posts")
      .select("user_id, source_type, tracking_status, published_at")
      .range(from, from + PAGE - 1);
    if (error) {
      return {
        check_key: "published_counts_consistent",
        status: "fail",
        detail: `Could not read published posts: ${error.message}`,
        value_json: { error: error.message },
      };
    }
    const batch = data ?? [];
    rows.push(...(batch as any));
    if (batch.length < PAGE) break;
  }
  const perUser = new Map<string, { published: number; aura: number }>();
  for (const r of rows) {
    if (!real.has(r.user_id)) continue;
    const e = perUser.get(r.user_id) ?? { published: 0, aura: 0 };
    if (r.published_at) e.published++;
    if (isAuraPublishedPost(r)) e.aura++;
    perUser.set(r.user_id, e);
  }
  const violations = [...perUser.entries()]
    .filter(([, v]) => v.published < v.aura)
    .map(([user_id, v]) => ({ user_id, ...v }));
  return {
    check_key: "published_counts_consistent",
    status: violations.length === 0 ? "pass" : "fail",
    detail: violations.length === 0
      ? `Published totals are at least the Aura-written totals for all ${perUser.size} users.`
      : `${violations.length} user(s) show more Aura-published posts than total published posts.`,
    value_json: { users: perUser.size, violations },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

  const bearer = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const cronHeader = req.headers.get("x-cron-secret") || "";
  const apiKeyHeader = req.headers.get("apikey") || "";
  const isServiceRole = !!bearer && (bearer === serviceKey || apiKeyHeader === serviceKey);
  const isCron = !!CRON_SECRET && cronHeader === CRON_SECRET;

  const admin = createClient(supabaseUrl, serviceKey);

  let isAdmin = false;
  if (!isServiceRole && !isCron && bearer) {
    const userClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (user) {
      const { data: flag } = await userClient.rpc("is_current_user_admin" as never);
      isAdmin = !!flag;
    }
  }
  if (!isServiceRole && !isCron && !isAdmin) return json({ error: "Unauthorized" }, 401);

  try {
    const real = await realUserIds(admin);
    const checks: Check[] = [];
    checks.push(await checkOvernightFreshness(admin, real));
    checks.push(await checkCronHeartbeat(admin));
    checks.push(await checkFaults(admin));
    checks.push(await checkFoundingSeats(admin));
    checks.push(await checkLandingUp());
    checks.push(await checkPublishedCounts(admin, real));

    const run_at = new Date().toISOString();
    const { error: insErr } = await admin
      .from("qa_runs")
      .insert(checks.map((c) => ({ ...c, run_at })));
    if (insErr) throw new Error(`qa_runs insert: ${insErr.message}`);

    return json({
      ok: true,
      run_at,
      failed: checks.filter((c) => c.status === "fail").length,
      warned: checks.filter((c) => c.status === "warn").length,
      checks,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});