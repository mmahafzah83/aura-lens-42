import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * OvernightPulse — the product's single visible heartbeat.
 *
 * One query, one cache, two renders: the sidebar card and the top-bar chip.
 * Never renders empty, never renders an error, never renders a zero.
 */

type LastRun = string | null;

let cached: LastRun | undefined;
let inflight: Promise<LastRun> | null = null;
const listeners = new Set<(v: LastRun) => void>();

async function fetchLastRun(): Promise<LastRun> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await (supabase.from("agent_findings" as any) as any)
      .select("created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1);
    const at = (data || [])[0]?.created_at;
    return typeof at === "string" ? at : null;
  } catch {
    return null;
  }
}

/** Shared last-run value. Mounting twice fires exactly one request. */
export function useOvernightLastRun(): LastRun {
  const [value, setValue] = useState<LastRun>(cached ?? null);

  useEffect(() => {
    listeners.add(setValue);
    if (cached === undefined) {
      if (!inflight) {
        inflight = fetchLastRun().then((v) => {
          cached = v;
          inflight = null;
          listeners.forEach((l) => l(v));
          return v;
        });
      }
    } else {
      setValue(cached);
    }
    return () => { listeners.delete(setValue); };
  }, []);

  return value;
}

export function hhmm(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

interface Props {
  variant: "card" | "chip";
  onOpen?: () => void;
  /** Chip on the Overnight tab itself: same look, no click. */
  interactive?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

const LINE = "rgba(0,206,201,.2)";
const LINE_HOVER = "rgba(0,206,201,.35)";
const TINT = "rgba(0,206,201,.08)";

const Dot: React.FC<{ size?: number }> = ({ size = 6 }) => (
  <span aria-hidden style={{
    width: size, height: size, borderRadius: 999, background: "var(--machine)",
    boxShadow: "var(--v23-ask-glow)", flexShrink: 0,
  }} />
);

const OvernightPulse: React.FC<Props> = ({ variant, onOpen, interactive = true, className, style }) => {
  const lastRun = useOvernightLastRun();

  const tooltip = lastRun
    ? `Aura's night run finished at ${hhmm(lastRun)}. Findings appear on Home.`
    : "Aura's night run has not produced findings yet.";
  const label = lastRun
    ? `The Overnight ran at ${hhmm(lastRun)}`
    : "The Overnight has not run yet";

  const hover = (on: boolean) => (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.borderColor = on ? LINE_HOVER : LINE;
  };

  if (variant === "chip") {
    return (
      <button
        type="button"
        data-testid="overnight-chip"
        title={tooltip}
        aria-label={label}
        tabIndex={interactive ? undefined : -1}
        onClick={interactive ? onOpen : undefined}
        onMouseEnter={interactive ? hover(true) : undefined}
        onMouseLeave={interactive ? hover(false) : undefined}
        className={`hidden md:inline-flex v23-focus ${className || ""}`}
        style={{
          alignItems: "center", gap: 7, minHeight: 32, padding: "0 12px",
          borderRadius: 20, background: TINT, border: `1px solid ${LINE}`,
          fontFamily: "var(--ff-mono)", fontSize: 10, letterSpacing: ".06em",
          color: "var(--text-secondary)", whiteSpace: "nowrap",
          cursor: interactive ? "pointer" : "default",
          transition: "border-color 150ms ease",
          ...style,
        }}
      >
        <Dot size={5} />
        {lastRun ? `Overnight ${hhmm(lastRun)}` : "Overnight — hasn't run yet"}
      </button>
    );
  }

  return (
    <button
      type="button"
      data-testid="rail-overnight-card"
      title={tooltip}
      aria-label={label}
      onClick={interactive ? onOpen : undefined}
      onMouseEnter={hover(true)}
      onMouseLeave={hover(false)}
      className={`cursor-pointer v23-focus ${className || ""}`}
      style={{
        padding: "12px", borderRadius: 10, background: TINT,
        border: `1px solid ${LINE}`, cursor: "pointer", textAlign: "left",
        display: "flex", flexDirection: "column", gap: 6,
        height: "auto", flexShrink: 0, overflow: "visible",
        transition: "border-color 150ms ease",
        ...style,
      }}
    >
      <span style={{
        display: "flex", alignItems: "center", gap: 8, color: "var(--text-inverse)",
        fontSize: 12.5, fontWeight: 500, lineHeight: 1.3,
      }}>
        <Dot />
        <span>{lastRun ? `The Overnight ran ${hhmm(lastRun)}` : "The Overnight"}</span>
      </span>
      <span style={{
        fontFamily: "var(--ff-mono)", fontSize: 9.5, letterSpacing: ".06em",
        color: "var(--v23-rail-label)", lineHeight: 1.5,
        whiteSpace: "normal", overflowWrap: "anywhere",
      }}>
        {lastRun ? "Findings appear on Home" : "Hasn't run yet"}
      </span>
    </button>
  );
};

export default OvernightPulse;
