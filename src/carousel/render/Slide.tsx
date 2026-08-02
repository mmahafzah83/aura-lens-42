/**
 * The renderer. One component, nine archetypes, one mirrored layout.
 *
 * RULE A — no CSS custom properties anywhere in this subtree. html2canvas
 * cannot read them from inside its iframe, so every colour arrives as an
 * inline literal from the theme object.
 * RULE B — no network fonts. Everything resolves to a bundled face declared
 * in fonts.css.
 */
import React, { useLayoutEffect, useRef, useState } from "react";
import "./fonts.css";
import {
  plainText,
  type Archetype,
  type DeckIR,
  type HeroLine,
  type Run,
  type Slide as SlideIR,
  type TextNode,
} from "../deckIR";
import { getTheme, type Theme, type ThemeName } from "./themes";
import { useFitLadder, type FitState } from "./useFitLadder";
import { INV_16_MEDIA_IN_DOM } from "../invariants";

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
    /** The raw fit scale, so every derived dimension can stay on the ladder. */
    scale: s,
    heroEn: px(150),
    heroAr: px(92),
    stat: px(270),
    h2: px(54),
    body: px(38),
    chip: px(31),
    data: px(26),
    source: px(22),
    gap: Math.round(28 * s),
    /**
     * A photo band is a dimension like any other: it rides the fit ladder so a
     * dense slide shrinks the image alongside the type instead of overflowing
     * the canvas and reporting the overflow as a text problem.
     */
    media: Math.round(360 * s),
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
/* Theme marks — a small, fixed set. Chosen upstream from theme_tags.  */
/* ------------------------------------------------------------------ */

const ICON_PATHS: Record<string, string[]> = {
  water: ["M12 2.5s6.5 7 6.5 11.2A6.5 6.5 0 0 1 5.5 13.7C5.5 9.5 12 2.5 12 2.5z"],
  energy: ["M13 2 4 14h6l-1 8 9-12h-6l1-8z"],
  data: ["M4 20V10", "M10 20V4", "M16 20v-7", "M22 20H2"],
  growth: ["M3 17l6-6 4 4 8-8", "M15 7h6v6"],
  risk: ["M12 3l9 16H3l9-16z", "M12 10v4", "M12 17.2v.1"],
  people: ["M8 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z", "M2 21c0-3.6 2.7-6 6-6s6 2.4 6 6", "M17 11a3 3 0 1 0 0-6", "M17 15c3 0 5 2.2 5 6"],
  time: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 7v5l3.5 2"],
  money: ["M12 2v20", "M17 6.5C17 4.6 14.8 3.5 12 3.5S7 4.6 7 6.5 9.2 10 12 11s5 1.9 5 4-2.2 3.5-5 3.5-5-1.4-5-3.5"],
  network: ["M12 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z", "M5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z", "M19 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z", "M12 8v4", "M12 12 6 16", "M12 12l6 4"],
  gear: ["M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z", "M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4.1a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4 1.7 1.7 0 0 0-1.6 1z"],
};

/** `media.src` of "icon:water" resolves here. Unknown keys render nothing. */
function IconMark({ src, theme, size }: { src?: string; theme: Theme; size: number }) {
  const key = (src ?? "").startsWith("icon:") ? src!.slice(5) : "";
  const paths = ICON_PATHS[key];
  if (!paths) return null;
  return (
    <div
      data-media-node="icon"
      style={{
        width: size, height: size, borderRadius: 18, flex: "0 0 auto",
        background: theme.panel, border: `1px solid ${theme.rule}`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <svg
        width={Math.round(size * 0.56)}
        height={Math.round(size * 0.56)}
        viewBox="0 0 24 24"
        fill="none"
        stroke={theme.accent}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{ display: "block" }}
      >
        {paths.map((d, i) => <path key={i} d={d} />)}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Identity                                                            */
/* ------------------------------------------------------------------ */

function IdentityBar({
  deck, theme, s, showAvatar = true,
}: { deck: DeckIR; theme: Theme; s: ReturnType<typeof scaleOf>; showAvatar?: boolean }) {
  const primary = deck.primary_lang;
  // The close slide already carries the standing figure. One photo per slide.
  const avatar = showAvatar ? deck.profile.avatar_url : null;
  // A cut-out has transparent regions; a plate behind it would show through.
  const isCutout = Boolean(deck.profile.avatar_cutout_url);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 22, flex: "0 0 auto" }}>
      {avatar ? (
        <img
          src={avatar}
          alt=""
          style={{
            width: 74, height: 74, borderRadius: 999, objectFit: "cover", flex: "0 0 auto",
            ...(isCutout ? {} : { background: theme.neutral }),
          }}
        />
      ) : showAvatar ? (
        // No avatar: an accent rule, never a fabricated monogram. Initials in a
        // disc read as a missing asset, and Arabic names are not idiomatically
        // abbreviated.
        <div style={{ width: 10, height: 74, borderRadius: 6, background: theme.accent, flex: "0 0 auto" }} />
      ) : null}
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
            lineHeight: ar ? 1.42 : 0.93,
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
    <div data-media-node="chart" style={{ display: "flex", flexDirection: "column", gap: Math.round(s.gap * 0.9) }}>
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

/* ------------------------------------------------------------------ */
/* Where a photo goes, per archetype — ONE table, no default branch     */
/* ------------------------------------------------------------------ */

/**
 * `cover`  — full bleed behind the type, with a scrim. The photo IS the slide.
 * `band`   — a contained block in the content flow, height on the fit ladder.
 * `none`   — this archetype cannot hold a member photo, and says so before the
 *            file picker opens rather than swallowing the upload.
 *
 * Every archetype appears here and the type is a total `Record`, so adding a
 * tenth archetype fails the typecheck until someone makes this decision. That
 * is deliberate: media used to be pasted into a single switch case, and the
 * other eight archetypes inherited silence.
 */
export type MediaPlacementMode = "cover" | "band" | "none";

export const MEDIA_BY_ARCHETYPE: Record<Archetype, MediaPlacementMode> = {
  cover_hero: "cover",
  cover_stat: "cover",
  frame: "band",
  evidence: "band",
  // The chart is this slide's visual; a photo behind bars reads as noise.
  benchmark: "none",
  quote: "cover",
  // The numbered list needs the full column.
  steps: "none",
  definition: "band",
  // The standing figure is the one image on the closing slide.
  close: "none",
};

export function mediaSupport(archetype: Archetype): MediaPlacementMode {
  return MEDIA_BY_ARCHETYPE[archetype];
}

/** The photo a member attached, if this slot carries one at all. */
function photoSrc(slide: SlideIR): string | null {
  const media = slide.slots.media;
  if (!media || media.kind === "chart" || media.kind === "icon") return null;
  return media.src ?? null;
}

/** A contained band, sized off the same scale object as everything else. */
function MediaBand({ slide, theme, s }: { slide: SlideIR; theme: Theme; s: ReturnType<typeof scaleOf> }) {
  const src = photoSrc(slide);
  if (!src) return null;
  const media = slide.slots.media!;
  return (
    <div
      data-media-node="band"
      style={{
        width: "100%",
        height: media.placement === "full" ? Math.round(s.media * 1.6) : s.media,
        flex: "0 0 auto",
        marginBlockStart: s.gap,
        borderRadius: 18,
        background: theme.panel,
        backgroundImage: `url(${src})`,
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
        border: `1px solid ${theme.rule}`,
      }}
      role="img"
      aria-label={media.credit ?? ""}
    />
  );
}

/**
 * Full bleed behind the type. The scrim runs from the reading edge so the hero
 * keeps its contrast in both directions, and the whole thing sits underneath
 * the content layer rather than inside the flow.
 */
function MediaCover({ slide, deck, theme }: { slide: SlideIR; deck: DeckIR; theme: Theme }) {
  const src = photoSrc(slide);
  if (!src) return null;
  const from = deck.dir === "rtl" ? "to left" : "to right";
  return (
    <div data-media-node="cover" aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url(${src})`,
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundSize: "cover",
        }}
      />
      {/* Two scrims: a directional one holding contrast under the type column,
          and a vertical one so the identity row and the footer rule never sit
          on bare photo. Heavy where the words are, and genuinely transparent
          away from them — a scrim dark enough everywhere is just a tint, and
          then the member cannot tell their photo arrived at all. */}
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(${from}, ${theme.bgSolid}F2 0%, ${theme.bgSolid}B3 45%, ${theme.bgSolid}1A 100%)` }} />
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(to bottom, ${theme.bgSolid}CC 0%, ${theme.bgSolid}00 30%, ${theme.bgSolid}00 62%, ${theme.bgSolid}D9 100%)` }} />
    </div>
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
          {slots.media?.kind === "icon" && <IconMark src={slots.media.src} theme={theme} size={Math.round(112 * (parseInt(s.h2, 10) / 54))} />}
          <Hero lines={slots.hero_lines} {...common} />
          <H2 node={slots.headline} {...common} />
          <Body nodes={slots.body} primary={p} theme={theme} s={s} hideTails={hideTails} />
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
          {slots.media?.kind === "icon" && <IconMark src={slots.media.src} theme={theme} size={Math.round(112 * (parseInt(s.h2, 10) / 54))} />}
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
const CLOSE_FIGURE_H = 470;
/** The figure occupies a fixed column so the head lands in the same place on every deck. */
const CLOSE_FIGURE_W = 430;

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
      {/* No avatar disc here — the standing figure below is the one photo. */}
      <IdentityBar deck={deck} theme={theme} s={s} showAvatar={false} />
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
          // A cut-out figure STANDING in the slide: bottom-anchored, sized by
          // height so the head sits in the upper third of the figure zone, and
          // with no frame, border, radius or shadow anywhere near it. A square
          // avatar has no transparency, so it is dissolved into the background
          // by a bottom fade rather than stopping at a hard edge.
          <div
            style={{
              width: CLOSE_FIGURE_W,
              flex: "0 0 auto",
              height: "100%",
              backgroundImage: `url(${figureSrc})`,
              backgroundSize: "auto 100%",
              backgroundPosition: deck.dir === "rtl" ? "bottom right" : "bottom left",
              backgroundRepeat: "no-repeat",
              border: "none",
              borderRadius: 0,
              boxShadow: "none",
              ...(deck.profile.avatar_cutout_url
                ? {}
                : {
                    maskImage: "linear-gradient(to bottom, #000 0%, #000 58%, rgba(0,0,0,.55) 82%, rgba(0,0,0,0) 100%)",
                    WebkitMaskImage: "linear-gradient(to bottom, #000 0%, #000 58%, rgba(0,0,0,.55) 82%, rgba(0,0,0,0) 100%)",
                  }),
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

/**
 * INV-16, as a real post-render assertion rather than a declared constant.
 *
 * If a slide declares media of a visual kind, a node for it must exist in the
 * DOM after layout. Anything else means the member attached something and the
 * renderer quietly dropped it — which is precisely what happened when
 * `MediaBlock` was reachable from exactly one of nine archetypes.
 */
function useMediaInDom(
  ref: React.RefObject<HTMLElement | null>,
  slide: SlideIR,
  signature: string,
): string | null {
  const [defect, setDefect] = useState<string | null>(null);
  useLayoutEffect(() => {
    const root = ref.current;
    const media = slide.slots.media;
    if (!root || !media) { setDefect(null); return; }
    const visual = media.kind === "chart" ? Boolean(media.chart?.series?.length) : Boolean(media.src);
    if (!visual) { setDefect(null); return; }
    const drawn = root.querySelector("[data-media-node]");
    if (drawn) { setDefect(null); return; }
    const what = media.kind === "chart" ? "a chart" : media.kind === "icon" ? "a mark" : "an image";
    setDefect(
      `${INV_16_MEDIA_IN_DOM}: slide ${slide.index + 1} carries ${what}, but a ${slide.archetype.replace(/_/g, " ")} slide cannot show one. Move it to another slide or remove it.`,
    );
    // signature forces a re-measure whenever the photo, archetype or fit changes.
  }, [ref, slide, signature]);
  return defect;
}

export function Slide({ deck, slide, theme: themeName, onFit }: SlideProps) {
  const theme = getTheme(themeName ?? deck.theme);
  const ref = useRef<HTMLDivElement | null>(null);
  const signature = `${deck.deck_id}:${slide.index}:${themeName ?? deck.theme}:${plainText(slide.slots.headline)}`;
  const fit = useFitLadder(ref, signature);
  const s = scaleOf(fit.scale);
  const hideTails = fit.step >= 2;

  const mediaDefect = useMediaInDom(ref, slide, `${signature}|${photoSrc(slide) ?? ""}|${fit.step}`);
  // INV-16 rides the same channel as the fit ladder: a slide that declares
  // media the renderer does not draw is a defect the member must see, not a
  // silent no-op. This is the exact failure that hid "Add image" for months.
  const reported: FitState = mediaDefect
    ? { ...fit, failed: true, reason: mediaDefect }
    : fit;

  const lastReported = useRef<string>("");
  const key = `${reported.step}|${reported.failed}|${reported.reason ?? ""}`;
  if (onFit && lastReported.current !== key) {
    lastReported.current = key;
    queueMicrotask(() => onFit(reported));
  }

  const isClose = slide.archetype === "close";
  const placement = MEDIA_BY_ARCHETYPE[slide.archetype];

  return (
    <div
      ref={ref}
      data-fit={fit.step}
      data-slide-root={slide.index}
      data-archetype={slide.archetype}
      data-bg={theme.bgSolid}
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
      {/* Media is drawn HERE, from the table, for every archetype — never from
          inside an archetype's own switch case. */}
      {placement === "cover" && <MediaCover slide={slide} deck={deck} theme={theme} />}
      {isClose ? (
        <CloseSlide deck={deck} slide={slide} theme={theme} s={s} hideTails={hideTails} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: s.gap, position: "relative" }}>
          <IdentityBar deck={deck} theme={theme} s={s} />
          <div style={{ flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <SlideBody deck={deck} slide={slide} theme={theme} s={s} hideTails={hideTails} />
            {placement === "band" && <MediaBand slide={slide} theme={theme} s={s} />}
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