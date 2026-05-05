import type { CardStyleConfig } from "../styles/cardStyles";
import type { VisualCardProps } from "../types";

export default function ComparisonLayout({ style, props }: { style: CardStyleConfig; props: VisualCardProps }) {
  const items = props.dataPoints?.items ?? [];
  const left = items[0];
  const right = items[1];
  const leftPoints = items.slice(2, 5);
  const rightPoints = items.slice(5, 8);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 40, flex: 1 }}>
      <h1 style={{
        fontFamily: style.headlineFont, fontWeight: style.headlineWeight,
        fontSize: style.headlineSize * 2, lineHeight: 1.2, color: style.headlineColor, margin: 0,
      }}>{props.content}</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr', gap: 0, flex: 1, alignItems: 'stretch' }}>
        <ColumnView style={style} header={left?.label ?? 'A'} points={leftPoints} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <div style={{ width: 1, flex: 1, background: `${style.accent}55` }} />
          <div style={{ fontFamily: style.headlineFont, fontSize: 48, color: style.accent }}>→</div>
          <div style={{ width: 1, flex: 1, background: `${style.accent}55` }} />
        </div>
        <ColumnView style={style} header={right?.label ?? 'B'} points={rightPoints} />
      </div>
    </div>
  );
}

function ColumnView({ style, header, points }: { style: CardStyleConfig; header: string; points: { label: string }[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{
        fontFamily: style.headlineFont, fontWeight: style.headlineWeight,
        fontSize: 36, color: style.headlineColor,
      }}>{header}</div>
      {points.map((p, i) => (
        <div key={i} style={{
          fontFamily: style.bodyFont, fontSize: style.bodySize * 1.6,
          color: style.bodyColor, lineHeight: 1.5,
        }}>• {p.label}</div>
      ))}
    </div>
  );
}