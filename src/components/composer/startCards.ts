import { supabase } from "@/integrations/supabase/client";

/**
 * ZONE 1 — START.
 *
 * Ranks up to five honest starting points out of signals the user already has.
 * Every number here comes from a row that exists. Nothing is invented, nothing
 * is padded: if a category has no qualifying row we simply do not emit a card.
 *
 * A post links to a signal through `linkedin_posts.source_metadata->'signal_ids'`.
 * (`source_type='signal'` is NOT a value that exists in this database.)
 *
 * ORDER — one preference, one default. "recommended" is the composite rule that
 * has always been here; the other three are single-column orders the member can
 * ask for. An unknown or missing preference is always "recommended".
 */

export type StartCardKind = "new_evidence" | "accelerating" | "never_written" | "steady";

export type StartSort = "recommended" | "newest" | "most_evidence" | "never_written";

export const START_SORTS: readonly StartSort[] = [
  "recommended",
  "newest",
  "most_evidence",
  "never_written",
] as const;

export const DEFAULT_START_SORT: StartSort = "recommended";

export function asStartSort(v: unknown): StartSort {
  return START_SORTS.includes(v as StartSort) ? (v as StartSort) : DEFAULT_START_SORT;
}

export interface StartCard {
  kind: StartCardKind;
  signalId: string;
  title: string;
  fragmentCount: number;
  /** Honest, human reason this signal is being suggested. */
  reason: string;
  insight: string;
  /** True only when evidence landed after the last post on this subject. */
  freshEvidence: boolean;
}

interface SignalRow {
  id: string;
  signal_title: string | null;
  fragment_count: number | null;
  unique_orgs: number | null;
  strength_score: number | null;
  velocity_status: string | null;
  last_evidence_at: string | null;
  status: string | null;
  explanation: string | null;
  what_it_means_for_you: string | null;
}

/** How many ranked starting points the composer shows. Ranking is untouched. */
const LIMIT = 5;

const byStrength = (a: SignalRow, b: SignalRow) =>
  (b.strength_score ?? 0) - (a.strength_score ?? 0);

const time = (v: string | null) => (v ? new Date(v).getTime() : 0);

function insightOf(s: SignalRow) {
  return (s.what_it_means_for_you || s.explanation || "").trim();
}

export interface StartZoneData {
  cards: StartCard[];
  /**
   * Total active signals the user owns — 0 means "go capture something",
   * -1 means "we could not look" (the query itself failed).
   */
  totalSignals: number;
}

export async function loadStartCards(
  userId: string,
  sort: StartSort = DEFAULT_START_SORT,
): Promise<StartZoneData> {
  const [{ data: sigData, error: sigError }, { data: postData, error: postError }] = await Promise.all([
    supabase
      .from("strategic_signals")
      .select(
        "id, signal_title, fragment_count, unique_orgs, strength_score, velocity_status, last_evidence_at, status, explanation, what_it_means_for_you"
      )
      .eq("user_id", userId)
      .eq("status", "active"),
    supabase
      .from("linkedin_posts")
      .select("created_at, source_metadata")
      .eq("user_id", userId),
  ]);

  // A failed look is not an empty shelf. Say so, so the screen can tell them apart.
  if (sigError) {
    console.error("start cards: signals unreadable", sigError);
    return { cards: [], totalSignals: -1 };
  }
  if (postError) console.error("start cards: posts unreadable", postError);

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

  const isFresh = (s: SignalRow) => {
    const lastPost = lastPostFor.get(s.id);
    if (!lastPost || !s.last_evidence_at) return false;
    return new Date(s.last_evidence_at) > new Date(lastPost);
  };

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
      freshEvidence: isFresh(s),
    });
  };

  const newEvidence = signals.filter(isFresh).sort(byStrength);
  const accelerating = signals.filter((s) => s.velocity_status === "accelerating").sort(byStrength);
  const neverWritten = signals.filter((s) => !lastPostFor.has(s.id)).sort(byStrength);

  /* ---------- the three single-column orders --------------------------- */
  if (sort !== "recommended") {
    const ordered = [...signals];
    if (sort === "newest") {
      ordered.sort((a, b) => time(b.last_evidence_at) - time(a.last_evidence_at) || byStrength(a, b));
    } else if (sort === "most_evidence") {
      ordered.sort(
        (a, b) =>
          (b.fragment_count ?? 0) - (a.fragment_count ?? 0) ||
          (b.unique_orgs ?? 0) - (a.unique_orgs ?? 0) ||
          byStrength(a, b),
      );
    } else {
      ordered.sort((a, b) => {
        const an = lastPostFor.has(a.id) ? 1 : 0;
        const bn = lastPostFor.has(b.id) ? 1 : 0;
        return an - bn || byStrength(a, b);
      });
    }

    // The line under each title still says only what is true of that row.
    for (const s of ordered.slice(0, LIMIT)) {
      const n = s.fragment_count ?? 0;
      if (!lastPostFor.has(s.id)) {
        push(s, "never_written", `Not written about yet — ${n} sources behind it.`);
      } else if (isFresh(s)) {
        push(s, "new_evidence", `${n} sources now sit behind this — some of them landed after your last post on it.`);
      } else if (s.velocity_status === "accelerating") {
        push(s, "accelerating", `Picking up speed — ${n} sources and still climbing.`);
      } else {
        push(s, "steady", `Steady — ${n} sources behind it.`);
      }
    }
    return { cards, totalSignals: signals.length };
  }

  /* ---------- recommended: the composite rule, unchanged --------------- */

  // 1 — New evidence since you wrote.
  if (newEvidence[0]) {
    const s = newEvidence[0];
    push(
      s,
      "new_evidence",
      `${s.fragment_count ?? 0} sources now sit behind this — some of them landed after your last post on it.`
    );
  }

  // 2 — Accelerating this week.
  const acceleratingLeft = accelerating.filter((s) => !used.has(s.id));
  if (acceleratingLeft[0]) {
    const s = acceleratingLeft[0];
    push(s, "accelerating", `Picking up speed — ${s.fragment_count ?? 0} sources and still climbing.`);
  }

  // 3 — Never written about.
  const neverWrittenLeft = neverWritten.filter((s) => !used.has(s.id));
  if (neverWrittenLeft[0]) {
    const s = neverWrittenLeft[0];
    push(s, "never_written", `Your strongest signal you have never posted about — ${s.fragment_count ?? 0} sources.`);
  }

  // Degrade honestly: if fewer than LIMIT qualified, backfill only from the
  // next-best genuinely-qualifying rows of the remaining categories. Never pad.
  if (cards.length < LIMIT) {
    for (const s of neverWritten) {
      if (cards.length >= LIMIT) break;
      if (used.has(s.id)) continue;
      push(s, "never_written", `Not written about yet — ${s.fragment_count ?? 0} sources behind it.`);
    }
  }
  if (cards.length < LIMIT) {
    for (const s of accelerating) {
      if (cards.length >= LIMIT) break;
      if (used.has(s.id)) continue;
      push(s, "accelerating", `Picking up speed — ${s.fragment_count ?? 0} sources and still climbing.`);
    }
  }

  return { cards: cards.slice(0, LIMIT), totalSignals: signals.length };
}
