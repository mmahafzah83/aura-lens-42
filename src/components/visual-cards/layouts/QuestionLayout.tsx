import type { CardStyleConfig } from "../styles/cardStyles";
import type { VisualCardProps } from "../types";
import { FONTS } from "../styles/cardStyles";

export default function QuestionLayout({ style, props }: { style: CardStyleConfig; props: VisualCardProps }) {
  const isAr = props.language === 'ar';
  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', flex: 1, gap: 40 }}>
      {isAr && (
        <div aria-hidden style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: FONTS.COR, fontSize: 600, color: style.accent, opacity: 0.04,
          pointerEvents: 'none',
        }}>؟</div>
      )}
      <h1 style={{
        fontFamily: style.headlineFont, fontWeight: style.headlineWeight,
        fontSize: style.headlineSize * 2.4, lineHeight: isAr ? 1.7 : 1.25,
        color: style.headlineColor, margin: 0, maxWidth: 880, position: 'relative',
      }}>{props.content}</h1>
      <div style={{ width: 80, height: 1, background: style.accent }} />
      {props.bodyText && (
        <p style={{
          fontFamily: style.bodyFont, fontSize: style.bodySize * 1.8,
          lineHeight: isAr ? 1.9 : 1.6, color: style.bodyColor, margin: 0, maxWidth: 760, position: 'relative',
        }}>{props.bodyText}</p>
      )}
    </div>
  );
}