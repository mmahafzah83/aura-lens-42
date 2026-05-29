import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface GuideArticle {
  slug: string;
  tab: string | null;
  category: string | null;
  question_en: string;
  answer_en: string;
  formula_note_en: string | null;
  related_terms: string[] | null;
  surfaces: string[] | null;
  sort_order: number | null;
}

interface Options {
  tab?: string;
  surface?: string;
}

export function useGuideArticles({ tab, surface }: Options = {}) {
  const [articles, setArticles] = useState<GuideArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        let q = supabase
          .from("guide_articles")
          .select("slug,tab,category,question_en,answer_en,formula_note_en,related_terms,surfaces,sort_order")
          .order("sort_order", { ascending: true });
        if (tab) q = q.eq("tab", tab);
        if (surface) q = q.contains("surfaces", [surface]);
        const { data, error: err } = await q;
        if (cancelled) return;
        if (err) throw err;
        setArticles((data as GuideArticle[]) || []);
        setError(null);
      } catch (e: any) {
        if (!cancelled) setError(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, surface]);

  return { articles, loading, error };
}

export default useGuideArticles;