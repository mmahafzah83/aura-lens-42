import type { CardStyleConfig } from "../styles/cardStyles";
import type { VisualCardProps } from "../types";
import { FONTS } from "../styles/cardStyles";
import InsightLayout from "./InsightLayout";

export default function PrinciplesLayout({ style, props }: { style: CardStyleConfig; props: VisualCardProps }) {
  const items = props.dataPoints?.items ?? [];
  if (items.length === 0) return <InsightLayout style={style} props={props} />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 36, flex: 1 }}>
      <h1 style={{
        fontFamily: style.headlineFont, fontWeight: style.headlineWeight,
        fontSize: style.headlineSize * 2, lineHeight: 1.2, color: style.headlineColor, margin: 0,
      }}>{props.content}</h1>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28, position: 'relative' }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', gap: 24, alignItems: 'flex-start', position: 'relative' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 60 }}>
              <div style={{
                fontFamily: FONTS.MONO, fontSize: 28, color: style.accent, fontWeight: 600,
              }}>{String(i + 1).padStart(2, '0')}</div>
              {i < items.length - 1 && (
                <div style={{ width: 1, flex: 1, minHeight: 40, background: `${style.accent}55`, marginTop: 8 }} />
              )}
            </div>
            <div style={{ flex: 1, paddingTop: 4 }}>
              <div style={{
                fontFamily: style.bodyFont, fontSize: 26, fontWeight: 600,
                color: style.headlineColor, lineHeight: 1.3, marginBottom: 8,
              }}>{it.label}</div>
              {it.value && (
                <div style={{
                  fontFamily: style.bodyFont, fontSize: style.bodySize * 1.6,
                  color: style.bodyColor, lineHeight: 1.5,
                }}>{it.value}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}