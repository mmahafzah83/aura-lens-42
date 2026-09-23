/**
 * oe-vendor-health — what the paid services have left, said out loud.
 *
 * A reader that stops because a card ran out looks exactly like a quiet night.
 * This function asks each vendor what is left, records one row per vendor per
 * run, and emails the founder once when a vendor needs a top-up or has stopped.
 * It makes no model calls and costs nothing at the AI gateway.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { logEfError } from "../_shared/observe.ts";
import { apifyToken, firecrawlKey, fetchWithTimeout } from "../_shared/vendors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const FN = "oe-vendor-health";
const TIMEOUT = 15_000;
const TOPUP: Record<string, string> = {
  apify: "https://console.apify.com/billing",
  firecrawl: "https://www.firecrawl.dev/app/billing",
  lovable_ai: "https://lovable.dev/settings/billing",
};

type Level = "ok" | "watch" | "act" | "stopped";
type Vendor = {
  vendor: string; ok: boolean; level: Level;
  used: number | null; limit_value: number | null; remaining: number | null;
  unit: string; refused_24h: number; detail: Record<string, unknown>;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** The ladder: any refusal or nothing left is a stop, whatever the share says. */
function levelFor(input: {
  refused: number; used: number | null; limit: number | null;
  remaining: number | null; daysLeft: number | null;
}): Level {
  if (input.refused > 0) return "stopped";
  if (input.remaining !== null && input.remaining <= 0) return "stopped";
  const share = input.limit && input.limit > 0 && input.used !== null ? input.used / input.limit : null;
  if (share !== null && share >= 0.9) return "act";
  if (input.daysLeft !== null && input.daysLeft < 5) return "act";
  if (share !== null && share >= 0.7) return "watch";
  return "ok";
}

async function checkApify(): Promise<Vendor> {
  const token = apifyToken();
  const detail: Record<string, unknown> = { topup: TOPUP.apify };
  if (!token) {
    return { vendor: "apify", ok: false, level: "stopped", used: null, limit_value: null, remaining: null,
      unit: "usd", refused_24h: 0, detail: { ...detail, error: "no token configured" } };
  }
  try {
    const meRes = await fetchWithTimeout(`https://api.apify.com/v2/users/me?token=${token}`, {}, TIMEOUT);
    const meBody = await meRes.json().catch(() => null);
    detail.token_ok = meRes.ok;
    detail.username = (meBody as any)?.data?.username ?? null;

    const res = await fetchWithTimeout(`https://api.apify.com/v2/users/me/limits?token=${token}`, {}, TIMEOUT);
    const body = await res.json().catch(() => null) as any;
    if (!res.ok) throw new Error(`limits ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
    const current = body?.data?.current ?? {};
    const limits = body?.data?.limits ?? {};
    const used = Number(current.monthlyUsageUsd ?? current.monthlyUsageCycleUsd ?? 0);
    const limit = Number(limits.maxMonthlyUsageUsd ?? 0) || null;
    const remaining = limit !== null ? +(limit - used).toFixed(4) : null;
    // Burn is measured against the days already spent in this month's cycle.
    const day = new Date().getUTCDate();
    const perDay = used > 0 ? used / Math.max(1, day) : 0;
    const daysLeft = remaining !== null && perDay > 0 ? remaining / perDay : null;
    const level = levelFor({ refused: 0, used, limit, remaining, daysLeft });
    return {
      vendor: "apify", ok: res.ok && meRes.ok, level,
      used, limit_value: limit, remaining, unit: "usd", refused_24h: 0,
      detail: { ...detail, days_left: daysLeft === null ? null : +daysLeft.toFixed(1), limits },
    };
  } catch (e) {
    return { vendor: "apify", ok: false, level: "act", used: null, limit_value: null, remaining: null,
      unit: "usd", refused_24h: 0, detail: { ...detail, error: String((e as Error).message ?? e).slice(0, 300) } };
  }
}

async function checkFirecrawl(): Promise<Vendor> {
  const key = firecrawlKey();
  const detail: Record<string, unknown> = { topup: TOPUP.firecrawl };
  if (!key) {
    return { vendor: "firecrawl", ok: false, level: "stopped", used: null, limit_value: null, remaining: null,
      unit: "credits", refused_24h: 0, detail: { ...detail, error: "no key configured" } };
  }
  const paths = ["/v2/team/credit-usage", "/v1/team/credit-usage"];
  let lastError = "";
  for (const path of paths) {
    try {
      const res = await fetchWithTimeout(`https://api.firecrawl.dev${path}`, {
        headers: { Authorization: `Bearer ${key}` },
      }, TIMEOUT);
      const body = await res.json().catch(() => null) as any;
      if (!res.ok) { lastError = `${path} ${res.status}`; continue; }
      const data = body?.data ?? body ?? {};
      const remaining = Number(data.remaining_credits ?? data.remainingCredits ?? data.remaining ?? NaN);
      const planCredits = Number(data.plan_credits ?? data.planCredits ?? NaN);
      const used = Number.isFinite(planCredits) && Number.isFinite(remaining) ? planCredits - remaining : null;
      const limit = Number.isFinite(planCredits) ? planCredits : null;
      const level = levelFor({
        refused: 0, used, limit,
        remaining: Number.isFinite(remaining) ? remaining : null, daysLeft: null,
      });
      return {
        vendor: "firecrawl", ok: true, level, used, limit_value: limit,
        remaining: Number.isFinite(remaining) ? remaining : null,
        unit: "credits", refused_24h: 0, detail: { ...detail, path_used: path, body: data },
      };
    } catch (e) { lastError = `${path} ${String((e as Error).message ?? e).slice(0, 200)}`; }
  }
  return { vendor: "firecrawl", ok: false, level: "act", used: null, limit_value: null, remaining: null,
    unit: "credits", refused_24h: 0, detail: { ...detail, error: lastError } };
}

const REFUSAL_RE = /402|insufficient credits|payment required|429/i;

async function checkLovableAI(admin: ReturnType<typeof createClient>): Promise<Vendor> {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const detail: Record<string, unknown> = { topup: TOPUP.lovable_ai };

  const { data: errs } = await admin.from("ef_error_log")
    .select("error_message, function_name").gte("created_at", since).limit(2000);
  const refusalsErrors = (errs ?? []).filter((r: any) => REFUSAL_RE.test(String(r.error_message ?? "")));

  const { data: usage } = await admin.from("ai_usage_log")
    .select("function_name, success, metadata").gte("created_at", since).eq("success", false).limit(2000);
  const refusalsUsage = (usage ?? []).filter((r: any) => REFUSAL_RE.test(JSON.stringify(r.metadata ?? {})));

  const { data: jobs } = await admin.from("job_queue")
    .select("job_type, last_error").gte("updated_at", since).not("last_error", "is", null).limit(2000);
  const byJobType: Record<string, number> = {};
  let jobRefusals = 0;
  for (const row of (jobs ?? []) as any[]) {
    const text = String(row.last_error ?? "");
    if (!(REFUSAL_RE.test(text) || text.includes("deferred_cap"))) continue;
    jobRefusals++;
    byJobType[String(row.job_type)] = (byJobType[String(row.job_type)] ?? 0) + 1;
  }

  const refused = refusalsErrors.length + refusalsUsage.length;
  detail.error_log_hits = refusalsErrors.slice(0, 5).map((r: any) => r.function_name);
  detail.job_queue_refusals = byJobType;
  detail.job_queue_refused_24h = jobRefusals;
  const level = levelFor({ refused, used: null, limit: null, remaining: null, daysLeft: null });
  return {
    vendor: "lovable_ai", ok: refused === 0, level, used: null, limit_value: null,
    remaining: null, unit: "calls", refused_24h: refused, detail,
  };
}

function emailBody(v: Vendor): { subject: string; text: string } {
  const name = v.vendor === "lovable_ai" ? "Lovable AI" : v.vendor === "apify" ? "Apify" : "Firecrawl";
  const stopped = v.level === "stopped";
  const skipping = v.vendor === "apify"
    ? "the daily job-board harvest"
    : v.vendor === "firecrawl"
      ? "reading pages that the plain fetch cannot see"
      : "screening and judging — members get no new cards";
  const number = v.remaining !== null
    ? `${v.remaining} ${v.unit} left`
    : v.used !== null ? `${v.used} ${v.unit} used` : `${v.refused_24h} refusals in the last 24 hours`;
  return {
    subject: `Aura · ${name} ${stopped ? "has stopped" : "needs a top-up"}`,
    text: [
      `${name} ${stopped ? "has stopped answering" : "is close to its ceiling"}.`,
      `Since: ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC.`,
      `The engine is skipping ${skipping}.`,
      `Number: ${number}.`,
      `Top up: ${TOPUP[v.vendor] ?? ""}`,
    ].join("\n"),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const CRON_SECRET = Deno.env.get("cron_secret") || Deno.env.get("CRON_SECRET") || "";
  const cronHeader = req.headers.get("x-cron-secret") || "";
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!((!!CRON_SECRET && cronHeader === CRON_SECRET) || bearer === SERVICE_ROLE)) {
    return json({ error: "Forbidden" }, 403);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const startedAt = new Date().toISOString();

  try {
    const [apify, firecrawl, lovable] = await Promise.all([
      checkApify(), checkFirecrawl(), checkLovableAI(admin),
    ]);
    const vendors = [apify, firecrawl, lovable];

    for (const v of vendors) {
      await admin.from("oe_vendor_health").insert({
        vendor: v.vendor, ok: v.ok, level: v.level, used: v.used,
        limit_value: v.limit_value, remaining: v.remaining, unit: v.unit,
        refused_24h: v.refused_24h, detail: v.detail,
      });
    }

    // One email per vendor and level, no more than once in twelve hours.
    const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";
    const { data: toRow } = await admin.from("admin_settings")
      .select("value").eq("key", "founder_alert_email").maybeSingle();
    const rawTo = (toRow as { value?: unknown } | null)?.value as any;
    const to = typeof rawTo === "string" ? rawTo : rawTo?.email ?? null;
    const { data: sentRow } = await admin.from("admin_settings")
      .select("value").eq("key", "vendor_alert_sent").maybeSingle();
    const sent: Record<string, string> = ((sentRow as any)?.value as any) ?? {};
    const emailed: string[] = [];

    for (const v of vendors) {
      if (v.level !== "act" && v.level !== "stopped") continue;
      const key = `${v.vendor}:${v.level}`;
      const last = sent[key] ? new Date(sent[key]).getTime() : 0;
      if (Date.now() - last < 12 * 3600_000) continue;
      if (!RESEND_KEY || !to) continue;
      const { subject, text } = emailBody(v);
      const res = await fetchWithTimeout("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: "invites@aura-intel.org", to: [to], subject, text }),
      }, TIMEOUT);
      if (res.ok) { sent[key] = new Date().toISOString(); emailed.push(key); }
      else {
        await logEfError(admin, {
          function_name: FN, error: `resend ${res.status}`, severity: "high",
          context: { vendor: v.vendor, level: v.level },
        });
      }
    }
    if (emailed.length) {
      await admin.from("admin_settings")
        .upsert({ key: "vendor_alert_sent", value: sent as any }, { onConflict: "key" });
    }

    const counts = Object.fromEntries(vendors.map((v) => [v.vendor, v.level]));
    await admin.from("oe_runs").insert({
      run_kind: "vendor_health", started_at: startedAt, finished_at: new Date().toISOString(),
      outcome: "ok", counts: { ...counts, emailed },
    });

    return json({ ok: true, vendors, emailed });
  } catch (e) {
    const msg = String((e as Error).message ?? e).slice(0, 500);
    await admin.from("oe_runs").insert({
      run_kind: "vendor_health", started_at: startedAt, finished_at: new Date().toISOString(),
      outcome: "error", counts: {}, error: msg,
    });
    await logEfError(admin, { function_name: FN, error: e, severity: "high", context: {} });
    return json({ ok: false, error: msg }, 500);
  }
});
