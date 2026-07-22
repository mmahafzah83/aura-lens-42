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
  return (
    <SvgRoot ariaLabel={`Line card: ${quote}`} geom={g}>
      <rect x="0" y="0" width={g.W} height={g.H} fill={T.panel} />
      <rect x="0" y="0" width={g.W} height={g.H} fill={moodWashRGBA(mood, 0.10)} />
      <rect x={ar ? g.SAFE_X1 - SPACE.xl : g.SAFE_X0} y={quoteY - fit.size - SPACE.l} width={SPACE.xl} height="4" fill={accent} />
      <TextBlock lines={fit.lines} x={xS} y={quoteY} lineHeight={lineH} fill={T.paper} fontFamily={font.family} fontSize={fit.size} fontStyle={font.style} fontWeight={font.weight} anchor={anchor} lang={lang} letterSpacing={ar ? "0" : "-0.01em"} />
      {(() => {
        const nameText = capsText(name, lang);
        const nameFit = fitText(nameText, {
          font: { family: ar ? "Cairo" : "IBM Plex Mono", weight: 600 },
          maxWidth: g.QUOTE_MEASURE,
          minSize: captionSize(lang, 12), maxSize: captionSize(lang, 20), maxLines: 1, lineHeightRatio: 1.3,
        });
        return <TextBlock lines={[nameFit.lines[0] || nameText]} x={xS} y={g.SAFE_Y1 - SPACE.xl} lineHeight={nameFit.lineHeight} fill={T.paper} fontFamily={captionFontFamily(lang)} fontSize={nameFit.size} fontWeight={captionWeight(lang, 600)} letterSpacing={captionTrack(lang, "0.24em")} anchor={anchor} lang={lang} />;
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