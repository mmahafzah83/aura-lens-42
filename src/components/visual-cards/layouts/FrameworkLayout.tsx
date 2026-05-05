import type { CardStyleConfig } from "../styles/cardStyles";
import type { VisualCardProps } from "../types";
import { FONTS } from "../styles/cardStyles";
import InsightLayout from "./InsightLayout";

export default function FrameworkLayout({ style, props }: { style: CardStyleConfig; props: VisualCardProps }) {
  const items = props.dataPoints?.items ?? [];
  if (items.length === 0) return <InsightLayout style={style} props={props} />;
  const isAr = props.language === 'ar';
  const cols = items.length === 4 ? 2 : items.length === 3 ? 3 : items.length >= 5 ? 3 : 2;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 40, flex: 1 }}>
      <h1 style={{
        fontFamily: style.headlineFont, fontWeight: style.headlineWeight,
        fontSize: style.headlineSize * 2.2, lineHeight: isAr ? 1.7 : 1.2,
        color: style.headlineColor, margin: 0,
      }}>{props.content}</h1>
      {props.bodyText && (
        <p style={{
          fontFamily: style.bodyFont, fontSize: style.bodySize * 2,
          lineHeight: 1.6, color: style.bodyColor, margin: 0,
        }}>{props.bodyText}</p>
      )}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: 24,
      }}>
        {items.map((it, i) => (
          <div key={i} style={{
            border: `1px solid ${style.accent}33`,
            borderRadius: 12,
            padding: 28,
            background: 'rgba(255,255,255,0.02)',
          }}>
            <div style={{
              fontFamily: FONTS.MONO, fontSize: 18, color: style.accent,
              letterSpacing: '0.15em', marginBottom: 12,
            }}>{String(i + 1).padStart(2, '0')}</div>
            <div style={{
              fontFamily: style.bodyFont, fontSize: 22, fontWeight: 500,
              color: style.headlineColor, lineHeight: 1.4,
            }}>{it.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}