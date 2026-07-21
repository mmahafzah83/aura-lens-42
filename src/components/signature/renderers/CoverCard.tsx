import {
  AuraMark,
  anchorEnd,
  MONO,
  RendererProps,
  SERIF,
  SvgRoot,
  T,
  TextBlock,
  anchorStart,
  getGeometry,
  isAr,
  moodColor,
  moodWashRGBA,
  xStart,
  xEnd,
} from "./shared";
import { fitText } from "../fitText";

/**
 * CoverCard — dark editorial, name-forward. Amber (or mood) label,
 * hero name (auto-fit), single descriptor line, byline at bottom.
 */
export default function CoverCard(props: RendererProps & { square?: boolean }) {
  const { lang, mood, name, title, lines, meta, square } = props;
  const ar = isAr(lang);
  const accent = moodColor(mood);
  const g = getGeometry(square);
  const gradId = `cover-bg-${mood}${square ? "-sq" : ""}`;

  const anchor = anchorStart(lang);
  const anchorE = anchorEnd(lang);
  const xS = xStart(lang, g);
  const xE = xEnd(lang, g);

  // ── Masthead geometry
  const mastY = g.SAFE_Y0 + 8;
  const mastRuleY = mastY + 26;

  // ── Hero name — big cover headline in the lower-middle third
  const nameFit = fitText(name, {
    font: { family: ar ? "Cairo" : "Newsreader", weight: 500, style: ar ? "normal" : "italic" },
    maxWidth: g.QUOTE_MEASURE,
    minSize: 84,
    maxSize: square ? 148 : 188,
    maxLines: 2,
    lineHeightRatio: ar ? 1.35 : 1.0,
  });

  const kicker = "THE PRESENCE EDITION";
  const coverline = lines[0] || "";
  const byline = [title, meta].filter(Boolean).join(" · ").toUpperCase();
  const issueLine = "VOL. 01";

  // Positioning: name sits ~62% down the card
  const nameBaseY = Math.round(g.H * 0.62);
  const nameBlock = nameFit.lines.length * nameFit.lineHeight;
  const nameStartY = nameBaseY - (nameBlock - nameFit.size) / 2;
  const nameRuleY = nameStartY - nameFit.size - 28;

  return (
    <SvgRoot ariaLabel={`Cover card for ${name}`} geom={g}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={T.darkBg1} />
          <stop offset="1" stopColor={T.darkBg2} />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width={g.W} height={g.H} fill={`url(#${gradId})`} />
      <rect x="0" y="0" width={g.W} height={g.H} fill={moodWashRGBA(mood, 0.09)} />

      {/* MASTHEAD — AURA wordmark left, kicker right */}
      <text
        x={xS}
        y={mastY + 16}
        fill={T.paper}
        fontFamily={MONO}
        fontSize="20"
        fontWeight={700}
        letterSpacing="0.36em"
        textAnchor={anchor}
        direction={ar ? "rtl" : "ltr"}
      >
        AURA
      </text>
      <text
        x={xE}
        y={mastY + 16}
        fill={accent}
        fontFamily={MONO}
        fontSize="13"
        letterSpacing="0.32em"
        textAnchor={anchorEnd}
        direction={ar ? "rtl" : "ltr"}
      >
        {kicker}
      </text>
      <line x1={g.SAFE_X0} y1={mastRuleY} x2={g.SAFE_X1} y2={mastRuleY} stroke={T.ruleOnDark} strokeWidth="1" />

      {/* Mood-coloured short rule above the hero name */}
      <rect
        x={ar ? g.SAFE_X1 - 96 : g.SAFE_X0}
        y={nameRuleY}
        width="96"
        height="4"
        fill={accent}
      />

      {/* HERO NAME — giant cover headline */}
      <TextBlock
        lines={nameFit.lines}
        x={xS}
        y={nameStartY}
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

      {/* COVERLINE — descriptor line under name */}
      {coverline && (() => {
        const coverFit = fitText(coverline, {
          font: { family: ar ? "Cairo" : "Newsreader", weight: 400, style: ar ? "normal" : "italic" },
          maxWidth: g.QUOTE_MEASURE,
          minSize: 22, maxSize: 34, maxLines: 2,
          lineHeightRatio: ar ? 1.6 : 1.25,
        });
        const covY = nameStartY + (nameBlock - nameFit.size) + 46 + coverFit.size;
        return (
          <TextBlock
            lines={coverFit.lines}
            x={xS}
            y={covY}
            lineHeight={coverFit.lineHeight}
            fill={T.paperFaint}
            fontFamily={ar ? "Cairo" : SERIF}
            fontSize={coverFit.size}
            fontStyle={ar ? "normal" : "italic"}
            fontWeight={400}
            anchor={anchor}
            lang={lang}
          />
        );
      })()}

      {/* BYLINE — mono credit line above the AuraMark */}
      {byline && (
        <text
          x={xS}
          y={g.SAFE_Y1 - 52}
          fill={T.paperFaint}
          fontFamily={MONO}
          fontSize="14"
          letterSpacing="0.28em"
          textAnchor={anchor}
          direction={ar ? "rtl" : "ltr"}
        >
          {byline}
        </text>
      )}

      {/* ISSUE LINE — top opposite corner, quiet */}
      <text
        x={xE}
        y={g.SAFE_Y1 - 52}
        fill={T.paperFaint}
        fontFamily={MONO}
        fontSize="11"
        letterSpacing="0.3em"
        textAnchor={anchorEnd}
        direction={ar ? "rtl" : "ltr"}
        opacity="0.7"
      >
        {issueLine}
      </text>

      <AuraMark lang={lang} color={T.paperFaint} geom={g} />
    </SvgRoot>
  );
}