import {
  ARABIC, AuraMark, EmphasisTextBlock, MONO, PhotoPlaceholder, RendererProps, SERIF, SvgRoot, T,
  anchorStart, capsText, captionFontFamily, captionSize, captionTrack, captionWeight,
  emphasisColorFor, getGeometry, isAr, moodColor, pickQuoteFont, xStart,
  SPACE, RADII,
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
  const decision = props.decision ?? (ar ? DEFAULT_AR : DEFAULT_EN);
  const emphasis = emphasisOff ? [] : (decision.emphasis || []);
  const useInk = decision.textColor === "ink" && decision.scrim === "none";
  const textFill = useInk ? T.ink : T.paper;
  const accent = emphasisColorFor(decision.textColor, decision.scrim, mood);

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
    minSize: ar ? 24 : 32,
    maxSize: ar ? 40 : 48,
    maxLines: 3,
    lineHeightRatio: ar ? 1.8 : 1.45,
  });
  const lineH = fit.size * (ar ? 1.8 : 1.45);
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
  const topY = isUpper ? g.SAFE_Y0 + SPACE.xl : Math.max(g.SAFE_Y0 + SPACE.xl, bandTop - SPACE.xl - blockH);
  const firstBaselineY = topY + fit.size;

  // Scrim behind the quote block (never full-canvas).
  const scrimAlpha = decision.scrim === "strong" ? 0.55 : decision.scrim === "soft" ? 0.35 : 0;
  const scrimPad = SPACE.l;
  const scrimW = measureWidth + scrimPad * 2;
  const scrimX = visualLeft ? g.SAFE_X0 - scrimPad : g.SAFE_X1 - measureWidth - scrimPad;
  const scrimY = topY - scrimPad;
  const scrimH = blockH + scrimPad * 2;
  const isLower = decision.textZone.startsWith("lower");
  const scrimGradId = `frame-scrim-grad-${mood}-${decision.textZone}`;

  // Multi-color gradient spine — mood becomes leftmost stop for character.
  const gradId = `frame-spine-${mood}`;
  const spineStops =
    mood === "teal"   ? ["#36C5B0", "#D6A748", "#6E2A26"] :
    mood === "amber"  ? ["#D6A748", "#F0C97A", "#36C5B0"] :
                        ["#6E2A26", "#D6A748", "#36C5B0"];

  // Text-shadow filter id — one per card instance so multiple frames on the
  // same page don't collide. Used for the quote group only when text sits
  // over the photo (i.e. NOT in the ink-on-bright variant, where a dark
  // shadow on dark text would create the exact ghost we're avoiding).
  const shadowFilterId = `frame-text-shadow-${mood}-${decision.textZone}`;

  // Name plate content
  const nameFit = fitText(name, {
    font: { family: ar ? "Cairo" : "Newsreader", weight: 600 },
    maxWidth: g.CONTENT_W - 120,
    minSize: 24, maxSize: 40, maxLines: 1, lineHeightRatio: 1.1,
  });
  const nameXStart = xStart(lang, g);
  const nameY = bandTop + SPACE.xl + SPACE.s;
  const titleY = nameY + SPACE.m;
  const titleRaw = [title, meta].filter(Boolean).join(" · ");
  const titleText = capsText(titleRaw, lang);
  const titleFit = fitText(titleText, {
    font: { family: ar ? "Cairo" : "IBM Plex Mono", weight: ar ? 600 : 400 },
    maxWidth: g.CONTENT_W - 120,
    minSize: 12, maxSize: 16, maxLines: 1, lineHeightRatio: 1.3,
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
        {isLower && scrimAlpha > 0 && (
          <linearGradient id={scrimGradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={`rgba(5,8,12,0)`} />
            <stop offset="0.55" stopColor={`rgba(5,8,12,${scrimAlpha * 0.6})`} />
            <stop offset="1" stopColor={`rgba(5,8,12,${scrimAlpha})`} />
          </linearGradient>
        )}
        {/* Subtle drop-shadow filter — reads as depth, not a second copy of
            the letters. Replaces the earlier duplicate-text approach that
            produced a visible ghost on busy photos. */}
        {!useInk && (
          <filter
            id={shadowFilterId}
            x="-10%"
            y="-10%"
            width="120%"
            height="120%"
            filterUnits="objectBoundingBox"
          >
            <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#000000" floodOpacity="0.45" />
          </filter>
        )}
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

      {/* Layer 2: feathered scrim — 3-layer stacked-alpha, export-safe.
          Lower zones get a subtle vertical fade instead of a slab. */}
      {scrimAlpha > 0 && !isLower && (
        <g>
          <rect
            x={scrimX - SPACE.m} y={scrimY - SPACE.m}
            width={scrimW + SPACE.m * 2} height={scrimH + SPACE.m * 2}
            rx={RADII.l}
            fill={`rgba(5,8,12,${scrimAlpha * 0.15})`}
          />
          <rect
            x={scrimX - SPACE.xs} y={scrimY - SPACE.xs}
            width={scrimW + SPACE.xs * 2} height={scrimH + SPACE.xs * 2}
            rx={Math.max(4, RADII.l - SPACE.xs)}
            fill={`rgba(5,8,12,${scrimAlpha * 0.35})`}
          />
          <rect
            x={scrimX} y={scrimY}
            width={scrimW} height={scrimH}
            rx={RADII.s}
            fill={`rgba(5,8,12,${scrimAlpha * 0.75})`}
          />
        </g>
      )}
      {scrimAlpha > 0 && isLower && (
        <rect
          x={scrimX - SPACE.xs} y={scrimY - SPACE.xs}
          width={scrimW + SPACE.xs * 2} height={scrimH + SPACE.xs * 2 + SPACE.xl}
          rx={RADII.m}
          fill={`url(#${scrimGradId})`}
        />
      )}

      {/* Layer 3: quote — a single glyph pass with a soft SVG drop shadow
          for legibility over photos. No duplicate text layer (no ghost). */}
      <g filter={!useInk ? `url(#${shadowFilterId})` : undefined}>
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
      </g>

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
          fontFamily={captionFontFamily(lang)}
          fontSize={titleFit.size}
          letterSpacing={captionTrack(lang, "0.22em")}
          fontWeight={captionWeight(lang, 400)}
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