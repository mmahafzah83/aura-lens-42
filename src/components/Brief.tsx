import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import AuraLogo from "@/components/brand/AuraLogo";
import { useLanguage } from "@/contexts/LanguageContext";

/**
 * Brief — bone Page daily folio (System-A tokens).
 * Replaces the legacy HomeTab. Flat editorial surface — no AmbientOrbs,
 * no PageHeroBackground (both still pull from the legacy DB palette).
 *
 * Bindings:
 *   - Masthead eyebrow → diagnostic_profiles.sector_focus (dynamic, no location)
 *   - Salutation       → diagnostic_profiles.first_name → auth user_metadata fallback
 *   - Standing line    → imprint_snapshots (latest + previous → delta)
 *   - While you were away → strategic_signals (active, top by confidence) + entries
 *   - Ready draft      → content_items (generation_params.source='weekly_ready')
 *                        same pipeline WeekReadyCard uses (prepare-weekly-drafts EF)
 *
 * Each section clears its OWN skeleton on resolve (success branch included).
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
}

const SCALE_SEEN_KEY = "aura-imprint-scale-seen";
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

function formatDateLine(now: Date): string {
  // "Monday · June 15, 2026"
  const weekday = now.toLocaleDateString(undefined, { weekday: "long" });
  const rest = now.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  return `${weekday} · ${rest}`;
}

function derivePreview(body: string): string {
  const s = (body || "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  return s.length > 180 ? s.slice(0, 178).trim() + "…" : s;
}

function deriveHook(body: string): string {
  const first = (body || "").split(/\r?\n/).find((l) => l.trim().length > 0) || "";
  const cleaned = first.replace(/^[#>*\-\s]+/, "").trim();
  return cleaned.length > 110 ? cleaned.slice(0, 108).trim() + "…" : cleaned;
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

const Eyebrow: React.FC<React.PropsWithChildren> = ({ children }) => (
  <div
    style={{
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      letterSpacing: "0.16em",
      textTransform: "uppercase",
      color: "var(--spot)",
    }}
  >
    {children}
  </div>
);

const SectionLabel: React.FC<React.PropsWithChildren> = ({ children }) => (
  <div
    style={{
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      color: "var(--ink-3)",
      marginBottom: 10,
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
  const { language } = useLanguage();

  // Profile (masthead + salutation): resolves independently — no Scout — limbo.
  const [profile, setProfile] = useState<{ firstName: string; sectorFocus: string } | null>(null);

  const [imprint, setImprint] = useState<SectionState<ImprintData>>({ status: "loading" });
  const [away, setAway] = useState<SectionState<AwayData>>({ status: "loading" });
  const [draftState, setDraftState] = useState<SectionState<DraftData>>({ status: "loading" });

  const [scaleSeen, setScaleSeen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(SCALE_SEEN_KEY) === "1";
  });

  const now = useMemo(() => new Date(), []);

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

  // ── Fetchers (each clears its own loading on success) ──

  const loadImprint = useCallback(async () => {
    if (!user) { setImprint({ status: "ready", data: { imprint: null, delta: null } }); return; }
    setImprint({ status: "loading" });
    try {
      const { data, error } = await supabase
        .from("imprint_snapshots")
        .select("imprint, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(2);
      if (error) throw error;
      const rows = (data || []) as Array<{ imprint: number | null; created_at: string }>;
      const latest = rows[0]?.imprint ?? null;
      const prior = rows[1]?.imprint ?? null;
      const delta = latest != null && prior != null ? Math.round(latest - prior) : null;
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

      // Count of all active signals since the visit (cheap second query for the "+N more")
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
    if (!user) { setDraftState({ status: "ready", data: { draft: null, preview: "" } }); return; }
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
        setDraftState({ status: "ready", data: { draft: null, preview: "" } });
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
      setDraftState({
        status: "ready",
        data: { draft, preview: derivePreview(pick.body || "") },
      });
    } catch (e) {
      console.warn("[Brief] draft load failed", e);
      setDraftState({ status: "error", message: "ready draft" });
    }
  }, [user]);

  // Kick off fetches in parallel once auth is ready.
  useEffect(() => {
    if (!isReady) return;
    void loadImprint();
    void loadAway();
    void loadDraft();
    // Record this visit AFTER the away-fetch baseline is captured.
    return () => {
      try { localStorage.setItem(LAST_VISIT_KEY, new Date().toISOString()); } catch { /* noop */ }
    };
  }, [isReady, loadImprint, loadAway, loadDraft]);

  const acknowledgeScale = useCallback(() => {
    try { localStorage.setItem(SCALE_SEEN_KEY, "1"); } catch { /* noop */ }
    setScaleSeen(true);
  }, []);

  // ── Render ──

  const firstName = profile?.firstName || "";
  const sectorFocus = profile?.sectorFocus || "";
  const profileResolved = profile !== null;

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
      {/* a. MASTHEAD */}
      <header style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 18 }}>
          <AuraLogo size={36} variant="light" withWordmark />
          <div style={{ textAlign: "end" }}>
            <Eyebrow>
              {profileResolved
                ? (sectorFocus || "Awaiting sector")
                : <span style={{ display: "inline-block", verticalAlign: "middle" }}><SkeletonLine width={140} height={11} /></span>}
            </Eyebrow>
            <div
              style={{
                marginTop: 4,
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.10em",
                color: "var(--ink-3)",
              }}
            >
              {formatDateLine(now)}
            </div>
          </div>
        </div>
        <div className="tick-rule" style={{ color: "var(--rule)" }} aria-hidden />
      </header>

      {/* b. SALUTATION */}
      <section style={{ marginBottom: 22 }}>
        {profileResolved ? (
          <h1
            style={{
              fontFamily: "var(--font-serif)",
              fontWeight: 400,
              fontSize: 36,
              lineHeight: 1.15,
              letterSpacing: "-0.01em",
              margin: 0,
              color: "var(--ink)",
            }}
          >
            {greeting(now)}{firstName ? `, ${firstName}` : ""}.
          </h1>
        ) : (
          <SkeletonLine width="55%" height={36} />
        )}
      </section>

      {/* c. STANDING LINE */}
      <section style={{ marginBottom: 36 }}>
        {imprint.status === "loading" && <SkeletonLine width="70%" height={22} />}
        {imprint.status === "error" && <ErrorLine what="standing line" onRetry={loadImprint} />}
        {imprint.status === "ready" && (
          <>
            <p
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: 22,
                lineHeight: 1.45,
                color: "var(--ink)",
                margin: 0,
              }}
            >
              {(() => {
                const v = imprint.data.imprint;
                const d = imprint.data.delta;
                if (v == null) return "Your Imprint is forming — it sharpens with every capture.";
                const directionPhrase =
                  d == null ? "" :
                  d > 1 ? ", rising this week" :
                  d < -1 ? ", settling this week" :
                  ", steady this week";
                return `Your Imprint is ${v}${directionPhrase}.`;
              })()}
            </p>
            {!scaleSeen && imprint.data.imprint != null && (
              <div
                style={{
                  marginTop: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--ink-3)",
                }}
              >
                <span>Imprint · 0–100 · how present your expertise is</span>
                <button
                  type="button"
                  onClick={acknowledgeScale}
                  aria-label="Dismiss explanation"
                  style={{
                    background: "transparent",
                    border: 0,
                    padding: "2px 6px",
                    cursor: "pointer",
                    color: "var(--ink-3)",
                    fontFamily: "inherit",
                    fontSize: "inherit",
                  }}
                >
                  Got it
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* d. WHILE YOU WERE AWAY */}
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
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {signals.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onSwitchTab?.("intelligence")}
                  style={{
                    textAlign: "start",
                    background: "transparent",
                    border: 0,
                    borderInlineStart: "2px solid var(--rule)",
                    paddingInline: "12px 0",
                    paddingBlock: 2,
                    cursor: "pointer",
                    color: "var(--ink)",
                    fontFamily: "var(--font-serif)",
                    fontSize: 19,
                    lineHeight: 1.4,
                  }}
                >
                  {s.title}
                </button>
              ))}
              {(signalCount > signals.length || newCaptureCount > 0) && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.10em", color: "var(--ink-3)", marginTop: 2 }}>
                  {signalCount > signals.length && <>{signalCount - signals.length} more signal{signalCount - signals.length === 1 ? "" : "s"}</>}
                  {signalCount > signals.length && newCaptureCount > 0 && " · "}
                  {newCaptureCount > 0 && <>{newCaptureCount} new capture{newCaptureCount === 1 ? "" : "s"}</>}
                </div>
              )}
            </div>
          );
        })()}
      </section>

      {/* e. READY DRAFT */}
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
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div
                dir="auto"
                style={{
                  fontFamily: "var(--font-serif)",
                  fontSize: 22,
                  lineHeight: 1.4,
                  color: "var(--ink)",
                }}
              >
                {deriveHook(draftState.data.draft.body) || "Untitled draft"}
              </div>
              {draftState.data.preview && (
                <p
                  dir="auto"
                  style={{
                    margin: 0,
                    color: "var(--ink-2)",
                    fontSize: 16,
                    lineHeight: 1.6,
                  }}
                >
                  {draftState.data.preview}
                </p>
              )}
              <div>
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
                  Open in Composer →
                </button>
              </div>
            </div>
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

      {/* New-user empty hint — only when nothing at all is loaded for any section. */}
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
      `}</style>

      {/* Language attribute hint for AR mirroring without changing existing dir wiring. */}
      {language === "ar" && <span aria-hidden lang="ar" style={{ display: "none" }} />}
    </motion.div>
  );
}