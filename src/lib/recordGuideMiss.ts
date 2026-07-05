import { supabase } from "@/integrations/supabase/client";

// Dedupe within a single browser session — log each (slug, surface) at most once.
const _logged = new Set<string>();

export function recordGuideMiss(slug: string, surface: "tooltip" | "hint"): void {
  if (!slug) return;
  const key = `${slug}:${surface}`;
  if (_logged.has(key)) return;
  _logged.add(key);

  // Fire-and-forget. Never block UI, never throw. Writes are gated through a
  // SECURITY DEFINER RPC so authenticated users can only insert/update via
  // validated logic — the base table is not writable from the client.
  (async () => {
    try {
      await (supabase as any).rpc("record_guide_miss", { _slug: slug, _surface: surface });
    } catch {
      // Swallow — telemetry must never affect the UI.
    }
  })();
}

export default recordGuideMiss;