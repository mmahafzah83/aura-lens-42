import React, { useEffect, useState } from "react";
import StudioCanvas from "@/carousel/studio/StudioCanvas";
import type { DeckIR } from "@/carousel/deckIR";
import type { ThemeName } from "@/carousel/render/themes";
import type { FitState } from "@/carousel/render/useFitLadder";
import { T, type Lang } from "./strings";
import { clampCanvasWidth } from "./usePhone";

const wideBtn = (disabled: boolean): React.CSSProperties => ({
  flex: "1 1 0",
  minHeight: 44,
  borderRadius: 12,
  border: "1px solid var(--border-default)",
  background: "var(--surface-card)",
  color: disabled ? "var(--text-muted)" : "var(--text-primary)",
  fontFamily: "var(--ff-ui)",
  fontSize: 14,
  fontWeight: 600,
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.6 : 1,
});

/**
 * L1 — THE SLIDE, INSIDE THE FULL-SCREEN EDITING LAYER.
 *
 * This component owns no viewport geometry at all: it fills whatever box its
 * parent gives it (`height: 100%`), the slide takes the remaining space
 * through flex at a 4/5 ratio, and the filmstrip and the two wide steps sit
 * under it. Everything mirrors in Arabic, including the scroll direction of
 * the filmstrip and the order of the two buttons.
 */
export const PhoneStage: React.FC<{
  lang: Lang;
  deck: DeckIR | null;
  theme: ThemeName;
  current: number;
  onCurrent: (i: number) => void;
  onFit: (index: number, state: FitState) => void;
  mountRef: React.MutableRefObject<HTMLDivElement | null>;
  boxRef: React.MutableRefObject<HTMLDivElement | null>;
  showCanvas: boolean;
  empty?: React.ReactNode;
  footer?: React.ReactNode;
}> = ({ lang, deck, theme, current, onCurrent, onFit, mountRef, boxRef, showCanvas, empty, footer }) => {
  const count = deck?.slides.length ?? 0;
  const rtl = lang === "ar";
  // J5 — the filmstrip mirrors on the INTERFACE language, not on the language
  // the deck happens to be written in.
  const dir = rtl ? "rtl" : "ltr";
  const atStart = current <= 0;
  const atEnd = current >= count - 1;

  /**
   * The slide BOX is laid out by CSS alone. This observer only reports how
   * wide that box ended up so the renderer knows how many pixels to draw —
   * it never feeds a layout decision back into the layout.
   */
  const slideBoxRef = React.useRef<HTMLDivElement | null>(null);
  const [renderWidth, setRenderWidth] = useState(320);
  useEffect(() => {
    const el = slideBoxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setRenderWidth(clampCanvasWidth(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [showCanvas]);

  const prev = (
    <button
      key="prev"
      type="button"
      disabled={atStart}
      onClick={() => onCurrent(Math.max(0, current - 1))}
      style={wideBtn(atStart)}
    >
      {rtl ? `${T.prevSlide[lang]} →` : `‹ ${T.prevSlide[lang]}`}
    </button>
  );
  const next = (
    <button
      key="next"
      type="button"
      disabled={atEnd}
      onClick={() => onCurrent(Math.min(count - 1, current + 1))}
      style={wideBtn(atEnd)}
    >
      {rtl ? `← ${T.nextSlide[lang]}` : `${T.nextSlide[lang]} ›`}
    </button>
  );

  return (
    <div
      ref={boxRef}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minWidth: 0,
        // L1 — no viewport arithmetic: the layer above decides the box.
        height: "100%",
        minHeight: 0,
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      {!deck && (
        <div
          style={{
            flex: "1 1 auto",
            minHeight: 0,
            display: "grid",
            placeItems: "center",
            background: "var(--surface-card)",
            border: "1px solid var(--border-default)",
            borderRadius: 14,
            padding: 16,
            fontFamily: "var(--ff-ui)",
            fontSize: 14,
            color: "var(--text-muted)",
            textAlign: "center",
            overflow: "hidden",
          }}
        >
          {empty ?? T.noSlidesYet[lang]}
        </div>
      )}

      {deck && (
        <>
          {/* Row 1 — the slide takes whatever space is left, and no pixel value
              anywhere says how much that is. */}
          <div style={{ flex: "1 1 auto", minHeight: 0, display: "grid", placeItems: "center", overflow: "hidden" }}>
            <div
              ref={slideBoxRef}
              style={{
                // Height first, ratio second: an aspect-ratio box with two max
                // constraints and no definite size collapses to zero.
                height: "100%",
                aspectRatio: "4 / 5",
                maxWidth: "100%",
                display: "grid",
                placeItems: "center",
                overflow: "hidden",
                borderRadius: 14,
              }}
            >
              {showCanvas && (
                <StudioCanvas deck={deck} theme={theme} width={renderWidth} current={current} onFit={onFit} mountRef={mountRef} />
              )}
            </div>
          </div>

          {/* Row 2 — filmstrip and the two wide steps. Never behind the sheet. */}
          <div style={{ flex: "0 0 auto", display: "grid", gap: 8, alignContent: "start" }}>
          <div
            dir={dir}
            style={{ display: "flex", gap: 8, overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: 2 }}
          >
            {deck.slides.map((s) => (
              <button
                key={s.index}
                type="button"
                aria-current={s.index === current ? "true" : undefined}
                onClick={() => onCurrent(s.index)}
                aria-label={`${T.slideOf[lang]} ${s.index + 1}`}
                style={{
                  flex: "0 0 auto",
                  minWidth: 44,
                  minHeight: 44,
                  borderRadius: 10,
                  cursor: "pointer",
                  fontFamily: "var(--ff-mono)",
                  fontSize: 13,
                  background: s.index === current ? "var(--act-tint)" : "var(--surface-subtle)",
                  color: s.index === current ? "var(--act)" : "var(--text-secondary)",
                  border: `1px solid ${s.index === current ? "var(--act)" : "var(--border-default)"}`,
                }}
              >
                {s.index + 1}
              </button>
            ))}
          </div>

          <div dir={rtl ? "rtl" : "ltr"} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {rtl ? [next, prev] : [prev, next]}
          </div>
          <p aria-live="polite" style={{ fontFamily: "var(--ff-ui)", fontSize: 12.5, color: "var(--text-secondary)", margin: 0, textAlign: "center" }}>
            {T.slideOf[lang]} {current + 1} {T.of[lang]} {count}
          </p>
          </div>
        </>
      )}

      {/* Row 3 — anything the caller wants under the two steps. */}
      {footer && <div style={{ flex: "0 0 auto" }}>{footer}</div>}
    </div>
  );
};

export default PhoneStage;
