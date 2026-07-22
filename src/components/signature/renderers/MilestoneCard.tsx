import {
  AuraMark, MONO, RendererProps, SERIF, SvgRoot, T, TextBlock,
  anchorStart, capsText, captionFontFamily, captionSize, captionTrack, captionWeight,
  getGeometry, isAr, moodColor, moodWashRGBA, xStart,
  SPACE,
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
    minSize: 24, maxSize: square ? 40 : 48, maxLines: 2,
    lineHeightRatio: ar ? 1.8 : 1.45,
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
        <TextBlock lines={[capsText(insideLabel, lang)]} x={cx} y={cy + r * 0.5} lineHeight={captionSize(lang, 20) * 1.3} fill={accent} fontFamily={captionFontFamily(lang)} fontSize={captionSize(lang, 20)} fontWeight={captionWeight(lang, 400)} letterSpacing={captionTrack(lang, "0.32em")} anchor="middle" lang={lang} />
      )}
      <TextBlock lines={messageFit.lines} x={cx} y={cy + r + SPACE.xl * 2} lineHeight={messageFit.lineHeight} fill={T.paper} fontFamily={ar ? "Cairo" : SERIF} fontSize={messageFit.size} fontStyle={ar ? "normal" : "italic"} fontWeight={500} anchor="middle" lang={lang} />
      {(() => {
        const nameText = capsText(name, lang);
        const nameFit = fitText(nameText, {
          font: { family: ar ? "Cairo" : "IBM Plex Mono", weight: 600 },
          maxWidth: g.QUOTE_MEASURE,
          minSize: captionSize(lang, 12), maxSize: captionSize(lang, 20), maxLines: 1, lineHeightRatio: 1.3,
        });
        return <TextBlock lines={[nameFit.lines[0] || nameText]} x={xS} y={g.SAFE_Y1 - SPACE.xl} lineHeight={nameFit.lineHeight} fill={T.paper} fontFamily={captionFontFamily(lang)} fontSize={nameFit.size} fontWeight={captionWeight(lang, 600)} letterSpacing={captionTrack(lang, "0.24em")} anchor={anchor} lang={lang} />;
      })()}
      {meta && (() => {
        const cap = capsText(meta, lang);
        const capFit = fitText(cap, {
          font: { family: ar ? "Cairo" : "IBM Plex Mono", weight: ar ? 600 : 400 },
          maxWidth: g.QUOTE_MEASURE,
          minSize: captionSize(lang, 12), maxSize: captionSize(lang, 16), maxLines: 1, lineHeightRatio: 1.3,
        });
        return <TextBlock lines={[capFit.lines[0] || cap]} x={xS} y={g.SAFE_Y1 - SPACE.s} lineHeight={capFit.lineHeight} fill={T.paperFaint} fontFamily={captionFontFamily(lang)} fontSize={capFit.size} fontWeight={captionWeight(lang, 400)} letterSpacing={captionTrack(lang, "0.24em")} anchor={anchor} lang={lang} />;
      })()}
      <AuraMark lang={lang} color={T.paperFaint} geom={g} />
    </SvgRoot>
  );
}