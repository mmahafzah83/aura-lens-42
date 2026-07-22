import {
  AuraMark, MONO, RendererProps, SvgRoot, T, TextBlock,
  anchorStart, capsText, captionFontFamily, captionSize, captionTrack, captionWeight,
  getGeometry, isAr, moodColor, moodWashRGBA, pickQuoteFont, quoteLineHeight, xStart,
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
    minSize: 48, maxSize: square ? 82 : 96, maxLines: 2,
    lineHeightRatio: ar ? 1.9 : 1.18,
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
      <rect x={ar ? g.SAFE_X1 - 48 : g.SAFE_X0} y={quoteY - fit.size - 44} width="48" height="4" fill={accent} />
      <TextBlock lines={fit.lines} x={xS} y={quoteY} lineHeight={lineH} fill={T.paper} fontFamily={font.family} fontSize={fit.size} fontStyle={font.style} fontWeight={font.weight} anchor={anchor} lang={lang} letterSpacing={ar ? "0" : "-0.01em"} />
      {(() => {
        const nameText = capsText(name, lang);
        const nameFit = fitText(nameText, {
          font: { family: ar ? "Cairo" : "IBM Plex Mono", weight: 600 },
          maxWidth: g.QUOTE_MEASURE,
          minSize: captionSize(lang, 14), maxSize: captionSize(lang, 22), maxLines: 1, lineHeightRatio: 1.2,
        });
        return <text x={xS} y={g.SAFE_Y1 - 44} fill={T.paper} fontFamily={captionFontFamily(lang)} fontSize={nameFit.size} fontWeight={captionWeight(lang, 600)} letterSpacing={captionTrack(lang, "0.24em")} textAnchor={anchor} direction={ar ? "rtl" : "ltr"}>{nameFit.lines[0] || nameText}</text>;
      })()}
      {(title || meta) && (() => {
        const captionRaw = [title, meta].filter(Boolean).join(" · ");
        const caption = capsText(captionRaw, lang);
        const capFit = fitText(caption, {
          font: { family: ar ? "Cairo" : "IBM Plex Mono", weight: ar ? 600 : 400 },
          maxWidth: g.QUOTE_MEASURE,
          minSize: captionSize(lang, 10), maxSize: captionSize(lang, 15), maxLines: 1, lineHeightRatio: 1.2,
        });
        return <text x={xS} y={g.SAFE_Y1 - 14} fill={T.paperFaint} fontFamily={captionFontFamily(lang)} fontSize={capFit.size} fontWeight={captionWeight(lang, 400)} letterSpacing={captionTrack(lang, "0.28em")} textAnchor={anchor} direction={ar ? "rtl" : "ltr"}>{capFit.lines[0] || caption}</text>;
      })()}
      <AuraMark lang={lang} color={T.paperFaint} geom={g} />
    </SvgRoot>
  );
}