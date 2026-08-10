import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Who is an admin.
 *
 * There is no person compiled into this app. Admin is a row in user_roles,
 * read through the has_role() function on the server.
 */
export async function checkIsAdmin(userId?: string | null): Promise<boolean> {
  if (!userId) return false;
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) {
    console.error("has_role failed:", error.message);
    return false;
  }
  return data === true;
}

/** Admin state for the signed-in member. `null` while still being read. */
export function useIsAdmin(): { isAdmin: boolean | null; userId: string | null } {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const id = session?.user?.id ?? null;
      const ok = await checkIsAdmin(id);
      if (cancelled) return;
      setUserId(id);
      setIsAdmin(ok);
    })();
    return () => { cancelled = true; };
  }, []);

  return { isAdmin, userId };
}
