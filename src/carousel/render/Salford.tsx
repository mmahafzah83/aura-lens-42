/**
 * SALFORD — template 01 of the locked v7.4 library. A flat navy field that
 * ALTERNATES with a mint one, Montserrat throughout, and a dot-matrix
 * signature in the corner.
 *
 * Same standing laws as every other family:
 * RULE A — no CSS custom properties in this subtree; every colour is an inline
 * literal from the theme object, because html-to-image cannot resolve custom
 * properties from inside its iframe.
 * RULE B — no network fonts. Montserrat and Cairo are bundled.
 * RULE C — the dot matrix is a deterministic CSS gradient. No feTurbulence, no
 * noise filter, no mix-blend-mode.
 *
 * THE ALTERNATION. Interior slides flip to the mint ground on odd steps, so
 * the deck paces itself without any slide needing to know what came before it
 * — the index is the whole rule. Cover and close always hold the navy, because
 * the first and last thing a reader sees should be the same colour. `invert`
 * and `invertFg` are declared colours from the locked palette, and `data-bg`
 * follows the slide's real ground so the PDF composite matches the pixels.
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
import { getTemplate, SALFORD_DOT_PITCH, type FontSet, type TemplateDescriptor } from "./template";
import { MAX_FIT_STEP, useFitLadder, type FitState } from "./useFitLadder";
import { checkEngagementRow, checkTypeFloor } from "../invariants";
import EngagementRow from "./EngagementRow";
import { dotMatrix } from "./fieldPatterns";

type Lang = "en" | "ar";

/** Cover and close hold the navy. Everything between alternates. */
function isInverted(slide: SlideIR): boolean {
  if (slide.archetype === "cover_hero" || slide.archetype === "cover_stat") return false;
  if (slide.archetype === "close") return false;
  return slide.index % 2 === 1;
}

/** The ink pair actually in force on a slide, after the inversion is applied. */
interface Ink {
  ground: string;
  fg: string;
  head: string;
  dim: string;
  rule: string;
  /** The accent ROLE on this ground — mint on navy, navy on mint. */
  accent: string;
  /** The ground a slab paints on this slide, and the word colour on it. */
  slab: string;
  slabWord: string;
}

function inkFor(theme: Theme, inverted: boolean): Ink {
  const invert = theme.invert ?? theme.accent;
  const invertFg = theme.invertFg ?? theme.bgSolid;
  const invertAccent = theme.invertAccent ?? theme.accentInk;
  if (inverted) {
    return {
      ground: invert,
      fg: invertFg,
      head: invertFg,
      dim: "rgba(21,36,54,.74)",
      rule: "rgba(21,36,54,.28)",
      accent: invertAccent,
      // On a mint slide the emphasis device is the navy slab with a mint word.
      slab: invertAccent,
      slabWord: invert,
    };
  }
  return {
    ground: theme.bgSolid,
    fg: theme.fg,
    head: theme.head,
    dim: theme.dim,
    rule: theme.rule,
    accent: theme.accent,
    // On a navy slide it is the mint slab with the navy word.
    slab: theme.accent,
    slabWord: theme.accentInk,
  };
}

/* ------------------------------------------------------------------ */
/* Type                                                                */
/* ------------------------------------------------------------------ */

function fontFor(lang: Lang, fonts: FontSet): string {
  return lang === "ar" ? fonts.arabic : fonts.textEn;
}

/** Display: Montserrat 800 in Latin, Cairo 900 in Arabic. */
function displayWeight(lang: Lang): number {
  return lang === "ar" ? 900 : 800;
}

function displayFamily(lang: Lang, fonts: FontSet): string {
  return lang === "ar" ? fonts.arabic : fonts.displayEn;
}

/**
 * Salford sets its display in caps — but ONLY in Latin. Arabic has no case,
 * and `text-transform: uppercase` on Arabic is a no-op that still costs a
 * reflow, so it is never emitted.
 */
function displayCase(lang: Lang): React.CSSProperties {
  return lang === "ar"
    ? {}
    : { textTransform: "uppercase", letterSpacing: "-.012em" };
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

/** The slab. Flat and square — salford has no rotation anywhere. */
function Slab({ runs, primary, fonts, ink, style }: {
  runs: Run[]; primary: Lang; fonts: FontSet; ink: Ink; style?: React.CSSProperties;
}) {
  return (
    <span
      data-slab=""
      style={{
        display: "inline-block",
        background: ink.slab,
        color: ink.slabWord,
        padding: "4px 18px",
        ...style,
      }}
    >
      {renderRuns(runs, primary, fonts)}
    </span>
  );
}

/**
 * THE MOTIF — a filled square beside an outlined circle. The house mark of
 * this family, drawn as SVG so it exports as geometry rather than as a font
 * glyph that might not be embedded.
 */
function SquareCircle({ size, color }: { size: number; color: string }) {
  const unit = size;
  return (
    <svg
      width={unit * 2.3} height={unit} viewBox="0 0 46 20" fill="none"
      aria-hidden="true" data-motif="square-circle"
      style={{ display: "block", flex: "0 0 auto" }}
    >
      <rect x="1" y="1" width="18" height="18" fill={color} />
      <circle cx="35" cy="10" r="9" stroke={color} strokeWidth="2.6" />
    </svg>
  );
}

/** The dot-matrix corner. One radial-gradient dot field, tiled, no filter. */
function DotMatrix({ color, rtl }: { color: string; rtl: boolean }) {
  const dots = dotMatrix(color);
  return (
    <div
      aria-hidden
      data-dotmatrix=""
      data-css={dots}
      style={{
        position: "absolute",
        bottom: 0,
        [rtl ? "left" : "right"]: 0,
        width: SALFORD_DOT_PITCH * 12,
        height: SALFORD_DOT_PITCH * 9,
        backgroundImage: dots,
        backgroundSize: `${SALFORD_DOT_PITCH}px ${SALFORD_DOT_PITCH}px`,
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

/** COVER ONLY. Points along the reading direction, so it mirrors in RTL. */
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

function Header({ deck, s, tpl, ink }: {
  deck: DeckIR; s: Sizes; tpl: TemplateDescriptor; ink: Ink;
}) {
  const p = deck.primary_lang;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 32, flex: "0 0 auto" }}>
      <span
        style={{
          fontFamily: fontFor(p, tpl.fonts),
          fontWeight: 600,
          fontSize: s.identitySub,
          letterSpacing: p === "ar" ? "0" : ".14em",
          textTransform: p === "ar" ? "none" : "uppercase",
          color: ink.head,
          minWidth: 0,
        }}
      >
        {renderRuns(deck.profile.name.runs, p, tpl.fonts)}
      </span>
      <SquareCircle size={20} color={ink.accent} />
    </div>
  );
}

function Footer({ deck, slide, s, tpl, ink, isCover }: {
  deck: DeckIR; slide: SlideIR; s: Sizes; tpl: TemplateDescriptor; ink: Ink; isCover: boolean;
}) {
  const rtl = deck.dir === "rtl";
  const n = slide.index + 1;
  // DeckIR declares western numerals only.
  const numeral = String(n).padStart(2, "0");
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 32, flex: "0 0 auto" }}>
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
        {isCover && <ArrowMark size={50} color={ink.accent} rtl={rtl} />}
        <span
          data-pagination=""
          dir="ltr"
          style={{
            fontFamily: tpl.fonts.textEn,
            fontWeight: 600,
            fontSize: s.meta,
            letterSpacing: ".12em",
            color: ink.accent,
          }}
        >
          {numeral}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Background — flat colour. The field IS the design.                   */
/* ------------------------------------------------------------------ */

function Background({ ink }: { ink: Ink }) {
  return <div aria-hidden style={{ position: "absolute", inset: 0, background: ink.ground }} />;
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

function Display({ lines, primary, ink, s, tpl, marked }: {
  lines?: HeroLine[]; primary: Lang; ink: Ink; s: Sizes; tpl: TemplateDescriptor;
  marked?: (line: HeroLine, i: number) => boolean;
}) {
  if (!lines?.length) return null;
  const test = marked ?? ((l: HeroLine) => Boolean(l.highlight));
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: primary === "ar" ? 12 : 4 }}>
      {lines.map((line, i) => (
        <span
          key={i}
          data-hero-line=""
          style={{
            display: "inline-block",
            fontFamily: displayFamily(primary, tpl.fonts),
            fontWeight: displayWeight(primary),
            fontSize: s.display,
            lineHeight: s.displayLh,
            color: ink.head,
            ...displayCase(primary),
          }}
        >
          {test(line, i)
            ? <Slab runs={line.runs} primary={primary} fonts={tpl.fonts} ink={ink} />
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
        fontWeight: displayWeight(primary),
        fontSize: s.headline,
        lineHeight: s.headlineLh,
        color: ink.head,
        textAlign: "start",
        ...displayCase(primary),
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

/** Bars. The worst bar takes the ink, never a red this palette does not hold. */
function Bars({ slide, ink, s, tpl, deck }: PartProps) {
  const p = deck.primary_lang;
  const series = slide.slots.media?.chart?.series ?? [];
  if (!series.length) return null;
  const max = Math.max(...series.map((x) => Math.abs(x.value))) || 1;
  return (
    <div data-media-node="chart" style={{ display: "flex", flexDirection: "column", gap: Math.round(s.gap * 0.9) }}>
      {series.map((item, i) => {
        const fill = item.emphasis === "alert" ? ink.fg : ink.accent;
        return (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16 }}>
              <span style={{ fontFamily: fontFor(p, tpl.fonts), fontWeight: 500, fontSize: Math.max(s.meta, 28), color: ink.fg }}>
                {renderRuns(item.label.runs, p, tpl.fonts)}
              </span>
              <span style={{ fontFamily: tpl.fonts.textEn, fontWeight: 800, fontSize: Math.max(s.meta, 28), color: ink.head }} dir="ltr">
                {item.value}{item.unit ?? ""}
              </span>
            </div>
            <div style={{ height: 20, background: ink.rule, overflow: "hidden" }}>
              <div style={{ width: `${(Math.abs(item.value) / max) * 100}%`, height: "100%", background: fill }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function IdentityCard({ deck, ink, s, tpl }: { deck: DeckIR; ink: Ink; s: Sizes; tpl: TemplateDescriptor }) {
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
            fontFamily: tpl.fonts.textEn, fontWeight: 800, fontSize: 38,
          }}
          dir="ltr"
        >
          {initials}
        </div>
      ) : (
        // No photo and no initials: an accent rule, never a fabricated monogram.
        <div style={{ width: 12, height: 92, background: ink.accent, flex: "0 0 auto" }} />
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
        <div style={{ fontFamily: fontFor(p, tpl.fonts), fontWeight: 700, fontSize: s.identityName, color: ink.head, textAlign: "start" }}>
          {renderRuns(deck.profile.name.runs, p, tpl.fonts)}
        </div>
        {deck.profile.title && (
          <div style={{ fontFamily: fontFor(p, tpl.fonts), fontWeight: 500, fontSize: s.identitySub, color: ink.dim, textAlign: "start" }}>
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

function SalfordBody(props: PartProps) {
  const { deck, slide, ink, s, tpl, hideTails } = props;
  const p = deck.primary_lang;
  const slots = slide.slots;
  const common = { primary: p, ink, s, tpl } as const;

  switch (slide.archetype) {
    /* 1 — the rule, then the display in caps, then the subline. */
    case "cover_hero":
      return (
        <Stack gap={s.gap}>
          <div style={{ width: 168, height: 12, background: ink.accent, flex: "0 0 auto" }} />
          <Display lines={slots.hero_lines} {...common} />
          {slots.subline && (
            <div
              style={{
                fontFamily: fontFor(p, tpl.fonts),
                fontWeight: p === "ar" ? 400 : 500,
                fontSize: Math.max(Math.round(s.content * 0.9), tpl.ramp.floors?.content ?? 0),
                lineHeight: s.contentLh,
                color: ink.dim,
                textAlign: "start",
              }}
            >
              {renderRuns(slots.subline.runs, p, tpl.fonts)}
            </div>
          )}
        </Stack>
      );

    /* 2 — the figure in the accent, at display size. */
    case "cover_stat":
      return (
        <Stack gap={s.gap}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
            {slots.stat_value && (
              <span
                data-hero-line=""
                dir="ltr"
                style={{
                  display: "inline-block",
                  fontFamily: tpl.fonts.displayEn,
                  fontWeight: 800,
                  fontSize: s.display,
                  lineHeight: s.displayLh,
                  color: ink.accent,
                  letterSpacing: "-.02em",
                }}
              >
                {slots.stat_value}
              </span>
            )}
            <Display lines={slots.hero_lines} {...common} marked={() => false} />
          </div>
          <Headline node={slots.stat_label} {...common} />
          <Meta node={slots.source} {...common} />
        </Stack>
      );

    /* 3 — the frame. On an odd index this is the mint slide. */
    case "frame":
      return (
        <Stack gap={s.gap}>
          <Display lines={slots.hero_lines} {...common} />
          <Headline node={slots.headline} {...common} />
          <Body nodes={slots.body} primary={p} ink={ink} s={s} tpl={tpl} hideTails={hideTails} />
        </Stack>
      );

    /* 4 — the figure, its label, the body, the source. */
    case "evidence":
      return (
        <Stack gap={s.gap}>
          {slots.stat_value && (
            <span
              data-hero-line=""
              dir="ltr"
              style={{ display: "inline-block", fontFamily: tpl.fonts.displayEn, fontWeight: 800, fontSize: s.display, lineHeight: s.displayLh, color: ink.accent }}
            >
              {slots.stat_value}
            </span>
          )}
          <Headline node={slots.stat_label} {...common} />
          <Body nodes={slots.body} primary={p} ink={ink} s={s} tpl={tpl} hideTails={hideTails} />
          <Meta node={slots.source} {...common} />
        </Stack>
      );

    /* 5 — bars. */
    case "benchmark":
      return (
        <Stack gap={s.gap}>
          <Headline node={slots.headline} {...common} />
          <Bars {...props} />
          <Meta node={slots.source} {...common} />
        </Stack>
      );

    /* 6 — the quotation, marked by a thick accent rule on the reading edge. */
    case "quote": {
      const quoteRuns = slots.quote?.runs ?? [];
      return (
        <Stack gap={s.gap}>
          <div style={{ display: "flex", gap: 28, alignItems: "stretch" }}>
            <div style={{ width: 12, background: ink.accent, flex: "0 0 auto" }} />
            <div
              style={{
                fontFamily: displayFamily(p, tpl.fonts),
                fontWeight: displayWeight(p),
                fontSize: Math.max(Math.round(s.headline * 0.84), tpl.ramp.floors?.content ?? 0),
                lineHeight: p === "ar" ? tpl.ramp.heroArLh : 1.2,
                color: ink.head,
                textAlign: "start",
              }}
            >
              {quoteRuns.length ? renderRuns(quoteRuns, p, tpl.fonts) : null}
            </div>
          </div>
          <Meta node={slots.source} {...common} />
        </Stack>
      );
    }

    /* 7 — numbered rows, each numeral in the accent. */
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
              return (
                <div key={i} style={{ display: "flex", gap: 22, alignItems: "flex-start" }}>
                  <span
                    dir="ltr"
                    style={{
                      display: "inline-block",
                      flex: "0 0 auto",
                      minWidth: 78,
                      fontFamily: tpl.fonts.displayEn,
                      fontWeight: 800,
                      fontSize: Math.max(s.content, tpl.ramp.floors?.content ?? 0),
                      color: ink.accent,
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
          <Display lines={slots.hero_lines} {...common} marked={() => false} />
          {slots.term && (
            <div style={{ fontFamily: displayFamily(p, tpl.fonts), fontWeight: displayWeight(p), fontSize: s.headline, lineHeight: s.headlineLh, textAlign: "start", ...displayCase(p) }}>
              <Slab runs={slots.term.runs} primary={p} fonts={tpl.fonts} ink={ink} />
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

    /* 9 — the ask, the identity, the engagement row. */
    case "close": {
      const ctaLines: TextNode[] = [];
      if (slots.hero_lines?.length) {
        for (const l of slots.hero_lines.slice(0, 2)) ctaLines.push({ runs: l.runs });
      }
      if (ctaLines.length < 2 && slots.cta_pill) ctaLines.push(slots.cta_pill);
      if (ctaLines.length < 2 && slots.headline) ctaLines.push(slots.headline);
      return (
        <Stack gap={s.gap}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10 }}>
            {ctaLines.slice(0, 2).map((n, i) => (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  fontFamily: displayFamily(p, tpl.fonts),
                  fontWeight: displayWeight(p),
                  fontSize: Math.max(Math.round(s.headline * 0.9), tpl.ramp.floors?.content ?? 0),
                  lineHeight: p === "ar" ? tpl.ramp.heroArLh : 1.18,
                  ...displayCase(p),
                }}
              >
                {i === 0
                  ? <Slab runs={n.runs} primary={p} fonts={tpl.fonts} ink={ink} />
                  : <span style={{ color: ink.head }}>{renderRuns(n.runs, p, tpl.fonts)}</span>}
              </span>
            ))}
          </div>
          <Body nodes={slots.body} primary={p} ink={ink} s={s} tpl={tpl} hideTails={hideTails} />
          <IdentityCard deck={deck} ink={ink} s={s} tpl={tpl} />
          <EngagementRow color={ink.accent} size={48} />
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

export interface SalfordSlideProps {
  deck: DeckIR;
  slide: SlideIR;
  theme?: string | null;
  template?: string | null;
  onFit?: (state: FitState) => void;
}

export function SalfordSlide({ deck, slide, theme: themeName, template, onFit }: SalfordSlideProps) {
  const theme = getTheme(themeName ?? deck.theme);
  const tpl = getTemplate(template ?? (deck as { template?: string | null }).template);
  const ref = useRef<HTMLDivElement | null>(null);
  const p = deck.primary_lang;
  const rtl = deck.dir === "rtl";

  const inverted = isInverted(slide);
  const ink = inkFor(theme, inverted);

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
         family is not always the theme's navy. */
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
      <Background ink={ink} />
      {isCover && <DotMatrix color={ink.accent} rtl={rtl} />}
      <div style={{ position: "relative", display: "flex", flexDirection: "column", height: "100%", gap: s.gap }}>
        <Header deck={deck} s={s} tpl={tpl} ink={ink} />
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
          <SalfordBody deck={deck} slide={slide} theme={theme} ink={ink} s={s} tpl={tpl} hideTails={hideTails} rtl={rtl} />
        </div>
        <Footer deck={deck} slide={slide} s={s} tpl={tpl} ink={ink} isCover={isCover} />
      </div>
    </div>
  );
}

export default SalfordSlide;