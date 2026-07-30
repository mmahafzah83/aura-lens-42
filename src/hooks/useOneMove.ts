import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * useOneMove — the single ranked move for Home.
 *
 * Reads two things for the signed-in user, nothing invented:
 *   1. the newest waiting draft (drafts source of truth)
 *   2. the strongest live signal that has never carried a post
 */

export interface OneMoveDraft {
  id: string;
  body: string;
  title: string | null;
  language: "en" | "ar";
  type: "carousel" | "framework" | "linkedin_post";
  wordCount: number;
  firstLine: string;
  updatedAt: string;
}

export interface OneMoveSignal {
  id: string;
  title: string;
  fragmentCount: number;
  insight: string;
}

export interface OneMoveState {
  loading: boolean;
  draft: OneMoveDraft | null;
  signal: OneMoveSignal | null;
  refresh: () => void;
}

const wordsOf = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export function useOneMove(userId: string | null | undefined): OneMoveState {
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<OneMoveDraft | null>(null);
  const [signal, setSignal] = useState<OneMoveSignal | null>(null);

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    try {
      const [draftRes, sigRes, postRes] = await Promise.all([
        supabase
          .from("content_items")
          .select("id, body, title, language, type, updated_at, created_at")
          .eq("user_id", userId)
          .eq("status", "draft")
          .order("updated_at", { ascending: false })
          .limit(10),
        supabase
          .from("strategic_signals")
          .select("id, signal_title, fragment_count, strength_score, explanation, what_it_means_for_you")
          .eq("user_id", userId)
          .eq("status", "active"),
        supabase
          .from("linkedin_posts")
          .select("source_metadata")
          .eq("user_id", userId),
      ]);

      const dRow = (((draftRes.data as any[]) || []).find((d) => wordsOf(d.body || "") > 0)) || null;
      setDraft(dRow ? {
        id: dRow.id,
        body: dRow.body || "",
        title: dRow.title ?? null,
        language: dRow.language === "ar" ? "ar" : "en",
        type: (dRow.type === "carousel" || dRow.type === "framework") ? dRow.type : "linkedin_post",
        wordCount: wordsOf(dRow.body || ""),
        firstLine: (dRow.body || "").trim().split("\n").map((l: string) => l.trim()).find(Boolean) || (dRow.title || ""),
        updatedAt: dRow.updated_at || dRow.created_at,
      } : null);

      const usedSignalIds = new Set<string>();
      for (const p of ((postRes.data as any[]) || [])) {
        const ids = (p as any)?.source_metadata?.signal_ids;
        if (Array.isArray(ids)) ids.forEach((r: any) => usedSignalIds.add(String(r)));
      }

      const best = (((sigRes.data as any[]) || [])
        .filter((s) => !!s.signal_title && !usedSignalIds.has(String(s.id)))
        .sort((a, b) => (b.strength_score ?? 0) - (a.strength_score ?? 0)))[0] || null;

      setSignal(best ? {
        id: best.id,
        title: best.signal_title,
        fragmentCount: best.fragment_count ?? 0,
        insight: (best.what_it_means_for_you || best.explanation || "").trim(),
      } : null);
    } catch (e) {
      console.warn("[useOneMove] load failed", e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  return { loading, draft, signal, refresh: load };
}

export default useOneMove;
