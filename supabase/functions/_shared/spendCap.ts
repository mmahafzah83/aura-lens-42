/**
 * spendCap.ts — ONE daily ceiling on model calls across the opportunity engine.
 *
 * Cost is acceptable; an unbounded loop is not. The cap is read from
 * admin_settings (key 'oe_daily_call_cap', default 500) so it can be moved
 * without a deploy. The counter is ai_usage_log, which every engine model call
 * already writes to, so there is no second bookkeeping to drift.
 *
 * When the cap is hit: stop calling, log ONCE per day at 'warn', resume
 * tomorrow. The engine keeps running its free, deterministic work.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export const DEFAULT_DAILY_CALL_CAP = 500;

export interface CapState {
  allowed: boolean;
  used: number;
  cap: number;
}

/** Calls made today (UTC) by any engine function. */
export async function engineCallsToday(admin: SupabaseClient): Promise<number> {
  const since = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z").toISOString();
  const { count } = await admin
    .from("ai_usage_log")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since)
    .like("function_name", "oe-%");
  return count ?? 0;
}

export async function dailyCallCap(admin: SupabaseClient): Promise<number> {
  const { data } = await admin
    .from("admin_settings")
    .select("value")
    .eq("key", "oe_daily_call_cap")
    .maybeSingle();
  const raw = (data as { value?: unknown } | null)?.value as any;
  const n = Number(typeof raw === "object" && raw !== null ? raw.calls ?? raw.value : raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_DAILY_CALL_CAP;
}

/**
 * Ask before spending. Returns allowed=false once today's calls reach the cap,
 * and writes the single 'warn' line the first time that happens each day.
 */
export async function checkSpendCap(
  admin: SupabaseClient,
  function_name: string,
): Promise<CapState> {
  try {
    const [used, cap] = await Promise.all([engineCallsToday(admin), dailyCallCap(admin)]);
    if (used < cap) return { allowed: true, used, cap };

    const today = new Date().toISOString().slice(0, 10);
    const { count } = await admin
      .from("ef_error_log")
      .select("id", { count: "exact", head: true })
      .eq("function_name", "oe-spend-cap")
      .gte("created_at", `${today}T00:00:00.000Z`);
    if (!count) {
      await admin.from("ef_error_log").insert({
        function_name: "oe-spend-cap",
        severity: "warn",
        error_message: `Daily model call ceiling reached: ${used}/${cap}. No further model calls today.`,
        context: { used, cap, first_refused_by: function_name },
      });
    }
    return { allowed: false, used, cap };
  } catch (e) {
    // A broken meter must not silently open the tap: refuse and say why.
    console.error("[spendCap] check failed, refusing model calls:", (e as Error)?.message ?? e);
    return { allowed: false, used: -1, cap: -1 };
  }
}
