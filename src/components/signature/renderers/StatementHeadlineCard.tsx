import {
  ARABIC, AuraMark, EmphasisTextBlock, MONO, RendererProps, SERIF, SvgRoot, T,
  TextBlock, anchorEnd, anchorStart, capsText, captionFontFamily, captionSize,
  captionTrack, captionWeight, emphasisColorFor, getGeometry, isAr, moodColor,
  moodWashRGBA, xEnd, xStart, SPACE,
} from "./shared";
import type { FrameDecision } from "./FrameCard";
import { fitText } from "../fitText";

/**
 * The Statement — Headline.
 * Bold two-tone display headline lower-left third. Masthead top row.
 * Name/title small at bottom with gradient spine + AuraMark. Full AR mirror.
 */
export default function StatementHeadlineCard(
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

  const headline = lines[0] || "";

  // Emphasis: use decision if present; otherwise auto-emphasize the LAST clause.
  let emphasis = emphasisOff ? [] : (decision?.emphasis || []);
  if (!emphasisOff && emphasis.length === 0 && headline) {
    const splitters = /[—–,:；;،]/g;
    const parts = headline.split(splitters).map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const last = parts[parts.length - 1];
      if (last && headline.includes(last)) emphasis = [{ phrase: last, style: "color" }];
    } else {
      // No clause split — emphasize last 2–3 words when possible
      const words = headline.split(/\s+/).filter(Boolean);
      if (words.length >= 6) {
        const tail = words.slice(-3).join(" ");
        if (headline.includes(tail)) emphasis = [{ phrase: tail, style: "color" }];
      }
    }
  }
  const emphColor = emphasisColorFor(undefined, "strong", mood);

  const measureWidth = Math.round(g.QUOTE_MEASURE * (emphasis.length ? 0.96 : 1));
  const fit = fitText(headline, {
    font: { family: ar ? "Cairo" : "Newsreader", weight: ar ? 700 : 600, style: "normal" },
    maxWidth: measureWidth,
    minSize: ar ? 36 : 44,
    maxSize: ar ? 64 : 80,
    maxLines: 4,
    lineHeightRatio: ar ? 1.2 : 1.12,
  });
  const lineH = fit.lineHeight;
  const blockH = fit.lines.length * lineH;

  // Masthead
  const mastY = g.SAFE_Y0 + SPACE.s;
  const mastRuleY = mastY + SPACE.m + 2;
  const kicker = "THE STATEMENT";

  // Name row + spine at bottom
  const nameText = capsText(name, lang);
  const nameFit = fitText(nameText, {
    font: { family: ar ? "Cairo" : "IBM Plex Mono", weight: 600 },
    maxWidth: g.CONTENT_W * 0.68,
    minSize: captionSize(lang, 12), maxSize: captionSize(lang, 18), maxLines: 1, lineHeightRatio: 1.3,
  });
  const titleRaw = [title, meta].filter(Boolean).join(" · ");
  const titleText = capsText(titleRaw, lang);
  const titleFit = titleText
    ? fitText(titleText, {
        font: { family: ar ? "Cairo" : "IBM Plex Mono", weight: ar ? 600 : 400 },
        maxWidth: g.QUOTE_MEASURE,
        minSize: captionSize(lang, 12), maxSize: captionSize(lang, 14), maxLines: 1, lineHeightRatio: 1.3,
      })
    : null;
  const nameY = g.SAFE_Y1 - SPACE.xl - SPACE.s - (titleFit ? titleFit.size + SPACE.xs : 0);
  const titleY = g.SAFE_Y1 - SPACE.xl - SPACE.s;
  const spineY = nameY - nameFit.size - SPACE.m;
  const spineW = SPACE.xl * 2;
  const spineX = ar ? g.SAFE_X1 - spineW : g.SAFE_X0;

  // Headline anchor lower-left third: last baseline sits ~68% down
  const lastBaselineTargetY = Math.min(spineY - SPACE.xl, Math.round(g.H * 0.68));
  const firstBaselineY = lastBaselineTargetY - (fit.lines.length - 1) * lineH;

  const gradId = `stmt-head-spine-${mood}`;
  const bgGradId = `stmt-head-bg-${mood}`;
  const spineStops =
    mood === "teal"   ? ["#36C5B0", "#D6A748", "#6E2A26"] :
    mood === "amber"  ? ["#D6A748", "#F0C97A", "#36C5B0"] :
                        ["#6E2A26", "#D6A748", "#36C5B0"];

  return (
    <SvgRoot ariaLabel={`Statement headline: ${headline}`} geom={g}>
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

      {/* Masthead — AURA inline-start / kicker inline-end / hairline rule */}
      <text
        x={xS}
        y={mastY + SPACE.s}
        fill={T.paper}
        fontFamily={MONO}
        fontSize={18}
        fontWeight={700}
        letterSpacing="0.36em"
        textAnchor={anchor}
        direction={ar ? "rtl" : "ltr"}
      >
        AURA
      </text>
      <text
        x={xE}
        y={mastY + SPACE.s}
        fill={accent}
        fontFamily={ar ? ARABIC : MONO}
        fontSize={12}
        fontWeight={ar ? 600 : 400}
        letterSpacing={ar ? "0" : "0.32em"}
        textAnchor={anchorE}
        direction={ar ? "rtl" : "ltr"}
      >
        {ar ? "بيان" : kicker}
      </text>
      <line x1={g.SAFE_X0} y1={mastRuleY} x2={g.SAFE_X1} y2={mastRuleY} stroke={T.ruleOnDark} strokeWidth="1" />

      {/* Hero headline — bold two-tone */}
      <EmphasisTextBlock
        lines={fit.lines}
        x={xS}
        y={firstBaselineY}
        lineHeight={lineH}
        fill={T.paper}
        fontFamily={ar ? ARABIC : SERIF}
        fontSize={fit.size}
        fontStyle="normal"
        fontWeight={ar ? 700 : 600}
        anchor={anchor}
        lang={lang}
        letterSpacing={ar ? "0" : "-0.015em"}
        emphasis={emphasis}
        accentColor={emphColor}
      />

      {/* Gradient spine above name */}
      <rect x={spineX} y={spineY} width={spineW} height="4" rx="2" fill={`url(#${gradId})`} />

      {/* Name */}
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

      {/* Title/meta */}
      {titleFit && (
        <TextBlock
          lines={[titleFit.lines[0] || titleText]}
          x={xS}
          y={titleY}
          lineHeight={titleFit.lineHeight}
          fill={T.paperFaint}
          fontFamily={captionFontFamily(lang)}
          fontSize={titleFit.size}
          fontWeight={captionWeight(lang, 400)}
          letterSpacing={captionTrack(lang, "0.24em")}
          anchor={anchor}
          lang={lang}
        />
      )}

      <AuraMark lang={lang} color={T.paperFaint} geom={g} />
    </SvgRoot>
  );
}