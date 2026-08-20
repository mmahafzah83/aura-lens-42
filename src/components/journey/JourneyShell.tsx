/**
 * ONE SHELL FOR THE WHOLE JOURNEY — v2.
 *
 * Bar (56px) + progress (44px) = 100px, sticky, white, one hairline under it,
 * a border at rest and never a shadow.
 *
 * Four slots, fixed order, reserved width even when empty (an element that
 * mounts after first paint costs layout shift):
 *   [back] · [mark] Aura · … · [identity] · Finish later
 *
 * PROGRESS IS FLAT. One connected three-segment bar, labelled, no counts
 * anywhere in the chrome: this journey is conditional (CV, sector and purpose
 * are all optional), so "step n of 5" is not true of anyone's journey. The
 * fill is continuous and monotonic — it may never move backwards.
 */
import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { AuraLogo } from "@/components/brand/AuraLogo";

const CARD = "#FFFFFF";
const LINE = "#E2E7EE";
const INK = "#0F1519";
const INK2 = "#5B6673";
const CYAN = "#00CEC9";
const CYAN_TINT = "rgba(0,206,201,.4)";
const CYAN_TEXT = "#00807B";
const UI = "'Inter', system-ui, -apple-system, sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, Menlo, monospace";

export const BAR_H = 56;
export const PROGRESS_H = 44;
export const CHROME_H = BAR_H + PROGRESS_H; // 100

/** Kept for callers that still describe where they are; never rendered as a count. */
export { STAGE_NAMES } from "@/lib/brand";

/** The three beats of the one journey. Always all three, always visible. */
export const BEATS = ["Your read", "Your evidence", "Your position"] as const;
export type Beat = 1 | 2 | 3;

/**
 * THE BAR IS WEIGHTED BY REAL EFFORT, NOT BY BEAT COUNT.
 *
 * Three equal thirds put 85% of the work — eight sliders and nine questions —
 * inside 7% of the fill. These are the measured shares of the journey's work,
 * and the caller's global fraction is computed against the same numbers, so a
 * fill can never land outside the segment its label claims.
 */
export const BEAT_WEIGHTS: [number, number, number] = [3 / 53.5, 45 / 53.5, 5.5 / 53.5];
/** Cumulative boundaries: [0, end of beat 1, end of beat 2, 1]. */
export const BEAT_BOUNDS: [number, number, number, number] = [
  0,
  BEAT_WEIGHTS[0],
  BEAT_WEIGHTS[0] + BEAT_WEIGHTS[1],
  1,
];

export interface JourneySub {
  /** 1-based step inside the beat currently in progress. Drives partial fill only. */
  n: number;
  total: number;
  label: string;
}

/* ─────────────────────────── shell stylesheet ─────────────────────────── */

/**
 * The container is restored to its measured production value: a 640px card,
 * 32px padding, so the measure inside is 576px ≈ 72 characters at 16px.
 * `scroll-padding-top` is required by WCAG SC 2.4.11 — a focused control must
 * never be entirely hidden behind the sticky bar.
 */
const SHELL_CSS = `
html{scroll-padding-top:${CHROME_H + 8}px;}
.jshell{--content-max:640px;--card-pad:32px;--gutter:16px;}
@media (min-width:768px){.jshell{--gutter:24px;}}
@media (min-width:1280px){.jshell{--gutter:32px;}}
/* Higher specificity than .obc so the shell owns container and type. */
.jshell.jshell{--ob-max:var(--content-max);--ob-pad:var(--card-pad);
  --ob-h1:30px;--ob-h2:20px;--ob-body:16px;--ob-small:14px;--ob-mono:12.5px;--ob-lh:1.6;}
@media (min-width:768px){.jshell.jshell{--ob-h1:34px;}}
.jshell-stage{inline-size:100%;max-inline-size:var(--content-max);margin-inline:auto;}
.jshell-skip{position:absolute;inset-block-start:-200px;inset-inline-start:8px;z-index:60;
  background:${CARD};color:${INK};border:1px solid ${LINE};border-radius:10px;
  padding:12px 16px;min-block-size:44px;display:inline-flex;align-items:center;
  font-family:${UI};font-size:14px;font-weight:600;text-decoration:none;}
.jshell-skip:focus{inset-block-start:8px;}
`;

let cssMounted = 0;
const useShellCss = () => {
  useEffect(() => {
    cssMounted += 1;
    let el = document.getElementById("jshell-css") as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = "jshell-css";
      el.textContent = SHELL_CSS;
      document.head.appendChild(el);
    }
    return () => {
      cssMounted -= 1;
      if (cssMounted <= 0) document.getElementById("jshell-css")?.remove();
    };
  }, []);
};

/* ───────────────────────────────── bar ─────────────────────────────────── */

const firstNameOf = (name?: string | null): string =>
  String(name ?? "").trim().split(/\s+/).filter(Boolean)[0] ?? "";

const initialsOf = (name?: string | null): string => {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
};

/** A control that is genuinely 44×44, whatever its label. */
const TAP: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
  minHeight: 44, minWidth: 44, padding: "0 8px",
  background: "none", border: "none", cursor: "pointer",
  fontFamily: UI, fontSize: 14, fontWeight: 600,
};

/** Slot 1 + 2 + 3 + 4. 56px. Every slot keeps its width when empty. */
const JourneyBar = ({ onBack, onExit, name }: {
  onBack?: () => void; onExit: () => void; name?: string | null;
}) => {
  const first = firstNameOf(name);
  const initials = initialsOf(name);
  return (
    <div
      style={{
        blockSize: BAR_H, background: CARD,
        display: "flex", alignItems: "center", gap: 8,
        paddingInline: "max(8px, calc(var(--gutter, 16px) - 8px))",
      }}
    >
      {/* slot 1 — reserved width, always mounted */}
      <div style={{ inlineSize: 44, flexShrink: 0 }}>
        <button
          type="button"
          onClick={onBack}
          aria-label="Back one step"
          aria-hidden={onBack ? undefined : true}
          tabIndex={onBack ? undefined : -1}
          style={{ ...TAP, inlineSize: 44, padding: 0, color: INK2,
            visibility: onBack ? "visible" : "hidden",
            pointerEvents: onBack ? "auto" : "none" }}
        >
          <ArrowLeft size={17} aria-hidden />
        </button>
      </div>

      {/* slot 2 — the mark. Identity, not navigation. */}
      <span
        role="img"
        aria-label="Aura"
        style={{
          display: "inline-flex", alignItems: "center", gap: 7,
          fontFamily: UI, fontWeight: 700, fontSize: 13,
          letterSpacing: "0.14em", color: INK, whiteSpace: "nowrap",
        }}
      >
        <AuraLogo size={22} density="compact" variant="light" ink={INK} tick={CYAN_TEXT} title="" />
        AURA
      </span>

      <span style={{ flex: 1 }} />

      {/* slot 3 — identity, reserved-but-empty when unknown. Never with Sign in. */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        inlineSize: first ? "auto" : 30, minBlockSize: 30, minWidth: 0,
        justifyContent: "flex-end",
      }}>
        <span aria-hidden style={{
          inlineSize: 30, blockSize: 30, borderRadius: 999, flexShrink: 0,
          background: INK, color: CARD, display: "inline-flex",
          alignItems: "center", justifyContent: "center",
          fontFamily: MONO, fontSize: 12.5, letterSpacing: "0.04em",
          visibility: initials ? "visible" : "hidden",
        }}>{initials || "··"}</span>
        {first ? (
          <span style={{
            fontFamily: UI, fontSize: 14, fontWeight: 600, color: INK,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxInlineSize: 120,
          }}>{first}</span>
        ) : null}
      </div>

      {/* slot 4 — the one quiet way out. A label, never an X. */}
      <button type="button" onClick={onExit} style={{ ...TAP, color: INK2, flexShrink: 0 }}>
        Finish later
      </button>
    </div>
  );
};

/* ─────────────────────────────── progress ──────────────────────────────── */

/**
 * Where the fill should sit, 0–1 across the whole journey, when the caller has
 * nothing better. Segments are weighted by real effort (BEAT_WEIGHTS), so a
 * beat that carries most of the work owns most of the bar.
 */
export const fractionOf = (beat: Beat, sub?: JourneySub | null): number => {
  const start = BEAT_BOUNDS[beat - 1];
  const end = BEAT_BOUNDS[beat];
  const inner = sub && sub.total > 0
    ? Math.max(0, Math.min(1, (sub.n - 1) / sub.total))
    : 0;
  return Math.max(0, Math.min(1, start + (end - start) * inner));
};

/**
 * ONE CONNECTED BAR, THREE LABELLED SEGMENTS, weighted by effort.
 *
 * The fill moves with the member — forwards on Continue and backwards on Back.
 * A fill that refuses to regress while the labels do is two widgets telling
 * two stories; one truth is better than one flattering half.
 */
export const JourneyProgress = ({ beat, sub, fraction }: {
  beat: Beat; sub?: JourneySub | null; fraction?: number;
}) => {
  const fill = Math.max(0, Math.min(1, fraction ?? fractionOf(beat, sub)));

  return (
    <div
      style={{
        blockSize: PROGRESS_H, background: CARD,
        display: "flex", flexDirection: "column", justifyContent: "center", gap: 6,
        paddingInline: "var(--gutter, 16px)",
      }}
    >
      {/* the track: one connected bar, filled continuously */}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fill * 100)}
        aria-label={`Where you are: ${BEATS[beat - 1]}`}
        style={{
          position: "relative", blockSize: 4, borderRadius: 999,
          background: LINE, overflow: "hidden",
        }}
      >
        {/* the segment in progress, tinted — sized by its own weight */}
        <div aria-hidden style={{
          position: "absolute", insetBlock: 0,
          insetInlineStart: `${BEAT_BOUNDS[beat - 1] * 100}%`,
          inlineSize: `${BEAT_WEIGHTS[beat - 1] * 100}%`,
          background: CYAN_TINT,
        }} />
        {/* everything completed, solid */}
        <div aria-hidden style={{
          position: "absolute", insetBlock: 0, insetInlineStart: 0,
          inlineSize: `${fill * 100}%`, background: CYAN,
          transition: "inline-size 320ms cubic-bezier(.22,1,.36,1)",
        }} />
      </div>

      {/* the labels, one per segment */}
      <div style={{ display: "flex", gap: 8 }}>
        {BEATS.map((name, i) => {
          const n = (i + 1) as Beat;
          const now = n === beat;
          const done = n < beat;
          return (
            <span
              key={name}
              aria-current={now ? "step" : undefined}
              style={{
                flex: 1, minWidth: 0,
                textAlign: i === 0 ? "start" : i === BEATS.length - 1 ? "end" : "center",
                fontFamily: UI, fontSize: 12.5, lineHeight: 1.4,
                fontWeight: done || now ? 700 : 500,
                color: done || now ? CYAN_TEXT : INK2,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}
            >
              {name}
            </span>
          );
        })}
      </div>
    </div>
  );
};


/* ──────────────────────────────── chrome ───────────────────────────────── */

/**
 * Exactly one banner. Skip link is the first focusable element on the page.
 *
 * `showProgress={false}` is for screens that are NOT part of the member's
 * journey — identity confirmation, setting a password. Claiming a third of a
 * journey the member has not begun is worse than showing nothing.
 */
export const JourneyChrome = ({ onBack, onExit, name, beat, sub, fraction, showProgress = true }: {
  onBack?: () => void; onExit: () => void; name?: string | null;
  beat: Beat; sub?: JourneySub | null; fraction?: number; showProgress?: boolean;
}) => {
  useShellCss();
  return (
    <header
      role="banner"
      className="jshell"
      style={{
        position: "sticky", insetBlockStart: 0, zIndex: 30,
        background: CARD, borderBlockEnd: `1px solid ${LINE}`, boxShadow: "none",
      }}
    >
      <a className="jshell-skip" href="#journey-main">Skip to content</a>
      <JourneyBar onBack={onBack} onExit={onExit} name={name} />
      {showProgress ? <JourneyProgress beat={beat} sub={sub} fraction={fraction} /> : null}
    </header>
  );
};

/* ───────────────────────────────── shell ───────────────────────────────── */

/** Chrome plus one main, one centred 640px stage. */
const JourneyShell = ({
  onBack, onExit, name, beat, sub, fraction, showProgress = true, background = "#F2F5F9",
  padding, className, children,
}: {
  onBack?: () => void; onExit: () => void; name?: string | null;
  beat: Beat; sub?: JourneySub | null; fraction?: number; showProgress?: boolean;
  background?: string; padding?: string; className?: string; children: React.ReactNode;
}) => {
  useShellCss();
  const mainRef = useRef<HTMLElement | null>(null);

  /* SC 2.4.3 — a new screen starts at the top of its own content. */
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const h1 = el.querySelector("h1") as HTMLElement | null;
    (h1 ?? el).focus?.({ preventScroll: true });
  }, [beat, sub?.n]);

  return (
    <div
      className={["jshell", className].filter(Boolean).join(" ")}
      style={{ minBlockSize: "100dvh", background, display: "flex", flexDirection: "column" }}
    >
      <JourneyChrome onBack={onBack} onExit={onExit} name={name} beat={beat} sub={sub}
        fraction={fraction} showProgress={showProgress} />

      <main
        id="journey-main"
        ref={mainRef as any}
        tabIndex={-1}
        style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
          padding: padding ?? "28px var(--gutter, 16px)", outline: "none",
        }}
      >
        <div className="jshell-stage">{children}</div>
      </main>
    </div>
  );
};

export default JourneyShell;
