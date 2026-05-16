interface Props {
  signals: number;   // 0-100
  content: number;
  engagement: number;
  voice: number;
  rhythm: number;
}

const AXES = ["Signals", "Content", "Engagement", "Voice", "Rhythm"];

export default function AuthorityRadar(props: Props) {
  const values = [props.signals, props.content, props.engagement, props.voice, props.rhythm].map(v =>
    Math.max(0, Math.min(100, v || 0))
  );
  const size = 220;
  const cx = size / 2;
  const cy = size / 2 + 6;
  const radius = 78;
  const n = 5;
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;

  const point = (r: number, i: number) => ({
    x: cx + r * Math.cos(angle(i)),
    y: cy + r * Math.sin(angle(i)),
  });

  const polygon = (r: number) =>
    Array.from({ length: n }, (_, i) => {
      const p = point(r, i);
      return `${p.x},${p.y}`;
    }).join(" ");

  const userPolygon = values
    .map((v, i) => {
      const p = point(radius * (v / 100), i);
      return `${p.x},${p.y}`;
    })
    .join(" ");

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
        Authority radar
      </div>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {[1, 0.66, 0.33].map((r, idx) => (
            <polygon
              key={idx}
              points={polygon(radius * r)}
              fill="none"
              stroke="rgba(0,0,0,0.08)"
              strokeWidth={1}
            />
          ))}
          {Array.from({ length: n }, (_, i) => {
            const p = point(radius, i);
            return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgba(0,0,0,0.06)" strokeWidth={1} />;
          })}
          <polygon
            points={userPolygon}
            fill="rgba(176,141,58,0.12)"
            stroke="#B08D3A"
            strokeWidth={1.2}
          />
          {values.map((v, i) => {
            const p = point(radius * (v / 100), i);
            return <circle key={i} cx={p.x} cy={p.y} r={3} fill="#B08D3A" />;
          })}
          {AXES.map((label, i) => {
            const p = point(radius + 16, i);
            return (
              <text
                key={label}
                x={p.x}
                y={p.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={10}
                fill="var(--ink-3)"
                fontFamily="'JetBrains Mono', monospace"
                style={{ letterSpacing: "0.04em" }}
              >
                {label.toUpperCase()}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
