import { useEffect, useMemo, useState } from "react";

/**
 * AuraMark — the 24-hour dial from public/aura-mark.svg, alive.
 * 48 graduations (12 heavy at stroke 1.2, 36 fine at 0.78) = 7.5° each = 30 minutes.
 * Geometry below is read verbatim from public/aura-mark.svg.
 */

type HeavyOrFine = { x1: number; y1: number; x2: number; y2: number; w: number };

/* Graduations, in file order, starting at 12 o'clock. */
const GRADS: HeavyOrFine[] = [
  { x1: 32, y1: 18.89, x2: 32, y2: 8.77, w: 1.2 },
  { x1: 33.87, y1: 19.03, x2: 34.8, y2: 12.54, w: 0.78 },
  { x1: 35.69, y1: 19.42, x2: 37.54, y2: 13.14, w: 0.78 },
  { x1: 37.44, y1: 20.08, x2: 40.17, y2: 14.12, w: 0.78 },
  { x1: 39.09, y1: 20.97, x2: 44.56, y2: 12.45, w: 1.2 },
  { x1: 40.58, y1: 22.09, x2: 44.87, y2: 17.14, w: 0.78 },
  { x1: 41.91, y1: 23.42, x2: 46.86, y2: 19.13, w: 0.78 },
  { x1: 43.03, y1: 24.91, x2: 48.54, y2: 21.37, w: 0.78 },
  { x1: 43.92, y1: 26.56, x2: 53.13, y2: 22.35, w: 1.2 },
  { x1: 44.58, y1: 28.31, x2: 50.86, y2: 26.46, w: 0.78 },
  { x1: 44.97, y1: 30.13, x2: 51.46, y2: 29.2, w: 0.78 },
  { x1: 45.11, y1: 32, x2: 51.66, y2: 32, w: 0.78 },
  { x1: 44.97, y1: 33.87, x2: 55, y2: 35.31, w: 1.2 },
  { x1: 44.58, y1: 35.69, x2: 50.86, y2: 37.54, w: 0.78 },
  { x1: 43.92, y1: 37.44, x2: 49.88, y2: 40.17, w: 0.78 },
  { x1: 43.03, y1: 39.09, x2: 48.54, y2: 42.63, w: 0.78 },
  { x1: 41.91, y1: 40.58, x2: 49.56, y2: 47.22, w: 1.2 },
  { x1: 40.58, y1: 41.91, x2: 44.87, y2: 46.86, w: 0.78 },
  { x1: 39.09, y1: 43.03, x2: 42.63, y2: 48.54, w: 0.78 },
  { x1: 37.44, y1: 43.92, x2: 40.17, y2: 49.88, w: 0.78 },
  { x1: 35.69, y1: 44.58, x2: 38.55, y2: 54.29, w: 1.2 },
  { x1: 33.87, y1: 44.97, x2: 34.8, y2: 51.46, w: 0.78 },
  { x1: 32, y1: 45.11, x2: 32, y2: 51.66, w: 0.78 },
  { x1: 30.13, y1: 44.97, x2: 29.2, y2: 51.46, w: 0.78 },
  { x1: 28.31, y1: 44.58, x2: 25.45, y2: 54.29, w: 1.2 },
  { x1: 26.56, y1: 43.92, x2: 23.83, y2: 49.88, w: 0.78 },
  { x1: 24.91, y1: 43.03, x2: 21.37, y2: 48.54, w: 0.78 },
  { x1: 23.42, y1: 41.91, x2: 19.13, y2: 46.86, w: 0.78 },
  { x1: 22.09, y1: 40.58, x2: 14.44, y2: 47.22, w: 1.2 },
  { x1: 20.97, y1: 39.09, x2: 15.46, y2: 42.63, w: 0.78 },
  { x1: 20.08, y1: 37.44, x2: 14.12, y2: 40.17, w: 0.78 },
  { x1: 19.42, y1: 35.69, x2: 13.14, y2: 37.54, w: 0.78 },
  { x1: 19.03, y1: 33.87, x2: 9, y2: 35.31, w: 1.2 },
  { x1: 18.89, y1: 32, x2: 12.34, y2: 32, w: 0.78 },
  { x1: 19.03, y1: 30.13, x2: 12.54, y2: 29.2, w: 0.78 },
  { x1: 19.42, y1: 28.31, x2: 13.14, y2: 26.46, w: 0.78 },
  { x1: 20.08, y1: 26.56, x2: 10.87, y2: 22.35, w: 1.2 },
  { x1: 20.97, y1: 24.91, x2: 15.46, y2: 21.37, w: 0.78 },
  { x1: 22.09, y1: 23.42, x2: 17.14, y2: 19.13, w: 0.78 },
  { x1: 23.42, y1: 22.09, x2: 19.13, y2: 17.14, w: 0.78 },
  { x1: 24.91, y1: 20.97, x2: 19.44, y2: 12.45, w: 1.2 },
  { x1: 26.56, y1: 20.08, x2: 23.83, y2: 14.12, w: 0.78 },
  { x1: 28.31, y1: 19.42, x2: 26.46, y2: 13.14, w: 0.78 },
  { x1: 30.13, y1: 19.03, x2: 29.2, y2: 12.54, w: 0.78 },
];

/* Core, from the asset. */
const CORE_R = 6.85;
/* The live hand, normalised to 12 o'clock: radius 13.1 → 28.0, tip dot 1.61. */
const HAND_INNER_Y = 32 - 13.1;
const HAND_OUTER_Y = 32 - 28.0;
const TIP_R = 1.61;

type MarkState = "resting" | "working" | "found" | "held";
type MarkSize = 16 | 24 | 32 | 64;

const HAND_STROKE: Record<MarkSize, number> = { 64: 1.55, 32: 2.4, 24: 3.2, 16: 4.4 };

const DEFAULT_LABEL: Record<MarkState, string> = {
  resting: "Nothing waiting",
  working: "Reading your graph",
  found: "The Overnight found something",
  held: "Waiting on you",
};

interface Props {
  state?: MarkState;
  size?: MarkSize;
  label?: string;
  heldDegrees?: number;
  className?: string;
}

function currentHalfHourDegrees(): number {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  return Math.floor(minutes / 30) * 7.5;
}

export default function AuraMark({
  state = "resting",
  size = 24,
  label,
  heldDegrees = 255,
  className,
}: Props) {
  const [nowDegrees, setNowDegrees] = useState<number>(() => currentHalfHourDegrees());

  useEffect(() => {
    const id = window.setInterval(() => setNowDegrees(currentHalfHourDegrees()), 30 * 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  const grads = useMemo(() => {
    if (size === 16) return [];
    if (size === 24) return GRADS.filter((g) => g.w === 1.2);
    return GRADS;
  }, [size]);

  const coreR = size === 16 ? 9 : CORE_R;
  const handStroke = HAND_STROKE[size];
  const tipR = TIP_R * (handStroke / HAND_STROKE[64]);

  const gradColor = state === "working" ? "var(--text-muted)" : "var(--text-secondary)";
  const coreColor = state === "working" ? "var(--text-primary)" : "var(--text-secondary)";
  const handColor = state === "working" || state === "found" ? "var(--machine)" : "var(--text-secondary)";

  const handRotation =
    state === "found" ? 0 : state === "working" ? 0 : nowDegrees;

  return (
    <span
      role="img"
      aria-label={label || DEFAULT_LABEL[state]}
      className={className}
      style={{ display: "inline-flex", lineHeight: 0 }}
    >
      <style>{`
        @keyframes aura-mark-sweep {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes aura-mark-breathe {
          0%, 100% { r: ${tipR}px; }
          50% { r: ${(tipR * 1.5).toFixed(3)}px; }
        }
        .aura-mark-sweep {
          transform-origin: 32px 32px;
          animation: aura-mark-sweep 4.8s steps(48, end) infinite;
        }
        .aura-mark-breathe {
          animation: aura-mark-breathe 2.4s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .aura-mark-sweep {
            animation: none;
            transform: rotate(157.5deg);
          }
          .aura-mark-breathe {
            animation: none;
            r: ${(tipR * 1.5).toFixed(3)}px;
          }
        }
      `}</style>
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        <g stroke={gradColor} strokeLinecap="round">
          {grads.map((g, i) => (
            <line key={i} x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} strokeWidth={g.w} />
          ))}
        </g>
        <circle cx={32} cy={32} r={coreR} fill={coreColor} />

        {state === "held" && (
          <g transform={`rotate(${heldDegrees} 32 32)`} stroke="var(--amber)" strokeLinecap="round">
            <line x1={32} y1={HAND_INNER_Y} x2={32} y2={32 - 21} strokeWidth={handStroke} />
          </g>
        )}

        <g
          className={state === "working" ? "aura-mark-sweep" : undefined}
          style={state === "working" ? undefined : { transform: `rotate(${handRotation}deg)`, transformOrigin: "32px 32px" }}
        >
          {state === "working" && (
            <path
              d={`M ${32} ${HAND_OUTER_Y} A 28 28 0 0 0 ${32 - 28 * Math.sin(Math.PI / 6)} ${32 - 28 * Math.cos(Math.PI / 6)}`}
              stroke="var(--machine)"
              strokeWidth={handStroke}
              strokeLinecap="round"
              fill="none"
              opacity={0.3}
            />
          )}
          <line
            x1={32}
            y1={HAND_INNER_Y}
            x2={32}
            y2={HAND_OUTER_Y}
            stroke={handColor}
            strokeWidth={handStroke}
            strokeLinecap="round"
          />
          <circle
            className={state === "found" ? "aura-mark-breathe" : undefined}
            cx={32}
            cy={HAND_OUTER_Y}
            r={tipR}
            fill={handColor}
          />
        </g>
      </svg>
    </span>
  );
}
