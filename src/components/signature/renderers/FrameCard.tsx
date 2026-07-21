import {
  AuraMark, MONO, PhotoPlaceholder, RendererProps, SvgRoot, T, TextBlock,
  anchorStart, getGeometry, isAr, moodColor, moodWashRGBA, pickQuoteFont, quoteLineHeight, xStart,
} from "./shared";
import { fitText } from "../fitText";

export default function FrameCard(props: RendererProps & { square?: boolean }) {
  const { lang, mood, photoUrl, name, title, lines, meta, square } = props;
  const ar = isAr(lang);
  const accent = moodColor(mood);
  const g = getGeometry(square);
  const quote = lines[0] || "";
  const font = pickQuoteFont(lang, ar);
  const fit = fitText(quote, {
    font: { family: ar ? "Cairo" : "Newsreader", weight: ar ? 700 : 500, style: ar ? "normal" : "italic" },
    maxWidth: g.QUOTE_MEASURE,
    minSize: 42, maxSize: square ? 66 : 78, maxLines: 2,
    lineHeightRatio: ar ? 1.9 : 1.18,
  });
  const lineH = quoteLineHeight(lang, fit.size);
  const opticalCenterY = Math.round(g.H * 0.43);
  const block = fit.lines.length * lineH;
  const quoteY = opticalCenterY - block / 2 + fit.size;
  const anchor = anchorStart(lang);
  const xS = xStart(lang, g);
  const scrimId = `frame-scrim-${mood}${square ? "-sq" : ""}`;
  return (
    <SvgRoot ariaLabel={`Frame card: ${quote}`} geom={g}>
      <rect x="0" y="0" width={g.W} height={g.H} fill={T.darkBg2} />
      {photoUrl ? (
        <image href={photoUrl} x="0" y="0" width={g.W} height={g.H} preserveAspectRatio="xMidYMid slice" />
      ) : (
        <PhotoPlaceholder x={0} y={0} w={g.W} h={g.H} tone="dark" />
      )}
      <defs>
        <linearGradient id={scrimId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(5,8,12,0)" />
          <stop offset="0.55" stopColor="rgba(5,8,12,0.35)" />
          <stop offset="1" stopColor="rgba(5,8,12,0.86)" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width={g.W} height={g.H} fill={`url(#${scrimId})`} />
      <rect x="0" y="0" width={g.W} height={g.H} fill={moodWashRGBA(mood, 0.10)} />
      <line x1={xS} y1={quoteY - fit.size - 24} x2={ar ? xS - 72 : xS + 72} y2={quoteY - fit.size - 24} stroke={accent} strokeWidth="3" />
      <TextBlock lines={fit.lines} x={xS} y={quoteY} lineHeight={lineH} fill={T.paper} fontFamily={font.family} fontSize={fit.size} fontStyle={font.style} fontWeight={font.weight} anchor={anchor} lang={lang} letterSpacing={ar ? "0" : "-0.01em"} />
      {(() => {
        const nameFit = fitText(name.toUpperCase(), {
          font: { family: "IBM Plex Mono", weight: 600 },
          maxWidth: g.QUOTE_MEASURE,
          minSize: 14, maxSize: 22, maxLines: 1, lineHeightRatio: 1.2,
        });
        return <text x={xS} y={g.SAFE_Y1 - 44} fill={T.paper} fontFamily={MONO} fontSize={nameFit.size} letterSpacing="0.24em" textAnchor={anchor} direction={ar ? "rtl" : "ltr"}>{nameFit.lines[0] || name.toUpperCase()}</text>;
      })()}
      {(title || meta) && (() => {
        const caption = [title, meta].filter(Boolean).join(" · ").toUpperCase();
        const capFit = fitText(caption, {
          font: { family: "IBM Plex Mono", weight: 400 },
          maxWidth: g.QUOTE_MEASURE,
          minSize: 10, maxSize: 15, maxLines: 1, lineHeightRatio: 1.2,
        });
        return <text x={xS} y={g.SAFE_Y1 - 14} fill={T.paperFaint} fontFamily={MONO} fontSize={capFit.size} letterSpacing="0.28em" textAnchor={anchor} direction={ar ? "rtl" : "ltr"}>{capFit.lines[0] || caption}</text>;
      })()}
      <AuraMark lang={lang} color={T.paperFaint} geom={g} />
    </SvgRoot>
  );
}