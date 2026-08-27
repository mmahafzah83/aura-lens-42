import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import AuraMark from "@/components/brand/AuraMark";
import { useDeskDock, setDeskQuiet, type DeskDockState } from "./deskDockBus";
import { loadDeskPrefs, saveDeskPrefs, type DeskPrefs, type DockPosition } from "./deskPrefs";

/**
 * DeskDock — the Desk, parked, on every surface that is not the Desk.
 *
 * Idle it is still: no pulse, no drift. Working, the hand turns. A result
 * stops the hand dead, rings the edge cyan and knocks once — a single halo,
 * never a repeat, except the very first result he is ever shown, which knocks
 * three times so he learns what it means.
 *
 * He may move it: press and drag, and it snaps to the nearest corner on
 * release. Corner plus vertical offset is all that is stored, so it can never
 * end up half off-screen. It is a button first — dragging is an enhancement.
 *
 * Under 768px it renders nothing — a floating circle over a scrolling list is
 * a thumb trap. There the Desk lives in the bottom tab bar instead.
 */

/* System-B, literal — the dock sits above surfaces that theme independently. */
const NIGHT = "#0F1519";
const NIGHT_LINE = "#26313A";
const WHITE = "#FFFFFF";
const LINE = "#E2E7EE";
const INK = "#0F1519";
const MUTED = "#5B6673";
const BLUE = "#0670C4";
const CYAN = "#00CEC9";
const MONO = "'IBM Plex Mono', ui-monospace, monospace";
const SANS = "Inter, system-ui, sans-serif";

/** Ten seconds of no keystroke, or focus leaving the field, releases a held result. */
const TYPING_RELEASE_MS = 10_000;
/** Below this, a press is a click. Above it, he is moving the dock. */
const DRAG_THRESHOLD_PX = 5;
const EDGE = 12;

const DEFAULT_POSITION: DockPosition = { corner: "br", offsetY: 0 };

function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "TEXTAREA" || (el as HTMLElement).isContentEditable === true;
}

/** Numbers inside the working label are set in mono; words are not. */
function renderLabel(text: string) {
  return text.split(/(\d[\d.,]*)/).map((part, i) =>
    /^\d/.test(part)
      ? <span key={i} style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{part}</span>
      : <span key={i}>{part}</span>,
  );
}

/** Nearest corner to where he let go. */
function cornerFor(x: number, y: number): DockPosition["corner"] {
  const right = x > window.innerWidth / 2;
  const bottom = y > window.innerHeight / 2;
  return (bottom ? "b" : "t") + (right ? "r" : "l") as DockPosition["corner"];
}

interface Props {
  /** True when the member is already on the Desk surface — the dock renders nothing. */
  surfaceOpen: boolean;
  onOpenDesk: (message?: string) => void;
}

export default function DeskDock({ surfaceOpen, onOpenDesk }: Props) {
  const { state, last, foundId } = useDeskDock();
  const [panelOpen, setPanelOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [narrow, setNarrow] = useState(false);
  const [held, setHeld] = useState<DeskDockState | null>(null);

  const [prefs, setPrefs] = useState<DeskPrefs | null>(null);
  const [pos, setPos] = useState<DockPosition>(DEFAULT_POSITION);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  /** Extra lift so the dock never sits on top of the Feedback button. */
  const [clearance, setClearance] = useState(0);
  /** One value per result. Changing it remounts the halo, so it plays once. */
  const [pulse, setPulse] = useState<{ id: number; times: number } | null>(null);

  const btnRef = useRef<HTMLButtonElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);

  /* Phones get no floating dock at all. */
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 767px)");
    const on = () => setNarrow(mql.matches);
    on();
    mql.addEventListener("change", on);
    return () => mql.removeEventListener("change", on);
  }, []);

  /* Where he last put it, and how many results he has already been shown. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await loadDeskPrefs();
      if (cancelled || !p) return;
      setPrefs(p.prefs);
      if (p.prefs.dock_position) setPos(p.prefs.dock_position);
    })();
    return () => { cancelled = true; };
  }, []);

  /* Typing guard: a `found` that arrives mid-sentence waits, silently. */
  useEffect(() => {
    if (state.kind !== "found") { setHeld(null); return; }
    if (!isTypingTarget(document.activeElement)) { setHeld(null); return; }

    setHeld(state);
    let timer = window.setTimeout(() => setHeld(null), TYPING_RELEASE_MS);
    const bump = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setHeld(null), TYPING_RELEASE_MS);
    };
    const release = () => { window.clearTimeout(timer); setHeld(null); };
    document.addEventListener("keydown", bump, true);
    document.addEventListener("focusout", release, true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", bump, true);
      document.removeEventListener("focusout", release, true);
    };
  }, [state]);

  /**
   * ONE KNOCK. The halo is keyed on `foundId`, which the bus increments once
   * per result, so the element remounts and the animation runs exactly its
   * iteration count and then stops. Three iterations the very first time he is
   * ever shown a result, one every time after — the count is written to
   * `desk_prefs.found_seen` the moment it plays, so first is only ever first.
   */
  useEffect(() => {
    if (state.kind !== "found" || held || !foundId || !prefs) return;
    const seen = prefs.found_seen ?? 0;
    setPulse({ id: foundId, times: seen === 0 ? 3 : 1 });
    const nextPrefs = { ...prefs, found_seen: seen + 1 };
    setPrefs(nextPrefs);
    void saveDeskPrefs(prefs, { found_seen: seen + 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foundId, state.kind, held]);

  /**
   * COLLISION, MEASURED. The Feedback widget marks itself; we read its rect and
   * lift the dock by its height plus 12px only when the two would overlap. No
   * hardcoded number, so the widget can move and this still holds.
   */
  const measure = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const fb = document.querySelector("[data-feedback-button]") as HTMLElement | null;
    if (!fb) { setClearance(0); return; }
    const a = btn.getBoundingClientRect();
    const b = fb.getBoundingClientRect();
    const overlapping =
      a.left < b.right + EDGE && a.right + EDGE > b.left &&
      a.top < b.bottom + EDGE && a.bottom + EDGE > b.top;
    setClearance(prev => {
      const lift = Math.round(b.height + 12);
      if (overlapping && prev === 0) return lift;
      if (!overlapping && prev !== 0) {
        /* Only drop back when the lift is what is keeping them apart. */
        return a.bottom + prev < b.top || a.top - prev > b.bottom ? prev : 0;
      }
      return prev;
    });
  }, []);

  useEffect(() => {
    if (narrow || surfaceOpen) return;
    const id = window.requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    const t = window.setInterval(measure, 2000);
    return () => {
      window.cancelAnimationFrame(id);
      window.removeEventListener("resize", measure);
      window.clearInterval(t);
    };
  }, [measure, narrow, surfaceOpen, pos, panelOpen]);

  /* ── Drag: 5px of movement turns a press into a move ── */
  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, moved: false };
    btnRef.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    d.moved = true;
    setDragOffset({ x: dx, y: dy });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    btnRef.current?.releasePointerCapture?.(e.pointerId);
    setDragOffset(null);
    if (!d || !d.moved) return;
    /* A drag is not a click. */
    suppressClickRef.current = true;
    window.setTimeout(() => { suppressClickRef.current = false; }, 0);

    const corner = cornerFor(e.clientX, e.clientY);
    const fromEdge = corner.startsWith("b")
      ? window.innerHeight - e.clientY
      : e.clientY;
    const offsetY = Math.max(0, Math.round(Math.min(fromEdge - 22, window.innerHeight - 120)));
    const next: DockPosition = { corner, offsetY };
    setPos(next);
    setPanelOpen(false);
    setClearance(0);
    const base = prefs ?? {};
    setPrefs({ ...base, dock_position: next });
    void saveDeskPrefs(base, { dock_position: next });
  };

  if (surfaceOpen || narrow) return null;

  const shown: DeskDockState = held ? { kind: "quiet" } : state;
  const isWorking = shown.kind === "working";
  const isFound = shown.kind === "found";

  const bottomCorner = pos.corner.startsWith("b");
  const rightCorner = pos.corner.endsWith("r");
  const edgeY = EDGE + pos.offsetY + (bottomCorner ? clearance : 0);
  const anchor: React.CSSProperties = {
    position: "fixed",
    zIndex: 48,
    ...(rightCorner ? { right: EDGE } : { left: EDGE }),
    ...(bottomCorner ? { bottom: edgeY } : { top: edgeY }),
  };
  const panelAnchor: React.CSSProperties = {
    position: "fixed",
    zIndex: 48,
    ...(rightCorner ? { right: EDGE } : { left: EDGE }),
    ...(bottomCorner ? { bottom: edgeY + 56 } : { top: edgeY + 56 }),
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    setPanelOpen(false);
    setDeskQuiet();
    onOpenDesk(text);
  };

  return createPortal(
    <>
      {panelOpen && (
        <div
          role="dialog"
          aria-label="Your Desk"
          style={{
            ...panelAnchor,
            width: "min(380px, calc(100vw - 24px))", maxHeight: "40vh",
            display: "flex", flexDirection: "column", overflow: "hidden",
            background: WHITE, border: `1px solid ${LINE}`, borderRadius: 16,
            boxShadow: "0 12px 32px rgba(15,21,25,.14)", fontFamily: SANS,
          }}
        >
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 14 }}>
            {last ? (
              <>
                <p style={{ margin: 0, fontSize: 12, color: MUTED, lineHeight: 1.5 }}>{last.question}</p>
                <p style={{ margin: "8px 0 0", fontSize: 13.5, color: INK, lineHeight: 1.6 }}>{last.answer}</p>
              </>
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
                Nothing has passed through here yet today.
              </p>
            )}
          </div>
          <form onSubmit={submit} style={{ borderTop: `1px solid ${LINE}`, padding: 10, display: "flex", gap: 8 }}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="Assign a task, or ask"
              placeholder="Assign a task, or ask"
              style={{
                flex: 1, border: 0, outline: "none", background: "transparent",
                fontSize: 13.5, color: INK, fontFamily: SANS,
              }}
            />
            <button type="submit" style={{
              border: 0, background: BLUE, color: WHITE, borderRadius: 8,
              padding: "6px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
            }}>Send</button>
          </form>
          <div style={{ borderTop: `1px solid ${LINE}`, padding: "8px 10px" }}>
            <button
              type="button"
              onClick={() => { setPanelOpen(false); onOpenDesk(); }}
              style={{
                background: "transparent", border: `1px solid ${LINE}`, color: MUTED,
                borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}
            >Open Your Desk</button>
          </div>
        </div>
      )}

      <button
        ref={btnRef}
        type="button"
        className="desk-dock"
        data-desk-dock={pos.corner}
        aria-label={
          isWorking ? `Your Desk — ${(shown as any).label}`
          : isFound ? `Your Desk — ${(shown as any).text}`
          : "Your Desk. Drag to move it to another corner."
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { dragRef.current = null; setDragOffset(null); }}
        onClick={() => { if (suppressClickRef.current) return; setPanelOpen(v => !v); }}
        style={{
          ...anchor,
          minWidth: 44, height: 44, borderRadius: 999,
          background: NIGHT,
          border: `1px solid ${isFound ? CYAN : NIGHT_LINE}`,
          boxShadow: "0 6px 20px rgba(15,21,25,.22)",
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: isWorking || isFound ? "0 14px 0 10px" : 0,
          justifyContent: "center", cursor: dragOffset ? "grabbing" : "pointer",
          fontFamily: SANS, fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap",
          touchAction: "none", userSelect: "none",
          transform: dragOffset ? `translate(${dragOffset.x}px, ${dragOffset.y}px)` : undefined,
          /* The mark reads these tokens; on night ground they must be night values. */
          ["--text-primary" as any]: "#F2F5F9",
          ["--text-secondary" as any]: "#93A2AE",
          ["--text-muted" as any]: "#63727E",
          ["--machine" as any]: CYAN,
          ["--amber" as any]: "#E8B04B",
          color: "#F2F5F9",
        }}
      >
        {isFound && pulse && pulse.id === foundId && (
          <span
            key={pulse.id}
            aria-hidden="true"
            className="desk-dock-knock"
            style={{ ["--knock-times" as any]: String(pulse.times) }}
          />
        )}
        <span style={{ width: 19, height: 19, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ transform: "scale(0.792)", transformOrigin: "center", display: "inline-flex" }}>
            <AuraMark size={24} state={isWorking ? "working" : isFound ? "held" : "resting"} />
          </span>
        </span>
        {isWorking && <span>{renderLabel((shown as any).label)}</span>}
        {isFound && <span>{(shown as any).text}</span>}
      </button>

      <style>{`
        .desk-dock { position: fixed; }
        .desk-dock-knock {
          position: absolute; inset: -1px; border-radius: 999px; pointer-events: none;
          animation: desk-knock 600ms ease-out var(--knock-times, 1) both;
        }
        @keyframes desk-knock {
          0%   { box-shadow: 0 0 0 0 rgba(0,206,201,.42); }
          100% { box-shadow: 0 0 0 16px rgba(0,206,201,0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .desk-dock-knock { animation: none; }
        }
      `}</style>
    </>,
    document.body,
  );
}
