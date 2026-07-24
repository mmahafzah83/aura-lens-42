import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import useTierFromImprint, { TIER_BANDS } from "@/hooks/useTierFromImprint";
import TierExplainer from "@/components/ui/TierExplainer";
import InfoTooltip from "@/components/ui/InfoTooltip";
import { FORCES, HEADERS } from "@/constants/language";
import { track } from "@/lib/track";
import AgentFindingCard from "@/components/AgentFindingCard";

/**
 * Brief — Editorial Broadsheet (System-A tokens).
 * Surface rebuild atop the existing data architecture. All loaders, the
 * publishedSignalsRef gate, capture-complete listener, and the live realtime
 * channel are preserved. Tier ONLY from useTierFromImprint.
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
  onInvite?: () => void;
  onOpenBrandAssessment?: () => void;
  onOpenSignal?: (signalId: string) => void;
  onDraftToStudio?: (prefill: {
    topic: string;
    context: string;
    sourceType?: string;
    sourceTitle?: string;
    contentFormat?: "post" | "carousel" | "framework_summary";
    signalId?: string;
    signalTitle?: string;
    source?: string;
    moveState?: "untouched" | "opened" | "drafted" | "stale_draft" | "evolution";
  }) => void;
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
  impressions: number | null;
  reactions: number | null;
  linkedinUrl: string | null;
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

export default function Brief({ onOpenDraft, onSwitchTab, onOpenCapture, onInvite, onOpenBrandAssessment, onOpenSignal, onDraftToStudio }: BriefProps) {
  const { user, isReady } = useAuthReady();
  const tierInfo = useTierFromImprint(user?.id ?? null);
  const reducedMotion = useMemo(prefersReducedMotion, []);

  const [profile, setProfile] = useState<{
    firstName: string;
    sectorFocus: string;
    brandAssessment: Record<string, any> | null;
    brandPillars: string[];
  } | null>(null);
  const publishedSignalsRef = useRef<Map<string, string | null> | null>(null);
  const [publishedMap, setPublishedMap] = useState<Map<string, string | null>>(new Map());

  const loadPublishedSignalIds = useCallback(async (): Promise<Map<string, string | null>> => {
    if (publishedSignalsRef.current) return publishedSignalsRef.current;
    if (!user) { publishedSignalsRef.current = new Map(); setPublishedMap(publishedSignalsRef.current); return publishedSignalsRef.current; }
    try {
      const { data } = await (supabase.from("linkedin_posts" as any) as any)
        .select("source_signal_id, published_at, tracking_status")
        .eq("user_id", user.id)
        .not("source_signal_id", "is", null);
      const rows = (data || []) as Array<{ source_signal_id: string | null; published_at: string | null; tracking_status: string | null }>;
      const map = new Map<string, string | null>();
      for (const r of rows) {
        if (!r.source_signal_id) continue;
        if (r.published_at != null || r.tracking_status === "published") {
          const prev = map.get(r.source_signal_id);
          // Keep the newest published_at if multiple rows exist for the same signal.
          if (prev === undefined || (r.published_at && (!prev || r.published_at > prev))) {
            map.set(r.source_signal_id, r.published_at);
          }
        }
      }
      publishedSignalsRef.current = map;
      setPublishedMap(map);
      return map;
    } catch {
      publishedSignalsRef.current = new Map();
      setPublishedMap(publishedSignalsRef.current);
      return publishedSignalsRef.current;
    }
  }, [user]);

  // Per-signal state map: which top signals have a draft or have been opened.
  interface SignalState {
    draft?: BriefDraft;
    draftCreatedAt?: string;
    openedAt?: string;
    evidenceDelta?: number;
    evidenceSummaries?: string[];
  }
  const [signalStates, setSignalStates] = useState<Map<string, SignalState>>(new Map());

  const loadSignalStates = useCallback(async () => {
    if (!user) { setSignalStates(new Map()); return; }
    try {
      const [ciRes, lpRes, engRes] = await Promise.all([
        supabase.from("content_items")
          .select("id, type, body, language, generation_params, created_at")
          .eq("user_id", user.id).eq("status", "draft"),
        (supabase.from("linkedin_posts" as any) as any)
          .select("id, post_text, source_signal_id, created_at, tracking_status")
          .eq("user_id", user.id).eq("tracking_status", "draft").not("source_signal_id", "is", null),
        (supabase.from("signal_engagements" as any) as any)
          .select("signal_id, last_opened_at").eq("user_id", user.id),
      ]);
      const map = new Map<string, SignalState>();
      const consider = (sid: string, draft: BriefDraft, createdAt: string | null) => {
        if (!sid) return;
        const existing = map.get(sid) || {};
        if (!existing.draftCreatedAt || (createdAt && createdAt > existing.draftCreatedAt)) {
          existing.draft = draft;
          existing.draftCreatedAt = createdAt || existing.draftCreatedAt;
        }
        map.set(sid, existing);
      };
      for (const r of ((ciRes?.data || []) as any[])) {
        const sid = r?.generation_params?.source_signal_id;
        if (typeof sid !== "string" || !sid) continue;
        const lang: "en" | "ar" = r.language === "ar" ? "ar" : "en";
        const type: BriefDraft["type"] = r.type === "carousel" ? "carousel" : r.type === "framework" ? "framework" : "linkedin_post";
        consider(sid, {
          id: r.id, body: r.body || "", language: lang, type,
          topic: r?.generation_params?.topic ?? null, _source: "content_items",
        }, r.created_at ?? null);
      }
      for (const r of ((lpRes?.data || []) as any[])) {
        const sid = r.source_signal_id as string | null;
        if (!sid) continue;
        consider(sid, {
          id: r.id, body: r.post_text || "", language: "en", type: "linkedin_post",
          topic: null, _source: "linkedin_posts",
        }, r.created_at ?? null);
      }
      for (const r of ((engRes?.data || []) as any[])) {
        const sid = r.signal_id as string | null;
        if (!sid) continue;
        const existing = map.get(sid) || {};
        existing.openedAt = r.last_opened_at ?? undefined;
        map.set(sid, existing);
      }

      // Evidence delta for published signals only — one batched pair of queries.
      const publishedEntries = Array.from(publishedMap.entries()).filter(
        ([, at]) => !!at
      ) as Array<[string, string]>;
      if (publishedEntries.length > 0) {
        const publishedIds = publishedEntries.map(([id]) => id);
        const sigRes = await (supabase.from("strategic_signals" as any) as any)
          .select("id, supporting_evidence_ids")
          .eq("user_id", user.id)
          .in("id", publishedIds);
        const sigRows = (sigRes?.data || []) as Array<{ id: string; supporting_evidence_ids: string[] | null }>;
        const fragToSignals = new Map<string, string[]>();
        const allFragIds: string[] = [];
        for (const s of sigRows) {
          const ids = Array.isArray(s.supporting_evidence_ids) ? s.supporting_evidence_ids : [];
          for (const fid of ids) {
            if (!fid) continue;
            allFragIds.push(fid);
            const arr = fragToSignals.get(fid) || [];
            arr.push(s.id);
            fragToSignals.set(fid, arr);
          }
        }
        if (allFragIds.length > 0) {
          const fragRes = await supabase.from("evidence_fragments")
            .select("id, title, content, created_at, source_registry_id")
            .eq("user_id", user.id)
            .in("id", Array.from(new Set(allFragIds)));
          const fragRows = ((fragRes?.data || []) as Array<{ id: string; title: string | null; content: string | null; created_at: string; source_registry_id: string | null }>)
            .slice()
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          const publishedAtById = new Map(publishedEntries);
          const deltaSources = new Map<string, Set<string>>();
          const deltaSummaries = new Map<string, string[]>();
          for (const f of fragRows) {
            const linkedSignals = fragToSignals.get(f.id) || [];
            for (const sid of linkedSignals) {
              const pAt = publishedAtById.get(sid);
              if (!pAt) continue;
              if (new Date(f.created_at).getTime() > new Date(pAt).getTime()) {
                // Count DISTINCT source_registry_id per signal. Fragments with a
                // null registry each count once (keyed by fragment id).
                const sourceKey = f.source_registry_id || `frag:${f.id}`;
                const set = deltaSources.get(sid) || new Set<string>();
                set.add(sourceKey);
                deltaSources.set(sid, set);
                const summary = (f.title || f.content || "").toString().trim();
                if (summary) {
                  const arr = deltaSummaries.get(sid) || [];
                  // Keep at most the 5 most recent summaries (rows are pre-sorted desc).
                  if (arr.length < 5) arr.push(summary.slice(0, 240));
                  deltaSummaries.set(sid, arr);
                }
              }
            }
          }
          for (const [sid, sources] of deltaSources) {
            const existing = map.get(sid) || {};
            existing.evidenceDelta = sources.size;
            existing.evidenceSummaries = deltaSummaries.get(sid) || [];
            map.set(sid, existing);
          }
        }
      }

      setSignalStates(map);
    } catch (e) {
      console.warn("[Brief] signal states load failed", e);
      setSignalStates(new Map());
    }
  }, [user, publishedMap]);

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
  const openedRowsKey = user?.id ? `aura-brief-opened-${user.id}` : null;
  const [openedRows, setOpenedRows] = useState<Set<string>>(new Set());

  // Hydrate opened ids from localStorage on mount / user change.
  useEffect(() => {
    if (!openedRowsKey) { setOpenedRows(new Set()); return; }
    try {
      const raw = localStorage.getItem(openedRowsKey);
      if (!raw) { setOpenedRows(new Set()); return; }
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) setOpenedRows(new Set(arr.filter((v) => typeof v === "string")));
    } catch { /* corrupt payload — start fresh */ }
  }, [openedRowsKey]);

  const markRowOpened = useCallback((signalId: string) => {
    if (user) {
      try {
        void (supabase as any).rpc("bump_signal_engagement", { p_signal_id: signalId });
      } catch { /* fire-and-forget — must not block row interaction */ }
    }
    setOpenedRows(prev => {
      if (prev.has(signalId)) return prev;
      const next = new Set(prev);
      next.add(signalId);
      if (openedRowsKey) {
        try {
          // Cap at 200 most recent — drop the oldest ids first.
          const arr = Array.from(next);
          const trimmed = arr.slice(Math.max(0, arr.length - 200));
          localStorage.setItem(openedRowsKey, JSON.stringify(trimmed));
        } catch { /* quota / privacy mode — count still lives in memory */ }
      }
      return next;
    });
  }, [openedRowsKey]);

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
      if (!cancelled) setProfile({ firstName: "", sectorFocus: "", brandAssessment: null, brandPillars: [] });
      return;
    }
    (async () => {
      try {
        const { data } = await supabase
          .from("diagnostic_profiles").select("first_name, sector_focus, brand_assessment_results, brand_pillars")
          .eq("user_id", user.id).maybeSingle();
        if (cancelled) return;
        const first = (data?.first_name || fallbackName() || "").toString().trim();
        const bar = (data as any)?.brand_assessment_results;
        const brandAssessment = bar && typeof bar === "object" && Object.keys(bar).length > 0 ? bar : null;
        const bpRaw = (data as any)?.brand_pillars;
        const brandPillars = Array.isArray(bpRaw)
          ? bpRaw.map((v: any) => (typeof v === "string" ? v.trim() : "")).filter(Boolean)
          : [];
        setProfile({
          firstName: first,
          sectorFocus: (data?.sector_focus || "").toString().trim(),
          brandAssessment,
          brandPillars,
        });
      } catch {
        if (!cancelled) setProfile({ firstName: fallbackName(), sectorFocus: "", brandAssessment: null, brandPillars: [] });
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
      const stillWorthSurfacing = (r: any) => {
        const publishedAt = publishedSet.get(r.id);
        if (publishedAt === undefined) return true;        // never published
        if (!publishedAt || !r.last_evidence_at) return false;
        return new Date(r.last_evidence_at).getTime() > new Date(publishedAt).getTime();
      };
      let signals: AwaySignalRow[] = sigRows
        .filter(stillWorthSurfacing)
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
        const filtered = radarRows.filter(stillWorthSurfacing).slice(0, 3);
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
        .select("id, published_at, source_metadata, linkedin_url")
        .eq("user_id", user.id)
        .not("published_at", "is", null)
        .gte("published_at", since)
        .order("published_at", { ascending: false })
        .limit(1);
      const row = (data || [])[0];
      if (!row) { setPublished(null); return; }
      const meta = (row.source_metadata || {}) as any;
      const topicRaw = (meta.topic || (Array.isArray(meta.signal_titles) ? meta.signal_titles[0] : "") || "").toString().trim();
      const topic = topicRaw ? (topicRaw.length > 60 ? topicRaw.slice(0, 58).trim() + "\u2026" : topicRaw) : null;
      let impressions: number | null = null;
      let reactions: number | null = null;
      try {
        const { data: m } = await (supabase.from("linkedin_post_metrics" as any) as any)
          .select("impressions, reactions, snapshot_date")
          .eq("post_id", row.id)
          .order("snapshot_date", { ascending: false })
          .limit(1);
        const mr = (m || [])[0];
        if (mr) {
          impressions = typeof mr.impressions === "number" ? mr.impressions : null;
          reactions = typeof mr.reactions === "number" ? mr.reactions : null;
        }
      } catch { /* metrics optional — LinkedIn lags 1-2 days */ }
      const rawUrl = (row as any).linkedin_url;
      const linkedinUrl = typeof rawUrl === "string" && /^https?:\/\//i.test(rawUrl) ? rawUrl : null;
      setPublished({ publishedAt: row.published_at ?? null, topic, impressions, reactions, linkedinUrl });
    } catch (e) { console.warn("[Brief] published load failed", e); setPublished(null); }
  }, [user]);

  useEffect(() => {
    if (!isReady) return;
    void loadImprint(); void loadAway(); void loadDraft(); void loadDiscernment(); void loadProof(); void loadRhythm(); void loadPublished(); void loadSignalStates();
    return () => {
      try { localStorage.setItem(LAST_VISIT_KEY, new Date().toISOString()); } catch { /* noop */ }
    };
  }, [isReady, loadImprint, loadAway, loadDraft, loadDiscernment, loadProof, loadRhythm, loadPublished, loadSignalStates]);

  useEffect(() => {
    if (!user?.id) return;
    const handler = () => {
      publishedSignalsRef.current = null;
      void loadImprint(); void loadAway(); void loadDraft(); void loadDiscernment(); void loadProof(); void loadRhythm(); void loadPublished(); void loadSignalStates();
    };
    window.addEventListener("capture-complete", handler);
    return () => window.removeEventListener("capture-complete", handler);
  }, [user?.id, loadImprint, loadAway, loadDraft, loadDiscernment, loadProof, loadRhythm, loadPublished, loadSignalStates]);

  useEffect(() => {
    if (!user?.id) return;
    const uid = user.id;
    const refreshAll = () => {
      publishedSignalsRef.current = null;
      void loadImprint(); void loadAway(); void loadDraft(); void loadDiscernment(); void loadProof(); void loadRhythm(); void loadPublished(); void loadSignalStates();
    };
    const ch = supabase.channel(`brief-live-${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "entries",            filter: `user_id=eq.${uid}` }, refreshAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "documents",          filter: `user_id=eq.${uid}` }, refreshAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "strategic_signals",  filter: `user_id=eq.${uid}` }, refreshAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "imprint_snapshots",  filter: `user_id=eq.${uid}` }, refreshAll)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, loadImprint, loadAway, loadDraft, loadDiscernment, loadProof, loadRhythm, loadPublished, loadSignalStates]);

  // ── Derivations ─────────────────────────────────────────────────────

  const firstName = profile?.firstName || "";

  const topSignal = away.status === "ready" && away.data.signals.length > 0 ? away.data.signals[0] : null;
  const draft = draftState.status === "ready" ? draftState.data.draft : null;

  // activation_first_signal — fire at most ONCE per user, the first time a
  // topSignal renders and no prior activation_first_signal event exists.
  const firstSignalFiredRef = useRef(false);
  useEffect(() => {
    if (!user?.id || !topSignal || firstSignalFiredRef.current) return;
    const flagKey = `aura_activation_first_signal:${user.id}`;
    try { if (localStorage.getItem(flagKey)) { firstSignalFiredRef.current = true; return; } } catch { /* noop */ }
    firstSignalFiredRef.current = true;
    (async () => {
      try {
        const { data: existing } = await (supabase.from("product_events" as any) as any)
          .select("id")
          .eq("user_id", user.id)
          .eq("event", "activation_first_signal")
          .limit(1);
        if (Array.isArray(existing) && existing.length > 0) {
          try { localStorage.setItem(flagKey, "1"); } catch { /* noop */ }
          return;
        }
        // Detect backfill: if the first signal predates the earliest
        // product_events row for this user, days_since_signup would be a
        // false number. In that case omit it and mark backfill=true.
        const [firstEventRes, signalRes] = await Promise.all([
          (supabase.from("product_events" as any) as any)
            .select("created_at")
            .eq("user_id", user.id)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle(),
          (supabase.from("strategic_signals" as any) as any)
            .select("created_at")
            .eq("id", topSignal.id)
            .maybeSingle(),
        ]);
        const firstEventAt = firstEventRes?.data?.created_at
          ? new Date(firstEventRes.data.created_at).getTime() : null;
        const signalCreatedAt = signalRes?.data?.created_at
          ? new Date(signalRes.data.created_at).getTime() : null;
        const isBackfill = !!(firstEventAt && signalCreatedAt && signalCreatedAt < firstEventAt);

        const capturesToReach = proof.status === "ready" ? proof.data.entriesTotal : null;
        const props: Record<string, unknown> = { captures_to_reach: capturesToReach };
        if (isBackfill) {
          props.backfill = true;
        } else {
          const createdAt = (user as any)?.created_at;
          props.days_since_signup = createdAt
            ? Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000))
            : null;
        }
        await track("activation_first_signal", props);
        try { localStorage.setItem(flagKey, "1"); } catch { /* noop */ }
      } catch { /* silent — tracking never breaks UI */ }
    })();
  }, [user?.id, topSignal, proof]);

  // Strategic Read data — surfaces the assessment output when the user has
  // not yet published anything. Values come straight from the profile loader.
  const brandAssessment = profile?.brandAssessment ?? null;
  const brandPillars = profile?.brandPillars ?? [];
  const hasStrategicRead = !!brandAssessment && !published;

  // Prime-read: user is past onboarding but has no Brand Assessment yet.
  // Without a Read, nothing else on home matters — funnel to the assessment.
  const canPrimeRead = !!onOpenBrandAssessment && !!profile?.firstName && !brandAssessment;

  // Scenario for the lead spread
  type Scenario = "prime_read" | "published" | "new" | "away" | "read" | "draft" | "standing";
  const scenario: Scenario = useMemo(() => {
    if (canPrimeRead) return "prime_read";
    if (published) return "published";
    if (awayDays >= 4) return "away";
    if (hasStrategicRead) return "read";
    const isNew = (proof.status === "ready" && proof.data.dayN === 1) ||
      (imprint.status === "ready" && imprint.data.imprint == null && proof.status === "ready" && proof.data.entriesTotal === 0);
    if (isNew) return "new";
    if (draft) return "draft";
    return "standing";
  }, [published, proof, imprint, awayDays, draft, hasStrategicRead, canPrimeRead]);

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
      case "prime_read":
        return {
          slug: "START HERE —",
          headline: "Aura can't read you yet. The assessment changes that.",
          standfirst: "Five minutes turns what you already know into a read of how the market sees you, and the space only you own. Everything else here builds on it, so do this one first.",
        };
      case "published": {
        const topic = published?.topic || null;
        const imp = published?.impressions ?? null;
        const rx = published?.reactions ?? null;
        if (imp != null && imp > 0) {
          return {
            slug: "TRACKING —",
            headline: topic ? `Your post on ${topic} is live. ${imp} readers so far.` : `Your latest post is live. ${imp} readers so far.`,
            standfirst: `${rx != null && rx > 0 ? `${rx} reactions in already. ` : ""}The conversation is happening on LinkedIn — ten minutes replying there now is what keeps it moving. I will keep an eye on the numbers for you.`,
          };
        }
        return {
          slug: "TRACKING —",
          headline: topic ? `Your post on ${topic} is live.` : "Your latest post is live.",
          standfirst: "The numbers usually start landing within a day. The conversation is happening on LinkedIn — ten minutes replying there now is what keeps it moving. I will surface the reach here the moment it syncs.",
        };
      }
      case "new":
        return {
          slug: "DAY ONE —",
          headline: "Nothing here is yours yet. Your first capture changes that.",
          standfirst: "Save one thing you read this week, and tomorrow morning you will see the first read of where your expertise stands. Pick something you would argue with — a strong opinion makes the sharpest signal.",
        };
      case "away":
        return {
          slug: "WHILE YOU WERE OUT —",
          headline: `${awayDays} days away. Here is what moved without you.`,
          standfirst: "The signals below shifted while you were quiet. Do not try to read all of them — pick the one you would have the strongest take on and turn it into a paragraph.",
        };
      case "read": {
        const ba: any = brandAssessment || {};
        const firstSentence = (s: string) => {
          const t = (s || "").toString().trim();
          if (!t) return "";
          const m = t.match(/^[^.!?]+[.!?]/);
          return (m ? m[0] : t).trim();
        };
        const posRaw = (ba.positioning_statement || "").toString().trim();
        const mrRaw = (ba.market_read || "").toString().trim();
        const headline = firstSentence(posRaw) || firstSentence(mrRaw) || "Your read is on the page.";
        const honest = (ba.honest_truth || "").toString().trim();
        const space = (ba.uncontested_space || "").toString().trim();
        const standfirst = [honest, space].filter(Boolean).join(" ") ||
          "There is a gap between how you read the market and how the market has heard you. Your first post is where you start closing it.";
        return { slug: "YOUR STRATEGIC READ —", headline, standfirst };
      }
      case "draft": {
        const t = (draft?.topic || "").toString().trim();
        const shortT = t ? (t.length > 46 ? t.slice(0, 44).trim() + "\u2026" : t) : "";
        return {
          slug: "THIS WEEK —",
          headline: shortT ? `The market is moving on ${shortT}. Your draft already has the first word.` : "The market is moving on your theme, and your draft already has the first word.",
          standfirst: "It is written and it is in your voice. Ten minutes of edits and it is in the feed while the theme is still warm.",
        };
      }
      default: {
        const s  = imprint.status === "ready" ? imprint.data.signalScore  : null;
        const c  = imprint.status === "ready" ? imprint.data.contentScore : null;
        const dI = discernment.status === "ready" ? discernment.data : null;
        const headline = topSignal
          ? "You are seeing this more clearly than you have said it."
          : (s != null && c != null) ? "You are reading the market faster than you are speaking to it." : "Your read is still taking shape.";
        const standfirst = (dI && dI.postsWithSignal != null && dI.published120d != null && s != null && c != null)
          ? `Reading sits at ${s}, voice at ${c}. Only ${dI.postsWithSignal} of your last ${dI.published120d} posts came from something you captured; the rest were off the top of your head. Your next one lands harder pulled from a signal below.`
          : (s != null && c != null)
            ? `Reading ${s}, voice ${c}. The distance between them is where your next post lives — pull it from a signal below.`
            : "Reading and voice are still forming. Your next capture is what starts moving them.";
        return { slug: "THE WIRE —", headline, standfirst };
      }
    }
  }, [scenario, awayDays, imprint, discernment, topSignal, brandAssessment, published, draft]);

  // ── Next Move ladder ────────────────────────────────────────────────
  const nextMove = useMemo(() => {
    const zeroCaptures7 = rhythm.status === "ready" && rhythm.data.totalCaptures === 0;
    if (scenario === "prime_read") return {
      body: "Unlock your Strategic Read.",
      cta: "Take the Brand Assessment",
      onClick: () => onOpenBrandAssessment?.(),
      voiceScore: null,
    };
    if (draft) return {
      body: "Your draft is one decision from published.",
      cta: "Open the draft",
      onClick: () => onOpenDraft(draft),
      voiceScore: draftState.status === "ready" ? draftState.data.voiceScore : null,
    };
    if (scenario === "read") {
      const ba: any = brandAssessment || {};
      const cpRaw = ba.content_pillars;
      const contentPillars: string[] = Array.isArray(cpRaw)
        ? cpRaw.map((v: any) => (typeof v === "string" ? v.trim() : "")).filter(Boolean)
        : typeof cpRaw === "string" && cpRaw.trim() ? [cpRaw.trim()] : [];
      const pillar = ((brandPillars[0] || contentPillars[0]) || "").toString().trim();
      if (pillar) {
        const shortPillar = pillar.length > 40 ? pillar.slice(0, 38).trim() + "\u2026" : pillar;
        const raw = `Turn "${shortPillar}" into your first post.`;
        const body = raw.length > 68 ? raw.slice(0, 66).trim() + "\u2026" : raw;
        const space = (ba.uncontested_space || "").toString().trim();
        const marketRead = (ba.market_read || "").toString().trim();
        const voiceSig = (ba.voice_signature || "").toString().trim();
        const parts: string[] = [];
        const opener = space || marketRead;
        if (opener) parts.push(opener.replace(/\.\s*$/, "") + ".");
        parts.push(`Angle: ${pillar}.`);
        if (voiceSig) parts.push(`Write in the author's own voice — ${voiceSig}.`);
        const context = parts.join(" ");
        return {
          body,
          cta: "Write your first piece",
          onClick: () => onDraftToStudio?.({
            topic: pillar,
            context,
            sourceType: "strategic_read",
            sourceTitle: pillar,
            contentFormat: "post",
          }),
          voiceScore: null,
        };
      }
      // no pillars anywhere → fall through to capture CTA below
    }
    if (topSignal) {
      const title = topSignal.title.length > 68 ? topSignal.title.slice(0, 66) + "\u2026" : topSignal.title;
      const state = signalStates.get(topSignal.id);
      const publishedAt = publishedMap.get(topSignal.id) ?? null;

      const openFromSignal = async () => {
        if (user) {
          try {
            await (supabase as any).rpc("bump_signal_engagement", { p_signal_id: topSignal.id });
          } catch { /* fire-and-forget — must not block navigation */ }
        }
        // Move-state at open-time: has a draft (fresh vs stale), has been opened, or untouched.
        const _state = signalStates.get(topSignal.id);
        const _draftDays = _state?.draft && _state.draftCreatedAt
          ? Math.floor((Date.now() - new Date(_state.draftCreatedAt).getTime()) / 86400000)
          : null;
        const moveState: "untouched" | "opened" | "drafted" | "stale_draft" =
          _state?.draft ? (_draftDays !== null && _draftDays >= 7 ? "stale_draft" : "drafted")
          : _state?.openedAt ? "opened"
          : "untouched";
        onDraftToStudio?.({
          topic: topSignal.title,
          context: [topSignal.what, topSignal.explanation].filter(Boolean).join("\n\n"),
          signalId: topSignal.id,
          signalTitle: topSignal.title,
          sourceType: "signal",
          sourceTitle: topSignal.title,
          contentFormat: "post",
          source: "brief",
          moveState,
        });
      };

      // PUBLISHED + new evidence since you wrote it
      if (publishedAt && topSignal.lastEvidenceAt &&
          new Date(topSignal.lastEvidenceAt).getTime() > new Date(publishedAt).getTime()) {
        const delta = state?.evidenceDelta ?? 0;
        const summaries = state?.evidenceSummaries ?? [];
        const body =
          delta >= 5 ? `5+ new readings landed on ${title} since you wrote it.`
          : delta >= 2 ? `${delta} new readings landed on ${title} since you wrote it.`
          : delta === 1 ? `Something new landed on ${title} since you wrote it.`
          : `${title} has moved since you wrote it.`;
        const baseContext = [topSignal.what, topSignal.explanation].filter(Boolean).join("\n\n");
        const publishedDate = new Date(publishedAt).toISOString().slice(0, 10);
        const deltaBlock = summaries.length > 0
          ? summaries.map((s, i) => `${i + 1}. ${s}`).join("\n")
          : "(new evidence available since publication)";
        const updateContext =
          `UPDATE POST — the author already published on this signal on ${publishedDate}. ` +
          `Do not restate the original argument. Frame this as what changed since:\n${deltaBlock}\n\n` +
          baseContext;
        return {
          body,
          cta: "Write the update",
          onClick: () => onDraftToStudio?.({
            topic: topSignal.title,
            context: updateContext,
            signalId: topSignal.id,
            signalTitle: topSignal.title,
            sourceType: "signal_evolution",
            sourceTitle: topSignal.title,
            contentFormat: "post",
            source: "brief",
            moveState: "evolution",
          }),
          voiceScore: null,
        };
      }

      // DRAFTED
      if (state?.draft) {
        const days = state.draftCreatedAt
          ? Math.max(0, Math.floor((Date.now() - new Date(state.draftCreatedAt).getTime()) / 86400000))
          : 0;
        if (days >= 7) {
          return {
            body: `${title} has been written for ${days} days.`,
            cta: "Publish it",
            onClick: () => onOpenDraft(state.draft!),
            voiceScore: null,
          };
        }
        return {
          body: `${title} is written. One decision from published.`,
          cta: "Open the draft",
          onClick: () => onOpenDraft(state.draft!),
          voiceScore: null,
        };
      }

      // OPENED, no draft
      if (state?.openedAt) {
        return {
          body: `You started on ${title}. Pick it back up.`,
          cta: "Continue",
          onClick: openFromSignal,
          voiceScore: null,
        };
      }

      // UNTOUCHED
      return {
        body: `Speak on ${title} while it's still forming.`,
        cta: "Write from this signal",
        onClick: openFromSignal,
        voiceScore: null,
      };
    }
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
  }, [draft, topSignal, rhythm, draftState, onOpenDraft, onSwitchTab, onOpenCapture, onOpenBrandAssessment, onDraftToStudio, scenario, brandPillars, brandAssessment, signalStates, user, publishedMap]);

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      transition={{ duration: 0.24, ease: [0.32, 0.72, 0.35, 1] }}
      className="brief-page"
      style={{
        backgroundColor: "var(--paper)", color: "var(--ink)",
        fontFamily: "var(--font-body)", fontSize: 17, lineHeight: 1.6,
        padding: "6px 0 60px", minHeight: "100vh",
      }}
      aria-label="Your Brief"
    >
      <div className="brief-inner" style={{ maxWidth: "none", margin: "0 auto", padding: 0 }}>

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

      {/* Overnight finding — first block under the masthead. Renders only when
          the user has a pending finding; shows one at a time, never a stack. */}
      <AgentFindingCard userId={user?.id ?? null} />

      {/* 2. LEAD SPREAD ────────────────────────────────────── */}
      <section className="brief-lead" style={{
        display: "grid", gridTemplateColumns: "1fr 310px", gap: 40, marginBottom: 48,
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
              color: "var(--spot)", textTransform: "uppercase", flexShrink: 0,
            }}>{leadCopy.slug}</span>
          </p>
          <h1 dir="auto" style={{
            fontFamily: "var(--font-serif)", fontWeight: 400,
            fontSize: "clamp(2rem, 4.6vw, 3.2rem)", lineHeight: 1.08,
            letterSpacing: "-0.015em", color: "var(--ink)", margin: "8px 0 16px 0",
          }}>{leadCopy.headline}</h1>
          {scenario === "published" && published?.linkedinUrl && (
            <div style={{ margin: "-8px 0 12px 0" }}>
              <a
                href={published.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: "none" }}
              >
                <Mono color="var(--action)" size={11}>Open the post on LinkedIn →</Mono>
              </a>
            </div>
          )}
          <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6, color: "var(--ink-2)" }}>
            {leadCopy.standfirst}
          </p>
          {scenario === "read" && (
            <p style={{
              margin: "10px 0 0 0", fontFamily: "var(--font-serif)", fontStyle: "italic",
              fontSize: 14, color: "var(--ink-2)", lineHeight: 1.55,
            }}>
              This is your starting read. It sharpens every time you capture something.
            </p>
          )}
          <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 8 }}>
            <Mono>FROM AURA — YOUR CHIEF OF STAFF</Mono>
            <InfoTooltip
              label="Byline"
              triggerSize={13}
              text="Aura tailors this to where you are right now: what you have published, your open drafts, your live signals, and how long you have been away."
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
          {imprint.status === "ready" && imprint.data.imprint == null && (() => {
            const ba: any = scenario === "read" ? (brandAssessment || {}) : {};
            const barrier = (ba.key_barrier || "").toString().trim();
            const investRaw = (ba as any).invest_next;
            const firstInvest = Array.isArray(investRaw) ? investRaw[0] : investRaw;
            const invest = (typeof firstInvest === "string"
              ? firstInvest
              : (firstInvest && typeof firstInvest === "object"
                  ? (firstInvest.area || firstInvest.title || firstInvest.name || "")
                  : "")
            ).toString().trim();
            const useGap = scenario === "read" && barrier && invest;
            if (useGap) {
              return (
                <div>
                  <Mono color="var(--spot)">THE GAP</Mono>
                  <p style={{
                    marginTop: 10, fontFamily: "var(--font-serif)", fontSize: 18,
                    color: "var(--ink)", lineHeight: 1.4,
                  }}>{barrier}</p>
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--rule)" }}>
                    <Mono size={10}>NEXT MOVE — {invest.toUpperCase()}</Mono>
                  </div>
                </div>
              );
            }
            return (
              <div>
                <div style={{ fontFamily: "var(--font-serif)", fontSize: 48, color: "var(--ink-3)", lineHeight: 1 }}>· · ·</div>
                <div style={{ marginTop: 8 }}><Mono color="var(--spot)">FORMING</Mono></div>
                <p style={{ marginTop: 10, fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 14, color: "var(--ink-2)", lineHeight: 1.55 }}>
                  Your first Imprint prints minutes after your first capture — then fresh every morning.
                </p>
              </div>
            );
          })()}
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
                    <div>
                      <Mono size={9} style={{ display: "block", marginBottom: 4 }}>LAST {d.spark.length} SNAPSHOTS</Mono>
                      <svg viewBox="0 0 120 36" width="100%" height={36} preserveAspectRatio="none" style={{ display: "block" }} aria-label="Imprint over recent snapshots">
                        {(() => {
                          const vs = d.spark;
                          const min = Math.min(...vs);
                          const max = Math.max(...vs);
                          const range = Math.max(1, max - min);
                          const pts = vs.map((v, i) => {
                            const x = (i / (vs.length - 1)) * 120;
                            const y = 34 - ((v - min) / range) * 32;
                            return `${x.toFixed(1)},${y.toFixed(1)}`;
                          }).join(" ");
                          return (
                            <>
                              <line x1="0" y1="29" x2="120" y2="29" stroke="var(--rule)" strokeWidth="0.75" />
                              <polyline points={pts} fill="none" stroke="var(--ink-2)" strokeWidth="1" />
                            </>
                          );
                        })()}
                      </svg>
                    </div>
                  )}

                </div>
              </div>
            );
          })()}
        </aside>
      </section>

      {/* 3. NEXT MOVE ────────────────────────────────────── */}
      <section style={{ borderTop: "2px solid var(--ink)", paddingTop: 24, marginBottom: 56 }}>
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
      <section style={{ marginBottom: 56 }}>
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
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => markRowOpened(s.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              markRowOpened(s.id);
                            }
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
                              <button type="button" onClick={(e) => {
                                  e.stopPropagation();
                                  if (onOpenSignal) onOpenSignal(s.id);
                                  else onSwitchTab?.("intelligence");
                                }}
                                style={{ background: "transparent", border: 0, cursor: "pointer", padding: 0, color: "var(--action)" }}>
                                <Mono color="var(--action)" size={11}>View in Signals →</Mono>
                              </button>
                            </div>
                          </div>
                        </div>
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
                  <svg viewBox="-26 0 272 220" width="100%" height="220" aria-label="Your territory diagram"
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
                      const dist = 14 + strength * 70; // 14 = near center, 84 outer
                      const angle = (i / Math.max(1, marks.length)) * Math.PI * 2 - Math.PI / 2;
                      const cx = 110 + Math.cos(angle) * dist;
                      const cy = 110 + Math.sin(angle) * dist;
                      const r = 3 + strength * 3;
                      const isHot = m.velocity === "accelerating" || m.lifecycle === "live";
                      const isFaded = m.lifecycle === "faded";
                      const words = ((m.themes[0] || m.title).split(/\s+/).filter(Boolean)).slice(0, 2);
                      const labelLines = words.join(" ").length <= 15 ? [words.join(" ").toUpperCase()] : words.map(w => w.toUpperCase());
                      const labelYbase = i % 2 === 0 ? cy - r - 4 - (labelLines.length - 1) * 8 : cy + r + 9;
                      return (
                        <g
                          key={m.id}
                          role="button"
                          tabIndex={onOpenSignal ? 0 : -1}
                          aria-label={`Open signal: ${m.title}`}
                          style={{ cursor: onOpenSignal ? "pointer" : "default", outline: "none" }}
                          onClick={onOpenSignal ? () => onOpenSignal(m.id) : undefined}
                          onKeyDown={onOpenSignal ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onOpenSignal(m.id);
                            }
                          } : undefined}
                        >
                          <title>{m.title}</title>
                          <circle cx={cx} cy={cy} r={r}
                            fill={isFaded ? "none" : isHot ? "var(--live)" : "var(--ink)"}
                            stroke={isFaded ? "var(--ink-3)" : "none"} strokeWidth="1" />
                          {labelLines.map((line, li) => (
                            <text key={li} x={cx} y={labelYbase + li * 8} textAnchor="middle"
                              style={{ fontFamily: "var(--font-mono)", fontSize: 6.5, fill: "var(--ink-3)", letterSpacing: "0.1em" }}>
                              {line}
                            </text>
                          ))}
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
                </>
              );
            })()}
          </aside>
        </div>
      </section>

      {/* 5. YOUR RHYTHM / PROOF ────────────────────────────────────── */}
      <section className="brief-rhythm" style={{ display: "grid", gridTemplateColumns: "1fr 310px", gap: 40, marginBottom: 56 }}>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Mono color="var(--spot)">{HEADERS.yourRhythm}</Mono>
              <InfoTooltip label="Your rhythm" triggerSize={12}
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
            <Mono color="var(--action)" size={11}>Open your Analytics →</Mono>
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
          <a href="mailto:support@aura-intel.org" style={{ textDecoration: "none" }}><Mono>Contact</Mono></a>
          <button
            type="button"
            onClick={() => onInvite?.()}
            style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer" }}
          >
            <Mono>Bring someone in</Mono>
          </button>
        </div>
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em",
          textTransform: "uppercase", color: "var(--ink-3)",
        }}>
          © {new Date().getFullYear()} Aura · Built in Riyadh, for the world.
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
        @media (min-width: 1200px) {
          .brief-lead, .brief-moved, .brief-rhythm { grid-template-columns: 1fr 340px !important; gap: 64px !important; }
          .brief-ledger, .brief-moved > aside, .brief-rhythm > aside { padding-inline-start: 34px; }
        }
        @media (max-width: 960px) {
          .brief-lead, .brief-moved, .brief-rhythm { grid-template-columns: 1fr !important; }
          .brief-ledger, .brief-moved > aside, .brief-rhythm > aside {
            border-inline-start: none !important;
            padding-inline-start: 0 !important;
            border-top: 1px solid var(--rule);
            padding-top: 24px;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .brief-page * { animation: none !important; transition: none !important; }
        }

      `}</style>
    </motion.div>
  );
}