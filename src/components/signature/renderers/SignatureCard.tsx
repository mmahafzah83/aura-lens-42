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
  const nameFit = fitText(name, {
    font: { family: MONO, weight: 600 },
    maxWidth: g.QUOTE_MEASURE,
    minSize: 22, maxSize: 34, maxLines: 1, lineHeightRatio: 1.2,
  });
  const clipId = `sig-photo-${mood}${square ? "-sq" : ""}`;
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
        <text x={xS} y={bandY + 32} fill={T.ink} fontFamily={ar ? "Cairo" : SERIF} fontSize="32" textAnchor={anchor} direction={ar ? "rtl" : "ltr"}>{line1}</text>
      )}
      {line2 && (
        <text x={xS} y={bandY + 76} fill={accent} fontFamily={ar ? "Cairo" : SERIF} fontSize="24" fontStyle={ar ? "normal" : "italic"} textAnchor={anchor} direction={ar ? "rtl" : "ltr"}>{line2}</text>
      )}
      <TextBlock lines={nameFit.lines} x={xS} y={g.SAFE_Y1 - 44} lineHeight={nameFit.lineHeight} fill={T.ink} fontFamily={MONO} fontSize={nameFit.size} fontWeight={600} anchor={anchor} lang={lang} letterSpacing="0.16em" />
      {(title || meta) && (
        <text x={xS} y={g.SAFE_Y1 - 16} fill={T.ink2} fontFamily={MONO} fontSize="16" letterSpacing="0.28em" textAnchor={anchor} direction={ar ? "rtl" : "ltr"}>{[title, meta].filter(Boolean).join(" · ").toUpperCase()}</text>
      )}
      <AuraMark lang={lang} color={T.ink2} geom={g} />
    </SvgRoot>
  );
}