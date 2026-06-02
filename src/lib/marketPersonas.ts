// Shared Market Mirror persona logic.
// Lifted from MarketMirror.tsx (W2-G-1) so the report builder and the
// component agree on slot→label mapping without a third copy.

export type RankBucket = "c_suite" | "partner" | "director";

export interface PersonaLabelSet {
  slot1: string; slot2: string; slot3: string;
  gap1: string; gap2: string; gap3: string;
}

// Positional slot keys (slot1/slot2/slot3) map to existing columns —
// only the visible labels change per rank. Must match the EF.
export const PERSONA_LABELS: Record<RankBucket, PersonaLabelSet> = {
  c_suite: {
    slot1: "Board member", slot2: "Peer CEO", slot3: "Industry analyst",
    gap1: "board member", gap2: "peer CEO", gap3: "industry analyst",
  },
  partner: {
    slot1: "Prospective client", slot2: "Practice leadership", slot3: "Top talent recruit",
    gap1: "prospective client", gap2: "practice leader", gap3: "top recruit",
  },
  director: {
    slot1: "Headhunter", slot2: "Client CIO", slot3: "Conference curator",
    gap1: "headhunter", gap2: "CIO", gap3: "curator",
  },
};

// KEEP IN SYNC with supabase/functions/generate-market-mirror/index.ts persona regex.
export function rankFromLevel(level: string | null | undefined): RankBucket {
  const l = (level || "").toLowerCase();
  if (/chief|c-suite|c-level|ceo|cfo|cio|cto|cdo|cmo|coo|chro|\b(vp|svp|evp)\b|vice[\s-]?president|\bhead of\b|advisor|board member|chairman/.test(l)) return "c_suite";
  if (/\bpartner\b|managing director|associate partner/.test(l)) return "partner";
  return "director";
}