import type { CardStyleConfig } from "../styles/cardStyles";
import type { VisualCardProps } from "../types";
import InsightLayout from "./InsightLayout";

export default function CycleLayout({ style, props }: { style: CardStyleConfig; props: VisualCardProps }) {
  const items = (props.dataPoints?.items ?? []).slice(0, 5);
  if (items.length === 0) return <InsightLayout style={style} props={props} />;
  const size = 700;
  const radius = 260;
  const cx = size / 2;
  const cy = size / 2;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, flex: 1 }}>
      <h1 style={{
        fontFamily: style.headlineFont, fontWeight: style.headlineWeight,
        fontSize: style.headlineSize * 1.8, lineHeight: 1.2, color: style.headlineColor, margin: 0,
      }}>{props.content}</h1>
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <defs>
            <marker id="arrow" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L6,3 z" fill={style.accent} />
            </marker>
          </defs>
          {items.map((_, i) => {
            const a1 = (i / items.length) * Math.PI * 2 - Math.PI / 2;
            const a2 = ((i + 1) / items.length) * Math.PI * 2 - Math.PI / 2;
            const x1 = cx + Math.cos(a1) * (radius - 60);
            const y1 = cy + Math.sin(a1) * (radius - 60);
            const x2 = cx + Math.cos(a2) * (radius - 60);
            const y2 = cy + Math.sin(a2) * (radius - 60);
            return <path key={`arr-${i}`} d={`M ${x1} ${y1} A ${radius - 60} ${radius - 60} 0 0 1 ${x2} ${y2}`}
              stroke={`${style.accent}99`} strokeWidth={2} fill="none" markerEnd="url(#arrow)" />;
          })}
          {items.map((it, i) => {
            const a = (i / items.length) * Math.PI * 2 - Math.PI / 2;
            const x = cx + Math.cos(a) * radius;
            const y = cy + Math.sin(a) * radius;
            return (
              <g key={i}>
                <circle cx={x} cy={y} r={50} fill={style.accent} opacity={0.18} />
                <circle cx={x} cy={y} r={50} fill="none" stroke={style.accent} strokeWidth={2} />
                <text x={x} y={y + 6} textAnchor="middle" fontFamily={style.bodyFont} fontSize={20}
                  fontWeight={600} fill={style.headlineColor}>{i + 1}</text>
                <text x={x} y={y + 80} textAnchor="middle" fontFamily={style.bodyFont} fontSize={18}
                  fill={style.bodyColor}>{it.label}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}