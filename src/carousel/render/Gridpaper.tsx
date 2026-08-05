/**
 * GRIDPAPER — template 06 of the locked v7.4 library. A graph-paper ground,
 * Poppins throughout, and slides that alternate cream and dark.
 *
 * Same standing laws as every other family:
 * RULE A — no CSS custom properties in this subtree; every colour is an inline
 * literal from the theme object, because html-to-image cannot resolve custom
 * properties from inside its iframe.
 * RULE B — no network fonts. Poppins and IBM Plex Sans Arabic are bundled.
 * RULE C — the graph rule and the halftone corner are deterministic CSS
 * gradients. No feTurbulence, no noise filter, no mix-blend-mode.
 *
 * THE INVERSION. This is the only family with dark slides, so it is the only
 * one that reads `theme.invert` / `theme.invertFg`. Both are declared colours
 * from the locked palette, and `data-bg` follows the slide's real ground so
 * the PDF composite matches the pixels.
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
import { getTheme, type Theme } from "./themes";
import { getTemplate, GRIDPAPER_GRID_PITCH, type FontSet, type TemplateDescriptor } from "./template";
import { MAX_FIT_STEP, useFitLadder, type FitState } from "./useFitLadder";
import { checkEngagementRow, checkTypeFloor } from "../invariants";
import EngagementRow from "./EngagementRow";
import { gridpaperHalftone, gridpaperHalftoneMask, gridpaperRule } from "./paperPatterns";

type Lang = "en" | "ar";

/** Which archetypes print on the dark ground. The alternation is data. */
const DARK_ARCHETYPES = new Set(["frame", "quote"]);

/** The ink pair actually in force on a slide, after the inversion is applied. */
interface Ink {
  ground: string;
  fg: string;
  head: string;
  dim: string;
  rule: string;
  /** The ground a slab paints on this slide, and the word colour on it. */
  slab: string;
  slabWord: string;
}

function inkFor(theme: Theme, dark: boolean): Ink {
  const invert = theme.invert ?? theme.fg;
  const invertFg = theme.invertFg ?? theme.bgSolid;
  if (dark) {
    return {
      ground: invert,
      fg: invertFg,
      head: invertFg,
      dim: "rgba(246,239,226,.72)",
      rule: "rgba(246,239,226,.26)",
      // On a dark slide the emphasis device is the yellow swipe: accent ground,
      // accentInk word. Both are declared and both clear 4.5:1.
      slab: theme.accent,
      slabWord: theme.accentInk,
    };
  }
  return {
    ground: theme.bgSolid,
    fg: theme.fg,
    head: theme.head,
    dim: theme.dim,
    rule: theme.rule,
    // On a cream slide it is the black slab with the yellow word.
    slab: invert,
    slabWord: theme.accent,
  };
}

/* ------------------------------------------------------------------ */
/* Type                                                                */
/* ------------------------------------------------------------------ */

function fontFor(lang: Lang, fonts: FontSet): string {
  return lang === "ar" ? fonts.arabic : fonts.textEn;
}

/** Display: Poppins 700 in Latin, IBM Plex Sans Arabic 700 in Arabic. */
function displayWeight(): number {
  return 700;
}

function displayFamily(lang: Lang, fonts: FontSet): string {
  return lang === "ar" ? fonts.arabic : fonts.displayEn;
}

interface Sizes {
  display: number; displayLh: number;
  headline: number; headlineLh: number;
  content: number; contentLh: number;
  identityName: number; identitySub: number;
  meta: number;
  gap: number;
}

function sizesFor(scale: number, tpl: TemplateDescriptor, lang: Lang): Sizes {
  const r = tpl.ramp;
  const floors = r.floors ?? { content: 0, meta: 0 };
  const px = (n: number) => Math.round(n * scale);
  return {
    display: Math.max(px(lang === "ar" ? r.heroAr : r.heroEn), px(r.h2)),
    displayLh: lang === "ar" ? r.heroArLh : r.heroEnLh,
    headline: Math.max(px(r.h2), floors.content),
    headlineLh: lang === "ar" ? r.heroArLh : r.h2Lh,
    // THE FLOOR IS NOT ADVISORY.
    content: Math.max(px(r.body), floors.content),
    contentLh: lang === "ar" ? r.bodyLhAr : r.bodyLhEn,
    identityName: Math.max(px(r.identityName ?? r.chip), floors.meta),
    identitySub: Math.max(px(r.identitySub ?? r.source), floors.meta),
    meta: Math.max(px(r.source), floors.meta),
    gap: Math.round(r.gap * scale),
  };
}

/* ------------------------------------------------------------------ */
/* Bidi-safe runs                                                      */
/* ------------------------------------------------------------------ */

function renderRuns(runs: Run[], primary: Lang, fonts: FontSet) {
  return runs.map((run, i) => {
    if (run.lang === primary) return <React.Fragment key={i}>{run.t}</React.Fragment>;
    return (
      <span
        key={i}
        lang={run.lang}
        dir={run.lang === "ar" ? "rtl" : "ltr"}
        style={{ unicodeBidi: "isolate", fontFamily: fontFor(run.lang, fonts) }}
      >
        {run.t}
      </span>
    );
  });
}

/* ------------------------------------------------------------------ */
/* Signature devices                                                   */
/* ------------------------------------------------------------------ */

/** The slab. Flat, no rotation in this family — the grid is the tilt-free one. */
function Slab({ runs, primary, theme, fonts, ink, style }: {
  runs: Run[]; primary: Lang; theme: Theme; fonts: FontSet; ink: Ink; style?: React.CSSProperties;
}) {
  return (
    <span
      data-slab=""
      style={{
        display: "inline-block",
        background: ink.slab,
        color: ink.slabWord,
        padding: "6px 20px",
        ...style,
      }}
    >
      {renderRuns(runs, primary, fonts)}
    </span>
  );
}

/** Outlined double quote marks. Mirrored in RTL so they open the right way. */
function QuoteMarks({ size, color, rtl }: { size: number; color: string; rtl: boolean }) {
  return (
    <svg
      width={size} height={Math.round(size * 0.78)} viewBox="0 0 100 78" fill="none"
      stroke={color} strokeWidth={5} strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: "block", flex: "0 0 auto", transform: rtl ? "scaleX(-1)" : undefined }}
    >
      <path d="M8 70 V34 C8 18 18 8 34 8 V26 C26 26 22 30 22 38 H38 V70 Z" />
      <path d="M60 70 V34 C60 18 70 8 86 8 V26 C78 26 74 30 74 38 H90 V70 Z" />
    </svg>
  );
}

/** The halftone corner. Two radial-gradient dot fields, no filter. */
function HalftoneCorner({ color, rtl }: { color: string; rtl: boolean }) {
  const dots = gridpaperHalftone(color);
  const mask = gridpaperHalftoneMask(rtl);
  return (
    <div
      aria-hidden
      data-halftone=""
      data-css={dots}
      style={{
        position: "absolute",
        bottom: 0,
        [rtl ? "left" : "right"]: 0,
        width: 320,
        height: 320,
        backgroundImage: dots,
        backgroundSize: "26px 26px, 26px 26px",
        backgroundPosition: "0 0, 13px 13px",
        // A gradient mask, so the field fades instead of stopping on an edge.
        maskImage: mask,
        WebkitMaskImage: mask,
      }}
    />
  );
}

function LinkedInGlyph({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true" style={{ display: "block", flex: "0 0 auto" }}>
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14zM7.12 20.45H3.55V9h3.57v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.55C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.72C24 .77 23.2 0 22.22 0z" />
    </svg>
  );
}

function SaveIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: "block" }}>
      <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-5-7 5V4a1 1 0 0 1 1-1z" />
    </svg>
  );
}

/** COVER ONLY. Bottom-end of the rail, which is the LEFT corner in RTL. */
function ArrowMark({ size, color, rtl }: { size: number; color: string; rtl: boolean }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: "block", transform: rtl ? "scaleX(-1)" : undefined }}
    >
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}

function Header({ deck, s, tpl, ink, isCover }: {
  deck: DeckIR; s: Sizes; tpl: TemplateDescriptor; ink: Ink; isCover: boolean;
}) {
  const p = deck.primary_lang;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 32, flex: "0 0 auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, minWidth: 0 }}>
        <span
          style={{
            fontFamily: fontFor(p, tpl.fonts),
            fontWeight: 700,
            fontSize: s.identitySub,
            letterSpacing: p === "ar" ? "0" : ".1em",
            textTransform: p === "ar" ? "none" : "uppercase",
            color: ink.head,
          }}
        >
          {renderRuns(deck.profile.name.runs, p, tpl.fonts)}
        </span>
        {/* The masthead mark. A template constant, never a member string. */}
        <span style={{ fontFamily: tpl.fonts.textEn, fontWeight: 700, fontSize: s.identitySub, letterSpacing: ".22em", color: ink.dim }} dir="ltr">
          ✕✕✕
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 14, flex: "0 0 auto" }}>
        <span
          style={{
            fontFamily: fontFor(p, tpl.fonts),
            fontWeight: 500,
            fontSize: s.identitySub,
            letterSpacing: p === "ar" ? "0" : ".1em",
            textTransform: p === "ar" ? "none" : "uppercase",
            color: ink.dim,
          }}
        >
          {p === "ar" ? "شريحة" : "Deck"}
        </span>
        {isCover && <SaveIcon size={40} color={ink.head} />}
      </div>
    </div>
  );
}

function Footer({ deck, slide, s, tpl, ink, isCover }: {
  deck: DeckIR; slide: SlideIR; s: Sizes; tpl: TemplateDescriptor; ink: Ink; isCover: boolean;
}) {
  const rtl = deck.dir === "rtl";
  const p = deck.primary_lang;
  const n = slide.index + 1;
  // DeckIR declares western numerals only.
  const numeral = String(n).padStart(2, "0");
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 32, flex: "0 0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* The glyph REPLACES "in/". Never both. */}
        <LinkedInGlyph size={Math.round(s.meta * 1.1)} color={ink.fg} />
        {deck.profile.handle && (
          <span style={{ fontFamily: tpl.fonts.textEn, fontWeight: 500, fontSize: s.meta, color: ink.fg }} dir="ltr">
            {deck.profile.handle}
          </span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 20, flex: "0 0 auto" }}>
        {/* The rotated pagination mark. Mirrors with the reading direction. */}
        <span
          data-pagination=""
          style={{
            fontFamily: tpl.fonts.textEn,
            fontWeight: 500,
            fontSize: s.meta,
            letterSpacing: ".12em",
            color: ink.dim,
            transform: `rotate(${rtl ? 90 : -90}deg)`,
            transformOrigin: "center",
            whiteSpace: "nowrap",
          }}
        >
          {p === "ar" ? `صفحة ${numeral}` : `page ${numeral}`}
        </span>
        {isCover && <ArrowMark size={54} color={ink.head} rtl={rtl} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Background — the graph rule. repeating-linear-gradient, no filter.   */
/* ------------------------------------------------------------------ */

function Background({ ink, dark }: { ink: Ink; dark: boolean }) {
  const line = dark ? "rgba(246,239,226,.09)" : "rgba(20,18,16,.09)";
  const rule = gridpaperRule(line, GRIDPAPER_GRID_PITCH);
  return (
    <>
      <div aria-hidden style={{ position: "absolute", inset: 0, background: ink.ground }} />
      <div aria-hidden data-grid="" data-css={rule} style={{ position: "absolute", inset: 0, backgroundImage: rule }} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Small parts                                                         */
/* ------------------------------------------------------------------ */

interface PartProps {
  deck: DeckIR;
  slide: SlideIR;
  theme: Theme;
  ink: Ink;
  s: Sizes;
  tpl: TemplateDescriptor;
  hideTails: boolean;
  rtl: boolean;
}

function Stack({ children, gap }: { children: React.ReactNode; gap: number }) {
  return <div style={{ display: "flex", flexDirection: "column", gap, alignItems: "stretch" }}>{children}</div>;
}

function Display({ lines, primary, theme, ink, s, tpl, marked }: {
  lines?: HeroLine[]; primary: Lang; theme: Theme; ink: Ink; s: Sizes; tpl: TemplateDescriptor;
  marked?: (line: HeroLine, i: number) => boolean;
}) {
  if (!lines?.length) return null;
  const test = marked ?? ((l: HeroLine) => Boolean(l.highlight));
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: primary === "ar" ? 12 : 6 }}>
      {lines.map((line, i) => (
        <span
          key={i}
          data-hero-line=""
          style={{
            display: "inline-block",
            fontFamily: displayFamily(primary, tpl.fonts),
            fontWeight: displayWeight(),
            fontSize: s.display,
            lineHeight: s.displayLh,
            color: ink.head,
          }}
        >
          {test(line, i)
            ? <Slab runs={line.runs} primary={primary} theme={theme} fonts={tpl.fonts} ink={ink} />
            : renderRuns(line.runs, primary, tpl.fonts)}
        </span>
      ))}
    </div>
  );
}

function Headline({ node, primary, ink, s, tpl }: {
  node?: TextNode; primary: Lang; ink: Ink; s: Sizes; tpl: TemplateDescriptor;
}) {
  if (!node) return null;
  return (
    <div
      style={{
        fontFamily: displayFamily(primary, tpl.fonts),
        fontWeight: displayWeight(),
        fontSize: s.headline,
        lineHeight: s.headlineLh,
        color: ink.head,
        textAlign: "start",
      }}
    >
      {renderRuns(node.runs, primary, tpl.fonts)}
    </div>
  );
}

function Body({ nodes, primary, ink, s, tpl, hideTails }: {
  nodes?: TextNode[]; primary: Lang; ink: Ink; s: Sizes; tpl: TemplateDescriptor; hideTails: boolean;
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
            fontFamily: fontFor(primary, tpl.fonts),
            fontWeight: primary === "ar" ? 400 : 500,
            fontSize: s.content,
            lineHeight: s.contentLh,
            color: ink.fg,
            textAlign: "start",
          }}
        >
          {renderRuns(n.runs, primary, tpl.fonts)}
        </div>
      ))}
    </div>
  );
}

function Meta({ node, primary, ink, s, tpl }: {
  node?: TextNode; primary: Lang; ink: Ink; s: Sizes; tpl: TemplateDescriptor;
}) {
  if (!node) return null;
  return (
    <div style={{ fontFamily: fontFor(primary, tpl.fonts), fontWeight: 500, fontSize: s.meta, color: ink.dim, textAlign: "start" }}>
      {renderRuns(node.runs, primary, tpl.fonts)}
    </div>
  );
}

/** Bars, with the value word in yellow. No red: ink IS the alert. */
function Bars({ slide, theme, ink, s, tpl, deck }: PartProps) {
  const p = deck.primary_lang;
  const series = slide.slots.media?.chart?.series ?? [];
  if (!series.length) return null;
  const max = Math.max(...series.map((x) => Math.abs(x.value))) || 1;
  return (
    <div data-media-node="chart" style={{ display: "flex", flexDirection: "column", gap: Math.round(s.gap * 0.9) }}>
      {series.map((item, i) => {
        const fill = item.emphasis === "alert" ? ink.fg : theme.accent;
        return (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16 }}>
              <span style={{ fontFamily: fontFor(p, tpl.fonts), fontWeight: 500, fontSize: Math.max(s.meta, 28), color: ink.fg }}>
                {renderRuns(item.label.runs, p, tpl.fonts)}
              </span>
              <span style={{ fontFamily: tpl.fonts.textEn, fontWeight: 700, fontSize: Math.max(s.meta, 28), color: ink.head }} dir="ltr">
                {item.value}{item.unit ?? ""}
              </span>
            </div>
            <div style={{ height: 22, background: theme.neutral, overflow: "hidden" }}>
              <div style={{ width: `${(Math.abs(item.value) / max) * 100}%`, height: "100%", background: fill }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function IdentityCard({ deck, theme, ink, s, tpl }: { deck: DeckIR; theme: Theme; ink: Ink; s: Sizes; tpl: TemplateDescriptor }) {
  const p = deck.primary_lang;
  const avatar = deck.profile.avatar_url;
  const initials = (deck.profile.initials ?? "").trim();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      {avatar ? (
        <img src={avatar} alt="" style={{ width: 92, height: 92, objectFit: "cover", flex: "0 0 auto" }} />
      ) : initials ? (
        <div
          style={{
            width: 92, height: 92, flex: "0 0 auto",
            background: ink.slab, color: ink.slabWord,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: tpl.fonts.textEn, fontWeight: 700, fontSize: 38,
          }}
          dir="ltr"
        >
          {initials}
        </div>
      ) : (
        // No photo and no initials: a yellow rule, never a fabricated monogram.
        <div style={{ width: 12, height: 92, background: theme.accent, flex: "0 0 auto" }} />
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
        <div style={{ fontFamily: fontFor(p, tpl.fonts), fontWeight: 700, fontSize: s.identityName, color: ink.head, textAlign: "start" }}>
          {renderRuns(deck.profile.name.runs, p, tpl.fonts)}
        </div>
        {deck.profile.title && (
          <div style={{ fontFamily: fontFor(p, tpl.fonts), fontWeight: 500, fontSize: s.identitySub, color: ink.fg, opacity: 0.78, textAlign: "start" }}>
            {renderRuns(deck.profile.title.runs, p, tpl.fonts)}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The nine archetypes                                                 */
/* ------------------------------------------------------------------ */

function GridpaperBody(props: PartProps) {
  const { deck, slide, theme, ink, s, tpl, hideTails, rtl } = props;
  const p = deck.primary_lang;
  const slots = slide.slots;
  const common = { primary: p, ink, s, tpl } as const;
  const displayCommon = { primary: p, theme, ink, s, tpl } as const;

  switch (slide.archetype) {
    /* 1 — quote marks over the headline, one word in the slab. */
    case "cover_hero":
      return (
        <Stack gap={s.gap}>
          <QuoteMarks size={128} color={theme.accent} rtl={rtl} />
          <Display lines={slots.hero_lines} {...displayCommon} />
          {slots.subline && (
            <div
              style={{
                fontFamily: fontFor(p, tpl.fonts),
                fontWeight: p === "ar" ? 400 : 500,
                fontSize: Math.max(Math.round(s.content * 0.85), tpl.ramp.floors?.content ?? 0),
                lineHeight: s.contentLh,
                color: ink.fg,
                textAlign: "start",
              }}
            >
              {renderRuns(slots.subline.runs, p, tpl.fonts)}
            </div>
          )}
        </Stack>
      );

    /* 2 — the stat is the slab word. */
    case "cover_stat":
      return (
        <Stack gap={s.gap}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10 }}>
            {slots.stat_value && (
              <span
                data-hero-line=""
                dir="ltr"
                style={{ display: "inline-block", fontFamily: tpl.fonts.displayEn, fontWeight: 700, fontSize: s.display, lineHeight: s.displayLh }}
              >
                <Slab runs={[{ t: slots.stat_value, lang: "en" }]} primary="en" theme={theme} fonts={tpl.fonts} ink={ink} />
              </span>
            )}
            <Display lines={slots.hero_lines} {...displayCommon} marked={() => false} />
          </div>
          <Headline node={slots.stat_label} {...common} />
          <Meta node={slots.source} {...common} />
        </Stack>
      );

    /* 3 — DARK slide, with the yellow swipe carrying the keyword. */
    case "frame":
      return (
        <Stack gap={s.gap}>
          <Display lines={slots.hero_lines} {...displayCommon} />
          <Headline node={slots.headline} {...common} />
          <Body nodes={slots.body} primary={p} ink={ink} s={s} tpl={tpl} hideTails={hideTails} />
        </Stack>
      );

    /* 4 — quote marks, then the body and its source. */
    case "evidence":
      return (
        <Stack gap={s.gap}>
          <QuoteMarks size={96} color={theme.accent} rtl={rtl} />
          {slots.stat_value && (
            <span
              data-hero-line=""
              dir="ltr"
              style={{ display: "inline-block", fontFamily: tpl.fonts.displayEn, fontWeight: 700, fontSize: s.display, lineHeight: s.displayLh, color: ink.head }}
            >
              {slots.stat_value}
            </span>
          )}
          <Headline node={slots.stat_label} {...common} />
          <Body nodes={slots.body} primary={p} ink={ink} s={s} tpl={tpl} hideTails={hideTails} />
          <Meta node={slots.source} {...common} />
        </Stack>
      );

    /* 5 — bars, the figure in the slab word colour. */
    case "benchmark":
      return (
        <Stack gap={s.gap}>
          <Headline node={slots.headline} {...common} />
          <Bars {...props} />
          <Meta node={slots.source} {...common} />
        </Stack>
      );

    /* 6 — DARK slide, quote marks, the quotation set large. */
    case "quote": {
      const quoteRuns = slots.quote?.runs ?? [];
      return (
        <Stack gap={s.gap}>
          <QuoteMarks size={112} color={theme.accent} rtl={rtl} />
          <div
            style={{
              fontFamily: displayFamily(p, tpl.fonts),
              fontWeight: displayWeight(),
              fontSize: Math.max(Math.round(s.headline * 0.86), tpl.ramp.floors?.content ?? 0),
              lineHeight: p === "ar" ? tpl.ramp.heroArLh : 1.2,
              color: ink.head,
              textAlign: "start",
            }}
          >
            {quoteRuns.length ? renderRuns(quoteRuns, p, tpl.fonts) : null}
          </div>
          <Meta node={slots.source} {...common} />
        </Stack>
      );
    }

    /* 7 — numbered rows, the numeral alternating dark and cream. */
    case "steps": {
      const rows = (slots.checklist ?? []).slice(0, 4);
      const numeral = (n: number) => String(n).padStart(2, "0");
      return (
        <Stack gap={s.gap}>
          <Headline node={slots.headline} {...common} />
          <div style={{ display: "flex", flexDirection: "column", gap: Math.round(s.gap * 0.9) }}>
            {rows.map((item, i) => {
              const text = plainText(item);
              const cut = text.indexOf(".");
              const title = cut > 0 ? text.slice(0, cut + 1) : text;
              const detail = cut > 0 ? text.slice(cut + 1).trim() : "";
              // The alternation: even rows carry the slab, odd rows the outline.
              const solid = i % 2 === 0;
              return (
                <div key={i} style={{ display: "flex", gap: 22, alignItems: "flex-start" }}>
                  <span
                    dir="ltr"
                    style={{
                      display: "inline-block",
                      flex: "0 0 auto",
                      padding: "4px 16px",
                      background: solid ? ink.slab : "transparent",
                      color: solid ? ink.slabWord : ink.head,
                      border: solid ? "none" : `3px solid ${ink.head}`,
                      fontFamily: tpl.fonts.displayEn,
                      fontWeight: 700,
                      fontSize: Math.max(s.content, tpl.ramp.floors?.content ?? 0),
                    }}
                  >
                    {numeral(i + 1)}
                  </span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                    <div style={{ fontFamily: fontFor(p, tpl.fonts), fontWeight: 700, fontSize: Math.max(s.content, tpl.ramp.floors?.content ?? 0), lineHeight: p === "ar" ? tpl.ramp.bodyLhAr : 1.3, color: ink.head, textAlign: "start" }}>
                      {title}
                    </div>
                    {detail && (
                      <div style={{ fontFamily: fontFor(p, tpl.fonts), fontWeight: p === "ar" ? 400 : 500, fontSize: Math.max(Math.round(s.content * 0.85), tpl.ramp.floors?.content ?? 0), lineHeight: 1.5, color: ink.dim, textAlign: "start" }}>
                        {detail}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Stack>
      );
    }

    /* 8 — the term in the slab, the definition under it. */
    case "definition":
      return (
        <Stack gap={s.gap}>
          <Display lines={slots.hero_lines} {...displayCommon} marked={() => false} />
          {slots.term && (
            <div style={{ fontFamily: displayFamily(p, tpl.fonts), fontWeight: displayWeight(), fontSize: s.headline, lineHeight: s.headlineLh, textAlign: "start" }}>
              <Slab runs={slots.term.runs} primary={p} theme={theme} fonts={tpl.fonts} ink={ink} />
            </div>
          )}
          {slots.term_def && (
            <div style={{ fontFamily: fontFor(p, tpl.fonts), fontWeight: p === "ar" ? 400 : 500, fontSize: s.content, lineHeight: s.contentLh, color: ink.fg, textAlign: "start" }}>
              {renderRuns(slots.term_def.runs, p, tpl.fonts)}
            </div>
          )}
          <Body nodes={slots.body} primary={p} ink={ink} s={s} tpl={tpl} hideTails={hideTails} />
        </Stack>
      );

    /* 9 — the ask in a slab, the identity in a box, the engagement row. */
    case "close": {
      const ctaLines: TextNode[] = [];
      if (slots.hero_lines?.length) {
        for (const l of slots.hero_lines.slice(0, 2)) ctaLines.push({ runs: l.runs });
      }
      if (ctaLines.length < 2 && slots.cta_pill) ctaLines.push(slots.cta_pill);
      if (ctaLines.length < 2 && slots.headline) ctaLines.push(slots.headline);
      return (
        <Stack gap={s.gap}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12 }}>
            {ctaLines.slice(0, 2).map((n, i) => (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  fontFamily: displayFamily(p, tpl.fonts),
                  fontWeight: displayWeight(),
                  fontSize: Math.max(Math.round(s.headline * 0.9), tpl.ramp.floors?.content ?? 0),
                  lineHeight: p === "ar" ? tpl.ramp.heroArLh : 1.18,
                }}
              >
                {i === 0
                  ? <Slab runs={n.runs} primary={p} theme={theme} fonts={tpl.fonts} ink={ink} />
                  : <span style={{ color: ink.head }}>{renderRuns(n.runs, p, tpl.fonts)}</span>}
              </span>
            ))}
          </div>
          <Body nodes={slots.body} primary={p} ink={ink} s={s} tpl={tpl} hideTails={hideTails} />
          {/* The identity box: an outline, so the card reads as a card. */}
          <div style={{ border: `3px solid ${ink.head}`, padding: 24 }}>
            <IdentityCard deck={deck} theme={theme} ink={ink} s={s} tpl={tpl} />
          </div>
          <EngagementRow color={ink.fg} size={48} />
        </Stack>
      );
    }

    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Root                                                                */
/* ------------------------------------------------------------------ */

export interface GridpaperSlideProps {
  deck: DeckIR;
  slide: SlideIR;
  theme?: string | null;
  template?: string | null;
  onFit?: (state: FitState) => void;
}

export function GridpaperSlide({ deck, slide, theme: themeName, template, onFit }: GridpaperSlideProps) {
  const theme = getTheme(themeName ?? deck.theme);
  const tpl = getTemplate(template ?? (deck as { template?: string | null }).template);
  const ref = useRef<HTMLDivElement | null>(null);
  const p = deck.primary_lang;
  const rtl = deck.dir === "rtl";

  const dark = DARK_ARCHETYPES.has(slide.archetype);
  const ink = inkFor(theme, dark);

  const signature =
    `${deck.deck_id}:${slide.index}:${themeName ?? deck.theme}:${tpl.id}` +
    `:${plainText(slide.slots.headline)}`;
  const fit = useFitLadder(ref, signature, MAX_FIT_STEP);
  const s = sizesFor(fit.scale, tpl, p);
  const hideTails = fit.step >= 2;

  const isCover = slide.archetype === "cover_hero" || slide.archetype === "cover_stat";
  const isClose = slide.archetype === "close";
  const where = `slide ${slide.index + 1} (${slide.archetype})`;

  const floors = tpl.ramp.floors ?? { content: 0, meta: 0 };
  const floorDefect = checkTypeFloor(where, { content: s.content, meta: s.meta }, floors);
  const rowDefect = checkEngagementRow(where, slide.archetype, isClose);
  const defect = floorDefect ?? rowDefect;

  const reported: FitState = defect ? { ...fit, failed: true, reason: defect } : fit;
  const lastReported = useRef<string>("");
  const key = `${reported.step}|${reported.failed}|${reported.reason ?? ""}`;
  if (onFit && lastReported.current !== key) {
    lastReported.current = key;
    queueMicrotask(() => onFit(reported));
  }

  const g = tpl.geometry;
  const inset = (g.contentX ?? g.pad) - g.pad;

  return (
    <div
      ref={ref}
      data-fit={fit.step}
      data-slide-root={slide.index}
      data-archetype={slide.archetype}
      data-template={tpl.id}
      /* The exporter composites against the slide's REAL ground, which on this
         family is not always the theme's paper. */
      data-bg={ink.ground}
      dir={deck.dir}
      lang={p}
      style={{
        width: g.canvasW,
        height: g.canvasH,
        padding: g.pad,
        boxSizing: "border-box",
        overflow: "hidden",
        position: "relative",
        background: ink.ground,
        color: ink.fg,
        textAlign: "start",
        fontFamily: fontFor(p, tpl.fonts),
        fontVariantNumeric: "lining-nums tabular-nums",
      }}
    >
      <Background ink={ink} dark={dark} />
      {isCover && <HalftoneCorner color={dark ? "rgba(246,239,226,.22)" : "rgba(20,18,16,.16)"} rtl={rtl} />}
      <div style={{ position: "relative", display: "flex", flexDirection: "column", height: "100%", gap: s.gap }}>
        <Header deck={deck} s={s} tpl={tpl} ink={ink} isCover={isCover} />
        <div
          style={{
            flex: "1 1 auto",
            minHeight: 0,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            marginInlineStart: inset,
            maxWidth: g.maxTextW,
          }}
        >
          <GridpaperBody deck={deck} slide={slide} theme={theme} ink={ink} s={s} tpl={tpl} hideTails={hideTails} rtl={rtl} />
        </div>
        <Footer deck={deck} slide={slide} s={s} tpl={tpl} ink={ink} isCover={isCover} />
      </div>
    </div>
  );
}

export default GridpaperSlide;
