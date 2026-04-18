import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

/**
 * useAuthReady — deterministic auth bootstrap.
 *
 * Why: After a hard browser refresh, the Supabase client restores its session
 * from localStorage asynchronously. Components that fire `supabase.auth.getUser()`
 * (a network call) on mount can race the restore — and if an extension or
 * network hiccup blocks `/auth/v1/user`, the call never resolves, leaving
 * loading flags stuck and pages permanently in skeleton state.
 *
 * Fix: read the session ONCE via `getSession()` (localStorage-only, no network),
 * expose an `isReady` flag, and let pages gate queries on it. After ready,
 * pages should use the returned `user` directly instead of calling `getUser()`.
 */
export function useAuthReady() {
  const [user, setUser] = useState<User | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    console.log("[auth] restore started");

    // Subscribe FIRST so we never miss an event. Synchronous handler only.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (cancelled) return;
        setUser(session?.user ?? null);
      }
    );

    // Then resolve the cached session. This reads from localStorage and does
    // NOT make a network call, so it cannot hang on a blocked /auth/v1/user.
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (cancelled) return;
        setUser(session?.user ?? null);
        setIsReady(true);
        console.log(
          "[auth] restore finished",
          session?.user ? `uid=${session.user.id.slice(0, 8)}` : "no user"
        );
      })
      .catch((e) => {
        if (cancelled) return;
        console.error("[auth] restore failed", e);
        // Still mark ready so pages can show error/empty states instead of
        // hanging in skeletons forever.
        setIsReady(true);
      });

    // Safety net: if getSession somehow never resolves (shouldn't happen),
    // unblock the UI after 4s so pages can render error states.
    const safety = setTimeout(() => {
      if (!cancelled) {
        setIsReady((prev) => {
          if (!prev) console.warn("[auth] restore safety timeout fired");
          return true;
        });
      }
    }, 4000);

    return () => {
      cancelled = true;
      clearTimeout(safety);
      subscription.unsubscribe();
    };
  }, []);

  return { user, isReady };
}
