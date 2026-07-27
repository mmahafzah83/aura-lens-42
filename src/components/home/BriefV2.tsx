import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronRight, Link as LinkIcon, Mic, Type as TypeIcon, FileUp, ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import useTierFromImprint from "@/hooks/useTierFromImprint";
import useJourneyState from "@/hooks/useJourneyState";
import { trackSignalOpen } from "@/lib/trackSignalOpen";
import InsightCards from "@/components/home/InsightCards";
import { ButtonPrimary, ButtonDark, Chip, IconTile, StatCard, Avatar } from "@/components/systemb";
import type { BriefDraft } from "@/components/Brief";

/**
 * BriefV2 — System-B V23 home.
 *
 * One screen: what happened, and what to do. Every number comes from a data
 * source that already exists; anything without one is omitted rather than
 * stubbed. Colour law: blue = your turn, cyan = the machine is awake,
 * amber = a clock is running (only where a real fading/expiry field says so).
 */

interface BriefV2Props {
  onOpenCapture: (mode?: string) => void;
  onSwitchTab: (tab: string) => void;
  onOpenSignal: (signalId: string) => void;
  onOpenDraft: (draft: BriefDraft) => void;
  onDraftToStudio?: (prefill: any) => void;
  onOpenBrandAssessment?: () => void;
}

interface SignalRow {
  id: string;
  title: string;
  velocity: string | null;
  strength: number | null;
  createdAt: string | null;
  captures: number;
}

interface DraftRow {
  id: string;
  body: string;
  language: "en" | "ar";
  type: BriefDraft["type"];
  topic: string | null;
  source: "content_items" | "linkedin_posts";
  words: number;
}

interface MoveRow {
  title: string;
  reason: string;
  action_type: string;
  signal_id?: string | null;
  signal_title?: string | null;
}

interface OvernightState {
  lastRunAt: string | null;
  headline: string | null;
  why: string | null;
  source: string | null;
  draft: DraftRow | null;
}

const FF = { fontFamily: "var(--ff-ui)" } as const;
const MONO: React.CSSProperties = {
  fontFamily: "var(--ff-mono)", fontVariantNumeric: "tabular-nums",
};

function greetingWord(d: Date): string {
  const h = d.getHours();
  if (h >= 22 || h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function hhmm(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

function ageLabel(iso: string | null): string {
  if (!iso) return "—";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "today";
  return `${days}d`;
}

function isFading(v: string | null): boolean {
  const s = (v || "").toLowerCase();
  return s.includes("fad") || s.includes("expir") || s.includes("decay");
}
function isCooling(v: string | null): boolean {
  return (v || "").toLowerCase().includes("cool");
}

function startOfWeekIso(): string {
  const now = new Date();
  const offset = (now.getDay() + 6) % 7;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
  return monday.toISOString();
}
function startOfMonthIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}
function wordCount(s: string): number {
  return (s || "").trim().split(/\s+/).filter(Boolean).length;
}
function isArabic(s: string): boolean {
  return /[\u0600-\u06FF]/.test(s || "");
}

// ── Atoms ───────────────────────────────────────────────────────────

const Card: React.FC<React.PropsWithChildren<{ interactive?: boolean; style?: React.CSSProperties; onClick?: () => void }>> = ({ children, interactive, style, onClick }) => (
  <div
    onClick={onClick}
    style={{
      background: "var(--surface-card)",
      border: "1px solid var(--rule-outer)",
      borderRadius: 16,
      boxShadow: "var(--v23-card-rest)",
      padding: 18,
      cursor: interactive ? "pointer" : undefined,
      transition: "box-shadow .18s ease, transform .18s ease",
      ...style,
    }}
    onMouseEnter={interactive ? (e) => {
      e.currentTarget.style.boxShadow = "var(--v23-card-hover)";
      e.currentTarget.style.transform = "translateY(-1px)";
    } : undefined}
    onMouseLeave={interactive ? (e) => {
      e.currentTarget.style.boxShadow = "var(--v23-card-rest)";
      e.currentTarget.style.transform = "none";
    } : undefined}
  >{children}</div>
);

const SectionLabel: React.FC<React.PropsWithChildren> = ({ children }) => (
  <div style={{
    ...MONO, fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase",
    color: "var(--text-muted)", marginBottom: 10,
  }}>{children}</div>
);

/** Leading status dot for signal rows — colour law, no text. */
const StatusDot: React.FC<{ tone: "live" | "clock" | "cooling" }> = ({ tone }) => (
  <span aria-hidden style={{
    width: 7, height: 7, borderRadius: 999, flexShrink: 0,
    background: tone === "live" ? "var(--machine)" : tone === "clock" ? "var(--deadline)" : "var(--border-strong)",
  }} />
);

const LinkAction: React.FC<React.PropsWithChildren<{ onClick: () => void }>> = ({ onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      background: "transparent", border: 0, padding: 0, cursor: "pointer",
      color: "var(--act)", fontSize: 13, fontWeight: 600, fontFamily: "var(--ff-ui)",
      display: "inline-flex", alignItems: "center", gap: 4,
    }}
  >{children}<ArrowRight size={13} /></button>
);

// ── Component ───────────────────────────────────────────────────────

export default function BriefV2({
  onOpenCapture, onSwitchTab, onOpenSignal, onOpenDraft, onDraftToStudio, onOpenBrandAssessment,
}: BriefV2Props) {
  const { user, isReady } = useAuthReady();
  const tierInfo = useTierFromImprint(user?.id ?? null);
  const journey = useJourneyState(user?.id ?? null);

  const [firstName, setFirstName] = useState("");
  const [imprint, setImprint] = useState<number | null>(null);
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [capturesWeek, setCapturesWeek] = useState<number | null>(null);
  const [publishedMonth, setPublishedMonth] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [overnight, setOvernight] = useState<OvernightState>({ lastRunAt: null, headline: null, source: null, draft: null });
  const [moves, setMoves] = useState<MoveRow[]>([]);
  const [movedOvernight, setMovedOvernight] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const uid = user.id;
    const weekIso = startOfWeekIso();
    const monthIso = startOfMonthIso();
    const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();

    const [
      profRes, impRes, sigRes, entRes, docRes, pubRes, ciRes, lpRes, findRes, ghostRes, movedRes,
    ] = await Promise.all([
      supabase.from("diagnostic_profiles").select("first_name").eq("user_id", uid).maybeSingle(),
      supabase.from("imprint_snapshots").select("imprint").eq("user_id", uid).order("created_at", { ascending: false }).limit(1),
      (supabase.from("strategic_signals" as any) as any)
        .select("id, signal_title, velocity_status, strength_score, created_at, supporting_evidence_ids")
        .eq("user_id", uid).eq("status", "active").limit(60),
      supabase.from("entries").select("id", { count: "exact", head: true }).eq("user_id", uid).gte("created_at", weekIso),
      supabase.from("documents").select("id", { count: "exact", head: true }).eq("user_id", uid).gte("created_at", weekIso),
      (supabase.from("linkedin_posts" as any) as any)
        .select("id", { count: "exact", head: true }).eq("user_id", uid).gte("published_at", monthIso),
      supabase.from("content_items")
        .select("id, type, body, language, generation_params, created_at")
        .eq("user_id", uid).eq("status", "draft").order("created_at", { ascending: false }).limit(6),
      (supabase.from("linkedin_posts" as any) as any)
        .select("id, post_text, created_at, source_metadata")
        .eq("user_id", uid).eq("tracking_status", "draft").order("created_at", { ascending: false }).limit(6),
      (supabase.from("agent_findings" as any) as any)
        .select("id, title, implication, source, created_at")
        .eq("user_id", uid).order("created_at", { ascending: false }).limit(1),
      (supabase.from("linkedin_posts" as any) as any)
        .select("id, post_text, created_at, source_metadata")
        .eq("user_id", uid).eq("tracking_status", "draft")
        .eq("source_metadata->>ghost_draft", "true")
        .order("created_at", { ascending: false }).limit(1),
      (supabase.from("strategic_signals" as any) as any)
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid).eq("status", "active").gte("created_at", dayAgo),
    ]);

    setFirstName(((profRes.data as any)?.first_name || "").toString().trim());
    const imp = ((impRes.data as any) || [])[0]?.imprint;
    setImprint(typeof imp === "number" ? Math.round(imp) : null);

    const sigRows = ((sigRes?.data as any[]) || []).map((r: any): SignalRow => ({
      id: r.id,
      title: r.signal_title || "Untitled signal",
      velocity: r.velocity_status ?? null,
      strength: typeof r.strength_score === "number" ? Math.round(r.strength_score) : null,
      createdAt: r.created_at ?? null,
      captures: Array.isArray(r.supporting_evidence_ids) ? r.supporting_evidence_ids.length : 0,
    }));
    // Ranked by how soon they stop being useful: fading first, then strength.
    sigRows.sort((a, b) => {
      const fa = isFading(a.velocity) ? 0 : isCooling(a.velocity) ? 2 : 1;
      const fb = isFading(b.velocity) ? 0 : isCooling(b.velocity) ? 2 : 1;
      if (fa !== fb) return fa - fb;
      return (b.strength ?? 0) - (a.strength ?? 0);
    });
    setSignals(sigRows);

    setCapturesWeek((entRes?.count ?? 0) + (docRes?.count ?? 0));
    setPublishedMonth(pubRes?.count ?? 0);
    setMovedOvernight(movedRes?.count ?? null);

    const draftRows: DraftRow[] = [];
    for (const r of (((ciRes?.data as any[]) || []))) {
      const body = r.body || "";
      draftRows.push({
        id: r.id, body,
        language: r.language === "ar" || isArabic(body) ? "ar" : "en",
        type: r.type === "carousel" ? "carousel" : r.type === "framework" ? "framework" : "linkedin_post",
        topic: r?.generation_params?.topic ?? null,
        source: "content_items", words: wordCount(body),
      });
    }
    for (const r of (((lpRes?.data as any[]) || []))) {
      const body = r.post_text || "";
      draftRows.push({
        id: r.id, body,
        language: isArabic(body) ? "ar" : "en",
        type: "linkedin_post",
        topic: (r.source_metadata || {})?.topic ?? null,
        source: "linkedin_posts", words: wordCount(body),
      });
    }
    setDrafts(draftRows.slice(0, 4));

    const finding = (((findRes?.data as any[]) || []))[0];
    const ghost = (((ghostRes?.data as any[]) || []))[0];
    setOvernight({
      lastRunAt: finding?.created_at ?? null,
      headline: (finding?.implication || finding?.title || null),
      source: finding?.source ?? null,
      draft: ghost ? {
        id: ghost.id, body: ghost.post_text || "",
        language: isArabic(ghost.post_text || "") ? "ar" : "en",
        type: "linkedin_post", topic: (ghost.source_metadata || {})?.topic ?? null,
        source: "linkedin_posts", words: wordCount(ghost.post_text || ""),
      } : null,
    });
  }, [user]);

  useEffect(() => {
    if (!isReady || !user) return;
    void load().catch((e) => console.warn("[BriefV2] load failed", e));
  }, [isReady, user, load]);

  useEffect(() => {
    const h = () => { void load().catch(() => {}); };
    window.addEventListener("capture-complete", h);
    return () => window.removeEventListener("capture-complete", h);
  }, [load]);

  // This week's moves — the existing auras-read engine.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.functions.invoke("auras-read", { body: { user_id: user.id } });
        if (cancelled) return;
        setMoves(Array.isArray(data?.items) ? data.items.slice(0, 3) : []);
      } catch { if (!cancelled) setMoves([]); }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const velocityById = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const s of signals) m.set(s.id, s.velocity);
    return m;
  }, [signals]);

  const firstFlightSteps = useMemo(() => ([
    { label: "Complete your profile", done: journey.profileComplete, go: () => onSwitchTab("identity") },
    { label: "Take the brand assessment", done: journey.assessmentComplete, go: () => (onOpenBrandAssessment ? onOpenBrandAssessment() : onSwitchTab("identity")) },
    { label: "Capture three sources", done: journey.capturesReady, go: onOpenCapture },
    { label: "Publish your first post", done: journey.hasPublished, go: () => onSwitchTab("authority") },
  ]), [journey, onOpenCapture, onSwitchTab, onOpenBrandAssessment]);
  const ffDone = firstFlightSteps.filter(s => s.done).length;
  const showFirstFlight = !journey.loading && ffDone < firstFlightSteps.length;

  const stats: Array<{ label: string; value: string; sub?: string }> = [];
  if (imprint != null) stats.push({ label: "Imprint", value: String(imprint), sub: tierInfo.currentTier?.name ?? undefined });
  stats.push({ label: "Live signals", value: String(signals.length) });
  if (capturesWeek != null) stats.push({ label: "Captures this week", value: String(capturesWeek) });
  if (publishedMonth != null) stats.push({ label: "Published this month", value: String(publishedMonth) });

  const openSignal = (id: string) => {
    try { trackSignalOpen(id, "home_briefv2_row"); } catch { /* never blocks */ }
    onOpenSignal(id);
  };

  return (
    <div style={{ ...FF, maxWidth: 880, margin: "0 auto", display: "flex", flexDirection: "column", gap: 22, paddingBottom: 40 }}>

      {/* 1 · GREETING */}
      <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 650, color: "var(--text-primary)", lineHeight: 1.2, margin: 0 }}>
            {greetingWord(new Date())}{firstName ? `, ${firstName}` : ""}
          </h1>
          {movedOvernight != null && movedOvernight > 0 && (
            <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--text-secondary)" }}>
              <span style={MONO}>{movedOvernight}</span> {movedOvernight === 1 ? "signal" : "signals"} moved overnight.
            </p>
          )}
        </div>
        <PrimaryButton onClick={onOpenCapture}>Capture</PrimaryButton>
      </header>

      {/* 2 · FIRST FLIGHT */}
      {showFirstFlight && (
        <Card>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <SectionLabel>First flight</SectionLabel>
            <span style={{ ...MONO, fontSize: 11.5, color: "var(--text-secondary)" }}>
              {ffDone} of {firstFlightSteps.length}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {firstFlightSteps.map((s, i) => (
              <button
                key={s.label}
                type="button"
                onClick={s.done ? undefined : s.go}
                style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%",
                  background: "transparent", border: 0, textAlign: "left",
                  borderTop: i === 0 ? "none" : "1px solid var(--rule-divider)",
                  padding: "10px 0", cursor: s.done ? "default" : "pointer",
                  fontFamily: "var(--ff-ui)",
                }}
              >
                <span style={{
                  width: 16, height: 16, borderRadius: 999, flexShrink: 0,
                  border: s.done ? "none" : "1.5px solid var(--border-strong)",
                  background: s.done ? "var(--g-600)" : "transparent",
                }} />
                <span style={{ flex: 1, fontSize: 14, color: s.done ? "var(--text-secondary)" : "var(--text-primary)" }}>
                  {s.label}
                </span>
                {!s.done && <ChevronRight size={15} style={{ color: "var(--act)" }} />}
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* 3 · THIS WEEK */}
      {moves.length > 0 && (
        <Card>
          <SectionLabel>This week</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {moves.map((m, i) => {
              const fading = !!m.signal_id && isFading(velocityById.get(m.signal_id) ?? null);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    if (m.action_type === "CAPTURE") return onOpenCapture();
                    if (m.signal_id && onDraftToStudio) {
                      return onDraftToStudio({ topic: m.title, context: m.reason, signalId: m.signal_id, signalTitle: m.signal_title ?? undefined });
                    }
                    onSwitchTab(m.action_type === "PUBLISH" ? "authority" : "intelligence");
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
                    background: "transparent", border: 0, cursor: "pointer",
                    borderTop: i === 0 ? "none" : "1px solid var(--rule-divider)",
                    padding: "11px 0", fontFamily: "var(--ff-ui)",
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: "var(--text-primary)" }}>{m.title}</span>
                  <Chip tone="neutral">{m.action_type}</Chip>
                  {fading && <Chip tone="clock">Fading</Chip>}
                  <ChevronRight size={15} style={{ color: "var(--text-muted)" }} />
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {/* 3b · INSIGHT CARDS — real data only, empty cards omit themselves */}
      <InsightCards userId={user?.id ?? null} onSwitchTab={onSwitchTab} />

      {/* 4 · STAT STRIP */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(150px, 1fr))`, gap: 12 }}>
        {stats.map((s) => (
          <Card key={s.label} style={{ padding: 14 }}>
            <div style={{ ...MONO, fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--text-muted)" }}>
              {s.label}
            </div>
            <div style={{ ...MONO, fontSize: 26, fontWeight: 600, color: "var(--text-primary)", marginTop: 6, lineHeight: 1.1 }}>
              {s.value}
            </div>
            {s.sub && <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{s.sub}</div>}
          </Card>
        ))}
      </div>

      {/* 5 · THE OVERNIGHT — the one earned dark card */}
      {(overnight.headline || overnight.draft) && (
        <section
          data-surface="dark"
          style={{
            background: "var(--v23-night)", border: "1px solid var(--v23-night-line)",
            borderRadius: 16, padding: 18,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: "var(--machine)" }} />
            <span style={{ ...MONO, fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--machine)" }}>
              The Overnight{overnight.lastRunAt ? ` · ${hhmm(overnight.lastRunAt)}` : ""}
            </span>
          </div>
          {overnight.headline && (
            <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: "var(--text-inverse)" }}>
              {overnight.headline}
            </p>
          )}
          {overnight.source && (
            <div style={{ ...MONO, fontSize: 11, color: "var(--v23-on-night)", marginTop: 8 }}>{overnight.source}</div>
          )}
          {overnight.draft && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--v23-night-line)" }}>
              <p
                dir={overnight.draft.language === "ar" ? "rtl" : "ltr"}
                style={{
                  margin: "0 0 12px", fontSize: 14,
                  lineHeight: overnight.draft.language === "ar" ? 1.9 : 1.6,
                  fontFamily: overnight.draft.language === "ar" ? "var(--ff-ar)" : "var(--ff-ui)",
                  color: "var(--v23-on-night)",
                  textAlign: overnight.draft.language === "ar" ? "right" : "left",
                }}
              >
                {overnight.draft.body.slice(0, 220)}
              </p>
              <PrimaryButton onClick={() => onOpenDraft({
                id: overnight.draft!.id, body: overnight.draft!.body,
                language: overnight.draft!.language, type: "linkedin_post",
                topic: overnight.draft!.topic, _source: "linkedin_posts",
              })}>Read the draft</PrimaryButton>
            </div>
          )}
        </section>
      )}

      {/* 6 · SIGNALS */}
      {signals.length > 0 && (
        <Card>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
            <SectionLabel>Signals</SectionLabel>
            <LinkAction onClick={() => onSwitchTab("intelligence")}>All signals</LinkAction>
          </div>
          <p style={{ margin: "0 0 10px", fontSize: 12.5, color: "var(--text-secondary)" }}>
            Ranked by how soon they stop being useful.
          </p>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {signals.slice(0, 5).map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => openSignal(s.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
                  background: "transparent", border: 0, cursor: "pointer",
                  borderTop: i === 0 ? "none" : "1px solid var(--rule-divider)",
                  padding: "11px 0", fontFamily: "var(--ff-ui)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    dir={isArabic(s.title) ? "rtl" : "ltr"}
                    style={{
                      fontSize: 14, color: "var(--text-primary)",
                      fontFamily: isArabic(s.title) ? "var(--ff-ar)" : "var(--ff-ui)",
                      lineHeight: isArabic(s.title) ? 1.9 : 1.45,
                    }}
                  >{s.title}</div>
                  <div style={{ ...MONO, fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
                    {s.captures} captures · {ageLabel(s.createdAt)}
                  </div>
                </div>
                {isFading(s.velocity)
                  ? <Chip tone="clock">Act now</Chip>
                  : isCooling(s.velocity)
                    ? <Chip tone="neutral">Cooling</Chip>
                    : <Chip tone="machine">Live</Chip>}
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* 7 · READY TO PUBLISH */}
      {drafts.length > 0 && (
        <Card>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
            <SectionLabel>Ready to publish</SectionLabel>
            <LinkAction onClick={() => onSwitchTab("authority")}>Open Composer</LinkAction>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
            {drafts.map((d) => (
              <div
                key={`${d.source}-${d.id}`}
                role="button"
                tabIndex={0}
                onClick={() => onOpenDraft({ id: d.id, body: d.body, language: d.language, type: d.type, topic: d.topic, _source: d.source })}
                onKeyDown={(e) => { if (e.key === "Enter") onOpenDraft({ id: d.id, body: d.body, language: d.language, type: d.type, topic: d.topic, _source: d.source }); }}
                style={{
                  border: "1px solid var(--rule-outer)", borderRadius: 12, padding: 12,
                  background: "var(--surface-card)", cursor: "pointer",
                }}
              >
                <div
                  dir={d.language === "ar" ? "rtl" : "ltr"}
                  style={{
                    fontSize: 13.5, color: "var(--text-primary)",
                    fontFamily: d.language === "ar" ? "var(--ff-ar)" : "var(--ff-ui)",
                    lineHeight: d.language === "ar" ? 1.9 : 1.55,
                    textAlign: d.language === "ar" ? "right" : "left",
                    display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
                  }}
                >{d.topic || d.body}</div>
                <div style={{ ...MONO, fontSize: 10.5, color: "var(--text-muted)", marginTop: 8, textTransform: "uppercase", letterSpacing: ".1em" }}>
                  {d.language} · {d.words} words
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 8 · CAPTURE STRIP */}
      <Card interactive onClick={onOpenCapture} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>
          Capture something — a link or a note.
        </span>
        <LinkAction onClick={onOpenCapture}>Capture</LinkAction>
      </Card>
    </div>
  );
}