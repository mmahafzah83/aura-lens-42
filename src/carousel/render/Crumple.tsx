/**
 * CRUMPLE — template 02 of the locked v7.4 library. Pressed paper, one display
 * face, one rotated amber slab.
 *
 * The same two standing laws as every other family:
 * RULE A — no CSS custom properties in this subtree. Every colour is an inline
 * literal read from the theme object, because html-to-image cannot resolve
 * custom properties from inside its iframe.
 * RULE B — no network fonts. Archivo Black, Inter and Cairo are bundled.
 *
 * And one more that this family is the first to be tested against:
 * RULE C — the paper texture is DETERMINISTIC CSS. Fold lines, catch-lights
 * and the corner vignette are plain gradients. No feTurbulence, no noise
 * filter, no mix-blend-mode — those either rasterize differently or not at
 * all through html-to-image.
 *
 * Nothing geometric or typographic is decided here: it is all read from the
 * descriptor in ./template.
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
import { getTemplate, type FontSet, type TemplateDescriptor } from "./template";
import { MAX_FIT_STEP, useFitLadder, type FitState } from "./useFitLadder";
import { checkEngagementRow, checkTypeFloor } from "../invariants";
import EngagementRow from "./EngagementRow";

type Lang = "en" | "ar";

/* ------------------------------------------------------------------ */
/* Type                                                                */
/* ------------------------------------------------------------------ */

function fontFor(lang: Lang, fonts: FontSet): string {
  return lang === "ar" ? fonts.arabic : fonts.textEn;
}

/** Display: Archivo Black is 400-only. Arabic display is Cairo 900. */
function displayWeight(lang: Lang): number {
  return lang === "ar" ? 900 : 400;
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
    // Arabic display never tighter than 1.4 — the descriptor holds the number.
    displayLh: lang === "ar" ? r.heroArLh : r.heroEnLh,
    headline: Math.max(px(r.h2), floors.content),
    headlineLh: lang === "ar" ? r.heroArLh : r.h2Lh,
    // THE FLOOR IS NOT ADVISORY. The ladder may shrink to it and no further.
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
/* Signature device — the rotated slab                                 */
/* ------------------------------------------------------------------ */

/**
 * THE SLAB. Amber ground, INK text, rotated −2° and MIRRORED to +2° in RTL so
 * the tilt reads the same way against the reading direction. No shadow lip:
 * the locked spec is explicit that this slab sits flat on the paper.
 */
function Slab({
  runs, primary, theme, fonts, rtl, style, dir,
}: {
  runs: Run[]; primary: Lang; theme: Theme; fonts: FontSet; rtl: boolean;
  style?: React.CSSProperties; dir?: "ltr" | "rtl";
}) {
  return (
    <span
      data-slab=""
      dir={dir}
      style={{
        display: "inline-block",
        background: theme.accent,
        color: theme.accentInk,
        padding: "6px 20px",
        transform: `rotate(${rtl ? 2 : -2}deg)`,
        // No shadow lip. Flat on the paper, by the locked spec.
        boxShadow: "none",
        ...style,
      }}
    >
      {renderRuns(runs, primary, fonts)}
    </span>
  );
}

/** An outlined tag box. Benchmark labels only. Ink outline, no fill. */
function TagBox({ children, theme, fonts, size }: {
  children: React.ReactNode; theme: Theme; fonts: FontSet; size: number;
}) {
  return (
    <span
      style={{
        display: "inline-block",
        border: `3px solid ${theme.fg}`,
        padding: "4px 14px",
        fontFamily: fonts.textEn,
        fontWeight: 700,
        fontSize: size,
        color: theme.fg,
      }}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Chrome                                                              */
/* ------------------------------------------------------------------ */

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

/** COVER ONLY, and never inside the headline composition. Mirrored in RTL. */
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

/** The masthead's right-hand word. Not a member string: a template constant. */
const MASTHEAD_RIGHT: Record<Lang, string> = { en: "Strategy", ar: "استراتيجية" };

function Header({ deck, theme, s, tpl, isCover }: {
  deck: DeckIR; theme: Theme; s: Sizes; tpl: TemplateDescriptor; isCover: boolean;
}) {
  const p = deck.primary_lang;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 32, flex: "0 0 auto" }}>
      {/* Masthead: the member's own name, Inter 700, on the start side. */}
      <div
        style={{
          fontFamily: fontFor(p, tpl.fonts),
          fontWeight: 700,
          fontSize: s.identitySub,
          letterSpacing: p === "ar" ? "0" : ".12em",
          textTransform: p === "ar" ? "none" : "uppercase",
          color: theme.fg,
        }}
      >
        {renderRuns(deck.profile.name.runs, p, tpl.fonts)}
      </div>
      {/* The save icon sits 14px under the top-end word, aligned to it. */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 14, flex: "0 0 auto" }}>
        <span
          style={{
            fontFamily: fontFor(p, tpl.fonts),
            fontWeight: 700,
            fontSize: s.identitySub,
            letterSpacing: p === "ar" ? "0" : ".12em",
            textTransform: p === "ar" ? "none" : "uppercase",
            color: theme.fg,
          }}
        >
          {MASTHEAD_RIGHT[p]}
        </span>
        {isCover && <SaveIcon size={40} color={theme.fg} />}
      </div>
    </div>
  );
}

function Footer({ deck, theme, s, tpl, isCover }: {
  deck: DeckIR; theme: Theme; s: Sizes; tpl: TemplateDescriptor; isCover: boolean;
}) {
  const rtl = deck.dir === "rtl";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, flex: "0 0 auto" }}>
      {/* The footer rule. A pagination device, not a decoration. */}
      <div style={{ height: 3, background: theme.rule, width: "100%" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* The glyph REPLACES "in/". Never both. */}
          <LinkedInGlyph size={Math.round(s.meta * 1.1)} color={theme.fg} />
          {deck.profile.handle && (
            <span style={{ fontFamily: tpl.fonts.textEn, fontWeight: 500, fontSize: s.meta, color: theme.fg }} dir="ltr">
              {deck.profile.handle}
            </span>
          )}
        </div>
        {/* Bottom rail. In RTL the flex end side IS the left, so the arrow
            moves there and mirrors — no hard-coded corner. */}
        {isCover && <ArrowMark size={54} color={theme.fg} rtl={rtl} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Background — pressed paper. Five folds, catch-lights, one vignette.  */
/* Deterministic gradients only: no filter, no blend mode.              */
/* ------------------------------------------------------------------ */

/** Where the five creases fall, as a percentage across the sheet. */
const FOLDS = [
  { pos: 17, vertical: true },
  { pos: 41, vertical: false },
  { pos: 58, vertical: true },
  { pos: 73, vertical: false },
  { pos: 88, vertical: true },
] as const;

function Background({ theme }: { theme: Theme }) {
  return (
    <>
      <div aria-hidden style={{ position: "absolute", inset: 0, background: theme.bgSolid }} />
      {FOLDS.map((f, i) => (
        <div
          key={i}
          aria-hidden
          data-fold-line={i}
          style={{
            position: "absolute",
            inset: 0,
            // Crease then catch-light, both plain linear gradients.
            backgroundImage:
              `linear-gradient(${f.vertical ? "90deg" : "180deg"}, ` +
              `transparent ${f.pos - 0.35}%, rgba(22,22,22,.10) ${f.pos}%, ` +
              `rgba(255,255,255,.85) ${f.pos + 0.32}%, transparent ${f.pos + 0.9}%)`,
          }}
        />
      ))}
      <div
        aria-hidden
        data-vignette=""
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(130% 105% at 50% 42%, transparent 58%, rgba(110,95,60,.10))",
        }}
      />
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
  s: Sizes;
  tpl: TemplateDescriptor;
  hideTails: boolean;
  rtl: boolean;
}

function Stack({ children, gap }: { children: React.ReactNode; gap: number }) {
  return <div style={{ display: "flex", flexDirection: "column", gap, alignItems: "stretch" }}>{children}</div>;
}

/** The caps column: display lines, the marked one wearing the slab. */
function Display({ lines, primary, theme, s, tpl, rtl, marked }: {
  lines?: HeroLine[]; primary: Lang; theme: Theme; s: Sizes; tpl: TemplateDescriptor; rtl: boolean;
  marked?: (line: HeroLine, i: number) => boolean;
}) {
  if (!lines?.length) return null;
  const ar = primary === "ar";
  const test = marked ?? ((l: HeroLine) => Boolean(l.highlight));
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: ar ? 12 : 6 }}>
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
            textTransform: ar ? "none" : "uppercase",
            color: theme.head,
          }}
        >
          {test(line, i)
            ? <Slab runs={line.runs} primary={primary} theme={theme} fonts={tpl.fonts} rtl={rtl} />
            : renderRuns(line.runs, primary, tpl.fonts)}
        </span>
      ))}
    </div>
  );
}

function Headline({ node, primary, theme, s, tpl }: {
  node?: TextNode; primary: Lang; theme: Theme; s: Sizes; tpl: TemplateDescriptor;
}) {
  if (!node) return null;
  return (
    <div
      style={{
        fontFamily: displayFamily(primary, tpl.fonts),
        fontWeight: displayWeight(primary),
        fontSize: s.headline,
        lineHeight: s.headlineLh,
        color: theme.head,
        textAlign: "start",
      }}
    >
      {renderRuns(node.runs, primary, tpl.fonts)}
    </div>
  );
}

function Body({ nodes, primary, theme, s, tpl, hideTails }: {
  nodes?: TextNode[]; primary: Lang; theme: Theme; s: Sizes; tpl: TemplateDescriptor; hideTails: boolean;
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
            color: theme.fg,
            textAlign: "start",
          }}
        >
          {renderRuns(n.runs, primary, tpl.fonts)}
        </div>
      ))}
    </div>
  );
}

function Meta({ node, primary, theme, s, tpl }: {
  node?: TextNode; primary: Lang; theme: Theme; s: Sizes; tpl: TemplateDescriptor;
}) {
  if (!node) return null;
  return (
    <div style={{ fontFamily: fontFor(primary, tpl.fonts), fontWeight: 500, fontSize: s.meta, color: theme.dim, textAlign: "start" }}>
      {renderRuns(node.runs, primary, tpl.fonts)}
    </div>
  );
}

/** Outlined tag boxes over bars. No red in this palette: ink IS the alert. */
function Bars({ slide, theme, s, tpl, deck }: PartProps) {
  const p = deck.primary_lang;
  const series = slide.slots.media?.chart?.series ?? [];
  if (!series.length) return null;
  const max = Math.max(...series.map((x) => Math.abs(x.value))) || 1;
  return (
    <div data-media-node="chart" style={{ display: "flex", flexDirection: "column", gap: Math.round(s.gap * 0.9) }}>
      {series.map((item, i) => {
        const fill = item.emphasis === "alert" ? theme.fg : theme.accent;
        return (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
              <TagBox theme={theme} fonts={tpl.fonts} size={Math.max(s.meta, 26)}>
                {renderRuns(item.label.runs, p, tpl.fonts)}
              </TagBox>
              <span style={{ fontFamily: tpl.fonts.textEn, fontWeight: 700, fontSize: Math.max(s.meta, 28), color: theme.fg }} dir="ltr">
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

function IdentityCard({ deck, theme, s, tpl }: { deck: DeckIR; theme: Theme; s: Sizes; tpl: TemplateDescriptor }) {
  const p = deck.primary_lang;
  const avatar = deck.profile.avatar_url;
  const initials = (deck.profile.initials ?? "").trim();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      {avatar ? (
        <img src={avatar} alt="" style={{ width: 94, height: 94, objectFit: "cover", flex: "0 0 auto" }} />
      ) : initials ? (
        <div
          style={{
            width: 94, height: 94, flex: "0 0 auto",
            background: theme.fg, color: theme.bgSolid,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: tpl.fonts.textEn, fontWeight: 700, fontSize: 38,
          }}
          dir="ltr"
        >
          {initials}
        </div>
      ) : (
        // No photo and no initials: an amber rule, never a fabricated monogram.
        <div style={{ width: 12, height: 94, background: theme.accent, flex: "0 0 auto" }} />
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
        <div style={{ fontFamily: fontFor(p, tpl.fonts), fontWeight: 700, fontSize: s.identityName, color: theme.head, textAlign: "start" }}>
          {renderRuns(deck.profile.name.runs, p, tpl.fonts)}
        </div>
        {deck.profile.title && (
          <div style={{ fontFamily: fontFor(p, tpl.fonts), fontWeight: 500, fontSize: s.identitySub, color: theme.fg, opacity: 0.75, textAlign: "start" }}>
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

function CrumpleBody(props: PartProps) {
  const { deck, slide, theme, s, tpl, hideTails, rtl } = props;
  const p = deck.primary_lang;
  const slots = slide.slots;
  const common = { primary: p, theme, s, tpl } as const;
  const displayCommon = { ...common, rtl } as const;

  switch (slide.archetype) {
    /* 1 — slab + caps column. */
    case "cover_hero":
      return (
        <Stack gap={s.gap}>
          <Display lines={slots.hero_lines} {...displayCommon} />
          {slots.subline && (
            <div
              style={{
                fontFamily: fontFor(p, tpl.fonts),
                fontWeight: p === "ar" ? 400 : 500,
                fontSize: Math.max(Math.round(s.content * 0.85), tpl.ramp.floors?.content ?? 0),
                lineHeight: s.contentLh,
                color: theme.fg,
                textAlign: "start",
              }}
            >
              {renderRuns(slots.subline.runs, p, tpl.fonts)}
            </div>
          )}
        </Stack>
      );

    /* 2 — the slab carries the stat. */
    case "cover_stat":
      return (
        <Stack gap={s.gap}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10 }}>
            {slots.stat_value && (
              <span
                data-hero-line=""
                style={{
                  display: "inline-block",
                  fontFamily: tpl.fonts.displayEn,
                  fontWeight: 400,
                  fontSize: s.display,
                  lineHeight: s.displayLh,
                  color: theme.head,
                }}
              >
                <Slab runs={[{ t: slots.stat_value, lang: "en" }]} primary="en" theme={theme} fonts={tpl.fonts} rtl={rtl} dir="ltr" />
              </span>
            )}
            <Display lines={slots.hero_lines} {...displayCommon} marked={() => false} />
          </div>
          <Headline node={slots.stat_label} {...common} />
          <Meta node={slots.source} {...common} />
        </Stack>
      );

    /* 3 — a slab keyword above the body. */
    case "frame":
      return (
        <Stack gap={s.gap}>
          <Display lines={slots.hero_lines} {...displayCommon} />
          <Headline node={slots.headline} {...common} />
          <Body nodes={slots.body} primary={p} theme={theme} s={s} tpl={tpl} hideTails={hideTails} />
        </Stack>
      );

    /* 4 — the body first, the source in the slab under it. */
    case "evidence":
      return (
        <Stack gap={s.gap}>
          <Display lines={slots.hero_lines} {...displayCommon} marked={() => false} />
          {slots.stat_value && (
            <span
              data-hero-line=""
              dir="ltr"
              style={{ display: "inline-block", fontFamily: tpl.fonts.displayEn, fontWeight: 400, fontSize: s.display, lineHeight: s.displayLh, color: theme.head }}
            >
              {slots.stat_value}
            </span>
          )}
          <Headline node={slots.stat_label} {...common} />
          <Body nodes={slots.body} primary={p} theme={theme} s={s} tpl={tpl} hideTails={hideTails} />
          {slots.source && (
            <div style={{ fontSize: Math.max(s.meta, tpl.ramp.floors?.meta ?? 0), textAlign: "start" }}>
              <Slab
                runs={slots.source.runs}
                primary={p}
                theme={theme}
                fonts={tpl.fonts}
                rtl={rtl}
                style={{ fontFamily: fontFor(p, tpl.fonts), fontWeight: 700, fontSize: Math.max(s.meta, tpl.ramp.floors?.meta ?? 0) }}
              />
            </div>
          )}
        </Stack>
      );

    /* 5 — outlined tag boxes over bars. */
    case "benchmark":
      return (
        <Stack gap={s.gap}>
          <Headline node={slots.headline} {...common} />
          <Bars {...props} />
          <Meta node={slots.source} {...common} />
        </Stack>
      );

    /* 6 — the first words of the quotation wear the slab. */
    case "quote": {
      const quoteRuns = slots.quote?.runs ?? [];
      return (
        <Stack gap={s.gap}>
          <Display lines={slots.hero_lines} {...displayCommon} marked={() => false} />
          <div
            style={{
              fontFamily: displayFamily(p, tpl.fonts),
              fontWeight: displayWeight(p),
              fontSize: Math.max(Math.round(s.headline * 0.82), tpl.ramp.floors?.content ?? 0),
              lineHeight: p === "ar" ? tpl.ramp.heroArLh : 1.16,
              color: theme.head,
              textAlign: "start",
            }}
          >
            {quoteRuns.length ? (
              <>
                <Slab runs={[quoteRuns[0]]} primary={p} theme={theme} fonts={tpl.fonts} rtl={rtl} />
                {quoteRuns.length > 1 ? <> {renderRuns(quoteRuns.slice(1), p, tpl.fonts)}</> : null}
              </>
            ) : null}
          </div>
          <Meta node={slots.source} {...common} />
        </Stack>
      );
    }

    /* 7 — slab-numbered rows. */
    case "steps": {
      const rows = (slots.checklist ?? []).slice(0, 4);
      const numeral = (n: number) => (deck.numerals === "arabic" ? n.toLocaleString("ar-EG") : String(n));
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
                  <Slab
                    runs={[{ t: numeral(i + 1), lang: p }]}
                    primary={p}
                    theme={theme}
                    fonts={tpl.fonts}
                    rtl={rtl}
                    style={{ fontFamily: tpl.fonts.displayEn, fontWeight: 400, fontSize: Math.max(s.content, tpl.ramp.floors?.content ?? 0), flex: "0 0 auto" }}
                  />
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                    <div style={{ fontFamily: p === "ar" ? tpl.fonts.arabic : tpl.fonts.textEn, fontWeight: 700, fontSize: Math.max(s.content, tpl.ramp.floors?.content ?? 0), lineHeight: p === "ar" ? tpl.ramp.bodyLhAr : 1.25, color: theme.head, textAlign: "start" }}>
                      {title}
                    </div>
                    {detail && (
                      <div style={{ fontFamily: fontFor(p, tpl.fonts), fontWeight: p === "ar" ? 400 : 500, fontSize: Math.max(Math.round(s.content * 0.85), tpl.ramp.floors?.content ?? 0), lineHeight: 1.5, color: theme.dim, textAlign: "start" }}>
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

    /* 8 — the term wears the slab, the definition sits under it. */
    case "definition":
      return (
        <Stack gap={s.gap}>
          <Display lines={slots.hero_lines} {...displayCommon} marked={() => false} />
          {slots.term && (
            <div style={{ fontFamily: displayFamily(p, tpl.fonts), fontWeight: displayWeight(p), fontSize: s.headline, lineHeight: s.headlineLh, textAlign: "start" }}>
              <Slab runs={slots.term.runs} primary={p} theme={theme} fonts={tpl.fonts} rtl={rtl} />
            </div>
          )}
          {slots.term_def && (
            <div style={{ fontFamily: fontFor(p, tpl.fonts), fontWeight: p === "ar" ? 400 : 500, fontSize: s.content, lineHeight: s.contentLh, color: theme.fg, textAlign: "start" }}>
              {renderRuns(slots.term_def.runs, p, tpl.fonts)}
            </div>
          )}
          <Body nodes={slots.body} primary={p} theme={theme} s={s} tpl={tpl} hideTails={hideTails} />
        </Stack>
      );

    /* 9 — the call, the identity card, the engagement row. */
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
                  fontWeight: displayWeight(p),
                  fontSize: Math.max(Math.round(s.headline * 0.9), tpl.ramp.floors?.content ?? 0),
                  lineHeight: p === "ar" ? tpl.ramp.heroArLh : 1.14,
                  textTransform: p === "ar" ? "none" : "uppercase",
                }}
              >
                {i === 0
                  ? <Slab runs={n.runs} primary={p} theme={theme} fonts={tpl.fonts} rtl={rtl} />
                  : <span style={{ color: theme.head }}>{renderRuns(n.runs, p, tpl.fonts)}</span>}
              </span>
            ))}
          </div>
          <Body nodes={slots.body} primary={p} theme={theme} s={s} tpl={tpl} hideTails={hideTails} />
          <IdentityCard deck={deck} theme={theme} s={s} tpl={tpl} />
          <EngagementRow color={theme.fg} size={48} />
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

export interface CrumpleSlideProps {
  deck: DeckIR;
  slide: SlideIR;
  theme?: string | null;
  template?: string | null;
  onFit?: (state: FitState) => void;
}

export function CrumpleSlide({ deck, slide, theme: themeName, template, onFit }: CrumpleSlideProps) {
  const theme = getTheme(themeName ?? deck.theme);
  const tpl = getTemplate(template ?? (deck as { template?: string | null }).template);
  const ref = useRef<HTMLDivElement | null>(null);
  const p = deck.primary_lang;
  const rtl = deck.dir === "rtl";

  const signature =
    `${deck.deck_id}:${slide.index}:${themeName ?? deck.theme}:${tpl.id}` +
    `:${plainText(slide.slots.headline)}`;
  const fit = useFitLadder(ref, signature, MAX_FIT_STEP);
  const s = sizesFor(fit.scale, tpl, p);
  const hideTails = fit.step >= 2;

  const isCover = slide.archetype === "cover_hero" || slide.archetype === "cover_stat";
  const isClose = slide.archetype === "close";
  const where = `slide ${slide.index + 1} (${slide.archetype})`;

  // INV-22 and INV-23, both blocking, both decided against what is actually
  // about to be printed rather than against the ramp.
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
      data-bg={theme.bgSolid}
      dir={deck.dir}
      lang={p}
      style={{
        width: g.canvasW,
        height: g.canvasH,
        padding: g.pad,
        boxSizing: "border-box",
        overflow: "hidden",
        position: "relative",
        background: theme.bgSolid,
        color: theme.fg,
        textAlign: "start",
        fontFamily: fontFor(p, tpl.fonts),
        fontVariantNumeric: "lining-nums tabular-nums",
      }}
    >
      <Background theme={theme} />
      <div style={{ position: "relative", display: "flex", flexDirection: "column", height: "100%", gap: s.gap }}>
        <Header deck={deck} theme={theme} s={s} tpl={tpl} isCover={isCover} />
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
          <CrumpleBody deck={deck} slide={slide} theme={theme} s={s} tpl={tpl} hideTails={hideTails} rtl={rtl} />
        </div>
        <Footer deck={deck} theme={theme} s={s} tpl={tpl} isCover={isCover} />
      </div>
    </div>
  );
}

export default CrumpleSlide;
