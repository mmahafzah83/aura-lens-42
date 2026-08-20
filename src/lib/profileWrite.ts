/**
 * The one writer for `diagnostic_profiles`.
 *
 * PostgREST answers an `.update().eq()` that matches zero rows with HTTP 204
 * and no error object, so a whole onboarding once wrote into a row that did
 * not exist and every try/catch passed. Every write goes through here: it
 * upserts on `user_id`, returns the affected rows, and reports a write that
 * changed nothing as the failure it is.
 */
import { supabase } from "@/integrations/supabase/client";

/**
 * MONOTONIC RULE — `onboarding_step` is a progress counter, never a position.
 * Two functions used to derive it with different formulas, so a screen save
 * written after the completion ceremony pushed a finished member from 4 back
 * to 3 and Home sent them round the journey again. The rule is enforced HERE,
 * in the one writer, so no call site can regress it: a write that would lower
 * the counter simply drops the column. The deliberate reset (Start over) is
 * the single exception and must ask for it by name.
 */
export async function writeProfile(
  userId: string | null | undefined,
  patch: Record<string, any>,
  label = "profile write",
  opts?: { allowStepDecrease?: boolean },
): Promise<boolean> {
  if (!userId) {
    console.error(`[profileWrite] ${label} skipped — no user id`);
    return false;
  }
  const clean: Record<string, any> = { user_id: userId };
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) clean[k] = v;
  if (clean.onboarding_step !== undefined && !opts?.allowStepDecrease) {
    const next = Number(clean.onboarding_step);
    if (!Number.isFinite(next)) {
      delete clean.onboarding_step;
    } else {
      const { data: cur } = await (supabase.from("diagnostic_profiles" as any) as any)
        .select("onboarding_step").eq("user_id", userId).maybeSingle();
      const now = Number((cur as any)?.onboarding_step ?? 0);
      if (Number.isFinite(now) && next < now) {
        delete clean.onboarding_step;
      }
    }
  }
  const keys = Object.keys(clean).filter((k) => k !== "user_id");
  if (!keys.length) return true;

  const { data, error } = await (supabase.from("diagnostic_profiles" as any) as any)
    .upsert(clean, { onConflict: "user_id" })
    .select("user_id");
  if (error) {
    console.error(`[profileWrite] ${label} failed (${keys.join(", ")})`, error);
    return false;
  }
  if (!data || (data as any[]).length === 0) {
    console.error(`[profileWrite] ${label} affected no rows — nothing was saved (${keys.join(", ")})`);
    return false;
  }
  return true;
}
