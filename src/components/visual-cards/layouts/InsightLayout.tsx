import type { CardStyleConfig } from "../styles/cardStyles";
import type { VisualCardProps } from "../types";

export default function InsightLayout({ style, props }: { style: CardStyleConfig; props: VisualCardProps }) {
  const isAr = props.language === 'ar';
  const arHeadlineSize = isAr && style.name !== 'sand' ? 24 : style.headlineSize;
  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 32, flex: 1 }}>
      <div aria-hidden style={{
        position: 'absolute',
        top: -40,
        [isAr ? 'right' : 'left']: -10,
        fontFamily: 'Georgia, serif',
        fontSize: 240,
        lineHeight: 1,
        color: style.accent,
        opacity: 0.12,
        pointerEvents: 'none',
      } as React.CSSProperties}>{isAr ? '”' : '“'}</div>
      <h1
        style={{
          fontFamily: style.headlineFont,
          fontWeight: style.headlineWeight,
          fontSize: arHeadlineSize * 2.2,
          lineHeight: isAr ? 1.7 : 1.2,
          color: style.headlineColor,
          margin: 0,
          letterSpacing: '-0.01em',
          position: 'relative',
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
            position: 'relative',
          }}
        >
          {props.bodyText}
        </p>
      )}
    </div>
  );
}