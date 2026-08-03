import React from "react";
import StudioCanvas from "@/carousel/studio/StudioCanvas";
import type { DeckIR } from "@/carousel/deckIR";
import type { ThemeName } from "@/carousel/render/themes";
import type { FitState } from "@/carousel/render/useFitLadder";
import { T, type Lang } from "./strings";

const navBtn: React.CSSProperties = {
  minWidth: 44,
  minHeight: 44,
  borderRadius: 10,
  border: "1px solid var(--border-default)",
  background: "var(--surface-card)",
  color: "var(--text-primary)",
  fontFamily: "var(--ff-ui)",
  fontSize: 18,
  cursor: "pointer",
};

/**
 * CENTRE zone. One wrapper: the slide, the navigation under it and the
 * thumbnail strip all live INSIDE this single element, never beside it.
 */
export const ZoneStage: React.FC<{
  lang: Lang;
  deck: DeckIR | null;
  theme: ThemeName;
  width: number;
  current: number;
  onCurrent: (i: number) => void;
  onFit: (index: number, state: FitState) => void;
  mountRef: React.MutableRefObject<HTMLDivElement | null>;
  boxRef: React.MutableRefObject<HTMLDivElement | null>;
  empty?: React.ReactNode;
  /** False when the mount lives offscreen instead (so it survives step changes). */
  showCanvas: boolean;
  /** Rendered inside this wrapper, so the three-zone grid keeps exactly three children. */
  footer?: React.ReactNode;
}> = ({
  lang, deck, theme, width, current, onCurrent, onFit, mountRef, boxRef, empty,
  showCanvas, footer,
}) => {
  const count = deck?.slides.length ?? 0;
  const dir = deck?.dir ?? (lang === "ar" ? "rtl" : "ltr");

  return (
    <div
      ref={boxRef}
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--border-default)",
        borderRadius: 14,
        padding: 14,
        minWidth: 0,
      }}
    >
      {!deck && (
        <div
          style={{
            minHeight: 260,
            display: "grid",
            placeItems: "center",
            fontFamily: "var(--ff-ui)",
            fontSize: 13.5,
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
            <StudioCanvas
              deck={deck}
              theme={theme}
              width={width}
              current={current}
              onFit={onFit}
              mountRef={mountRef}
            />
          )}

          <div
            dir={dir}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              marginTop: 12,
            }}
          >
            <button
              type="button"
              aria-label={T.prevSlide[lang]}
              disabled={current <= 0}
              onClick={() => onCurrent(Math.max(0, current - 1))}
              style={{ ...navBtn, opacity: current <= 0 ? 0.45 : 1 }}
            >
              ‹
            </button>
            <span style={{ fontFamily: "var(--ff-ui)", fontSize: 13, color: "var(--text-secondary)" }}>
              {T.slideOf[lang]} {current + 1} {T.of[lang]} {count}
            </span>
            <button
              type="button"
              aria-label={T.nextSlide[lang]}
              disabled={current >= count - 1}
              onClick={() => onCurrent(Math.min(count - 1, current + 1))}
              style={{ ...navBtn, opacity: current >= count - 1 ? 0.45 : 1 }}
            >
              ›
            </button>
          </div>

          <div
            dir={dir}
            style={{ display: "flex", gap: 8, marginTop: 12, overflowX: "auto", paddingBottom: 4 }}
          >
            {deck.slides.map((s) => (
              <button
                key={s.index}
                type="button"
                aria-current={s.index === current ? "true" : undefined}
                onClick={() => onCurrent(s.index)}
                aria-label={`${T.slideOf[lang]} ${s.index + 1}`}
                style={{
                  minWidth: 44,
                  minHeight: 44,
                  borderRadius: 8,
                  cursor: "pointer",
                  fontFamily: "var(--ff-mono)",
                  fontSize: 12,
                  background: s.index === current ? "var(--act-tint)" : "var(--surface-subtle)",
                  color: s.index === current ? "var(--act)" : "var(--text-secondary)",
                  border: `1px solid ${s.index === current ? "var(--act)" : "var(--border-default)"}`,
                }}
              >
                {s.index + 1}
              </button>
            ))}
          </div>
        </>
      )}

      {footer && <div style={{ marginTop: 12 }}>{footer}</div>}
    </div>
  );
};

export default ZoneStage;