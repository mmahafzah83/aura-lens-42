import { supabase } from "@/integrations/supabase/client";
import { loadPostCounts, isPublishedPost } from "@/lib/postProvenance";

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

/** A signal fades 30 days after its newest evidence (signal-decay-engine:
 *  half-life 30 days, fresh threshold 0.5 → momentum drops below fresh at +30d). */
const FADE_DAYS = 30;

export async function loadWidgetMetrics(userId: string): Promise<WidgetMetrics> {
  const [postRows, entryRows, signalRows, draftRows] = await Promise.all([
    pagedSelect("linkedin_posts", "source_type, tracking_status, post_text, published_at, created_at, source_metadata", userId),
    pagedSelect("entries", "created_at", userId),
    pagedSelect("strategic_signals", "id, last_evidence_at", userId, (q: any) => q.eq("status", "active")),
    pagedSelect("linkedin_posts", "created_at", userId, (q: any) => q.eq("tracking_status", "draft")),
  ]);

  // Language balance — over published posts that actually carry text
  const published = postRows.filter(isPublishedPost);
  const withText = published.filter(p => (p.post_text || "").trim().length > 0);
  const arabic = withText.filter(p => ARABIC.test(p.post_text)).length;
  const language = withText.length > 0
    ? { arabic, english: withText.length - arabic, total: withText.length }
    : null;

  const weeks = new Set(entryRows.map(r => weekKey(r.created_at)));

  // Fading signals — expiry clock, and only signals nothing was written against.
  // A post links to a signal through source_metadata.signal_ids, never source_type.
  const linked = new Set<string>();
  for (const p of postRows) {
    const ids = (p.source_metadata as any)?.signal_ids;
    if (Array.isArray(ids)) for (const id of ids) linked.add(String(id));
  }
  const now = Date.now();
  const fadeInDays: number[] = [];
  for (const s of signalRows) {
    if (!s.last_evidence_at || linked.has(String(s.id))) continue;
    const d = Math.ceil(
      (new Date(s.last_evidence_at).getTime() + FADE_DAYS * 86400000 - now) / 86400000,
    );
    if (d >= 0 && d <= 30) fadeInDays.push(d);
  }
  const fading = { count: fadeInDays.length, nearestDays: fadeInDays.length ? Math.min(...fadeInDays) : null };

  // Drafts waiting
  const oldest = draftRows.reduce<number | null>((acc, r) => {
    const age = Math.floor((now - new Date(r.created_at).getTime()) / 86400000);
    return acc == null || age > acc ? age : acc;
  }, null);
  const drafts = { count: draftRows.length, oldestDays: oldest };

  return {
    language,
    rhythm: { weeks: streakFromWeeks(weeks) },
    fading,
    drafts,
  };
}

export { loadPostCounts };
