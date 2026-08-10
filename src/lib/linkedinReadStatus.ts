/**
 * One reader for "has Aura actually read this member's LinkedIn?".
 *
 * `linkedin_connections.source_status` is the only answer that counts:
 * 'verified_by_read' means a profile read really came back. A stored address
 * that has never been read is not confirmed.
 */
import { supabase } from "@/integrations/supabase/client";

export type LinkedInReadStatus = "verified_by_read" | "guessed_from_name" | "missing";

export async function loadReadStatus(userId: string): Promise<LinkedInReadStatus> {
  const { data, error } = await supabase
    .from("linkedin_connections")
    .select("source_status")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return "missing";
  const s = (data as { source_status?: string | null } | null)?.source_status;
  return s === "verified_by_read" || s === "guessed_from_name" ? s : "missing";
}

export async function markVerifiedByRead(userId: string): Promise<void> {
  await supabase
    .from("linkedin_connections")
    .update({ source_status: "verified_by_read" })
    .eq("user_id", userId);
}