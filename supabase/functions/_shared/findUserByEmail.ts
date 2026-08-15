/**
 * Resolve an email to a user id.
 *
 * Robust on purpose: matching is case-insensitive and whitespace-tolerant,
 * pages through the whole auth list, and falls back to beta_allowlist rows
 * (which carry a user_id once the invite was claimed).
 *
 * Returns null when nothing matches.
 */
export async function findUserIdByEmail(admin: any, rawEmail: string): Promise<string | null> {
  const needle = String(rawEmail ?? "").trim().toLowerCase();
  if (!needle) return null;

  for (let page = 1; page <= 20; page++) {
    const { data: list, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      console.error("listUsers failed:", error.message);
      break;
    }
    const users = list?.users ?? [];
    const hit = users.find((u: any) => (u.email || "").trim().toLowerCase() === needle);
    if (hit) return hit.id;
    if (users.length < 1000) break;
  }

  const { data: rows } = await admin
    .from("beta_allowlist")
    .select("user_id, email")
    .ilike("email", needle)
    .limit(5);
  const claimed = (rows ?? []).find((r: any) => r.user_id);
  return claimed?.user_id ?? null;
}
