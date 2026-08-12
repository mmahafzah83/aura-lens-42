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
  /** Same fact, named for readers that ask "is this address confirmed?". */
  addressConfirmed: boolean;
  /** Raw provenance of the stored address, as the row records it. */
  sourceStatus: string | null;
  /** The connection's own state. 'needs_reconnect' means the sign-in expired. */
  connectionStatus: string | null;
  /** LinkedIn refused the stored sign-in — the member must connect again. */
  needsReconnect: boolean;
  /** Whether Aura may publish for the member (still only on approval). */
  canPost: boolean;
  lastSyncedAt: string | null;
}

export const EMPTY_LINKEDIN_STATE: LinkedInState = {
  connected: false, handle: null, address: null,
  confirmedByRead: false, addressConfirmed: false, sourceStatus: null,
  connectionStatus: null, needsReconnect: false,
  canPost: false, lastSyncedAt: null,
};

export async function loadLinkedInState(userId: string): Promise<LinkedInState> {
  // The safe view only: the browser has no grant on access_token / can_post,
  // and asking for them made Postgres reject the whole query, so every member
  // read back as disconnected.
  const { data, error } = await (supabase.from("linkedin_connections_safe" as any) as any)
    .select("handle, profile_url, source_status, status, last_synced_at, scopes, linkedin_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return EMPTY_LINKEDIN_STATE;
  const row = data as any;
  const handle = canonicalHandle(row.handle) ?? canonicalHandle(row.profile_url);
  const addressConfirmed =
    row.source_status === "verified_by_read" || row.source_status === "confirmed_by_identity";
  // An address-only row defaults to status 'active' AND connected_at now(), so
  // neither proves anything. Only OAuth can produce a linkedin_id and granted
  // scopes, and only the posting scope means Aura may publish for the member.
  const scopes: string[] = Array.isArray(row.scopes) ? row.scopes : [];
  const connected = row.status === "active" && Boolean(row.linkedin_id) && scopes.length > 0;
  return {
    connected,
    handle,
    address: (row.profile_url as string | null) || profileUrlFor(handle),
    confirmedByRead: row.source_status === "verified_by_read",
    addressConfirmed,
    sourceStatus: (row.source_status as string | null) ?? null,
    connectionStatus: (row.status as string | null) ?? null,
    needsReconnect: row.status === "needs_reconnect",
    canPost: connected && scopes.includes("w_member_social"),
    lastSyncedAt: (row.last_synced_at as string | null) ?? null,
  };
}
