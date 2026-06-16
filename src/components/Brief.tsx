import { useCallback, useEffect, useMemo, useState } from "react";
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
}

interface DraftData {
  draft: BriefDraft | null;
  preview: string;
  voiceScore: number | null;
  signalCount: number | null;
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

  const [imprint, setImprint] = useState<SectionState<ImprintData>>({ status: "loading" });
  const [away, setAway] = useState<SectionState<AwayData>>({ status: "loading" });
  const [draftState, setDraftState] = useState<SectionState<DraftData>>({ status: "loading" });

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
    if (!user) { setImprint({ status: "ready", data: { imprint: null, delta: null } }); return; }
    setImprint({ status: "loading" });
    try {
      const { data, error } = await supabase
        .from("imprint_snapshots")
        .select("imprint, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      const rows = (data || []) as Array<{ imprint: number | null; created_at: string }>;
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
      setImprint({ status: "ready", data: { imprint: latest, delta } });
    } catch (e) {
      console.warn("[Brief] imprint load failed", e);
      setImprint({ status: "error", message: "imprint" });
    }
  }, [user]);

  const loadAway = useCallback(async () => {
    if (!user) { setAway({ status: "ready", data: { signals: [], signalCount: 0, newCaptureCount: 0 } }); return; }
    setAway({ status: "loading" });
    try {
      const lastVisit = (typeof window !== "undefined" && localStorage.getItem(LAST_VISIT_KEY)) || null;
      const since = lastVisit || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const [sigRes, capRes] = await Promise.all([
        (supabase.from("strategic_signals" as any) as any)
          .select("id, signal_title, confidence_score, created_at, status")
          .eq("user_id", user.id)
          .eq("status", "active")
          .gte("created_at", since)
          .order("confidence_score", { ascending: false })
          .limit(2),
        supabase
          .from("entries")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .gte("created_at", since),
      ]);

      const sigRows = (sigRes?.data || []) as Array<{ id: string; signal_title: string | null; confidence_score: number | null }>;
      const signals: AwaySignal[] = sigRows.map((r) => ({
        id: r.id,
        title: r.signal_title || "Untitled signal",
        confidence: r.confidence_score,
      }));
      const newCaptureCount = capRes?.count ?? 0;

      const { count: signalCount } = await (supabase.from("strategic_signals" as any) as any)
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "active")
        .gte("created_at", since);

      setAway({ status: "ready", data: { signals, signalCount: signalCount ?? signals.length, newCaptureCount } });
    } catch (e) {
      console.warn("[Brief] away load failed", e);
      setAway({ status: "error", message: "while-you-were-away update" });
    }
  }, [user]);

  const loadDraft = useCallback(async () => {
    if (!user) { setDraftState({ status: "ready", data: { draft: null, preview: "", voiceScore: null, signalCount: null } }); return; }
    setDraftState({ status: "loading" });
    try {
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
      const ready = rows.filter(
        (r) => r?.generation_params?.source === "weekly_ready" && r.status !== "published",
      );
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
  }, [user]);

  useEffect(() => {
    if (!isReady) return;
    void loadImprint();
    void loadAway();
    void loadDraft();
    return () => {
      try { localStorage.setItem(LAST_VISIT_KEY, new Date().toISOString()); } catch { /* noop */ }
    };
  }, [isReady, loadImprint, loadAway, loadDraft]);

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
      style={{
        background: "var(--paper)",
        color: "var(--ink)",
        fontFamily: "var(--font-body)",
        fontSize: 17,
        lineHeight: 1.6,
        maxWidth: 720,
        margin: "0 auto",
        padding: "12px 4px 80px",
      }}
      aria-label="Your Brief"
    >
      {/* 1. DATELINE */}
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--spot)",
          marginBottom: 18,
        }}
      >
        {dateline}
      </div>

      {/* 2. HEADLINE + pill */}
      <section
        className="brief-headline-row"
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 28,
        }}
      >
        {profileResolved ? (
          <h1
            style={{
              fontFamily: "var(--font-serif)",
              fontWeight: 400,
              fontSize: "clamp(2rem, 5vw, 3.25rem)",
              lineHeight: 1.08,
              letterSpacing: "-0.015em",
              margin: 0,
              color: "var(--ink)",
              flex: "1 1 auto",
            }}
          >
            {greeting(now)}{firstName ? `, ${firstName}` : ""}.
          </h1>
        ) : (
          <SkeletonLine width="55%" height={44} />
        )}
        {hasReadyDraft && (
          <span
            style={{
              flex: "0 0 auto",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--spot)",
              border: "1px solid var(--spot)",
              background: "transparent",
              borderRadius: 999,
              padding: "5px 10px",
              whiteSpace: "nowrap",
            }}
          >
            Strongest move ready
          </span>
        )}
      </section>

      {/* 3. STANDING LINE */}
      <section style={{ marginBottom: 24 }}>
        {imprint.status === "loading" && <SkeletonLine width="70%" height={22} />}
        {imprint.status === "error" && <ErrorLine what="standing line" onRetry={loadImprint} />}
        {imprint.status === "ready" && (
          <>
            <p
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: "clamp(1.25rem, 2.5vw, 1.75rem)",
                lineHeight: 1.4,
                color: "var(--ink)",
                margin: 0,
              }}
            >
              {(() => {
                const v = imprint.data.imprint;
                const d = imprint.data.delta;
                if (v == null) return "Your Imprint is forming — it sharpens with every capture.";
                const movement =
                  d == null ? "" :
                  d > 0 ? `, up ${d} this week` :
                  d < 0 ? `, down ${Math.abs(d)} this week` :
                  ", steady this week";
                const sectorClause = sectorFocus
                  ? ` — carried by depth you added in ${sectorFocus}.`
                  : ".";
                const marketClause = topSignal
                  ? ` The market is moving on ${topSignal.title}; you're early.`
                  : "";
                return (
                  <>
                    Your{" "}
                    <span style={{ color: "var(--spot)" }}>
                      Imprint holds at {v}
                    </span>
                    {movement}
                    {sectorClause}
                    {marketClause}
                  </>
                );
              })()}
            </p>

            {/* 4. CAPTION BLOCK */}
            <div style={{ marginTop: 14 }}>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--ink-3)",
                }}
              >
                Updated this morning · A quiet line, not a gauge
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontFamily: "var(--font-serif)",
                  fontStyle: "italic",
                  fontSize: "0.9rem",
                  lineHeight: 1.5,
                  color: "var(--ink-2)",
                }}
              >
                Imprint — how present your expertise is, on a quiet 0–100 line.
              </div>
            </div>
          </>
        )}
      </section>

      {/* 5. TICK RULE */}
      <div className="tick-rule" style={{ color: "var(--rule)", marginBottom: 28 }} aria-hidden />

      {/* 6. WHILE YOU WERE AWAY */}
      <section style={{ marginBottom: 36 }}>
        <SectionLabel>While you were away</SectionLabel>
        {away.status === "loading" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <SkeletonLine width="85%" />
            <SkeletonLine width="65%" />
          </div>
        )}
        {away.status === "error" && <ErrorLine what="signals update" onRetry={loadAway} />}
        {away.status === "ready" && (() => {
          const { signals, signalCount, newCaptureCount } = away.data;
          if (signals.length === 0 && newCaptureCount === 0) {
            return (
              <p style={{ margin: 0, color: "var(--ink-2)", fontSize: 17, lineHeight: 1.55 }}>
                The scan is quiet — for now.
              </p>
            );
          }
          return (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {signals.map((s, idx) => {
                const pct = s.confidence != null ? Math.round(s.confidence * 100) : null;
                const hot = s.confidence != null && s.confidence >= 0.7;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onSwitchTab?.("intelligence")}
                    className="brief-signal-row"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "auto 1fr auto",
                      gap: 16,
                      alignItems: "baseline",
                      textAlign: "start",
                      background: "transparent",
                      border: 0,
                      borderTop: "1px solid var(--rule)",
                      paddingBlock: 16,
                      cursor: "pointer",
                      color: "var(--ink)",
                      width: "100%",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-serif)",
                        fontSize: "clamp(1.75rem, 3.5vw, 2.5rem)",
                        lineHeight: 1,
                        color: "var(--spot)",
                      }}
                    >
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <span style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                      <span
                        style={{
                          fontFamily: "var(--font-serif)",
                          fontSize: "clamp(1.05rem, 2vw, 1.25rem)",
                          lineHeight: 1.35,
                          color: "var(--ink)",
                        }}
                      >
                        {s.title}
                      </span>
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 10,
                          letterSpacing: "0.14em",
                          textTransform: "uppercase",
                          color: "var(--ink-3)",
                        }}
                      >
                        Intelligence · New signal
                      </span>
                    </span>
                    {pct != null && (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          fontFamily: "var(--font-mono)",
                          fontSize: 11,
                          letterSpacing: "0.08em",
                          color: "var(--ink-2)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <span
                          aria-hidden
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            background: hot ? "var(--live)" : "var(--ink-3)",
                            display: "inline-block",
                          }}
                        />
                        {pct}%
                      </span>
                    )}
                  </button>
                );
              })}
              {(signalCount > signals.length || newCaptureCount > 0) && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.10em", color: "var(--ink-3)", marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--rule)" }}>
                  {signalCount > signals.length && <>{signalCount - signals.length} more signal{signalCount - signals.length === 1 ? "" : "s"}</>}
                  {signalCount > signals.length && newCaptureCount > 0 && " · "}
                  {newCaptureCount > 0 && <>{newCaptureCount} new capture{newCaptureCount === 1 ? "" : "s"}</>}
                </div>
              )}
            </div>
          );
        })()}
      </section>

      {/* 7. DRAFT CARD */}
      <section style={{ marginBottom: 36 }}>
        <SectionLabel>Ready to publish</SectionLabel>
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
            <article
              style={{
                background: "#FFFFFF",
                border: "1px solid var(--rule)",
                borderInlineStart: "3px solid var(--action)",
                borderRadius: 6,
                padding: "20px 22px",
                boxShadow: "0 1px 2px rgba(20,18,14,0.04), 0 8px 24px rgba(20,18,14,0.06)",
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "var(--ink-2)",
                  }}
                >
                  A draft is ready in your voice
                </span>
                {draftState.data.voiceScore != null && (
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "var(--action)",
                      border: "1px solid var(--action)",
                      background: "rgba(214,158,46,0.08)",
                      borderRadius: 999,
                      padding: "4px 9px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {draftState.data.voiceScore}% voice match
                  </span>
                )}
              </div>

              <h2
                dir="auto"
                style={{
                  fontFamily: "var(--font-serif)",
                  fontWeight: 400,
                  fontSize: "clamp(1.25rem, 2.6vw, 1.75rem)",
                  lineHeight: 1.3,
                  color: "var(--ink)",
                  margin: 0,
                }}
              >
                {`\u201C${deriveHook(draftState.data.draft.body) || "Untitled draft"}\u201D`}
              </h2>

              <p style={{ margin: 0, color: "var(--ink-2)", fontSize: 15, lineHeight: 1.55 }}>
                {draftState.data.signalCount
                  ? `Drafted from ${draftState.data.signalCount} signals you captured. Every line traces to its evidence.`
                  : "Drafted from your signals. Every line traces to its evidence."}
              </p>

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
                <button
                  type="button"
                  onClick={() => setDraftState({ status: "ready", data: { draft: null, preview: "", voiceScore: null, signalCount: null } })}
                  style={{
                    background: "transparent",
                    border: 0,
                    padding: 0,
                    color: "var(--ink-2)",
                    fontFamily: "var(--font-body)",
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  Dismiss
                </button>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "var(--ink-3)",
                  borderTop: "1px solid var(--rule)",
                  paddingTop: 10,
                }}
              >
                Draft · Ready to publish
              </div>
            </article>
          ) : (
            <p style={{ margin: 0, color: "var(--ink-2)", fontSize: 17, lineHeight: 1.55 }}>
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

      {/* New-user empty hint */}
      {imprint.status === "ready" && imprint.data.imprint == null &&
       away.status === "ready" && away.data.signals.length === 0 && away.data.newCaptureCount === 0 &&
       draftState.status === "ready" && !draftState.data.draft && (
        <section style={{ marginTop: 8 }}>
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

    </motion.div>
  );
}
