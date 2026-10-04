// The level dropdown is data, never a hard-coded list.
// Rows live in `seniority_titles` (admin-editable) and are read in `position` order.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Band = "work" | "table" | "room";

export interface SeniorityTitle {
  title: string;
  /** Display-only Arabic; selection and matching stay on `title`. */
  title_ar?: string | null;
  band: Band;
  position: number;
}

export const BAND_LABEL: Record<Band, string> = {
  work: "Manager & lead",
  table: "Director & partner",
  room: "C-suite & board",
};

export async function fetchSeniorityTitles(): Promise<SeniorityTitle[]> {
  const { data } = await (supabase.from("seniority_titles" as any) as any)
    .select("title, title_ar, band, position")
    .eq("active", true)
    .order("position");
  return ((data as any[]) || []).map((r) => ({
    title: String(r.title),
    title_ar: typeof r.title_ar === "string" ? r.title_ar : null,
    band: r.band as Band,
    position: Number(r.position) || 0,
  }));
}

/** Read-only hook: the canonical level options, in admin order. */
export function useSeniorityTitles() {
  const [titles, setTitles] = useState<SeniorityTitle[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = async () => {
    setLoading(true);
    setFailed(false);
    try {
      const rows = await fetchSeniorityTitles();
      setTitles(rows);
      setFailed(rows.length === 0);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  return { titles, loading, failed, reload: load };
}

/** The label shown for a level: Arabic when the page is Arabic and a value exists, else English. */
export const titleLabel = (t: Pick<SeniorityTitle, "title" | "title_ar">, lang: string): string =>
  lang === "ar" && t.title_ar && t.title_ar.trim() ? t.title_ar : t.title;

export const bandOfTitle = (titles: SeniorityTitle[], title: string): Band | null =>
  titles.find((t) => t.title === title)?.band ?? null;
