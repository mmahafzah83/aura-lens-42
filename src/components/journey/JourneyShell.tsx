/**
 * ONE SHELL FOR THE WHOLE JOURNEY.
 *
 * Every screen from the quick read through to the account wall wears this and
 * nothing else. No screen renders its own header, and no screen may alter this
 * one — the chrome changes only when the destination changes.
 *
 * Bar (56px, sticky, white, one hairline under it), four slots, in this order:
 *   1 back — reserved width even when empty, so the mark never slides
 *   2 the mark + Aura — left-aligned, never centred
 *   3 identity — monogram + first name, reserved when unknown
 *   4 Finish later — always last, always present
 * Nothing else may ever appear in the bar. `Sign in` in particular does not:
 * asking a member to identify themselves while naming them reads as broken.
 */
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";

const CARD = "#FFFFFF";
const LINE = "#E2E7EE";
const INK = "#0F1519";
const INK2 = "#5B6673";
const CYAN = "#00CEC9";
const CYAN_SOFT = "rgba(0,206,201,.4)";
const CYAN_TEXT = "#00807B";
const UI = "'Inter', system-ui, -apple-system, sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, Menlo, monospace";

/** The three beats of the one journey. Always all three, always visible. */
export const BEATS = ["Your read", "Your evidence", "Your position"] as const;
export type Beat = 1 | 2 | 3;

export interface JourneySub {
  /** 1-based step inside the beat currently in progress. */
  n: number;
  total: number;
  label: string;
}

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
  fontFamily: UI, fontSize: 13.5, fontWeight: 600,
};

const useNarrow = (query = "(max-width: 767px)"): boolean => {
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, [query]);
  return narrow;
};

/** Slot 1 + 2 + 3 + 4. 56px. Never anything else. */
const JourneyBar = ({ onBack, onExit, name }: {
  onBack?: () => void; onExit: () => void; name?: string | null;
}) => {
  const first = firstNameOf(name);
  const initials = initialsOf(name);
  return (
    <div
      style={{
        blockSize: 56, background: CARD, borderBlockEnd: `1px solid ${LINE}`,
        display: "flex", alignItems: "center", gap: 8, paddingInline: 8,
      }}
    >
      {/* slot 1 — reserved width, always */}
      <div style={{ inlineSize: 44, flexShrink: 0 }}>
        {onBack ? (
          <button type="button" onClick={onBack} aria-label="Back one step"
            style={{ ...TAP, inlineSize: 44, padding: 0, color: INK2 }}>
            <ArrowLeft size={17} aria-hidden />
          </button>
        ) : null}
      </div>

      {/* slot 2 — the mark, left-aligned */}
      <span
        aria-label="Aura"
        style={{
          display: "inline-flex", alignItems: "center", gap: 7,
          fontFamily: UI, fontWeight: 700, fontSize: 13,
          letterSpacing: "0.14em", color: INK, whiteSpace: "nowrap",
        }}
      >
        <span aria-hidden style={{ color: CYAN_TEXT, fontSize: 13 }}>✳</span>
        AURA
      </span>

      <span style={{ flex: 1 }} />

      {/* slot 3 — identity, reserved when unknown */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, minInlineSize: 30, minWidth: 0,
        justifyContent: "flex-end",
      }}>
        {initials ? (
          <span aria-hidden style={{
            inlineSize: 30, blockSize: 30, borderRadius: 999, flexShrink: 0,
            background: INK, color: CARD, display: "inline-flex",
            alignItems: "center", justifyContent: "center",
            fontFamily: MONO, fontSize: 12, letterSpacing: "0.04em",
          }}>{initials}</span>
        ) : null}
        {first ? (
          <span style={{
            fontFamily: UI, fontSize: 13.5, fontWeight: 600, color: INK,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxInlineSize: 120,
          }}>{first}</span>
        ) : null}
      </div>

      {/* slot 4 — the one quiet way out */}
      <button type="button" onClick={onExit} style={{ ...TAP, color: INK2, flexShrink: 0 }}>
        Finish later
      </button>
    </div>
  );
};

/**
 * ONE PROGRESS SYSTEM, NESTED. Three beats always; the `n of N` sub-count only
 * on the beat in progress, and only where those steps genuinely exist.
 * No blue in this row — blue is the primary action only.
 */
export const JourneyProgress = ({ beat, sub }: { beat: Beat; sub?: JourneySub | null }) => {
  const narrow = useNarrow();
  const label = BEATS[beat - 1];
  const count = sub ? (
    <span style={{ fontFamily: UI, fontSize: 12.5, color: INK2, whiteSpace: "nowrap" }}>
      <span style={{ fontFamily: MONO }}>{sub.n}</span> of <span style={{ fontFamily: MONO }}>{sub.total}</span>
      {sub.label ? ` · ${sub.label}` : ""}
    </span>
  ) : null;

  if (narrow) {
    return (
      <div
        aria-label={`Where you are: ${label}${sub ? `, step ${sub.n} of ${sub.total}` : ""}`}
        style={{
          blockSize: 40, background: CARD, borderBlockEnd: `1px solid ${LINE}`,
          display: "flex", alignItems: "center", gap: 8, paddingInline: 14,
          overflow: "hidden", whiteSpace: "nowrap",
        }}
      >
        <span aria-hidden style={{
          inlineSize: 8, blockSize: 8, borderRadius: 999, flexShrink: 0,
          background: CYAN_SOFT, border: `1px solid ${CYAN}`,
        }} />
        <span style={{ fontFamily: UI, fontSize: 12.5, fontWeight: 600, color: CYAN_TEXT }}>{label}</span>
        {sub ? <span aria-hidden style={{ color: LINE }}>·</span> : null}
        {count}
      </div>
    );
  }

  return (
    <div
      aria-label={`Where you are: ${label}${sub ? `, step ${sub.n} of ${sub.total}` : ""}`}
      style={{
        blockSize: 40, background: CARD, borderBlockEnd: `1px solid ${LINE}`,
        display: "flex", alignItems: "center", gap: 12, paddingInline: 16,
        overflowX: "auto", whiteSpace: "nowrap",
      }}
    >
      {BEATS.map((name, i) => {
        const n = (i + 1) as Beat;
        const done = n < beat;
        const now = n === beat;
        return (
          <span key={name} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
            {i > 0 ? <span aria-hidden style={{ color: LINE, marginInlineEnd: 5 }}>—</span> : null}
            <span aria-hidden style={{
              inlineSize: 8, blockSize: 8, borderRadius: 999,
              background: done ? CYAN : now ? CYAN_SOFT : LINE,
              border: done || now ? `1px solid ${CYAN}` : `1px solid ${LINE}`,
            }} />
            <span style={{
              fontFamily: UI, fontSize: 12.5, fontWeight: done || now ? 600 : 500,
              color: done || now ? CYAN_TEXT : INK2,
            }}>{name}</span>
            {now && sub ? <span style={{ marginInlineStart: 4 }}>{count}</span> : null}
          </span>
        );
      })}
    </div>
  );
};

/** The bar and the progress row, stuck to the top together. */
export const JourneyChrome = ({ onBack, onExit, name, beat, sub }: {
  onBack?: () => void; onExit: () => void; name?: string | null;
  beat: Beat; sub?: JourneySub | null;
}) => (
  <div style={{ position: "sticky", insetBlockStart: 0, zIndex: 30 }}>
    <JourneyBar onBack={onBack} onExit={onExit} name={name} />
    <JourneyProgress beat={beat} sub={sub} />
  </div>
);

/** Chrome plus a centred stage on whatever canvas the screen stands on. */
const JourneyShell = ({
  onBack, onExit, name, beat, sub, background = "#F2F5F9", padding = "28px 16px", children,
}: {
  onBack?: () => void; onExit: () => void; name?: string | null;
  beat: Beat; sub?: JourneySub | null;
  background?: string; padding?: string; children: React.ReactNode;
}) => (
  <div style={{ minBlockSize: "100dvh", background, display: "flex", flexDirection: "column" }}>
    <JourneyChrome onBack={onBack} onExit={onExit} name={name} beat={beat} sub={sub} />
    <div style={{
      flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding,
    }}>
      {children}
    </div>
  </div>
);

export default JourneyShell;
