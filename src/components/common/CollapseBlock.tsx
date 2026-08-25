/**
 * One collapsible block, used by "How you sound" and "What you can show".
 *
 * The published fix for a plain accordion is a heading that previews what is
 * inside well enough to decide, so a collapsed block always keeps a live
 * one-line reading on screen. Nothing here computes: the summary arrives
 * already worded.
 *
 * The whole heading row is the control — a real <button> with aria-expanded
 * and aria-controls, keyboard operable, 44px tall. The chevron is a shape.
 */
import { ChevronDown } from "lucide-react";

const INK = "#0F1519";
const MUTED = "#5B6673";
const LINE = "#E2E7EE";
const WHITE = "#FFFFFF";
const MONO = "'IBM Plex Mono', ui-monospace, monospace";

/** Two-column layout above 900px. Mounted once per pane. */
export function CollapseStyles() {
  return (
    <style>{`
      .cb-grid { display: grid; grid-template-columns: 1fr; gap: 12px; align-items: start; }
      @media (min-width: 901px) {
        .cb-grid { grid-template-columns: 1fr 1fr; }
        .cb-grid > .cb-span { grid-column: 1 / -1; }
      }
      .cb-head {
        inline-size: 100%; display: flex; align-items: center; gap: 12px;
        background: transparent; border: none; cursor: pointer; text-align: start;
        min-block-size: 44px; padding: 10px 0;
      }
      .cb-head:focus-visible { outline: 2px solid #0670C4; outline-offset: 2px; border-radius: 8px; }
      .cb-chev { flex: 0 0 auto; transition: transform 160ms ease; }
      .cb-head[aria-expanded="true"] .cb-chev { transform: rotate(180deg); }
      @media (prefers-reduced-motion: reduce) {
        .cb-chev { transition: none !important; }
      }
    `}</style>
  );
}

/** Read the remembered open/closed map. A browser that blocks storage renders. */
export function loadCollapseState(key: string | null): Record<string, boolean> {
  if (!key) return {};
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

/** Remember it. Failure here must never break the render. */
export function saveCollapseState(key: string | null, value: Record<string, boolean>): void {
  if (!key) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked — the pane still works, it just forgets. */
  }
}

export default function CollapseBlock({
  id, label, summary, controlLabel = "Details", open, onToggle, children, bare = false,
}: {
  id: string;
  label: string;
  /** The live one-line reading shown while the block is closed. */
  summary?: React.ReactNode;
  controlLabel?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  /** No card chrome — the child already draws its own. */
  bare?: boolean;
}) {
  return (
    <section
      className={open ? "cb-span" : undefined}
      style={bare ? undefined : {
        background: WHITE, border: `1px solid ${LINE}`, borderRadius: 20, padding: "6px 16px 12px",
      }}
    >
      <button type="button" className="cb-head" aria-expanded={open} aria-controls={`${id}-panel`} onClick={onToggle}>
        <span style={{ flex: 1, minInlineSize: 0 }}>
          <span style={{ display: "block", fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: ".16em", textTransform: "uppercase", color: MUTED }}>
            {label}
          </span>
          {summary ? (
            <span style={{ display: "block", fontSize: 13, lineHeight: 1.55, color: INK, marginBlockStart: 4 }}>
              {summary}
            </span>
          ) : null}
        </span>
        <span style={{ fontSize: 12, fontWeight: 600, color: MUTED, whiteSpace: "nowrap" }}>
          {open ? "Hide" : controlLabel}
        </span>
        <ChevronDown className="cb-chev" size={16} color={MUTED} aria-hidden />
      </button>
      <div id={`${id}-panel`} hidden={!open}>
        {open ? children : null}
      </div>
    </section>
  );
}
