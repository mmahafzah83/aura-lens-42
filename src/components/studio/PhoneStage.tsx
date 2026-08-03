import React from "react";
import StudioCanvas from "@/carousel/studio/StudioCanvas";
import type { DeckIR } from "@/carousel/deckIR";
import type { ThemeName } from "@/carousel/render/themes";
import type { FitState } from "@/carousel/render/useFitLadder";
import { T, type Lang } from "./strings";

const wideBtn = (disabled: boolean): React.CSSProperties => ({
  flex: "1 1 0",
  minHeight: 48,
  borderRadius: 12,
  border: "1px solid var(--border-default)",
  background: "var(--surface-card)",
  color: disabled ? "var(--text-muted)" : "var(--text-primary)",
  fontFamily: "var(--ff-ui)",
  fontSize: 15,
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
  width: number;
  current: number;
  onCurrent: (i: number) => void;
  onFit: (index: number, state: FitState) => void;
  mountRef: React.MutableRefObject<HTMLDivElement | null>;
  boxRef: React.MutableRefObject<HTMLDivElement | null>;
  showCanvas: boolean;
  empty?: React.ReactNode;
  footer?: React.ReactNode;
}> = ({ lang, deck, theme, width, current, onCurrent, onFit, mountRef, boxRef, showCanvas, empty, footer }) => {
  const count = deck?.slides.length ?? 0;
  const dir = deck?.dir ?? (lang === "ar" ? "rtl" : "ltr");
  const rtl = lang === "ar";
  const atStart = current <= 0;
  const atEnd = current >= count - 1;

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
    <div ref={boxRef} style={{ display: "grid", gap: 12, minWidth: 0 }}>
      {!deck && (
        <div
          style={{
            aspectRatio: "4 / 5",
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
          }}
        >
          {empty ?? T.noSlidesYet[lang]}
        </div>
      )}

      {deck && (
        <>
          {showCanvas && (
            <div style={{ width: "100%", aspectRatio: "4 / 5", overflow: "hidden", borderRadius: 14 }}>
              <StudioCanvas deck={deck} theme={theme} width={width} current={current} onFit={onFit} mountRef={mountRef} />
            </div>
          )}

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
                  minWidth: 48,
                  minHeight: 48,
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

          <p style={{ fontFamily: "var(--ff-ui)", fontSize: 13, color: "var(--text-secondary)", margin: 0, textAlign: "center" }}>
            {T.slideOf[lang]} {current + 1} {T.of[lang]} {count}
          </p>

          <div dir={rtl ? "rtl" : "ltr"} style={{ display: "flex", gap: 10 }}>
            {rtl ? [next, prev] : [prev, next]}
          </div>
        </>
      )}

      {footer}
    </div>
  );
};

export default PhoneStage;
