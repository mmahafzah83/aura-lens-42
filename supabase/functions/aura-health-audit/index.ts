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

type Severity = "critical" | "warn" | "info";
type Finding = { code: string; severity: Severity; detail: string };

const FRESHNESS: Array<{ table: string; days: number; severity: Severity }> = [
  { table: "lifecycle_email_log",    days: 3,  severity: "warn" },
  { table: "imprint_snapshots",      days: 2,  severity: "critical" },
  { table: "linkedin_post_metrics",  days: 3,  severity: "warn" },
  { table: "product_events",         days: 2,  severity: "warn" },
  { table: "strategic_signals",      days: 14, severity: "info" },
];

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86_400_000);
}

async function runFreshnessChecks(admin: any): Promise<Finding[]> {
  const findings: Finding[] = [];
  const now = new Date();
  for (const { table, days, severity } of FRESHNESS) {
    // Prefer updated_at if present else created_at. Try updated_at first.
    let latest: string | null = null;
    for (const col of ["updated_at", "created_at"]) {
      const { data, error } = await admin
        .from(table)
        .select(col)
        .order(col, { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!error && data && (data as any)[col]) {
        latest = (data as any)[col];
        break;
      }
    }
    if (!latest) continue; // table never had a row → skip
    const ageDays = daysBetween(now, new Date(latest));
    if (ageDays > days) {
      findings.push({
        code: `freshness.${table}`,
        severity,
        detail: `${table} last write ${ageDays}d ago (threshold ${days}d).`,
      });
    }
  }
  return findings;
}

async function checkCoverage(admin: any): Promise<Finding[]> {
  // Documents completed but evidence_jobs didn't cover all chunks.
  const { data: docs } = await admin
    .from("documents")
    .select("id, filename")
    .eq("status", "completed")
    .limit(500);
  if (!docs?.length) return [];
  const out: Finding[] = [];
  for (const d of docs as Array<{ id: string; filename: string }>) {
    const { data: reg } = await admin
      .from("source_registry")
      .select("id")
      .eq("source_type", "document")
      .eq("source_id", d.id)
      .maybeSingle();
    if (!reg?.id) continue;
    const { data: job } = await admin
      .from("evidence_jobs")
      .select("cursor, total, status")
      .eq("source_registry_id", reg.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!job || !job.total) continue;
    const { count: chunkCount } = await admin
      .from("document_chunks")
      .select("id", { count: "exact", head: true })
      .eq("document_id", d.id);
    const chunks = chunkCount || 0;
    const read = job.cursor || 0;
    if (chunks > 0 && read < chunks) {
      const ratio = ((read / chunks) * 100).toFixed(0);
      out.push({
        code: `coverage.document.${d.id}`,
        severity: "critical",
        detail: `Document "${d.filename}" evidence read ${read}/${chunks} chunks (${ratio}%).`,
      });
      if (out.length >= 25) break;
    }
  }
  return out;
}

async function checkOrphanSources(admin: any): Promise<Finding[]> {
  // source_registry.processed=true with zero evidence_fragments.
  const { data } = await admin.rpc as unknown; // fallback: run via SQL below
  const { count } = await admin
    .from("source_registry")
    .select("id", { count: "exact", head: true })
    .eq("processed", true)
    .or("fragment_count.is.null,fragment_count.eq.0");
  const n = count || 0;
  if (n === 0) return [];
  return [{
    code: "orphan.source_registry",
    severity: "warn",
    detail: `${n} processed source_registry rows have 0 evidence_fragments.`,
  }];
}

async function checkDeadEndFragments(admin: any): Promise<Finding[]> {
  // Users with >20 fragments but 0 active signals.
  const { data: fragUsers } = await admin
    .from("evidence_fragments")
    .select("user_id")
    .limit(50000);
  if (!fragUsers?.length) return [];
  const counts = new Map<string, number>();
  for (const r of fragUsers as Array<{ user_id: string }>) {
    counts.set(r.user_id, (counts.get(r.user_id) || 0) + 1);
  }
  const candidates = Array.from(counts.entries()).filter(([, n]) => n > 20).map(([u]) => u);
  if (!candidates.length) return [];
  const { data: sigRows } = await admin
    .from("strategic_signals")
    .select("user_id")
    .eq("status", "active")
    .in("user_id", candidates);
  const withSignals = new Set((sigRows || []).map((r: any) => r.user_id));
  const bad = candidates.filter(u => !withSignals.has(u));
  if (!bad.length) return [];
  return [{
    code: "pipeline.dead_end_fragments",
    severity: "critical",
    detail: `${bad.length} user(s) have >20 evidence fragments but 0 active signals.`,
  }];
}

async function checkStuckJobs(admin: any): Promise<Finding[]> {
  const cutoff = new Date(Date.now() - 15 * 60_000).toISOString();
  const out: Finding[] = [];
  const { count: evStuck } = await admin
    .from("evidence_jobs")
    .select("id", { count: "exact", head: true })
    .not("status", "in", "(complete,failed)")
    .lt("last_heartbeat", cutoff);
  if ((evStuck || 0) > 0) {
    out.push({
      code: "stuck.evidence_jobs",
      severity: "warn",
      detail: `${evStuck} evidence_jobs stuck (heartbeat >15m).`,
    });
  }
  const { count: docStuck } = await admin
    .from("document_jobs")
    .select("id", { count: "exact", head: true })
    .not("stage", "in", "(complete,failed)")
    .lt("last_heartbeat", cutoff);
  if ((docStuck || 0) > 0) {
    out.push({
      code: "stuck.document_jobs",
      severity: "warn",
      detail: `${docStuck} document_jobs stuck (heartbeat >15m).`,
    });
  }
  return out;
}

async function checkErrorRate(admin: any): Promise<Finding[]> {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data } = await admin
    .from("ef_error_log")
    .select("function_name")
    .eq("severity", "high")
    .gte("created_at", since)
    .limit(500);
  const rows = (data || []) as Array<{ function_name: string }>;
  if (!rows.length) return [];
  const fns = Array.from(new Set(rows.map(r => r.function_name).filter(Boolean))).sort();
  return [{
    code: "errors.ef_high_24h",
    severity: "warn",
    detail: `${rows.length} high-severity errors in 24h across: ${fns.join(", ")}.`,
  }];
}

async function checkEmailCronsSilent(admin: any): Promise<Finding[]> {
  try {
    const { data, error } = await admin.rpc("email_crons_ran_without_sends", { p_hours: 24 });
    if (error) return [];
    const row = Array.isArray(data) ? data[0] : data;
    const cronsRan: number = row?.crons_ran ?? 0;
    const rowsAdded: number = row?.rows_added ?? 0;
    const ranJobs: string[] = row?.ran_jobs ?? [];
    if (cronsRan > 0 && rowsAdded === 0) {
      return [{
        code: "email.crons_ran_nothing_sent",
        severity: "critical",
        detail: `Email crons ran in last 24h (${ranJobs.join(", ")}) but lifecycle_email_log gained 0 rows. Email path may be broken.`,
      }];
    }
    return [];
  } catch {
    return [];
  }
}

async function reconcile(admin: any, findings: Finding[]): Promise<{ opened: number; refreshed: number; resolved: number }> {
  const seenCodes = new Set(findings.map(f => f.code));
  let opened = 0;
  let refreshed = 0;

  for (const f of findings) {
    // Try to update existing open finding, else insert new.
    const { data: existing } = await admin
      .from("health_findings")
      .select("id")
      .eq("code", f.code)
      .is("resolved_at", null)
      .maybeSingle();
    if (existing?.id) {
      await admin.from("health_findings")
        .update({ severity: f.severity, detail: f.detail, last_seen: new Date().toISOString() })
        .eq("id", existing.id);
      refreshed++;
    } else {
      await admin.from("health_findings").insert({
        code: f.code, severity: f.severity, detail: f.detail,
      });
      opened++;
    }
  }

  // Resolve findings for codes we check but that PASSED.
  // Only auto-resolve codes matching the check families we ran this cycle.
  const familyPrefixes = [
    "freshness.", "coverage.document.", "orphan.source_registry",
    "pipeline.dead_end_fragments", "stuck.evidence_jobs", "stuck.document_jobs",
    "errors.ef_high_24h", "email.crons_ran_nothing_sent",
  ];
  const { data: openNow } = await admin
    .from("health_findings")
    .select("id, code")
    .is("resolved_at", null);
  let resolved = 0;
  for (const row of (openNow || []) as Array<{ id: string; code: string }>) {
    const inFamily = familyPrefixes.some(p => row.code === p || row.code.startsWith(p));
    if (inFamily && !seenCodes.has(row.code)) {
      await admin.from("health_findings")
        .update({ resolved_at: new Date().toISOString() })
        .eq("id", row.id);
      resolved++;
    }
  }
  return { opened, refreshed, resolved };
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
    const apiKeyHeader = req.headers.get("apikey") || "";
    const isServiceRole = !!bearer && (bearer === serviceKey || apiKeyHeader === serviceKey);
    const isCron = !!CRON_SECRET && cronHeader === CRON_SECRET;

    let isAdmin = false;
    if (!isServiceRole && !isCron && bearer) {
      const userClient = createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (user) {
        const { data: adminFlag } = await userClient.rpc("is_current_user_admin" as never);
        isAdmin = !!adminFlag;
      }
    }
    if (!isServiceRole && !isCron && !isAdmin) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);

    const findings: Finding[] = [];
    findings.push(...await runFreshnessChecks(admin));
    findings.push(...await checkCoverage(admin));
    findings.push(...await checkOrphanSources(admin));
    findings.push(...await checkDeadEndFragments(admin));
    findings.push(...await checkStuckJobs(admin));
    findings.push(...await checkErrorRate(admin));
    findings.push(...await checkEmailCronsSilent(admin));

    const summary = await reconcile(admin, findings);

    return json({ ok: true, findings_count: findings.length, ...summary, findings });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});