import { useCallback, useEffect, useId, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * useTierFromImprint — derive the user's current tier from imprint_snapshots
 * and detect band crossings client-side. Replaces the retired calculate-aura-score
 * tier_name / newly_earned payload that TierCeremonyModal + MilestoneNotification
 * used to depend on. No edge function and no table is touched.
 *
 * Tier bands (ratified Score System spec, applied to Imprint — one metric):
 *   Observer    0–14
 *   Explorer   15–34
 *   Strategist 35–59
 *   Voice      60–79
 *   Presence   80–100
 *
 * Crossing logic: compare the latest snapshot's band against the previous
 * snapshot's band. If they differ AND the user hasn't already acknowledged
 * this tier locally (localStorage), mark `crossed=true` so the parent can
 * open the ceremony.
 */

export type TierKey = "observer" | "explorer" | "strategist" | "voice" | "presence";

export interface TierBand {
  key: TierKey;
  name: string; // capitalised display form
  min: number;
  max: number; // inclusive
}

export const TIER_BANDS: TierBand[] = [
  { key: "observer",   name: "Observer",   min: 0,  max: 14  },
  { key: "explorer",   name: "Explorer",   min: 15, max: 34  },
  { key: "strategist", name: "Strategist", min: 35, max: 59  },
  { key: "voice",      name: "Voice",      min: 60, max: 79  },
  { key: "presence",   name: "Presence",   min: 80, max: 100 },
];

export function bandFromScore(score: number | null | undefined): TierBand | null {
  if (score == null || Number.isNaN(score)) return null;
  const s = Math.max(0, Math.min(100, Math.round(score)));
  return TIER_BANDS.find(b => s >= b.min && s <= b.max) || null;
}

/** Look up a tier band by its EF-computed key. Source of truth when present. */
export const bandFromKey = (key: string | null | undefined): TierBand | null =>
  key ? (TIER_BANDS.find(b => b.key === key) ?? null) : null;

const ACK_KEY = "aura_tier_ack_v1"; // { [tierKey]: epoch_ms }

function readAck(): Record<string, number> {
  try {
    const raw = localStorage.getItem(ACK_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch { return {}; }
}

function writeAck(map: Record<string, number>) {
  try { localStorage.setItem(ACK_KEY, JSON.stringify(map)); } catch {}
}

export interface UseTierFromImprintResult {
  loading: boolean;
  /** Latest imprint score (0–100) or null when no snapshots. */
  score: number | null;
  /** Current tier derived from the latest snapshot. */
  currentTier: TierBand | null;
  /** Previous tier from the prior snapshot (null when first snapshot). */
  previousTier: TierBand | null;
  /** Numeric delta = latest - prior imprint score (null when no prior). */
  delta: number | null;
  /** True when latest band differs from previous band AND not yet acknowledged. */
  crossed: boolean;
  /** Mark current tier as acknowledged so it won't re-trigger. */
  acknowledge: () => void;
  /** Manually re-query (also called on imprint_snapshots realtime events). */
  refresh: () => void;
}

export function useTierFromImprint(userId: string | null | undefined): UseTierFromImprintResult {
  const instanceId = useId();
  const [loading, setLoading] = useState(true);
  const [score, setScore] = useState<number | null>(null);
  const [currentTier, setCurrentTier] = useState<TierBand | null>(null);
  const [previousTier, setPreviousTier] = useState<TierBand | null>(null);
  const [delta, setDelta] = useState<number | null>(null);
  const [crossed, setCrossed] = useState(false);

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      setScore(null); setCurrentTier(null); setPreviousTier(null); setDelta(null); setCrossed(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("imprint_snapshots")
        .select("imprint, tier, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(2);
      if (error) throw error;
      const rows = (data || []) as Array<{ imprint: number | null; tier: string | null; created_at: string }>;
      const latest = rows[0]?.imprint ?? null;
      const prior  = rows[1]?.imprint ?? null;
      // Source of truth = EF-computed tier (carries asymmetric hysteresis).
      // bandFromScore is a legacy fallback ONLY for old rows where tier is null.
      const cur  = bandFromKey(rows[0]?.tier) ?? bandFromScore(latest);
      const prev = bandFromKey(rows[1]?.tier) ?? bandFromScore(prior);
      setScore(latest);
      setCurrentTier(cur);
      setPreviousTier(prev);
      setDelta(latest != null && prior != null ? Math.round(latest - prior) : null);

      // Crossing = bands differ. We do NOT require an upward move (a downward
      // crossing still warrants surfacing, though the modal copy reads as a
      // celebration; surface only upward crossings to avoid demoralising UX).
      const ack = readAck();
      const isUpward = cur && prev
        ? TIER_BANDS.findIndex(b => b.key === cur.key) > TIER_BANDS.findIndex(b => b.key === prev.key)
        : !!cur && !prev; // first-ever snapshot that lands above Observer counts as a crossing
      const alreadyAck = cur ? !!ack[cur.key] : false;
      setCrossed(!!cur && isUpward && !alreadyAck);
    } catch (e) {
      console.warn("[useTierFromImprint] load failed", e);
      setScore(null); setCurrentTier(null); setPreviousTier(null); setDelta(null); setCrossed(false);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  // Realtime: refresh when a new imprint_snapshot lands.
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`tier-imprint-${userId}-${instanceId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "imprint_snapshots", filter: `user_id=eq.${userId}` },
        () => void load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, instanceId, load]);

  const acknowledge = useCallback(() => {
    if (!currentTier) return;
    const ack = readAck();
    ack[currentTier.key] = Date.now();
    writeAck(ack);
    setCrossed(false);
  }, [currentTier]);

  return { loading, score, currentTier, previousTier, delta, crossed, acknowledge, refresh: load };
}

export default useTierFromImprint;