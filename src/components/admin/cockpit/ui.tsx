import { ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** System-A cockpit tokens — bone paper, ink, four signal colours. */
export const C = {
  paper: "#F1ECE1",
  card: "#FBF8F1",
  ink: "#1B1712",
  rule: "#E2DACB",
  muted: "#6B6255",
  teal: "#36C5B0",
  amber: "#D6A748",
  damber: "#B5762A",
  ox: "#6E2A26",
};

export const SERIF = "'Newsreader','Cormorant Garamond',Georgia,serif";
export const MONO = "'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,monospace";

export function Label({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontFamily: MONO,
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: ".16em",
        color: C.muted,
      }}
    >
      {children}
    </div>
  );
}

export function Zone({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      id={`zone-${n}`}
      style={{
        background: C.card,
        border: `1px solid ${C.rule}`,
        borderRadius: 4,
        padding: "28px 24px",
        marginBottom: 28,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 20 }}>
        <Label>{String(n).padStart(2, "0")}</Label>
        <h2
          style={{
            margin: 0,
            fontFamily: SERIF,
            fontSize: 26,
            fontWeight: 500,
            color: C.ink,
            letterSpacing: ".01em",
          }}
        >
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

/** The four-part unit: finding → example → recommendation → action. */
export function Finding({
  colour = C.muted,
  finding,
  example,
  recommendation,
  action,
  countedFrom,
}: {
  colour?: string;
  finding: ReactNode;
  example?: ReactNode;
  recommendation?: ReactNode;
  action?: ReactNode;
  countedFrom?: string;
}) {
  return (
    <div style={{ display: "flex", gap: 14, marginBottom: 20 }}>
      <div style={{ width: 7, flexShrink: 0, background: colour, borderRadius: 2 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: SERIF, fontSize: 19, lineHeight: 1.4, color: C.ink, fontWeight: 600 }}>
          {finding}
        </div>
        {example && (
          <div style={{ fontFamily: SERIF, fontSize: 15, lineHeight: 1.6, color: C.ink, marginTop: 8 }}>
            <span style={{ color: C.muted }}>For example: </span>
            {example}
          </div>
        )}
        {recommendation && (
          <div style={{ fontFamily: SERIF, fontSize: 15, lineHeight: 1.6, color: C.ink, marginTop: 8 }}>
            <strong>→ What I&apos;d do: </strong>
            {recommendation}
          </div>
        )}
        {action && <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>{action}</div>}
        {countedFrom && (
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.muted, marginTop: 10 }}>
            counted from: {countedFrom}
          </div>
        )}
      </div>
    </div>
  );
}

export function Btn({
  children,
  onClick,
  tone = "ink",
  disabled,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: "ink" | "ox" | "quiet";
  disabled?: boolean;
  title?: string;
}) {
  const bg = tone === "ox" ? C.ox : tone === "quiet" ? "transparent" : C.ink;
  const fg = tone === "quiet" ? C.ink : C.paper;
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        fontFamily: MONO,
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: ".1em",
        padding: "8px 14px",
        borderRadius: 3,
        background: bg,
        color: fg,
        border: `1px solid ${tone === "quiet" ? C.rule : bg}`,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

export function Stat({
  label,
  value,
  colour = C.ink,
  sub,
  onClick,
}: {
  label: string;
  value: ReactNode;
  colour?: string;
  sub?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        border: `1px solid ${C.rule}`,
        borderRadius: 3,
        padding: "14px 16px",
        background: C.paper,
        cursor: onClick ? "pointer" : "default",
        minWidth: 0,
      }}
    >
      <Label>{label}</Label>
      <div style={{ fontFamily: MONO, fontSize: 30, color: colour, marginTop: 6, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontFamily: MONO, fontSize: 11, color: C.muted, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

export function Bar({
  label,
  value,
  total,
  colour = C.amber,
  note,
  onClick,
}: {
  label: string;
  value: number | null;
  total: number;
  colour?: string;
  note?: string;
  onClick?: () => void;
}) {
  const pct = value !== null && total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div
      onClick={onClick}
      style={{ marginBottom: 10, cursor: onClick ? "pointer" : "default" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <span style={{ fontFamily: MONO, fontSize: 12, color: C.ink }}>{label}</span>
        <span style={{ fontFamily: MONO, fontSize: 12, color: C.ink }}>
          {value === null ? "?" : value}
          <span style={{ color: C.muted }}> / {total}</span>
        </span>
      </div>
      <div style={{ height: 10, background: C.rule, borderRadius: 2, marginTop: 5, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: colour }} />
      </div>
      {note && <div style={{ fontFamily: MONO, fontSize: 10, color: C.muted, marginTop: 4 }}>↳ {note}</div>}
    </div>
  );
}

export function Unknown({ reason }: { reason: string }) {
  return (
    <span style={{ fontFamily: MONO, color: C.muted }} title={reason}>
      ? <span style={{ fontSize: 10 }}>({reason})</span>
    </span>
  );
}

/** Segmented control — view switcher. */
export function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        border: `1px solid ${C.rule}`,
        borderRadius: 3,
        overflow: "hidden",
        background: C.card,
        flexWrap: "wrap",
      }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            style={{
              fontFamily: MONO,
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: ".12em",
              padding: "9px 16px",
              border: "none",
              background: on ? C.ink : "transparent",
              color: on ? C.paper : C.muted,
              cursor: "pointer",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Small pill — filter state, liveliness, warnings. */
export function Chip({
  tone = C.muted,
  children,
  title,
}: {
  tone?: string;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: MONO,
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: ".12em",
        color: tone,
        border: `1px solid ${tone}`,
        borderRadius: 999,
        padding: "4px 10px",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

/** A collapsible zone: key finding line + status colour, detail opt-in. */
export function ZoneCard({
  n,
  title,
  tone = C.muted,
  keyLine,
  open,
  onToggle,
  quiet,
  children,
}: {
  n: number;
  title: string;
  tone?: string;
  keyLine: ReactNode;
  open: boolean;
  onToggle: () => void;
  /** Nothing to say — render one grey line and no more. */
  quiet?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      id={`zone-${n}`}
      style={{
        background: C.card,
        border: `1px solid ${C.rule}`,
        borderLeft: `3px solid ${tone}`,
        borderRadius: 4,
        padding: quiet ? "14px 18px" : "20px 18px",
        marginBottom: 14,
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          all: "unset",
          cursor: "pointer",
          display: "flex",
          gap: 12,
          alignItems: "baseline",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <span style={{ fontFamily: MONO, fontSize: 11, color: C.muted, letterSpacing: ".16em" }}>
          {String(n).padStart(2, "0")}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: "block",
              fontFamily: MONO,
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: ".16em",
              color: C.muted,
            }}
          >
            {title}
          </span>
          <span
            style={{
              display: "block",
              fontFamily: SERIF,
              fontSize: quiet ? 16 : 20,
              lineHeight: 1.35,
              color: quiet ? C.muted : C.ink,
              marginTop: 4,
            }}
          >
            {keyLine}
          </span>
        </span>
        <span style={{ fontFamily: MONO, fontSize: 10, color: C.muted, letterSpacing: ".1em" }}>
          {open ? "HIDE" : "OPEN"}
        </span>
      </button>
      {open && <div style={{ marginTop: 20 }}>{children}</div>}
    </section>
  );
}

/** Table that shows at most `limit` rows until asked for all. */
export function CappedTable({
  head,
  rows,
  limit = 5,
}: {
  head: string[];
  rows: ReactNode[][];
  limit?: number;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, limit);
  return (
    <>
      <Table head={head} rows={shown} />
      {rows.length > limit && (
        <div style={{ marginTop: 10 }}>
          <Btn tone="quiet" onClick={() => setAll((v) => !v)}>
            {all ? `Show first ${limit}` : `Show all ${rows.length}`}
          </Btn>
        </div>
      )}
    </>
  );
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(27,23,18,.55)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.card,
          border: `1px solid ${C.rule}`,
          borderRadius: 4,
          maxWidth: 620,
          width: "100%",
          maxHeight: "84vh",
          overflowY: "auto",
          padding: "22px 22px 24px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
          <h3 style={{ margin: 0, fontFamily: SERIF, fontSize: 22, color: C.ink, fontWeight: 500 }}>{title}</h3>
          <Btn tone="quiet" onClick={onClose}>
            Close
          </Btn>
        </div>
        <div style={{ marginTop: 16 }}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
        <thead>
          <tr>
            {head.map((h) => (
              <th
                key={h}
                style={{
                  textAlign: "left",
                  fontFamily: MONO,
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: ".14em",
                  color: C.muted,
                  padding: "0 10px 8px 0",
                  fontWeight: 400,
                  whiteSpace: "nowrap",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td
                  key={j}
                  style={{
                    fontFamily: j === 0 ? SERIF : MONO,
                    fontSize: j === 0 ? 15 : 12,
                    color: C.ink,
                    padding: "9px 10px 9px 0",
                    borderTop: `1px solid ${C.rule}`,
                    verticalAlign: "top",
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}