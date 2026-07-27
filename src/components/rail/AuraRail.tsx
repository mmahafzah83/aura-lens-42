import { useCallback, useEffect, useRef, useState } from "react";
import {
  Compass, Radar, PenLine, BarChart3, Sparkles, User, Settings, Paperclip,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import AuraLogo from "@/components/brand/AuraLogo";

/**
 * AuraRail — System-B V23 rail (hybrid icon rail + contextual flyout).
 *
 * Constant night rail on every dashboard tab, including home. Light flyout
 * opens over the content for sections that have real sub-counts; the rail
 * itself never grows wider than 72px.
 *
 * Colour law: blue = your turn (active item), cyan = the machine is awake
 * (live strip only, never a button except the Ask Aura gradient).
 */

export type RailTab = "home" | "intelligence" | "authority" | "influence" | "identity";

interface AuraRailProps {
  activeTab: string;
  onSelect: (tab: RailTab) => void;
  onOpenAsk: () => void;
  onOpenCapture: () => void;
  onOpenSettings: () => void;
  /** Already-loaded count from Dashboard — no fresh fetch for a badge. */
  newSignalCount?: number;
}

const ITEMS: Array<{ value: RailTab; label: string; icon: typeof Compass; testId: string }> = [
  { value: "home",         label: "Home",      icon: Compass,   testId: "nav-home" },
  { value: "intelligence", label: "Signals",   icon: Radar,     testId: "nav-intelligence" },
  { value: "authority",    label: "Composer",  icon: PenLine,   testId: "nav-publish" },
  { value: "influence",    label: "Analytics", icon: BarChart3, testId: "nav-impact" },
];

function hhmm(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

interface SignalCounts { live: number; actNow: number; cooling: number }

export default function AuraRail({
  activeTab, onSelect, onOpenAsk, onOpenCapture, onOpenSettings, newSignalCount = 0,
}: AuraRailProps) {
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [flyout, setFlyout] = useState<RailTab | null>(null);
  const [counts, setCounts] = useState<SignalCounts | null>(null);
  const countsLoadedRef = useRef(false);

  // The Overnight last-run time — same source the Overnight card reads.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        const { data } = await (supabase.from("agent_findings" as any) as any)
          .select("created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1);
        if (cancelled) return;
        const at = (data || [])[0]?.created_at;
        setLastRun(typeof at === "string" ? at : null);
      } catch { /* live strip falls back to "waiting" */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Signals flyout sub-counts — loaded lazily, only when the flyout opens.
  const loadCounts = useCallback(async () => {
    if (countsLoadedRef.current) return;
    countsLoadedRef.current = true;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await (supabase.from("strategic_signals" as any) as any)
        .select("id, velocity_status")
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(500);
      const rows = (data || []) as Array<{ velocity_status: string | null }>;
      const fading = rows.filter(r => (r.velocity_status || "").toLowerCase().includes("fad")).length;
      const cooling = rows.filter(r => (r.velocity_status || "").toLowerCase().includes("cool")).length;
      setCounts({ live: rows.length, actNow: fading, cooling });
    } catch { /* no sub-items → no flyout content */ }
  }, []);

  const openFlyout = (tab: RailTab) => {
    if (tab !== "intelligence") { setFlyout(null); return; }
    setFlyout("intelligence");
    void loadCounts();
  };

  const railBtn = (active: boolean): React.CSSProperties => ({
    width: 44, height: 44, display: "grid", placeItems: "center",
    borderRadius: 8, border: 0, cursor: "pointer",
    background: active ? "var(--v23-night-lift)" : "transparent",
    color: active ? "var(--b-300)" : "var(--v23-on-night)",
    opacity: active ? 1 : 0.85,
    transition: "background .16s ease, color .16s ease, opacity .16s ease",
    position: "relative",
  });

  return (
    <>
      <aside
        data-surface="dark"
        data-testid="aura-rail"
        aria-label="Primary"
        className="hidden md:flex flex-col items-center fixed top-0 left-0 h-full z-30"
        style={{
          width: 72,
          background: "var(--v23-night)",
          borderRight: "1px solid var(--v23-night-line)",
          fontFamily: "var(--ff-ui)",
          paddingTop: 14, paddingBottom: 14,
        }}
        onMouseLeave={() => setFlyout(null)}
      >
        <button
          type="button"
          onClick={() => onSelect("home")}
          aria-label="Aura home"
          style={{ background: "transparent", border: 0, cursor: "pointer", padding: 0 }}
        >
          <AuraLogo size={26} variant="dark" />
        </button>

        {/* THE LIVE STRIP — cyan means the machine is awake. */}
        <div
          title={lastRun ? `The Overnight — ran ${hhmm(lastRun)}` : "The Overnight — waiting"}
          style={{
            marginTop: 12, marginBottom: 14, display: "flex", flexDirection: "column",
            alignItems: "center", gap: 4,
          }}
        >
          <span aria-hidden style={{
            width: 6, height: 6, borderRadius: 999, background: "var(--machine)",
            boxShadow: "var(--v23-ask-glow)",
          }} />
          <span style={{
            fontFamily: "var(--ff-mono)", fontSize: 9.5, letterSpacing: ".06em",
            fontVariantNumeric: "tabular-nums", color: "var(--v23-on-night)",
          }}>
            {lastRun ? hhmm(lastRun) : "waiting"}
          </span>
        </div>

        <nav className="flex flex-col items-center" style={{ gap: 6, flex: 1 }}>
          {ITEMS.map((item) => {
            const active = activeTab === item.value;
            return (
              <button
                key={item.value}
                type="button"
                title={item.label}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                data-testid={item.testId}
                data-active={active ? "true" : "false"}
                onClick={() => { onSelect(item.value); openFlyout(item.value); }}
                onMouseEnter={() => openFlyout(item.value)}
                style={railBtn(active)}
              >
                <item.icon size={16} strokeWidth={1.75} />
                {item.value === "intelligence" && newSignalCount > 0 && !active && (
                  <span
                    aria-label={`${newSignalCount} new signals`}
                    style={{
                      position: "absolute", top: 7, right: 7, width: 6, height: 6,
                      borderRadius: 999, background: "var(--machine)",
                    }}
                  />
                )}
              </button>
            );
          })}

          {/* Ask Aura — the ONE cyan-bearing button in the system. */}
          <button
            type="button"
            title="Ask Aura"
            aria-label="Ask Aura"
            data-tour="nav-ask-aura"
            onClick={onOpenAsk}
            style={{
              width: 44, height: 44, marginTop: 6, borderRadius: 8, border: 0,
              cursor: "pointer", display: "grid", placeItems: "center",
              background: "var(--v23-ask-bg)", color: "var(--text-inverse)",
              boxShadow: "var(--v23-ask-glow)",
            }}
          >
            <Sparkles size={16} strokeWidth={1.75} />
          </button>

          <button
            type="button"
            title="Capture"
            aria-label="Capture"
            data-testid="nav-capture"
            data-tour="nav-capture"
            onClick={onOpenCapture}
            style={railBtn(false)}
          >
            <Paperclip size={16} strokeWidth={1.75} />
          </button>
        </nav>

        <div className="flex flex-col items-center" style={{ gap: 6, paddingTop: 10, borderTop: "1px solid var(--v23-night-line)", width: 44 }}>
          <button
            type="button"
            title="Profile"
            aria-label="Profile"
            data-testid="nav-mystory"
            data-active={activeTab === "identity" ? "true" : "false"}
            onClick={() => { onSelect("identity"); setFlyout(null); }}
            style={railBtn(activeTab === "identity")}
          >
            <User size={16} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            title="Settings"
            aria-label="Settings"
            onClick={onOpenSettings}
            style={railBtn(false)}
          >
            <Settings size={16} strokeWidth={1.75} />
          </button>
        </div>
      </aside>

      {/* Contextual flyout — light surface, floats over content. */}
      {flyout === "intelligence" && counts && (
        <div
          data-testid="rail-flyout"
          className="hidden md:block fixed z-40"
          style={{
            top: 96, left: 80, width: 208, padding: 12,
            background: "var(--surface-card)",
            border: "1px solid var(--rule-outer)",
            borderRadius: 12, boxShadow: "var(--v23-card-hover)",
            fontFamily: "var(--ff-ui)",
          }}
          onMouseEnter={() => setFlyout("intelligence")}
          onMouseLeave={() => setFlyout(null)}
        >
          <div style={{
            fontFamily: "var(--ff-mono)", fontSize: 10, letterSpacing: ".14em",
            textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 8,
          }}>Signals</div>
          {[
            { label: "Live", value: counts.live },
            { label: "Act now", value: counts.actNow },
            { label: "Cooling", value: counts.cooling },
          ].map((row) => (
            <button
              key={row.label}
              type="button"
              onClick={() => { onSelect("intelligence"); setFlyout(null); }}
              style={{
                display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between",
                background: "transparent", border: 0, cursor: "pointer",
                padding: "7px 6px", borderRadius: 6, color: "var(--text-primary)", fontSize: 13,
              }}
            >
              <span>{row.label}</span>
              <span style={{
                fontFamily: "var(--ff-mono)", fontVariantNumeric: "tabular-nums",
                fontSize: 12, color: "var(--text-secondary)",
              }}>{row.value}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}