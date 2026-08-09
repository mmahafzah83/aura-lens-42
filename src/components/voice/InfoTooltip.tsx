/**
 * A definition at the point of use.
 *
 * The `title` attribute is invisible on touch, which is where half of this is
 * read, so this opens on tap as well as hover and focus. It explains a term —
 * it is never decoration on a plain label.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import { INK, LINE, MONO, MUTED, RADIUS, TYPE, WHITE } from "@/components/voice/tokens";

export default function InfoTooltip({ term, body }: { term: string; body: string }) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const btn = useRef<HTMLButtonElement | null>(null);
  const id = useId();

  const place = useCallback(() => {
    const el = btn.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 268)), top: r.bottom + 8 });
  }, []);

  const hide = useCallback(() => setPos(null), []);

  useEffect(() => {
    if (!pos) return;
    const onScroll = () => setPos(null);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [pos]);

  return (
    <>
      <button
        ref={btn}
        type="button"
        className="voice-info"
        aria-label={`What ${term} means`}
        aria-expanded={pos !== null}
        aria-describedby={pos ? id : undefined}
        onClick={(e) => { e.stopPropagation(); pos ? hide() : place(); }}
        onMouseEnter={place}
        onMouseLeave={hide}
        onFocus={place}
        onBlur={hide}
      >
        <Info size={13} aria-hidden />
      </button>
      {pos && createPortal(
        <div
          id={id}
          role="tooltip"
          className="voice-info-panel"
          style={{
            position: "fixed", left: pos.left, top: pos.top, zIndex: 60, maxInlineSize: 260,
            background: WHITE, color: INK, border: `1px solid ${LINE}`, borderRadius: RADIUS.button,
            padding: "9px 11px", boxShadow: "0 8px 24px rgba(15,21,25,.14)", pointerEvents: "none",
          }}
        >
          <div style={{ fontFamily: MONO, fontSize: TYPE.micro, letterSpacing: ".08em", textTransform: "uppercase", color: MUTED }}>
            {term}
          </div>
          <div style={{ fontSize: TYPE.small, lineHeight: 1.6, marginBlockStart: 3 }}>{body}</div>
        </div>,
        document.body,
      )}
    </>
  );
}
