/**
 * The strip that says whose read this is, and the one quiet way out of it.
 *
 * Two laws hold here. The visitor is named by the initials the session already
 * carries — never by a photograph, and nothing is fetched to draw it. And the
 * exit is a named control with a promise under it, not a disappearing act.
 */
import { useEffect, useState } from "react";

const CARD = "#FFFFFF";
const LINE = "#E2E7EE";
const INK = "#0F1519";
const INK2 = "#5B6673";
const NIGHT = "#0F1519";
const CYAN = "#00CEC9";
const CYAN_TEXT = "#00807B";
const UI = "Inter, system-ui, sans-serif";

const initialsOf = (name?: string | null): string => {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
};

const firstNameOf = (name?: string | null): string =>
  String(name ?? "").trim().split(/\s+/).filter(Boolean)[0] ?? "";

/** A control that is genuinely 44px tall and 44px wide, whatever its label. */
const TAP: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  minHeight: 44, minWidth: 44, padding: "0 8px",
  background: "none", border: "none", cursor: "pointer",
  fontFamily: UI, fontSize: 13.5, fontWeight: 600,
};

const useNarrow = (): boolean => {
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 420px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 420px)");
    const on = () => setNarrow(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return narrow;
};

export const ReadIdentityStrip = ({
  name, onExit, onSignIn,
}: { name?: string | null; onExit: () => void; onSignIn: () => void }) => {
  const narrow = useNarrow();
  const initials = initialsOf(name);
  const first = firstNameOf(name);
  return (
    <header
      style={{
        position: "sticky", insetBlockStart: 0, zIndex: 20,
        blockSize: 56, background: CARD, borderBlockEnd: `1px solid ${LINE}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 10, paddingInline: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 2, minWidth: 0 }}>
        <a
          href="/"
          aria-label="Aura — home"
          style={{
            ...TAP, color: INK, fontWeight: 700, fontSize: 13,
            letterSpacing: "0.14em", textDecoration: "none",
          }}
        >AURA</a>
        <button type="button" onClick={onExit} style={{ ...TAP, color: INK2 }}>
          Finish later
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        {initials ? (
          <span
            aria-hidden
            style={{
              inlineSize: 30, blockSize: 30, borderRadius: 999, flexShrink: 0,
              background: NIGHT, color: CARD,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              fontFamily: '"IBM Plex Mono", monospace', fontSize: 12, letterSpacing: "0.04em",
            }}
          >{initials}</span>
        ) : null}
        {first ? (
          <span style={{
            fontFamily: UI, fontSize: 13.5, fontWeight: 600, color: INK,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxInlineSize: 140,
          }}>{first}</span>
        ) : null}
        {narrow ? null : (
          <button type="button" onClick={onSignIn} style={{ ...TAP, color: INK2 }}>
            Sign in
          </button>
        )}
      </div>
    </header>
  );
};

/** Three beats, no counter. The first one is done; the other two are ahead. */
export const ReadSpine = () => {
  const beat = (label: string, done: boolean) => (
    <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
      <span
        aria-hidden
        style={{
          inlineSize: 8, blockSize: 8, borderRadius: 999,
          background: done ? CYAN : "transparent",
          border: done ? `1px solid ${CYAN}` : `1px solid ${LINE}`,
        }}
      />
      <span style={{
        fontFamily: UI, fontSize: 12.5, fontWeight: done ? 600 : 500,
        color: done ? CYAN_TEXT : INK2,
      }}>{label}</span>
    </span>
  );
  return (
    <div
      aria-label="Where you are in the assessment"
      style={{
        blockSize: 36, display: "flex", alignItems: "center", gap: 12,
        flexWrap: "nowrap", overflowX: "auto",
      }}
    >
      {beat("Your read", true)}
      <span aria-hidden style={{ color: LINE }}>—</span>
      {beat("Your evidence", false)}
      <span aria-hidden style={{ color: LINE }}>—</span>
      {beat("Your position", false)}
    </div>
  );
};

export default ReadIdentityStrip;