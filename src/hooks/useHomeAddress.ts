import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * useHomeAddress — today's chief-of-staff address.
 *
 * The Edge Function returns the cached row for today; it only generates when
 * no row exists. Never called on render, only once on mount.
 */

export interface HomeMove {
  key?: string;
  what: string;
  why: string;
  how: string;
  outcome: string;
  cta_route: string;
  est_minutes: number;
}

export type HomeLens = "record" | "room" | "shape";

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
    newest_signal_draft: { id: string; title: string | null; signal_id: string | null; fragment_count: number | null } | null;
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

const todayKey = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

function normalise(raw: any): HomeAddressRow | null {
  if (!raw) return null;
  return {
    id: raw.id,
    address_date: raw.address_date,
    lens: (raw.lens === "room" || raw.lens === "shape" ? raw.lens : "record") as HomeLens,
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

// ── the ledger: real events behind The Record ──────────────────────────────

export interface LedgerDay {
  key: string;            // YYYY-MM-DD
  label: string;          // "Tuesday 4 March"
  lines: string[];
  machine?: boolean;      // cyan dot — Aura acted that day
}

export interface HomeLedger {
  loading: boolean;
  days: LedgerDay[];
  daysOnRecord: number | null;
  fragments: number;
  themes: number;
  nightsProduced: number;
  published: number;
}

const dayOf = (iso: string) => iso.slice(0, 10);
const labelOf = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${dt.toLocaleDateString("en-GB", { weekday: "long" })} ${dt.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}`;
};
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function useHomeLedger(userId: string | null | undefined, days = 14): HomeLedger {
  const [state, setState] = useState<HomeLedger>({
    loading: true, days: [], daysOnRecord: null, fragments: 0, themes: 0, nightsProduced: 0, published: 0,
  });

  const load = useCallback(async () => {
    if (!userId) return;
    const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString();

    const [entriesR, signalsR, snapsR, findingsR, postsR, profileR, fragR] = await Promise.all([
      supabase.from("entries").select("created_at").eq("user_id", userId).gte("created_at", sinceIso).limit(1000),
      (supabase.from("strategic_signals" as any) as any)
        .select("signal_title, created_at").eq("user_id", userId).gte("created_at", sinceIso).limit(200),
      supabase.from("imprint_snapshots").select("tier, created_at").eq("user_id", userId)
        .order("created_at", { ascending: false }).limit(200),
      (supabase.from("agent_findings" as any) as any)
        .select("created_at, status").eq("user_id", userId).gte("created_at", sinceIso).limit(500),
      (supabase.from("linkedin_posts" as any) as any)
        .select("created_at, published_at, tracking_status").eq("user_id", userId).limit(1000),
      supabase.from("diagnostic_profiles").select("created_at").eq("user_id", userId).maybeSingle(),
      supabase.from("evidence_fragments").select("id", { count: "exact", head: true }).eq("user_id", userId),
    ]);

    const buckets = new Map<string, { lines: string[]; machine: boolean }>();
    const push = (key: string, line: string, machine = false) => {
      const b = buckets.get(key) ?? { lines: [], machine: false };
      b.lines.push(line);
      if (machine) b.machine = true;
      buckets.set(key, b);
    };

    // captures
    const capByDay = new Map<string, number>();
    ((entriesR.data as any[]) || []).forEach((e) => {
      const k = dayOf(e.created_at);
      capByDay.set(k, (capByDay.get(k) ?? 0) + 1);
    });
    capByDay.forEach((n, k) => push(k, `You captured ${plural(n, "thing", "things")}.`));

    // themes formed
    ((signalsR.data as any[]) || []).forEach((s) => {
      push(dayOf(s.created_at), `A theme formed — ${s.signal_title}.`, true);
    });

    // band crossings
    const snaps = ((snapsR.data as any[]) || []).slice().reverse();
    let lastTier: string | null = null;
    snaps.forEach((s) => {
      const t = s.tier ?? null;
      if (lastTier && t && t !== lastTier && s.created_at >= sinceIso) {
        push(dayOf(s.created_at), `You crossed into ${String(t).replace(/_/g, " ")}.`);
      }
      if (t) lastTier = t;
    });

    // nights
    const nightDays = new Set<string>();
    ((findingsR.data as any[]) || []).forEach((f) => nightDays.add(dayOf(f.created_at)));
    const posts = ((postsR.data as any[]) || []);
    const draftDays = new Set<string>(
      posts.filter((p) => p.tracking_status === "draft").map((p) => dayOf(p.created_at)),
    );
    nightDays.forEach((k) => {
      if (draftDays.has(k)) push(k, "Aura read overnight and wrote a draft.", true);
      else push(k, "Aura read overnight and found nothing worth writing.", true);
    });

    // published
    const publishedRows = posts.filter((p) => ["published", "posted", "live"].includes(String(p.tracking_status)));
    publishedRows.forEach((p) => {
      const iso = p.published_at || p.created_at;
      if (iso >= sinceIso) push(dayOf(iso), "You published.");
    });

    const ordered = [...buckets.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, v]) => ({ key, label: labelOf(key), lines: v.lines, machine: v.machine }));

    const created = (profileR.data as any)?.created_at ?? null;
    const daysOnRecord = created
      ? Math.max(1, Math.round((Date.now() - new Date(created).getTime()) / 86_400_000))
      : null;

    // nights that produced something, over the last 7
    const sevenAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    const nightsProduced = [...draftDays].filter((k) => k >= sevenAgo).length;

    setState({
      loading: false,
      days: ordered,
      daysOnRecord,
      fragments: fragR.count ?? 0,
      themes: ((signalsR.data as any[]) || []).length,
      nightsProduced,
      published: publishedRows.length,
    });
  }, [userId, days]);

  useEffect(() => { void load().catch(() => setState((s) => ({ ...s, loading: false }))); }, [load]);

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
      const { data } = await supabase.from("diagnostic_profiles")
        .select("brand_assessment_answers, skill_ratings, linkedin_url").eq("user_id", userId).maybeSingle();
      if (!alive || !data) return;
      const a = (data as any).brand_assessment_answers;
      const s = (data as any).skill_ratings;
      setProfile({
        answers: a && typeof a === "object" ? Object.keys(a).length : 0,
        calibrated: !!s && typeof s === "object" && Object.keys(s).length > 0,
        linkedin: !!(data as any).linkedin_url,
      });
    })();
    return () => { alive = false; };
  }, [userId]);

  const chips: ReadChip[] = [];
  if (profile?.linkedin || facts?.linkedin_connected) chips.push({ key: "li", label: "Your LinkedIn" });
  if (profile && profile.answers > 0) chips.push({ key: "as", label: `${profile.answers} assessment answers` });
  if (profile?.calibrated) chips.push({ key: "cal", label: "Your calibration" });
  if (facts?.fragments_total) chips.push({ key: "fr", label: `${facts.fragments_total} fragments` });
  if (facts?.distinct_sources) chips.push({ key: "src", label: `${facts.distinct_sources} sources` });
  return chips;
}