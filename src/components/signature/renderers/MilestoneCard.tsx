import {
  AuraMark, MONO, RendererProps, SERIF, SvgRoot, T, TextBlock,
  anchorStart, capsText, captionFontFamily, captionSize, captionTrack, captionWeight,
  getGeometry, isAr, moodColor, moodWashRGBA, xStart,
} from "./shared";
import { fitText } from "../fitText";

export default function MilestoneCard(props: RendererProps & { square?: boolean }) {
  const { lang, mood, name, title, lines, meta, square } = props;
  const ar = isAr(lang);
  const accent = moodColor(mood);
  const g = getGeometry(square);
  const number = (title || "").trim() || "01";
  const insideLabel = lines[0] || "";
  const message = lines[1] || "";
  const messageFit = fitText(message, {
    font: { family: ar ? "Cairo" : "Newsreader", weight: 500, style: ar ? "normal" : "italic" },
    maxWidth: g.QUOTE_MEASURE,
    minSize: 28, maxSize: square ? 42 : 52, maxLines: 2,
    lineHeightRatio: ar ? 1.9 : 1.2,
  });
  const anchor = anchorStart(lang);
  const xS = xStart(lang, g);
  const cx = g.W / 2;
  const cy = g.SAFE_Y0 + g.CONTENT_H * 0.36;
  const r = Math.min(g.CONTENT_W, g.CONTENT_H) * 0.34;
  return (
    <SvgRoot ariaLabel={`Milestone card: ${number}`} geom={g}>
      <rect x="0" y="0" width={g.W} height={g.H} fill={T.darkBg1} />
      <rect x="0" y="0" width={g.W} height={g.H} fill={moodWashRGBA(mood, 0.10)} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={accent} strokeWidth="2" />
      <text x={cx} y={cy + r * 0.16} fill={T.paper} fontFamily={ar ? "Cairo" : SERIF} fontStyle={ar ? "normal" : "italic"} fontWeight={500} fontSize={r * 0.9} textAnchor="middle" letterSpacing="-0.02em">{number}</text>
      {insideLabel && (
        <text x={cx} y={cy + r * 0.5} fill={accent} fontFamily={captionFontFamily(lang)} fontSize={captionSize(lang, 20)} fontWeight={captionWeight(lang, 400)} letterSpacing={captionTrack(lang, "0.32em")} textAnchor="middle" direction={ar ? "rtl" : "ltr"}>{capsText(insideLabel, lang)}</text>
      )}
      <TextBlock lines={messageFit.lines} x={cx} y={cy + r + 90} lineHeight={messageFit.lineHeight} fill={T.paper} fontFamily={ar ? "Cairo" : SERIF} fontSize={messageFit.size} fontStyle={ar ? "normal" : "italic"} fontWeight={500} anchor="middle" lang={lang} />
      {(() => {
        const nameText = capsText(name, lang);
        const nameFit = fitText(nameText, {
          font: { family: ar ? "Cairo" : "IBM Plex Mono", weight: 600 },
          maxWidth: g.QUOTE_MEASURE,
          minSize: captionSize(lang, 14), maxSize: captionSize(lang, 22), maxLines: 1, lineHeightRatio: 1.2,
        });
        return <text x={xS} y={g.SAFE_Y1 - 44} fill={T.paper} fontFamily={captionFontFamily(lang)} fontSize={nameFit.size} fontWeight={captionWeight(lang, 600)} letterSpacing={captionTrack(lang, "0.24em")} textAnchor={anchor} direction={ar ? "rtl" : "ltr"}>{nameFit.lines[0] || nameText}</text>;
      })()}
      {meta && (() => {
        const cap = capsText(meta, lang);
        const capFit = fitText(cap, {
          font: { family: ar ? "Cairo" : "IBM Plex Mono", weight: ar ? 600 : 400 },
          maxWidth: g.QUOTE_MEASURE,
          minSize: captionSize(lang, 10), maxSize: captionSize(lang, 15), maxLines: 1, lineHeightRatio: 1.2,
        });
        return <text x={xS} y={g.SAFE_Y1 - 14} fill={T.paperFaint} fontFamily={captionFontFamily(lang)} fontSize={capFit.size} fontWeight={captionWeight(lang, 400)} letterSpacing={captionTrack(lang, "0.28em")} textAnchor={anchor} direction={ar ? "rtl" : "ltr"}>{capFit.lines[0] || cap}</text>;
      })()}
      <AuraMark lang={lang} color={T.paperFaint} geom={g} />
    </SvgRoot>
  );
}