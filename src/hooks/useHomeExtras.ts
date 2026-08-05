import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Supporting reads for the Room and the Shape.
 *
 * Both hooks return only rows that exist. Nothing here models, projects or
 * invents a source, a name or a past.
 */

// ── the Shape's own past ───────────────────────────────────────────────────
// `facet_states` is upserted in place, so it holds no history. The only record
// of a past shape is `imprint_snapshots.facet_vector`, written on every score run.

export interface ShapePast {
  loading: boolean;
  /** facet -> 0..1, as it stood roughly thirty days ago. Null when no snapshot is old enough. */
  values: Record<string, number> | null;
  takenOn: string | null;
}

export function useShapePast(userId: string | null | undefined): ShapePast {
  const [state, setState] = useState<ShapePast>({ loading: true, values: null, takenOn: null });

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await (supabase.from("imprint_snapshots" as any) as any)
        .select("facet_vector, created_at")
        .eq("user_id", userId)
        .lte("created_at", cutoff)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!alive) return;
      const vec = (data as any)?.facet_vector;
      if (!vec || typeof vec !== "object") {
        setState({ loading: false, values: null, takenOn: null });
        return;
      }
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(vec as Record<string, any>)) {
        const n = typeof v === "number" ? v : Number(v?.value);
        if (Number.isFinite(n)) out[k] = Math.max(0, Math.min(1, n));
      }
      setState({
        loading: false,
        values: Object.keys(out).length ? out : null,
        takenOn: (data as any)?.created_at ?? null,
      });
    })();
    return () => { alive = false; };
  }, [userId]);

  return state;
}

// The Room is closed. Its reads lived here and have been removed.
