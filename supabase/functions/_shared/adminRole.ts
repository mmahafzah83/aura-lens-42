/**
 * Who is an admin.
 *
 * There is no person compiled into this codebase. Admin is a row in
 * public.user_roles, read through the SECURITY DEFINER function has_role().
 * Any Supabase client can call it — the function returns a boolean and nothing
 * else.
 */

/** True when this user holds the admin role. Never throws. */
export async function isAdmin(client: any, userId?: string | null): Promise<boolean> {
  if (!userId) return false;
  try {
    const { data, error } = await client.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (error) {
      console.error("has_role failed:", error.message);
      return false;
    }
    return data === true;
  } catch (e) {
    console.error("has_role threw:", (e as Error)?.message);
    return false;
  }
}

/** Every admin user id, oldest grant first. Never throws. */
export async function adminUserIds(admin: any): Promise<string[]> {
  try {
    const { data, error } = await admin
      .from("user_roles")
      .select("user_id, created_at")
      .eq("role", "admin")
      .order("created_at", { ascending: true });
    if (error) {
      console.error("adminUserIds failed:", error.message);
      return [];
    }
    return (data ?? []).map((r: any) => r.user_id as string);
  } catch {
    return [];
  }
}

/** The longest-standing admin — the account operational mail goes to. */
export async function primaryAdminId(admin: any): Promise<string | null> {
  const ids = await adminUserIds(admin);
  return ids[0] ?? null;
}
