/**
 * provisionAccount — the ONE writer that establishes a new account's standing.
 *
 * The database already guarantees the row and the role:
 *   - `ensure_diagnostic_profile`     creates the diagnostic_profiles row
 *   - `grant_member_role_on_profile`  grants the `member` role
 *
 * This sets what those triggers cannot decide: account_type and the plan.
 * No other code path may set account_type, plan, plan_started_at,
 * trial_ends_at or plan_source.
 *
 * Idempotent by design: an existing member's plan is NEVER reset. Plan fields
 * are written only when `plan_started_at` is still null.
 */
export type PlanSource = "invited" | "self_serve" | "comped";

const TRIAL_DAYS = 14;

export async function provisionAccount(
  admin: any,
  userId: string,
  planSource: PlanSource = "invited",
): Promise<{ provisioned: boolean; error?: string }> {
  if (!userId) return { provisioned: false, error: "no user id" };

  const { data: existing, error: readErr } = await admin
    .from("diagnostic_profiles")
    .select("user_id, plan_started_at, account_type")
    .eq("user_id", userId)
    .maybeSingle();
  if (readErr) {
    console.error("[provisionAccount] profile read failed", readErr.message);
    return { provisioned: false, error: readErr.message };
  }

  // Already provisioned — leave the plan exactly as it stands.
  if (existing?.plan_started_at) return { provisioned: false };

  const now = new Date();
  const trialEnds = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  const { error: writeErr } = await admin
    .from("diagnostic_profiles")
    .upsert(
      {
        user_id: userId,
        account_type: existing?.account_type ?? "customer",
        plan: "trial",
        plan_started_at: now.toISOString(),
        trial_ends_at: trialEnds.toISOString(),
        plan_source: planSource,
      },
      { onConflict: "user_id" },
    );
  if (writeErr) {
    console.error("[provisionAccount] provisioning failed", writeErr.message);
    return { provisioned: false, error: writeErr.message };
  }
  return { provisioned: true };
}
