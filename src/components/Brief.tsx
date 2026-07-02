import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import useTierFromImprint, { TIER_BANDS } from "@/hooks/useTierFromImprint";
import TierExplainer from "@/components/ui/TierExplainer";
import InfoTooltip from "@/components/ui/InfoTooltip";
import { FORCES, HEADERS } from "@/constants/language";

/**
 * Brief — Editorial Broadsheet (System-A tokens).
 * Surface rebuild atop the existing data architecture. All loaders, the
 * publishedSignalsRef gate, capture-complete listener, and brief-live-${uid}
 * realtime channel are preserved. Tier ONLY from useTierFromImprint.
 */

export interface BriefDraft {
  id: string;
  body: string;
  language: "en" | "ar";
  type: "carousel" | "framework" | "linkedin_post";
  topic?: string | null;
  _source?: "content_items" | "linkedin_posts";
}

interface BriefProps {
  onOpenDraft: (draft: BriefDraft) => void;
  onSwitchTab?: (tab: string) => void;
  onOpenCapture?: () => void;
}

type SectionState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; message: string };

interface ImprintData {
  imprint: number | null;
  delta: number | null;
  signalScore: number | null;
  contentScore: number | null;
  captureScore: number | null;
  spark: number[];
}

interface AwaySignalRow {
  id: string;
  title: string;
  confidence: number | null;
  what: string | null;
  velocity: string | null;
  lifecycle: string | null;
  lastEvidenceAt: string | null;
  createdAt: string | null;
  strength: number | null;
  themes: string[];
  explanation: string | null;
}

interface AwayData {
  signals: AwaySignalRow[];
  territory: AwaySignalRow[];
  signalCount: number;
  newCaptureCount: number;
  mode: "away" | "radar";
}

interface DraftData {
  draft: BriefDraft | null;
  preview: string;
  voiceScore: number | null;
  signalCount: number | null;
}

interface DiscernmentData {
  value: number | null;
  postsWithSignal: number | null;
  published120d: number | null;
}

interface ProofData {
  entriesTotal: number;
  fragments: number;
  institutions: number;
  dayN: number | null;
  annualImpressions: number;
  annualReach: number;
}

interface RhythmData {
  days: Array<{ label: string; count: number; isToday: boolean }>;
  totalDays: number; // days with at least one capture
  streak: number;
  totalCaptures: number;
}

interface PublishedRecent {
  publishedAt: string | null;
  topic: string | null;
}

const LAST_VISIT_KEY = "aura-brief-last-visit";

function startOfThisWeekIso(): string {
  const now = new Date();
  const day = now.getUTCDay();
  const offset = (day + 6) % 7;
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - offset));
  return monday.toISOString();
}

function greeting(now: Date): string {
  const h = now.getHours();
  if (h >= 22 || h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function isoWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function cleanBody(raw: string): string {
  return (raw || "")
    .replace(/^[ \t]*(post|بوست|منشور\s+linkedin)[ \t]*$/gim, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/(^|[\s(])\*(?!\s)([^*\n]+?)\*(?=[\s.,;:!?)]|$)/g, "$1$2")
    .replace(/\*\*/g, "")
    .replace(/^\s*\n+/, "");
}

function derivePreview(body: string): string {
  const s = cleanBody(body).replace(/\s+/g, " ").trim();
  if (!s) return "";
  return s.length > 180 ? s.slice(0, 178).trim() + "\u2026" : s;
}

function deriveHook(body: string): string {
  const first = cleanBody(body).split(/\r?\n/).find((l) => l.trim().length > 0) || "";
  const cleaned = first.replace(/^[#>*\-\s]+/, "").trim();
  return cleaned.length > 110 ? cleaned.slice(0, 108).trim() + "\u2026" : cleaned;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// ── Atoms ────────────────────────────────────────────────────────────

const SkeletonLine: React.FC<{ width?: number | string; height?: number }> = ({ width = "60%", height = 14 }) => (
  <div
    aria-hidden
    style={{
      width, height, borderRadius: 3,
      background: "linear-gradient(90deg, var(--paper-2) 25%, var(--paper-3) 50%, var(--paper-2) 75%)",
      backgroundSize: "200% 100%",
      animation: "skeleton-pulse 1.5s ease-in-out infinite",
    }}
  />
);

const ErrorLine: React.FC<{ what: string; onRetry: () => void }> = ({ what, onRetry }) => (
  <div style={{ fontSize: 15, color: "var(--ink-2)", lineHeight: 1.55 }}>
    The {what} didn't load. Your data is safe.{" "}
    <button type="button" onClick={onRetry} style={{
      background: "transparent", border: 0, padding: 0, color: "var(--action)",
      textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer", fontSize: "inherit",
    }}>Retry</button>
  </div>
);

// Mono kicker
const Mono: React.FC<React.PropsWithChildren<{ color?: string; size?: number; style?: React.CSSProperties }>> = ({ children, color = "var(--ink-3)", size = 11, style }) => (
  <span style={{
    fontFamily: "var(--font-mono)", fontSize: size, letterSpacing: "0.14em",
    textTransform: "uppercase", color, ...style,
  }}>{children}</span>
);

function useCountUp(target: number | null, enabled: boolean): number {
  const [val, setVal] = useState<number>(target ?? 0);
  useEffect(() => {
    if (target == null) { setVal(0); return; }
    if (!enabled) { setVal(target); return; }
    const from = 0;
    const dur = 700;
    const start = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(from + (target - from) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, enabled]);
  return val;
}

// ── Component ────────────────────────────────────────────────────────

export default function Brief({ onOpenDraft, onSwitchTab, onOpenCapture }: BriefProps) {
  const { user, isReady } = useAuthReady();
  const tierInfo = useTierFromImprint(user?.id ?? null);
  const reducedMotion = useMemo(prefersReducedMotion, []);

  const [profile, setProfile] = useState<{ firstName: string; sectorFocus: string } | null>(null);
  const publishedSignalsRef = useRef<Set<string> | null>(null);

  const loadPublishedSignalIds = useCallback(async (): Promise<Set<string>> => {
    if (publishedSignalsRef.current) return publishedSignalsRef.current;
    if (!user) { publishedSignalsRef.current = new Set(); return publishedSignalsRef.current; }
    try {
      const { data } = await (supabase.from("linkedin_posts" as any) as any)
        .select("source_signal_id, published_at, tracking_status")
        .eq("user_id", user.id)
        .not("source_signal_id", "is", null);
      const rows = (data || []) as Array<{ source_signal_id: string | null; published_at: string | null; tracking_status: string | null }>;
      const set = new Set<string>();
      for (const r of rows) {
        if (!r.source_signal_id) continue;
        if (r.published_at != null || r.tracking_status === "published") set.add(r.source_signal_id);
      }
      publishedSignalsRef.current = set;
      return set;
    } catch {
      publishedSignalsRef.current = new Set();
      return publishedSignalsRef.current;
    }
  }, [user]);

  const [imprint, setImprint] = useState<SectionState<ImprintData>>({ status: "loading" });
  const [away, setAway] = useState<SectionState<AwayData>>({ status: "loading" });
  const [draftState, setDraftState] = useState<SectionState<DraftData>>({ status: "loading" });
  const [discernment, setDiscernment] = useState<SectionState<DiscernmentData>>({ status: "loading" });
  const [proof, setProof] = useState<SectionState<ProofData>>({ status: "loading" });
  const [rhythm, setRhythm] = useState<SectionState<RhythmData>>({ status: "loading" });
  const [published, setPublished] = useState<PublishedRecent | null>(null);

  // Ticking clock (skips on reduced-motion — renders static)
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    if (reducedMotion) return;
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, [reducedMotion]);

  // Edition = days since user.created_at (min 1). Week = ISO.
  const editionNumber = useMemo(() => {
    const created = (user as any)?.created_at;
    if (!created) return 1;
    const start = new Date(created).getTime();
    if (!isFinite(start)) return 1;
    return Math.max(1, Math.floor((Date.now() - start) / 86400000) + 1);
  }, [user]);
  const weekNumber = useMemo(() => isoWeekNumber(now), [now]);

  // Track unread count in "What Moved" locally.
  const [openedRows, setOpenedRows] = useState<Set<string>>(new Set());

  // Away-since gap in days (for the "away" scenario branch).
  const awayDays = useMemo(() => {
    try {
      const lv = typeof window !== "undefined" ? localStorage.getItem(LAST_VISIT_KEY) : null;
      if (!lv) return 0;
      const ms = Date.now() - new Date(lv).getTime();
      return Math.max(0, Math.floor(ms / 86400000));
    } catch { return 0; }
  }, [isReady, user?.id]);

  useEffect(() => {
    if (!isReady) return;
    let cancelled = false;
    const fallbackName = (): string => {
      const m = (user?.user_metadata || {}) as Record<string, any>;
      const raw = (m.first_name || m.full_name || m.name || "").toString().trim();
      return raw ? raw.split(/\s+/)[0] : "";
    };
    if (!user) {
      if (!cancelled) setProfile({ firstName: "", sectorFocus: "" });
      return;
    }
    (async () => {
      try {
        const { data } = await supabase
          .from("diagnostic_profiles").select("first_name, sector_focus")
          .eq("user_id", user.id).maybeSingle();
        if (cancelled) return;
        const first = (data?.first_name || fallbackName() || "").toString().trim();
        setProfile({ firstName: first, sectorFocus: (data?.sector_focus || "").toString().trim() });
      } catch {
        if (!cancelled) setProfile({ firstName: fallbackName(), sectorFocus: "" });
      }
    })();
    return () => { cancelled = true; };
  }, [isReady, user]);

  const loadImprint = useCallback(async () => {
    if (!user) {
      setImprint({ status: "ready", data: { imprint: null, delta: null, signalScore: null, contentScore: null, captureScore: null, spark: [] } });
      return;
    }
    setImprint({ status: "loading" });
    try {
      const { data, error } = await supabase
        .from("imprint_snapshots")
        .select("imprint, created_at, components")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      const rows = (data || []) as Array<{ imprint: number | null; created_at: string; components: any }>;
      const latest = rows[0]?.imprint ?? null;
      let delta: number | null = null;
      if (latest != null && rows.length > 1) {
        const latestTs = new Date(rows[0].created_at).getTime();
        const targetTs = latestTs - 7 * 24 * 60 * 60 * 1000;
        const minGapMs = 24 * 60 * 60 * 1000;
        const candidates = rows.slice(1).filter(r =>
          r.imprint != null && (latestTs - new Date(r.created_at).getTime()) >= minGapMs,
        );
        if (candidates.length > 0) {
          const closest = candidates.reduce((best, r) => {
            const d = Math.abs(new Date(r.created_at).getTime() - targetTs);
            return d < best.d ? { row: r, d } : best;
          }, { row: candidates[0], d: Math.abs(new Date(candidates[0].created_at).getTime() - targetTs) });
          delta = Math.round(latest - (closest.row.imprint as number));
        } else {
          delta = 0;
        }
      }
      const sc = rows[0]?.components?.score_components ?? {};
      const signalScore  = typeof sc.signal_score  === "number" ? Math.round(sc.signal_score)  : null;
      const contentScore = typeof sc.content_score === "number" ? Math.round(sc.content_score) : null;
      const captureScore = typeof sc.capture_score === "number" ? Math.round(sc.capture_score) : null;
      // Sparkline = last 8 imprint values in chronological order (oldest → newest)
      const spark = rows.slice(0, 8).map(r => r.imprint).filter((v): v is number => typeof v === "number").reverse();
      setImprint({ status: "ready", data: { imprint: latest, delta, signalScore, contentScore, captureScore, spark } });
    } catch (e) {
      console.warn("[Brief] imprint load failed", e);
      setImprint({ status: "error", message: "imprint" });
    }
  }, [user]);

  const loadAway = useCallback(async () => {
    if (!user) {
      setAway({ status: "ready", data: { signals: [], territory: [], signalCount: 0, newCaptureCount: 0, mode: "away" } });
      return;
    }
    setAway({ status: "loading" });
    try {
      const sevenAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const lv = (typeof window !== "undefined" && localStorage.getItem(LAST_VISIT_KEY)) || null;
      const sinceDate = lv ? new Date(Math.min(new Date(lv).getTime(), sevenAgo.getTime())) : sevenAgo;
      const since = sinceDate.toISOString();

      const publishedSet = await loadPublishedSignalIds();

      const richSelect = "id, signal_title, confidence, created_at, status, what_it_means_for_you, velocity_status, lifecycle_tier, last_evidence_at, strength_score, theme_tags, explanation";

      const [sigRes, capRes] = await Promise.all([
        (supabase.from("strategic_signals" as any) as any)
          .select(richSelect)
          .eq("user_id", user.id)
          .eq("status", "active")
          .gte("created_at", since)
          .order("confidence", { ascending: false })
          .limit(10),
        supabase.from("entries").select("id", { count: "exact", head: true })
          .eq("user_id", user.id).gte("created_at", since),
      ]);
      const { count: docSinceCount } = await supabase
        .from("documents").select("id", { count: "exact", head: true })
        .eq("user_id", user.id).gte("created_at", since);

      if (sigRes?.error) throw sigRes.error;
      const mapRow = (r: any): AwaySignalRow => ({
        id: r.id,
        title: r.signal_title || "Untitled signal",
        confidence: r.confidence,
        what: r.what_it_means_for_you ?? null,
        velocity: r.velocity_status ?? null,
        lifecycle: r.lifecycle_tier ?? null,
        lastEvidenceAt: r.last_evidence_at ?? null,
        createdAt: r.created_at ?? null,
        strength: typeof r.strength_score === "number" ? r.strength_score : null,
        themes: Array.isArray(r.theme_tags) ? r.theme_tags.filter((x: any) => typeof x === "string") : [],
        explanation: r.explanation ?? null,
      });
      const sigRows = (sigRes?.data || []) as any[];
      let signals: AwaySignalRow[] = sigRows
        .filter((r) => !publishedSet.has(r.id))
        .slice(0, 3)
        .map(mapRow);
      const newCaptureCount = (capRes?.count ?? 0) + (docSinceCount ?? 0);
      let mode: "away" | "radar" = "away";

      if (signals.length === 0) {
        const { data: radarData, error: radarError } = await (supabase.from("strategic_signals" as any) as any)
          .select(richSelect)
          .eq("user_id", user.id).eq("status", "active")
          .order("confidence", { ascending: false }).limit(10);
        if (radarError) throw radarError;
        const radarRows = (radarData || []) as any[];
        const filtered = radarRows.filter((r) => !publishedSet.has(r.id)).slice(0, 3);
        if (filtered.length > 0) { signals = filtered.map(mapRow); mode = "radar"; }
      }

      // Territory — top 5 by strength_score (independent from confidence ranking).
      const { data: terrData } = await (supabase.from("strategic_signals" as any) as any)
        .select(richSelect)
        .eq("user_id", user.id).eq("status", "active")
        .order("strength_score", { ascending: false, nullsFirst: false }).limit(5);
      const territory: AwaySignalRow[] = ((terrData || []) as any[]).map(mapRow);

      const { count: activeTotal } = await (supabase.from("strategic_signals" as any) as any)
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id).eq("status", "active");

      setAway({ status: "ready", data: { signals, territory, signalCount: activeTotal ?? signals.length, newCaptureCount, mode } });
    } catch (e) {
      console.warn("[Brief] away load failed", e);
      setAway({ status: "error", message: "signals update" });
    }
  }, [user, loadPublishedSignalIds]);

  const loadDraft = useCallback(async () => {
    if (!user) { setDraftState({ status: "ready", data: { draft: null, preview: "", voiceScore: null, signalCount: null } }); return; }
    setDraftState({ status: "loading" });
    try {
      const publishedSet = await loadPublishedSignalIds();
      const { data, error } = await supabase.from("content_items")
        .select("id, type, body, language, status, generation_params, created_at")
        .eq("user_id", user.id)
        .gte("created_at", startOfThisWeekIso())
        .order("created_at", { ascending: true });
      if (error) throw error;
      const rows = (data || []) as Array<{ id: string; type: string | null; body: string | null; language: string | null; status: string | null; generation_params: any }>;
      const draftSignalIds = (gp: any): string[] => {
        const out: string[] = [];
        if (typeof gp?.signal_id === "string") out.push(gp.signal_id);
        if (typeof gp?.source_signal_id === "string") out.push(gp.source_signal_id);
        if (Array.isArray(gp?.source_signals)) for (const s of gp.source_signals) {
          if (typeof s === "string") out.push(s); else if (s && typeof s.id === "string") out.push(s.id);
        }
        if (Array.isArray(gp?.signals)) for (const s of gp.signals) {
          if (typeof s === "string") out.push(s); else if (s && typeof s.id === "string") out.push(s.id);
        }
        return out;
      };
      const ready = rows.filter((r) => {
        if (r?.generation_params?.source !== "weekly_ready") return false;
        if (r.status === "published") return false;
        const ids = draftSignalIds(r.generation_params);
        return !ids.some((id) => publishedSet.has(id));
      });
      const pick = ready[0];
      if (!pick) { setDraftState({ status: "ready", data: { draft: null, preview: "", voiceScore: null, signalCount: null } }); return; }
      const lang: "en" | "ar" = pick.language === "ar" ? "ar" : "en";
      const type: BriefDraft["type"] = pick.type === "carousel" ? "carousel" : pick.type === "framework" ? "framework" : "linkedin_post";
      const draft: BriefDraft = { id: pick.id, body: pick.body || "", language: lang, type, topic: pick?.generation_params?.topic ?? null, _source: "content_items" };
      const gp = pick?.generation_params || {};
      const rawVoice = gp.voice_match ?? gp.voice_score ?? gp.quality_score ?? gp.match_score ?? null;
      let voiceScore: number | null = null;
      if (typeof rawVoice === "number" && isFinite(rawVoice)) voiceScore = rawVoice <= 1 ? Math.round(rawVoice * 100) : Math.round(rawVoice);
      const sigCountRaw = gp.source_signal_count ?? gp.signal_count ?? (Array.isArray(gp.source_signals) ? gp.source_signals.length : null) ?? (Array.isArray(gp.signals) ? gp.signals.length : null);
      const signalCount = typeof sigCountRaw === "number" && sigCountRaw > 0 ? sigCountRaw : null;
      setDraftState({ status: "ready", data: { draft, preview: derivePreview(pick.body || ""), voiceScore, signalCount } });
    } catch (e) {
      console.warn("[Brief] draft load failed", e);
      setDraftState({ status: "error", message: "ready draft" });
    }
  }, [user, loadPublishedSignalIds]);

  const loadDiscernment = useCallback(async () => {
    if (!user) { setDiscernment({ status: "ready", data: { value: null, postsWithSignal: null, published120d: null } }); return; }
    setDiscernment({ status: "loading" });
    try {
      const { data } = await (supabase.from("facet_states" as any) as any)
        .select("value, inputs").eq("user_id", user.id).eq("facet", "discernment").maybeSingle();
      const inputs = (data?.inputs || {}) as any;
      setDiscernment({ status: "ready", data: {
        value: typeof data?.value === "number" ? Math.round(data.value) : null,
        postsWithSignal: typeof inputs.posts_with_source_signal === "number" ? inputs.posts_with_source_signal : null,
        published120d: typeof inputs.published_posts_120d === "number" ? inputs.published_posts_120d : null,
      }});
    } catch (e) {
      console.warn("[Brief] discernment load failed", e);
      setDiscernment({ status: "error", message: "gap reading" });
    }
  }, [user]);

  const loadProof = useCallback(async () => {
    if (!user) {
      setProof({ status: "ready", data: { entriesTotal: 0, fragments: 0, institutions: 0, dayN: null, annualImpressions: 0, annualReach: 0 } });
      return;
    }
    setProof({ status: "loading" });
    try {
      const yearAgo = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
      const [entriesRes, fragsRes, instRes, firstRes, infRes] = await Promise.all([
        supabase.from("entries").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("evidence_fragments").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("evidence_fragments").select("source_registry_id").eq("user_id", user.id).not("source_registry_id", "is", null),
        supabase.from("entries").select("created_at").eq("user_id", user.id).order("created_at", { ascending: true }).limit(1).maybeSingle(),
        (supabase.from("influence_snapshots" as any) as any)
          .select("impressions, members_reached, snapshot_date")
          .eq("user_id", user.id).gte("snapshot_date", yearAgo),
      ]);
      const { count: docsTotal } = await supabase.from("documents").select("id", { count: "exact", head: true }).eq("user_id", user.id);
      const institutions = new Set(
        ((instRes?.data || []) as Array<{ source_registry_id: string | null }>).map((r) => r.source_registry_id).filter(Boolean),
      ).size;
      const first = (firstRes?.data as any)?.created_at as string | undefined;
      const dayN = first ? Math.max(1, Math.floor((Date.now() - new Date(first).getTime()) / 86400000) + 1) : null;

      // period-matched; canonical version in ImpactTab — keep in sync.
      // Numerator = SUM(impressions), denominator = MAX(members_reached) over the year.
      const infRows = (infRes?.data || []) as Array<{ impressions: number | null; members_reached: number | null }>;
      const annualImpressions = infRows.reduce((s, r) => s + (Number(r.impressions) || 0), 0);
      const annualReach = infRows.reduce((m, r) => Math.max(m, Number(r.members_reached) || 0), 0);

      setProof({ status: "ready", data: {
        entriesTotal: (entriesRes?.count ?? 0) + (docsTotal ?? 0),
        fragments: fragsRes?.count ?? 0,
        institutions, dayN, annualImpressions, annualReach,
      }});
    } catch (e) {
      console.warn("[Brief] proof load failed", e);
      setProof({ status: "error", message: "proof counts" });
    }
  }, [user]);

  const loadRhythm = useCallback(async () => {
    if (!user) {
      setRhythm({ status: "ready", data: { days: [], totalDays: 0, streak: 0, totalCaptures: 0 } });
      return;
    }
    setRhythm({ status: "loading" });
    try {
      const sinceIso = new Date(Date.now() - 7 * 86400000).toISOString();
      const [entryRes, docRes] = await Promise.all([
        supabase.from("entries").select("created_at").eq("user_id", user.id).gte("created_at", sinceIso),
        supabase.from("documents").select("created_at").eq("user_id", user.id).gte("created_at", sinceIso),
      ]);
      const stamps: string[] = [
        ...((entryRes?.data || []) as any[]).map(r => r.created_at as string),
        ...((docRes?.data || []) as any[]).map(r => r.created_at as string),
      ].filter(Boolean);
      // Build 7 local-day buckets (index 0 = 6 days ago, 6 = today).
      const buckets = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (6 - i));
        return { key: d.getTime(), label: d.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 1), count: 0, isToday: i === 6 };
      });
      for (const s of stamps) {
        const d = new Date(s); d.setHours(0, 0, 0, 0);
        const idx = buckets.findIndex(b => b.key === d.getTime());
        if (idx >= 0) buckets[idx].count += 1;
      }
      // Consecutive-day streak ending today (0 if today empty).
      let streak = 0;
      for (let i = 6; i >= 0; i--) {
        if (buckets[i].count > 0) streak += 1; else break;
      }
      const totalDays = buckets.filter(b => b.count > 0).length;
      const totalCaptures = buckets.reduce((s, b) => s + b.count, 0);
      setRhythm({ status: "ready", data: {
        days: buckets.map(b => ({ label: b.label, count: b.count, isToday: b.isToday })),
        totalDays, streak, totalCaptures,
      }});
    } catch (e) {
      console.warn("[Brief] rhythm load failed", e);
      setRhythm({ status: "error", message: "rhythm" });
    }
  }, [user]);

  const loadPublished = useCallback(async () => {
    if (!user) { setPublished(null); return; }
    try {
      const since = new Date(Date.now() - 48 * 3600_000).toISOString();
      const { data } = await (supabase.from("linkedin_posts" as any) as any)
        .select("published_at, topic")
        .eq("user_id", user.id)
        .not("published_at", "is", null)
        .gte("published_at", since)
        .order("published_at", { ascending: false })
        .limit(1);
      const row = (data || [])[0];
      setPublished(row ? { publishedAt: row.published_at ?? null, topic: row.topic ?? null } : null);
    } catch { setPublished(null); }
  }, [user]);

  useEffect(() => {
    if (!isReady) return;
    void loadImprint(); void loadAway(); void loadDraft(); void loadDiscernment(); void loadProof(); void loadRhythm(); void loadPublished();
    return () => {
      try { localStorage.setItem(LAST_VISIT_KEY, new Date().toISOString()); } catch { /* noop */ }
    };
  }, [isReady, loadImprint, loadAway, loadDraft, loadDiscernment, loadProof, loadRhythm, loadPublished]);

  useEffect(() => {
    if (!user?.id) return;
    const handler = () => {
      publishedSignalsRef.current = null;
      void loadImprint(); void loadAway(); void loadDraft(); void loadDiscernment(); void loadProof(); void loadRhythm(); void loadPublished();
    };
    window.addEventListener("capture-complete", handler);
    return () => window.removeEventListener("capture-complete", handler);
  }, [user?.id, loadImprint, loadAway, loadDraft, loadDiscernment, loadProof, loadRhythm, loadPublished]);

  useEffect(() => {
    if (!user?.id) return;
    const uid = user.id;
    const refreshAll = () => {
      publishedSignalsRef.current = null;
      void loadImprint(); void loadAway(); void loadDraft(); void loadDiscernment(); void loadProof(); void loadRhythm(); void loadPublished();
    };
    const ch = supabase.channel(`brief-live-${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "entries",            filter: `user_id=eq.${uid}` }, refreshAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "documents",          filter: `user_id=eq.${uid}` }, refreshAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "strategic_signals",  filter: `user_id=eq.${uid}` }, refreshAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "imprint_snapshots",  filter: `user_id=eq.${uid}` }, refreshAll)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, loadImprint, loadAway, loadDraft, loadDiscernment, loadProof, loadRhythm, loadPublished]);

  // ── Derivations ─────────────────────────────────────────────────────

  const firstName = profile?.firstName || "";
  const profileResolved = profile !== null;

  const topSignal = away.status === "ready" && away.data.signals.length > 0 ? away.data.signals[0] : null;
  const draft = draftState.status === "ready" ? draftState.data.draft : null;

  // Scenario for the lead spread
  type Scenario = "published" | "new" | "away" | "draft" | "standing";
  const scenario: Scenario = useMemo(() => {
    if (published) return "published";
    const isNew = (proof.status === "ready" && proof.data.dayN === 1) ||
      (imprint.status === "ready" && imprint.data.imprint == null && proof.status === "ready" && proof.data.entriesTotal === 0);
    if (isNew) return "new";
    if (awayDays >= 4) return "away";
    if (draft) return "draft";
    return "standing";
  }, [published, proof, imprint, awayDays, draft]);

  // Next tier from canonical TIER_BANDS
  const nextTier = useMemo(() => {
    const cur = tierInfo.currentTier;
    if (!cur) return null;
    const idx = TIER_BANDS.findIndex(b => b.key === cur.key);
    if (idx < 0 || idx >= TIER_BANDS.length - 1) return null;
    const nxt = TIER_BANDS[idx + 1];
    const score = imprint.status === "ready" ? imprint.data.imprint : null;
    const points = score != null ? Math.max(1, nxt.min - score) : null;
    return { name: nxt.name, points };
  }, [tierInfo.currentTier, imprint]);

  // Imprint total count-up
  const imprintTotal = imprint.status === "ready" ? imprint.data.imprint : null;
  const animatedImprint = useCountUp(imprintTotal, !reducedMotion);

  // Return-viewers ratio
  const returnRatio = proof.status === "ready" && proof.data.annualReach > 0
    ? proof.data.annualImpressions / proof.data.annualReach : null;

  // Unread count in What Moved
  const unread = away.status === "ready"
    ? Math.max(0, away.data.signals.length - openedRows.size)
    : 0;

  // Time strings
  const clock = useMemo(() => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  }, [now]);
  const dateline = useMemo(() =>
    now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).toUpperCase(),
  [now]);

  // Lead headline data
  const leadCopy = useMemo(() => {
    switch (scenario) {
      case "published":
        return { slug: "TRACKING —", headline: "Your piece is out. Early readers arriving.", standfirst: "The wire is watching how it lands — your Imprint will move with it." };
      case "new":
        return { slug: "DAY ONE —", headline: "A Brief with your name on it starts printing tonight.", standfirst: "One capture, thirty seconds, and tomorrow's edition speaks your language." };
      case "away":
        return { slug: "CATCH-UP —", headline: `${awayDays} days out — the wire kept score.`, standfirst: "The signals below moved while you were quiet. Pick the one worth a paragraph." };
      case "draft":
        return { slug: "THIS WEEK —", headline: "The market is moving on your theme. Your draft holds the first word.", standfirst: "Ten minutes and the draft is yours in the feed." };
      default: {
        // "standing" — honest 3-branch on scores + the gap reframe
        const s  = imprint.status === "ready" ? imprint.data.signalScore  : null;
        const c  = imprint.status === "ready" ? imprint.data.contentScore : null;
        const dI = discernment.status === "ready" ? discernment.data : null;
        const headline = topSignal
          ? "You see this more clearly than you've said it."
          : (s != null && c != null) ? "Your reading is ahead of your voice this week." : "Your reading is taking shape.";
        const standfirst = (dI && dI.postsWithSignal != null && dI.published120d != null && s != null && c != null)
          ? `Reading ${s}, voice ${c} — only ${dI.postsWithSignal} of your last ${dI.published120d} posts drew on a captured signal. That's the gap — and the opening.`
          : (s != null && c != null)
            ? `Reading ${s}; voice ${c}. That's the gap — and the opening.`
            : "Reading and voice are still forming. The gap is where the next post lives.";
        return { slug: "THE WIRE —", headline, standfirst };
      }
    }
  }, [scenario, awayDays, imprint, discernment, topSignal]);

  // ── Next Move ladder ────────────────────────────────────────────────
  const nextMove = useMemo(() => {
    const zeroCaptures7 = rhythm.status === "ready" && rhythm.data.totalCaptures === 0;
    if (draft) return {
      body: "Your draft is one decision from published.",
      cta: "Open the draft",
      onClick: () => onOpenDraft(draft),
      voiceScore: draftState.status === "ready" ? draftState.data.voiceScore : null,
    };
    if (topSignal) return {
      body: `Speak on ${topSignal.title.length > 68 ? topSignal.title.slice(0, 66) + "\u2026" : topSignal.title} while it's still forming.`,
      cta: "Write from this signal",
      onClick: () => onSwitchTab?.("authority"),
      voiceScore: null,
    };
    if (zeroCaptures7) return {
      body: "Re-open the week with one capture.",
      cta: "Capture something",
      onClick: () => onOpenCapture?.(),
      voiceScore: null,
    };
    return {
      body: "Make your first capture.",
      cta: "Capture something",
      onClick: () => onOpenCapture?.(),
      voiceScore: null,
    };
  }, [draft, topSignal, rhythm, draftState, onOpenDraft, onSwitchTab, onOpenCapture]);

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      transition={{ duration: 0.24, ease: [0.32, 0.72, 0.35, 1] }}
      className="brief-page"
      style={{
        backgroundColor: "var(--paper)", color: "var(--ink)",
        fontFamily: "var(--font-body)", fontSize: 17, lineHeight: 1.6,
        marginInline: "calc(50% - 50vw)", width: "100vw",
        padding: "18px 0 60px", minHeight: "100vh",
      }}
      aria-label="Your Brief"
    >
      <div className="brief-inner" style={{ maxWidth: 1100, margin: "0 auto", padding: "0 32px" }}>

      {/* 1. META STRIP ────────────────────────────────────── */}
      <div className="brief-meta" style={{
        display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center",
        gap: 12, paddingBottom: 10, borderBottom: "1px solid var(--rule)", marginBottom: 22,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Mono>
            EDITION {editionNumber} · WEEK {weekNumber}
            {firstName ? ` · PREPARED FOR ${firstName.toUpperCase()}` : ""}
          </Mono>
          <InfoTooltip
            label="Edition"
            triggerSize={13}
            text={`Your ${editionNumber}th Brief — one is printed for every day since you joined.`}
            side="bottom"
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
          <span aria-hidden style={{
            width: 7, height: 7, borderRadius: "50%", background: "var(--live)",
            boxShadow: reducedMotion ? "none" : "0 0 0 0 var(--live)",
            animation: reducedMotion ? undefined : "brief-pulse 2s ease-in-out infinite",
          }} />
          <Mono color="var(--live-ink, var(--live))" size={11}>LIVE {clock}</Mono>
        </div>
        <div style={{ textAlign: "end" }}>
          <Mono>{dateline}</Mono>
        </div>
      </div>

      {/* 2. LEAD SPREAD ────────────────────────────────────── */}
      <section className="brief-lead" style={{
        display: "grid", gridTemplateColumns: "1fr 310px", gap: 40, marginBottom: 40,
      }}>
        {/* LEFT — kicker, headline, standfirst, byline */}
        <div>
          <div style={{ marginBottom: 14 }}>
            <Mono>
              {greeting(now)}
              {firstName ? `, ${firstName}` : ""} — <span style={{ color: "var(--spot)" }}>THE BRIEF</span>
            </Mono>
          </div>
          <p style={{
            margin: 0, display: "flex", alignItems: "baseline", gap: 10,
          }}>
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.14em",
              color: "#7A1F1F", textTransform: "uppercase", flexShrink: 0,
            }}>{leadCopy.slug}</span>
          </p>
          <h1 dir="auto" style={{
            fontFamily: "var(--font-serif)", fontWeight: 400,
            fontSize: "clamp(2rem, 4.6vw, 3.2rem)", lineHeight: 1.08,
            letterSpacing: "-0.015em", color: "var(--ink)", margin: "8px 0 16px 0",
          }}>{leadCopy.headline}</h1>
          <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6, color: "var(--ink-2)" }}>
            {leadCopy.standfirst}
          </p>
          <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 8 }}>
            <Mono>FROM AURA — YOUR CHIEF OF STAFF</Mono>
            <InfoTooltip
              label="Byline"
              triggerSize={13}
              text="Aura writes this note fresh before every visit — from your signals, your drafts, and how long you have been away."
              side="bottom"
            />
          </div>
        </div>

        {/* RIGHT — IMPRINT LEDGER */}
        <aside className="brief-ledger" style={{
          borderInlineStart: "1px solid var(--rule)", paddingInlineStart: 26,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <Mono color="var(--spot)">YOUR IMPRINT</Mono>
            <InfoTooltip label="Imprint" triggerSize={12}
              text="Your Imprint is the single number for how visible your expertise is — built from three forces: Signal, Content, Consistency."
              side="bottom"
            />
          </div>

          {imprint.status === "loading" && <SkeletonLine width="100%" height={90} />}
          {imprint.status === "error" && <ErrorLine what="Imprint" onRetry={loadImprint} />}
          {imprint.status === "ready" && imprint.data.imprint == null && (
            <div>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 48, color: "var(--ink-3)", lineHeight: 1 }}>· · ·</div>
              <div style={{ marginTop: 8 }}><Mono color="var(--spot)">FORMING</Mono></div>
              <p style={{ marginTop: 10, fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 14, color: "var(--ink-2)", lineHeight: 1.55 }}>
                Your first Imprint prints minutes after your first capture — then fresh every morning.
              </p>
            </div>
          )}
          {imprint.status === "ready" && imprint.data.imprint != null && (() => {
            const d = imprint.data;
            const rows: Array<{ label: string; value: number | null }> = [
              { label: FORCES.signal,      value: d.signalScore },
              { label: FORCES.content,     value: d.contentScore },
              { label: FORCES.consistency, value: d.captureScore },
            ];
            const weights = ["40%", "40%", "20%"];
            return (
              <div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {rows.map((r, i) => (
                    <div key={r.label}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
                        <Mono size={10}>{r.label} · {weights[i]}</Mono>
                        <span style={{ fontFamily: "var(--font-serif)", fontSize: 14, color: "var(--ink)" }}>{r.value ?? "—"}</span>
                      </div>
                      <div style={{ height: 3, background: "var(--paper-2)", position: "relative", overflow: "hidden" }}>
                        <div style={{
                          position: "absolute", inset: 0, width: `${Math.max(0, Math.min(100, r.value ?? 0))}%`,
                          background: "var(--ink)",
                          transition: reducedMotion ? undefined : "width 0.7s cubic-bezier(0.32,0.72,0.35,1)",
                        }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--rule)" }}>
                  {tierInfo.currentTier && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <Mono color="var(--spot)" size={11}>{tierInfo.currentTier.name.toUpperCase()}</Mono>
                      {d.delta != null && d.delta !== 0 && (
                        <Mono color={d.delta > 0 ? "var(--live-ink, var(--live))" : "var(--spot)"} size={10}>
                          {d.delta > 0 ? "▲" : "▼"} {d.delta > 0 ? "+" : ""}{d.delta} this week
                        </Mono>
                      )}
                    </div>
                  )}
                  {nextTier?.points != null && (
                    <div style={{ marginTop: 4 }}>
                      <Mono size={10}>{nextTier.points} points to {nextTier.name}</Mono>
                    </div>
                  )}
                  <div style={{
                    marginTop: 10, fontFamily: "var(--font-serif)", fontSize: 56, lineHeight: 1,
                    color: "var(--ink)", letterSpacing: "-0.02em",
                  }}>{animatedImprint}</div>

                  {d.spark.length >= 2 && (
                    <svg viewBox="0 0 120 30" width="100%" height="30" style={{ marginTop: 8, display: "block" }} aria-label="Imprint over recent snapshots">
                      {(() => {
                        const vs = d.spark;
                        const min = Math.min(...vs);
                        const max = Math.max(...vs);
                        const range = Math.max(1, max - min);
                        const pts = vs.map((v, i) => {
                          const x = (i / (vs.length - 1)) * 120;
                          const y = 28 - ((v - min) / range) * 26;
                          return `${x.toFixed(1)},${y.toFixed(1)}`;
                        }).join(" ");
                        return <polyline points={pts} fill="none" stroke="var(--ink-2)" strokeWidth="1" />;
                      })()}
                    </svg>
                  )}
                </div>
              </div>
            );
          })()}
        </aside>
      </section>

      {/* 3. NEXT MOVE ────────────────────────────────────── */}
      <section style={{ borderTop: "2px solid var(--ink)", paddingTop: 20, marginBottom: 44 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
          <Mono color="var(--spot)">◆ NEXT MOVE</Mono>
          <InfoTooltip label="Next move" triggerSize={12} text="The one action worth your next ten minutes." side="bottom" />
          <Mono>ONE DECISION</Mono>
        </div>
        <h2 style={{
          fontFamily: "var(--font-serif)", fontWeight: 400, margin: "0 0 16px 0",
          fontSize: "clamp(1.4rem, 2.8vw, 1.9rem)", lineHeight: 1.25, color: "var(--ink)",
        }} dir="auto">{nextMove.body}</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <button type="button" onClick={nextMove.onClick} className="brief-cta"
            style={{
              background: "var(--spot)", color: "var(--paper)",
              border: 0, padding: "10px 20px", cursor: "pointer",
              fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}>{nextMove.cta}</button>
          {nextMove.voiceScore != null && (
            <Mono size={10}>{nextMove.voiceScore}% voice match</Mono>
          )}
        </div>
      </section>

      {/* 4. WHAT MOVED ────────────────────────────────────── */}
      <section style={{ marginBottom: 44 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Mono color="var(--spot)">WHAT MOVED</Mono>
            <InfoTooltip label="What moved" triggerSize={12}
              text="Only the change — the strongest shifts since your last visit. The complete picture lives in Signals."
              side="bottom"
            />
            {unread > 0 && <Mono size={10}>{unread} unread</Mono>}
          </div>
          <button type="button" onClick={() => onSwitchTab?.("intelligence")}
            style={{ background: "transparent", border: 0, cursor: "pointer", padding: 0, color: "var(--action)" }}>
            <Mono color="var(--action)" size={11}>All signals →</Mono>
          </button>
        </div>
        <p style={{ margin: "0 0 16px 0", fontFamily: "var(--font-serif)", fontStyle: "italic",
          fontSize: 14, color: "var(--ink-2)", lineHeight: 1.55 }}>
          The strongest shifts since your last visit.
        </p>

        <div className="brief-moved" style={{ display: "grid", gridTemplateColumns: "1fr 310px", gap: 40 }}>
          {/* LEFT — signal list */}
          <div>
            {away.status === "loading" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <SkeletonLine width="90%" /><SkeletonLine width="70%" /><SkeletonLine width="80%" />
              </div>
            )}
            {away.status === "error" && <ErrorLine what="signals" onRetry={loadAway} />}
            {away.status === "ready" && (
              away.data.signals.length === 0 ? (
                <p style={{ margin: 0, color: "var(--ink-2)", fontSize: 15, lineHeight: 1.55 }}>
                  You're clear — nothing new since your last visit.
                </p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {away.data.signals.map((s) => {
                    const isOpen = openedRows.has(s.id);
                    const meta = (() => {
                      const parts: string[] = [];
                      if (s.velocity === "accelerating") parts.push("▲ RISING");
                      else if (s.lifecycle === "live") parts.push("LIVE");
                      else parts.push("STEADY");
                      const stamp = s.lastEvidenceAt || s.createdAt;
                      if (stamp) {
                        const days = Math.floor((Date.now() - new Date(stamp).getTime()) / 86400000);
                        parts.push(days <= 7 ? "THIS WEEK" : "EARLIER");
                      }
                      return parts.join(" · ");
                    })();
                    const body = s.what || s.explanation || null;
                    return (
                      <li key={s.id} style={{ borderTop: "1px solid var(--rule)" }}>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenedRows(prev => { const n = new Set(prev); n.add(s.id); return n; });
                          }}
                          className="brief-row"
                          dir="auto"
                          style={{
                            width: "100%", display: "block", textAlign: "start",
                            background: "transparent", border: 0, cursor: "pointer",
                            paddingBlock: 14, paddingInline: 0, color: "var(--ink)",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                            <span aria-hidden style={{
                              width: 8, height: 8, borderRadius: "50%", marginTop: 8,
                              background: isOpen ? "var(--spot)" : "transparent",
                              border: "1px solid var(--ink-3)", flexShrink: 0,
                            }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontFamily: "var(--font-serif)", fontSize: 18, lineHeight: 1.35, color: "var(--ink)" }}>
                                {s.title}
                              </div>
                              <div style={{ marginTop: 4 }}><Mono size={10}>{meta}</Mono></div>
                            </div>
                          </div>
                          <div style={{
                            maxHeight: isOpen ? 220 : 0, overflow: "hidden",
                            transition: reducedMotion ? undefined : "max-height 0.3s ease",
                          }}>
                            {body && (
                              <p style={{
                                margin: "10px 0 6px 20px", fontSize: 14, lineHeight: 1.55,
                                color: "var(--ink-2)",
                                display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                              }}>{body}</p>
                            )}
                            {s.velocity === "accelerating" && (
                              <div style={{ marginLeft: 20, marginTop: 4 }}>
                                <Mono color="var(--spot)" size={10}>WHY NOW</Mono>
                              </div>
                            )}
                            <div style={{ marginLeft: 20, marginTop: 8 }}>
                              <button type="button" onClick={(e) => { e.stopPropagation(); onSwitchTab?.("intelligence"); }}
                                style={{ background: "transparent", border: 0, cursor: "pointer", padding: 0, color: "var(--action)" }}>
                                <Mono color="var(--action)" size={11}>View in Signals →</Mono>
                              </button>
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )
            )}
          </div>

          {/* RIGHT — FIG. 01 territory */}
          <aside style={{
            borderInlineStart: "1px solid var(--rule)", paddingInlineStart: 26,
          }}>
            {(() => {
              const marks = away.status === "ready" ? away.data.territory : [];
              return (
                <>
                  <svg viewBox="0 0 220 220" width="100%" height="220" aria-label="Your territory diagram"
                    style={{ display: "block" }}>
                    <g fill="none" stroke="var(--rule)" strokeWidth="0.5">
                      <circle cx="110" cy="110" r="90" />
                      <circle cx="110" cy="110" r="60" />
                      <circle cx="110" cy="110" r="30" />
                      <line x1="20" y1="110" x2="200" y2="110" />
                      <line x1="110" y1="20" x2="110" y2="200" />
                      <line x1="46" y1="46" x2="174" y2="174" />
                      <line x1="174" y1="46" x2="46" y2="174" />
                    </g>
                    <circle cx="110" cy="110" r="3" fill="var(--ink)" />
                    <text x="110" y="126" textAnchor="middle"
                      style={{ fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--ink-3)", letterSpacing: "0.14em" }}>YOU</text>
                    {marks.map((m, i) => {
                      const strength = Math.max(0, Math.min(1, (m.strength ?? 0)));
                      const dist = 15 + strength * 85; // 15 = near center, 100 outer
                      const angle = (i / Math.max(1, marks.length)) * Math.PI * 2 - Math.PI / 2;
                      const cx = 110 + Math.cos(angle) * dist;
                      const cy = 110 + Math.sin(angle) * dist;
                      const r = 3 + strength * 3;
                      const isHot = m.velocity === "accelerating" || m.lifecycle === "live";
                      const isFaded = m.lifecycle === "faded";
                      const label = ((m.themes[0] || m.title).split(/\s+/).slice(0, 2).join(" ")).toUpperCase();
                      const shortLabel = label.length > 14 ? label.slice(0, 12) + "…" : label;
                      const labelY = i % 2 === 0 ? cy - r - 4 : cy + r + 9;
                      return (
                        <g key={m.id}>
                          <circle cx={cx} cy={cy} r={r}
                            fill={isFaded ? "none" : isHot ? "var(--live)" : "var(--ink)"}
                            stroke={isFaded ? "var(--ink-3)" : "none"} strokeWidth="1" />
                          <text x={cx} y={labelY} textAnchor="middle"
                            style={{ fontFamily: "var(--font-mono)", fontSize: 6.5, fill: "var(--ink-3)", letterSpacing: "0.1em" }}>
                            {shortLabel}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                  <div style={{ marginTop: 10 }}>
                    <Mono color="var(--spot)" size={10}>FIG. 01 — YOUR TERRITORY · WEEK {weekNumber}</Mono>
                  </div>
                  {marks.length < 2 ? (
                    <p style={{ margin: "6px 0 0", fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, color: "var(--ink-2)" }}>
                      Your territory draws itself from your first captures.
                    </p>
                  ) : (
                    <p style={{ margin: "6px 0 0", fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, color: "var(--ink-2)" }}>
                      Where your work has weight — distance from center = strength.
                    </p>
                  )}
                  <button type="button" onClick={() => onSwitchTab?.("intelligence")}
                    style={{ background: "transparent", border: 0, padding: "6px 0 0", cursor: "pointer" }}>
                    <Mono color="var(--action)" size={11}>Explore in Signals →</Mono>
                  </button>
                </>
              );
            })()}
          </aside>
        </div>
      </section>

      {/* 5. YOUR RHYTHM / PROOF ────────────────────────────────────── */}
      <section className="brief-rhythm" style={{ display: "grid", gridTemplateColumns: "1fr 310px", gap: 40, marginBottom: 44 }}>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Mono color="var(--spot)">{HEADERS.yourRhythm}</Mono>
              <InfoTooltip label="Rhythm" triggerSize={12}
                text="One capture keeps the week unbroken. Consistency beats volume — every time."
                side="top"
              />
            </div>
            {rhythm.status === "ready" && (
              <Mono size={10}>{rhythm.data.totalDays} of 7 days</Mono>
            )}
          </div>
          <p style={{ margin: "0 0 14px", fontFamily: "var(--font-serif)", fontStyle: "italic",
            fontSize: 13, color: "var(--ink-2)" }}>
            One capture keeps the week unbroken. Bar height is captures per day.
          </p>

          {rhythm.status === "loading" && <SkeletonLine width="100%" height={70} />}
          {rhythm.status === "error" && <ErrorLine what="rhythm" onRetry={loadRhythm} />}
          {rhythm.status === "ready" && (
            rhythm.data.totalCaptures === 0 ? (
              <div>
                <p style={{ margin: "0 0 12px", fontFamily: "var(--font-serif)", fontSize: 20, color: "var(--ink-2)" }}>
                  A quiet week. One capture restarts it.
                </p>
                <button type="button" onClick={() => onOpenCapture?.()}
                  style={{
                    background: "var(--spot)", color: "var(--paper)", border: 0,
                    padding: "9px 18px", cursor: "pointer", fontFamily: "var(--font-mono)",
                    fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase",
                  }}>Capture something</button>
              </div>
            ) : (() => {
              const days = rhythm.data.days;
              const maxC = Math.max(1, ...days.map(d => d.count));
              return (
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0, alignItems: "end", height: 100, borderBottom: "1px solid var(--rule)" }}>
                    {days.map((d, i) => {
                      const h = d.count === 0 ? 0 : Math.max(6, (d.count / maxC) * 90);
                      return (
                        <div key={i} style={{
                          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end",
                          height: "100%", borderInlineStart: i === 0 ? "none" : "0.5px solid var(--rule)", padding: "0 6px",
                        }}>
                          <Mono size={9} style={{ marginBottom: 4 }}>{d.count > 0 ? d.count : ""}</Mono>
                          {d.count === 0 ? (
                            <span style={{ width: 4, height: 4, borderRadius: "50%", background: d.isToday ? "var(--live)" : "var(--ink-3)", marginBottom: 0 }} />
                          ) : (
                            <div style={{
                              width: "70%", height: h,
                              background: d.isToday ? "var(--live)" : "var(--ink)",
                              transition: reducedMotion ? undefined : "height 0.6s ease",
                              boxShadow: d.isToday && !reducedMotion ? "0 0 0 0 var(--live)" : undefined,
                              animation: d.isToday && !reducedMotion ? "brief-pulse 2.2s ease-in-out infinite" : undefined,
                            }} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginTop: 6 }}>
                    {days.map((d, i) => (
                      <div key={i} style={{ textAlign: "center" }}>
                        <Mono size={9}>{i === 6 ? "Today" : d.label}</Mono>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, flexWrap: "wrap", gap: 8 }}>
                    <Mono size={10}>Capture anything you read — 30 seconds</Mono>
                    {rhythm.data.streak >= 2 && (
                      <Mono color="var(--action)" size={10}>{rhythm.data.streak}-day streak</Mono>
                    )}
                  </div>
                </div>
              );
            })()
          )}
        </div>

        {/* RIGHT — Proof, briefly */}
        <aside style={{ borderInlineStart: "1px solid var(--rule)", paddingInlineStart: 26 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Mono color="var(--spot)">PROOF, BRIEFLY</Mono>
            <InfoTooltip label="Proof" triggerSize={12}
              text="One headline from your Statement — the page that measures who your work actually reached."
              side="top"
            />
          </div>
          {proof.status === "loading" && <SkeletonLine width="100%" height={80} />}
          {proof.status === "error" && <ErrorLine what="proof" onRetry={loadProof} />}
          {proof.status === "ready" && (
            returnRatio != null ? (
              <>
                <div style={{ fontFamily: "var(--font-serif)", fontSize: 48, color: "var(--ink)", lineHeight: 1, letterSpacing: "-0.02em" }}>
                  {returnRatio.toFixed(1)}×
                </div>
                <p style={{ margin: "8px 0 12px", fontSize: 14, lineHeight: 1.5, color: "var(--ink-2)" }}>
                  readers returned to your work this year.
                </p>
              </>
            ) : (
              <p style={{ margin: "0 0 12px", fontSize: 14, lineHeight: 1.5, color: "var(--ink-2)" }}>
                {proof.data.entriesTotal} captures · {proof.data.fragments} fragments from {proof.data.institutions} institution{proof.data.institutions === 1 ? "" : "s"}.
              </p>
            )
          )}
          <button type="button" onClick={() => onSwitchTab?.("influence")}
            style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer" }}>
            <Mono color="var(--action)" size={11}>Open your Statement →</Mono>
          </button>
        </aside>
      </section>

      {/* 6. FOOTER ────────────────────────────────────── */}
      <footer style={{
        borderTop: "2px solid var(--ink)", paddingTop: 20, marginTop: 30,
        display: "flex", flexDirection: "column", gap: 10,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 14, color: "var(--ink-2)" }}>
            Aura · Your expertise is invisible. Aura fixes that.
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {imprint.status === "ready" && imprint.data.imprint != null && tierInfo.currentTier && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Mono>IMPRINT {imprint.data.imprint} · {tierInfo.currentTier.name.toUpperCase()}</Mono>
                <TierExplainer tierKey={tierInfo.currentTier.key} tierName={tierInfo.currentTier.name} side="top" triggerSize={12} />
              </span>
            )}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Mono>NEXT SWEEP · 06:50</Mono>
              <InfoTooltip label="Next sweep" triggerSize={12}
                text="Every morning Aura re-reads your sources, refreshes your signals, and reprints your Imprint."
                side="top" />
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
          <a href="/guide"   style={{ textDecoration: "none" }}><Mono>Guide</Mono></a>
          <a href="/privacy" style={{ textDecoration: "none" }}><Mono>Privacy</Mono></a>
          <a href="/terms"   style={{ textDecoration: "none" }}><Mono>Terms</Mono></a>
          <a href="mailto:hello@aura-intel.org" style={{ textDecoration: "none" }}><Mono>Contact</Mono></a>
        </div>
      </footer>

      </div>

      <style>{`
        @keyframes brief-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(21,119,106,0.35); }
          50%       { box-shadow: 0 0 0 6px rgba(21,119,106,0); }
        }
        .brief-cta:focus-visible,
        .brief-row:focus-visible,
        button:focus-visible {
          outline: 2px solid var(--spot);
          outline-offset: 3px;
        }
        [lang="ar"] .brief-cta, [dir="rtl"] .brief-cta { font-family: var(--font-arabic); }
        @media (max-width: 960px) {
          .brief-lead, .brief-moved, .brief-rhythm { grid-template-columns: 1fr !important; }
          .brief-ledger, .brief-moved > aside, .brief-rhythm > aside {
            border-inline-start: none !important;
            padding-inline-start: 0 !important;
            border-top: 1px solid var(--rule);
            padding-top: 20px;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .brief-page * { animation: none !important; transition: none !important; }
        }
      `}</style>
    </motion.div>
  );
}