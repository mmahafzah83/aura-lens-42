import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { countPosts } from "@/lib/postProvenance";

/**
 * Since-your-last-visit — one baseline, one moment in time.
 *
 * Baseline is diagnostic_profiles.last_visit_at (already existed; previously
 * unwired). It is read into state FIRST, then bumped to now() only when it is
 * older than 30 minutes, so a refresh inside the same sitting does not wipe
 * the window. Every row below filters on that single loaded value, so a delta
 * can never be measured against a different window than its total.
 */

const SESSION_GUARD_MS = 30 * 60_000;
const THEME_DELTA_CEILING = 8;
const SOURCE_DELTA_CEILING = 15;

export interface SinceRowAction {
  kind: "start_post" | "tab";
  tab?: string;
  post?: { topic: string; context: string; signalId: string; signalTitle: string };
}

export interface SinceRow {
  key: string;
  text: string;
  actionLabel: string;
  action: SinceRowAction;
}

export interface SinceLastVisit {
  /** ISO baseline, or null on a first visit (UI omits the whole section). */
  baseline: string | null;
  /** Pre-formatted, browser-timezone label for the header. Null when no baseline. */
  timestampLabel: string | null;
  rows: SinceRow[];
  loading: boolean;
}

const clock = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

export function formatVisitLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toDateString() === d.toDateString();
  if (sameDay) return `earlier today, ${clock(d)}`;
  if (yesterday) return `yesterday, ${clock(d)}`;
  return `${d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}, ${clock(d)}`;
}

/** delta must be within [0, total]; otherwise callers fall back to total-only copy. */
function deltaIsSane(delta: number, total: number, where: string): boolean {
  if (delta < 0 || delta > total) {
    console.warn(`[since-last-visit] implausible delta ${delta} vs total ${total} (${where}) — using total-only copy`);
    return false;
  }
  return true;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function useSinceLastVisit(userId: string | null | undefined): SinceLastVisit {
  const [state, setState] = useState<SinceLastVisit>({
    baseline: null, timestampLabel: null, rows: [], loading: true,
  });

  const load = useCallback(async () => {
    if (!userId) return;

    // 1 — read the stored baseline first, then bump it behind the session guard.
    const { data: profile } = await supabase
      .from("diagnostic_profiles").select("last_visit_at").eq("user_id", userId).maybeSingle();

    const baseline: string | null = (profile as any)?.last_visit_at ?? null;

    if (baseline && Date.now() - new Date(baseline).getTime() > SESSION_GUARD_MS) {
      void supabase.from("diagnostic_profiles")
        .update({ last_visit_at: new Date().toISOString() }).eq("user_id", userId);
    }

    // First visit — nothing to compare against.
    if (!baseline) {
      setState({ baseline: null, timestampLabel: null, rows: [], loading: false });
      return;
    }

    const [sigRes, newSigRes, pubRes] = await Promise.all([
      (supabase.from("strategic_signals" as any) as any)
        .select("id, signal_title, velocity_status, fragment_count, supporting_evidence_ids, strategic_implications, explanation, created_at, updated_at")
        .eq("user_id", userId).eq("status", "active").limit(500),
      (supabase.from("strategic_signals" as any) as any)
        .select("id, velocity_status")
        .eq("user_id", userId).eq("status", "active").gte("created_at", baseline),
      (supabase.from("linkedin_posts" as any) as any)
        .select("source_type, tracking_status, published_at, created_at")
        .eq("user_id", userId).gte("created_at", baseline),
    ]);

    const sigs: any[] = (sigRes.data as any[]) || [];

    // Per-theme delta: only the supporting fragments of THAT theme, created
    // since the same baseline. Total is that theme's own fragment count, so
    // delta and total are always two reads of one population.
    const allIds = Array.from(new Set(sigs.flatMap((s) => (s.supporting_evidence_ids as string[]) || [])));
    const freshIds = new Set<string>();
    for (let i = 0; i < allIds.length; i += 300) {
      const slice = allIds.slice(i, i + 300);
      const { data } = await (supabase.from("evidence_fragments" as any) as any)
        .select("id").eq("user_id", userId).gte("created_at", baseline).in("id", slice);
      for (const r of ((data as any[]) || [])) freshIds.add(r.id);
    }

    const themed = sigs.map((s) => {
      const ids: string[] = (s.supporting_evidence_ids as string[]) || [];
      const total = ids.length || (s.fragment_count ?? 0);
      const delta = ids.filter((id) => freshIds.has(id)).length;
      return { s, total, delta, sane: deltaIsSane(delta, total, `signal ${s.id}`) };
    });

    const rows: SinceRow[] = [];

    const postRow = (t: (typeof themed)[number], key: string): SinceRow => {
      const title = t.s.signal_title;
      let text: string;
      if (!t.sane || t.delta === 0) {
        text = `${t.total} ${plural(t.total, "source", "sources")} now back ${title}.`;
      } else if (t.delta > SOURCE_DELTA_CEILING) {
        text = `${title} kept growing — ${t.total} ${plural(t.total, "source", "sources")} now back this theme.`;
      } else {
        text = `You captured ${t.delta} more ${plural(t.delta, "source", "sources")} about ${title} — ${t.total} now back this theme.`;
      }
      return {
        key, text,
        actionLabel: "Worth a post — start one",
        action: {
          kind: "start_post",
          post: {
            topic: title,
            context: t.s.strategic_implications || t.s.explanation || "",
            signalId: t.s.id,
            signalTitle: title,
          },
        },
      };
    };

    // a) a theme that crossed a post-worthy threshold since baseline
    const crossed = themed
      .filter((t) => t.sane && t.delta > 0 && t.total >= 3 && t.total - t.delta < 3)
      .sort((a, b) => b.total - a.total)[0];
    if (crossed) rows.push(postRow(crossed, "crossed"));

    // b) the strongest single change
    const strongest = themed
      .filter((t) => t.delta > 0 && t.s.id !== crossed?.s.id)
      .sort((a, b) => b.delta - a.delta)[0];
    if (strongest) rows.push(postRow(strongest, "strongest"));

    // New themes — aggregate above the believability ceiling.
    const fresh: any[] = (newSigRes.data as any[]) || [];
    if (fresh.length > 0 && rows.length < 3) {
      const strengthening = fresh.filter((s) => (s.velocity_status || "").toLowerCase() === "accelerating").length;
      rows.push({
        key: "themes",
        text: fresh.length > THEME_DELTA_CEILING
          ? `Your reading opened new themes — ${strengthening} ${plural(strengthening, "is", "are")} already strengthening.`
          : `Your reading opened ${fresh.length} new ${plural(fresh.length, "theme", "themes")} Aura now tracks for you.`,
        actionLabel: "See what's new",
        action: { kind: "tab", tab: "intelligence" },
      });
    }

    // c) the user's own actions
    const publishedSince = countPosts(((pubRes.data as any[]) || []), baseline).live;
    if (publishedSince > 0 && rows.length < 3) {
      rows.push({
        key: "published",
        text: `You published ${publishedSince} ${plural(publishedSince, "post", "posts")} on LinkedIn since then.`,
        actionLabel: "See how they are doing",
        action: { kind: "tab", tab: "influence" },
      });
    }

    setState({
      baseline,
      timestampLabel: formatVisitLabel(baseline),
      rows: rows.slice(0, 3),
      loading: false,
    });
  }, [userId]);

  useEffect(() => { void load().catch(() => setState((s) => ({ ...s, loading: false }))); }, [load]);

  return state;
}
