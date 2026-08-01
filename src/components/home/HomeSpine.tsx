import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { loadLayout, loadWidgetMetrics, DEFAULT_LAYOUT } from "@/components/widgets/widgetData";
import type { WidgetLayout, WidgetMetrics } from "@/components/widgets/widgetData";
import AuraLogo from "@/components/brand/AuraLogo";
import {
  useHomeAddress, useHomeLedger, useReadChips,
  type HomeLens, type HomeMove,
} from "@/hooks/useHomeAddress";
import { MONO, Kicker, Card, Body, Muted, ActButton, Skeleton } from "./homeAtoms";
import { RecordLens, RoomLens, ShapeLens } from "./lenses";
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
}

const LENS_LABEL: Record<HomeLens, string> = {
  record: "The Record", room: "The Room", shape: "The Shape",
};
const LENSES: HomeLens[] = ["record", "room", "shape"];

const collapseKey = (uid: string) => `aura_home_address_collapsed_${uid}`;
const lensKey = (uid: string) => `aura_home_lens_${uid}`;
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

const firstSentence = (md: string) => {
  const plain = md.replace(/[#*_`>]/g, "").trim();
  const m = /^(.+?[.?!])(\s|$)/.exec(plain);
  return (m?.[1] ?? plain).slice(0, 180);
};

/** Very small markdown: paragraphs, **bold**, and single line breaks. */
const Prose: React.FC<{ md: string }> = ({ md }) => (
  <div style={{ display: "grid", gap: 12 }}>
    {md.split(/\n{2,}/).map((para, i) => (
      <p key={i} style={{ margin: 0, fontSize: 15.5, lineHeight: 1.65, color: "var(--text-inverse)" }}>
        {para.split(/(\*\*[^*]+\*\*)/g).map((chunk, j) =>
          chunk.startsWith("**") && chunk.endsWith("**")
            ? <strong key={j} style={{ fontWeight: 700 }}>{chunk.slice(2, -2)}</strong>
            : <span key={j}>{chunk}</span>,
        )}
      </p>
    ))}
  </div>
);

export default function HomeSpine({ userId, onSwitchTab, onStartSignalPost, onOpenDraft }: HomeSpineProps) {
  const uid = userId ?? "anon";
  const address = useHomeAddress(userId);
  const ledger = useHomeLedger(userId);
  const facts = address.facts;
  const chips = useReadChips(userId, facts);

  const [layout, setLayout] = useState<WidgetLayout>(DEFAULT_LAYOUT);
  const [metrics, setMetrics] = useState<WidgetMetrics | null>(null);
  const [themes, setThemes] = useState<OwnedTheme[]>([]);
  const [memberName, setMemberName] = useState<string>("You");

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(collapseKey(uid)) === "1"; } catch { return false; }
  });
  const [override, setOverride] = useState<{ lens: HomeLens; reason: string } | null>(() => {
    try {
      const raw = localStorage.getItem(lensKey(uid));
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  const [onStage, setOnStage] = useState<ShelfKey | null>(null);
  const [draftDismissed, setDraftDismissed] = useState(false);

  // ── supporting reads ─────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      const [l, m, sigs, prof] = await Promise.all([
        loadLayout(userId),
        loadWidgetMetrics(userId),
        (supabase.from("strategic_signals" as any) as any)
          .select("id, signal_title, fragment_count, velocity_status")
          .eq("user_id", userId).eq("status", "active")
          .order("fragment_count", { ascending: false, nullsFirst: false }).limit(6),
        supabase.from("diagnostic_profiles").select("first_name, last_name").eq("user_id", userId).maybeSingle(),
      ]);
      if (!alive) return;
      setLayout(l); setMetrics(m);
      setThemes(((sigs?.data as any[]) || []).map((s) => ({
        id: s.id, title: s.signal_title, fragments: s.fragment_count ?? 0, velocity: s.velocity_status ?? null,
      })));
      const p: any = prof?.data;
      if (p) setMemberName([p.first_name, p.last_name].filter(Boolean).join(" ") || "You");
    })();
    return () => { alive = false; };
  }, [userId]);

  // ── the lens: Aura's choice unless the member overrode it ────────
  const auraLens = address.row?.lens ?? "shape";
  const auraReason = address.row?.lens_reason ?? "";

  // An override survives until Aura chooses for a *different* reason.
  useEffect(() => {
    if (!override || !auraReason) return;
    if (override.reason !== auraReason) {
      setOverride(null);
      try { localStorage.removeItem(lensKey(uid)); } catch { /* noop */ }
    }
  }, [auraReason, override, uid]);

  const empty = (facts?.captures_total ?? 0) === 0;
  const firstRun = (facts?.days_since_signup ?? 99) <= 1;
  const activeLens: HomeLens = empty ? "shape" : (override?.lens ?? auraLens);

  const chooseLens = useCallback((l: HomeLens) => {
    setOnStage(null);
    if (l === auraLens) {
      setOverride(null);
      try { localStorage.removeItem(lensKey(uid)); } catch { /* noop */ }
      return;
    }
    const next = { lens: l, reason: auraReason };
    setOverride(next);
    try { localStorage.setItem(lensKey(uid), JSON.stringify(next)); } catch { /* noop */ }
  }, [auraLens, auraReason, uid]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem(collapseKey(uid), next ? "1" : "0"); } catch { /* noop */ }
      return next;
    });
  };

  const goRoute = useCallback((route: string) => {
    const tab = tabForRoute(route);
    if (tab) { onSwitchTab(tab); window.scrollTo({ top: 0, behavior: "smooth" }); }
  }, [onSwitchTab]);

  const openAsk = useCallback(() => {
    try {
      window.dispatchEvent(new CustomEvent("aura-open-chat", {
        detail: { prompt: "Talk to me about today's address." },
      }));
    } catch { /* noop */ }
  }, []);

  const publishDraft = useCallback(async (id: string) => {
    if (!onOpenDraft) { onSwitchTab("authority"); return; }
    const { data } = await (supabase.from("linkedin_posts" as any) as any)
      .select("id, post_text, title, language, content_format").eq("id", id).maybeSingle();
    const row: any = data;
    onOpenDraft({
      id,
      body: row?.post_text ?? "",
      language: row?.language === "ar" ? "ar" : "en",
      type: row?.content_format === "carousel" ? "carousel" : "linkedin_post",
      topic: row?.title ?? null,
    });
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
  const shelf = useMemo(
    () => buildShelf(facts, moves, facts?.signals_active ?? themes.length),
    [facts, moves, themes.length],
  );

  const writeOnTopSignal = useCallback(() => {
    const t = facts?.top_signal;
    if (!t) return;
    onStartSignalPost({ topic: t.title, context: "", signalId: t.id, signalTitle: t.title });
  }, [facts?.top_signal, onStartSignalPost]);

  const generatedAt = address.row?.generated_at ?? null;
  const generatedLabel = generatedAt
    ? new Date(generatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : null;

  // ── the stage ────────────────────────────────────────────────────
  const stage = (() => {
    if (onStage === "moves") return <MovesCard moves={moves} onGo={goRoute} />;
    if (onStage === "stand") return <StandCard facts={facts} />;
    if (onStage === "own") return <OwnCard themes={themes} onOpen={() => onSwitchTab("intelligence")} />;
    if (onStage === "night") return <NightCard facts={facts} generatedAt={generatedAt} onOpen={() => onSwitchTab("overnight")} />;
    if (onStage === "widgets") return <WidgetsCard layout={layout} metrics={metrics} onEdit={() => onSwitchTab("widgets")} />;

    if (activeLens === "record") {
      if (empty) return null;
      return (
        <RecordLens
          facts={facts} ledger={ledger} draftDismissed={draftDismissed}
          onPublishDraft={(id) => { void publishDraft(id); }}
          onDismissDraft={dismissDraft}
        />
      );
    }
    if (activeLens === "room") {
      if (empty) return null;
      return <RoomLens facts={facts} memberName={memberName} onWriteOnSignal={writeOnTopSignal} />;
    }
    return <ShapeLens facts={facts} />;
  })();

  const loadingAddress = address.loading && !address.row;

  return (
    <div style={{ display: "grid", gap: 22, marginBlockStart: 22 }}>
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
            <span style={{ ...MONO, fontSize: 10.5, letterSpacing: ".08em", color: "var(--v23-on-night)" }}>
              {generatedLabel}
            </span>
          )}
          <button
            type="button" onClick={toggleCollapsed}
            aria-label={collapsed ? "Show the full address" : "Collapse the address"}
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
              {address.row?.address_md ? firstSentence(address.row.address_md) : "Today's address is not written."}
            </p>
          ) : address.row?.address_md ? (
            <Prose md={address.row.address_md} />
          ) : (
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: "var(--v23-on-night)" }}>
              {firstRun
                ? "You have just arrived. Capture one thing you read and the rest of this page fills itself in."
                : "Today's address could not be written. Everything below is still drawn from your own record."}
            </p>
          )}
        </div>

        {!collapsed && chips.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBlockStart: 16 }}>
            {chips.map((c) => (
              <span key={c.key} style={{
                ...MONO, fontSize: 11, letterSpacing: ".04em", padding: "5px 10px", borderRadius: 999,
                border: "1px solid var(--v23-night-line)", color: "var(--v23-on-night)",
              }}>{c.label}</span>
            ))}
          </div>
        )}

        {!collapsed && (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBlockStart: 18 }}>
            {moves[0] && (
              <button type="button" onClick={() => goRoute(moves[0].cta_route)} style={{
                border: 0, borderRadius: 999, padding: "11px 20px", fontSize: 13, fontWeight: 700,
                cursor: "pointer", background: "var(--text-inverse)", color: "var(--text-primary)",
                fontFamily: "var(--font-body)",
              }}>{moves[0].what}</button>
            )}
            <button type="button" onClick={openAsk} style={{
              borderRadius: 999, padding: "11px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer",
              background: "transparent", color: "var(--text-inverse)",
              border: "1px solid var(--v23-night-line)", fontFamily: "var(--font-body)",
            }}>Talk to me about this</button>
          </div>
        )}
      </section>

      {/* 2 — THE LENS BAR */}
      {!empty && (
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {LENSES.map((l) => {
              const on = l === activeLens && !onStage;
              return (
                <button
                  key={l} type="button" onClick={() => chooseLens(l)} aria-pressed={on}
                  style={{
                    borderRadius: 999, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                    fontFamily: "var(--font-body)",
                    background: on ? "var(--surface-inverse)" : "transparent",
                    color: on ? "var(--text-inverse)" : "var(--text-secondary)",
                    border: on ? "1px solid var(--surface-inverse)" : "1px solid var(--rule-outer)",
                  }}
                >{LENS_LABEL[l]}</button>
              );
            })}
          </div>
          {override ? (
            <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
              You chose this · Aura will keep it
            </span>
          ) : auraReason ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-secondary)" }}>
              <span aria-hidden style={{
                inlineSize: 7, blockSize: 7, borderRadius: 999, background: "var(--machine)",
              }} />
              Aura chose this — {auraReason}
            </span>
          ) : null}
        </div>
      )}

      {/* 3 — THE STAGE + THE SHELF */}
      <div style={{ display: "grid", gap: 18, gridTemplateColumns: "minmax(0, 2.1fr) minmax(240px, 1fr)", alignItems: "start" }}
           className="home-spine-grid">
        <div style={{ display: "grid", gap: 12, minInlineSize: 0 }}>
          {onStage && (
            <button type="button" onClick={() => setOnStage(null)} style={{
              justifySelf: "start", background: "none", border: 0, padding: 0, cursor: "pointer",
              fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--act)",
            }}>◂ Back to {LENS_LABEL[activeLens]}</button>
          )}

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
                Nothing has been captured yet, so there is no record and no room to show — only the shape you
                arrived with.
              </Body>
              <div>
                <ActButton onClick={() => {
                  try { window.dispatchEvent(new CustomEvent("aura:open-capture")); } catch { /* noop */ }
                }}>Capture the first thing you read</ActButton>
              </div>
            </Card>
          ) : stage}

          {empty && !onStage && <ShapeLens facts={facts} />}
        </div>

        {/* the shelf */}
        <aside style={{ display: "grid", gap: 10, minInlineSize: 0 }}>
          <Kicker>Your shelf</Kicker>
          {shelf.map((s) => {
            const on = onStage === s.key;
            return (
              <button
                key={s.key} type="button" onClick={() => setOnStage(on ? null : s.key)} aria-pressed={on}
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
                </span>
                <Muted style={{ fontSize: 12.5 }}>{s.fact}</Muted>
              </button>
            );
          })}
        </aside>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .home-spine-grid { grid-template-columns: minmax(0, 1fr) !important; }
        }
      `}</style>
    </div>
  );
}
