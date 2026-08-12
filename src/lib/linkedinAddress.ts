/**
 * The member's LinkedIn address — one column, one reader, one writer.
 *
 * It used to live in three places (`linkedin_connections.handle`,
 * `linkedin_connections.profile_url`, and `diagnostic_profiles.linkedin_url` /
 * `linkedin_handle`) and they disagreed: nine connection rows carried an
 * address while one profile row did. Two surfaces reading different columns
 * showed two different members two different truths.
 *
 * `linkedin_connections` is the source of truth. The `diagnostic_profiles`
 * columns are deprecated (see their column comments) and nothing writes to
 * them any more.
 */
import { supabase } from "@/integrations/supabase/client";

export interface LinkedInAddress {
  handle: string | null;
  profileUrl: string | null;
  lastSyncedAt: string | null;
}

/** `@x`, `x`, or any /in/ URL becomes the bare handle. Null when unusable. */
export function canonicalHandle(input: unknown): string | null {
  const v = String(input ?? "").trim();
  if (!v) return null;
  const fromUrl = v.match(/linkedin\.com\/in\/([^/?#\s]+)/i);
  let raw = (fromUrl ? fromUrl[1] : v.replace(/^@/, "")).trim();
  // A browser copy-paste of an Arabic vanity URL arrives percent-encoded.
  // Decode before the character test so the Arabic passes the rule it was
  // always meant to pass.
  try { raw = decodeURIComponent(raw); } catch { /* keep the raw string */ }
  raw = raw.replace(/^[.\-_]+/, "").replace(/[.\-_]+$/, "").trim();
  // Reject, never launder (Law #97). A display-name guess full of commas,
  // spaces or ® cleans up into a plausible-looking slug that can never resolve
  // on LinkedIn — and then reads as a real address to every surface
  // downstream. A LinkedIn vanity name is ASCII letters, digits and hyphens;
  // the database refuses anything else, so this refuses it first.
  if (!raw) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{1,99}$/.test(raw)) return null;
  return raw.length >= 3 ? raw : null;
}

export const profileUrlFor = (handle: string | null): string | null =>
  handle ? `https://www.linkedin.com/in/${handle}` : null;

export async function loadLinkedInAddress(userId: string): Promise<LinkedInAddress> {
  const { data, error } = await supabase
    .from("linkedin_connections")
    .select("handle, profile_url, last_synced_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const handle = canonicalHandle(data?.handle) ?? canonicalHandle(data?.profile_url);
  return {
    handle,
    profileUrl: (data?.profile_url as string | null) || profileUrlFor(handle),
    lastSyncedAt: (data?.last_synced_at as string | null) ?? null,
  };
}

/** Save the address the member typed. Writes the connection row only. */
export async function saveLinkedInAddress(userId: string, input: string): Promise<LinkedInAddress> {
  const handle = canonicalHandle(input);
  if (!handle) throw new Error("That doesn't look like a LinkedIn address.");
  const profile_url = profileUrlFor(handle) as string;
  // The member typed it themselves. That is not a read, so it is not
  // `verified_by_read` — but it is not a guess either.
  const patch = {
    handle,
    profile_url,
    source_status: "member_entered",
    updated_at: new Date().toISOString(),
  };

  // Update first: the row usually exists, and `access_token` is required on
  // insert, so an address-only row starts with an empty token until the member
  // connects LinkedIn properly.
  const { data: updated, error: updateError } = await supabase
    .from("linkedin_connections")
    .update(patch)
    .eq("user_id", userId)
    .select("user_id");
  if (updateError) throw new Error(updateError.message);

  if (!updated || updated.length === 0) {
    const { error: insertError } = await supabase
      .from("linkedin_connections")
      .insert({ user_id: userId, access_token: "", ...patch });
    if (insertError) throw new Error(insertError.message);
  }
  return { handle, profileUrl: profile_url, lastSyncedAt: null };
}