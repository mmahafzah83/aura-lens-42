/**
 * The renderer. One component, nine archetypes, one mirrored layout.
 *
 * RULE A — no CSS custom properties anywhere in this subtree. html2canvas
 * cannot read them from inside its iframe, so every colour arrives as an
 * inline literal from the theme object.
 * RULE B — no network fonts. Everything resolves to a bundled face declared
 * in fonts.css.
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
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
import { MAX_FIT_STEP, useFitLadder, type FitState } from "./useFitLadder";
import { INV_16_MEDIA_IN_DOM } from "../invariants";
import {
  MEDIA_BY_ARCHETYPE, droppableSlotCount, pictureTextPlan,
  type MediaPlacementMode,
} from "../slots";
import {
  bandMediaHeight, getTemplate, TEMPLATES, type FontSet, type TemplateDescriptor, type TypeRamp,
} from "./template";
import { publishMeasuredDrops } from "./measuredDrops";

/* ------------------------------------------------------------------ */
/* Canvas and type scale — all of it now DATA, read from the template  */
/* ------------------------------------------------------------------ */

const INSTRUMENT = TEMPLATES.instrument;

/** @deprecated read from TemplateDescriptor.geometry.canvasW */
export const CANVAS_W = INSTRUMENT.geometry.canvasW;
/** @deprecated read from TemplateDescriptor.geometry.canvasH */
export const CANVAS_H = INSTRUMENT.geometry.canvasH;
/** @deprecated read from TemplateDescriptor.geometry.pad */
export const PAD = INSTRUMENT.geometry.pad;
/** @deprecated read from TemplateDescriptor.geometry.safeArea */
export const SAFE_AREA = INSTRUMENT.geometry.safeArea;
/** @deprecated read from TemplateDescriptor.geometry.bandLift */
export const BAND_LIFT = INSTRUMENT.geometry.bandLift;
/** @deprecated read from bandMediaHeight(TemplateDescriptor) */
export const BAND_MEDIA_H = bandMediaHeight(INSTRUMENT);

type Lang = "en" | "ar";

function fontFor(lang: Lang, kind: "display" | "text" | "mono", fonts: FontSet): string {
  if (lang === "ar") return fonts.arabic;
  if (kind === "display") return fonts.displayEn;
  if (kind === "mono") return fonts.mono;
  return fonts.textEn;
}

function scaleOf(s: number, ramp: TypeRamp) {
  const px = (n: number) => `${Math.round(n * s)}px`;
  return {
    /** The raw fit scale, so every derived dimension can stay on the ladder. */
    scale: s,
    heroEn: px(ramp.heroEn),
    heroAr: px(ramp.heroAr),
    stat: px(ramp.stat),
    h2: px(ramp.h2),
    body: px(ramp.body),
    chip: px(ramp.chip),
    data: px(ramp.data),
    source: px(ramp.source),
    gap: Math.round(ramp.gap * s),
    /**
     * A photo band is a dimension like any other: it rides the fit ladder so a
     * dense slide shrinks the image alongside the type instead of overflowing
     * the canvas and reporting the overflow as a text problem.
     */
    media: Math.round(ramp.media * s),
  };
}

type Scale = ReturnType<typeof scaleOf>;

/* ------------------------------------------------------------------ */
/* Bidi-safe text                                                      */
/* ------------------------------------------------------------------ */

/**
 * Runs whose language differs from the deck's primary language are isolated.
 * This is what makes "smart meters" read left-to-right inside an Arabic
 * sentence instead of colliding with the surrounding text.
 */
function renderRuns(runs: Run[], primary: Lang, kind: "display" | "text" | "mono", fonts: FontSet) {
  return runs.map((run, i) => {
    if (run.lang === primary) return <React.Fragment key={i}>{run.t}</React.Fragment>;
    return (
      <span
        key={i}
        lang={run.lang}
        dir={run.lang === "ar" ? "rtl" : "ltr"}
        style={{ unicodeBidi: "isolate", fontFamily: fontFor(run.lang, kind, fonts) }}
      >
        {run.t}
      </span>
    );
  });
}

function Txt({
  node, primary, kind = "text", style, tpl,
}: {
  node?: TextNode | null;
  primary: Lang;
  kind?: "display" | "text" | "mono";
  style?: React.CSSProperties;
  tpl: TemplateDescriptor;
}) {
  if (!node) return null;
  return <div style={style}>{renderRuns(node.runs, primary, kind, tpl.fonts)}</div>;
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
function IconMark({ src, theme, size, tpl }: { src?: string; theme: Theme; size: number; tpl: TemplateDescriptor }) {
  const key = (src ?? "").startsWith("icon:") ? src!.slice(5) : "";
  const paths = ICON_PATHS[key];
  if (!paths) return null;
  return (
    <div
      data-media-node="icon"
      style={{
        width: size, height: size, borderRadius: tpl.geometry.radiusPanel, flex: "0 0 auto",
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
  deck, theme, s, tpl, showAvatar = true,
}: { deck: DeckIR; theme: Theme; s: Scale; tpl: TemplateDescriptor; showAvatar?: boolean }) {
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
          tpl={tpl}
          style={{ fontFamily: fontFor(primary, "text", tpl.fonts), fontWeight: 700, fontSize: s.chip, color: theme.head, lineHeight: tpl.ramp.h2Lh }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* The glyph REPLACES the "in/" prefix. Rendering both yields "inin/handle". */}
          <LinkedInGlyph size={Math.round(parseInt(s.source, 10) * 1.1)} color={theme.dim} />
          <span style={{ fontFamily: tpl.fonts.mono, fontSize: s.source, color: theme.dim, letterSpacing: ".02em" }} dir="ltr">
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

function Chip({ node, primary, theme, s, tpl }: { node?: TextNode; primary: Lang; theme: Theme; s: Scale; tpl: TemplateDescriptor }) {
  if (!node) return null;
  return (
    <div
      style={{
        alignSelf: "flex-start",
        fontFamily: fontFor(primary, "text", tpl.fonts),
        fontWeight: 700,
        fontSize: s.chip,
        color: theme.accentLight,
        textTransform: primary === "ar" ? "none" : "uppercase",
        letterSpacing: primary === "ar" ? "0" : ".08em",
        paddingInline: 22,
        paddingBlock: 10,
        borderRadius: tpl.geometry.radiusChip,
        background: theme.panel,
        border: `1px solid ${theme.rule}`,
      }}
    >
      {renderRuns(node.runs, primary, "text", tpl.fonts)}
    </div>
  );
}

function Hero({ lines, primary, theme, s, tpl }: { lines?: HeroLine[]; primary: Lang; theme: Theme; s: Scale; tpl: TemplateDescriptor }) {
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
            fontFamily: fontFor(primary, "display", tpl.fonts),
            fontWeight: ar ? 900 : 400,
            fontSize: ar ? s.heroAr : s.heroEn,
            lineHeight: ar ? tpl.ramp.heroArLh : tpl.ramp.heroEnLh,
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
          {renderRuns(line.runs, primary, "display", tpl.fonts)}
        </span>
      ))}
    </div>
  );
}

function Body({ nodes, primary, theme, s, tpl, hideTails }: {
  nodes?: TextNode[]; primary: Lang; theme: Theme; s: Scale; tpl: TemplateDescriptor; hideTails: boolean;
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
            fontFamily: fontFor(primary, "text", tpl.fonts),
            fontSize: s.body,
            lineHeight: primary === "ar" ? tpl.ramp.bodyLhAr : tpl.ramp.bodyLhEn,
            color: theme.fg,
            textAlign: "start",
          }}
        >
          {renderRuns(n.runs, primary, "text", tpl.fonts)}
        </div>
      ))}
    </div>
  );
}

function H2({ node, primary, theme, s, tpl }: { node?: TextNode; primary: Lang; theme: Theme; s: Scale; tpl: TemplateDescriptor }) {
  if (!node) return null;
  return (
    <div
      style={{
        fontFamily: fontFor(primary, "text", tpl.fonts),
        fontWeight: primary === "ar" ? 900 : 800,
        fontSize: s.h2,
        lineHeight: primary === "ar" ? 1.5 : tpl.ramp.h2Lh,
        color: theme.head,
        textAlign: "start",
      }}
    >
      {renderRuns(node.runs, primary, "text", tpl.fonts)}
    </div>
  );
}

function Source({ node, primary, theme, s, tpl }: { node?: TextNode; primary: Lang; theme: Theme; s: Scale; tpl: TemplateDescriptor }) {
  if (!node) return null;
  return (
    <div style={{ fontFamily: tpl.fonts.mono, fontSize: s.source, color: theme.dim, letterSpacing: ".03em", textAlign: "start" }}>
      {renderRuns(node.runs, primary, "mono", tpl.fonts)}
    </div>
  );
}

function Bars({ slide, primary, theme, s, tpl }: { slide: SlideIR; primary: Lang; theme: Theme; s: Scale; tpl: TemplateDescriptor }) {
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
              <div style={{ fontFamily: fontFor(primary, "text", tpl.fonts), fontWeight: 500, fontSize: s.data, color: theme.fg }}>
                {renderRuns(item.label.runs, primary, "text", tpl.fonts)}
              </div>
              <div style={{ fontFamily: tpl.fonts.mono, fontWeight: 600, fontSize: s.data, color: colour }} dir="ltr">
                {item.value}{item.unit ?? ""}
              </div>
            </div>
            <div style={{ height: 18, borderRadius: tpl.geometry.radiusChip, background: theme.panel, overflow: "hidden" }}>
              <div style={{ width: `${(Math.abs(item.value) / max) * 100}%`, height: "100%", borderRadius: tpl.geometry.radiusChip, background: colour }} />
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
 * The taxonomy itself lives in `../slots`, because the studio and the edit
 * operations need it too. Re-exported here so existing callers keep working.
 */
export { MEDIA_BY_ARCHETYPE, type MediaPlacementMode };

export function mediaSupport(archetype: Archetype): MediaPlacementMode {
  return MEDIA_BY_ARCHETYPE[archetype];
}

/** The photo a member attached, if this slot carries one at all. */
function photoSrc(slide: SlideIR): string | null {
  const media = slide.slots.media;
  if (!media || media.kind === "chart" || media.kind === "icon") return null;
  return media.src ?? null;
}

/**
 * The lower zone of the BAND variant.
 *
 * Its height is a CONSTANT share of the canvas — it does not ride the fit
 * ladder and it does not respond to the word count. That constancy is the
 * whole reason a deck of band slides reads as designed. It is lifted clear of
 * the footer by `BAND_LIFT`, so it never touches the safe area (X3).
 */
function MediaBand({ slide, theme, tpl }: { slide: SlideIR; theme: Theme; tpl: TemplateDescriptor }) {
  const src = photoSrc(slide);
  if (!src) return null;
  const media = slide.slots.media!;
  return (
    <div
      data-media-node="band"
      style={{
        width: "100%",
        height: bandMediaHeight(tpl),
        flex: "0 0 auto",
        marginBlockEnd: tpl.geometry.bandLift,
        borderRadius: tpl.geometry.radiusMedia,
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
function MediaCover({ slide, deck, theme, tpl }: { slide: SlideIR; deck: DeckIR; theme: Theme; tpl: TemplateDescriptor }) {
  const src = photoSrc(slide);
  if (!src) return null;
  const from = deck.dir === "rtl" ? "to left" : "to right";
  return (
    <div data-media-node="cover" aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          // X3 — the picture stops short of the numerals. Only the scrim,
          // which carries no content, is allowed across the safe area.
          top: 0,
          insetInline: 0,
          bottom: tpl.geometry.safeArea.bottom,
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
      {/* The cover now carries the label, the hook AND the framing, so the
          scrim is a legibility GATE, not a hope: deep enough under the whole
          type column that every one of those three lines clears AA over a
          light photograph, still genuinely transparent on the far side so the
          member can see their picture arrived. No solid panel. */}
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(${from}, ${theme.bgSolid}FA 0%, ${theme.bgSolid}EB 40%, ${theme.bgSolid}A6 68%, ${theme.bgSolid}1A 100%)` }} />
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(to bottom, ${theme.bgSolid}D9 0%, ${theme.bgSolid}59 26%, ${theme.bgSolid}59 62%, ${theme.bgSolid}E6 100%)` }} />
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
  s: Scale;
  tpl: TemplateDescriptor;
  hideTails: boolean;
}

/** Which of the two compositions this slide is rendering. */
export type SlideVariant = "plain" | "cover" | "band";

/** A slide is in a picture variant only when it actually carries a picture. */
export function variantFor(slide: SlideIR, hasPhoto: boolean): SlideVariant {
  if (!hasPhoto) return "plain";
  const mode = MEDIA_BY_ARCHETYPE[slide.archetype];
  return mode === "none" ? "plain" : mode;
}

function Stack({ children, gap }: { children: React.ReactNode; gap: number }) {
  return <div style={{ display: "flex", flexDirection: "column", gap, alignItems: "stretch" }}>{children}</div>;
}

/**
 * THE COVER KEEPS EVERY WORD. The picture is a full-bleed background behind
 * two scrims, so it consumes no layout room: the label, the hook and the
 * framing all render, in the SAME components and at the same type scale as a
 * cover with no picture. Nothing here is hidden by a count; if the words ever
 * genuinely overflow, the fit ladder — which measures the DOM — says so.
 */
function CoverBody({ deck, slide, theme, s, tpl }: PartProps) {
  const p = deck.primary_lang;
  const slots = slide.slots;
  const common = { primary: p, theme, s, tpl } as const;
  return (
    <Stack gap={s.gap}>
      <Chip node={slots.chip} {...common} />
      {slots.hero_lines?.length
        ? <Hero lines={slots.hero_lines} {...common} />
        : slots.stat_value
          ? (
            <div dir="ltr" style={{ fontFamily: tpl.fonts.displayEn, fontSize: s.stat, lineHeight: tpl.ramp.statLh, color: theme.accent, textAlign: "start" }}>
              {slots.stat_value}
            </div>
          )
          : null}
      {slide.archetype === "cover_stat" && slots.hero_lines?.length && slots.stat_value ? (
        <div dir="ltr" style={{ fontFamily: tpl.fonts.displayEn, fontSize: s.stat, lineHeight: tpl.ramp.statLh, color: theme.accent, textAlign: "start" }}>
          {slots.stat_value}
        </div>
      ) : null}
      <H2 node={slots.stat_label} {...common} />
      <Txt
        node={slots.subline}
        primary={p}
        tpl={tpl}
        style={{ fontFamily: fontFor(p, "text", tpl.fonts), fontSize: s.body, lineHeight: p === "ar" ? tpl.ramp.bodyLhAr : tpl.ramp.bodyLhEn, color: theme.dim, textAlign: "start" }}
      />
      <Source node={slots.source} {...common} />
    </Stack>
  );
}

function SlideBody({ deck, slide, theme, s, tpl, hideTails }: PartProps) {
  const p = deck.primary_lang;
  const slots = slide.slots;
  const common = { primary: p, theme, s, tpl } as const;

  switch (slide.archetype) {
    case "cover_hero":
      return (
        <Stack gap={s.gap}>
          <Chip node={slots.chip} {...common} />
          <Hero lines={slots.hero_lines} {...common} />
          <Txt node={slots.subline} primary={p} tpl={tpl} style={{ fontFamily: fontFor(p, "text", tpl.fonts), fontSize: s.body, lineHeight: p === "ar" ? tpl.ramp.bodyLhAr : tpl.ramp.bodyLhEn, color: theme.dim, textAlign: "start" }} />
        </Stack>
      );

    case "cover_stat":
      return (
        <Stack gap={s.gap}>
          <Chip node={slots.chip} {...common} />
          {slots.stat_value && (
            <div dir="ltr" style={{ fontFamily: tpl.fonts.displayEn, fontSize: s.stat, lineHeight: tpl.ramp.statLh, color: theme.accent, textAlign: "start" }}>
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
          {slots.media?.kind === "icon" && <IconMark src={slots.media.src} theme={theme} tpl={tpl} size={Math.round(112 * (parseInt(s.h2, 10) / tpl.ramp.h2))} />}
          <Hero lines={slots.hero_lines} {...common} />
          <H2 node={slots.headline} {...common} />
          <Body nodes={slots.body} primary={p} theme={theme} s={s} tpl={tpl} hideTails={hideTails} />
        </Stack>
      );

    case "evidence":
      return (
        <Stack gap={s.gap}>
          <Chip node={slots.chip} {...common} />
          {slots.stat_value && (
            <div dir="ltr" style={{ fontFamily: tpl.fonts.displayEn, fontSize: s.stat, lineHeight: tpl.ramp.statLh, color: theme.accent, textAlign: "start" }}>
              {slots.stat_value}
            </div>
          )}
          <H2 node={slots.stat_label} {...common} />
          <Body nodes={slots.body} primary={p} theme={theme} s={s} tpl={tpl} hideTails={hideTails} />
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
              tpl={tpl}
              style={{ fontFamily: fontFor(p, "text", tpl.fonts), fontWeight: 500, fontSize: s.h2, lineHeight: p === "ar" ? 1.7 : 1.35, color: theme.head, textAlign: "start" }}
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
                <span style={{ fontFamily: tpl.fonts.mono, fontWeight: 600, fontSize: s.data, color: theme.accent, paddingTop: 8, flex: "0 0 auto" }} dir="ltr">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div style={{ fontFamily: fontFor(p, "text", tpl.fonts), fontSize: s.body, lineHeight: p === "ar" ? tpl.ramp.bodyLhAr : tpl.ramp.bodyLhEn, color: theme.fg, textAlign: "start" }}>
                  {renderRuns(item.runs, p, "text", tpl.fonts)}
                </div>
              </div>
            ))}
          </div>
        </Stack>
      );

    case "definition":
      return (
        <Stack gap={s.gap}>
          {slots.media?.kind === "icon" && <IconMark src={slots.media.src} theme={theme} tpl={tpl} size={Math.round(112 * (parseInt(s.h2, 10) / tpl.ramp.h2))} />}
          <Hero lines={slots.hero_lines} {...common} />
          <Txt
            node={slots.term}
            primary={p}
            tpl={tpl}
            style={{ fontFamily: fontFor(p, "text", tpl.fonts), fontWeight: p === "ar" ? 900 : 800, fontSize: s.h2, color: theme.accent, textAlign: "start" }}
          />
          <div style={{ height: 1, background: theme.rule }} />
          <Txt
            node={slots.term_def}
            primary={p}
            tpl={tpl}
            style={{ fontFamily: fontFor(p, "text", tpl.fonts), fontSize: s.body, lineHeight: p === "ar" ? tpl.ramp.bodyLhAr : tpl.ramp.bodyLhEn, color: theme.fg, textAlign: "start" }}
          />
          <Body nodes={slots.body} primary={p} theme={theme} s={s} tpl={tpl} hideTails={hideTails} />
        </Stack>
      );

    case "close":
      // Handled by the dedicated grid in SlideRoot.
      return null;

    default:
      return null;
  }
}

/**
 * Close: a three-row grid whose figure row is a FIXED height, so text can
 * never overlap it. Both dimensions come from the descriptor.
 */
function CloseSlide({ deck, slide, theme, s, tpl, hideTails }: PartProps) {
  const p = deck.primary_lang;
  const slots = slide.slots;
  /**
   * X4 — AN ABSOLUTE RULE. The closing slide shows either a proper
   * background-removed cut-out, or the typographic signature block. There is
   * no third state: the old fallback rendered the member's raw rectangular
   * photograph behind a fade mask, and it looked pasted on. `avatar_url` is
   * deliberately NOT consulted here.
   *
   * The portrait is per-member: it comes from that member's own
   * `diagnostic_profiles` row, carried onto `deck.profile` at generation time.
   * A member with no cut-out gets the signature, which is the better of the
   * two anyway.
   */
  const figureSrc = deck.profile.avatar_cutout_url || null;
  const figureH = tpl.geometry.closeFigureH;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: `auto 1fr ${figureH}px`,
        height: "100%",
        rowGap: s.gap,
      }}
    >
      {/* No avatar disc here — the standing figure below is the one photo. */}
      <IdentityBar deck={deck} theme={theme} s={s} tpl={tpl} showAvatar={false} />
      <div style={{ display: "flex", flexDirection: "column", gap: s.gap, minHeight: 0, justifyContent: "center" }}>
        <Hero lines={slots.hero_lines} primary={p} theme={theme} s={s} tpl={tpl} />
        <H2 node={slots.headline} primary={p} theme={theme} s={s} tpl={tpl} />
        <Body nodes={slots.body} primary={p} theme={theme} s={s} tpl={tpl} hideTails={hideTails} />
        {slots.cta_pill && (
          <div
            style={{
              alignSelf: "flex-start",
              fontFamily: fontFor(p, "text", tpl.fonts),
              fontWeight: 700,
              fontSize: s.chip,
              color: theme.accentInk,
              background: theme.accent,
              borderRadius: tpl.geometry.radiusChip,
              paddingInline: 30,
              paddingBlock: 14,
            }}
          >
            {renderRuns(slots.cta_pill.runs, p, "text", tpl.fonts)}
          </div>
        )}
      </div>
      <div style={{ height: figureH, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 32 }}>
        {figureSrc ? (
          // A cut-out figure STANDING in the slide: bottom-anchored, sized by
          // height so the head sits in the upper third of the figure zone, and
          // with no frame, border, radius, shadow or mask anywhere near it.
          // Reaching this branch at all means a genuine transparent cut-out
          // exists, so nothing has to be dissolved into the background.
          <div
            style={{
              width: tpl.geometry.closeFigureW,
              flex: "0 0 auto",
              height: "100%",
              backgroundImage: `url(${figureSrc})`,
              backgroundSize: "auto 100%",
              backgroundPosition: deck.dir === "rtl" ? "bottom right" : "bottom left",
              backgroundRepeat: "no-repeat",
              border: "none",
              borderRadius: 0,
              boxShadow: "none",
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
              tpl={tpl}
              style={{ fontFamily: fontFor(p, "text", tpl.fonts), fontWeight: 800, fontSize: s.h2, color: theme.head, textAlign: "start" }}
            />
            <Txt
              node={deck.profile.title}
              primary={p}
              tpl={tpl}
              style={{ fontFamily: fontFor(p, "text", tpl.fonts), fontSize: s.data, color: theme.dim, textAlign: "start" }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <LinkedInGlyph size={Math.round(parseInt(s.source, 10) * 1.1)} color={theme.dim} />
              <span style={{ fontFamily: tpl.fonts.mono, fontSize: s.source, color: theme.dim }} dir="ltr">
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
  /** Layout family. Falls back to the deck's own, then to `instrument`. */
  template?: string | null;
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

export function Slide({ deck, slide, theme: themeName, template, onFit }: SlideProps) {
  const theme = getTheme(themeName ?? deck.theme);
  // Resolved ONCE. Every dimension, font and radius below is read from here.
  const tpl = getTemplate(template ?? (deck as { template?: string | null }).template);
  const ref = useRef<HTMLDivElement | null>(null);
  const photo = photoSrc(slide);
  const variant = variantFor(slide, Boolean(photo));
  /**
   * X2 — the ladder must measure the composition that is actually on screen.
   * The photo and the variant are part of the cache key, so adding or removing
   * a picture restarts the ladder from step 0 against the NEW budget instead
   * of inheriting a measurement of a layout that no longer exists.
   */
  /**
   * MEASURED DROPS. A picture slide keeps every filled slot until the DOM
   * proves otherwise: only when the fit ladder is exhausted and the slide
   * still overflows does one more slot go, lowest priority first. Reset
   * whenever the composition changes.
   */
  const baseSignature =
    `${deck.deck_id}:${slide.index}:${themeName ?? deck.theme}` +
    `:${plainText(slide.slots.headline)}:${variant}:${photo ?? "no-photo"}`;
  const [drops, setDrops] = useState(0);
  const lastBase = useRef(baseSignature);
  if (lastBase.current !== baseSignature) {
    lastBase.current = baseSignature;
    if (drops !== 0) setDrops(0);
  }
  const signature = `${baseSignature}:d${drops}`;
  // Every variant now gets the FULL ladder: type may shrink to fit before a
  // single word of the member's is given up.
  const fit = useFitLadder(ref, signature, MAX_FIT_STEP);
  // X1 — in the band variant the type gets LARGER, not smaller: fewer words
  // in less space. It still rides the ladder from that raised starting point.
  const s = scaleOf(fit.scale * (variant === "band" ? tpl.geometry.bandTypeBoost : 1), tpl.ramp);
  const hideTails = fit.step >= 2;

  const mediaDefect = useMediaInDom(ref, slide, `${signature}|${fit.step}`);
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
  /**
   * Z2 — THE BAND VARIANT DROPS ONLY WHAT MEASUREMENT PROVED CANNOT FIT.
   *
   * `drops` comes from the ladder, not from a constant. The inspector reads
   * the published result of the same measurement, so a field is named to the
   * member if and only if the slide is genuinely not drawing it. A cover
   * drops nothing: the photo sits behind the type.
   */
  const bandPlan = variant === "band"
    ? pictureTextPlan(slide.archetype, slide.slots as Record<string, unknown>, true, drops)
    : null;
  const droppable = variant === "band" ? droppableSlotCount(slide.slots as Record<string, unknown>) : 0;

  // Escalate ONE slot at a time, and only once the type can shrink no further.
  useEffect(() => {
    if (variant !== "band" || !fit.failed || mediaDefect) return;
    if (drops < droppable) setDrops((d) => d + 1);
  }, [variant, fit.failed, mediaDefect, drops, droppable]);

  // Publish what measurement decided, for the inspector to name.
  useEffect(() => {
    publishMeasuredDrops(deck.deck_id, slide.index, {
      dropped: bandPlan?.dropped ?? [],
      overflow: Boolean(fit.failed && !mediaDefect && drops >= droppable),
    });
  }, [deck.deck_id, slide.index, bandPlan?.dropped.join("|"), fit.failed, mediaDefect, drops, droppable]);

  const drawnSlide: SlideIR = bandPlan && bandPlan.dropped.length
    ? {
        ...slide,
        slots: Object.fromEntries(
          Object.entries(slide.slots).filter(([k]) => k === "media" || !bandPlan.dropped.includes(k)),
        ) as SlideIR["slots"],
      }
    : slide;
  const body = <SlideBody deck={deck} slide={drawnSlide} theme={theme} s={s} tpl={tpl} hideTails={hideTails} />;

  return (
    <div
      ref={ref}
      data-fit={fit.step}
      data-slide-root={slide.index}
      data-archetype={slide.archetype}
      data-template={tpl.id}
      data-bg={theme.bgSolid}
      dir={deck.dir}
      lang={deck.primary_lang}
      style={{
        // The descriptor's canvas and padding, unchanged at every fit step.
        width: tpl.geometry.canvasW,
        height: tpl.geometry.canvasH,
        padding: tpl.geometry.pad,
        boxSizing: "border-box",
        overflow: "hidden",
        position: "relative",
        background: theme.bg,
        color: theme.fg,
        textAlign: "start",
        fontFamily: fontFor(deck.primary_lang, "text", tpl.fonts),
        // Western digits everywhere, Arabic included.
        fontVariantNumeric: "lining-nums tabular-nums",
      }}
    >
      {/* Media is drawn HERE, from the table, for every archetype — never from
          inside an archetype's own switch case. */}
      {variant === "cover" && <MediaCover slide={slide} deck={deck} theme={theme} tpl={tpl} />}
      {isClose ? (
        <CloseSlide deck={deck} slide={slide} theme={theme} s={s} tpl={tpl} hideTails={hideTails} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: s.gap, position: "relative" }}>
          <IdentityBar deck={deck} theme={theme} s={s} tpl={tpl} />
          {variant === "band" ? (
            // The picture variant: a FIXED two-zone split. The image share is a
            // constant of the canvas, never a function of the word count, and
            // the text zone clips rather than overflowing or shrinking into
            // illegibility — the inspector offers to shorten the words instead.
            <div style={{ flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column" }}>
              <div style={{ flex: "1 1 auto", minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                {body}
              </div>
              <MediaBand slide={slide} theme={theme} tpl={tpl} />
            </div>
          ) : (
            <div style={{ flex: "1 1 auto", minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "center" }}>
              {variant === "cover"
                ? <CoverBody deck={deck} slide={slide} theme={theme} s={s} tpl={tpl} hideTails={hideTails} />
                : body}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flex: "0 0 auto" }}>
            <div style={{ height: 4, width: 96, borderRadius: tpl.geometry.radiusChip, background: theme.accent }} />
            <span style={{ fontFamily: tpl.fonts.mono, fontSize: s.source, color: theme.dim }} dir="ltr">
              {slide.index + 1} / {deck.slides.length}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default Slide;