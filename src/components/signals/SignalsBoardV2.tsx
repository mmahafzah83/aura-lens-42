import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Chip, Tooltip, ButtonPrimary } from "@/components/systemb";
import { trackSignalOpen } from "@/lib/trackSignalOpen";
import { isArabicText } from "@/lib/utils";
import { LayoutGrid, List as ListIcon, Plus } from "lucide-react";

/**
 * SignalsBoardV2 — V23 Signals board (pilot slice #2).
 *
 * Data-honest by construction: the only velocity vocabulary that exists in
 * strategic_signals is accelerating / stable / dormant, so those are the only
 * columns. No amber anywhere — there is no expiry field to back a clock.
 * Card click hands off to the EXISTING detail flow (?signal=<id>, consumed by
 * Observatory's deep-link effect).
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

const StatusDot: React.FC<{ tone: "live" | "cooling" | "muted" }> = ({ tone }) => (
  <span aria-hidden style={{
    width: 7, height: 7, borderRadius: 999, flexShrink: 0,
    background: tone === "live" ? "var(--machine)" : tone === "cooling" ? "var(--border-strong)" : "var(--border-default)",
  }} />
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
    className="cursor-pointer"
    style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "6px 12px", borderRadius: 7, border: 0, cursor: "pointer",
      fontFamily: "var(--ff-ui)", fontSize: 12.5, fontWeight: 600,
      background: active ? "var(--surface-card)" : "transparent",
      color: active ? "var(--text-primary)" : "var(--text-secondary)",
      boxShadow: active ? "var(--v23-card-rest)" : "none",
    }}
  >{children}</button>
);

interface Props {
  initialFilter?: SignalFilter;
  onOpenCapture?: () => void;
}

const SignalsBoardV2: React.FC<Props> = ({ initialFilter, onOpenCapture }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const paramFilter = (searchParams.get("sfilter") || "") as SignalFilter;
  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "board">("board");
  const [filter, setFilter] = useState<SignalFilter>(
    ["accelerating", "stable", "dormant"].includes(paramFilter) ? paramFilter : (initialFilter || "all"),
  );
  const [theme, setTheme] = useState<string | null>(null);

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
      const cols = "id, signal_title, theme_tags, supporting_evidence_ids, strength_score, confidence, velocity_status, status, created_at";
      const head = () => (supabase.from("strategic_signals" as any) as any)
        .select("id", { count: "exact", head: true }).eq("user_id", user.id);
      const [listRes, accRes, stbRes, dorRes] = await Promise.all([
        (supabase.from("strategic_signals" as any) as any)
          .select(cols).eq("user_id", user.id).in("status", ["active", "dormant"])
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
      return (b.strength_score ?? b.confidence ?? 0) - (a.strength_score ?? a.confidence ?? 0);
    });
  }, [rows, filter, theme]);

  /** The existing detail flow: hand the id to Observatory via ?signal=. */
  const openSignal = (id: string, surface: string) => {
    try { trackSignalOpen(id, surface); } catch { /* measurement never blocks */ }
    const next = new URLSearchParams(searchParams);
    next.set("tab", "intelligence");
    next.set("signal", id);
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
        onClick={() => openSignal(r.id, "signals_board_card")}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openSignal(r.id, "signals_board_card"); } }}
        style={{
          background: "var(--surface-card)", border: "1px solid var(--rule-outer)",
          borderRadius: 14, padding: 13, cursor: "pointer",
          boxShadow: "var(--v23-card-rest)", opacity: bucket === "dormant" ? 0.6 : 1,
          transition: "transform 140ms ease, box-shadow 140ms ease", fontFamily: "var(--ff-ui)",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "var(--shadow-lift)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "var(--v23-card-rest)"; }}
      >
        {tag && <Chip variant="cooling" style={{ marginBottom: 8 }}>{tag}</Chip>}
        <div
          dir={ar ? "rtl" : undefined}
          style={{
            fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)",
            fontFamily: ar ? "var(--ff-ar)" : "var(--ff-ui)",
            lineHeight: ar ? 1.9 : 1.4,
            textAlign: ar ? "right" : "left",
          }}
        >{r.signal_title}</div>
        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
          <CaptureMeter filled={Math.min(captures, 5)} bucket={bucket} />
        </div>
        <div style={{ ...MONO, marginTop: 8, fontSize: 10.5, letterSpacing: ".06em", color: "var(--text-muted)" }}>
          {captures} captures · {ageDays(r.created_at)}d · strength {Math.round((r.strength_score ?? r.confidence ?? 0) * 100) / 100}
        </div>
      </div>
    );
  };

  const columns: Array<{ key: SignalFilter; label: string; tone: "live" | "cooling" | "muted"; count: number }> = [
    { key: "accelerating", label: "Accelerating", tone: "live", count: counts?.accelerating ?? 0 },
    { key: "stable", label: "Stable", tone: "cooling", count: counts?.stable ?? 0 },
    { key: "dormant", label: "Dormant", tone: "muted", count: counts?.dormant ?? 0 },
  ];

  const filterRows: Array<{ key: SignalFilter; label: string; count: number }> = [
    { key: "all", label: "All", count: counts?.all ?? 0 },
    { key: "accelerating", label: "Accelerating", count: counts?.accelerating ?? 0 },
    { key: "stable", label: "Stable", count: counts?.stable ?? 0 },
    { key: "dormant", label: "Dormant", count: counts?.dormant ?? 0 },
  ];

  return (
    <section data-testid="signals-board-v2" style={{ fontFamily: "var(--ff-ui)", marginBottom: 26 }}>
      {/* HEADER */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <div style={{ ...MONO, fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--text-muted)" }}>
            Signals
          </div>
          <h2 style={{ margin: "6px 0 0", fontSize: 15, fontWeight: 500, color: "var(--text-secondary)", maxWidth: 640 }}>
            A signal is a claim about your market, defended by the captures behind it.
          </h2>
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
      <div className="flex flex-col lg:flex-row" style={{ gap: 18, marginTop: 16, alignItems: "flex-start" }}>
        {/* FILTER RAIL */}
        <aside className="w-full lg:w-[200px] lg:shrink-0" style={{
          background: "var(--surface-card)", border: "1px solid var(--rule-outer)",
          borderRadius: 14, padding: 12,
        }}>
          {filterRows.map(f => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className="cursor-pointer"
                style={{
                  display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between",
                  padding: "7px 8px", borderRadius: 8, border: 0, cursor: "pointer",
                  background: active ? "var(--act-tint)" : "transparent",
                  color: active ? "var(--act)" : "var(--text-secondary)",
                  fontSize: 13, fontWeight: active ? 600 : 500, fontFamily: "var(--ff-ui)",
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
                    className="cursor-pointer"
                    style={{
                      display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between",
                      gap: 8, padding: "6px 8px", borderRadius: 8, border: 0, cursor: "pointer",
                      background: active ? "var(--act-tint)" : "transparent",
                      color: active ? "var(--act)" : "var(--text-secondary)",
                      fontSize: 12.5, fontFamily: "var(--ff-ui)", textAlign: "start",
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
            <div className="grid grid-cols-1 md:grid-cols-3" style={{ gap: 14 }}>
              {columns.map(col => {
                const cards = visible.filter(r => bucketOf(r) === col.key);
                return (
                  <div key={col.key} style={{ opacity: col.key === "dormant" ? 0.85 : 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "0 2px 10px" }}>
                      <StatusDot tone={col.tone} />
                      <span style={{ ...MONO, fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--text-secondary)" }}>
                        {col.label}
                      </span>
                      <span style={{ ...MONO, fontSize: 11, color: "var(--text-muted)" }}>{counts ? col.count : "—"}</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {cards.length === 0
                        ? <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "8px 2px" }}>Nothing here.</div>
                        : cards.map(r => <Card key={r.id} r={r} />)}
                    </div>
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
                return (
                  <div
                    key={r.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openSignal(r.id, "signals_board_list")}
                    onKeyDown={(e) => { if (e.key === "Enter") openSignal(r.id, "signals_board_list"); }}
                    className="cursor-pointer"
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "11px 13px",
                      borderTop: i === 0 ? "0" : "1px solid var(--rule-divider)",
                      opacity: bucket === "dormant" ? 0.65 : 1, cursor: "pointer",
                    }}
                  >
                    <StatusDot tone={bucket === "accelerating" ? "live" : bucket === "stable" ? "cooling" : "muted"} />
                    <div style={{ flex: 1, minWidth: 0 }}>
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
                      <div style={{ ...MONO, fontSize: 10.5, color: "var(--text-muted)", marginTop: 2, letterSpacing: ".06em" }}>
                        {(r.supporting_evidence_ids || []).length} captures · {ageDays(r.created_at)}d · strength {Math.round((r.strength_score ?? r.confidence ?? 0) * 100) / 100}
                      </div>
                    </div>
                    {bucket === "accelerating" && <Chip variant="live">Accelerating</Chip>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default SignalsBoardV2;