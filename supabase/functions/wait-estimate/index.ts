/**
 * WAIT-ESTIMATE — how long this actually takes, from the runs we actually made.
 *
 * No modelling, no guessing. It reads `operation_runs` for finished, successful
 * runs of one operation over the last 30 days (most recent 200), and returns the
 * median and the 95th percentile in seconds.
 *
 * Below ten real runs we do not know, so we say nothing: { insufficient: true }.
 * The answer is cached in memory for ten minutes — this is not per page load.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OPERATIONS = new Set(["linkedin_read", "cv_crosscheck", "market_read"]);
const MIN_SAMPLE = 10;
const TTL_MS = 10 * 60 * 1000;

type Estimate =
  | { insufficient: true }
  | { p50_seconds: number; p95_seconds: number; sample_size: number };

const cache = new Map<string, { at: number; value: Estimate }>();

const percentile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx];
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

  if (!OPERATIONS.has(operation)) return json({ insufficient: true }, 200);

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
      .select("started_at, finished_at")
      .eq("operation", operation)
      .eq("outcome", "ok")
      .not("finished_at", "is", null)
      .gte("started_at", since)
      .order("started_at", { ascending: false })
      .limit(200);
    if (error) throw error;

    const seconds = (data ?? [])
      .map((r: { started_at: string; finished_at: string }) =>
        (new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000)
      .filter((s: number) => Number.isFinite(s) && s > 0);

    let value: Estimate;
    if (seconds.length < MIN_SAMPLE) {
      value = { insufficient: true };
    } else {
      const sorted = seconds.sort((a: number, b: number) => a - b);
      value = {
        p50_seconds: Math.round(percentile(sorted, 0.5)),
        p95_seconds: Math.round(percentile(sorted, 0.95)),
        sample_size: sorted.length,
      };
    }
    cache.set(operation, { at: Date.now(), value });
    return json(value);
  } catch (e) {
    console.error("[wait-estimate] failed:", (e as Error)?.message ?? e);
    /* Never block a waiting screen: silence is an honest answer. */
    return json({ insufficient: true });
  }
});
