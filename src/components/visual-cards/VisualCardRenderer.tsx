import { CARD_STYLES, FONTS, type CardStyleConfig, type CardStyleName } from "./styles/cardStyles";
import type { VisualCardProps, CardType } from "./types";
import InsightLayout from "./layouts/InsightLayout";
import FrameworkLayout from "./layouts/FrameworkLayout";
import StatLayout from "./layouts/StatLayout";
import ComparisonLayout from "./layouts/ComparisonLayout";
import QuestionLayout from "./layouts/QuestionLayout";
import PrinciplesLayout from "./layouts/PrinciplesLayout";
import CycleLayout from "./layouts/CycleLayout";
import EquationLayout from "./layouts/EquationLayout";

export type { VisualCardProps, CardType } from "./types";
export type { CardStyleName } from "./styles/cardStyles";

const CARD_W = 1080;
const CARD_H = 1350;

const GRAIN_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'>
    <filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0'/></filter>
    <rect width='100%' height='100%' filter='url(#n)' opacity='1'/>
  </svg>`
)}`;

function pickLayout(t: CardType) {
  switch (t) {
    case 'framework': return FrameworkLayout;
    case 'stat': return StatLayout;
    case 'comparison': return ComparisonLayout;
    case 'question': return QuestionLayout;
    case 'principles': return PrinciplesLayout;
    case 'cycle': return CycleLayout;
    case 'equation': return EquationLayout;
    case 'insight':
    default: return InsightLayout;
  }
}

function AccentBar({ style, language }: { style: CardStyleConfig; language: 'en' | 'ar' }) {
  let bar = { ...style.accentBar };
  // Mirror left/right for Arabic on left-bar styles
  if (language === 'ar' && bar.position === 'left') bar.position = 'right';
  else if (language === 'ar' && bar.position === 'right' && style.name !== 'sand' && style.name !== 'navy') {
    bar.position = 'left';
  }

  const common: React.CSSProperties = {
    position: 'absolute',
    background: bar.background,
    borderRadius: bar.rounded ? 999 : 0,
    pointerEvents: 'none',
  };

  if (bar.position === 'left' || bar.position === 'right') {
    const isPartial = bar.length && bar.length !== '100%';
    return (
      <div style={{
        ...common,
        [bar.position]: 0,
        top: bar.offset ?? 0,
        width: bar.size,
        height: isPartial ? bar.length : `calc(100% - ${bar.offset ?? 0}px)`,
      } as React.CSSProperties} />
    );
  }
  // top / bottom
  const isPartial = bar.length && bar.length !== '100%';
  return (
    <div style={{
      ...common,
      [bar.position]: bar.position === 'bottom' ? 80 : 0,
      left: bar.centered ? '50%' : 0,
      transform: bar.centered ? 'translateX(-50%)' : undefined,
      height: bar.size,
      width: isPartial ? bar.length : '100%',
    } as React.CSSProperties} />
  );
}

export default function VisualCardRenderer(props: VisualCardProps) {
  const language = props.language ?? 'en';
  const styleName: CardStyleName = props.style ?? (language === 'ar' ? 'sand' : 'blackboard');
  const style = CARD_STYLES[styleName];
  const cardType = props.cardType ?? 'insight';
  const Layout = pickLayout(cardType);

  const isAr = language === 'ar';
  const dir = isAr ? 'rtl' : 'ltr';
  const textAlign: React.CSSProperties['textAlign'] = isAr ? 'right' : 'left';
  // Fix A: Force Cairo across the entire card subtree when content is Arabic.
  // Inline styles in layouts override style objects, so we cascade via class + !important.
  const arabicFontClass = isAr ? 'aura-card-arabic' : '';

  return (
    <div className="card-preview-wrapper" style={{ width: '100%', maxWidth: 380, aspectRatio: `${CARD_W} / ${CARD_H}`, overflow: 'hidden' }}>
      {isAr && (
        <style>{`
          .aura-card-arabic, .aura-card-arabic * {
            font-family: 'Cairo', 'DM Sans', sans-serif !important;
            line-height: 1.9;
          }
        `}</style>
      )}
      <div
        className={`card-preview-inner ${arabicFontClass}`}
        style={{
          width: CARD_W,
          height: CARD_H,
          transform: `scale(calc(380 / ${CARD_W}))`,
          transformOrigin: 'top left',
          position: 'relative',
          background: style.background,
          border: style.border,
          color: style.headlineColor,
          direction: dir,
          textAlign,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          padding: 80,
          boxSizing: 'border-box',
        }}
      >
        {/* Accent bar */}
        <AccentBar style={style} language={language} />

        {/* Overlay glow */}
        {style.overlay && (
          <div style={{ position: 'absolute', inset: 0, background: style.overlay, pointerEvents: 'none' }} />
        )}
        {style.radialGlow && (
          <div style={{ position: 'absolute', inset: 0, background: style.radialGlow, pointerEvents: 'none' }} />
        )}

        {/* Grain */}
        {style.grain && (
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: `url("${GRAIN_SVG}")`,
            opacity: style.grainOpacity ?? 0.1,
            mixBlendMode: 'overlay',
            pointerEvents: 'none',
          }} />
        )}

        {/* Tag */}
        {props.tag && (
          <div style={{
            position: 'relative',
            display: 'flex', alignItems: 'center', gap: 24,
            fontFamily: style.tagFont,
            fontSize: 20,
            color: style.tagColor,
            textTransform: 'uppercase',
            letterSpacing: '0.15em',
            fontWeight: 600,
            marginBottom: 64,
          }}>
            <span style={{ width: 24, height: 1, background: style.tagColor }} />
            <span>{props.tag}</span>
          </div>
        )}

        {/* Body */}
        <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <Layout style={style} props={{ ...props, language }} />
        </div>

        {/* Footer — mirrors Carousel slide footer */}
        {(() => {
          const initial = isAr
            ? 'م'
            : (props.authorName?.trim().charAt(0).toUpperCase() || 'M');
          return (
            <div style={{ position: 'relative', marginTop: 40 }}>
              {/* Thin separator — full width, 10% opacity */}
              <div style={{
                height: 1,
                background: 'currentColor',
                opacity: 0.1,
                marginBottom: 24,
              }} />
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                direction: dir,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: '50%',
                    background: style.footerAccentColor,
                    color: style.background,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: isAr ? "'Cairo','DM Sans',sans-serif" : style.bodyFont,
                    fontSize: 14, fontWeight: 800, lineHeight: 1,
                  }}>
                    {initial}
                  </div>
                  <div style={{
                    fontFamily: isAr ? "'Cairo','DM Sans',sans-serif" : style.bodyFont,
                    fontSize: 18, fontWeight: 600,
                    color: style.headlineColor,
                  }}>
                    {props.authorName}
                  </div>
                </div>
                <div style={{
                  fontFamily: FONTS.MONO, fontSize: 14,
                  color: style.footerColor, letterSpacing: '0.04em',
                }}>
                  aura-intel.org
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}