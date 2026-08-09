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
  const raw = fromUrl ? fromUrl[1] : v.replace(/^@/, "");
  const cleaned = decodeURIComponent(raw).replace(/\s+/g, "").replace(/^[./-]+|[./-]+$/g, "");
  return cleaned.length ? cleaned : null;
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
  const { error } = await supabase
    .from("linkedin_connections")
    .upsert({ user_id: userId, handle, profile_url, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
  return { handle, profileUrl: profile_url, lastSyncedAt: null };
}