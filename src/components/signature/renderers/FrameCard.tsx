import {
  AuraMark,
  MONO,
  PhotoPlaceholder,
  QUOTE_MEASURE,
  RendererProps,
  SAFE_X0,
  SAFE_X1,
  SAFE_Y0,
  SAFE_Y1,
  SvgRoot,
  T,
  TextBlock,
  anchorStart,
  isAr,
  moodColor,
  pickQuoteFont,
  quoteLineHeight,
  xStart,
} from "./shared";
import { fitText } from "../fitText";

/**
 * FrameCard — photo fills the full canvas with a dark scrim in the
 * lower third. Quote sits at the optical centre; byline at safe-zone
 * bottom edge.
 */
export default function FrameCard(props: RendererProps) {
  const { lang, mood, photoUrl, name, title, lines, meta } = props;
  const ar = isAr(lang);
  const accent = moodColor(mood);
  const quote = lines[0] || "";
  const font = pickQuoteFont(lang, ar);
  const bold = ar;

  const fit = fitText(quote, {
    font: { family: ar ? "Cairo" : "Newsreader", weight: bold ? 700 : 500, style: ar ? "normal" : "italic" },
    maxWidth: QUOTE_MEASURE,
    minSize: 46,
    maxSize: 78,
    maxLines: 2,
    lineHeightRatio: ar ? 1.9 : 1.18,
  });
  const lineH = quoteLineHeight(lang, fit.size);

  const opticalCenterY = Math.round(1350 * 0.43);
  const block = fit.lines.length * lineH;
  const quoteY = opticalCenterY - block / 2 + fit.size;

  const anchor = anchorStart(lang);
  const xS = xStart(lang);
  const scrimId = `frame-scrim-${mood}`;

  return (
    <SvgRoot ariaLabel={`Frame card: ${quote}`}>
      <rect x="0" y="0" width="1080" height="1350" fill={T.darkBg2} />
      {photoUrl ? (
        <image
          href={photoUrl}
          x="0"
          y="0"
          width="1080"
          height="1350"
          preserveAspectRatio="xMidYMid slice"
        />
      ) : (
        <PhotoPlaceholder x={0} y={0} w={1080} h={1350} tone="dark" />
      )}
      <defs>
        <linearGradient id={scrimId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(5,8,12,0)" />
          <stop offset="0.55" stopColor="rgba(5,8,12,0.35)" />
          <stop offset="1" stopColor="rgba(5,8,12,0.86)" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="1080" height="1350" fill={`url(#${scrimId})`} />
      <line
        x1={xS}
        y1={quoteY - fit.size - 24}
        x2={ar ? xS - 72 : xS + 72}
        y2={quoteY - fit.size - 24}
        stroke={accent}
        strokeWidth="3"
      />
      <TextBlock
        lines={fit.lines}
        x={xS}
        y={quoteY}
        lineHeight={lineH}
        fill={T.paper}
        fontFamily={font.family}
        fontSize={fit.size}
        fontStyle={font.style}
        fontWeight={font.weight}
        anchor={anchor}
        lang={lang}
        letterSpacing={ar ? "0" : "-0.01em"}
      />
      <text
        x={xS}
        y={SAFE_Y1 - 44}
        fill={T.paper}
        fontFamily={MONO}
        fontSize="22"
        letterSpacing="0.24em"
        textAnchor={anchor}
        direction={ar ? "rtl" : "ltr"}
      >
        {name.toUpperCase()}
      </text>
      {(title || meta) && (
        <text
          x={xS}
          y={SAFE_Y1 - 14}
          fill={T.paperFaint}
          fontFamily={MONO}
          fontSize="15"
          letterSpacing="0.28em"
          textAnchor={anchor}
          direction={ar ? "rtl" : "ltr"}
        >
          {[title, meta].filter(Boolean).join(" · ").toUpperCase()}
        </text>
      )}
      <AuraMark lang={lang} color={T.paperFaint} />
    </SvgRoot>
  );
}