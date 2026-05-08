import type { CardStyleConfig } from "../styles/cardStyles";
import type { VisualCardProps } from "../types";
import { FONTS } from "../styles/cardStyles";
import InsightLayout from "./InsightLayout";

export default function StatLayout({ style, props }: { style: CardStyleConfig; props: VisualCardProps }) {
  const item = props.dataPoints?.items?.[0];
  if (!item || !item.value) {
    // Graceful fallback: no number could be extracted (common in Arabic posts)
    return <InsightLayout style={style} props={props} />;
  }
  const value = item.value;
  const unit = item?.label ?? '';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', flex: 1, gap: 24 }}>
      <div style={{
        fontFamily: FONTS.MONO, fontWeight: 600, fontSize: 220,
        lineHeight: 1, color: style.accent, letterSpacing: '-0.04em',
      }}>{value}</div>
      {unit && (
        <div style={{
          fontFamily: FONTS.MONO, fontSize: 22, color: style.tagColor,
          letterSpacing: '0.2em', textTransform: 'uppercase',
        }}>{unit}</div>
      )}
      <h1 style={{
        fontFamily: style.headlineFont, fontWeight: style.headlineWeight,
        fontSize: style.headlineSize * 2, lineHeight: 1.3,
        color: style.headlineColor, margin: '24px 0 0', maxWidth: 800,
      }}>{props.content}</h1>
      {props.bodyText && (
        <p style={{
          fontFamily: style.bodyFont, fontSize: style.bodySize * 1.8,
          lineHeight: 1.6, color: style.bodyColor, margin: 0, maxWidth: 760,
        }}>{props.bodyText}</p>
      )}
    </div>
  );
}