import { supabase } from "@/integrations/supabase/client";

// Product-event tracker. Fire-and-forget: never throws, never blocks a UI path.
// A failed track MUST NOT surface an error to the user.

const SESSION_KEY = "aura_session_id";

function getSessionId(): string | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = (crypto as any)?.randomUUID?.() ?? `sess-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

export async function track(event: string, props?: Record<string, unknown>): Promise<void> {
  try {
    const { data } = await supabase.auth.getUser();
    const uid = data?.user?.id;
    if (!uid) return; // silent no-op when signed out
    const session_id = getSessionId();
    await (supabase.from("product_events" as any) as any).insert({
      user_id: uid,
      event,
      props: props ?? {},
      session_id,
    });
  } catch {
    // swallow — tracking must never break the UI
  }
}

export function getTrackSessionId(): string | null {
  return getSessionId();
}