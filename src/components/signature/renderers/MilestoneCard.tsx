import {
  AuraMark,
  MONO,
  QUOTE_MEASURE,
  RendererProps,
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
 * MilestoneCard — dark, thin amber-mood ring around a big number.
 * A short label sits inside the ring, message under it, byline at
 * bottom edge of safe zone.
 */
export default function MilestoneCard(props: RendererProps) {
  const { lang, mood, name, title, lines, meta } = props;
  const ar = isAr(lang);
  const accent = moodColor(mood);
  const number = (title || "").trim() || "01";
  const insideLabel = lines[0] || "";
  const message = lines[1] || "";

  const messageFit = fitText(message, {
    font: { family: ar ? "Cairo" : "Newsreader", weight: 500, style: ar ? "normal" : "italic" },
    maxWidth: QUOTE_MEASURE,
    minSize: 32,
    maxSize: 52,
    maxLines: 2,
    lineHeightRatio: ar ? 1.9 : 1.2,
  });

  const anchor = anchorStart(lang);
  const xS = xStart(lang);

  // Ring geometry — centred horizontally, sits in the upper 55% of card.
  const cx = 540;
  const cy = 540;
  const r = 260;

  return (
    <SvgRoot ariaLabel={`Milestone card: ${number}`}>
      <rect x="0" y="0" width="1080" height="1350" fill={T.darkBg1} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={accent} strokeWidth="2" />
      <text
        x={cx}
        y={cy + 40}
        fill={T.paper}
        fontFamily={ar ? "Cairo" : SERIF}
        fontStyle={ar ? "normal" : "italic"}
        fontWeight={500}
        fontSize="220"
        textAnchor="middle"
        letterSpacing="-0.02em"
      >
        {number}
      </text>
      {insideLabel && (
        <text
          x={cx}
          y={cy + 120}
          fill={accent}
          fontFamily={MONO}
          fontSize="20"
          letterSpacing="0.32em"
          textAnchor="middle"
          direction={ar ? "rtl" : "ltr"}
        >
          {insideLabel.toUpperCase()}
        </text>
      )}
      <TextBlock
        lines={messageFit.lines}
        x={540}
        y={cy + r + 110}
        lineHeight={messageFit.lineHeight}
        fill={T.paper}
        fontFamily={ar ? "Cairo" : SERIF}
        fontSize={messageFit.size}
        fontStyle={ar ? "normal" : "italic"}
        fontWeight={500}
        anchor="middle"
        lang={lang}
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
      {meta && (
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
          {meta.toUpperCase()}
        </text>
      )}
      <AuraMark lang={lang} color={T.paperFaint} />
    </SvgRoot>
  );
}