/**
 * One reader for "what does Aura know about this member's LinkedIn?".
 *
 * Settings used to answer that question three different ways on one page —
 * a status column, an address column, and an edge-function call — so the page
 * could say "we don't have a confirmed address" directly above the address.
 * Every surface now reads this, from a single query.
 */
import { supabase } from "@/integrations/supabase/client";
import { canonicalHandle, profileUrlFor } from "@/lib/linkedinAddress";

export interface LinkedInState {
  /** A connection row exists with a usable token — Aura can act on LinkedIn. */
  connected: boolean;
  /** The address on file, canonical handle form, or null. */
  handle: string | null;
  /** The full profile URL on file, or one built from the handle. */
  address: string | null;
  /** A real profile read came back — the address is proven, not guessed. */
  confirmedByRead: boolean;
  /** Whether Aura may publish for the member (still only on approval). */
  canPost: boolean;
  lastSyncedAt: string | null;
}

export const EMPTY_LINKEDIN_STATE: LinkedInState = {
  connected: false, handle: null, address: null,
  confirmedByRead: false, canPost: false, lastSyncedAt: null,
};

export async function loadLinkedInState(userId: string): Promise<LinkedInState> {
  // The safe view only: the browser has no grant on access_token / can_post,
  // and asking for them made Postgres reject the whole query, so every member
  // read back as disconnected.
  const { data, error } = await (supabase.from("linkedin_connections_safe" as any) as any)
    .select("handle, profile_url, source_status, status, last_synced_at, scopes, connected_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return EMPTY_LINKEDIN_STATE;
  const row = data as any;
  const handle = canonicalHandle(row.handle) ?? canonicalHandle(row.profile_url);
  // An address-only row also defaults to status 'active'. Only a real OAuth
  // connection stamps connected_at, and only the posting scope means Aura may
  // publish on the member's behalf.
  const connected = row.status === "active" && Boolean(row.connected_at);
  return {
    connected,
    handle,
    address: (row.profile_url as string | null) || profileUrlFor(handle),
    confirmedByRead: row.source_status === "verified_by_read",
    canPost: connected && Array.isArray(row.scopes) && row.scopes.includes("w_member_social"),
    lastSyncedAt: (row.last_synced_at as string | null) ?? null,
  };
}
