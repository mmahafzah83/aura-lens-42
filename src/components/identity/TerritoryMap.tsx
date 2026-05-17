import { useMemo, useState } from "react";

interface ThemeDatum { theme: string; count: number; }
interface Props { themes: ThemeDatum[]; }

const COLOR_VARS = [
  "var(--aura-accent)",
  "var(--aura-blue)",
  "var(--aura-accent3)",
  "var(--aura-pink)",
  "var(--aura-purple)",
];

const prettify = (s: string) =>
  (s || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());

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
      return { ...t, label: prettify(t.theme), r, color: COLOR_VARS[i % COLOR_VARS.length], pos: SLOTS[i] };
    });
  }, [themes]);

  return (
    <div
      style={{
        background: "var(--aura-card)",
        border: "1px solid var(--aura-card-glass)",
        borderRadius: 16,
        padding: 18,
      }}
    >
      <div
        style={{
          fontSize: 9.5, fontWeight: 600, letterSpacing: "0.12em",
          color: "var(--aura-t1)", textTransform: "uppercase", marginBottom: 12,
        }}
      >
        Territory map
      </div>
      {bubbles.length === 0 ? (
        <p style={{ fontSize: 11, color: "var(--aura-t1)", opacity: 0.6, fontStyle: "italic" }}>
          Capture more to chart your territory.
        </p>
      ) : (
        <div style={{ position: "relative", width: "100%", maxWidth: 320, minHeight: 200, height: 220, margin: "0 auto" }}>
          {bubbles.map((b, i) => (
            <div
              key={i}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              title={`${b.label} · ${b.count} signal${b.count === 1 ? "" : "s"}`}
              style={{
                position: "absolute",
                left: b.pos.x - b.r,
                top: b.pos.y - b.r,
                width: b.r * 2,
                height: b.r * 2,
                borderRadius: "50%",
                background: `color-mix(in srgb, ${b.color} 16%, transparent)`,
                border: `1px solid ${b.color}`,
                color: b.color,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                fontSize: 10,
                fontWeight: 600,
                padding: 4,
                lineHeight: 1.15,
                transform: hover === i ? "scale(1.12)" : "scale(1)",
                transition: "transform 180ms ease",
                cursor: "default",
              }}
            >
              {b.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
