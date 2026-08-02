/**
 * Who the member is, resolved the same way everywhere in the product.
 *
 *   1. diagnostic_profiles.display_name_override — the member said so.
 *   2. linkedin_connections.display_name          — LinkedIn said so.
 *   3. diagnostic_profiles.first_name + last_name — what onboarding guessed.
 */
import { supabase } from "@/integrations/supabase/client";

export type IdentitySource = "override" | "linkedin" | "profile";

export interface Identity {
  name: string;
  handle: string;
  profile_url: string | null;
  name_source: IdentitySource;
  handle_source: IdentitySource;
}

export function bareHandle(value?: string | null): string | null {
  if (!value) return null;
  const v = String(value).trim();
  if (!v) return null;
  const fromUrl = v.match(/linkedin\.com\/in\/([^/?#]+)/i);
  const raw = fromUrl ? fromUrl[1] : v.replace(/^@/, "");
  const cleaned = decodeURIComponent(raw).replace(/[^A-Za-z0-9\u0600-\u06FF._-]/g, "").trim();
  return cleaned.length ? cleaned : null;
}

export function resolveIdentityFrom(conn: any, prof: any): Identity {
  const override = String(prof?.display_name_override ?? "").trim();
  const fromLinkedIn = String(conn?.display_name ?? conn?.profile_name ?? "").trim();
  const assembled = [prof?.first_name, prof?.last_name].filter(Boolean).join(" ").trim();

  const name = override || fromLinkedIn || assembled || "Member";
  const linkedinHandle = bareHandle(conn?.handle) ?? bareHandle(conn?.profile_url);
  const profileHandle = bareHandle(prof?.linkedin_handle) ?? bareHandle(prof?.linkedin_url);
  const handle = linkedinHandle ?? profileHandle ?? "member";

  return {
    name,
    handle,
    profile_url: conn?.profile_url ?? (handle !== "member" ? `https://www.linkedin.com/in/${handle}` : null),
    name_source: override ? "override" : fromLinkedIn ? "linkedin" : "profile",
    handle_source: linkedinHandle ? "linkedin" : "profile",
  };
}

export async function loadIdentity(userId: string): Promise<Identity> {
  const [{ data: conn }, { data: prof }] = await Promise.all([
    supabase.from("linkedin_connections")
      .select("display_name, profile_name, handle, profile_url")
      .eq("user_id", userId).maybeSingle(),
    supabase.from("diagnostic_profiles")
      .select("display_name_override, first_name, last_name, linkedin_handle, linkedin_url")
      .eq("user_id", userId).maybeSingle(),
  ]);
  return resolveIdentityFrom(conn, prof);
}

/** Store the member's own spelling of their name. Empty clears the override. */
export async function saveDisplayNameOverride(userId: string, name: string): Promise<void> {
  const value = name.trim();
  const { error } = await supabase
    .from("diagnostic_profiles")
    .update({ display_name_override: value.length ? value : null })
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** Store the member's handle on the connection row the studio reads from. */
export async function saveHandle(userId: string, handle: string): Promise<void> {
  const h = bareHandle(handle);
  const { error } = await supabase
    .from("linkedin_connections")
    .update({ handle: h, profile_url: h ? `https://www.linkedin.com/in/${h}` : null })
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}