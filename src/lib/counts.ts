import { supabase } from "@/integrations/supabase/client";
import { countPosts, type PostCountRow } from "@/lib/postProvenance";
import { loadStudioDrafts } from "@/components/studio/draftsSource";

/**
 * ONE FUNCTION, ONE DEFINITION, ONE NUMBER.
 *
 * U1 — the library page said "223 you saved" while the Desk said 174 + 20.
 * The 223 came from the library adding the `documents` table into the same
 * bucket as `entries` (194 entries + 49 documents − 20 agent rows = 223), a
 * definition no other surface used. Two numbers for one thing means the member
 * cannot trust either.
 *
 * From here on, every surface that shows a capture count calls this module.
 * Documents are a real thing and are still counted — as DOCUMENTS, on their own
 * line, never folded into "you saved".
 *
 * The mirror for the Desk's server side lives at
 * `supabase/functions/_shared/counts.ts`. The two files must agree; the SQL
 * they express is written out in both.
 */

/* ── CAPTURES ─────────────────────────────────────────────────────────────
 * user_captures  = entries where source_type is null or <> 'aura_agent'
 * agent_captures = entries where source_type = 'aura_agent'
 * total          = every entries row
 * Documents are NOT entries and are never added into any of the three.
 */

export interface CaptureCounts {
  user_captures: number;
  agent_captures: number;
  total: number;
}

export const EMPTY_CAPTURE_COUNTS: CaptureCounts = {
  user_captures: 0,
  agent_captures: 0,
  total: 0,
};

export type CaptureRowLike = { source_type?: string | null };

/** The definition, applied to rows a surface already holds. */
export function isAgentCapture(row: CaptureRowLike | null | undefined): boolean {
  return (row?.source_type ?? null) === "aura_agent";
}

/** The definition, applied to a list a surface already holds. */
export function captureCountsFromRows(rows: CaptureRowLike[] | null | undefined): CaptureCounts {
  const list = rows ?? [];
  const agent_captures = list.filter(isAgentCapture).length;
  return {
    user_captures: list.length - agent_captures,
    agent_captures,
    total: list.length,
  };
}

/** The definition, read from the database. RLS scopes the rows to the member. */
export async function fetchCaptureCounts(userId?: string | null): Promise<CaptureCounts> {
  const scope = <Q extends { eq: (c: string, v: string) => Q }>(q: Q): Q =>
    userId ? q.eq("user_id", userId) : q;

  const [totalRes, agentRes] = await Promise.all([
    scope(supabase.from("entries").select("id", { count: "exact", head: true }) as any),
    scope(
      supabase
        .from("entries")
        .select("id", { count: "exact", head: true })
        .eq("source_type", "aura_agent") as any,
    ),
  ]);

  const total = (totalRes as any)?.count ?? 0;
  const agent_captures = (agentRes as any)?.count ?? 0;
  return { total, agent_captures, user_captures: Math.max(0, total - agent_captures) };
}

/** Documents, deduped by filename exactly as the library list dedupes them. */
export function documentCountFromRows(rows: { id: string; filename?: string | null }[] | null | undefined): number {
  const seen = new Set<string>();
  for (const d of rows ?? []) seen.add(d.filename ?? `__id__:${d.id}`);
  return seen.size;
}

export async function fetchDocumentCount(userId?: string | null): Promise<number> {
  let q = supabase.from("documents").select("id, filename");
  if (userId) q = q.eq("user_id", userId) as any;
  const { data } = await q;
  return documentCountFromRows((data as any[]) || []);
}

/* ── PUBLISHED ────────────────────────────────────────────────────────────
 * Delegated whole to src/lib/postProvenance.ts, which already owns the
 * definition (live on LinkedIn vs made with Aura). No second rule here.
 */

export interface PublishedCounts {
  live: number;
  throughAura: number;
  imported: number;
}

export async function fetchPublishedCounts(userId?: string | null): Promise<PublishedCounts> {
  let q = supabase
    .from("linkedin_posts")
    .select("source_type, tracking_status, published_at, created_at");
  if (userId) q = q.eq("user_id", userId) as any;
  const { data } = await q;
  return countPosts(((data as any[]) || []) as PostCountRow[]);
}

/* ── DRAFTS ───────────────────────────────────────────────────────────────
 * One definition already exists in draftsSource.loadStudioDrafts (content_items
 * + linkedin_posts, deduped, empty bodies dropped). Counting anything else —
 * for instance a bare `tracking_status = 'draft'` count — produces a number the
 * drafts list cannot reconcile against, so it is not done anywhere.
 */
export async function fetchDraftCount(): Promise<number> {
  const rows = await loadStudioDrafts();
  return rows.length;
}

/* ── SIGNALS ──────────────────────────────────────────────────────────────
 * "Signals" on any surface means ACTIVE signals. The all-status figure is a
 * different thing and is always labelled as such.
 */

export interface SignalCounts {
  active: number;
  all: number;
}

export async function fetchSignalCounts(userId?: string | null): Promise<SignalCounts> {
  const scope = <Q extends { eq: (c: string, v: string) => Q }>(q: Q): Q =>
    userId ? q.eq("user_id", userId) : q;
  const [allRes, activeRes] = await Promise.all([
    scope(supabase.from("strategic_signals").select("id", { count: "exact", head: true }) as any),
    scope(
      supabase
        .from("strategic_signals")
        .select("id", { count: "exact", head: true })
        .eq("status", "active") as any,
    ),
  ]);
  return { all: (allRes as any)?.count ?? 0, active: (activeRes as any)?.count ?? 0 };
}

/* ── SCORE ────────────────────────────────────────────────────────────────
 * The newest score_snapshots row, or null. Never a computed-on-the-fly figure:
 * two surfaces computing it independently is how they disagree.
 */
export async function fetchScore(userId?: string | null): Promise<number | null> {
  let q = supabase
    .from("score_snapshots")
    .select("score")
    .order("created_at", { ascending: false })
    .limit(1);
  if (userId) q = q.eq("user_id", userId) as any;
  const { data } = await q;
  const row = ((data as any[]) || [])[0];
  return row?.score ?? null;
}

/* ── EVERYTHING A SURFACE HEADER NEEDS, IN ONE READ ───────────────────── */

export interface SurfaceCounts {
  captures: CaptureCounts;
  documents: number;
  published: PublishedCounts;
  drafts: number;
  signals: SignalCounts;
  score: number | null;
}

export async function fetchSurfaceCounts(userId?: string | null): Promise<SurfaceCounts> {
  const [captures, documents, published, drafts, signals, score] = await Promise.all([
    fetchCaptureCounts(userId),
    fetchDocumentCount(userId),
    fetchPublishedCounts(userId),
    fetchDraftCount(),
    fetchSignalCounts(userId),
    fetchScore(userId),
  ]);
  return { captures, documents, published, drafts, signals, score };
}
