/**
 * The member's real zone, never a guess.
 *
 * A morning brief is promised to every member, and a brief cannot be sent at
 * the right hour without knowing the hour. Country is not a timezone, so we do
 * not infer one: we read what the browser actually resolves and write that.
 * Silent, once per session, never blocking.
 */
import { supabase } from "@/integrations/supabase/client";

const sessionKey = (userId: string) => `aura_tz_synced_${userId}`;

export function browserTimezone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && tz.includes("/") ? tz : tz || null;
  } catch {
    return null;
  }
}

/** Write the browser zone when the stored one is missing or stale. Never throws. */
export async function ensureTimezone(userId: string | null | undefined): Promise<void> {
  if (!userId) return;
  const tz = browserTimezone();
  if (!tz) return;
  try {
    if (sessionStorage.getItem(sessionKey(userId)) === tz) return;
  } catch { /* private mode — just do the read */ }

  try {
    const { data, error } = await (supabase.from("diagnostic_profiles" as any) as any)
      .select("timezone")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) { console.warn("[timezone] read failed", error); return; }
    const current = (data as any)?.timezone ?? null;
    if (current !== tz) {
      const { error: writeError } = await (supabase.from("diagnostic_profiles" as any) as any)
        .update({ timezone: tz } as any)
        .eq("user_id", userId);
      if (writeError) { console.warn("[timezone] write failed", writeError); return; }
    }
    try { sessionStorage.setItem(sessionKey(userId), tz); } catch { /* ignore */ }
  } catch (e) {
    console.warn("[timezone] sync threw", e);
  }
}
