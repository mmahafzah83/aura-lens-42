import {
  ARABIC, AuraMark, EmphasisTextBlock, MONO, RendererProps, SERIF, SvgRoot, T,
  TextBlock, anchorEnd, anchorStart, capsText, captionFontFamily, captionSize,
  captionTrack, captionWeight, emphasisColorFor, getGeometry, isAr, moodColor,
  moodWashRGBA, xEnd, xStart, SPACE,
} from "./shared";
import type { FrameDecision } from "./FrameCard";
import { fitText } from "../fitText";

/**
 * The Statement — Quote.
 * Big framing quotation marks; the IDEA is the hero. Name small at bottom,
 * gradient spine above it, AuraMark inline-end. Full AR mirror.
 */
export default function StatementQuoteCard(
  props: RendererProps & { decision?: FrameDecision; emphasisOff?: boolean; square?: boolean },
) {
  const { lang, mood, name, title, lines, meta, decision, emphasisOff, square } = props;
  const ar = isAr(lang);
  const g = getGeometry(square);
  const accent = moodColor(mood);
  const anchor = anchorStart(lang);
  const anchorE = anchorEnd(lang);
  const xS = xStart(lang, g);
  const xE = xEnd(lang, g);

  const quote = lines[0] || "";
  const emphasis = emphasisOff ? [] : (decision?.emphasis || []);
  const emphColor = emphasisColorFor(undefined, "strong", mood);

  const measureWidth = Math.round(g.QUOTE_MEASURE * (emphasis.length ? 0.96 : 1));
  const fit = fitText(quote, {
    font: { family: ar ? "Cairo" : "Newsreader", weight: ar ? 700 : 500, style: ar ? "normal" : "italic" },
    maxWidth: measureWidth,
    minSize: ar ? 32 : 40,
    maxSize: ar ? 56 : 72,
    maxLines: 4,
    lineHeightRatio: ar ? 1.8 : 1.45,
  });
  const lineH = fit.lineHeight;
  const blockH = fit.lines.length * lineH;

  // Optical vertical center a touch above true middle (58% down for the last baseline feel)
  const opticalCenterY = Math.round(g.H * 0.52);
  const firstBaselineY = opticalCenterY - blockH / 2 + fit.size;

  // Kicker line — title/meta, small caps EN / Cairo AR
  const kickerRaw = [title, meta].filter(Boolean).join(" · ");
  const kickerText = capsText(kickerRaw, lang);
  const kickerFit = kickerText
    ? fitText(kickerText, {
        font: { family: ar ? "Cairo" : "IBM Plex Mono", weight: ar ? 600 : 400 },
        maxWidth: g.QUOTE_MEASURE,
        minSize: captionSize(lang, 12), maxSize: captionSize(lang, 14), maxLines: 1, lineHeightRatio: 1.3,
      })
    : null;

  // Big opening quotation mark — top inline-start of safe zone (accent)
  const openMarkSize = 220;
  const openMarkX = xS;
  const openMarkY = g.SAFE_Y0 + Math.round(openMarkSize * 0.75);
  // Closing mark, bottom inline-end, smaller + low opacity
  const closeMarkSize = 140;
  const closeMarkX = xE;
  const closeMarkY = g.SAFE_Y1 - SPACE.xl * 2;

  // Name row at bottom above AuraMark
  const nameText = name;
  const nameFit = fitText(nameText, {
    font: { family: ar ? "Cairo" : "IBM Plex Mono", weight: 600 },
    maxWidth: g.CONTENT_W * 0.68,
    minSize: captionSize(lang, 12), maxSize: captionSize(lang, 18), maxLines: 1, lineHeightRatio: 1.3,
  });

  // Gradient spine — mood-ordered
  const gradId = `stmt-quote-spine-${mood}`;
  const bgGradId = `stmt-quote-bg-${mood}`;
  const spineStops =
    mood === "teal"   ? ["#36C5B0", "#D6A748", "#6E2A26"] :
    mood === "amber"  ? ["#D6A748", "#F0C97A", "#36C5B0"] :
                        ["#6E2A26", "#D6A748", "#36C5B0"];

  const spineY = g.SAFE_Y1 - SPACE.xl - SPACE.s - nameFit.size - SPACE.m;
  const spineW = SPACE.xl * 2;
  const spineX = ar ? g.SAFE_X1 - spineW : g.SAFE_X0;
  const nameY = g.SAFE_Y1 - SPACE.xl - SPACE.s;
  const kickerY = firstBaselineY - fit.size - SPACE.l;

  return (
    <SvgRoot ariaLabel={`Statement quote: ${quote}`} geom={g}>
      <defs>
        <linearGradient id={bgGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={T.darkBg1} />
          <stop offset="1" stopColor={T.darkBg2} />
        </linearGradient>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={spineStops[0]} />
          <stop offset="0.5" stopColor={spineStops[1]} />
          <stop offset="1" stopColor={spineStops[2]} />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width={g.W} height={g.H} fill={`url(#${bgGradId})`} />
      <rect x="0" y="0" width={g.W} height={g.H} fill={moodWashRGBA(mood, 0.06)} />

      {/* Opening quotation mark — hero-scale, mood accent */}
      <text
        x={openMarkX}
        y={openMarkY}
        fill={accent}
        fontFamily={SERIF}
        fontSize={openMarkSize}
        fontWeight={500}
        fontStyle="italic"
        textAnchor={anchor}
        opacity="0.95"
      >
        {"\u201C"}
      </text>

      {/* Closing quotation mark — quiet counterweight */}
      <text
        x={closeMarkX}
        y={closeMarkY}
        fill={T.paperFaint}
        fontFamily={SERIF}
        fontSize={closeMarkSize}
        fontWeight={500}
        fontStyle="italic"
        textAnchor={anchorE}
        opacity="0.28"
      >
        {"\u201D"}
      </text>

      {/* Kicker — title/meta above the quote */}
      {kickerFit && (
        <TextBlock
          lines={[kickerFit.lines[0] || kickerText]}
          x={xS}
          y={kickerY}
          lineHeight={kickerFit.lineHeight}
          fill={T.paperFaint}
          fontFamily={captionFontFamily(lang)}
          fontSize={kickerFit.size}
          fontWeight={captionWeight(lang, 400)}
          letterSpacing={captionTrack(lang, "0.24em")}
          anchor={anchor}
          lang={lang}
        />
      )}

      {/* Hero quote */}
      <EmphasisTextBlock
        lines={fit.lines}
        x={xS}
        y={firstBaselineY}
        lineHeight={lineH}
        fill={T.paper}
        fontFamily={ar ? ARABIC : SERIF}
        fontSize={fit.size}
        fontStyle={ar ? "normal" : "italic"}
        fontWeight={ar ? 700 : 500}
        anchor={anchor}
        lang={lang}
        letterSpacing={ar ? "0" : "-0.005em"}
        emphasis={emphasis}
        accentColor={emphColor}
      />

      {/* Gradient spine above the name */}
      <rect x={spineX} y={spineY} width={spineW} height="4" rx="2" fill={`url(#${gradId})`} />

      {/* Name — bottom inline-start */}
      <TextBlock
        lines={[nameFit.lines[0] || nameText]}
        x={xS}
        y={nameY}
        lineHeight={nameFit.lineHeight}
        fill={T.paper}
        fontFamily={captionFontFamily(lang)}
        fontSize={nameFit.size}
        fontWeight={captionWeight(lang, 600)}
        letterSpacing={captionTrack(lang, "0.24em")}
        anchor={anchor}
        lang={lang}
      />

      <AuraMark lang={lang} color={T.paperFaint} geom={g} />
    </SvgRoot>
  );
}