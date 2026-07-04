import React from "react";
import { INK, INK2, SPOT, RULE, MONO } from "./pressTokens";

export type FigKind =
  | "line_signal"
  | "dual_curve"
  | "step_bars"
  | "s_curve"
  | "flow"
  | "capacity_bars"
  | "decay"
  | "bars_compare"
  | "gap_wedge"
  | "steps";

export interface FigPlateProps {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: FigKind;
  rtl: boolean;
}

const BASELINE = "rgba(27,23,18,0.25)";

function LineSignal({ w, h, rtl }: { w: number; h: number; rtl: boolean }) {
  const pad = 12;
  const bx = pad, by = pad, bw = w - pad * 2, bh = h - pad * 2 - 20;
  const pts: [number, number][] = [];
  const n = 24;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const val = 0.5 + 0.28 * Math.sin(t * 5) + 0.12 * Math.sin(t * 11);
    pts.push([bx + t * bw, by + (1 - val) * bh]);
  }
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const spikeIdx = Math.floor(n * 0.72);
  const labelX = pts[spikeIdx][0] + 8;
  const labelY = pts[spikeIdx][1] - 8;
  return (
    <g>
      <path d={d} fill="none" stroke={INK} strokeWidth={1.2} opacity={0.55} />
      <circle cx={pts[spikeIdx][0]} cy={pts[spikeIdx][1]} r={4} fill={SPOT} />
      <g transform={rtl ? `translate(${labelX * 2},0) scale(-1,1)` : undefined}>
        <text x={labelX} y={labelY} fontFamily={MONO} fontSize={16} fill={SPOT}>
          signal
        </text>
      </g>
    </g>
  );
}

function DualCurve({ w, h }: { w: number; h: number }) {
  const pad = 12;
  const bx = pad, by = pad, bw = w - pad * 2, bh = h - pad * 2 - 20;
  const n = 24;
  const a: string[] = [], b: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const va = 0.35 + 0.35 * t;
    const vb = 0.6 - 0.2 * t + 0.05 * Math.sin(t * 8);
    a.push(`${i ? "L" : "M"}${(bx + t * bw).toFixed(1)},${(by + (1 - va) * bh).toFixed(1)}`);
    b.push(`${i ? "L" : "M"}${(bx + t * bw).toFixed(1)},${(by + (1 - vb) * bh).toFixed(1)}`);
  }
  return (
    <g>
      <path d={b.join(" ")} fill="none" stroke={INK} strokeWidth={1.2} opacity={0.5} />
      <path d={a.join(" ")} fill="none" stroke={SPOT} strokeWidth={1.6} />
    </g>
  );
}

function StepBars({ w, h }: { w: number; h: number }) {
  const pad = 12;
  const bx = pad, by = pad, bw = w - pad * 2, bh = h - pad * 2 - 20;
  const n = 8;
  const bw2 = bw / n - 4;
  const bars: React.ReactNode[] = [];
  const heights = [0.3, 0.4, 0.55, 0.5, 0.65, 0.72, 0.85, 0.6];
  const peak = 6;
  for (let i = 0; i < n; i++) {
    const bh2 = heights[i] * bh;
    bars.push(
      <rect
        key={i}
        x={bx + i * (bw2 + 4)}
        y={by + bh - bh2}
        width={bw2}
        height={bh2}
        fill={i === peak ? SPOT : "none"}
        stroke={i === peak ? SPOT : INK}
        strokeWidth={i === peak ? 1.6 : 1.2}
        opacity={i === peak ? 1 : 0.6}
      />
    );
  }
  return <g>{bars}</g>;
}

function SCurve({ w, h }: { w: number; h: number }) {
  const pad = 12;
  const bx = pad, by = pad, bw = w - pad * 2, bh = h - pad * 2 - 20;
  const n = 40;
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const v = 1 / (1 + Math.exp(-(t - 0.5) * 10));
    pts.push(`${i ? "L" : "M"}${(bx + t * bw).toFixed(1)},${(by + (1 - v) * bh).toFixed(1)}`);
  }
  return <path d={pts.join(" ")} fill="none" stroke={SPOT} strokeWidth={1.6} />;
}

function Flow({ w, h }: { w: number; h: number }) {
  const pad = 12;
  const cy = pad + (h - pad * 2 - 20) / 2;
  const nodes = 4;
  const spacing = (w - pad * 2) / (nodes - 1);
  const els: React.ReactNode[] = [];
  for (let i = 0; i < nodes; i++) {
    const cx = pad + i * spacing;
    els.push(
      <circle key={`n${i}`} cx={cx} cy={cy} r={10} fill={i === nodes - 1 ? SPOT : "none"} stroke={i === nodes - 1 ? SPOT : INK} strokeWidth={1.4} />
    );
    if (i < nodes - 1) {
      els.push(
        <line key={`l${i}`} x1={cx + 10} x2={cx + spacing - 10} y1={cy} y2={cy} stroke={INK} strokeWidth={1.2} opacity={0.6} />
      );
    }
  }
  return <g>{els}</g>;
}

function CapacityBars({ w, h }: { w: number; h: number }) {
  const pad = 12;
  const bx = pad, by = pad, bw = w - pad * 2, bh = h - pad * 2 - 20;
  const rows = 4;
  const rh = bh / rows - 6;
  const fills = [0.9, 0.7, 0.5, 0.3];
  return (
    <g>
      {fills.map((f, i) => (
        <g key={i}>
          <rect x={bx} y={by + i * (rh + 6)} width={bw} height={rh} fill="none" stroke={INK} strokeWidth={1.2} opacity={0.5} />
          <rect x={bx} y={by + i * (rh + 6)} width={bw * f} height={rh} fill={i === 0 ? SPOT : INK} opacity={i === 0 ? 1 : 0.7} />
        </g>
      ))}
    </g>
  );
}

function Decay({ w, h, rtl }: { w: number; h: number; rtl: boolean }) {
  const pad = 12;
  const bx = pad, by = pad, bw = w - pad * 2, bh = h - pad * 2 - 20;
  const n = 40;
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const v = Math.exp(-t * 3);
    pts.push(`${i ? "L" : "M"}${(bx + t * bw).toFixed(1)},${(by + (1 - v) * bh).toFixed(1)}`);
  }
  const labelX = bx + bw - 4;
  const labelY = by + 16;
  return (
    <g>
      <path d={pts.join(" ")} fill="none" stroke={SPOT} strokeWidth={1.6} />
      <g transform={rtl ? `translate(${labelX * 2},0) scale(-1,1)` : undefined}>
        <text x={labelX} y={labelY} textAnchor="end" fontFamily={MONO} fontSize={16} fill={INK2}>
          decay
        </text>
      </g>
    </g>
  );
}

function BarsCompare({ w, h }: { w: number; h: number }) {
  const pad = 12;
  const bx = pad, by = pad, bw = w - pad * 2, bh = h - pad * 2 - 20;
  const n = 4;
  const bw2 = (bw / n) * 0.55;
  const gap = (bw - bw2 * n) / (n - 1);
  const heights = [0.42, 0.58, 0.7, 0.9];
  const bars: React.ReactNode[] = [];
  const baselineY = by + bh;
  for (let i = 0; i < n; i++) {
    const isLast = i === n - 1;
    const bh2 = heights[i] * bh;
    bars.push(
      <rect
        key={i}
        x={bx + i * (bw2 + gap)}
        y={baselineY - bh2}
        width={bw2}
        height={bh2}
        fill={isLast ? SPOT : "none"}
        stroke={isLast ? SPOT : INK}
        strokeWidth={isLast ? 1.8 : 1.2}
        opacity={isLast ? 1 : 0.28}
      />
    );
  }
  return (
    <g>
      <line x1={bx} x2={bx + bw} y1={baselineY} y2={baselineY} stroke={INK} strokeWidth={1} opacity={0.35} />
      {bars}
    </g>
  );
}

function GapWedge({ w, h }: { w: number; h: number }) {
  const pad = 12;
  const bx = pad, by = pad, bw = w - pad * 2, bh = h - pad * 2 - 20;
  const y1L = by + bh * 0.5;
  const y1R = by + bh * 0.18;
  const y2L = by + bh * 0.62;
  const y2R = by + bh * 0.92;
  const wash = `M${bx},${y1L} L${bx + bw},${y1R} L${bx + bw},${y2R} L${bx},${y2L} Z`;
  return (
    <g>
      <path d={wash} fill={SPOT} opacity={0.06} />
      <line x1={bx} x2={bx + bw} y1={y1L} y2={y1R} stroke={SPOT} strokeWidth={1.6} />
      <line x1={bx} x2={bx + bw} y1={y2L} y2={y2R} stroke={INK} strokeWidth={1.2} opacity={0.3} />
    </g>
  );
}

function Steps({ w, h }: { w: number; h: number }) {
  const pad = 12;
  const bx = pad, by = pad, bw = w - pad * 2, bh = h - pad * 2 - 20;
  const n = 5;
  const stepW = bw / n;
  const heights = [0.15, 0.35, 0.55, 0.75, 0.92];
  const pts: string[] = [];
  const baselineY = by + bh;
  for (let i = 0; i < n; i++) {
    const yTop = baselineY - heights[i] * bh;
    const xL = bx + i * stepW;
    const xR = xL + stepW;
    if (i === 0) pts.push(`M${xL.toFixed(1)},${yTop.toFixed(1)}`);
    else {
      const prevY = baselineY - heights[i - 1] * bh;
      pts.push(`L${xL.toFixed(1)},${prevY.toFixed(1)}`);
      pts.push(`L${xL.toFixed(1)},${yTop.toFixed(1)}`);
    }
    pts.push(`L${xR.toFixed(1)},${yTop.toFixed(1)}`);
  }
  return <path d={pts.join(" ")} fill="none" stroke={SPOT} strokeWidth={1.6} />;
}

export function FigPlate({ x, y, w, h, kind, rtl }: FigPlateProps) {
  let inner: React.ReactNode = null;
  switch (kind) {
    case "line_signal": inner = <LineSignal w={w} h={h} rtl={rtl} />; break;
    case "dual_curve": inner = <DualCurve w={w} h={h} />; break;
    case "step_bars": inner = <StepBars w={w} h={h} />; break;
    case "s_curve": inner = <SCurve w={w} h={h} />; break;
    case "flow": inner = <Flow w={w} h={h} />; break;
    case "capacity_bars": inner = <CapacityBars w={w} h={h} />; break;
    case "decay": inner = <Decay w={w} h={h} rtl={rtl} />; break;
    case "bars_compare": inner = <BarsCompare w={w} h={h} />; break;
    case "gap_wedge": inner = <GapWedge w={w} h={h} />; break;
    case "steps": inner = <Steps w={w} h={h} />; break;
    default: inner = <LineSignal w={w} h={h} rtl={rtl} />; break;
  }
  const baselineY = h - 20;
  return (
    <g transform={`translate(${x},${y})`}>
      <g transform={rtl ? `translate(${w},0) scale(-1,1)` : undefined}>
        {inner}
        <line x1={12} x2={w - 12} y1={baselineY} y2={baselineY} stroke={BASELINE} strokeWidth={1} />
      </g>
    </g>
  );
}

export const SECTOR_FIG_MAP: Record<string, FigKind[]> = {
  finance: ["dual_curve", "step_bars"],
  health: ["flow", "capacity_bars"],
  "project management": ["s_curve", "step_bars"],
  water: ["line_signal", "step_bars"],
  infrastructure: ["step_bars", "capacity_bars"],
  creator: ["decay", "line_signal"],
  default: ["line_signal", "step_bars"],
};

export function pickFig(sectorFocus: string, index: number): FigKind {
  const key = (sectorFocus || "").toLowerCase();
  for (const k of Object.keys(SECTOR_FIG_MAP)) {
    if (k === "default") continue;
    if (key.includes(k)) {
      const arr = SECTOR_FIG_MAP[k];
      return arr[index % arr.length];
    }
  }
  const arr = SECTOR_FIG_MAP.default;
  return arr[index % arr.length];
}

// silence unused warning
void RULE;