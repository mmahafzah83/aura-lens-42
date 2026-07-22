import {
  ARABIC, AuraMark, EmphasisTextBlock, MONO, PhotoPlaceholder, RendererProps, SERIF, SvgRoot, T,
  anchorStart, getGeometry, isAr, moodColor, pickQuoteFont, xStart,
} from "./shared";
import { fitText } from "../fitText";

export type FrameZone =
  | "upper-left" | "upper-right" | "lower-left" | "lower-right";

export interface FrameDecision {
  textZone: FrameZone;
  scrim: "none" | "soft" | "strong";
  cropFocusY: number; // 0..1
  emphasis: { phrase: string; style: "color" | "bold" }[];
  /** Optional dark-on-bright variant. 'ink' only valid when scrim === 'none'. */
  textColor?: "paper" | "ink";
}

const DEFAULT_EN: FrameDecision = {
  textZone: "upper-left", scrim: "strong", cropFocusY: 0.5, emphasis: [],
};
const DEFAULT_AR: FrameDecision = {
  textZone: "upper-right", scrim: "strong", cropFocusY: 0.5, emphasis: [],
};

export default function FrameCard(
  props: RendererProps & { decision?: FrameDecision; emphasisOff?: boolean },
) {
  const { lang, mood, photoUrl, name, title, lines, meta, emphasisOff } = props;
  const ar = isAr(lang);
  const g = getGeometry(false);
  const accent = moodColor(mood);
  const decision = props.decision ?? (ar ? DEFAULT_AR : DEFAULT_EN);
  const emphasis = emphasisOff ? [] : (decision.emphasis || []);
  const useInk = decision.textColor === "ink" && decision.scrim === "none";
  const textFill = useInk ? T.ink : T.paper;

  // Name plate band — bottom 14%
  const bandH = Math.round(g.H * 0.14);
  const bandTop = g.H - bandH;

  // cropFocusY → preserveAspectRatio alignment (simple three-band mapping).
  const par =
    decision.cropFocusY < 0.35 ? "xMidYMin slice" :
    decision.cropFocusY > 0.65 ? "xMidYMax slice" :
                                 "xMidYMid slice";

  // Quote fit (measured at base weight; shrink maxWidth when emphasized
  // to leave room for bolded segments).
  const quote = lines[0] || "";
  const font = pickQuoteFont(lang, ar);
  const measureWidth = Math.round(g.QUOTE_MEASURE * (emphasis.length ? 0.96 : 1));
  const fit = fitText(quote, {
    font: { family: ar ? "Cairo" : "Newsreader", weight: ar ? 700 : 500, style: ar ? "normal" : "italic" },
    maxWidth: measureWidth,
    minSize: ar ? 26 : 30,
    maxSize: ar ? 38 : 44,
    maxLines: 3,
    lineHeightRatio: ar ? 1.8 : 1.3,
  });
  const lineH = fit.size * (ar ? 1.8 : 1.3);
  const blockH = Math.round(fit.lines.length * lineH);

  // Zone → visual anchor (visual left/right, not lang-flipped).
  const visualLeft = decision.textZone.endsWith("left");
  const isUpper = decision.textZone.startsWith("upper");
  // In SVG with direction=rtl, text-anchor "start" places x at the visual
  // right edge (inline-start) and "end" at the visual left edge. So the
  // LTR anchor must flip for AR to honor the *visual* zone.
  const quoteAnchor: "start" | "end" = ar
    ? (visualLeft ? "end" : "start")
    : (visualLeft ? "start" : "end");
  const xText = visualLeft ? g.SAFE_X0 : g.SAFE_X1;
  const topY = isUpper ? g.SAFE_Y0 + 40 : Math.max(g.SAFE_Y0 + 40, bandTop - 40 - blockH);
  const firstBaselineY = topY + fit.size;

  // Scrim behind the quote block (never full-canvas).
  const scrimAlpha = decision.scrim === "strong" ? 0.55 : decision.scrim === "soft" ? 0.35 : 0;
  const scrimPad = 28;
  const scrimW = measureWidth + scrimPad * 2;
  const scrimX = visualLeft ? g.SAFE_X0 - scrimPad : g.SAFE_X1 - measureWidth - scrimPad;
  const scrimY = topY - scrimPad;
  const scrimH = blockH + scrimPad * 2;

  // Multi-color gradient spine — mood becomes leftmost stop for character.
  const gradId = `frame-spine-${mood}`;
  const spineStops =
    mood === "teal"   ? ["#36C5B0", "#D6A748", "#6E2A26"] :
    mood === "amber"  ? ["#D6A748", "#F0C97A", "#36C5B0"] :
                        ["#6E2A26", "#D6A748", "#36C5B0"];

  // Name plate content
  const nameFit = fitText(name, {
    font: { family: ar ? "Cairo" : "Newsreader", weight: 600 },
    maxWidth: g.CONTENT_W - 120,
    minSize: 28, maxSize: 38, maxLines: 1, lineHeightRatio: 1.1,
  });
  const nameXStart = xStart(lang, g);
  const nameY = bandTop + 60;
  const titleY = nameY + 24;
  const titleText = [title, meta].filter(Boolean).join(" · ").toUpperCase();
  const titleFit = fitText(titleText, {
    font: { family: "IBM Plex Mono", weight: 400 },
    maxWidth: g.CONTENT_W - 120,
    minSize: 11, maxSize: 14, maxLines: 1, lineHeightRatio: 1.2,
  });
  // Shift AuraMark up into the band, aligned to the name row.
  const auraDy = Math.round(bandTop + bandH / 2 - g.SAFE_Y1);

  return (
    <SvgRoot ariaLabel={`Frame: ${quote}`} geom={g}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={spineStops[0]} />
          <stop offset="0.5" stopColor={spineStops[1]} />
          <stop offset="1" stopColor={spineStops[2]} />
        </linearGradient>
      </defs>

      {/* Layer 1: full-bleed photo */}
      {photoUrl ? (
        <image href={photoUrl} x="0" y="0" width={g.W} height={g.H} preserveAspectRatio={par} />
      ) : (
        <>
          <rect x="0" y="0" width={g.W} height={g.H} fill={T.darkBg1} />
          <PhotoPlaceholder x={0} y={0} w={g.W} h={g.H} tone="dark" />
        </>
      )}

      {/* Layer 2: scrim behind quote text only */}
      {scrimAlpha > 0 && (
        <>
          <rect
            x={scrimX - 10} y={scrimY - 10}
            width={scrimW + 20} height={scrimH + 20}
            rx="20"
            fill={`rgba(5,8,12,${scrimAlpha * 0.45})`}
          />
          <rect
            x={scrimX} y={scrimY}
            width={scrimW} height={scrimH}
            rx="14"
            fill={`rgba(5,8,12,${scrimAlpha})`}
          />
        </>
      )}

      {/* Layer 3: quote with emphasis */}
      <EmphasisTextBlock
        lines={fit.lines}
        x={xText}
        y={firstBaselineY}
        lineHeight={lineH}
        fill={textFill}
        fontFamily={font.family}
        fontSize={fit.size}
        fontStyle={font.style}
        fontWeight={font.weight}
        anchor={quoteAnchor}
        lang={lang}
        letterSpacing={ar ? "0" : "-0.005em"}
        emphasis={emphasis}
        accentColor={accent}
      />

      {/* Layer 4: gradient spine on band top edge */}
      <rect
        x={g.SAFE_X0}
        y={bandTop - 2}
        width={g.CONTENT_W}
        height="4"
        rx="2"
        fill={`url(#${gradId})`}
      />

      {/* Layer 5: solid name plate */}
      <rect x="0" y={bandTop} width={g.W} height={bandH} fill={T.panel} />

      {/* Layer 6: name */}
      <text
        x={nameXStart}
        y={nameY}
        fill={T.paper}
        fontFamily={ar ? ARABIC : SERIF}
        fontSize={nameFit.size}
        fontWeight={600}
        textAnchor={anchorStart(lang)}
        direction={ar ? "rtl" : "ltr"}
      >
        {nameFit.lines[0] || name}
      </text>

      {/* Layer 7: title/meta caps */}
      {titleText && (
        <text
          x={nameXStart}
          y={titleY}
          fill={T.paperFaint}
          fontFamily={MONO}
          fontSize={titleFit.size}
          letterSpacing="0.22em"
          textAnchor={anchorStart(lang)}
          direction={ar ? "rtl" : "ltr"}
        >
          {titleFit.lines[0] || titleText}
        </text>
      )}

      {/* Layer 8: AuraMark inline-end, shifted into the band */}
      <g transform={`translate(0, ${auraDy})`}>
        <AuraMark lang={lang} color={T.paperFaint} geom={g} />
      </g>
    </SvgRoot>
  );
}