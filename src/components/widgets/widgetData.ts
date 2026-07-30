import { supabase } from "@/integrations/supabase/client";
import { bandFromScore, TIER_BANDS } from "@/hooks/useTierFromImprint";
import { countPosts, loadPostCounts, isPublishedPost } from "@/lib/postProvenance";

/**
 * widgetData — every number on the Widgets page and in the Home widget region
 * comes from here, and every count comes from an exact head count or from a
 * fully paged fetch. Never `array.length` of a limited fetch.
 */

export type WidgetKey = "language" | "rhythm" | "fading" | "drafts";

export interface WidgetDef {
  key: WidgetKey;
  name: string;
  blurb: string;
  /** cyan = the machine did it; everything else stays neutral. */
  machine?: boolean;
}

export const WIDGET_DEFS: WidgetDef[] = [
  { key: "language",     name: "Language balance", blurb: "Arabic and English across your published posts." },
  { key: "rhythm",       name: "Capture rhythm",   blurb: "Consecutive weeks with at least one capture." },
  { key: "fading",       name: "Fading signals",   blurb: "Live signals about to fade with nothing published against them." },
  { key: "drafts",       name: "Drafts waiting",   blurb: "Drafts you started and have not published yet." },
];

export type WidgetLayout = Record<string, boolean>;

export const DEFAULT_LAYOUT: WidgetLayout = {
  language: false, rhythm: true, fading: true, drafts: true,
};

export function normaliseLayout(raw: unknown): WidgetLayout {
  // Retired widgets (imprint, live_signals, overnight, published) are simply
  // not in WIDGET_DEFS any more, so a saved layout containing them drops them
  // silently here — no error, no empty tile.
  const out: WidgetLayout = { ...DEFAULT_LAYOUT };
  if (raw && typeof raw === "object") {
    for (const d of WIDGET_DEFS) {
      const v = (raw as Record<string, unknown>)[d.key];
      if (typeof v === "boolean") out[d.key] = v;
    }
  }
  return out;
}

export async function loadLayout(userId: string): Promise<WidgetLayout> {
  const { data } = await supabase
    .from("user_widget_layout").select("layout").eq("user_id", userId).maybeSingle();
  if (!data) return { ...DEFAULT_LAYOUT };
  return normaliseLayout((data as { layout: unknown }).layout);
}

export async function saveLayout(userId: string, layout: WidgetLayout) {
  return supabase.from("user_widget_layout")
    .upsert({ user_id: userId, layout: layout as any, updated_at: new Date().toISOString() },
            { onConflict: "user_id" });
}

// ── metrics ────────────────────────────────────────────────────────────────

export interface WidgetMetrics {
  language: { arabic: number; english: number; total: number } | null;
  rhythm: { weeks: number } | null;
  fading: { count: number; nearestDays: number | null } | null;
  drafts: { count: number; oldestDays: number | null } | null;
}

const ARABIC = /[\u0600-\u06FF]/;

/**
 * Week key = the local Monday that starts the calendar week containing `d`
 * (weeks run Monday→Sunday). Formatted from local Y-M-D parts: using
 * toISOString() here shifted every key back a day in positive-offset zones,
 * which is what made the streak read 0.
 */
function localDayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function weekKey(iso: string): string {
  const d = new Date(iso);
  const off = (d.getDay() + 6) % 7; // 0 = Monday
  return localDayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - off));
}

function currentWeekKey(): string { return weekKey(new Date().toISOString()); }

/** Consecutive weeks with >= 1 capture, counted back from this week (or last week). */
export function streakFromWeeks(keys: Set<string>): number {
  const step = (k: string, back: number) => {
    const [y, m, day] = k.split("-").map(Number);
    const d = new Date(y, m - 1, day - 7 * back);
    return localDayKey(d);
  };
  const now = currentWeekKey();
  let start = now;
  if (!keys.has(now)) {
    const prev = step(now, 1);
    if (!keys.has(prev)) return 0;
    start = prev;
  }
  let n = 0;
  for (let i = 0; ; i++) {
    if (!keys.has(step(start, i))) break;
    n++;
  }
  return n;
}

async function pagedSelect(table: string, cols: string, userId: string, extra?: (q: any) => any) {
  const rows: any[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let q: any = supabase.from(table as any).select(cols).eq("user_id", userId);
    if (extra) q = extra(q);
    const { data } = await q.range(from, from + PAGE - 1);
    const batch = (data || []) as any[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

export async function loadWidgetMetrics(userId: string): Promise<WidgetMetrics> {
  const [snap, signalCount, findingLast, findingFirst, findingRecent, postRows, entryRows] = await Promise.all([
    supabase.from("imprint_snapshots").select("imprint, tier")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("strategic_signals").select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("status", "active"),
    supabase.from("agent_findings").select("created_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("agent_findings").select("created_at")
      .eq("user_id", userId).order("created_at", { ascending: true }).limit(1).maybeSingle(),
    supabase.from("agent_findings").select("created_at")
      .eq("user_id", userId)
      .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString()),
    pagedSelect("linkedin_posts", "source_type, tracking_status, post_text, published_at, created_at", userId),
    pagedSelect("entries", "created_at", userId),
  ]);

  // Imprint
  let imprint: WidgetMetrics["imprint"] = null;
  const score = (snap.data as any)?.imprint as number | null | undefined;
  if (score != null) {
    const band = bandFromScore(score);
    const idx = band ? TIER_BANDS.findIndex(b => b.key === band.key) : -1;
    const next = idx >= 0 && idx < TIER_BANDS.length - 1 ? TIER_BANDS[idx + 1] : null;
    imprint = {
      score: Math.round(score),
      tier: band?.name ?? ((snap.data as any)?.tier ?? "—"),
      toNext: next ? Math.max(0, next.min - Math.round(score)) : null,
      nextTier: next?.name ?? null,
    };
  }

  // Overnight — real window, never padded to seven
  const lastRunAt = (findingLast.data as any)?.created_at ?? null;
  let overnight: WidgetMetrics["overnight"] = null;
  if (lastRunAt) {
    const nights = new Set(
      ((findingRecent.data || []) as Array<{ created_at: string }>)
        .map(r => r.created_at.slice(0, 10)),
    ).size;
    const firstAt = (findingFirst.data as any)?.created_at ?? lastRunAt;
    const daysKnown = Math.ceil((Date.now() - new Date(firstAt).getTime()) / 86400000);
    overnight = { lastRunAt, nights, window: Math.max(nights, Math.min(7, Math.max(1, daysKnown))) };
  }

  // Language balance — over published posts that actually carry text
  const published = postRows.filter(isPublishedPost);
  const withText = published.filter(p => (p.post_text || "").trim().length > 0);
  const arabic = withText.filter(p => ARABIC.test(p.post_text)).length;
  const language = withText.length > 0
    ? { arabic, english: withText.length - arabic, total: withText.length }
    : null;

  const counts = countPosts(postRows);
  const weeks = new Set(entryRows.map(r => weekKey(r.created_at)));

  return {
    imprint,
    liveSignals: signalCount.count ?? null,
    overnight,
    language,
    rhythm: { weeks: streakFromWeeks(weeks) },
    published: { live: counts.live, throughAura: counts.throughAura },
  };
}

export { loadPostCounts };
