/** Renders every slide of a deck at a chosen display width. */
import React from "react";
import type { DeckIR } from "../deckIR";
import { CANVAS_H, CANVAS_W, Slide } from "./Slide";
import type { FitState } from "./useFitLadder";
import type { ThemeName } from "./themes";

export function DeckPreview({
  deck, theme, width = 360, onFit,
}: {
  deck: DeckIR;
  theme?: ThemeName;
  width?: number;
  onFit?: (index: number, state: FitState) => void;
}) {
  const scale = width / CANVAS_W;
  return (
    <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
      {deck.slides.map((slide) => (
        <div
          key={slide.index}
          data-slide-frame=""
          style={{ width, height: CANVAS_H * scale, overflow: "hidden", borderRadius: 12, flex: "0 0 auto" }}
        >
          <div data-slide-scaler="" style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
            <Slide deck={deck} slide={slide} theme={theme} onFit={(f) => onFit?.(slide.index, f)} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default DeckPreview;