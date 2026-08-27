import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import AuraMark from "@/components/brand/AuraMark";
import { useDeskDock, setDeskQuiet, type DeskDockState } from "./deskDockBus";

/**
 * DeskDock — the Desk, parked, on every surface that is not the Desk.
 *
 * It may change colour and width. It never moves, never expands on its own,
 * never carries a badge, a red dot or a sound. The dial stopping is the whole
 * signal: visible if he looks, invisible if he does not.
 *
 * Under 768px it renders nothing — a floating circle over a scrolling list is
 * a thumb trap. There the Desk lives in the bottom tab bar instead.
 */

/* System-B, literal — the dock sits above surfaces that theme independently. */
const NIGHT = "#0F1519";
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

interface Props {
  /** True when the member is already on the Desk surface — the dock renders nothing. */
  surfaceOpen: boolean;
  onOpenDesk: (message?: string) => void;
}

export default function DeskDock({ surfaceOpen, onOpenDesk }: Props) {
  const { state, last } = useDeskDock();
  const [panelOpen, setPanelOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [narrow, setNarrow] = useState(false);
  const [held, setHeld] = useState<DeskDockState | null>(null);
  const releaseRef = useRef<number | null>(null);

  /* Phones get no floating dock at all. */
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 767px)");
    const on = () => setNarrow(mql.matches);
    on();
    mql.addEventListener("change", on);
    return () => mql.removeEventListener("change", on);
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
    releaseRef.current = timer;
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", bump, true);
      document.removeEventListener("focusout", release, true);
    };
  }, [state]);

  if (surfaceOpen || narrow) return null;

  const shown: DeskDockState = held ? { kind: "quiet" } : state;
  const isWorking = shown.kind === "working";
  const isFound = shown.kind === "found";

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
            position: "fixed", insetInlineEnd: 12, bottom: 68, zIndex: 48,
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
        type="button"
        className={isFound ? "desk-dock desk-dock-found" : "desk-dock"}
        aria-label={isWorking ? `Your Desk — ${(shown as any).label}` : isFound ? `Your Desk — ${(shown as any).text}` : "Your Desk"}
        onClick={() => setPanelOpen(v => !v)}
        style={{
          position: "fixed", insetInlineEnd: 12, bottom: 12, zIndex: 48,
          minWidth: 44, height: 44, borderRadius: 999,
          background: NIGHT, color: "#F2F5F9",
          border: isFound ? `1px solid ${CYAN}` : "1px solid transparent",
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: isWorking || isFound ? "0 14px 0 10px" : 0,
          justifyContent: "center", cursor: "pointer", fontFamily: SANS,
          fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap",
        }}
      >
        <span style={{ width: 19, height: 19, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ transform: "scale(0.792)", transformOrigin: "center", display: "inline-flex" }}>
            <AuraMark size={24} state={isWorking ? "working" : isFound ? "held" : "resting"} />
          </span>
        </span>
        {isWorking && <span>{renderLabel((shown as any).label)}</span>}
        {isFound && <span>{(shown as any).text}</span>}
      </button>

      <style>{`
        .desk-dock-found { animation: desk-halo 900ms ease-out 1; }
        @keyframes desk-halo {
          0%   { box-shadow: 0 0 0 0 rgba(0,206,201,.45); }
          100% { box-shadow: 0 0 0 14px rgba(0,206,201,0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .desk-dock-found { animation: none; }
        }
      `}</style>
    </>,
    document.body,
  );
}
