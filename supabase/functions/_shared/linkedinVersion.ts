/**
 * The LinkedIn REST API version, discovered — never hard-coded.
 *
 * LinkedIn retires a version roughly every year and rejects a retired one with
 * 426 / NONEXISTENT_VERSION. A date literal in the source is a promise that
 * expires. Instead we walk the last fourteen months, newest first, and cache
 * the one that answered in admin_settings.linkedin_api_version.
 */

export function candidateVersions(): string[] {
  const now = new Date();
  const out: string[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export const isVersionRejection = (status: number, body: string) =>
  status === 426 || /NONEXISTENT_VERSION/i.test(body);

export async function cachedVersion(admin: any): Promise<string | null> {
  const { data } = await admin
    .from("admin_settings").select("value").eq("key", "linkedin_api_version").maybeSingle();
  const raw = (data as any)?.value;
  if (typeof raw === "string") return raw.replace(/"/g, "") || null;
  if (typeof raw?.version === "string") return raw.version;
  return null;
}

export async function rememberVersion(admin: any, version: string, previous: string | null) {
  if (!version || version === previous) return;
  await admin.from("admin_settings")
    .upsert({ key: "linkedin_api_version", value: version }, { onConflict: "key" });
}

/** The ordered list to try: the cached one first, then the rolling window. */
export async function versionCandidates(admin: any): Promise<{ list: string[]; cached: string | null }> {
  const cached = await cachedVersion(admin);
  return { list: [...new Set([cached, ...candidateVersions()].filter(Boolean) as string[])], cached };
}
