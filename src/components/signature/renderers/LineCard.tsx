import {
  AuraMark, MONO, RendererProps, SvgRoot, T, TextBlock,
  anchorStart, getGeometry, isAr, moodColor, pickQuoteFont, quoteLineHeight, xStart,
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
      <rect x={ar ? g.SAFE_X1 - 48 : g.SAFE_X0} y={quoteY - fit.size - 44} width="48" height="4" fill={accent} />
      <TextBlock lines={fit.lines} x={xS} y={quoteY} lineHeight={lineH} fill={T.paper} fontFamily={font.family} fontSize={fit.size} fontStyle={font.style} fontWeight={font.weight} anchor={anchor} lang={lang} letterSpacing={ar ? "0" : "-0.01em"} />
      <text x={xS} y={g.SAFE_Y1 - 44} fill={T.paper} fontFamily={MONO} fontSize="22" letterSpacing="0.24em" textAnchor={anchor} direction={ar ? "rtl" : "ltr"}>{name.toUpperCase()}</text>
      {(title || meta) && (
        <text x={xS} y={g.SAFE_Y1 - 14} fill={T.paperFaint} fontFamily={MONO} fontSize="15" letterSpacing="0.28em" textAnchor={anchor} direction={ar ? "rtl" : "ltr"}>{[title, meta].filter(Boolean).join(" · ").toUpperCase()}</text>
      )}
      <AuraMark lang={lang} color={T.paperFaint} geom={g} />
    </SvgRoot>
  );
}