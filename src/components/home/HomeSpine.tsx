import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWidgetData } from "@/components/widgets/useWidgetData";
import { DRAFT_OPEN_COLUMNS, draftFromLinkedInPost } from "@/lib/draftOpen";
import { toast } from "@/hooks/use-toast";
import AuraLogo from "@/components/brand/AuraLogo";
import ResumeJourneyCard from "@/components/home/ResumeJourneyCard";
import HomeMasthead from "@/components/home/HomeMasthead";
import {
  useHomeAddress, useReadChips, useSignalsStrengthened,
  type HomeMove,
} from "@/hooks/useHomeAddress";
import { MONO, Kicker, Card, Body, Muted, ActButton, Skeleton, ReadFailure } from "./homeAtoms";
import { ShapeLens } from "./lenses";
import {
  buildShelf, MovesCard, StandCard, OwnCard, NightCard, WidgetsCard,
  type ShelfKey, type OwnedTheme,
} from "./shelf";

/**
 * HomeSpine — one stage, three lenses, a shelf.
 *
 * The address is written by the chief-of-staff function and cached per day;
 * everything else on this page is drawn from facts and real rows. No value
 * here is a hex literal — every colour is a token from src/index.css.
 */

export interface HomeSpineProps {
  userId: string | null | undefined;
  onSwitchTab: (tab: string) => void;
  onStartSignalPost: (p: { topic: string; context: string; signalId: string; signalTitle: string }) => void;
  onOpenDraft?: (d: { id: string; body: string; language: "en" | "ar"; type: "carousel" | "framework" | "linkedin_post"; topic?: string | null }) => void;
  /** First Flight owns the capture call-to-action while it is running. */
  guidedActive?: boolean;
  /** The dashboard tab currently on screen — used for aria-current on the index. */
  activeTab?: string;
}

const collapseKey = (uid: string) => `aura_home_address_collapsed_${uid}`;
const draftDismissKey = (id: string) => `move_dismissed_${id}_${new Date().toISOString().slice(0, 10)}`;

/** Map a stored cta_route onto the dashboard's tabs. */
function tabForRoute(route: string): string | null {
  const m = /[?&]tab=([a-z_]+)/i.exec(route || "");
  const t = m?.[1]?.toLowerCase() ?? null;
  if (!t) return null;
  if (t === "signals") return "intelligence";
  if (t === "composer" || t === "studio") return "authority";
  if (t === "analytics") return "influence";
  return t;
}

const plainOf = (md: string) =>
  md.replace(/[#*_`>]/g, "").replace(/\s*\n+\s*/g, " ").replace(/\s{2,}/g, " ").trim();

/** Split the address into whole sentences — never cut mid-sentence. */
const sentencesOf = (md: string): string[] =>
  plainOf(md).split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);

const firstSentence = (md: string) => sentencesOf(md)[0] ?? plainOf(md);

/** A comparable stem so the same title is never printed twice in one card. */
const stemOf = (t: string) =>
  t.toLowerCase().replace(/[…]/g, "").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);

/** Shorten only a button label; the full title always rides on `title`. */
const shortLabel = (t: string, max = 52) => (t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`);

export default function HomeSpine({ userId, onSwitchTab, onOpenDraft, guidedActive, activeTab }: HomeSpineProps) {
  const uid = userId ?? "anon";
  const address = useHomeAddress(userId);
  const facts = address.facts;
  const { chips, failed: chipsFailed, refresh: refreshChips } = useReadChips(userId, facts);
  // Ruling 2: the real join, not the raw theme-string count.
  const strengthened = useSignalsStrengthened(userId);

  const { layout, metrics, failed: widgetsFailed, reload: reloadWidgets } = useWidgetData(userId);
  const [themes, setThemes] = useState<OwnedTheme[]>([]);
  const [themesLoading, setThemesLoading] = useState(true);
  const [themesFailed, setThemesFailed] = useState(false);
  const [themesNonce, setThemesNonce] = useState(0);

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(collapseKey(uid)) === "1"; } catch { return false; }
  });
  const [onStage, setOnStage] = useState<ShelfKey | null>(null);
  const [draftDismissed, setDraftDismissed] = useState(false);
  // Which move the address footer is offering. "Not today" promotes the next.
  const [moveIdx, setMoveIdx] = useState(0);
  // The address above the fold is three sentences; the remainder waits here.
  const [showRest, setShowRest] = useState(false);

  // ── supporting reads ─────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    setThemesLoading(true);
    (async () => {
      const { data, error } = await (supabase.from("strategic_signals" as any) as any)
        .select("id, signal_title, fragment_count, velocity_status")
        .eq("user_id", userId).eq("status", "active")
        .order("fragment_count", { ascending: false, nullsFirst: false }).limit(6);
      if (!alive) return;
      setThemesLoading(false);
      if (error) {
        // A failed read never wipes signals already on screen.
        console.warn("[HomeSpine] strategic_signals read failed", error);
        setThemesFailed(true);
        return;
      }
      setThemesFailed(false);
      setThemes(((data as any[]) || []).map((s) => ({
        id: s.id, title: s.signal_title, fragments: s.fragment_count ?? 0, velocity: s.velocity_status ?? null,
      })));
    })();
    return () => { alive = false; };
  }, [userId, themesNonce]);

  const empty = !!facts && !address.errored && (facts.captures_total ?? 0) === 0;
  const firstRun = (facts?.days_since_signup ?? 99) <= 1;

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem(collapseKey(uid), next ? "1" : "0"); } catch { /* noop */ }
      return next;
    });
  };

  const goRoute = useCallback((route: string) => {
    const tab = tabForRoute(route);
    if (!tab) return;
    // The tab is resolved exactly as before, but the rest of the stored route
    // (signal, draft, src, format, from) rides along so the dashboard's own
    // deep-link handlers can act on it instead of dropping the subject.
    const qs = route.includes("?") ? route.slice(route.indexOf("?") + 1) : "";
    const carried = new URLSearchParams(qs);
    carried.delete("tab");
    if (Array.from(carried.keys()).length > 0) {
      window.dispatchEvent(new CustomEvent("aura:switch-tab", {
        detail: { tab, params: carried.toString() },
      }));
    } else {
      onSwitchTab(tab);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [onSwitchTab]);


  const openAsk = useCallback((prompt: string) => {
    try {
      window.dispatchEvent(new CustomEvent("aura-open-chat", { detail: { prompt } }));
    } catch { /* noop */ }
  }, []);

  const publishDraft = useCallback(async (id: string) => {
    if (!onOpenDraft) { onSwitchTab("authority"); return; }
    const { data, error } = await (supabase.from("linkedin_posts" as any) as any)
      .select(DRAFT_OPEN_COLUMNS).eq("id", id).maybeSingle();
    const row: any = data;
    if (error || !row) {
      toast({ title: "That draft could not be opened" });
      return;
    }
    onOpenDraft({ ...draftFromLinkedInPost(row), id });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [onOpenDraft, onSwitchTab]);

  const dismissDraft = useCallback((id: string) => {
    try { localStorage.setItem(draftDismissKey(id), "1"); } catch { /* noop */ }
    setDraftDismissed(true);
  }, []);

  useEffect(() => {
    const id = facts?.last_night?.newest_signal_draft?.id;
    if (!id) return;
    try { setDraftDismissed(localStorage.getItem(draftDismissKey(id)) === "1"); } catch { /* noop */ }
  }, [facts?.last_night?.newest_signal_draft?.id]);

  const moves: HomeMove[] = address.row?.moves ?? [];
  const activeMove: HomeMove | null = moves[moveIdx] ?? moves[0] ?? null;
  const shelf = useMemo(
    () => buildShelf(facts, moves, facts?.signals_active ?? themes.length, layout, metrics),
    [facts, moves, themes.length, layout, metrics],
  );

  const generatedAt = address.row?.generated_at ?? null;
  const generatedLabel = generatedAt
    ? new Date(generatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : null;

  // ── three beats: one observation, one recommendation, one action ──
  const moveTitle = activeMove?.title ?? activeMove?.what ?? "";
  const addressBeats = useMemo(() => {
    const all = address.row?.address_md ? sentencesOf(address.row.address_md) : [];
    if (!all.length) return { observation: "", recommendation: [] as string[], rest: [] as string[] };
    const observation = all[0];
    const obsStem = stemOf(observation);
    const titleStem = stemOf(moveTitle);
    const tail = all.slice(1).filter((s) => {
      if (!titleStem || titleStem.length < 12) return true;
      // The title already appears in the observation — do not print it twice.
      return !(obsStem.includes(titleStem.slice(0, 24)) && stemOf(s).includes(titleStem.slice(0, 24)));
    });
    return { observation, recommendation: tail.slice(0, 2), rest: tail.slice(2) };
  }, [address.row?.address_md, moveTitle]);

  // ── the stage ────────────────────────────────────────────────────
  const stage = (() => {
    if (onStage === "moves") return <MovesCard moves={moves} onGo={goRoute} />;
    if (onStage === "stand") return <StandCard facts={facts} userId={userId} />;
    if (onStage === "own") {
      return (
        <OwnCard
          themes={themes} loading={themesLoading} failed={themesFailed}
          onRetry={() => setThemesNonce((n) => n + 1)}
          onOpen={() => onSwitchTab("intelligence")}
        />
      );
    }
    if (onStage === "night") return (
      <NightCard facts={facts} strengthened={strengthened} onOpen={() => onSwitchTab("overnight")} />
    );
    if (onStage === "widgets") return (
      <WidgetsCard
        layout={layout} metrics={metrics} failed={widgetsFailed} onRetry={reloadWidgets}
        onEdit={() => onSwitchTab("widgets")}
      />
    );

    // Home ends in one screen: the shape is the only stage. The record now
    // lives on Momentum.
    return (
      <ShapeLens
        facts={facts} userId={userId}
        factsFailed={address.errored} onRetryFacts={address.refresh}
      />
    );
  })();

  const loadingAddress = address.loading && !address.row;
  const chipPrompts: { key: string; label: string; prompt: string; next?: boolean }[] = [
    {
      key: "evidence", label: "Show me the evidence first",
      prompt: moveTitle
        ? `Show me the evidence behind "${moveTitle}" before I act on it.`
        : "Show me the evidence behind today's read.",
    },
    {
      key: "other", label: "Not this one — pick another",
      prompt: "Not this one. Pick another move for me today and say why.",
      next: moves.length > moveIdx + 1,
    },
  ];

  return (
    <div className="home-spine" style={{ display: "grid", gap: 22, marginBlockStart: 22 }}>
      <HomeMasthead userId={userId} />
      <ResumeJourneyCard userId={userId ?? null} />
      {/* 1 — THE ADDRESS */}
      <section style={{
        background: "var(--v23-night)", borderRadius: 16, padding: "22px 24px",
        border: "1px solid var(--v23-night-line)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <AuraLogo size={22} variant="dark" />
          <span style={{ ...MONO, fontSize: 10.5, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--v23-on-night)" }}>
            Aura · your chief of staff
          </span>
          {generatedLabel && (
            <span style={{
              ...MONO, display: "inline-flex", alignItems: "center", gap: 6,
              fontSize: 10.5, letterSpacing: ".08em", color: "var(--machine)",
            }}>
              <span aria-hidden style={{ inlineSize: 6, blockSize: 6, borderRadius: 999, background: "var(--machine)" }} />
              Prepared {generatedLabel}
            </span>
          )}
          <button
            type="button" onClick={toggleCollapsed}
            aria-label={collapsed ? "Show the full address" : "Collapse the address"}
            className="ha-i"
            style={{
              marginInlineStart: "auto", background: "var(--v23-night-lift)", border: 0,
              borderRadius: 999, inlineSize: 30, blockSize: 30, cursor: "pointer",
              color: "var(--text-inverse)", display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}
          >
            {collapsed ? <ChevronDown size={16} aria-hidden /> : <ChevronUp size={16} aria-hidden />}
          </button>
        </div>

        <div style={{ marginBlockStart: 16 }}>
          {loadingAddress ? (
            <div style={{ display: "grid", gap: 10 }}>
              <Skeleton h={16} w="86%" />
              <Skeleton h={16} w="72%" />
              <Skeleton h={16} w="60%" />
            </div>
          ) : collapsed ? (
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: "var(--text-inverse)" }}>
              {address.row?.address_md
                ? firstSentence(address.row.address_md)
                : address.errored
                ? "Aura's read is not available right now. Everything below is still yours."
                : "Today's address is not written."}
            </p>
          ) : addressBeats.observation ? (
            <div style={{ display: "grid", gap: 10 }}>
              {/* beat 1 — one observation: the heading of the page body */}
              <h2 style={{
                margin: 0, fontSize: 21, lineHeight: 1.3, fontWeight: 700, letterSpacing: "-0.01em",
                color: "var(--text-inverse)", maxInlineSize: 640, fontFamily: "var(--font-body)",
              }}>{addressBeats.observation}</h2>
              {/* beat 2 — one recommendation, never more than two sentences */}
              {addressBeats.recommendation.length > 0 && (
                <p style={{
                  margin: 0, fontSize: 15, lineHeight: 1.65, color: "var(--v23-on-night)", maxInlineSize: 600,
                }}>{addressBeats.recommendation.join(" ")}</p>
              )}
              {addressBeats.rest.length > 0 && (
                <>
                  {showRest && (
                    <p style={{
                      margin: 0, fontSize: 15, lineHeight: 1.65, color: "var(--v23-on-night)", maxInlineSize: 600,
                    }}>{addressBeats.rest.join(" ")}</p>
                  )}
                  <button type="button" onClick={() => setShowRest((v) => !v)} className="ha-i ha-text" style={{
                    justifySelf: "start", background: "none", border: 0, padding: 0, cursor: "pointer",
                    fontFamily: "var(--font-body)", fontSize: 12.5, fontWeight: 600, color: "var(--v23-on-night)",
                    textDecoration: "underline", textUnderlineOffset: 3,
                  }}>{showRest ? "Hide the rest" : "Read the rest"}</button>
                </>
              )}
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: "var(--v23-on-night)" }}>
              {firstRun
                ? "You have just arrived. Capture one thing you read and the rest of this page fills itself in."
                : address.errored
                ? "Aura's read is not available right now. Everything below is still yours."
                : "Today's address could not be written. Everything below is still drawn from your own record."}
            </p>
          )}
        </div>

        {!collapsed && (
          <div style={{ display: "grid", gap: 10, marginBlockStart: 18 }}>
            {/* beat 3 — one blue action, two quiet chips */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              {activeMove && (
                <button
                  type="button" onClick={() => goRoute(activeMove.cta_route)}
                  title={moveTitle}
                  className="ha-i ha-act"
                  style={{
                    border: 0, borderRadius: 999, padding: "12px 22px", fontSize: 13.5, fontWeight: 700,
                    cursor: "pointer", background: "var(--act)", color: "var(--action-ink)",
                    fontFamily: "var(--font-body)",
                  }}
                >{shortLabel(moveTitle)}</button>
              )}
              {chipPrompts.map((c) => (
                <button
                  key={c.key} type="button"
                  onClick={() => { if (c.next) setMoveIdx((i) => i + 1); openAsk(c.prompt); }}
                  className="ha-i ha-nightchip"
                  style={{
                    borderRadius: 999, padding: "11px 16px", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                    background: "transparent", color: "var(--v23-on-night)",
                    border: "1px solid var(--v23-night-line)", fontFamily: "var(--font-body)",
                  }}
                >{c.label}</button>
              ))}
            </div>
            {activeMove && (
              <Muted style={{ fontSize: 12.5, color: "var(--v23-on-night)" }}>
                {activeMove.outcome} · about {activeMove.est_minutes} minutes
              </Muted>
            )}
            {chips.length > 0 && (
              <div style={{
                ...MONO, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
                marginBlockStart: 6, fontSize: 11.5, letterSpacing: ".04em", lineHeight: 1.6,
                color: "var(--on-dark-1, var(--text-inverse))",
              }}>
                <span style={{ opacity: .75 }}>BUILT FROM</span>
                <span>{chips.map((c) => c.label.toLowerCase()).join(" · ")}</span>
                <span
                  aria-label="Everything above is drawn from what you gave Aura and what you have captured."
                  title="Everything above is drawn from what you gave Aura and what you have captured."
                  style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    inlineSize: 15, blockSize: 15, borderRadius: 999, cursor: "help",
                    border: "1px solid var(--machine)", color: "var(--machine)", fontSize: 10, fontWeight: 700,
                  }}
                >i</span>
              </div>
            )}
            {chipsFailed && (
              <ReadFailure onRetry={refreshChips} style={{ marginBlockStart: 4 }} />
            )}
          </div>
        )}
      </section>

      {/* 2 — THE STAGE + THE SHELF */}
      <div style={{ display: "grid", gap: 18, gridTemplateColumns: "minmax(0, 2.1fr) minmax(240px, 1fr)", alignItems: "start" }}
           className="home-spine-grid">
        <div style={{ display: "grid", gap: 12, minInlineSize: 0 }}>
          {onStage && (
            <button type="button" onClick={() => setOnStage(null)} className="ha-i ha-text" style={{
              justifySelf: "start", background: "none", border: 0, padding: 0, cursor: "pointer",
              fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--act)",
              textDecoration: "none",
            }}>◂ Back to where you stand</button>
          )}

          <div id="home-stage" aria-live="polite">
          {address.loading && !facts ? (
            <Card style={{ display: "grid", gap: 12 }}>
              <Skeleton h={18} w="40%" />
              <Skeleton h={12} w="80%" />
              <Skeleton h={12} w="66%" />
              <Skeleton h={120} />
            </Card>
          ) : empty && !onStage ? (
            <Card style={{ display: "grid", gap: 12 }}>
              <Kicker>Start here</Kicker>
              <Body style={{ fontSize: 15, color: "var(--text-primary)" }}>
                Nothing has been captured yet, so there is nothing that happened to show — only where you
                stand today.
              </Body>
              {/* First Flight already offers the capture button — never two at once. */}
              {!guidedActive && (
                <div>
                  <ActButton onClick={() => {
                    try { window.dispatchEvent(new CustomEvent("aura:open-capture")); } catch { /* noop */ }
                  }}>Capture the first thing you read</ActButton>
                </div>
              )}
            </Card>
          ) : <div key={onStage ?? "shape"} className="home-stage">{stage}</div>}
          </div>

          {empty && !onStage && (
            <ShapeLens
              facts={facts} userId={userId}
              factsFailed={address.errored} onRetryFacts={address.refresh}
            />
          )}
        </div>

        {/* the shelf */}
        <aside style={{ display: "grid", gap: 10, minInlineSize: 0 }}>
          <Kicker as="h2">Look deeper</Kicker>
          {shelf.map((s) => {
            const on = onStage === s.key;
            return (
              <button
                key={s.key} type="button" onClick={() => setOnStage(on ? null : s.key)} aria-pressed={on}
                aria-controls="home-stage"
                className="ha-i ha-shelf"
                style={{
                  textAlign: "start", cursor: "pointer", borderRadius: 14, padding: "13px 14px",
                  background: "var(--surface-card)", fontFamily: "var(--font-body)",
                  border: on ? "1px solid var(--act)" : "1px solid var(--rule-outer)",
                  boxShadow: "var(--v23-card-rest)", display: "grid", gap: 5,
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  {s.machine && <span aria-hidden style={{
                    inlineSize: 6, blockSize: 6, borderRadius: 999, background: "var(--machine)",
                  }} />}
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)" }}>{s.title}</span>
                  <span aria-hidden className="ha-chev" style={{
                    marginInlineStart: "auto", fontSize: 12, color: "var(--text-muted)",
                  }}>▸</span>
                </span>
                <Muted style={{ fontSize: 12.5 }}>{s.fact}</Muted>
              </button>
            );
          })}

          {/* the quiet index — the rest of Aura, one row each */}
          <nav aria-label="Elsewhere in Aura" style={{
            marginBlockStart: 4, paddingBlockStart: 10, borderBlockStart: "1px solid var(--rule-divider)",
            display: "grid", gap: 2,
          }}>
            {([
              { label: "What happened", tab: "momentum" },
              { label: "Your signals", tab: "intelligence" },
              { label: "Your widgets", tab: "widgets" },
            ] as const).map((r) => {
              const current = activeTab === r.tab;
              return (
              <button
                key={r.tab} type="button"
                aria-label={`${r.label} — open this view`}
                aria-current={current ? "page" : undefined}
                onClick={() => { onSwitchTab(r.tab); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                className="ha-i ha-index"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                  background: "none", border: 0, padding: "8px 2px", cursor: "pointer",
                  fontFamily: "var(--font-body)", fontSize: 13, textAlign: "start",
                  color: current ? "var(--text-primary)" : "var(--text-secondary)",
                  fontWeight: current ? 700 : 400,
                }}
              >
                <span>{r.label}</span>
                <span aria-hidden className="ha-chev" style={{ fontSize: 12, color: "var(--text-muted)" }}>▸</span>
              </button>
            );
            })}
          </nav>
        </aside>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .home-spine-grid { grid-template-columns: minmax(0, 1fr) !important; }
        }
        .home-spine :focus-visible {
          outline: 2px solid var(--act);
          outline-offset: 2px;
          border-radius: 8px;
        }
        .home-spine section :focus-visible { outline-color: var(--act-fill); }
        .home-stage { animation: home-stage-in 180ms ease both; }
        @keyframes home-stage-in {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .home-stage { animation: none; }
        }
      `}</style>
    </div>
  );
}
