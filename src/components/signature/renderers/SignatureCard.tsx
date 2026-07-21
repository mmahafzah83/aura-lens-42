import {
  AuraMark,
  MONO,
  PhotoPlaceholder,
  RendererProps,
  SERIF,
  SvgRoot,
  T,
  TextBlock,
  anchorStart,
  getGeometry,
  isAr,
  moodColor,
  xStart,
} from "./shared";
import { fitText } from "../fitText";

export default function SignatureCard(props: RendererProps & { square?: boolean }) {
  const { lang, mood, photoUrl, name, title, lines, meta, square } = props;
  const ar = isAr(lang);
  const accent = moodColor(mood);
  const g = getGeometry(square);
  const photoH = Math.round((g.SAFE_Y1 - g.SAFE_Y0) * 0.62);
  const photoY = g.SAFE_Y0;
  const bandY = photoY + photoH + 40;
  const anchor = anchorStart(lang);
  const xS = xStart(lang, g);
  const line1 = lines[0] || "";
  const line2 = lines[1] || "";
  const line1Fit = fitText(line1, {
    font: { family: ar ? "Cairo" : SERIF, weight: 500, style: ar ? "normal" : "italic" },
    maxWidth: g.QUOTE_MEASURE,
    minSize: 22, maxSize: 32, maxLines: 2,
    lineHeightRatio: ar ? 1.6 : 1.2,
  });
  const line2Fit = fitText(line2, {
    font: { family: ar ? "Cairo" : SERIF, weight: 400, style: ar ? "normal" : "italic" },
    maxWidth: g.QUOTE_MEASURE,
    minSize: 16, maxSize: 24, maxLines: 2,
    lineHeightRatio: ar ? 1.6 : 1.2,
  });
  const nameFit = fitText(name, {
    font: { family: MONO, weight: 600 },
    maxWidth: g.QUOTE_MEASURE,
    minSize: 18, maxSize: 30, maxLines: 1, lineHeightRatio: 1.2,
  });
  const captionText = [title, meta].filter(Boolean).join(" · ").toUpperCase();
  const captionFit = fitText(captionText, {
    font: { family: MONO, weight: 400 },
    maxWidth: g.QUOTE_MEASURE,
    minSize: 11, maxSize: 16, maxLines: 1, lineHeightRatio: 1.2,
  });
  const clipId = `sig-photo-${mood}${square ? "-sq" : ""}`;
  const line1Y = bandY + line1Fit.size;
  const line1Block = line1Fit.lines.length * line1Fit.lineHeight;
  const line2Y = line1Y + line1Block - line1Fit.size + 20 + line2Fit.size;
  return (
    <SvgRoot ariaLabel={`Signature card for ${name}`} geom={g}>
      <rect x="0" y="0" width={g.W} height={g.H} fill={T.paper} />
      <defs>
        <clipPath id={clipId}>
          <rect x={g.SAFE_X0} y={photoY} width={g.SAFE_X1 - g.SAFE_X0} height={photoH} />
        </clipPath>
      </defs>
      {photoUrl ? (
        <image href={photoUrl} x={g.SAFE_X0} y={photoY} width={g.SAFE_X1 - g.SAFE_X0} height={photoH} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clipId})`} />
      ) : (
        <PhotoPlaceholder x={g.SAFE_X0} y={photoY} w={g.SAFE_X1 - g.SAFE_X0} h={photoH} tone="paper" />
      )}
      <line x1={g.SAFE_X0} y1={photoY + photoH + 14} x2={g.SAFE_X1} y2={photoY + photoH + 14} stroke={T.rule} strokeWidth="1" />
      {line1 && (
        <TextBlock lines={line1Fit.lines} x={xS} y={line1Y} lineHeight={line1Fit.lineHeight}
          fill={T.ink} fontFamily={ar ? "Cairo" : SERIF} fontSize={line1Fit.size}
          fontStyle={ar ? "normal" : "italic"} fontWeight={500} anchor={anchor} lang={lang} />
      )}
      {line2 && (
        <TextBlock lines={line2Fit.lines} x={xS} y={line2Y} lineHeight={line2Fit.lineHeight}
          fill={accent} fontFamily={ar ? "Cairo" : SERIF} fontSize={line2Fit.size}
          fontStyle={ar ? "normal" : "italic"} fontWeight={400} anchor={anchor} lang={lang} />
      )}
      <TextBlock lines={nameFit.lines} x={xS} y={g.SAFE_Y1 - 44} lineHeight={nameFit.lineHeight} fill={T.ink} fontFamily={MONO} fontSize={nameFit.size} fontWeight={600} anchor={anchor} lang={lang} letterSpacing="0.16em" />
      {(title || meta) && (
        <text x={xS} y={g.SAFE_Y1 - 16} fill={T.ink2} fontFamily={MONO} fontSize={captionFit.size} letterSpacing="0.28em" textAnchor={anchor} direction={ar ? "rtl" : "ltr"}>{captionFit.lines[0] || captionText}</text>
      )}
      <AuraMark lang={lang} color={T.ink2} geom={g} />
    </SvgRoot>
  );
}