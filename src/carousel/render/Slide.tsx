/**
 * The renderer. One component, nine archetypes, one mirrored layout.
 *
 * RULE A — no CSS custom properties anywhere in this subtree. html2canvas
 * cannot read them from inside its iframe, so every colour arrives as an
 * inline literal from the theme object.
 * RULE B — no network fonts. Everything resolves to a bundled face declared
 * in fonts.css.
 */
import React, { useRef } from "react";
import "./fonts.css";
import {
  plainText,
  type DeckIR,
  type HeroLine,
  type Run,
  type Slide as SlideIR,
  type TextNode,
} from "../deckIR";
import { getTheme, type Theme, type ThemeName } from "./themes";
import { useFitLadder, type FitState } from "./useFitLadder";

/* ------------------------------------------------------------------ */
/* Canvas and type scale                                               */
/* ------------------------------------------------------------------ */

export const CANVAS_W = 1080;
export const CANVAS_H = 1350;
/** Outer padding never drops below this, at any fit step. */
export const PAD = 82;

const FONT_DISPLAY_EN = '"AuraAnton", Impact, "Arial Narrow", sans-serif';
const FONT_TEXT_EN = '"AuraInter", Helvetica, Arial, sans-serif';
const FONT_MONO = '"AuraMono", ui-monospace, "Courier New", monospace';
/** Anton has no Arabic. Arabic display is Cairo 900 — never a condensed face. */
const FONT_AR = '"AuraCairo", "Segoe UI", Tahoma, sans-serif';

type Lang = "en" | "ar";

function fontFor(lang: Lang, kind: "display" | "text" | "mono"): string {
  if (lang === "ar") return FONT_AR;
  if (kind === "display") return FONT_DISPLAY_EN;
  if (kind === "mono") return FONT_MONO;
  return FONT_TEXT_EN;
}

function scaleOf(s: number) {
  const px = (n: number) => `${Math.round(n * s)}px`;
  return {
    heroEn: px(150),
    heroAr: px(92),
    stat: px(270),
    h2: px(54),
    body: px(38),
    chip: px(31),
    data: px(26),
    source: px(22),
    gap: Math.round(28 * s),
  };
}

/* ------------------------------------------------------------------ */
/* Bidi-safe text                                                      */
/* ------------------------------------------------------------------ */

/**
 * Runs whose language differs from the deck's primary language are isolated.
 * This is what makes "smart meters" read left-to-right inside an Arabic
 * sentence instead of colliding with the surrounding text.
 */
function renderRuns(runs: Run[], primary: Lang, kind: "display" | "text" | "mono") {
  return runs.map((run, i) => {
    if (run.lang === primary) return <React.Fragment key={i}>{run.t}</React.Fragment>;
    return (
      <span
        key={i}
        lang={run.lang}
        dir={run.lang === "ar" ? "rtl" : "ltr"}
        style={{ unicodeBidi: "isolate", fontFamily: fontFor(run.lang, kind) }}
      >
        {run.t}
      </span>
    );
  });
}

function Txt({
  node, primary, kind = "text", style,
}: {
  node?: TextNode | null;
  primary: Lang;
  kind?: "display" | "text" | "mono";
  style?: React.CSSProperties;
}) {
  if (!node) return null;
  return <div style={style}>{renderRuns(node.runs, primary, kind)}</div>;
}

/* ------------------------------------------------------------------ */
/* Inline SVG — never an emoji as a structural icon                    */
/* ------------------------------------------------------------------ */

function LinkedInGlyph({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true" style={{ display: "block", flex: "0 0 auto" }}>
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14zM7.12 20.45H3.55V9h3.57v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.55C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.72C24 .77 23.2 0 22.22 0z" />
    </svg>
  );
}

function ReactionIcons({ theme, size }: { theme: Theme; size: number }) {
  const stroke = theme.dim;
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke, strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  return (
    // Icons only. Never a fabricated count.
    <div style={{ display: "flex", gap: Math.round(size * 1.4), alignItems: "center" }}>
      <svg {...common}><path d="M7 22V11l4-8a2 2 0 0 1 3 2l-1 5h5a2 2 0 0 1 2 2.4l-1.6 7A2 2 0 0 1 16.4 22H7z" /><path d="M7 11H4v11h3" /></svg>
      <svg {...common}><path d="M21 12a8 8 0 0 1-8 8H4l2.2-2.9A8 8 0 1 1 21 12z" /></svg>
      <svg {...common}><path d="M17 2l4 4-4 4" /><path d="M3 12V10a4 4 0 0 1 4-4h14" /><path d="M7 22l-4-4 4-4" /><path d="M21 12v2a4 4 0 0 1-4 4H3" /></svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Identity                                                            */
/* ------------------------------------------------------------------ */

function IdentityBar({ deck, theme, s }: { deck: DeckIR; theme: Theme; s: ReturnType<typeof scaleOf> }) {
  const primary = deck.primary_lang;
  const avatar = deck.profile.avatar_url;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 22, flex: "0 0 auto" }}>
      {avatar ? (
        <img
          src={avatar}
          alt=""
          style={{ width: 74, height: 74, borderRadius: 999, objectFit: "cover", flex: "0 0 auto", background: theme.neutral }}
        />
      ) : (
        // No avatar: an accent rule, never a fabricated monogram. Initials in a
        // disc read as a missing asset, and Arabic names are not idiomatically
        // abbreviated.
        <div style={{ width: 10, height: 74, borderRadius: 6, background: theme.accent, flex: "0 0 auto" }} />
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
        <Txt
          node={deck.profile.name}
          primary={primary}
          style={{ fontFamily: fontFor(primary, "text"), fontWeight: 700, fontSize: s.chip, color: theme.head, lineHeight: 1.2 }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* The glyph REPLACES the "in/" prefix. Rendering both yields "inin/handle". */}
          <LinkedInGlyph size={Math.round(parseInt(s.source, 10) * 1.1)} color={theme.dim} />
          <span style={{ fontFamily: FONT_MONO, fontSize: s.source, color: theme.dim, letterSpacing: ".02em" }} dir="ltr">
            {deck.profile.handle}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

function Chip({ node, primary, theme, s }: { node?: TextNode; primary: Lang; theme: Theme; s: ReturnType<typeof scaleOf> }) {
  if (!node) return null;
  return (
    <div
      style={{
        alignSelf: "flex-start",
        fontFamily: fontFor(primary, "text"),
        fontWeight: 700,
        fontSize: s.chip,
        color: theme.accentLight,
        textTransform: primary === "ar" ? "none" : "uppercase",
        letterSpacing: primary === "ar" ? "0" : ".08em",
        paddingInline: 22,
        paddingBlock: 10,
        borderRadius: 999,
        background: theme.panel,
        border: `1px solid ${theme.rule}`,
      }}
    >
      {renderRuns(node.runs, primary, "text")}
    </div>
  );
}

function Hero({ lines, primary, theme, s }: { lines?: HeroLine[]; primary: Lang; theme: Theme; s: ReturnType<typeof scaleOf> }) {
  if (!lines?.length) return null;
  const ar = primary === "ar";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: ar ? 8 : 2 }}>
      {lines.map((line, i) => (
        <span
          key={i}
          data-hero-line=""
          style={{
            // inline-block so offsetHeight is the real line box: an inline
            // span reports its font box instead, and the fit ladder then
            // shrinks type that never actually wrapped.
            display: "inline-block",
            fontFamily: fontFor(primary, "display"),
            fontWeight: ar ? 900 : 400,
            fontSize: ar ? s.heroAr : s.heroEn,
            // >= 1 on purpose. A line-height below 1 makes the line box
            // shorter than the glyphs, and html2canvas then draws the text
            // half a line below its own highlight block — right on screen,
            // wrong in the PDF. Same class of bug as the font-metrics race:
            // never let the export resolve a metric differently.
            lineHeight: ar ? 1.42 : 1.0,
            // Arabic is never uppercased.
            textTransform: ar ? "none" : "uppercase",
            color: line.highlight ? theme.accentInk : theme.head,
            // A highlight is a solid block behind the WHOLE line; clone keeps
            // any unavoidable wrap as even blocks rather than a staircase.
            background: line.highlight ? theme.accent : "transparent",
            boxDecorationBreak: "clone",
            WebkitBoxDecorationBreak: "clone",
            paddingInline: line.highlight ? 16 : 0,
            paddingBlock: line.highlight ? (ar ? 2 : 6) : 0,
            marginInlineStart: line.highlight ? -16 : 0,
          }}
        >
          {renderRuns(line.runs, primary, "display")}
        </span>
      ))}
    </div>
  );
}

function Body({ nodes, primary, theme, s, hideTails }: {
  nodes?: TextNode[]; primary: Lang; theme: Theme; s: ReturnType<typeof scaleOf>; hideTails: boolean;
}) {
  if (!nodes?.length) return null;
  const visible = hideTails ? nodes.filter((n) => !n.optional_tail) : nodes;
  if (!visible.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: s.gap }}>
      {visible.map((n, i) => (
        <div
          key={i}
          style={{
            fontFamily: fontFor(primary, "text"),
            fontSize: s.body,
            lineHeight: primary === "ar" ? 1.9 : 1.6,
            color: theme.fg,
            textAlign: "start",
          }}
        >
          {renderRuns(n.runs, primary, "text")}
        </div>
      ))}
    </div>
  );
}

function H2({ node, primary, theme, s }: { node?: TextNode; primary: Lang; theme: Theme; s: ReturnType<typeof scaleOf> }) {
  if (!node) return null;
  return (
    <div
      style={{
        fontFamily: fontFor(primary, "text"),
        fontWeight: primary === "ar" ? 900 : 800,
        fontSize: s.h2,
        lineHeight: primary === "ar" ? 1.5 : 1.2,
        color: theme.head,
        textAlign: "start",
      }}
    >
      {renderRuns(node.runs, primary, "text")}
    </div>
  );
}

function Source({ node, primary, theme, s }: { node?: TextNode; primary: Lang; theme: Theme; s: ReturnType<typeof scaleOf> }) {
  if (!node) return null;
  return (
    <div style={{ fontFamily: FONT_MONO, fontSize: s.source, color: theme.dim, letterSpacing: ".03em", textAlign: "start" }}>
      {renderRuns(node.runs, primary, "mono")}
    </div>
  );
}

function Bars({ slide, primary, theme, s }: { slide: SlideIR; primary: Lang; theme: Theme; s: ReturnType<typeof scaleOf> }) {
  const series = slide.slots.media?.chart?.series ?? [];
  if (!series.length) return null;
  const max = Math.max(...series.map((x) => Math.abs(x.value))) || 1;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: Math.round(s.gap * 0.9) }}>
      {series.map((item, i) => {
        const colour = item.emphasis === "alert" ? theme.alert : item.emphasis === "accent" ? theme.accent : theme.neutral;
        return (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16 }}>
              <div style={{ fontFamily: fontFor(primary, "text"), fontWeight: 500, fontSize: s.data, color: theme.fg }}>
                {renderRuns(item.label.runs, primary, "text")}
              </div>
              <div style={{ fontFamily: FONT_MONO, fontWeight: 600, fontSize: s.data, color: colour }} dir="ltr">
                {item.value}{item.unit ?? ""}
              </div>
            </div>
            <div style={{ height: 18, borderRadius: 999, background: theme.panel, overflow: "hidden" }}>
              <div style={{ width: `${(Math.abs(item.value) / max) * 100}%`, height: "100%", borderRadius: 999, background: colour }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MediaBlock({ slide, theme }: { slide: SlideIR; theme: Theme }) {
  const media = slide.slots.media;
  if (!media || media.kind === "chart" || !media.src) return null;
  return (
    <div
      style={{
        width: "100%",
        height: media.placement === "full" ? 620 : 380,
        borderRadius: 18,
        background: `${theme.panel} center/cover no-repeat`,
        backgroundImage: `url(${media.src})`,
        backgroundSize: "cover",
        border: `1px solid ${theme.rule}`,
      }}
      role="img"
      aria-label={media.credit ?? ""}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Archetype bodies                                                    */
/* ------------------------------------------------------------------ */

interface PartProps {
  deck: DeckIR;
  slide: SlideIR;
  theme: Theme;
  s: ReturnType<typeof scaleOf>;
  hideTails: boolean;
}

function Stack({ children, gap }: { children: React.ReactNode; gap: number }) {
  return <div style={{ display: "flex", flexDirection: "column", gap, alignItems: "stretch" }}>{children}</div>;
}

function SlideBody({ deck, slide, theme, s, hideTails }: PartProps) {
  const p = deck.primary_lang;
  const slots = slide.slots;
  const common = { primary: p, theme, s } as const;

  switch (slide.archetype) {
    case "cover_hero":
      return (
        <Stack gap={s.gap}>
          <Chip node={slots.chip} {...common} />
          <Hero lines={slots.hero_lines} {...common} />
          <Txt node={slots.subline} primary={p} style={{ fontFamily: fontFor(p, "text"), fontSize: s.body, lineHeight: p === "ar" ? 1.9 : 1.6, color: theme.dim, textAlign: "start" }} />
        </Stack>
      );

    case "cover_stat":
      return (
        <Stack gap={s.gap}>
          <Chip node={slots.chip} {...common} />
          {slots.stat_value && (
            <div dir="ltr" style={{ fontFamily: FONT_DISPLAY_EN, fontSize: s.stat, lineHeight: 0.84, color: theme.accent, textAlign: "start" }}>
              {slots.stat_value}
            </div>
          )}
          <H2 node={slots.stat_label} {...common} />
          <Source node={slots.source} {...common} />
        </Stack>
      );

    case "frame":
      return (
        <Stack gap={s.gap}>
          <Hero lines={slots.hero_lines} {...common} />
          <H2 node={slots.headline} {...common} />
          <Body nodes={slots.body} primary={p} theme={theme} s={s} hideTails={hideTails} />
          <MediaBlock slide={slide} theme={theme} />
        </Stack>
      );

    case "evidence":
      return (
        <Stack gap={s.gap}>
          <Chip node={slots.chip} {...common} />
          {slots.stat_value && (
            <div dir="ltr" style={{ fontFamily: FONT_DISPLAY_EN, fontSize: s.stat, lineHeight: 0.84, color: theme.accent, textAlign: "start" }}>
              {slots.stat_value}
            </div>
          )}
          <H2 node={slots.stat_label} {...common} />
          <Body nodes={slots.body} primary={p} theme={theme} s={s} hideTails={hideTails} />
          <Source node={slots.source} {...common} />
        </Stack>
      );

    case "benchmark":
      return (
        <Stack gap={s.gap}>
          <H2 node={slots.headline} {...common} />
          <Bars slide={slide} {...common} />
          <Source node={slots.source} {...common} />
        </Stack>
      );

    case "quote":
      return (
        <Stack gap={s.gap}>
          <Hero lines={slots.hero_lines} {...common} />
          <div style={{ borderInlineStart: `6px solid ${theme.accent}`, paddingInlineStart: 28 }}>
            <Txt
              node={slots.quote}
              primary={p}
              style={{ fontFamily: fontFor(p, "text"), fontWeight: 500, fontSize: s.h2, lineHeight: p === "ar" ? 1.7 : 1.35, color: theme.head, textAlign: "start" }}
            />
          </div>
          <Source node={slots.source} {...common} />
        </Stack>
      );

    case "steps":
      return (
        <Stack gap={s.gap}>
          <Hero lines={slots.hero_lines} {...common} />
          <H2 node={slots.headline} {...common} />
          <div style={{ display: "flex", flexDirection: "column", gap: Math.round(s.gap * 0.8) }}>
            {(slots.checklist ?? []).map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
                <span style={{ fontFamily: FONT_MONO, fontWeight: 600, fontSize: s.data, color: theme.accent, paddingTop: 8, flex: "0 0 auto" }} dir="ltr">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div style={{ fontFamily: fontFor(p, "text"), fontSize: s.body, lineHeight: p === "ar" ? 1.9 : 1.6, color: theme.fg, textAlign: "start" }}>
                  {renderRuns(item.runs, p, "text")}
                </div>
              </div>
            ))}
          </div>
        </Stack>
      );

    case "definition":
      return (
        <Stack gap={s.gap}>
          <Hero lines={slots.hero_lines} {...common} />
          <Txt
            node={slots.term}
            primary={p}
            style={{ fontFamily: fontFor(p, "text"), fontWeight: p === "ar" ? 900 : 800, fontSize: s.h2, color: theme.accent, textAlign: "start" }}
          />
          <div style={{ height: 1, background: theme.rule }} />
          <Txt
            node={slots.term_def}
            primary={p}
            style={{ fontFamily: fontFor(p, "text"), fontSize: s.body, lineHeight: p === "ar" ? 1.9 : 1.6, color: theme.fg, textAlign: "start" }}
          />
          <Body nodes={slots.body} primary={p} theme={theme} s={s} hideTails={hideTails} />
        </Stack>
      );

    case "close":
      // Handled by the dedicated grid in SlideRoot.
      return null;

    default:
      return null;
  }
}

/** Close: a three-row grid whose figure row is a FIXED height, so text can never overlap it. */
const CLOSE_FIGURE_H = 430;

function CloseSlide({ deck, slide, theme, s, hideTails }: PartProps) {
  const p = deck.primary_lang;
  const slots = slide.slots;
  const figureSrc = deck.profile.avatar_cutout_url || deck.profile.avatar_url || null;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: `auto 1fr ${CLOSE_FIGURE_H}px`,
        height: "100%",
        rowGap: s.gap,
      }}
    >
      <IdentityBar deck={deck} theme={theme} s={s} />
      <div style={{ display: "flex", flexDirection: "column", gap: s.gap, minHeight: 0, justifyContent: "center" }}>
        <Hero lines={slots.hero_lines} primary={p} theme={theme} s={s} />
        <H2 node={slots.headline} primary={p} theme={theme} s={s} />
        <Body nodes={slots.body} primary={p} theme={theme} s={s} hideTails={hideTails} />
        {slots.cta_pill && (
          <div
            style={{
              alignSelf: "flex-start",
              fontFamily: fontFor(p, "text"),
              fontWeight: 700,
              fontSize: s.chip,
              color: theme.accentInk,
              background: theme.accent,
              borderRadius: 999,
              paddingInline: 30,
              paddingBlock: 14,
            }}
          >
            {renderRuns(slots.cta_pill.runs, p, "text")}
          </div>
        )}
      </div>
      <div style={{ height: CLOSE_FIGURE_H, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 32 }}>
        {figureSrc ? (
          <div
            style={{
              flex: "1 1 auto",
              height: "100%",
              backgroundImage: `url(${figureSrc})`,
              backgroundSize: "contain",
              backgroundPosition: "bottom center",
              backgroundRepeat: "no-repeat",
            }}
            role="img"
            aria-label=""
          />
        ) : (
          // No portrait: a signature block, not an invented one.
          <div style={{ flex: "1 1 auto", display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 12 }}>
            <Txt
              node={deck.profile.name}
              primary={p}
              style={{ fontFamily: fontFor(p, "text"), fontWeight: 800, fontSize: s.h2, color: theme.head, textAlign: "start" }}
            />
            <Txt
              node={deck.profile.title}
              primary={p}
              style={{ fontFamily: fontFor(p, "text"), fontSize: s.data, color: theme.dim, textAlign: "start" }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <LinkedInGlyph size={Math.round(parseInt(s.source, 10) * 1.1)} color={theme.dim} />
              <span style={{ fontFamily: FONT_MONO, fontSize: s.source, color: theme.dim }} dir="ltr">
                {deck.profile.handle}
              </span>
            </div>
            <div style={{ height: 1, background: theme.rule, marginBlockStart: 10 }} />
          </div>
        )}
        <div style={{ paddingBlockEnd: 6 }}>
          <ReactionIcons theme={theme} size={Math.round(parseInt(s.h2, 10) * 0.6)} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Slide root                                                          */
/* ------------------------------------------------------------------ */

export interface SlideProps {
  deck: DeckIR;
  slide: SlideIR;
  theme?: ThemeName | string | null;
  /** Reports the fit-ladder outcome so a caller can refuse to ship a failure. */
  onFit?: (state: FitState) => void;
}

export function Slide({ deck, slide, theme: themeName, onFit }: SlideProps) {
  const theme = getTheme(themeName ?? deck.theme);
  const ref = useRef<HTMLDivElement | null>(null);
  const signature = `${deck.deck_id}:${slide.index}:${themeName ?? deck.theme}:${plainText(slide.slots.headline)}`;
  const fit = useFitLadder(ref, signature);
  const s = scaleOf(fit.scale);
  const hideTails = fit.step >= 2;

  const lastReported = useRef<string>("");
  const key = `${fit.step}|${fit.failed}|${fit.reason ?? ""}`;
  if (onFit && lastReported.current !== key) {
    lastReported.current = key;
    queueMicrotask(() => onFit(fit));
  }

  const isClose = slide.archetype === "close";

  return (
    <div
      ref={ref}
      data-fit={fit.step}
      data-slide-root={slide.index}
      data-archetype={slide.archetype}
      dir={deck.dir}
      lang={deck.primary_lang}
      style={{
        // Exactly 1080 x 1350, 82px on every side, at every fit step.
        width: CANVAS_W,
        height: CANVAS_H,
        padding: PAD,
        boxSizing: "border-box",
        overflow: "hidden",
        position: "relative",
        background: theme.bg,
        color: theme.fg,
        textAlign: "start",
        fontFamily: fontFor(deck.primary_lang, "text"),
        // Western digits everywhere, Arabic included.
        fontVariantNumeric: "lining-nums tabular-nums",
      }}
    >
      {isClose ? (
        <CloseSlide deck={deck} slide={slide} theme={theme} s={s} hideTails={hideTails} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: s.gap }}>
          <IdentityBar deck={deck} theme={theme} s={s} />
          <div style={{ flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <SlideBody deck={deck} slide={slide} theme={theme} s={s} hideTails={hideTails} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flex: "0 0 auto" }}>
            <div style={{ height: 4, width: 96, borderRadius: 999, background: theme.accent }} />
            <span style={{ fontFamily: FONT_MONO, fontSize: s.source, color: theme.dim }} dir="ltr">
              {slide.index + 1} / {deck.slides.length}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default Slide;