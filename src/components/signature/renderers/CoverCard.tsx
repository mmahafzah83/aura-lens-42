import {
  AuraMark,
  CONTENT_W,
  MONO,
  QUOTE_MEASURE,
  RendererProps,
  SAFE_X0,
  SAFE_X1,
  SAFE_Y0,
  SAFE_Y1,
  SERIF,
  SvgRoot,
  T,
  TextBlock,
  anchorStart,
  isAr,
  moodColor,
  xStart,
} from "./shared";
import { fitText } from "../fitText";

/**
 * CoverCard — dark editorial, name-forward. Amber (or mood) label,
 * hero name (auto-fit), single descriptor line, byline at bottom.
 */
export default function CoverCard(props: RendererProps) {
  const { lang, mood, name, title, lines, meta } = props;
  const ar = isAr(lang);
  const accent = moodColor(mood);
  const gradId = `cover-bg-${mood}`;

  const nameFit = fitText(name, {
    font: { family: ar ? "Cairo" : "Newsreader", weight: 500, style: ar ? "normal" : "italic" },
    maxWidth: QUOTE_MEASURE,
    minSize: 88,
    maxSize: 168,
    maxLines: 2,
    lineHeightRatio: ar ? 1.4 : 1.02,
  });

  const anchor = anchorStart(lang);
  const xS = xStart(lang);
  const label = (title || "").toUpperCase();
  const under = lines[0] || "";

  return (
    <SvgRoot ariaLabel={`Cover card for ${name}`}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={T.darkBg1} />
          <stop offset="1" stopColor={T.darkBg2} />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="1080" height="1350" fill={`url(#${gradId})`} />
      <text
        x={xS}
        y={SAFE_Y0 + 12}
        fill={accent}
        fontFamily={MONO}
        fontSize="20"
        letterSpacing="0.32em"
        textAnchor={anchor}
        direction={ar ? "rtl" : "ltr"}
      >
        {label}
      </text>
      <line
        x1={ar ? SAFE_X1 - 96 : SAFE_X0}
        y1={SAFE_Y0 + 26}
        x2={ar ? SAFE_X1 : SAFE_X0 + 96}
        y2={SAFE_Y0 + 26}
        stroke={accent}
        strokeWidth="2"
      />
      <TextBlock
        lines={nameFit.lines}
        x={xS}
        y={SAFE_Y0 + 140 + nameFit.size}
        lineHeight={nameFit.lineHeight}
        fill={T.paper}
        fontFamily={ar ? "Cairo" : SERIF}
        fontSize={nameFit.size}
        fontStyle={ar ? "normal" : "italic"}
        fontWeight={500}
        anchor={anchor}
        lang={lang}
        letterSpacing="-0.01em"
      />
      {under && (
        <text
          x={xS}
          y={SAFE_Y1 - 120}
          fill={T.paperFaint}
          fontFamily={ar ? "Cairo" : SERIF}
          fontSize="30"
          fontStyle={ar ? "normal" : "italic"}
          textAnchor={anchor}
          direction={ar ? "rtl" : "ltr"}
        >
          {under}
        </text>
      )}
      {meta && (
        <text
          x={xS}
          y={SAFE_Y1 - 20}
          fill={T.paperFaint}
          fontFamily={MONO}
          fontSize="16"
          letterSpacing="0.28em"
          textAnchor={anchor}
          direction={ar ? "rtl" : "ltr"}
        >
          {meta.toUpperCase()}
        </text>
      )}
      <AuraMark lang={lang} color={T.paperFaint} />
      <rect
        x={SAFE_X0}
        y={SAFE_Y0}
        width={CONTENT_W}
        height={SAFE_Y1 - SAFE_Y0}
        fill="none"
        pointerEvents="none"
      />
    </SvgRoot>
  );
}