import { supabase } from "@/integrations/supabase/client";

/**
 * ZONE 1 — START.
 *
 * Ranks up to three honest starting points out of signals the user already has.
 * Every number here comes from a row that exists. Nothing is invented, nothing
 * is padded: if a category has no qualifying row we simply do not emit a card.
 *
 * A post links to a signal through `linkedin_posts.source_metadata->'signal_ids'`.
 * (`source_type='signal'` is NOT a value that exists in this database.)
 */

export type StartCardKind = "new_evidence" | "accelerating" | "never_written";

export interface StartCard {
  kind: StartCardKind;
  signalId: string;
  title: string;
  fragmentCount: number;
  /** Honest, human reason this signal is being suggested. */
  reason: string;
  insight: string;
}

interface SignalRow {
  id: string;
  signal_title: string | null;
  fragment_count: number | null;
  strength_score: number | null;
  velocity_status: string | null;
  last_evidence_at: string | null;
  status: string | null;
  explanation: string | null;
  what_it_means_for_you: string | null;
}

const byStrength = (a: SignalRow, b: SignalRow) =>
  (b.strength_score ?? 0) - (a.strength_score ?? 0);

function insightOf(s: SignalRow) {
  return (s.what_it_means_for_you || s.explanation || "").trim();
}

export interface StartZoneData {
  cards: StartCard[];
  /** Total active signals the user owns — 0 means "go capture something". */
  totalSignals: number;
}

export async function loadStartCards(userId: string): Promise<StartZoneData> {
  const [{ data: sigData }, { data: postData }] = await Promise.all([
    supabase
      .from("strategic_signals")
      .select(
        "id, signal_title, fragment_count, strength_score, velocity_status, last_evidence_at, status, explanation, what_it_means_for_you"
      )
      .eq("user_id", userId)
      .eq("status", "active"),
    supabase
      .from("linkedin_posts")
      .select("created_at, source_metadata")
      .eq("user_id", userId),
  ]);

  const signals = ((sigData as SignalRow[] | null) ?? []).filter((s) => !!s.signal_title);
  if (signals.length === 0) return { cards: [], totalSignals: 0 };

  /** signal_id -> most recent post that referenced it */
  const lastPostFor = new Map<string, string>();
  for (const p of (postData as any[] | null) ?? []) {
    const ids = p?.source_metadata?.signal_ids;
    if (!Array.isArray(ids)) continue;
    for (const raw of ids) {
      const id = String(raw);
      const prev = lastPostFor.get(id);
      if (!prev || new Date(p.created_at) > new Date(prev)) lastPostFor.set(id, p.created_at);
    }
  }

  const used = new Set<string>();
  const cards: StartCard[] = [];

  const push = (s: SignalRow, kind: StartCardKind, reason: string) => {
    used.add(s.id);
    cards.push({
      kind,
      signalId: s.id,
      title: s.signal_title as string,
      fragmentCount: s.fragment_count ?? 0,
      reason,
      insight: insightOf(s),
    });
  };

  // 1 — New evidence since you wrote.
  // Requires last_evidence_at to be non-null AND newer than the post that used it.
  const newEvidence = signals
    .filter((s) => {
      const lastPost = lastPostFor.get(s.id);
      if (!lastPost || !s.last_evidence_at) return false;
      return new Date(s.last_evidence_at) > new Date(lastPost);
    })
    .sort(byStrength);
  if (newEvidence[0]) {
    const s = newEvidence[0];
    push(
      s,
      "new_evidence",
      `${s.fragment_count ?? 0} sources now sit behind this — some of them landed after your last post on it.`
    );
  }

  // 2 — Accelerating this week.
  const accelerating = signals
    .filter((s) => s.velocity_status === "accelerating" && !used.has(s.id))
    .sort(byStrength);
  if (accelerating[0]) {
    const s = accelerating[0];
    push(s, "accelerating", `Picking up speed — ${s.fragment_count ?? 0} sources and still climbing.`);
  }

  // 3 — Never written about.
  const neverWritten = signals
    .filter((s) => !lastPostFor.has(s.id) && !used.has(s.id))
    .sort(byStrength);
  if (neverWritten[0]) {
    const s = neverWritten[0];
    push(s, "never_written", `Your strongest signal you have never posted about — ${s.fragment_count ?? 0} sources.`);
  }

  // Degrade honestly: if fewer than three qualified, backfill only from the
  // next-best genuinely-qualifying rows of the remaining categories. Never pad.
  if (cards.length < 3) {
    for (const s of neverWritten) {
      if (cards.length >= 3) break;
      if (used.has(s.id)) continue;
      push(s, "never_written", `Not written about yet — ${s.fragment_count ?? 0} sources behind it.`);
    }
  }
  if (cards.length < 3) {
    for (const s of accelerating) {
      if (cards.length >= 3) break;
      if (used.has(s.id)) continue;
      push(s, "accelerating", `Picking up speed — ${s.fragment_count ?? 0} sources and still climbing.`);
    }
  }

  return { cards: cards.slice(0, 3), totalSignals: signals.length };
}