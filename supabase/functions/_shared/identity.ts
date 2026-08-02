/**
 * ONE source of truth for who the member is.
 *
 * The name that appears on a slide, in a caption, or in an email is resolved
 * in exactly one order, everywhere:
 *
 *   1. diagnostic_profiles.display_name_override — the member said so.
 *   2. linkedin_connections.display_name          — LinkedIn said so.
 *   3. diagnostic_profiles.first_name + last_name — what onboarding guessed.
 *
 * The handle follows the same shape: LinkedIn first, profile columns last.
 * Nothing else in the codebase may assemble a member name.
 */

export type IdentitySource = "override" | "linkedin" | "profile";

export interface Identity {
  name: string;
  handle: string;
  profile_url: string | null;
  name_source: IdentitySource;
  handle_source: IdentitySource;
}

/** "https://linkedin.com/in/mmahafzah/" | "@mmahafzah" -> "mmahafzah" */
export function bareHandle(value?: string | null): string | null {
  if (!value) return null;
  const v = String(value).trim();
  if (!v) return null;
  const fromUrl = v.match(/linkedin\.com\/in\/([^/?#]+)/i);
  const raw = fromUrl ? fromUrl[1] : v.replace(/^@/, "");
  const cleaned = decodeURIComponent(raw).replace(/[^A-Za-z0-9\u0600-\u06FF._-]/g, "").trim();
  return cleaned.length ? cleaned : null;
}

/** The public profile URL for a vanity name. */
export function profileUrlFor(handle?: string | null): string | null {
  const h = bareHandle(handle);
  return h ? `https://www.linkedin.com/in/${h}` : null;
}

/**
 * The vanity name from whatever LinkedIn handed back. `r_basicprofile`
 * returns `vanityName` on /v2/me; the OIDC /v2/userinfo response does not,
 * so the profile URL it carries is parsed instead.
 */
export function vanityFromLinkedIn(payload: any): string | null {
  if (!payload || typeof payload !== "object") return null;
  const direct = payload.vanityName ?? payload.vanity_name ?? payload.publicIdentifier;
  if (typeof direct === "string" && direct.trim()) return bareHandle(direct);
  const urls = [payload.publicProfileUrl, payload.profile, payload.profileUrl, payload.websiteUrl]
    .filter((u: unknown) => typeof u === "string");
  for (const u of urls) {
    const h = bareHandle(u as string);
    if (h) return h;
  }
  return null;
}

/** The display name from whatever LinkedIn handed back. */
export function nameFromLinkedIn(payload: any): string | null {
  if (!payload || typeof payload !== "object") return null;
  const candidates = [
    payload.name,
    [payload.given_name, payload.family_name].filter(Boolean).join(" "),
    [payload.localizedFirstName, payload.localizedLastName].filter(Boolean).join(" "),
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 1) return c.trim();
  }
  return null;
}

/** The pure resolution, so callers that already hold the rows do not re-read. */
export function resolveIdentityFrom(conn: any, prof: any): Identity {
  const override = String(prof?.display_name_override ?? "").trim();
  const fromLinkedIn = String(conn?.display_name ?? conn?.profile_name ?? "").trim();
  const assembled = [prof?.first_name, prof?.last_name].filter(Boolean).join(" ").trim();

  const name = override || fromLinkedIn || assembled || "Member";
  const name_source: IdentitySource = override ? "override" : fromLinkedIn ? "linkedin" : "profile";

  const linkedinHandle = bareHandle(conn?.handle) ?? bareHandle(conn?.profile_url);
  const profileHandle = bareHandle(prof?.linkedin_handle) ?? bareHandle(prof?.linkedin_url);
  const handle = linkedinHandle ?? profileHandle ?? "member";
  const handle_source: IdentitySource = linkedinHandle ? "linkedin" : "profile";

  return {
    name,
    handle,
    profile_url: conn?.profile_url ?? profileUrlFor(handle),
    name_source,
    handle_source,
  };
}

/** Resolve the member's identity. `db` must be a service-role client. */
export async function resolveIdentity(db: any, userId: string): Promise<Identity> {
  const [{ data: conn }, { data: prof }] = await Promise.all([
    db.from("linkedin_connections")
      .select("display_name, handle, profile_url, profile_name")
      .eq("user_id", userId)
      .maybeSingle(),
    db.from("diagnostic_profiles")
      .select("display_name_override, first_name, last_name, linkedin_handle, linkedin_url")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  return resolveIdentityFrom(conn, prof);
}

/**
 * Write what LinkedIn told us onto the connection row. Called on connect and
 * on every sync, so `linkedin_connections` never drifts from the account.
 */
export async function writeLinkedInIdentity(
  db: any,
  userId: string,
  payload: any,
): Promise<{ display_name: string | null; handle: string | null; profile_url: string | null }> {
  const display_name = nameFromLinkedIn(payload);
  const handle = vanityFromLinkedIn(payload);
  const profile_url = profileUrlFor(handle);

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (display_name) { patch.display_name = display_name; patch.profile_name = display_name; }
  if (handle) patch.handle = handle;
  if (profile_url) patch.profile_url = profile_url;

  if (Object.keys(patch).length > 1) {
    await db.from("linkedin_connections").update(patch).eq("user_id", userId);
  }
  return { display_name, handle, profile_url };
}