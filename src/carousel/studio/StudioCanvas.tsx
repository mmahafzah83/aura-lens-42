/**
 * THE mount. This is the only place a deck's slides exist in the DOM, and it
 * is the container the exporter reads. What the member sees here is literally
 * the node that gets rasterised — no clone, no export-time re-render.
 *
 * Layout is a scroll-snap row: every slide is mounted at its true 1080x1350
 * and CSS-scaled to the available width; the row shows one at a time.
 */
import React, { useEffect, useRef } from "react";
import type { DeckIR } from "../deckIR";
import { CANVAS_H, CANVAS_W, Slide } from "../render/Slide";
import type { FitState } from "../render/useFitLadder";
import type { ThemeName } from "../render/themes";

export function StudioCanvas({
  deck, theme, width, current, onFit, mountRef,
}: {
  deck: DeckIR;
  theme: ThemeName;
  width: number;
  current: number;
  onFit: (index: number, state: FitState) => void;
  mountRef: React.RefObject<HTMLDivElement | null>;
}) {
  const scale = width / CANVAS_W;
  const rowRef = useRef<HTMLDivElement | null>(null);

  // Follow the filmstrip selection without ever unmounting a slide.
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const child = row.children[current] as HTMLElement | undefined;
    if (child) row.scrollTo({ left: child.offsetLeft - row.offsetLeft, behavior: "smooth" });
  }, [current]);

  return (
    <div
      ref={(n) => {
        rowRef.current = n;
        mountRef.current = n;
      }}
      data-deck-mount=""
      style={{
        display: "flex",
        gap: 16,
        overflowX: "auto",
        scrollSnapType: "x mandatory",
        borderRadius: 16,
        scrollbarWidth: "none",
      }}
    >
      {deck.slides.map((slide) => (
        <div
          key={slide.index}
          data-slide-frame=""
          style={{
            width,
            height: CANVAS_H * scale,
            overflow: "hidden",
            borderRadius: 16,
            flex: "0 0 auto",
            scrollSnapAlign: "center",
            boxShadow: slide.index === current ? "var(--shadow-lift)" : "none",
            opacity: slide.index === current ? 1 : 0.55,
            transition: "opacity 180ms ease",
          }}
        >
          <div data-slide-scaler="" style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
            <Slide deck={deck} slide={slide} theme={theme} onFit={(f) => onFit(slide.index, f)} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default StudioCanvas;