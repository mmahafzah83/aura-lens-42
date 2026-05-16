import { useMemo, useState } from "react";

interface ThemeDatum { theme: string; count: number; }
interface Props { themes: ThemeDatum[]; }

const COLORS = [
  { fill: "rgba(212,176,86,0.18)", stroke: "rgba(212,176,86,0.55)", text: "#B08D3A" },
  { fill: "rgba(132,99,189,0.16)", stroke: "rgba(132,99,189,0.5)",  text: "#7E5FB8" },
  { fill: "rgba(60,160,150,0.16)", stroke: "rgba(60,160,150,0.5)",  text: "#2E8C7E" },
  { fill: "rgba(214,128,64,0.16)", stroke: "rgba(214,128,64,0.5)",  text: "#B86A30" },
  { fill: "rgba(96,160,90,0.16)",  stroke: "rgba(96,160,90,0.5)",   text: "#3E8838" },
];

// Deterministic-ish positions for up to 8 bubbles inside a 320x220 canvas
const SLOTS: Array<{ x: number; y: number }> = [
  { x: 95,  y: 95  },
  { x: 215, y: 105 },
  { x: 155, y: 50  },
  { x: 70,  y: 175 },
  { x: 240, y: 175 },
  { x: 160, y: 145 },
  { x: 45,  y: 50  },
  { x: 280, y: 55  },
];

export default function TerritoryMap({ themes }: Props) {
  const [hover, setHover] = useState<number | null>(null);

  const bubbles = useMemo(() => {
    if (!themes || themes.length === 0) return [];
    const max = Math.max(...themes.map(t => t.count), 1);
    const min = Math.min(...themes.map(t => t.count));
    return themes.slice(0, 8).map((t, i) => {
      const ratio = max === min ? 0.7 : (t.count - min) / (max - min);
      const r = 22 + ratio * 22; // 22-44px radius
      return { ...t, r, color: COLORS[i % COLORS.length], pos: SLOTS[i] };
    });
  }, [themes]);

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 16,
        padding: 18,
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div
        style={{
          fontSize: 9.5, fontWeight: 600, letterSpacing: "0.12em",
          color: "var(--ink)", textTransform: "uppercase", marginBottom: 12,
        }}
      >
        Territory map
      </div>
      {bubbles.length === 0 ? (
        <p style={{ fontSize: 11, color: "var(--ink-5)", fontStyle: "italic" }}>
          Capture more to chart your territory.
        </p>
      ) : (
        <div style={{ position: "relative", width: "100%", maxWidth: 320, height: 220, margin: "0 auto" }}>
          {bubbles.map((b, i) => (
            <div
              key={i}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              title={`${b.theme} · ${b.count} signal${b.count === 1 ? "" : "s"}`}
              style={{
                position: "absolute",
                left: b.pos.x - b.r,
                top: b.pos.y - b.r,
                width: b.r * 2,
                height: b.r * 2,
                borderRadius: "50%",
                background: b.color.fill,
                border: `1px solid ${b.color.stroke}`,
                color: b.color.text,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                fontSize: 10,
                fontWeight: 500,
                padding: 4,
                lineHeight: 1.15,
                transform: hover === i ? "scale(1.08)" : "scale(1)",
                transition: "transform 180ms ease",
                cursor: "default",
              }}
            >
              {b.theme}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
