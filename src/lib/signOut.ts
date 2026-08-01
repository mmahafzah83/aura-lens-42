import { supabase } from "@/integrations/supabase/client";

/**
 * Keys that belong to the *machine*, not the member. Everything else with an
 * Aura-ish prefix is wiped on sign-out so the next person on a shared laptop
 * sees nothing of the previous member.
 */
const KEEP = new Set(["aura-cookie-consent", "aura_lang", "language"]);

const MEMBER_PREFIXES = [
  "aura_",            // welcome, tier ack, first-flight, milestones, onboarding
  "sb-",              // any stray supabase remnants
  "move_dismissed_",  // one-move dismissals
  "briefing_expanded_",
  "password_set",
  "home_",
  "signals_",
  "publish_",
];

/** Removes every member-scoped key from localStorage and sessionStorage. */
export function clearMemberClientState(): string[] {
  const cleared: string[] = [];
  const sweep = (store: Storage) => {
    let keys: string[] = [];
    try { keys = Object.keys(store); } catch { return; }
    for (const k of keys) {
      if (KEEP.has(k)) continue;
      if (MEMBER_PREFIXES.some((p) => k.startsWith(p))) {
        try { store.removeItem(k); cleared.push(k); } catch { /* noop */ }
      }
    }
  };
  try { sweep(window.localStorage); } catch { /* noop */ }
  try { sweep(window.sessionStorage); } catch { /* noop */ }
  return cleared;
}

/**
 * The one sign-out path. Ends the session, wipes member state, and lands the
 * person on the public landing page with the history entry replaced so the
 * back button cannot walk into a dead authenticated page.
 */
export async function signOutAndLand(navigate?: (to: string, opts?: { replace?: boolean }) => void) {
  try { await supabase.auth.signOut(); } catch { /* the session is going either way */ }
  clearMemberClientState();
  if (navigate) navigate("/", { replace: true });
  else window.location.replace("/");
}
