/**
 * WAIT-ESTIMATE — how long this actually takes, from the runs we actually made.
 *
 * No modelling, no guessing. It reads `operation_runs` for FINISHED runs of one
 * operation over the last 30 days (most recent 200) — successes and failures
 * both, because a median built from successes only is optimistic by
 * construction — and returns the median, the 95th percentile, and the same two
 * figures per stage.
 *
 * Below ten real runs we do not know, so we say nothing: { insufficient: true }.
 * A stage below ten finished runs is simply not returned; the client prints an
 * em dash rather than a number it cannot defend.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OPERATIONS = new Set([
  "linkedin_read",
  "cv_crosscheck",
  "market_read",
  "capture_ingest",
  "studio_generate",
  "studio_slides",
  "studio_export",
  "studio_publish",
]);
const MIN_SAMPLE = 10;
const TTL_MS = 10 * 60 * 1000;

interface StageOut {
  key: string;
  p50_ms: number;
  p95_ms: number;
  sigma_over_mu: number;
  sample: number;
}

type Estimate =
  | { insufficient: true; stages: StageOut[] }
  | { p50_seconds: number; p95_seconds: number; sample_size: number; stages: StageOut[] };

const cache = new Map<string, { at: number; value: Estimate }>();

const percentile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx];
};

const sigmaOverMu = (values: number[]): number => {
  if (values.length < 2) return Infinity;
  const mu = values.reduce((a, b) => a + b, 0) / values.length;
  if (mu <= 0) return Infinity;
  const variance = values.reduce((a, b) => a + (b - mu) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mu;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let operation = "";
  try {
    const body = await req.json();
    operation = String(body?.operation ?? "");
  } catch { /* an unreadable body is simply an unknown operation */ }

  if (!OPERATIONS.has(operation)) return json({ insufficient: true, stages: [] }, 200);

  const hit = cache.get(operation);
  if (hit && Date.now() - hit.at < TTL_MS) return json(hit.value);

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await admin
      .from("operation_runs")
      .select("started_at, finished_at, stages")
      .eq("operation", operation)
      .not("finished_at", "is", null)
      .gte("started_at", since)
      .order("started_at", { ascending: false })
      .limit(200);
    if (error) throw error;

    const rows = (data ?? []) as { started_at: string; finished_at: string; stages: unknown }[];

    const seconds = rows
      .map((r) => (new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000)
      .filter((s: number) => Number.isFinite(s) && s > 0);

    /* Per-stage durations, in the order the stages first appear. */
    const order: string[] = [];
    const byStage = new Map<string, number[]>();
    for (const r of rows) {
      const list = Array.isArray(r.stages) ? r.stages as { key?: unknown; ms?: unknown }[] : [];
      for (const s of list) {
        const key = String(s?.key ?? "").trim();
        const ms = Number(s?.ms);
        if (!key || !Number.isFinite(ms) || ms <= 0) continue;
        if (!byStage.has(key)) { byStage.set(key, []); order.push(key); }
        byStage.get(key)!.push(ms);
      }
    }
    const stages: StageOut[] = order
      .map((key) => {
        const vals = (byStage.get(key) ?? []).slice().sort((a, b) => a - b);
        return {
          key,
          p50_ms: Math.round(percentile(vals, 0.5)),
          p95_ms: Math.round(percentile(vals, 0.95)),
          sigma_over_mu: Number(sigmaOverMu(vals).toFixed(3)),
          sample: vals.length,
        };
      })
      .filter((s) => s.sample >= MIN_SAMPLE);

    let value: Estimate;
    if (seconds.length < MIN_SAMPLE) {
      value = { insufficient: true, stages };
    } else {
      const sorted = seconds.sort((a: number, b: number) => a - b);
      value = {
        p50_seconds: Math.round(percentile(sorted, 0.5)),
        p95_seconds: Math.round(percentile(sorted, 0.95)),
        sample_size: sorted.length,
        stages,
      };
    }
    cache.set(operation, { at: Date.now(), value });
    return json(value);
  } catch (e) {
    console.error("[wait-estimate] failed:", (e as Error)?.message ?? e);
    /* Never block a waiting screen: silence is an honest answer. */
    return json({ insufficient: true, stages: [] });
  }
});
