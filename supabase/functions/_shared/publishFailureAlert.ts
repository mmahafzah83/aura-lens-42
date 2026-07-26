/**
 * Publish-failure alerting.
 *
 * A real user pressing publish and getting nothing is the worst failure in the
 * product. It must reach the founder within the hour, exactly once per person
 * per day, and it must NEVER interfere with the publish path itself.
 *
 * Every function here swallows its own errors. Callers still wrap the call in
 * their own try/catch: telemetry must never break the thing it describes.
 */

const FOUNDER_ID = "9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3";

/** Founder and test accounts are excluded — his own failures are not emergencies. */
export function isRealUser(userId: string | null | undefined, email: string | null | undefined): boolean {
  if (!userId) return false;
  if (userId === FOUNDER_ID) return false;
  const e = (email || "").toLowerCase();
  if (!e) return true; // unknown email: treat as real rather than lose the alarm
  if (e.includes("test")) return false;
  if (e.endsWith("@example.com")) return false;
  return true;
}

function dayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export async function alertPublishFailure(
  admin: any,
  opts: {
    userId: string;
    postId?: string | null;
    errorText: string;
    postText?: string | null;
    origin: "linkedin-publish" | "reap-stuck-publishes";
    occurredAt?: string;
  },
): Promise<void> {
  try {
    const { userId, postId, origin } = opts;
    const occurredAt = opts.occurredAt || new Date().toISOString();

    // --- exclusion: founder + test accounts -------------------------------
    let email: string | null = null;
    try {
      const { data } = await admin.auth.admin.getUserById(userId);
      email = data?.user?.email ?? null;
    } catch { /* ignore — isRealUser tolerates a null email */ }
    if (!isRealUser(userId, email)) return;

    // --- who is this person -----------------------------------------------
    let firstName = "";
    try {
      const { data: prof } = await admin
        .from("diagnostic_profiles")
        .select("first_name, last_name")
        .eq("user_id", userId)
        .maybeSingle();
      firstName = [prof?.first_name, prof?.last_name].filter(Boolean).join(" ").trim();
    } catch { /* ignore */ }
    if (!firstName) firstName = (email || "").split("@")[0] || "A user";

    // --- dedupe by person and day, not by attempt --------------------------
    // One row, one email, per user per calendar day. Repeat attempts land on
    // the same row and only raise the count.
    const source = `publish_failed:${userId}:${dayKey(new Date(occurredAt))}`;
    let attempts = 1;
    try {
      const { data: existing } = await admin
        .from("ops_alerts")
        .select("occurrences")
        .eq("source", source)
        .order("created_at", { ascending: false })
        .limit(1);
      if (existing && existing[0]) attempts = (existing[0].occurrences || 1) + 1;
    } catch { /* ignore — worst case the count reads 1 */ }

    const excerpt = String(opts.postText || "").replace(/\s+/g, " ").trim().slice(0, 80);
    const errorText = String(opts.errorText || "unknown error").slice(0, 500);
    const plural = attempts === 1 ? "attempt" : "attempts";

    const subject = `${firstName} — ${attempts} failed publish ${plural} today`;
    const what = `${firstName} pressed publish and it failed.`;
    const impact = `A real user, blocked right now. ${attempts} failed ${plural} today. Last at ${occurredAt}.`;
    const action = `Open the post, reproduce the failure, and tell ${firstName} something.`;
    const detail = [
      `error: ${errorText}`,
      postId ? `post: ${postId}` : "",
      excerpt ? `they were trying to say: "${excerpt}${excerpt.length === 80 ? "…" : ""}"` : "",
      `discovered by: ${origin}`,
    ].filter(Boolean).join(" · ");

    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/admin-notify`;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject,
        body: `${what}\n\n${impact}\n\n${detail}`,
        severity: "critical",
        dedupe_key: source,
        what,
        impact,
        action,
        detail,
      }),
    });
  } catch (e) {
    console.error("[publishFailureAlert] non-blocking failure:", (e as Error)?.message);
  }
}
