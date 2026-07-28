import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Chip, Tooltip, ButtonPrimary } from "@/components/systemb";
import { trackSignalOpen } from "@/lib/trackSignalOpen";
import { isArabicText } from "@/lib/utils";
import { LayoutGrid, List as ListIcon, Plus, ChevronRight } from "lucide-react";
import SignalDetail from "@/components/signals/SignalDetail";
import SourcesSubTab from "@/components/tabs/SourcesSubTab";
import { EditorialReadingList, type Signal } from "@/components/tabs/IntelligenceTab";

/**
 * SignalsBoardV2 — THE Signals page.
 *
 * Two states: the board/list, and (with ?signal=<id>) the existing detail
 * experience, reused verbatim via SignalDetail. Data-honest by construction:
 * the only velocity vocabulary in strategic_signals is accelerating / stable /
 * dormant, so those are the only lanes. No amber: there is no expiry field.
 */

const MONO: React.CSSProperties = { fontFamily: "var(--ff-mono)", fontVariantNumeric: "tabular-nums" };

export type SignalFilter = "all" | "accelerating" | "stable" | "dormant";

interface Row {
  id: string;
  signal_title: string;
  theme_tags: string[] | null;
  supporting_evidence_ids: string[] | null;
  strength_score: number | null;
  confidence: number | null;
  velocity_status: string | null;
  status: string | null;
  created_at: string | null;
}

type Counts = { all: number; accelerating: number; stable: number; dormant: number };

const bucketOf = (r: Row): SignalFilter =>
  r.status === "dormant" ? "dormant" : r.velocity_status === "accelerating" ? "accelerating" : "stable";

const ageDays = (iso: string | null) =>
  iso ? Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000)) : 0;

const strengthOf = (r: Row) => Math.round((r.strength_score ?? r.confidence ?? 0) * 100) / 100;

const StatusDot: React.FC<{ tone: "live" | "cooling" | "muted" }> = ({ tone }) => (
  <span aria-hidden style={{
    width: 7, height: 7, borderRadius: 999, flexShrink: 0,
    background: tone === "live" ? "var(--machine)" : tone === "cooling" ? "var(--border-strong)" : "var(--border-default)",
  }} />
);

const SectionLabel: React.FC<React.PropsWithChildren> = ({ children }) => (
  <div style={{ ...MONO, fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 10 }}>
    {children}
  </div>
);

/** Five-bar capture meter — independent captures behind the claim. */
const CaptureMeter: React.FC<{ filled: number; bucket: SignalFilter }> = ({ filled, bucket }) => {
  const on = bucket === "accelerating" ? "var(--machine)" : bucket === "stable" ? "var(--border-strong)" : "var(--text-muted)";
  return (
    <Tooltip title="Capture meter" body="Independent captures behind the claim.">
      <span style={{ display: "inline-flex", gap: 3, alignItems: "flex-end" }} tabIndex={0}>
        {[0, 1, 2, 3, 4].map(i => (
          <span key={i} style={{
            width: 4, height: 12, borderRadius: 2,
            background: i < filled ? on : "var(--surface-subtle)",
            border: i < filled ? "0" : "1px solid var(--rule-divider)",
          }} />
        ))}
      </span>
    </Tooltip>
  );
};

const SegBtn: React.FC<React.PropsWithChildren<{ active: boolean; onClick: () => void }>> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className="cursor-pointer v23-focus v23-tap"
    aria-pressed={active}
    style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
      padding: "6px 14px", borderRadius: 7, border: 0, cursor: "pointer",
      fontFamily: "var(--ff-ui)", fontSize: 12.5, fontWeight: 600,
      background: active ? "var(--surface-card)" : "transparent",
      color: active ? "var(--text-primary)" : "var(--text-secondary)",
      boxShadow: active ? "var(--v23-card-rest)" : "none",
      transition: "background 160ms ease, color 160ms ease",
    }}
  >{children}</button>
);

interface Props {
  initialFilter?: SignalFilter;
  onOpenCapture?: (prefillUrl?: string, prefillText?: string) => void;
  onOpenChat?: (msg?: string) => void;
  onDraftToStudio?: (prefill: {
    topic: string; context: string; signalId?: string; signalTitle?: string; source?: string;
  }) => void;
}

const SignalsBoardV2: React.FC<Props> = ({ initialFilter, onOpenCapture, onOpenChat, onDraftToStudio }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const paramFilter = (searchParams.get("sfilter") || "") as SignalFilter;
  const detailId = searchParams.get("signal");
  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "board">("board");
  const [dormantOpen, setDormantOpen] = useState(false);
  const [filter, setFilter] = useState<SignalFilter>(
    ["accelerating", "stable", "dormant"].includes(paramFilter) ? paramFilter : (initialFilter || "all"),
  );
  const [theme, setTheme] = useState<string | null>(null);
  const [stuck, setStuck] = useState(false);
  const stuckRef = useRef(false);
  const boardRef = useRef<HTMLElement | null>(null);
  // The portalled bar is fixed to the viewport, so it has to be told where the
  // centred content column actually is, or it drifts away from the content.
  const [column, setColumn] = useState<{ left: number; width: number } | null>(null);

  useEffect(() => {
    const measure = () => {
      const el = boardRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setColumn(prev =>
        prev && Math.abs(prev.left - r.left) < 1 && Math.abs(prev.width - r.width) < 1
          ? prev
          : { left: r.left, width: r.width },
      );
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
    };
  }, []);

  // The board lives inside overflow ancestors, so position:sticky dies here.
  // The control bar is portalled to the body and driven by scroll instead.
  useEffect(() => {
    const onScroll = () => {
      const next = window.scrollY > 200;
      if (next === stuckRef.current) return;
      stuckRef.current = next;
      setStuck(next);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // A filter arriving by URL wins, then clears itself so it is not sticky.
  useEffect(() => {
    if (!["accelerating", "stable", "dormant"].includes(paramFilter)) return;
    setFilter(paramFilter);
    const next = new URLSearchParams(searchParams);
    next.delete("sfilter");
    setSearchParams(next, { replace: true });
  }, [paramFilter, searchParams, setSearchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const head = () => (supabase.from("strategic_signals" as any) as any)
        .select("id", { count: "exact", head: true }).eq("user_id", user.id);
      const [listRes, accRes, stbRes, dorRes] = await Promise.all([
        (supabase.from("strategic_signals" as any) as any)
          .select("*").eq("user_id", user.id).in("status", ["active", "dormant"])
          .order("strength_score", { ascending: false }).limit(300),
        head().eq("status", "active").eq("velocity_status", "accelerating"),
        head().eq("status", "active").neq("velocity_status", "accelerating"),
        head().eq("status", "dormant"),
      ]);
      const acc = accRes?.count ?? 0, stb = stbRes?.count ?? 0, dor = dorRes?.count ?? 0;
      setCounts({ all: acc + stb + dor, accelerating: acc, stable: stb, dormant: dor });
      setRows((listRes?.data || []) as Row[]);
    } catch { /* board renders empty rather than breaking the tab */ }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const themes = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach(r => (r.theme_tags || []).forEach(t => {
      const k = (t || "").trim();
      if (k) m.set(k, (m.get(k) || 0) + 1);
    }));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [rows]);

  const visible = useMemo(() => {
    let out = rows;
    if (filter !== "all") out = out.filter(r => bucketOf(r) === filter);
    if (theme) out = out.filter(r => (r.theme_tags || []).some(t => (t || "").trim() === theme));
    return [...out].sort((a, b) => {
      const ao = bucketOf(a) === "accelerating" ? 0 : 1;
      const bo = bucketOf(b) === "accelerating" ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return strengthOf(b) - strengthOf(a);
    });
  }, [rows, filter, theme]);

  /** The existing detail flow: hand the id to the detail state via ?signal=. */
  const openSignal = (id: string, surface: string) => {
    try { trackSignalOpen(id, surface); } catch { /* measurement never blocks */ }
    const next = new URLSearchParams(searchParams);
    next.set("tab", "intelligence");
    next.set("signal", id);
    setSearchParams(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const closeSignal = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("signal");
    setSearchParams(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const Card: React.FC<{ r: Row }> = ({ r }) => {
    const bucket = bucketOf(r);
    const captures = (r.supporting_evidence_ids || []).length;
    const ar = isArabicText(r.signal_title);
    const tag = (r.theme_tags || [])[0];
    return (
      <div
        role="button"
        tabIndex={0}
        data-testid="signal-board-card"
        className="cursor-pointer v23-focus v23-lift"
        onClick={() => openSignal(r.id, "signals_board_card")}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openSignal(r.id, "signals_board_card"); } }}
        style={{
          background: "var(--surface-card)", border: "1px solid var(--rule-outer)",
          borderInlineStart: bucket === "accelerating" ? "2px solid var(--machine)" : "1px solid var(--rule-outer)",
          borderRadius: 12, padding: 13, cursor: "pointer",
          boxShadow: "var(--v23-card-rest)", opacity: bucket === "dormant" ? 0.6 : 1,
          minHeight: 132, display: "flex", flexDirection: "column",
          fontFamily: "var(--ff-ui)",
        }}
      >
        {tag && <Chip variant="cooling" style={{ marginBottom: 8, alignSelf: "flex-start", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis" }}>{tag}</Chip>}
        <div
          dir={ar ? "rtl" : undefined}
          style={{
            fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)",
            fontFamily: ar ? "var(--ff-ar)" : "var(--ff-ui)",
            lineHeight: ar ? 1.9 : 1.4,
            textAlign: ar ? "right" : "left",
            display: "-webkit-box", WebkitBoxOrient: "vertical",
            WebkitLineClamp: ar ? 3 : 2, overflow: "hidden",
          }}
        >{r.signal_title}</div>
        <div style={{
          marginTop: "auto", paddingTop: 12, display: "flex",
          alignItems: "center", justifyContent: "space-between", gap: 10,
        }}>
          <CaptureMeter filled={Math.min(captures, 5)} bucket={bucket} />
          <span style={{ ...MONO, fontSize: 10.5, letterSpacing: ".06em", color: "var(--text-muted)" }}>
            {captures} captures · {ageDays(r.created_at)}d ·{" "}
            <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{strengthOf(r)}</span>
          </span>
          <span
            aria-hidden
            className="v23-read-affordance"
            style={{
              ...MONO, fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase",
              color: "var(--act)", opacity: 0, transition: "opacity 160ms ease", whiteSpace: "nowrap",
            }}
          >Read →</span>
        </div>
      </div>
    );
  };

  const columns: Array<{ key: SignalFilter; label: string; tone: "live" | "cooling" | "muted"; count: number; empty: string }> = [
    { key: "accelerating", label: "Accelerating", tone: "live", count: counts?.accelerating ?? 0, empty: "Nothing accelerating right now." },
    { key: "stable", label: "Stable", tone: "cooling", count: counts?.stable ?? 0, empty: "Nothing stable right now." },
    { key: "dormant", label: "Dormant", tone: "muted", count: counts?.dormant ?? 0, empty: "Nothing dormant right now." },
  ];

  const filterRows: Array<{ key: SignalFilter; label: string; count: number }> = [
    { key: "all", label: "All", count: counts?.all ?? 0 },
    { key: "accelerating", label: "Accelerating", count: counts?.accelerating ?? 0 },
    { key: "stable", label: "Stable", count: counts?.stable ?? 0 },
    { key: "dormant", label: "Dormant", count: counts?.dormant ?? 0 },
  ];

  if (detailId) {
    return (
      <SignalDetail
        signalId={detailId}
        onBack={closeSignal}
        onOpenChat={onOpenChat}
        onDraftToStudio={onDraftToStudio}
      />
    );
  }

  return (
    <section ref={boardRef} data-testid="signals-board-v2" style={{ fontFamily: "var(--ff-ui)", marginBottom: 26 }}>
      {/* HEADER */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end", justifyContent: "space-between", marginBottom: 30 }}>
        <div>
          <div style={{ ...MONO, fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--text-muted)" }}>
            Signals
          </div>
          <h1 style={{
            margin: "8px 0 0", fontSize: 26, lineHeight: 1.15, fontWeight: 700,
            color: "var(--text-primary)", letterSpacing: "-.01em",
          }}>
            What your market is telling you
          </h1>
          <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--text-secondary)", maxWidth: 620 }}>
            A signal is a claim about your market, defended by the captures behind it.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "inline-flex", gap: 2, padding: 3, borderRadius: 9, background: "var(--surface-subtle)" }}>
            <SegBtn active={view === "list"} onClick={() => setView("list")}><ListIcon size={13} />List</SegBtn>
            <SegBtn active={view === "board"} onClick={() => setView("board")}><LayoutGrid size={13} />Board</SegBtn>
          </div>
          <ButtonPrimary onClick={() => onOpenCapture?.()}><Plus size={13} />Capture</ButtonPrimary>
        </div>
      </div>

      {/* BODY — rail + content */}
      <div className="flex flex-col lg:flex-row" style={{ gap: 18, alignItems: "flex-start" }}>
        {/* FILTER RAIL */}
        <aside className="w-full lg:w-[200px] lg:shrink-0 lg:sticky" style={{
          background: "var(--surface-card)", border: "1px solid var(--rule-outer)",
          borderRadius: 14, padding: 12, top: 24,
        }}>
          {filterRows.map(f => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className="cursor-pointer v23-focus v23-tap v23-row"
                aria-pressed={active}
                style={{
                  display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between",
                  padding: "7px 10px", borderRadius: 8, cursor: "pointer",
                  border: `1px solid ${active ? "var(--act)" : "var(--rule-outer)"}`,
                  background: active ? "var(--act-tint)" : "var(--surface-card)",
                  color: active ? "var(--act-hover)" : "var(--text-secondary)",
                  fontSize: 13, fontWeight: active ? 600 : 500, fontFamily: "var(--ff-ui)",
                  transition: "background 160ms ease, color 160ms ease",
                }}
              >
                <span>{f.label}</span>
                <span style={{ ...MONO, fontSize: 11.5 }}>{counts ? f.count : "—"}</span>
              </button>
            );
          })}

          {themes.length > 0 && (
            <>
              <div style={{ height: 1, background: "var(--rule-divider)", margin: "10px 0" }} />
              <div style={{ ...MONO, fontSize: 9.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--text-muted)", padding: "0 8px 6px" }}>
                Themes
              </div>
              {themes.map(([t, n]) => {
                const active = theme === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTheme(active ? null : t)}
                    className="cursor-pointer v23-focus v23-tap v23-row"
                    aria-pressed={active}
                    style={{
                      display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between",
                      gap: 8, padding: "6px 10px", borderRadius: 8, cursor: "pointer",
                      border: `1px solid ${active ? "var(--act)" : "var(--rule-outer)"}`,
                      background: active ? "var(--act-tint)" : "var(--surface-card)",
                      color: active ? "var(--act-hover)" : "var(--text-secondary)",
                      fontSize: 12.5, fontFamily: "var(--ff-ui)", textAlign: "start",
                      transition: "background 160ms ease, color 160ms ease",
                    }}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t}</span>
                    <span style={{ ...MONO, fontSize: 11 }}>{n}</span>
                  </button>
                );
              })}
            </>
          )}
        </aside>

        {/* CONTENT */}
        <div style={{ flex: 1, minWidth: 0, width: "100%" }}>
          {loading ? (
            <div style={{ ...MONO, fontSize: 11, color: "var(--text-muted)", padding: 20 }}>Loading signals…</div>
          ) : view === "board" ? (
            <div className="grid grid-cols-1 md:grid-cols-3" style={{ gap: 14, alignItems: "start" }}>
              {columns.map(col => {
                const cards = visible.filter(r => bucketOf(r) === col.key);
                const collapsible = col.key === "dormant";
                const open = !collapsible || dormantOpen;
                return (
                  <div key={col.key} style={{
                    background: "var(--surface-subtle)", borderRadius: 14, padding: 10,
                  }}>
                    {React.createElement(collapsible ? "button" : "div", {
                      type: collapsible ? "button" : undefined,
                      onClick: collapsible ? () => setDormantOpen((o: boolean) => !o) : undefined,
                      className: collapsible ? "cursor-pointer v23-focus v23-tap" : undefined,
                      "aria-expanded": collapsible ? open : undefined,
                      style: {
                        display: "flex", width: "100%", alignItems: "center", gap: 7,
                        padding: "2px 2px 10px", border: 0, background: "transparent",
                        cursor: collapsible ? "pointer" : "default", textAlign: "start",
                      }}
                      aria-expanded={collapsible ? open : undefined}
                    >
                      <StatusDot tone={col.tone} />
                      <span style={{ ...MONO, fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--text-secondary)" }}>
                        {col.label}
                      </span>
                      <span style={{
                        ...MONO, fontSize: 10.5, fontWeight: 600, lineHeight: 1,
                        padding: "3px 7px", borderRadius: 999,
                        background: col.key === "accelerating" ? "var(--machine-tint)" : "var(--surface-card)",
                        color: col.key === "accelerating" ? "var(--machine-text)" : "var(--text-secondary)",
                        border: "1px solid var(--rule-divider)",
                      }}>{counts ? col.count : "—"}</span>
                      {collapsible && (
                        <ChevronRight
                          size={13}
                          style={{
                            marginInlineStart: "auto", color: "var(--text-muted)",
                            transform: open ? "rotate(90deg)" : "none",
                            transition: "transform 160ms ease",
                          }}
                        />
                      )}
                    </button>
                    {open && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {cards.length === 0
                          ? <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "6px 2px" }}>{col.empty}</div>
                          : cards.map(r => <Card key={r.id} r={r} />)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{
              background: "var(--surface-card)", border: "1px solid var(--rule-outer)",
              borderRadius: 14, overflow: "hidden",
            }}>
              {visible.length === 0 && (
                <div style={{ fontSize: 12.5, color: "var(--text-muted)", padding: 16 }}>No signals match this filter.</div>
              )}
              {visible.map((r, i) => {
                const bucket = bucketOf(r);
                const ar = isArabicText(r.signal_title);
                const tag = (r.theme_tags || [])[0];
                return (
                  <div
                    key={r.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openSignal(r.id, "signals_board_list")}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openSignal(r.id, "signals_board_list"); } }}
                    className="cursor-pointer v23-focus v23-row"
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "11px 13px",
                      borderTop: i === 0 ? "0" : "1px solid var(--rule-divider)",
                      opacity: bucket === "dormant" ? 0.65 : 1, cursor: "pointer",
                      transition: "background 160ms ease",
                    }}
                  >
                    <StatusDot tone={bucket === "accelerating" ? "live" : bucket === "stable" ? "cooling" : "muted"} />
                    <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
                      <div
                        dir={ar ? "rtl" : undefined}
                        style={{
                          fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)",
                          fontFamily: ar ? "var(--ff-ar)" : "var(--ff-ui)",
                          lineHeight: ar ? 1.9 : 1.4,
                          textAlign: ar ? "right" : "left",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}
                      >{r.signal_title}</div>
                      {tag && <Chip variant="cooling" className="hidden sm:inline-flex">{tag}</Chip>}
                    </div>
                    {bucket === "accelerating" && <Chip variant="live">Accelerating</Chip>}
                    <span style={{ ...MONO, fontSize: 10.5, letterSpacing: ".06em", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                      {(r.supporting_evidence_ids || []).length} captures ·{" "}
                      <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{strengthOf(r)}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* SECONDARY — re-homed from Observatory, unchanged in behaviour */}
      {stuck && typeof document !== "undefined" && createPortal(
        <div
          data-testid="signals-sticky-bar"
          style={{
            position: "fixed", top: 12,
            left: column ? column.left : 0,
            width: column ? column.width : "100%",
            zIndex: 45, display: "flex", alignItems: "center", justifyContent: "center",
            pointerEvents: "none",
          }}
        >
        <div
          style={{
            display: "flex", alignItems: "center", gap: 10, pointerEvents: "auto",
            padding: 6, borderRadius: 12,
            background: "var(--v23-glass, var(--surface-card))",
            border: "1px solid var(--rule-outer)",
            boxShadow: "var(--shadow-lift)",
            backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
            fontFamily: "var(--ff-ui)",
          }}
        >
          <div style={{ display: "inline-flex", gap: 2, padding: 3, borderRadius: 9, background: "var(--surface-subtle)" }}>
            <SegBtn active={view === "list"} onClick={() => setView("list")}><ListIcon size={13} />List</SegBtn>
            <SegBtn active={view === "board"} onClick={() => setView("board")}><LayoutGrid size={13} />Board</SegBtn>
          </div>
          <ButtonPrimary onClick={() => onOpenCapture?.()}><Plus size={13} />Capture</ButtonPrimary>
        </div>
        </div>,
        document.body,
      )}

      <div data-legacy style={{ marginTop: 40, borderTop: "1px solid var(--rule-divider)", paddingTop: 26 }}>
        <SectionLabel>Recommended reading</SectionLabel>
        <EditorialReadingList signals={rows as unknown as Signal[]} onOpenCapture={onOpenCapture} />
      </div>

      <div data-legacy style={{ marginTop: 34, borderTop: "1px solid var(--rule-divider)", paddingTop: 26 }}>
        <SectionLabel>Sources</SectionLabel>
        <SourcesSubTab
          onOpenCapture={onOpenCapture}
          onSwitchToSignal={(signalId: string) => openSignal(signalId, "signals_sources_section")}
        />
      </div>
    </section>
  );
};

export default SignalsBoardV2;
