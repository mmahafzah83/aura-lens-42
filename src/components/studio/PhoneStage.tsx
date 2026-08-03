import React, { useEffect, useState } from "react";
import StudioCanvas from "@/carousel/studio/StudioCanvas";
import type { DeckIR } from "@/carousel/deckIR";
import type { ThemeName } from "@/carousel/render/themes";
import type { FitState } from "@/carousel/render/useFitLadder";
import { T, type Lang } from "./strings";
import {
  PHONE_COLUMN_H,
  PHONE_ROWS_BELOW,
  PHONE_ROWS_BELOW_SHEET,
  PHONE_SHEET_H,
  PHONE_SHEET_H_TALL,
  clampCanvasWidth,
} from "./usePhone";

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
 * M3 — STEP 3 ON A PHONE.
 *
 * The slide is the hero: full width, 4/5, at the very top of the content, so
 * the bottom sheet below it can never cover it. Under the slide sits the
 * filmstrip, then two full-width buttons carrying real words rather than bare
 * arrow glyphs. Everything mirrors in Arabic, including the scroll direction
 * of the filmstrip and the order of the two buttons.
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
  /** A sheet is open, so the column ends where the sheet begins. */
  sheetOpen: boolean;
  /** The open sheet is expanded, so the slide shrinks further. */
  sheetTall: boolean;
  empty?: React.ReactNode;
  footer?: React.ReactNode;
}> = ({ lang, deck, theme, current, onCurrent, onFit, mountRef, boxRef, showCanvas, sheetOpen, sheetTall, empty, footer }) => {
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
        // K2 — fixed height, in CSS. The page itself never scrolls here.
        height: PHONE_COLUMN_H,
        overflow: "hidden",
        // When a sheet is open the column stops where the sheet starts, so the
        // slide shrinks through flex instead of being covered.
        paddingBottom: sheetOpen ? `calc(${sheetTall ? PHONE_SHEET_H_TALL : PHONE_SHEET_H} + 8px)` : 0,
        boxSizing: "border-box",
        transition: "padding-bottom .2s ease",
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
                aspectRatio: "4 / 5",
                maxHeight: "100%",
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

      {/* Row 3 — the sheet openers. They stand down while a sheet is open, so
          the filmstrip and the two steps always keep their place. */}
      {!sheetOpen && footer && <div style={{ flex: "0 0 auto" }}>{footer}</div>}
    </div>
  );
};

export default PhoneStage;
