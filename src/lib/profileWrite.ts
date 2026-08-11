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

export async function writeProfile(
  userId: string | null | undefined,
  patch: Record<string, any>,
  label = "profile write",
): Promise<boolean> {
  if (!userId) {
    console.error(`[profileWrite] ${label} skipped — no user id`);
    return false;
  }
  const clean: Record<string, any> = { user_id: userId };
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) clean[k] = v;
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
