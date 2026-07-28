import { supabase } from "@/integrations/supabase/client";
import { bandFromScore, TIER_BANDS } from "@/hooks/useTierFromImprint";
import { countPosts, loadPostCounts, isPublishedPost } from "@/lib/postProvenance";

/**
 * widgetData — every number on the Widgets page and in the Home widget region
 * comes from here, and every count comes from an exact head count or from a
 * fully paged fetch. Never `array.length` of a limited fetch.
 */

export type WidgetKey =
  | "imprint" | "live_signals" | "overnight" | "language" | "rhythm" | "published";

export interface WidgetDef {
  key: WidgetKey;
  name: string;
  blurb: string;
  /** cyan = the machine did it; everything else stays neutral. */
  machine?: boolean;
}

export const WIDGET_DEFS: WidgetDef[] = [
  { key: "imprint",      name: "Imprint",          blurb: "Your score and tier, and the points to the next band." },
  { key: "live_signals", name: "Live signals",     blurb: "Active signals across everything you've captured." },
  { key: "overnight",    name: "The Overnight",    blurb: "When Aura last ran, and how many recent nights produced something.", machine: true },
  { key: "language",     name: "Language balance", blurb: "Arabic and English across your published posts." },
  { key: "rhythm",       name: "Capture rhythm",   blurb: "Consecutive weeks with at least one capture." },
  { key: "published",    name: "Published",        blurb: "Live on LinkedIn, and published through Aura." },
];

export type WidgetLayout = Record<string, boolean>;

export const DEFAULT_LAYOUT: WidgetLayout = {
  imprint: true, live_signals: true, overnight: true,
  language: false, rhythm: false, published: true,
};

export function normaliseLayout(raw: unknown): WidgetLayout {
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
  imprint: { score: number; tier: string; toNext: number | null; nextTier: string | null } | null;
  liveSignals: number | null;
  overnight: { lastRunAt: string | null; nights: number; window: number } | null;
  language: { arabic: number; english: number; total: number } | null;
  rhythm: { weeks: number } | null;
  published: { live: number; throughAura: number } | null;
}

const ARABIC = /[\u0600-\u06FF]/;

function weekKey(iso: string): string {
  const d = new Date(iso);
  const off = (d.getDay() + 6) % 7;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - off);
  return monday.toISOString().slice(0, 10);
}

function currentWeekKey(): string { return weekKey(new Date().toISOString()); }

/** Consecutive weeks with >= 1 capture, counted back from this week (or last week). */
export function streakFromWeeks(keys: Set<string>): number {
  const step = (k: string, back: number) => {
    const d = new Date(`${k}T00:00:00`);
    d.setDate(d.getDate() - 7 * back);
    return d.toISOString().slice(0, 10);
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
  const [snap, signalCount, findingLast, findingRecent, postRows, entryRows] = await Promise.all([
    supabase.from("imprint_snapshots").select("imprint, tier")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("strategic_signals").select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("status", "active"),
    supabase.from("agent_findings").select("created_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
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
    const firstSeen = new Date(lastRunAt).getTime();
    const daysKnown = Math.min(7, Math.max(1, Math.ceil((Date.now() - firstSeen) / 86400000) || 1));
    overnight = { lastRunAt, nights, window: Math.max(nights, daysKnown) };
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
