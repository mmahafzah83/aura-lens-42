import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Compass, Paperclip, X, ChevronLeft, ChevronRight, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { NAV_GROUPS, isGroupActive, type NavGroup } from "@/components/nav/navGroups";
import AuraLogo from "@/components/brand/AuraLogo";
import { useIsAdmin } from "@/lib/isAdmin";
import { TooltipPanel } from "@/components/systemb/Tooltip";
import Avatar from "@/components/systemb/Avatar";
import AuraRing from "@/components/systemb/AuraRing";

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

export type RailTab = "home" | "intelligence" | "library" | "overnight" | "authority" | "influence" | "momentum" | "widgets" | "identity";

interface AuraRailProps {
  activeTab: string;
  onSelect: (tab: RailTab) => void;
  onOpenAsk: () => void;
  onOpenCapture: () => void;
  /** @deprecated Settings now lives in the avatar menu. Kept for call-site compatibility. */
  onOpenSettings?: () => void;
  /** Already-loaded count from Dashboard — no fresh fetch for a badge. */
  newSignalCount?: number;
}

/** Five doors. The tab values behind each one are unchanged — see navGroups. */
const DOORS: NavGroup[] = NAV_GROUPS;
const hasFlyout = (g: NavGroup) => g.key === "signals";

interface SignalCounts { all: number; accelerating: number; stable: number }

const RAIL_W_COLLAPSED = "78px";
const RAIL_W_EXPANDED = "236px";
const NAV_KEY = "aura_nav_expanded";

export default function AuraRail({
  activeTab, onSelect, onOpenAsk, onOpenCapture, newSignalCount = 0,
}: AuraRailProps) {
  const [, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAdmin } = useIsAdmin();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [flyout, setFlyout] = useState<RailTab | null>(null);
  const [tip, setTip] = useState<{ title: string; body: string; top: number } | null>(null);
  const [counts, setCounts] = useState<SignalCounts | null>(null);
  const countsLoadedRef = useRef(false);
  const flyoutRef = useRef<HTMLDivElement | null>(null);
  const railRef = useRef<HTMLElement | null>(null);
  const [expanded, setExpanded] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const stored = window.localStorage.getItem(NAV_KEY);
    if (stored === "1") return true;
    if (stored === "0") return false;
    return window.innerWidth >= 1280;
  });
  const [libraryCount, setLibraryCount] = useState<number | null>(null);
  const [draftCount, setDraftCount] = useState<number | null>(null);

  // The sidebar owns its own width variable so main content shifts with it.
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--v23-rail-w", expanded ? RAIL_W_EXPANDED : RAIL_W_COLLAPSED,
    );
    return () => { document.documentElement.style.removeProperty("--v23-rail-w"); };
  }, [expanded]);

  const toggleExpanded = () => {
    setExpanded((prev) => {
      const next = !prev;
      try { window.localStorage.setItem(NAV_KEY, next ? "1" : "0"); } catch { /* ignore */ }
      if (next) setFlyout(null);
      return next;
    });
    setTip(null);
  };

  // Row counts — exact head counts only. A failed query renders nothing.
  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      // Library shows entries + one row per deduped document, so the pill
      // counts exactly what the list it opens renders.
      const [entriesRes, docsRes, draftsRes] = await Promise.all([
        (supabase.from("entries" as any) as any)
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id),
        (supabase.from("documents" as any) as any)
          .select("filename")
          .eq("user_id", user.id),
        (supabase.from("content_items" as any) as any)
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id).eq("status", "draft"),
      ]);
      if (cancelled) return;
      if (!entriesRes?.error && typeof entriesRes?.count === "number") {
        const docNames = new Set<string>(
          ((docsRes?.data || []) as any[]).map(d => String(d?.filename ?? "")).filter(Boolean),
        );
        setLibraryCount(entriesRes.count + docNames.size);
      }
      if (!draftsRes?.error && typeof draftsRes?.count === "number") setDraftCount(draftsRes.count);
    })().catch(() => { /* counts stay hidden */ });
    return () => { cancelled = true; };
  }, [expanded]);

  // The Overnight last-run time — same source the Overnight card reads.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        setUid(user.id);
        void (async () => {
          const { data: prof } = await supabase
            .from("diagnostic_profiles")
            .select("first_name, last_name, avatar_url")
            .eq("user_id", user.id)
            .maybeSingle();
          if (cancelled || !prof) return;
          setAvatarUrl(((prof as any).avatar_url as string) || null);
          setProfileName([(prof as any).first_name, (prof as any).last_name].filter(Boolean).join(" ") || null);
        })();
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
      // Exact head counts — a limited fetch can never back a displayed number.
      const base = () => (supabase.from("strategic_signals" as any) as any)
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "active");
      const [allRes, accRes, stableRes] = await Promise.all([
        base(),
        base().eq("velocity_status", "accelerating"),
        base().eq("velocity_status", "stable"),
      ]);
      setCounts({
        all: allRes?.count ?? 0,
        accelerating: accRes?.count ?? 0,
        stable: stableRes?.count ?? 0,
      });
    } catch { /* no sub-items → no flyout content */ }
  }, []);

  const openFlyout = (tab: RailTab) => {
    if (tab !== "intelligence") { setFlyout(null); return; }
    setFlyout("intelligence");
    void loadCounts();
  };

  // Flyout never persists: closes on tab change, Esc, or an outside click.
  useEffect(() => { setFlyout(null); }, [activeTab]);
  useEffect(() => {
    if (!flyout) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFlyout(null); };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (flyoutRef.current?.contains(t)) return;
      if (railRef.current?.contains(t)) return;
      setFlyout(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [flyout]);

  const showTip = (title: string, body: string) => (e: React.SyntheticEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ title, body, top: Math.max(8, r.top - 4) });
  };
  const hideTip = () => setTip(null);

  const railBtn = (active: boolean): React.CSSProperties => ({
    width: 62, minHeight: 52, display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", gap: 5,
    padding: "6px 2px",
    borderRadius: 8, border: 0, cursor: "pointer",
    background: active ? "var(--v23-wash-act), var(--v23-night-lift)" : "transparent",
    color: active ? "var(--b-300)" : "var(--v23-on-night)",
    opacity: active ? 1 : 0.9,
    transition: "background 180ms ease, color 180ms ease, opacity 180ms ease",
    position: "relative",
    fontFamily: "var(--ff-ui)",
  });

  const labelStyle = (active: boolean): React.CSSProperties => ({
    fontFamily: "var(--ff-mono)", fontSize: 9.5, lineHeight: 1.1,
    letterSpacing: ".08em", textTransform: "uppercase",
    color: active ? "var(--text-inverse)" : "var(--v23-rail-label)",
    whiteSpace: "nowrap",
  });

  const ActiveBar = () => (
    <span aria-hidden style={{
      position: "absolute", left: -7, top: 6, bottom: 6, width: 3,
      borderRadius: 2, background: "var(--act)",
    }} />
  );

  const hoverOn = (e: React.MouseEvent<HTMLElement>) => {
    if (e.currentTarget.dataset.active === "true") return;
    e.currentTarget.style.background = "var(--v23-night-hover)";
  };
  const hoverOff = (e: React.MouseEvent<HTMLElement>) => {
    if (e.currentTarget.dataset.active === "true") return;
    e.currentTarget.style.background = "transparent";
  };

  const collapseToggle = (
    <button
      type="button"
      aria-label={expanded ? "Collapse navigation" : "Expand navigation"}
      aria-expanded={expanded}
      data-testid="nav-collapse-toggle"
      className="cursor-pointer v23-focus"
      onClick={toggleExpanded}
      style={{
        background: "transparent", border: 0, cursor: "pointer",
        color: "var(--v23-rail-label)", padding: 6, borderRadius: 8,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {expanded ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
    </button>
  );

  /* Clicking a door opens its primary member — never yanks you off a
     sub-view that already lives behind that door. */
  const open = (g: NavGroup) => {
    setFlyout(null);
    if (isGroupActive(g, activeTab)) return;
    onSelect(g.primary as RailTab);
  };

  const rowStyle = (active: boolean): React.CSSProperties => ({
    display: "flex", alignItems: "center", gap: 10, width: "100%",
    minHeight: 40, padding: "8px 18px", borderRadius: 0, border: 0,
    cursor: "pointer", position: "relative", textAlign: "left",
    background: active ? "var(--v23-wash-act), var(--v23-night-lift)" : "transparent",
    color: active ? "var(--b-300)" : "var(--v23-on-night)",
    fontFamily: "var(--ff-ui)", fontSize: 13, fontWeight: 500,
    transition: "background 180ms ease, color 180ms ease",
  });

  const ActiveBarWide = () => (
    <span aria-hidden style={{
      position: "absolute", left: 0, top: 0, bottom: 0, width: 2.5,
      background: "var(--act)",
    }} />
  );

  const countPill = (text: string) => (
    <span style={{
      marginLeft: "auto", fontFamily: "var(--ff-mono)", fontSize: 10,
      fontVariantNumeric: "tabular-nums", color: "var(--v23-rail-label)",
    }}>{text}</span>
  );

  const expandedRow = (g: NavGroup) => {
    const active = isGroupActive(g, activeTab);
    if (g.key === "you") {
      return (
        <button
          key={g.key}
          type="button"
          aria-label={g.label}
          aria-current={active ? "page" : undefined}
          data-testid={g.testId}
          data-active={active ? "true" : "false"}
          className="cursor-pointer v23-focus"
          onClick={() => open(g)}
          onMouseEnter={hoverOn}
          onMouseLeave={hoverOff}
          style={rowStyle(active)}
        >
          {active && <ActiveBarWide />}
          <AuraRing userId={uid} size={28} gap="var(--v23-night)">
            <Avatar src={avatarUrl} name={profileName} size="sm" ring="var(--v23-night-line)" />
          </AuraRing>
          <span>{g.label}</span>
        </button>
      );
    }
    return (
      <button
        key={g.key}
        type="button"
        aria-label={g.label}
        aria-current={active ? "page" : undefined}
        aria-haspopup={hasFlyout(g) ? "true" : undefined}
        aria-expanded={hasFlyout(g) ? (flyout === "intelligence") : undefined}
        data-testid={g.testId}
        data-active={active ? "true" : "false"}
        className="cursor-pointer v23-focus"
        onClick={() => {
          if (hasFlyout(g) && active) {
            setFlyout(flyout === "intelligence" ? null : "intelligence");
            if (flyout !== "intelligence") void loadCounts();
            return;
          }
          open(g);
        }}
        onMouseEnter={hoverOn}
        onMouseLeave={hoverOff}
        style={rowStyle(active)}
      >
        {active && <ActiveBarWide />}
        <g.icon size={15} strokeWidth={1.75} />
        <span>{g.label}</span>
        {g.key === "signals" && newSignalCount > 0 && !active && (
          <span aria-label={`${newSignalCount} new signals`} style={{
            marginLeft: "auto", width: 6, height: 6, borderRadius: 999,
            background: "var(--machine)",
          }} />
        )}
        {g.key === "write" && draftCount !== null && draftCount > 0
          && countPill(`${draftCount} draft${draftCount === 1 ? "" : "s"}`)}
      </button>
    );
  };

  return (
    <>
      <a
        href="#aura-main"
        className="v23-skip"
        style={{
          position: "fixed", left: 8, top: 8, zIndex: 60,
          transform: "translateY(-160%)",
          background: "var(--surface-card)", color: "var(--text-primary)",
          border: "1px solid var(--border-strong)", borderRadius: 8,
          padding: "10px 14px", minHeight: 40, fontSize: 13, fontFamily: "var(--ff-ui)",
          transition: "transform 160ms ease",
        }}
        onFocus={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
        onBlur={(e) => { e.currentTarget.style.transform = "translateY(-160%)"; }}
      >Skip to content</a>

      {expanded ? (
        <aside
          ref={railRef}
          data-surface="dark"
          data-testid="aura-rail"
          data-expanded="true"
          aria-label="Primary"
          className="hidden md:flex flex-col fixed top-0 left-0 h-full z-30"
          style={{
            width: "var(--v23-rail-w)",
            background: "var(--v23-night)",
            borderRight: "1px solid var(--v23-night-line)",
            fontFamily: "var(--ff-ui)",
            paddingTop: 14, paddingBottom: 14,
            overflowY: "auto",
          }}
        >
          <div className="flex items-center justify-between" style={{ padding: "0 14px 0 18px" }}>
            <button
              type="button"
              onClick={() => onSelect("home")}
              aria-label="Aura home"
              className="cursor-pointer v23-tap v23-focus"
              style={{
                background: "transparent", border: 0, cursor: "pointer", padding: 0,
                display: "inline-flex", alignItems: "center", gap: 10,
                color: "var(--text-inverse)",
              }}
            >
              <AuraLogo size={26} variant="dark" />
              <span style={{ fontFamily: "var(--ff-ui)", fontSize: 15, fontWeight: 600, letterSpacing: ".01em" }}>Aura</span>
            </button>
            {collapseToggle}
          </div>

          <nav className="flex flex-col" style={{ flex: 1, paddingBottom: 8, paddingTop: 10 }}>
            {DOORS.map((g) => expandedRow(g))}
          </nav>

          {isAdmin === true && (
            <div style={{ borderTop: "1px solid var(--v23-night-line)", paddingTop: 10, marginTop: 4 }}>
              <button
                type="button"
                aria-label="Admin console"
                data-testid="nav-admin"
                data-active="false"
                className="cursor-pointer v23-focus"
                onClick={() => { setFlyout(null); navigate("/admin"); }}
                onMouseEnter={hoverOn}
                onMouseLeave={hoverOff}
                style={rowStyle(false)}
              >
                <ShieldCheck size={15} strokeWidth={1.75} />
                <span>Admin</span>
              </button>
            </div>
          )}

          <div style={{ borderTop: "1px solid var(--v23-night-line)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8, padding: "10px 14px 0" }}>
            {/* Ask Aura lives in the top bar only — it stays reachable when the
                rail is collapsed. The onOpenAsk handler is still accepted here
                so callers and any future rail entry point keep working. */}
            <button
              type="button"
              aria-label="Capture"
              data-testid="nav-capture"
              data-tour="nav-capture"
              className="cursor-pointer v23-focus"
              onClick={() => { setFlyout(null); onOpenCapture(); }}
              style={{
                display: "flex", alignItems: "center", gap: 10, minHeight: 44,
                padding: "10px 12px", borderRadius: 10, cursor: "pointer",
                background: "transparent", border: "1px dashed rgba(255,255,255,.22)",
                color: "var(--v23-on-night)", fontFamily: "var(--ff-ui)", fontSize: 13, fontWeight: 500,
              }}
            >
              <Paperclip size={15} strokeWidth={1.75} />
              <span>Capture something</span>
            </button>
          </div>
        </aside>
      ) : (
      <aside
        ref={railRef}
        data-surface="dark"
        data-testid="aura-rail"
        data-expanded="false"
        aria-label="Primary"
        className="hidden md:flex flex-col items-center fixed top-0 left-0 h-full z-30"
        style={{
          width: "var(--v23-rail-w)",
          background: "var(--v23-night)",
          borderRight: "1px solid var(--v23-night-line)",
          fontFamily: "var(--ff-ui)",
          paddingTop: 14, paddingBottom: 14,
        }}
        onMouseLeave={hideTip}
      >
        <div style={{ marginBottom: 4 }}>{collapseToggle}</div>
        <button
          type="button"
          onClick={() => onSelect("home")}
          aria-label="Aura home"
          className="cursor-pointer v23-tap v23-focus"
          style={{ background: "transparent", border: 0, cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
        >
          <AuraLogo size={26} variant="dark" />
        </button>
        <div aria-hidden style={{ height: 20 }} />

        {/* THE LIVE STRIP — cyan means the machine is awake. The overnight
            numbers are stated once, on Home; the rail only shows liveness. */}
        <div
          tabIndex={0}
          role="status"
          aria-label="Aura runs overnight. Findings appear on Home."
          onMouseEnter={showTip("The Overnight", "Aura reads overnight. Findings appear on Home.")}
          onFocus={showTip("The Overnight", "Aura reads overnight. Findings appear on Home.")}
          onMouseLeave={hideTip}
          onBlur={hideTip}
          style={{
            marginTop: 12, marginBottom: 14, display: "flex", flexDirection: "column",
            alignItems: "center", gap: 4, borderRadius: 8, padding: "4px 6px",
          }}
        >
          <span aria-hidden style={{
            width: 6, height: 6, borderRadius: 999, background: "var(--machine)",
            boxShadow: "var(--v23-ask-glow)",
          }} />
        </div>

        <nav className="flex flex-col items-center" style={{ gap: 6, flex: 1 }}>
          {DOORS.filter((g) => g.key !== "you").map((g) => {
            const active = isGroupActive(g, activeTab);
            return (
              <button
                key={g.key}
                type="button"
                aria-label={g.label}
                aria-current={active ? "page" : undefined}
                aria-haspopup={hasFlyout(g) ? "true" : undefined}
                aria-expanded={hasFlyout(g) ? (flyout === "intelligence") : undefined}
                data-testid={g.testId}
                data-active={active ? "true" : "false"}
                className="cursor-pointer"
                onClick={() => {
                  if (hasFlyout(g) && active) {
                    setFlyout(flyout === "intelligence" ? null : "intelligence");
                    if (flyout !== "intelligence") void loadCounts();
                    return;
                  }
                  open(g);
                }}
                onMouseEnter={(e) => { hoverOn(e); showTip(g.label, g.blurb)(e); }}
                onMouseLeave={(e) => { hoverOff(e); hideTip(); }}
                onFocus={showTip(g.label, g.blurb)}
                onBlur={hideTip}
                style={railBtn(active)}
              >
                {active && <ActiveBar />}
                <g.icon size={18} strokeWidth={1.75} />
                <span style={labelStyle(active)}>{g.label}</span>
                {g.key === "signals" && newSignalCount > 0 && !active && (
                  <span
                    aria-label={`${newSignalCount} new signals`}
                    style={{
                      position: "absolute", top: 7, right: 12, width: 6, height: 6,
                      borderRadius: 999, background: "var(--machine)",
                    }}
                  />
                )}
              </button>
            );
          })}

          <button
            type="button"
            aria-label="Capture"
            data-testid="nav-capture"
            data-tour="nav-capture"
            data-active="false"
            className="cursor-pointer"
            onClick={() => { setFlyout(null); onOpenCapture(); }}
            onMouseEnter={(e) => { hoverOn(e); showTip("Capture", "Save a link, note or document for Aura to read.")(e); }}
            onMouseLeave={(e) => { hoverOff(e); hideTip(); }}
            onFocus={showTip("Capture", "Save a link, note or document for Aura to read.")}
            onBlur={hideTip}
            style={railBtn(false)}
          >
            <Paperclip size={18} strokeWidth={1.75} />
            <span style={labelStyle(false)}>Capture</span>
          </button>
        </nav>

        <div className="flex flex-col items-center" style={{ gap: 6, paddingTop: 10, borderTop: "1px solid var(--v23-night-line)", width: 62 }}>
          {isAdmin === true && (
            <button
              type="button"
              aria-label="Admin console"
              data-testid="nav-admin"
              data-active="false"
              className="cursor-pointer"
              onClick={() => { setFlyout(null); navigate("/admin"); }}
              onMouseEnter={(e) => { hoverOn(e); showTip("Admin", "The Aura console.")(e); }}
              onMouseLeave={(e) => { hoverOff(e); hideTip(); }}
              onFocus={showTip("Admin", "The Aura console.")}
              onBlur={hideTip}
              style={railBtn(false)}
            >
              <ShieldCheck size={18} strokeWidth={1.75} />
              <span style={labelStyle(false)}>Admin</span>
            </button>
          )}
          {(() => {
            const you = DOORS.find((g) => g.key === "you")!;
            const active = isGroupActive(you, activeTab);
            return (
          <button
            type="button"
            aria-label={you.label}
            data-testid={you.testId}
            data-active={active ? "true" : "false"}
            className="cursor-pointer"
            onClick={() => open(you)}
            onMouseEnter={(e) => { hoverOn(e); showTip(you.label, you.blurb)(e); }}
            onMouseLeave={(e) => { hoverOff(e); hideTip(); }}
            onFocus={showTip(you.label, you.blurb)}
            onBlur={hideTip}
            style={railBtn(active)}
          >
            {active && <ActiveBar />}
            <AuraRing userId={uid} size={28} gap="var(--v23-night)">
              <Avatar src={avatarUrl} name={profileName} size="sm" ring="var(--v23-night-line)" />
            </AuraRing>
            <span style={labelStyle(active)}>{you.label}</span>
          </button>
            );
          })()}
        </div>
      </aside>
      )}

      {tip && !expanded && (
        <div className="hidden md:block">
          <TooltipPanel
            title={tip.title}
            body={tip.body}
            left={parseInt(getComputedStyle(document.documentElement).getPropertyValue("--v23-rail-w")) + 8}
            top={tip.top}
          />
        </div>
      )}

      {/* Contextual flyout — flush to the rail, full height, light surface. */}
      {flyout === "intelligence" && (
        <div
          ref={flyoutRef}
          data-testid="rail-flyout"
          role="dialog"
          aria-label="Signals sections"
          className="v23-flyout hidden md:flex flex-col fixed top-0 h-full z-40"
          style={{
            left: "var(--v23-rail-w)", width: "var(--v23-flyout-w)",
            background: "var(--surface-card)",
            borderRight: "1px solid var(--border-default)",
            boxShadow: "var(--shadow-lift)",
            fontFamily: "var(--ff-ui)", padding: 14,
            animation: "v23FlyoutIn 200ms ease both",
          }}
        >
          <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
            <div style={{
              fontFamily: "var(--ff-mono)", fontSize: 10, letterSpacing: ".14em",
              textTransform: "uppercase", color: "var(--text-muted)",
            }}>Signals</div>
            <button
              type="button"
              aria-label="Close"
              className="cursor-pointer"
              onClick={() => setFlyout(null)}
              style={{ background: "transparent", border: 0, cursor: "pointer", color: "var(--text-muted)", padding: 4 }}
            >
              <X size={14} />
            </button>
          </div>

          {/* Every row navigates. The velocity splits hand ?sfilter to the
              Signals board, which applies it and clears the param. */}
          <button
            type="button"
            className="cursor-pointer"
            onClick={() => { setFlyout(null); onSelect("intelligence"); }}
            style={{
              display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between",
              background: "transparent", border: 0, cursor: "pointer",
              padding: "9px 8px", borderRadius: 8, color: "var(--text-primary)", fontSize: 13,
              fontFamily: "var(--ff-ui)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-subtle)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <span style={{ fontWeight: 600 }}>All signals</span>
            <span style={{
              fontFamily: "var(--ff-mono)", fontVariantNumeric: "tabular-nums",
              fontSize: 12, color: "var(--text-secondary)",
            }}>{counts ? counts.all : "—"}</span>
          </button>

          <div style={{ height: 1, background: "var(--rule-divider)", margin: "8px 0" }} />

          {[
            { label: "Accelerating", key: "accelerating", value: counts?.accelerating },
            { label: "Stable", key: "stable", value: counts?.stable },
          ].map((row) => (
            <button
              key={row.label}
              type="button"
              className="cursor-pointer"
              onClick={() => {
                setFlyout(null);
                onSelect("intelligence");
                const next = new URLSearchParams(window.location.search);
                next.set("tab", "intelligence");
                next.set("sfilter", row.key);
                setSearchParams(next);
              }}
              style={{
                display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between",
                padding: "8px 8px", color: "var(--text-secondary)", fontSize: 13,
                background: "transparent", border: 0, cursor: "pointer", borderRadius: 8,
                fontFamily: "var(--ff-ui)",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-subtle)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <span>{row.label}</span>
              <span style={{
                fontFamily: "var(--ff-mono)", fontVariantNumeric: "tabular-nums",
                fontSize: 12, color: "var(--text-secondary)",
              }}>{row.value ?? "—"}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}