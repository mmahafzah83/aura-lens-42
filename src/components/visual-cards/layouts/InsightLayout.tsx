import type { CardStyleConfig } from "../styles/cardStyles";
import type { VisualCardProps } from "../VisualCardRenderer";

export default function InsightLayout({ style, props }: { style: CardStyleConfig; props: VisualCardProps }) {
  const isAr = props.language === 'ar';
  const arHeadlineSize = isAr && style.name !== 'sand' ? 24 : style.headlineSize;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32, flex: 1 }}>
      <h1
        style={{
          fontFamily: style.headlineFont,
          fontWeight: style.headlineWeight,
          fontSize: arHeadlineSize * 2.2,
          lineHeight: isAr ? 1.7 : 1.2,
          color: style.headlineColor,
          margin: 0,
          letterSpacing: '-0.01em',
        }}
      >
        {props.content}
      </h1>
      {props.bodyText && (
        <p
          style={{
            fontFamily: style.bodyFont,
            fontSize: style.bodySize * 2,
            lineHeight: isAr ? 1.9 : 1.6,
            color: style.bodyColor,
            margin: 0,
          }}
        >
          {props.bodyText}
        </p>
      )}
    </div>
  );
}