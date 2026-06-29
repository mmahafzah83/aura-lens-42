import { useCallback, useEffect, useMemo, useState } from "react";
import { useRef } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";

/**
 * Brief — bone editorial board (System-A tokens).
 * Single centered column. Dateline + headline + standing line + signals + draft card.
 * Surface-only rewrite; all data reads preserved verbatim.
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
}

interface AwaySignal {
  id: string;
  title: string;
  confidence: number | null;
}

interface AwayData {
  signals: AwaySignal[];
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
  if (h < 5) return "Good evening";
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

function toRoman(num: number): string {
  if (!num || num < 1) return "I";
  const map: Array<[number, string]> = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
    [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let n = num; let out = "";
  for (const [v, s] of map) { while (n >= v) { out += s; n -= v; } }
  return out;
}

function formatDateline(now: Date, vol: number, no: number): string {
  const weekday = now.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase();
  const month = now.toLocaleDateString("en-US", { month: "long" }).toUpperCase();
  const dd = String(now.getDate()).padStart(2, "0");
  return `VOL. ${toRoman(vol)} \u2014 NO. ${no} \u00B7 ${weekday} ${dd} ${month}`;
}

// Defensive cleaner — mirrors LinkedInPreview in AuthorityTab. For legacy rows
// that persisted a literal "POST" prefix line and **markdown** bolds.
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

// ── Atoms ────────────────────────────────────────────────────────────

const SkeletonLine: React.FC<{ width?: number | string; height?: number }> = ({ width = "60%", height = 14 }) => (
  <div
    aria-hidden
    style={{
      width,
      height,
      borderRadius: 3,
      background: "linear-gradient(90deg, var(--paper-2) 25%, var(--paper-3) 50%, var(--paper-2) 75%)",
      backgroundSize: "200% 100%",
      animation: "skeleton-pulse 1.5s ease-in-out infinite",
    }}
  />
);

const SectionLabel: React.FC<React.PropsWithChildren> = ({ children }) => (
  <div
    style={{
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      color: "var(--spot)",
      marginBottom: 14,
    }}
  >
    {children}
  </div>
);

const ErrorLine: React.FC<{ what: string; onRetry: () => void }> = ({ what, onRetry }) => (
  <div style={{ fontSize: 15, color: "var(--ink-2)", lineHeight: 1.55 }}>
    The {what} didn't load. Your data is safe.{" "}
    <button
      type="button"
      onClick={onRetry}
      style={{
        background: "transparent",
        border: 0,
        padding: 0,
        color: "var(--action)",
        textDecoration: "underline",
        textUnderlineOffset: 3,
        cursor: "pointer",
        fontSize: "inherit",
      }}
    >
      Retry
    </button>
  </div>
);

// ── Component ────────────────────────────────────────────────────────

export default function Brief({ onOpenDraft, onSwitchTab, onOpenCapture }: BriefProps) {
  const { user, isReady } = useAuthReady();

  const [profile, setProfile] = useState<{ firstName: string; sectorFocus: string } | null>(null);

  // Cached set of source_signal_ids the user has already turned into a published
  // LinkedIn post — used to gate both the "while you were away" list and the
  // weekly draft pick so we don't resurface what's already shipped.
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

  const now = useMemo(() => new Date(), []);

  const volNumber = useMemo(() => {
    const created = (user as any)?.created_at;
    if (!created) return 1;
    const start = new Date(created).getTime();
    if (!isFinite(start)) return 1;
    const years = Math.floor((Date.now() - start) / (365 * 24 * 60 * 60 * 1000));
    return Math.max(1, years + 1);
  }, [user]);
  const issueNumber = useMemo(() => isoWeekNumber(now), [now]);
  const dateline = useMemo(() => formatDateline(now, volNumber, issueNumber), [now, volNumber, issueNumber]);

  // Resolve profile as soon as auth is ready.
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
          .from("diagnostic_profiles")
          .select("first_name, sector_focus")
          .eq("user_id", user.id)
          .maybeSingle();
        if (cancelled) return;
        const first = (data?.first_name || fallbackName() || "").toString().trim();
        setProfile({
          firstName: first,
          sectorFocus: (data?.sector_focus || "").toString().trim(),
        });
      } catch {
        if (!cancelled) setProfile({ firstName: fallbackName(), sectorFocus: "" });
      }
    })();

    return () => { cancelled = true; };
  }, [isReady, user]);

  const loadImprint = useCallback(async () => {
    if (!user) { setImprint({ status: "ready", data: { imprint: null, delta: null, signalScore: null, contentScore: null } }); return; }
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
      // 7-day-ago lookback: find the snapshot whose created_at is closest to
      // (latest.created_at − 7d), only considering rows older than ~1 day before latest.
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
      const signalScore =
        typeof sc.signal_score === "number" ? Math.round(sc.signal_score) : null;
      const contentScore =
        typeof sc.content_score === "number" ? Math.round(sc.content_score) : null;
      setImprint({ status: "ready", data: { imprint: latest, delta, signalScore, contentScore } });
    } catch (e) {
      console.warn("[Brief] imprint load failed", e);
      setImprint({ status: "error", message: "imprint" });
    }
  }, [user]);

  const loadAway = useCallback(async () => {
    if (!user) { setAway({ status: "ready", data: { signals: [], signalCount: 0, newCaptureCount: 0, mode: "away" } }); return; }
    setAway({ status: "loading" });
    try {
      // Window = EARLIER of last-visit and 7 days ago, so a quick repeat visit
      // doesn't make the scan look falsely quiet.
      const sevenAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const lv = (typeof window !== "undefined" && localStorage.getItem(LAST_VISIT_KEY)) || null;
      const sinceDate = lv
        ? new Date(Math.min(new Date(lv).getTime(), sevenAgo.getTime()))
        : sevenAgo;
      const since = sinceDate.toISOString();

      const publishedSet = await loadPublishedSignalIds();

      const [sigRes, capRes] = await Promise.all([
        (supabase.from("strategic_signals" as any) as any)
          .select("id, signal_title, confidence_score, created_at, status")
          .eq("user_id", user.id)
          .eq("status", "active")
          .gte("created_at", since)
          .order("confidence_score", { ascending: false })
          .limit(8),
        supabase
          .from("entries")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .gte("created_at", since),
      ]);
      const { count: docSinceCount } = await supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", since);

      const sigRows = (sigRes?.data || []) as Array<{ id: string; signal_title: string | null; confidence_score: number | null }>;
      let signals: AwaySignal[] = sigRows
        .filter((r) => !publishedSet.has(r.id))
        .slice(0, 2)
        .map((r) => ({
          id: r.id,
          title: r.signal_title || "Untitled signal",
          confidence: r.confidence_score,
        }));
      const newCaptureCount = (capRes?.count ?? 0) + (docSinceCount ?? 0);
      let mode: "away" | "radar" = "away";

      // Fallback: nothing in the since-window — surface the top 2 ACTIVE signals
      // (any date) so the masthead headline and list still name something real.
      if (signals.length === 0) {
        const { data: radarData } = await (supabase.from("strategic_signals" as any) as any)
          .select("id, signal_title, confidence_score")
          .eq("user_id", user.id)
          .eq("status", "active")
          .order("confidence_score", { ascending: false })
          .limit(8);
        const radarRows = (radarData || []) as Array<{ id: string; signal_title: string | null; confidence_score: number | null }>;
        const filtered = radarRows.filter((r) => !publishedSet.has(r.id)).slice(0, 2);
        if (filtered.length > 0) {
          signals = filtered.map((r) => ({
            id: r.id,
            title: r.signal_title || "Untitled signal",
            confidence: r.confidence_score,
          }));
          mode = "radar";
        }
      }

      const { count: activeTotal } = await (supabase.from("strategic_signals" as any) as any)
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "active");

      setAway({ status: "ready", data: { signals, signalCount: activeTotal ?? signals.length, newCaptureCount, mode } });
    } catch (e) {
      console.warn("[Brief] away load failed", e);
      setAway({ status: "error", message: "while-you-were-away update" });
    }
  }, [user, loadPublishedSignalIds]);

  const loadDraft = useCallback(async () => {
    if (!user) { setDraftState({ status: "ready", data: { draft: null, preview: "", voiceScore: null, signalCount: null } }); return; }
    setDraftState({ status: "loading" });
    try {
      const publishedSet = await loadPublishedSignalIds();
      const { data, error } = await supabase
        .from("content_items")
        .select("id, type, body, language, status, generation_params, created_at")
        .eq("user_id", user.id)
        .gte("created_at", startOfThisWeekIso())
        .order("created_at", { ascending: true });
      if (error) throw error;
      const rows = (data || []) as Array<{
        id: string; type: string | null; body: string | null; language: string | null;
        status: string | null; generation_params: any;
      }>;
      const draftSignalIds = (gp: any): string[] => {
        const out: string[] = [];
        if (typeof gp?.signal_id === "string") out.push(gp.signal_id);
        if (typeof gp?.source_signal_id === "string") out.push(gp.source_signal_id);
        if (Array.isArray(gp?.source_signals)) {
          for (const s of gp.source_signals) {
            if (typeof s === "string") out.push(s);
            else if (s && typeof s.id === "string") out.push(s.id);
          }
        }
        if (Array.isArray(gp?.signals)) {
          for (const s of gp.signals) {
            if (typeof s === "string") out.push(s);
            else if (s && typeof s.id === "string") out.push(s.id);
          }
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
      if (!pick) {
        setDraftState({ status: "ready", data: { draft: null, preview: "", voiceScore: null, signalCount: null } });
        return;
      }
      const lang: "en" | "ar" = pick.language === "ar" ? "ar" : "en";
      const type: BriefDraft["type"] =
        pick.type === "carousel" ? "carousel" : pick.type === "framework" ? "framework" : "linkedin_post";
      const draft: BriefDraft = {
        id: pick.id,
        body: pick.body || "",
        language: lang,
        type,
        topic: pick?.generation_params?.topic ?? null,
        _source: "content_items",
      };
      const gp = pick?.generation_params || {};
      const rawVoice =
        gp.voice_match ?? gp.voice_score ?? gp.quality_score ?? gp.match_score ?? null;
      let voiceScore: number | null = null;
      if (typeof rawVoice === "number" && isFinite(rawVoice)) {
        voiceScore = rawVoice <= 1 ? Math.round(rawVoice * 100) : Math.round(rawVoice);
      }
      const sigCountRaw =
        gp.source_signal_count ?? gp.signal_count ??
        (Array.isArray(gp.source_signals) ? gp.source_signals.length : null) ??
        (Array.isArray(gp.signals) ? gp.signals.length : null);
      const signalCount = typeof sigCountRaw === "number" && sigCountRaw > 0 ? sigCountRaw : null;
      setDraftState({
        status: "ready",
        data: { draft, preview: derivePreview(pick.body || ""), voiceScore, signalCount },
      });
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
        .select("value, inputs")
        .eq("user_id", user.id)
        .eq("facet", "discernment")
        .maybeSingle();
      const inputs = (data?.inputs || {}) as any;
      setDiscernment({
        status: "ready",
        data: {
          value: typeof data?.value === "number" ? Math.round(data.value) : null,
          postsWithSignal: typeof inputs.posts_with_source_signal === "number" ? inputs.posts_with_source_signal : null,
          published120d: typeof inputs.published_posts_120d === "number" ? inputs.published_posts_120d : null,
        },
      });
    } catch (e) {
      console.warn("[Brief] discernment load failed", e);
      setDiscernment({ status: "error", message: "gap reading" });
    }
  }, [user]);

  const loadProof = useCallback(async () => {
    if (!user) { setProof({ status: "ready", data: { entriesTotal: 0, fragments: 0, institutions: 0, dayN: null } }); return; }
    setProof({ status: "loading" });
    try {
      const [entriesRes, fragsRes, instRes, firstRes] = await Promise.all([
        supabase.from("entries").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("evidence_fragments").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("evidence_fragments").select("source_registry_id").eq("user_id", user.id).not("source_registry_id", "is", null),
        supabase.from("entries").select("created_at").eq("user_id", user.id).order("created_at", { ascending: true }).limit(1).maybeSingle(),
      ]);
      const { count: docsTotal } = await supabase
        .from("documents").select("id", { count: "exact", head: true }).eq("user_id", user.id);
      const institutions = new Set(
        ((instRes?.data || []) as Array<{ source_registry_id: string | null }>)
          .map((r) => r.source_registry_id)
          .filter(Boolean),
      ).size;
      const first = (firstRes?.data as any)?.created_at as string | undefined;
      const dayN = first ? Math.max(1, Math.floor((Date.now() - new Date(first).getTime()) / 86400000) + 1) : null;
      setProof({
        status: "ready",
        data: {
          entriesTotal: (entriesRes?.count ?? 0) + (docsTotal ?? 0),
          fragments: fragsRes?.count ?? 0,
          institutions,
          dayN,
        },
      });
    } catch (e) {
      console.warn("[Brief] proof load failed", e);
      setProof({ status: "error", message: "proof counts" });
    }
  }, [user]);

  useEffect(() => {
    if (!isReady) return;
    void loadImprint();
    void loadAway();
    void loadDraft();
    void loadDiscernment();
    void loadProof();
    return () => {
      try { localStorage.setItem(LAST_VISIT_KEY, new Date().toISOString()); } catch { /* noop */ }
    };
  }, [isReady, loadImprint, loadAway, loadDraft, loadDiscernment, loadProof]);

  // Re-run all loaders on capture-complete (any capture type).
  useEffect(() => {
    if (!user?.id) return;
    const handler = () => {
      publishedSignalsRef.current = null;
      void loadImprint();
      void loadAway();
      void loadDraft();
      void loadDiscernment();
      void loadProof();
    };
    window.addEventListener("capture-complete", handler);
    return () => window.removeEventListener("capture-complete", handler);
  }, [user?.id, loadImprint, loadAway, loadDraft, loadDiscernment, loadProof]);

  // Realtime — any capture (entries/documents), signal, or imprint snapshot
  // refreshes the Brief the moment it lands.
  useEffect(() => {
    if (!user?.id) return;
    const uid = user.id;
    const refreshAll = () => {
      publishedSignalsRef.current = null;
      void loadImprint();
      void loadAway();
      void loadDraft();
      void loadDiscernment();
      void loadProof();
    };
    const ch = supabase.channel(`brief-live-${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "entries",            filter: `user_id=eq.${uid}` }, refreshAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "documents",          filter: `user_id=eq.${uid}` }, refreshAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "strategic_signals",  filter: `user_id=eq.${uid}` }, refreshAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "imprint_snapshots",  filter: `user_id=eq.${uid}` }, refreshAll)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, loadImprint, loadAway, loadDraft, loadDiscernment, loadProof]);

  // ── Render ──

  const firstName = profile?.firstName || "";
  const sectorFocus = profile?.sectorFocus || "";
  const profileResolved = profile !== null;

  const hasReadyDraft = draftState.status === "ready" && !!draftState.data.draft;
  const topSignal =
    away.status === "ready" && away.data.signals.length > 0 ? away.data.signals[0] : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.24, ease: [0.32, 0.72, 0.35, 1] }}
      className="brief-page"
      style={{
        background: "var(--paper)",
        color: "var(--ink)",
        fontFamily: "var(--font-body)",
        fontSize: 17,
        lineHeight: 1.6,
        marginInline: "calc(50% - 50vw)",
        width: "100vw",
        padding: "22px 0 60px",
        minHeight: "100vh",
      }}
      aria-label="Your Brief"
    >
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 24px" }}>
      {/* MASTHEAD ─────────────────────────── */}
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--spot)",
          textAlign: "center",
          marginBottom: 10,
        }}
      >
        {`YEAR ${now.getFullYear()} \u00B7 WEEK ${issueNumber}`}
      </div>

      <div style={{ textAlign: "center", marginBottom: 8 }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--ink-3)",
            marginBottom: 6,
          }}
        >
          Aura
        </div>
        {profileResolved ? (
          firstName ? (
            <h1
              style={{
                fontFamily: "var(--font-serif)",
                fontWeight: 400,
                fontSize: "clamp(2.25rem, 5.5vw, 3.5rem)",
                lineHeight: 1.05,
                letterSpacing: "-0.015em",
                margin: 0,
                color: "var(--ink)",
              }}
            >
              {firstName}
            </h1>
          ) : null
        ) : (
          <div style={{ display: "inline-block" }}>
            <SkeletonLine width={220} height={44} />
          </div>
        )}
        <div
          style={{
            marginTop: 8,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--ink-3)",
          }}
        >
          Your Strategic Intelligence Brief
        </div>
        {sectorFocus ? (
          <div
            style={{
              marginTop: 4,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: "var(--spot)",
            }}
          >
            {`Your field \u00B7 ${sectorFocus}`}
          </div>
        ) : null}
      </div>

      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--ink-3)",
          textAlign: "center",
          marginBottom: 36,
        }}
      >
        {proof.status === "ready" && proof.data.dayN != null ? (
          <>
            {`Day ${proof.data.dayN} of building your Aura`} <span style={{ color: "var(--rule)" }}>·</span>{" "}
            {`${proof.data.entriesTotal} capture${proof.data.entriesTotal === 1 ? "" : "s"}`}{" "}
            <span style={{ color: "var(--rule)" }}>·</span>{" "}
            {`${proof.data.fragments} fragment${proof.data.fragments === 1 ? "" : "s"} from ${proof.data.institutions} institution${proof.data.institutions === 1 ? "" : "s"}`}
          </>
        ) : (
          <SkeletonLine width="70%" height={12} />
        )}
      </div>

      {/* THE GAP ─────────────────────────── */}
      <section style={{ marginBottom: 40 }}>
        <SectionLabel>This week's tension</SectionLabel>

        {imprint.status === "loading" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <SkeletonLine width="90%" height={36} />
            <SkeletonLine width="75%" height={18} />
          </div>
        ) : imprint.status === "error" ? (
          <ErrorLine what="gap reading" onRetry={loadImprint} />
        ) : (
          (() => {
            const signalScore = imprint.data.signalScore;
            const contentScore = imprint.data.contentScore;
            const headline = topSignal
              ? `You see ${topSignal.title} more clearly than you've said it.`
              : (signalScore != null && contentScore != null)
                ? "Your reading is ahead of your voice this week."
                : "Your reading is taking shape.";

            const dInputs = discernment.status === "ready" ? discernment.data : null;
            const hasGap = dInputs && dInputs.postsWithSignal != null && dInputs.published120d != null;

            return (
              <>
                <h2
                  dir="auto"
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontWeight: 400,
                    fontSize: "clamp(1.6rem, 4vw, 2.5rem)",
                    lineHeight: 1.18,
                    letterSpacing: "-0.01em",
                    color: "var(--ink)",
                    margin: 0,
                  }}
                >
                  {headline}
                </h2>

                <p
                  style={{
                    marginTop: 14,
                    marginBottom: 0,
                    fontSize: 16,
                    lineHeight: 1.6,
                    color: "var(--ink-2)",
                  }}
                >
                  {hasGap && signalScore != null && contentScore != null ? (
                    <>
                      Only <strong style={{ color: "var(--ink)" }}>{dInputs!.postsWithSignal}</strong> of your last{" "}
                      <strong style={{ color: "var(--ink)" }}>{dInputs!.published120d}</strong> posts drew on a signal
                      you captured — your reading scores{" "}
                      <span style={{ color: "var(--live)", fontWeight: 600 }}>{signalScore}</span>, your voice{" "}
                      <span style={{ color: "var(--spot)", fontWeight: 600 }}>{contentScore}</span>.
                    </>
                  ) : signalScore != null && contentScore != null ? (
                    <>
                      Your reading scores{" "}
                      <span style={{ color: "var(--live)", fontWeight: 600 }}>{signalScore}</span>; your voice{" "}
                      <span style={{ color: "var(--spot)", fontWeight: 600 }}>{contentScore}</span>. The gap is the opening.
                    </>
                  ) : (
                    "Your reading and your voice are still forming. The gap is the opening."
                  )}
                </p>

                {signalScore != null && contentScore != null && (
                  <div style={{ marginTop: 22 }}>
                    {(() => {
                      const lo = Math.min(signalScore, contentScore);
                      const hi = Math.max(signalScore, contentScore);
                      return (
                        <>
                          {/* Reading label ABOVE the track, anchored at its marker. */}
                          <div
                            style={{
                              position: "relative",
                              height: 16,
                              marginBottom: 6,
                              marginInline: 4,
                              fontFamily: "var(--font-mono)",
                              fontSize: 10,
                              letterSpacing: "0.12em",
                              textTransform: "uppercase",
                            }}
                          >
                            <span
                              style={{
                                position: "absolute",
                                insetInlineStart: `${signalScore}%`,
                                transform: "translateX(-50%)",
                                color: "var(--live)",
                                whiteSpace: "nowrap",
                              }}
                            >
                              Your reading {signalScore}
                            </span>
                          </div>
                          <div
                            style={{
                              position: "relative",
                              height: 1,
                              background: "var(--rule)",
                              marginInline: 4,
                            }}
                          >
                            <div
                              style={{
                                position: "absolute",
                                insetInlineStart: `${lo}%`,
                                width: `${Math.max(0, hi - lo)}%`,
                                top: -3,
                                height: 7,
                                background: "var(--spot)",
                                opacity: 0.18,
                              }}
                            />
                            <span
                              aria-hidden
                              style={{
                                position: "absolute",
                                insetInlineStart: `calc(${contentScore}% - 4px)`,
                                top: -4,
                                width: 9,
                                height: 9,
                                background: "var(--spot)",
                                borderRadius: "50%",
                              }}
                            />
                            <span
                              aria-hidden
                              style={{
                                position: "absolute",
                                insetInlineStart: `calc(${signalScore}% - 4px)`,
                                top: -4,
                                width: 9,
                                height: 9,
                                background: "var(--live)",
                                borderRadius: "50%",
                              }}
                            />
                          </div>
                           {/* Reading label sits ABOVE the track — but we've already
                               rendered the track; instead we stack: voice BELOW,
                               reading rendered as an overlay ABOVE the track via
                               negative margin so the two never collide. */}
                           <div
                             style={{
                               position: "relative",
                               height: 16,
                               marginTop: 6,
                               marginInline: 4,
                               fontFamily: "var(--font-mono)",
                               fontSize: 10,
                               letterSpacing: "0.12em",
                               textTransform: "uppercase",
                             }}
                           >
                             <span
                               style={{
                                 position: "absolute",
                                 insetInlineStart: `${contentScore}%`,
                                 transform: "translateX(-50%)",
                                 color: "var(--spot)",
                                 whiteSpace: "nowrap",
                               }}
                             >
                               Your voice {contentScore}
                             </span>
                           </div>
                          <div
                            style={{
                              marginTop: 14,
                              textAlign: "center",
                              fontFamily: "var(--font-mono)",
                              fontSize: 10,
                              letterSpacing: "0.16em",
                              textTransform: "uppercase",
                              color: "var(--ink-3)",
                            }}
                          >
                            The gap — your opening
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </>
            );
          })()
        )}
      </section>

      {/* THE POST ─────────────────────────── */}
      <section style={{ marginBottom: 40 }}>
        <SectionLabel>The post</SectionLabel>
        {draftState.status === "loading" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <SkeletonLine width="80%" height={20} />
            <SkeletonLine width="95%" />
            <SkeletonLine width="60%" />
          </div>
        )}
        {draftState.status === "error" && <ErrorLine what="ready draft" onRetry={loadDraft} />}
        {draftState.status === "ready" && (
          draftState.data.draft ? (
            <>
              <p
                style={{
                  margin: "0 0 14px 0",
                  fontFamily: "var(--font-serif)",
                  fontStyle: "italic",
                  fontSize: "1.05rem",
                  lineHeight: 1.55,
                  color: "var(--ink-2)",
                }}
              >
                {draftState.data.signalCount
                  ? `${draftState.data.signalCount} capture${draftState.data.signalCount === 1 ? "" : "s"} converged on one thesis. I've drafted the post — it needs your voice and ten minutes.`
                  : `I've drafted the post — it needs your voice and ten minutes.`}
              </p>
              <article
                style={{
                  background: "var(--paper-2)",
                  border: "1px solid var(--rule)",
                  borderInlineStart: "3px solid var(--action)",
                  borderRadius: 6,
                  padding: "20px 22px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                }}
              >
                <h3
                  dir={draftState.data.draft.language === "ar" ? "rtl" : "ltr"}
                  lang={draftState.data.draft.language}
                  style={{
                    fontFamily: draftState.data.draft.language === "ar"
                      ? "var(--font-arabic)"
                      : "var(--font-serif)",
                    fontWeight: 400,
                    fontSize: "clamp(1.25rem, 2.6vw, 1.65rem)",
                    lineHeight: 1.3,
                    color: "var(--ink)",
                    margin: 0,
                  }}
                >
                  {`\u201C${deriveHook(draftState.data.draft.body) || "Untitled draft"}\u201D`}
                </h3>
                <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => onOpenDraft(draftState.data.draft!)}
                    className="brief-cta"
                    style={{
                      background: "var(--action)",
                      color: "#1B1712",
                      border: 0,
                      borderRadius: 4,
                      padding: "10px 18px",
                      fontFamily: "var(--font-body)",
                      fontSize: 15,
                      fontWeight: 600,
                      letterSpacing: "0.01em",
                      cursor: "pointer",
                    }}
                  >
                    Open in Composer
                  </button>
                  {draftState.data.voiceScore != null && (
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                        color: "var(--ink-3)",
                      }}
                    >
                      {draftState.data.voiceScore}% voice match
                    </span>
                  )}
                </div>
              </article>
            </>
          ) : (
            <p style={{ margin: 0, color: "var(--ink-2)", fontSize: 16, lineHeight: 1.55 }}>
              No draft prepared yet.{" "}
              <button
                type="button"
                onClick={() => onSwitchTab?.("authority")}
                style={{
                  background: "transparent",
                  border: 0,
                  padding: 0,
                  color: "var(--action)",
                  textDecoration: "underline",
                  textUnderlineOffset: 3,
                  cursor: "pointer",
                  fontSize: "inherit",
                }}
              >
                Open Composer
              </button>{" "}
              when you're ready to write.
            </p>
          )
        )}
      </section>

      {/* WHILE YOU WERE AWAY (demoted) ─────────────────────────── */}
      <section style={{ marginBottom: 36 }}>
        <SectionLabel>
          {away.status === "ready" && away.data.mode === "radar"
            ? "Still on your radar"
            : "While you were away"}
        </SectionLabel>
        {away.status === "loading" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <SkeletonLine width="85%" />
            <SkeletonLine width="65%" />
          </div>
        )}
        {away.status === "error" && <ErrorLine what="signals update" onRetry={loadAway} />}
        {away.status === "ready" && (() => {
          const { signals, newCaptureCount, signalCount } = away.data;
          if (signals.length === 0 && newCaptureCount === 0 && signalCount === 0) {
            return (
              <p style={{ margin: 0, color: "var(--ink-2)", fontSize: 15, lineHeight: 1.55 }}>
                Your scan is still forming.
              </p>
            );
          }
          if (signals.length === 0) {
            return (
              <p style={{ margin: 0, color: "var(--ink-2)", fontSize: 15, lineHeight: 1.55 }}>
                The scan is quiet — for now.
              </p>
            );
          }
          return (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {signals.slice(0, 2).map((s) => (
                <li key={s.id} style={{ borderTop: "1px solid var(--rule)" }}>
                  <button
                    type="button"
                    onClick={() => onSwitchTab?.("intelligence")}
                    dir="auto"
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "start",
                      background: "transparent",
                      border: 0,
                      paddingBlock: 12,
                      paddingInline: 0,
                      cursor: "pointer",
                      color: "var(--ink)",
                      fontFamily: "var(--font-body)",
                      fontSize: 15,
                      lineHeight: 1.5,
                    }}
                  >
                    {s.title}
                  </button>
                </li>
              ))}
            </ul>
          );
        })()}
      </section>

      {/* QUIET FOOTER ─────────────────────────── */}
      <footer
        style={{
          marginTop: 24,
          paddingTop: 16,
          borderTop: "1px solid var(--rule)",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--ink-3)",
          textAlign: "center",
          lineHeight: 1.7,
        }}
      >
        {imprint.status === "ready" && imprint.data.imprint != null ? (
          (() => {
            const v = imprint.data.imprint;
            const tier =
              v >= 80 ? "Presence" :
              v >= 60 ? "Voice" :
              v >= 35 ? "Strategist" :
              v >= 15 ? "Explorer" : "Observer";
            return (
              <>
                {`Imprint ${v} \u00B7 ${tier} \u00B7 aura-intel.org`}
              </>
            );
          })()
        ) : (
          <>aura-intel.org</>
        )}
        <div
          style={{
            marginTop: 6,
            fontFamily: "var(--font-serif)",
            fontStyle: "italic",
            fontSize: 12,
            letterSpacing: 0,
            textTransform: "none",
            color: "var(--ink-3)",
          }}
        >
          Turn your expertise into presence.
        </div>
      </footer>

      {/* New-user empty hint */}
      {imprint.status === "ready" && imprint.data.imprint == null &&
       away.status === "ready" && away.data.signals.length === 0 && away.data.newCaptureCount === 0 &&
       draftState.status === "ready" && !draftState.data.draft && (
        <section style={{ marginTop: 24 }}>
          <p style={{ fontFamily: "var(--font-serif)", fontSize: 20, color: "var(--ink-2)", margin: "0 0 8px 0" }}>
            Your Brief is forming.
          </p>
          <button
            type="button"
            onClick={() => onOpenCapture?.()}
            style={{
              background: "transparent",
              border: 0,
              padding: 0,
              color: "var(--action)",
              textDecoration: "underline",
              textUnderlineOffset: 3,
              cursor: "pointer",
              fontSize: 15,
              fontFamily: "var(--font-body)",
            }}
          >
            Make your first capture →
          </button>
        </section>
      )}

      <style>{`
        .brief-cta:focus-visible {
          outline: 2px solid var(--spot);
          outline-offset: 3px;
        }
        [lang="ar"] .brief-cta, [dir="rtl"] .brief-cta { font-family: var(--font-arabic); }
        @media (max-width: 560px) {
          .brief-headline-row { flex-direction: column; align-items: flex-start; }
        }
      `}</style>
      </div>
    </motion.div>
  );
}
