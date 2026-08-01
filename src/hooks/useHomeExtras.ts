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

// ── the Room: who else published on this theme ─────────────────────────────

export interface RoomSource {
  id: string;
  source: string;
  title: string;
  date: string;
}

export interface RoomData {
  loading: boolean;
  sources: RoomSource[];
  /** true once the member has a published post tied to this theme. */
  memberPublished: boolean;
  memberPostTitle: string | null;
}

const norm = (s: string) => s.trim().toLowerCase();

export function useRoomSources(
  userId: string | null | undefined,
  signalId: string | null | undefined,
): RoomData {
  const [state, setState] = useState<RoomData>({
    loading: true, sources: [], memberPublished: false, memberPostTitle: null,
  });

  useEffect(() => {
    if (!userId || !signalId) { setState({ loading: false, sources: [], memberPublished: false, memberPostTitle: null }); return; }
    let alive = true;
    (async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const [sigRes, findRes, postRes] = await Promise.all([
        (supabase.from("strategic_signals" as any) as any)
          .select("theme_tags").eq("id", signalId).maybeSingle(),
        (supabase.from("agent_findings" as any) as any)
          .select("id, source, title, themes, created_at")
          .eq("user_id", userId).gte("created_at", since)
          .order("created_at", { ascending: false }).limit(60),
        (supabase.from("linkedin_posts" as any) as any)
          .select("id, title, hook, post_text, published_at")
          .eq("user_id", userId).eq("source_signal_id", signalId)
          .not("published_at", "is", null)
          .order("published_at", { ascending: false }).limit(1),
      ]);
      if (!alive) return;

      const tags = new Set<string>(((sigRes?.data as any)?.theme_tags ?? []).map((t: any) => norm(String(t))));
      const seen = new Set<string>();
      const sources: RoomSource[] = [];
      for (const r of ((findRes?.data as any[]) || [])) {
        const themes: string[] = (r.themes || []).map((t: any) => norm(String(t)));
        const overlaps = tags.size === 0 ? false : themes.some((t) => tags.has(t));
        if (!overlaps) continue;
        const name = String(r.source || "").trim();
        if (!name) continue;
        const key = norm(name);
        if (seen.has(key)) continue;
        seen.add(key);
        sources.push({ id: r.id, source: name, title: String(r.title || "").trim(), date: r.created_at });
        if (sources.length >= 6) break;
      }

      const post = ((postRes?.data as any[]) || [])[0];
      const t = post ? (post.title || post.hook || String(post.post_text || "").split("\n")[0]) : null;
      setState({
        loading: false,
        sources,
        memberPublished: Boolean(post),
        memberPostTitle: t ? String(t).slice(0, 90) : null,
      });
    })();
    return () => { alive = false; };
  }, [userId, signalId]);

  return state;
}
