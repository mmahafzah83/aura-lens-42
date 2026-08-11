import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * useHomeAddress — today's chief-of-staff address.
 *
 * The Edge Function returns the cached row for today; it only generates when
 * no row exists. Never called on render, only once on mount.
 */

export interface HomeMove {
  key?: string;
  title?: string;
  what: string;
  why: string;
  how: string;
  outcome: string;
  cta_route: string;
  est_minutes: number;
}

export type HomeLens = "record" | "shape";

export interface HomeFacts {
  as_of?: string;
  days_since_signup?: number | null;
  days_since_last_visit?: number | null;
  last_capture_date?: string | null;
  captured_today?: boolean;
  captures_total?: number;
  captures_this_week?: number;
  weeks_with_a_capture_last_4?: number;
  fragments_total?: number;
  distinct_sources?: number;
  signals_active?: number;
  signals_accelerating?: number;
  signals_never_published_from?: number;
  top_signal?: {
    id: string; title: string; fragment_count: number;
    velocity: string | null; first_fragment_date: string | null; gained_last_7d: boolean;
  } | null;
  imprint?: number | null;
  tier?: string | null;
  components?: { signal: number | null; content: number | null; capture: number | null };
  points_to_next_band?: number | null;
  next_band_name?: string | null;
  at_top_band?: boolean;
  facets?: Array<{ facet: string; value: number }>;
  facets_dormant?: string[];
  facets_dormant_reason?: string | null;
  drafts_total?: number;
  drafts_from_signals?: number;
  published_total?: number;
  published_through_aura?: number;
  publish_attempts?: number;
  last_publish_attempt?: string | null;
  last_night?: {
    sources_read: number; themes_strengthened: number; drafts_written: number;
    newest_signal_draft: {
      id: string; title: string | null; signal_id: string | null;
      fragment_count: number | null; created_at?: string | null; signal_status?: string | null;
    } | null;
  };
  linkedin_connected?: boolean;
}

export interface HomeAddressRow {
  id: string;
  address_date: string;
  lens: HomeLens;
  lens_reason: string;
  address_md: string | null;
  moves: HomeMove[];
  facts: HomeFacts;
  generated_at: string | null;
}

export interface HomeAddressState {
  loading: boolean;
  /** true when the function failed — the page still renders from `facts`. */
  errored: boolean;
  row: HomeAddressRow | null;
  /** today's row read straight from the table, available before prose arrives. */
  facts: HomeFacts | null;
}

// Must match the home-address edge function, which keys rows in UTC.
const todayKey = () => new Date().toISOString().slice(0, 10);

function normalise(raw: any): HomeAddressRow | null {
  if (!raw) return null;
  return {
    id: raw.id,
    address_date: raw.address_date,
    lens: (raw.lens === "shape" ? "shape" : "record") as HomeLens,
    lens_reason: raw.lens_reason ?? "",
    address_md: raw.address_md ?? null,
    moves: Array.isArray(raw.moves) ? (raw.moves as HomeMove[]) : [],
    facts: (raw.facts ?? {}) as HomeFacts,
    generated_at: raw.generated_at ?? null,
  };
}

export function useHomeAddress(userId: string | null | undefined): HomeAddressState {
  const [state, setState] = useState<HomeAddressState>({
    loading: true, errored: false, row: null, facts: null,
  });

  useEffect(() => {
    if (!userId) return;
    let alive = true;

    (async () => {
      // 1 — the deterministic half, straight from the table, so the page can
      //     draw itself before any prose exists.
      try {
        const { data } = await (supabase.from("home_address" as any) as any)
          .select("*").eq("user_id", userId).eq("address_date", todayKey()).maybeSingle();
        const row = normalise(data);
        if (alive && row) setState((s) => ({ ...s, row, facts: row.facts }));
      } catch { /* the function call below is the real attempt */ }

      // 2 — the function: returns today's cached row, or generates it once.
      try {
        const { data: sess } = await supabase.auth.getSession();
        if (!sess?.session) throw new Error("no session");
        const { data, error } = await supabase.functions.invoke("home-address", { body: {} });
        if (error) throw error;
        const row = normalise((data as any)?.address);
        if (!alive) return;
        if (row) setState({ loading: false, errored: false, row, facts: row.facts });
        else setState((s) => ({ ...s, loading: false, errored: true }));
      } catch {
        if (alive) setState((s) => ({ ...s, loading: false, errored: true }));
      }
    })();

    return () => { alive = false; };
  }, [userId]);

  return state;
}


// ── what Aura read: the chips under the address ────────────────────────────

export interface ReadChip { key: string; label: string }

export function useReadChips(userId: string | null | undefined, facts: HomeFacts | null): ReadChip[] {
  const [profile, setProfile] = useState<{ answers: number; calibrated: boolean; linkedin: boolean } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      // The LinkedIn address lives on linkedin_connections — the profile columns are deprecated.
      const [{ data }, { data: conn }] = await Promise.all([
        supabase.from("diagnostic_profiles")
          .select("brand_assessment_answers, skill_ratings").eq("user_id", userId).maybeSingle(),
        supabase.from("linkedin_connections")
          .select("handle, profile_url").eq("user_id", userId).maybeSingle(),
      ]);
      if (!alive || !data) return;
      const a = (data as any).brand_assessment_answers;
      const s = (data as any).skill_ratings;
      setProfile({
        answers: a && typeof a === "object" ? Object.keys(a).length : 0,
        calibrated: !!s && typeof s === "object" && Object.keys(s).length > 0,
        linkedin: Boolean(conn?.handle || conn?.profile_url),
      });
    })();
    return () => { alive = false; };
  }, [userId]);

  const chips: ReadChip[] = [];
  if (profile?.linkedin || facts?.linkedin_connected) chips.push({ key: "li", label: "Your LinkedIn" });
  if (profile && profile.answers > 0) chips.push({ key: "as", label: `${profile.answers} answers` });
  if (profile?.calibrated) chips.push({ key: "cal", label: "Your calibration" });
  if (facts?.fragments_total) chips.push({ key: "fr", label: `${facts.fragments_total} fragments` });
  if (facts?.distinct_sources) chips.push({ key: "src", label: `${facts.distinct_sources} sources` });
  return chips;
}