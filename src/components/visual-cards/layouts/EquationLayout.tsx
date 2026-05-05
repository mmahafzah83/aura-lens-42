import type { CardStyleConfig } from "../styles/cardStyles";
import type { VisualCardProps } from "../types";
import { FONTS } from "../styles/cardStyles";
import InsightLayout from "./InsightLayout";

export default function EquationLayout({ style, props }: { style: CardStyleConfig; props: VisualCardProps }) {
  const items = props.dataPoints?.items ?? [];
  if (items.length < 2) return <InsightLayout style={style} props={props} />;
  const result = items[items.length - 1];
  const vars = items.slice(0, -1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 36, flex: 1 }}>
      <h1 style={{
        fontFamily: style.headlineFont, fontWeight: style.headlineWeight,
        fontSize: style.headlineSize * 1.8, lineHeight: 1.2, color: style.headlineColor, margin: 0,
      }}>{props.content}</h1>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, flexWrap: 'wrap' }}>
        {vars.map((v, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <Box style={style} item={v} />
            {i < vars.length - 1 && (
              <div style={{ fontFamily: FONTS.MONO, fontSize: 48, color: style.accent }}>×</div>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', fontSize: 36, color: style.accent }}>=</div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <Box style={style} item={result} highlighted />
      </div>
      {props.bodyText && (
        <p style={{
          fontFamily: style.bodyFont, fontSize: style.bodySize * 1.6,
          color: style.bodyColor, textAlign: 'center', margin: 0, lineHeight: 1.6,
        }}>{props.bodyText}</p>
      )}
    </div>
  );
}

function Box({ style, item, highlighted }: { style: CardStyleConfig; item: { label: string; value?: string }; highlighted?: boolean }) {
  return (
    <div style={{
      border: `${highlighted ? 2 : 1}px solid ${style.accent}${highlighted ? '' : '66'}`,
      borderRadius: 12, padding: '24px 32px', minWidth: 180, textAlign: 'center',
      background: highlighted ? `${style.accent}1a` : 'transparent',
    }}>
      <div style={{
        fontFamily: FONTS.MONO, fontSize: 14, color: style.accent,
        letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8,
      }}>{item.label}</div>
      {item.value && (
        <div style={{
          fontFamily: style.headlineFont, fontSize: 36, fontWeight: style.headlineWeight,
          color: style.headlineColor,
        }}>{item.value}</div>
      )}
    </div>
  );
}