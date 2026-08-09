/**
 * The Voice OS stylesheet — mounted once by the workspace.
 *
 * Every rule here exists because an inline style could not express it: focus
 * rings, hover, breakpoints, tap targets. Colours and radii are read from
 * `tokens.ts` so there is still one source for them.
 */
import { BLUE, LINE, MUTED, NIGHT_LINE, RADIUS, SURFACE, TAP, TYPE, WHITE } from "@/components/voice/tokens";

export default function VoiceStyles() {
  return (
    <style>{`
      .voice-os :focus-visible,
      .voice-os button:focus-visible,
      .voice-os [role="slider"]:focus-visible,
      .voice-os [role="radio"]:focus-visible,
      .voice-os [role="tab"]:focus-visible,
      .voice-os input:focus-visible,
      .voice-os select:focus-visible {
        outline: 2px solid ${BLUE};
        outline-offset: 2px;
        border-radius: ${RADIUS.button}px;
      }
      .voice-os .on-night:focus-visible { outline-color: #7FD8FF; }

      /* Slider: 44px tap target wrapping a 6px rail. */
      .vd-track {
        position: relative; display: flex; align-items: center;
        block-size: ${TAP}px; margin-block-start: 2px; cursor: pointer; touch-action: none;
      }
      .vd-rail {
        position: relative; inline-size: 100%; block-size: 6px; border-radius: ${RADIUS.rail}px;
        background: linear-gradient(90deg, ${SURFACE}, #DDE4EC);
      }

      .vd-act {
        display: inline-flex; align-items: center; justify-content: center; gap: 4px;
        background: ${WHITE}; color: ${MUTED}; border: 1px solid ${LINE};
        border-radius: ${RADIUS.button}px; padding: 6px 10px; min-block-size: ${TAP}px;
        font-size: ${TYPE.small}px; font-weight: 600; cursor: pointer;
      }
      .vd-act:disabled { opacity: .45; cursor: not-allowed; }
      .vd-act-group { display: none; gap: 6px; flex-wrap: wrap; }
      .vd-act-group[data-open="1"] { display: inline-flex; }

      /* On a pointer device the row's controls appear on hover; no Edit button needed. */
      @media (hover: hover) and (min-width: 768px) {
        .vd-act-edit { display: none; }
        .vd-act-group { display: inline-flex; opacity: 0; transition: opacity .12s ease; }
        .vd-row:hover .vd-act-group, .vd-row:focus-within .vd-act-group { opacity: 1; }
        .vd-act { min-block-size: 0; padding: 4px 9px; }
      }

      .voice-info {
        display: inline-flex; align-items: center; justify-content: center;
        inline-size: 20px; block-size: 20px; padding: 0; border: none; background: transparent;
        color: ${MUTED}; cursor: pointer; border-radius: ${RADIUS.chip}px;
      }
      @media (hover: none) { .voice-info { inline-size: ${TAP}px; block-size: ${TAP}px; } }

      .voice-tabs { position: relative; }
      .voice-tabs::after {
        content: ""; position: absolute; inset-block: 0; inset-inline-end: 0; inline-size: 28px;
        background: linear-gradient(to left, ${WHITE}, rgba(255,255,255,0)); pointer-events: none;
      }
      @media (min-width: 700px) { .voice-tabs::after { display: none; } }

      .vd-modes, .vd-rules { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
      .vo-health { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
      .vo-split { display: grid; grid-template-columns: 1.35fr 1fr; gap: 12px; align-items: start; }
      @media (max-width: 860px) {
        .vd-modes, .vd-rules, .vo-health, .vo-split { grid-template-columns: 1fr; }
      }

      /* Corpus rows stack rather than overflow on a phone. */
      .ta-row { display: grid; grid-template-columns: 84px minmax(0,1fr) auto; gap: 12px; align-items: center; }
      @media (max-width: 560px) {
        .ta-row { grid-template-columns: 1fr; gap: 6px; }
      }

      .night-line { border-color: ${NIGHT_LINE}; }

      @keyframes auraBlink { 0%, 100% { opacity: 1 } 50% { opacity: .25 } }
      @media (prefers-reduced-motion: reduce) {
        .voice-os *, .voice-os *::before, .voice-os *::after { animation: none !important; transition: none !important; }
      }
    `}</style>
  );
}
