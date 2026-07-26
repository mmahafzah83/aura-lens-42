import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/track";

/**
 * trackSignalOpen — the ONE place a strategic-signal open is recorded.
 *
 * WHAT COUNTS AS AN OPEN
 *  - A deliberate act only: expanding a signal, clicking through to it, opening a
 *    detail view, or carrying it into the composer. A card scrolling past in a
 *    list is NOT an open, and neither is a re-render, a hover, or a prefetch.
 *  - Debounced: the same signal, by the same user, within 30 seconds counts once.
 *  - Never fired from an admin preview surface (see ADMIN_SURFACE_PREFIX). The
 *    founder inspecting the product must not look like a user reading it.
 *  - No backfill, ever. Anything displayed before this shipped is unmeasured.
 *
 * It records twice, on purpose:
 *  - product_events row (event `signal_opened`, props carry signal_id + surface)
 *  - signal_engagements upsert (open_count + 1, last_opened_at = now)
 */

const DEBOUNCE_MS = 30_000;
const ADMIN_SURFACE_PREFIX = "admin";

/** In-memory: signalId -> last recorded timestamp (ms). Per tab, per session. */
const lastOpen = new Map<string, number>();

export type SignalSurface =
  | "home_brief_row"
  | "home_brief_next_move"
  | "home_brief_signal_list"
  | "home_brief_map"
  | "intelligence_list"
  | "intelligence_deeplink"
  | "intelligence_draft_handoff"
  | "signal_explorer"
  | "composer_start_from"
  | "composer_prefill"
  | (string & {});

export function trackSignalOpen(signalId: string | null | undefined, surface: SignalSurface): void {
  if (!signalId) return;
  if (typeof surface === "string" && surface.startsWith(ADMIN_SURFACE_PREFIX)) return;

  const now = Date.now();
  const previous = lastOpen.get(signalId);
  if (previous !== undefined && now - previous < DEBOUNCE_MS) return; // same signal, same user, inside 30s
  lastOpen.set(signalId, now);

  // Fire-and-forget. A failed measurement must never break a reading path.
  void (async () => {
    try {
      await Promise.allSettled([
        track("signal_opened", { signal_id: signalId, surface }),
        (supabase as any).rpc("bump_signal_engagement", { p_signal_id: signalId }),
      ]);
    } catch {
      /* swallow — measurement never surfaces to the user */
    }
  })();
}
