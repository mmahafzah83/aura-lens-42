import {
  AuraMark, MONO, RendererProps, SvgRoot, T, TextBlock,
  anchorStart, capsText, captionFontFamily, captionSize, captionTrack, captionWeight,
  getGeometry, isAr, moodColor, moodWashRGBA, pickQuoteFont, quoteLineHeight, xStart,
  SPACE,
} from "./shared";
import { fitText } from "../fitText";

export default function LineCard(props: RendererProps & { square?: boolean }) {
  const { lang, mood, name, title, lines, meta, square } = props;
  const ar = isAr(lang);
  const accent = moodColor(mood);
  const g = getGeometry(square);
  const quote = lines[0] || "";
  const font = pickQuoteFont(lang, ar);
  const fit = fitText(quote, {
    font: { family: ar ? "Cairo" : "Newsreader", weight: ar ? 700 : 500, style: ar ? "normal" : "italic" },
    maxWidth: g.QUOTE_MEASURE,
    minSize: 48, maxSize: square ? 80 : 96, maxLines: 2,
    lineHeightRatio: ar ? 1.8 : 1.1,
  });
  const lineH = quoteLineHeight(lang, fit.size);
  const opticalCenterY = Math.round(g.H * 0.43);
  const block = fit.lines.length * lineH;
  const quoteY = opticalCenterY - block / 2 + fit.size;
  const anchor = anchorStart(lang);
  const xS = xStart(lang, g);
  const spineW = SPACE.xl;
  const spineX = ar ? g.SAFE_X1 - spineW : g.SAFE_X0;
  const gradId = `line-spine-${mood}`;
  const spineStops =
    mood === "teal"   ? ["#36C5B0", "#D6A748", "#6E2A26"] :
    mood === "amber"  ? ["#D6A748", "#F0C97A", "#36C5B0"] :
                        ["#6E2A26", "#D6A748", "#36C5B0"];
  return (
    <SvgRoot ariaLabel={`Line card: ${quote}`} geom={g}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={spineStops[0]} />
          <stop offset="0.5" stopColor={spineStops[1]} />
          <stop offset="1" stopColor={spineStops[2]} />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width={g.W} height={g.H} fill={T.panel} />
      <rect x="0" y="0" width={g.W} height={g.H} fill={moodWashRGBA(mood, 0.10)} />
      <TextBlock lines={fit.lines} x={xS} y={quoteY} lineHeight={lineH} fill={T.paper} fontFamily={font.family} fontSize={fit.size} fontStyle={font.style} fontWeight={font.weight} anchor={anchor} lang={lang} letterSpacing={ar ? "0" : "-0.01em"} />
      {(() => {
        const nameText = capsText(name, lang);
        const nameFit = fitText(nameText, {
          font: { family: ar ? "Cairo" : "IBM Plex Mono", weight: 600 },
          maxWidth: g.QUOTE_MEASURE,
          minSize: captionSize(lang, 12), maxSize: captionSize(lang, 20), maxLines: 1, lineHeightRatio: 1.3,
        });
        const nameY = g.SAFE_Y1 - SPACE.xl;
        const spineY = nameY - nameFit.size - SPACE.m;
        return (
          <>
            <rect x={spineX} y={spineY} width={spineW} height="4" rx="2" fill={`url(#${gradId})`} />
            <TextBlock lines={[nameFit.lines[0] || nameText]} x={xS} y={nameY} lineHeight={nameFit.lineHeight} fill={T.paper} fontFamily={captionFontFamily(lang)} fontSize={nameFit.size} fontWeight={captionWeight(lang, 600)} letterSpacing={captionTrack(lang, "0.24em")} anchor={anchor} lang={lang} />
          </>
        );
      })()}
      {(title || meta) && (() => {
        const captionRaw = [title, meta].filter(Boolean).join(" · ");
        const caption = capsText(captionRaw, lang);
        const capFit = fitText(caption, {
          font: { family: ar ? "Cairo" : "IBM Plex Mono", weight: ar ? 600 : 400 },
          maxWidth: g.QUOTE_MEASURE,
          minSize: captionSize(lang, 12), maxSize: captionSize(lang, 16), maxLines: 1, lineHeightRatio: 1.3,
        });
        return <TextBlock lines={[capFit.lines[0] || caption]} x={xS} y={g.SAFE_Y1 - SPACE.s} lineHeight={capFit.lineHeight} fill={T.paperFaint} fontFamily={captionFontFamily(lang)} fontSize={capFit.size} fontWeight={captionWeight(lang, 400)} letterSpacing={captionTrack(lang, "0.24em")} anchor={anchor} lang={lang} />;
      })()}
      <AuraMark lang={lang} color={T.paperFaint} geom={g} />
    </SvgRoot>
  );
}