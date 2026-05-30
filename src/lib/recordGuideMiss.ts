import { supabase } from "@/integrations/supabase/client";

// Dedupe within a single browser session — log each (slug, surface) at most once.
const _logged = new Set<string>();

export function recordGuideMiss(slug: string, surface: "tooltip" | "hint"): void {
  if (!slug) return;
  const key = `${slug}:${surface}`;
  if (_logged.has(key)) return;
  _logged.add(key);

  // Fire-and-forget. Never block UI, never throw.
  (async () => {
    try {
      // Try insert first; on PK conflict, bump the counter.
      const { error } = await supabase
        .from("guide_slug_misses")
        .insert({ slug, surface });
      if (error) {
        // Likely duplicate PK — increment count + refresh last_seen.
        const { data: existing } = await supabase
          .from("guide_slug_misses")
          .select("count")
          .eq("slug", slug)
          .eq("surface", surface)
          .maybeSingle();
        if (existing) {
          await supabase
            .from("guide_slug_misses")
            .update({ count: (existing.count ?? 0) + 1, last_seen: new Date().toISOString() })
            .eq("slug", slug)
            .eq("surface", surface);
        }
      }
    } catch {
      // Swallow — telemetry must never affect the UI.
    }
  })();
}

export default recordGuideMiss;