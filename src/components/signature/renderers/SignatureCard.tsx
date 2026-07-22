import {
  AuraMark,
  MONO,
  RendererProps,
  SERIF,
  SvgRoot,
  T,
  TextBlock,
  anchorStart,
  capsText,
  captionFontFamily,
  captionSize,
  captionTrack,
  captionWeight,
  getGeometry,
  isAr,
  xStart,
  SPACE,
  snapToScale,
  TYPE_SCALE,
} from "./shared";
import { fitText } from "../fitText";

/**
 * The Portrait — full-bleed photo + solid bottom band + gradient spine.
 * Modeled on editorial people-cards (EY Laurent).
 */
export default function SignatureCard(props: RendererProps & { square?: boolean }) {
  const { lang, mood, photoUrl, name, title, lines, meta, square } = props;
  const ar = isAr(lang);
  const g = getGeometry(square);
  const anchor = anchorStart(lang);
  const xS = xStart(lang, g);

  // Band: bottom 30% of canvas.
  const bandY = Math.round(g.H * 0.70);      // 1350 → 945
  const bandH = g.H - bandY;
  const bandPadTop = SPACE.xl;                                             // 48 (was 44)
  const bandContentW = g.SAFE_X1 - g.SAFE_X0;

  const line1 = lines[0] || "";
  const line2 = lines[1] || "";

  // NAME — large.
  const nameFit = fitText(name, {
    font: { family: ar ? "Cairo" : SERIF, weight: 600 },
    maxWidth: bandContentW * 0.68, // reserve the opposite side for AuraMark
    minSize: 44, maxSize: 64, maxLines: 1, lineHeightRatio: 1.1,
  });

  // TITLE + META — mono all-caps (EN); Cairo untracked (AR).
  const captionRaw = [title, meta].filter(Boolean).join(" · ");
  const captionText = capsText(captionRaw, lang);
  let captionFit = fitText(captionText, {
    font: { family: ar ? "Cairo" : MONO, weight: ar ? 600 : 400 },
    maxWidth: bandContentW,
    minSize: 12, maxSize: 16, maxLines: 1, lineHeightRatio: 1.3,
  });

  // Law 6 — two-step hierarchy: name must be ≥2 ladder steps above caption.
  const idxOf = (s: number) => TYPE_SCALE.indexOf(snapToScale(s));
  if (idxOf(nameFit.size) - idxOf(captionFit.size) < 2) {
    const targetIdx = Math.max(0, idxOf(nameFit.size) - 2);
    const target = TYPE_SCALE[targetIdx];
    if (target < captionFit.size) {
      captionFit = fitText(captionText, {
        font: { family: ar ? "Cairo" : MONO, weight: ar ? 600 : 400 },
        maxWidth: bandContentW,
        minSize: 12, maxSize: target, maxLines: 1, lineHeightRatio: 1.3,
      });
    }
  }

  // Layout rows (top-of-glyph baselines computed from bandY).
  const nameBaselineY = bandY + bandPadTop + nameFit.size;                 // baseline of the single-line name
  const titleY = nameBaselineY + SPACE.s + captionFit.size;                // 16px gap after name descender
  const spineY = titleY + SPACE.m;                                         // 24px below title baseline
  const spineH = 4;

  // DESCRIPTOR — fit; if the 2-line block + optional line2 won't fit,
  // drop line2 rather than overflow the band.
  const descTop = spineY + spineH + SPACE.l;                               // 32px below spine
  const bandBottom = g.H;
  const bandBottomPad = SPACE.xl;                                          // 48
  const available = bandBottom - bandBottomPad - descTop;

  const descFont = { family: ar ? "Cairo" : SERIF, weight: (ar ? 600 : 500) as number, style: "normal" as const };
  const descLHR = ar ? 1.8 : 1.45;

  // Try 2 lines first with a line2, then 2 lines w/o line2, then 1 line.
  let line1Fit = fitText(line1, {
    font: descFont, maxWidth: bandContentW,
    minSize: 20, maxSize: 32, maxLines: 2, lineHeightRatio: descLHR,
  });
  const line2FontFamily = ar ? "Cairo" : SERIF;
  let line2Fit = line2 ? fitText(line2, {
    font: { family: line2FontFamily, weight: 400, style: ar ? "normal" : "italic" },
    maxWidth: bandContentW,
    minSize: 16, maxSize: 20, maxLines: 1, lineHeightRatio: ar ? 1.8 : 1.3,
  }) : null;

  const line1BlockH = () => line1Fit.lines.length * line1Fit.lineHeight;
  const line2BlockH = () => (line2Fit ? line2Fit.lineHeight + SPACE.s : 0); // 16px gap
  let totalH = line1BlockH() + line2BlockH();
  if (totalH > available && line2Fit) {
    // Drop line2 rather than overflow.
    line2Fit = null;
    totalH = line1BlockH();
  }
  if (totalH > available) {
    // Force 1 line at min size for descriptor.
    line1Fit = fitText(line1, {
      font: descFont, maxWidth: bandContentW,
      minSize: 20, maxSize: 24, maxLines: 1, lineHeightRatio: descLHR,
    });
  }

  const line1Y = descTop + line1Fit.size;
  const line2Y = line2Fit ? line1Y + line1BlockH() - line1Fit.size + SPACE.s + line2Fit.size : 0;

  // Gradient stops keyed by mood.
  const gradId = `portrait-spine-${mood}${square ? "-sq" : ""}${ar ? "-ar" : ""}`;
  const stops: string[] =
    mood === "teal"    ? ["#36C5B0", "#D6A748", "#6E2A26"] :
    mood === "amber"   ? ["#D6A748", "#F0C97A", "#36C5B0"] :
                         ["#6E2A26", "#D6A748", "#36C5B0"]; // oxblood default

  // AuraMark placed on the name row (inline-end). We pass a modified geom
  // where SAFE_Y1 sits at the name baseline+padding so the mark lines up.
  const markGeom = { ...g, SAFE_Y1: nameBaselineY + 8 };

  const placeholderId = `portrait-photo-ph-${mood}${square ? "-sq" : ""}${ar ? "-ar" : ""}`;

  return (
    <SvgRoot ariaLabel={`Portrait card for ${name}`} geom={g}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={stops[0]} />
          <stop offset="0.5" stopColor={stops[1]} />
          <stop offset="1" stopColor={stops[2]} />
        </linearGradient>
        <linearGradient id={placeholderId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={T.darkBg1} />
          <stop offset="1" stopColor={T.darkBg2} />
        </linearGradient>
      </defs>

      {/* LAYER 1 — full-bleed photo */}
      {photoUrl ? (
        <image href={photoUrl} x={0} y={0} width={g.W} height={g.H} preserveAspectRatio="xMidYMid slice" />
      ) : (
        <rect x={0} y={0} width={g.W} height={g.H} fill={`url(#${placeholderId})`} />
      )}

      {/* LAYER 2 — solid bottom band */}
      <rect x={0} y={bandY} width={g.W} height={bandH} fill={T.panel} />

      {/* NAME */}
      <TextBlock
        lines={nameFit.lines}
        x={xS}
        y={nameBaselineY}
        lineHeight={nameFit.lineHeight}
        fill={T.paper}
        fontFamily={ar ? "Cairo" : SERIF}
        fontSize={nameFit.size}
        fontWeight={600}
        anchor={anchor}
        lang={lang}
      />

      {/* AuraMark on the name row, opposite edge */}
      <AuraMark lang={lang} color={T.paperFaint} geom={markGeom} />

      {/* TITLE + META */}
      {captionText && (
        <TextBlock
          lines={[captionFit.lines[0] || captionText]}
          x={xS}
          y={titleY}
          lineHeight={captionFit.lineHeight}
          fill={T.paperFaint}
          fontFamily={captionFontFamily(lang)}
          fontSize={captionFit.size}
          fontWeight={captionWeight(lang, 400)}
          letterSpacing={captionTrack(lang, "0.18em")}
          anchor={anchor}
          lang={lang}
        />
      )}

      {/* GRADIENT SPINE */}
      <rect
        x={g.SAFE_X0}
        y={spineY}
        width={bandContentW}
        height={spineH}
        rx={spineH / 2}
        ry={spineH / 2}
        fill={`url(#${gradId})`}
      />

      {/* DESCRIPTOR line1 */}
      {line1 && (
        <TextBlock
          lines={line1Fit.lines}
          x={xS}
          y={line1Y}
          lineHeight={line1Fit.lineHeight}
          fill={T.paper}
          fontFamily={ar ? "Cairo" : SERIF}
          fontSize={line1Fit.size}
          fontWeight={ar ? 600 : 500}
          anchor={anchor}
          lang={lang}
        />
      )}

      {/* DESCRIPTOR line2 */}
      {line2Fit && (
        <TextBlock
          lines={line2Fit.lines}
          x={xS}
          y={line2Y}
          lineHeight={line2Fit.lineHeight}
          fill={T.paperFaint}
          fontFamily={line2FontFamily}
          fontSize={line2Fit.size}
          fontStyle={ar ? "normal" : "italic"}
          fontWeight={400}
          anchor={anchor}
          lang={lang}
        />
      )}

    </SvgRoot>
  );
}