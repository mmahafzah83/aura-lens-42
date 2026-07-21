import {
  AuraMark,
  MONO,
  PhotoPlaceholder,
  QUOTE_MEASURE,
  RendererProps,
  SAFE_X0,
  SAFE_X1,
  SAFE_Y0,
  SAFE_Y1,
  SERIF,
  SvgRoot,
  T,
  TextBlock,
  anchorStart,
  isAr,
  moodColor,
  xStart,
} from "./shared";
import { fitText } from "../fitText";

/**
 * SignatureCard — bone paper. Photo panel top ~66%, band below with
 * two descriptor lines (ink + mood italic) and name/firm in mono.
 */
export default function SignatureCard(props: RendererProps) {
  const { lang, mood, photoUrl, name, title, lines, meta } = props;
  const ar = isAr(lang);
  const accent = moodColor(mood);

  const photoH = Math.round((SAFE_Y1 - SAFE_Y0) * 0.66);
  const photoY = SAFE_Y0;
  const bandY = photoY + photoH + 40;

  const anchor = anchorStart(lang);
  const xS = xStart(lang);
  const line1 = lines[0] || "";
  const line2 = lines[1] || "";

  const nameFit = fitText(name, {
    font: { family: MONO, weight: 600 },
    maxWidth: QUOTE_MEASURE,
    minSize: 22,
    maxSize: 34,
    maxLines: 1,
    lineHeightRatio: 1.2,
  });

  const clipId = `sig-photo-${mood}`;

  return (
    <SvgRoot ariaLabel={`Signature card for ${name}`}>
      <rect x="0" y="0" width="1080" height="1350" fill={T.paper} />
      <defs>
        <clipPath id={clipId}>
          <rect x={SAFE_X0} y={photoY} width={SAFE_X1 - SAFE_X0} height={photoH} />
        </clipPath>
      </defs>
      {photoUrl ? (
        <image
          href={photoUrl}
          x={SAFE_X0}
          y={photoY}
          width={SAFE_X1 - SAFE_X0}
          height={photoH}
          preserveAspectRatio="xMidYMid slice"
          clipPath={`url(#${clipId})`}
        />
      ) : (
        <PhotoPlaceholder
          x={SAFE_X0}
          y={photoY}
          w={SAFE_X1 - SAFE_X0}
          h={photoH}
          tone="paper"
        />
      )}
      <line
        x1={SAFE_X0}
        y1={photoY + photoH + 14}
        x2={SAFE_X1}
        y2={photoY + photoH + 14}
        stroke={T.rule}
        strokeWidth="1"
      />
      {line1 && (
        <text
          x={xS}
          y={bandY + 32}
          fill={T.ink}
          fontFamily={ar ? "Cairo" : SERIF}
          fontSize="34"
          textAnchor={anchor}
          direction={ar ? "rtl" : "ltr"}
        >
          {line1}
        </text>
      )}
      {line2 && (
        <text
          x={xS}
          y={bandY + 78}
          fill={accent}
          fontFamily={ar ? "Cairo" : SERIF}
          fontSize="26"
          fontStyle={ar ? "normal" : "italic"}
          textAnchor={anchor}
          direction={ar ? "rtl" : "ltr"}
        >
          {line2}
        </text>
      )}
      <TextBlock
        lines={nameFit.lines}
        x={xS}
        y={SAFE_Y1 - 44}
        lineHeight={nameFit.lineHeight}
        fill={T.ink}
        fontFamily={MONO}
        fontSize={nameFit.size}
        fontWeight={600}
        anchor={anchor}
        lang={lang}
        letterSpacing="0.16em"
      />
      {(title || meta) && (
        <text
          x={xS}
          y={SAFE_Y1 - 16}
          fill={T.ink2}
          fontFamily={MONO}
          fontSize="16"
          letterSpacing="0.28em"
          textAnchor={anchor}
          direction={ar ? "rtl" : "ltr"}
        >
          {[title, meta].filter(Boolean).join(" · ").toUpperCase()}
        </text>
      )}
      <AuraMark lang={lang} color={T.ink2} />
    </SvgRoot>
  );
}