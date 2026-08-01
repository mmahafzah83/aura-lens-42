import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * useRecordTimeline — the Record's data layer.
 *
 * Everything is aggregated in SQL by `public.home_record_timeline`: one round
 * trip, a few hundred small rows at most, regardless of how long the member
 * has been on the record. Theme titles are fetched only when a day's chip is
 * opened, capped at ten.
 */

export interface RecordBucket {
  d: string;        // YYYY-MM-DD — day, week start, or month start
  cap: number;
  themes: number;
  drafts: number;
  pub: number;
  nights: number;
}

export interface RecordPublished {
  id: string;
  at: string;
  title: string | null;
  through_aura: boolean;
}

export interface RecordMilestone {
  at: string;
  kind: "band" | "first_publish" | "fragments";
  value: string | null;
  n?: number;
}

export interface RecordTimeline {
  loading: boolean;
  days: RecordBucket[];
  weeks: RecordBucket[];
  months: RecordBucket[];
  published: RecordPublished[];
  milestones: RecordMilestone[];
  signupAt: string | null;
  publishedTotal: number;
  publishedThroughAura: number;
  fragmentsTotal: number;
  themesTotal: number;
  /** rows read on first paint — reported for the record's own honesty */
  rowsFetched: number;
}

const EMPTY: RecordTimeline = {
  loading: true, days: [], weeks: [], months: [], published: [], milestones: [],
  signupAt: null, publishedTotal: 0, publishedThroughAura: 0,
  fragmentsTotal: 0, themesTotal: 0, rowsFetched: 0,
};

const asBuckets = (v: any): RecordBucket[] =>
  (Array.isArray(v) ? v : []).map((b: any) => ({
    d: String(b.d), cap: b.cap ?? 0, themes: b.themes ?? 0,
    drafts: b.drafts ?? 0, pub: b.pub ?? 0, nights: b.nights ?? 0,
  }));

export function useRecordTimeline(userId: string | null | undefined): RecordTimeline {
  const [state, setState] = useState<RecordTimeline>(EMPTY);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      const { data, error } = await (supabase.rpc as any)("home_record_timeline", {});
      if (!alive) return;
      if (error || !data) { setState((s) => ({ ...s, loading: false })); return; }
      const t: any = data;
      const days = asBuckets(t.days);
      const weeks = asBuckets(t.weeks);
      const months = asBuckets(t.months);
      const published: RecordPublished[] = (Array.isArray(t.published) ? t.published : []).map((p: any) => ({
        id: p.id, at: p.at, title: p.title ?? null, through_aura: !!p.through_aura,
      }));
      const milestones: RecordMilestone[] = (Array.isArray(t.milestones) ? t.milestones : [])
        .filter((m: any) => m && m.at)
        .map((m: any) => ({ at: m.at, kind: m.kind, value: m.value ?? null, n: m.n }));
      setState({
        loading: false, days, weeks, months, published, milestones,
        signupAt: t.signup_at ?? null,
        publishedTotal: Number(t.published_total ?? 0),
        publishedThroughAura: Number(t.published_through_aura ?? 0),
        fragmentsTotal: Number(t.fragments_total ?? 0),
        themesTotal: Number(t.themes_total ?? 0),
        rowsFetched: days.length + weeks.length + months.length + published.length + milestones.length,
      });
    })();
    return () => { alive = false; };
  }, [userId]);

  return state;
}

/** Theme titles for one bucket — fetched only when the chip is opened. */
export function useThemeTitles() {
  const [cache, setCache] = useState<Record<string, { titles: string[]; loading: boolean }>>({});

  const load = useCallback(async (key: string, from: string, to: string) => {
    setCache((c) => (c[key] ? c : { ...c, [key]: { titles: [], loading: true } }));
    const { data } = await (supabase.rpc as any)("home_record_themes", { p_from: from, p_to: to });
    const titles = (Array.isArray(data) ? data : []).map((r: any) => String(r.title ?? "")).filter(Boolean);
    setCache((c) => ({ ...c, [key]: { titles, loading: false } }));
  }, []);

  return { cache, load };
}