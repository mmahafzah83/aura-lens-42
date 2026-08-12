/**
 * HIGHLIGHTER — the second layout family, drawn from the approved v7.4 spec.
 *
 * Same two standing laws as the instrument renderer:
 * RULE A — no CSS custom properties in this subtree. Every colour is an inline
 * literal from the theme object, because html-to-image cannot resolve custom
 * properties from inside its iframe.
 * RULE B — no network fonts. Poppins and IBM Plex Sans Arabic are bundled.
 *
 * Everything geometric is read from the descriptor: this file holds no canvas
 * size, no padding and no type size of its own.
 */
import React, { useRef, useState } from "react";
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

/** Display weight: Poppins 800 in Latin, Plex Arabic 700 in Arabic. */
function displayWeight(lang: Lang): number {
  return lang === "ar" ? 700 : 800;
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
    // The display face never drops below the headline face.
    display: Math.max(px(lang === "ar" ? r.heroAr : r.heroEn), px(r.h2)),
    displayLh: lang === "ar" ? 1.5 : r.heroEnLh,
    headline: Math.max(px(r.h2), floors.content),
    headlineLh: lang === "ar" ? 1.5 : r.h2Lh,
    // THE FLOOR IS NOT ADVISORY. The ladder may shrink to it and no further.
    content: Math.max(px(r.body), floors.content),
    contentLh: 1.8,
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

/**
 * MARKER BLOCK — the highlighter stroke. Accent ground, INK text, never white.
 * `box-decoration-break: clone` (both spellings) so an unavoidable wrap paints
 * two even blocks instead of one ragged staircase. Applied per LINE, which is
 * why the runs structure is passed in whole rather than a string.
 */
function MarkerBlock({
  runs, primary, theme, fonts, style,
}: { runs: Run[]; primary: Lang; theme: Theme; fonts: FontSet; style?: React.CSSProperties }) {
  return (
    <span
      data-marker-block=""
      style={{
        display: "inline",
        background: theme.accent,
        color: theme.accentInk,
        padding: "2px 14px",
        boxDecorationBreak: "clone",
        WebkitBoxDecorationBreak: "clone",
        ...style,
      }}
    >
      {renderRuns(runs, primary, fonts)}
    </span>
  );
}

/** A hand-drawn dashed arrow. Frame, steps and interior slides only. */
function DashedArrow({ theme, width, rtl }: { theme: Theme; width: number; rtl: boolean }) {
  return (
    <svg
      width={width}
      height={Math.round(width * 0.4)}
      viewBox="0 0 200 80"
      fill="none"
      aria-hidden="true"
      style={{ display: "block", flex: "0 0 auto", transform: rtl ? "scaleX(-1)" : undefined }}
    >
      <path
        d="M10 64 C 52 28, 116 22, 164 40"
        stroke={theme.accent}
        strokeWidth={6.5}
        strokeDasharray="17 15"
        strokeLinecap="round"
        fill="none"
      />
      <path d="M158 24 L184 42 L156 52 Z" fill={theme.accent} />
    </svg>
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

/** COVER ONLY. Mirrored in RTL, where it also moves to the other corner. */
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

/**
 * The hashtag is the deck's own first theme tag. There is no per-member string
 * anywhere in this file: it is read from the deck the requesting member's own
 * signal produced, and when the deck carries none, nothing is printed.
 */
function firstThemeTag(deck: DeckIR): { text: string; hash: boolean } | null {
  for (const slide of deck.slides) {
    const chip = plainText(slide.slots.chip).trim();
    if (!chip) continue;
    const words = chip.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    if (!words.length) continue;
    // A hashtag only reads as one in a single Latin word. A multi-word label,
    // or any Arabic label, stays a plain chip with its spaces intact — fusing
    // the words together makes it unreadable.
    const single = words.length === 1 && deck.primary_lang !== "ar" && !/[\u0600-\u06FF]/.test(chip);
    if (single) {
      const w = words[0];
      return { text: w.charAt(0).toUpperCase() + w.slice(1), hash: true };
    }
    return { text: words.join(" "), hash: false };
  }
  return null;
}

function Header({ deck, theme, s, tpl }: { deck: DeckIR; theme: Theme; s: Sizes; tpl: TemplateDescriptor }) {
  const p = deck.primary_lang;
  const tag = firstThemeTag(deck);
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 32, flex: "0 0 auto" }}>
      <div
        style={{
          fontFamily: fontFor(p, tpl.fonts),
          fontWeight: 600,
          fontSize: s.identitySub,
          letterSpacing: p === "ar" ? "0" : ".14em",
          textTransform: p === "ar" ? "none" : "uppercase",
          color: theme.fg,
        }}
      >
        {renderRuns(deck.profile.name.runs, p, tpl.fonts)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 14, flex: "0 0 auto" }}>
        {tag && (
          <span
            style={{ fontFamily: tag.hash ? tpl.fonts.textEn : fontFor(p, tpl.fonts), fontWeight: 700, fontSize: s.identitySub, color: theme.fg }}
            dir={tag.hash ? "ltr" : deck.dir}
          >
            {tag.hash ? `#${tag.text}` : tag.text}
          </span>
        )}
        <SaveIcon size={40} color={theme.accent} />
      </div>
    </div>
  );
}

function Footer({ deck, theme, s, tpl, isCover }: {
  deck: DeckIR; theme: Theme; s: Sizes; tpl: TemplateDescriptor; isCover: boolean;
}) {
  const rtl = deck.dir === "rtl";
  const p = deck.primary_lang;
  const year = new Date().getFullYear();
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 32, flex: "0 0 auto" }}>
      {/* The signature block: who signed this, then where to find them. */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4, minWidth: 0 }}>
        <span style={{ fontFamily: tpl.fonts.textEn, fontWeight: 700, fontSize: Math.round(s.meta * 1.2), color: theme.head }}>
          {renderRuns(deck.profile.name.runs, p, tpl.fonts)}
        </span>
        {deck.profile.title && (
          <span style={{ fontFamily: tpl.fonts.textEn, fontWeight: 400, fontSize: s.meta, color: theme.dim }}>
            {renderRuns(deck.profile.title.runs, p, tpl.fonts)}
          </span>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* The glyph REPLACES "in/". Never both. */}
        <LinkedInGlyph size={Math.round(s.meta * 1.1)} color={theme.fg} />
        {deck.profile.handle && (
          <span style={{ fontFamily: tpl.fonts.textEn, fontWeight: 500, fontSize: s.meta, color: theme.fg }} dir="ltr">
            {deck.profile.handle}
          </span>
        )}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 16 }}>
        {/* The arrow lives on the cover and nowhere else — never inside the
            headline composition. In RTL the footer end side is the LEFT, so
            the arrow moves with it and mirrors. */}
        {isCover && <ArrowMark size={52} color={theme.fg} rtl={rtl} />}
        <span style={{ fontFamily: tpl.fonts.textEn, fontWeight: 600, fontSize: s.meta, color: theme.fg }} dir="ltr">
          {year}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Background — three deterministic layers, no filter, no blend mode   */
/* ------------------------------------------------------------------ */

function Background({ theme, green }: { theme: Theme; green: boolean }) {
  const dot = green ? "110,140,110" : "150,125,90";
  return (
    <>
      <div aria-hidden style={{ position: "absolute", inset: 0, background: theme.bgSolid }} />
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            `radial-gradient(rgba(${dot},.12) 1.4px, transparent 1.5px), ` +
            `radial-gradient(rgba(${dot},.07) 1.1px, transparent 1.2px)`,
          backgroundSize: "34px 34px, 23px 23px",
          backgroundPosition: "0 0, 11px 17px",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(135% 110% at 50% 0%, transparent 62%, rgba(110,85,50,.06))",
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
}

function Display({ lines, primary, theme, s, tpl, marked }: {
  lines?: HeroLine[]; primary: Lang; theme: Theme; s: Sizes; tpl: TemplateDescriptor;
  /** Which lines wear the marker. Default: the line that declares `highlight`. */
  marked?: (line: HeroLine, i: number) => boolean;
}) {
  if (!lines?.length) return null;
  const ar = primary === "ar";
  const test = marked ?? ((l: HeroLine) => Boolean(l.highlight));
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: ar ? 10 : 4 }}>
      {lines.map((line, i) => (
        <span
          key={i}
          data-hero-line=""
          style={{
            display: "inline-block",
            fontFamily: primary === "ar" ? tpl.fonts.arabic : tpl.fonts.displayEn,
            fontWeight: displayWeight(primary),
            fontSize: s.display,
            lineHeight: s.displayLh,
            textTransform: ar ? "none" : "uppercase",
            color: theme.head,
          }}
        >
          {test(line, i)
            ? <MarkerBlock runs={line.runs} primary={primary} theme={theme} fonts={tpl.fonts} />
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
        fontFamily: primary === "ar" ? tpl.fonts.arabic : tpl.fonts.displayEn,
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

/**
 * Body. `emphasis` marks at most one node — INV-04 allows one emphasis a
 * slide, so the marker is spent once and the rest is plain ink.
 */
function Body({ nodes, primary, theme, s, tpl, hideTails, emphasise = 0 }: {
  nodes?: TextNode[]; primary: Lang; theme: Theme; s: Sizes; tpl: TemplateDescriptor;
  hideTails: boolean; emphasise?: number;
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
          {i < emphasise
            ? <MarkerBlock runs={n.runs} primary={primary} theme={theme} fonts={tpl.fonts} />
            : renderRuns(n.runs, primary, tpl.fonts)}
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

/** Bars. No red anywhere in this family: the worst bar is drawn in INK. */
function Bars({ slide, primary, theme, s, tpl }: PartProps & { primary: Lang }) {
  const series = slide.slots.media?.chart?.series ?? [];
  if (!series.length) return null;
  const max = Math.max(...series.map((x) => Math.abs(x.value))) || 1;
  const track = theme.fg === "#1B1B1B" ? "rgba(27,27,27,.08)" : "rgba(21,36,28,.08)";
  return (
    <div data-media-node="chart" style={{ display: "flex", flexDirection: "column", gap: Math.round(s.gap * 0.9) }}>
      {series.map((item, i) => {
        const fill = item.emphasis === "alert" ? theme.fg : theme.accent;
        return (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16 }}>
              <div style={{ fontFamily: fontFor(primary, tpl.fonts), fontWeight: 600, fontSize: Math.max(s.meta, 28), color: theme.fg }}>
                {renderRuns(item.label.runs, primary, tpl.fonts)}
              </div>
              <div style={{ fontFamily: tpl.fonts.textEn, fontWeight: 600, fontSize: Math.max(s.meta, 28), color: theme.fg }} dir="ltr">
                {item.value}{item.unit ?? ""}
              </div>
            </div>
            <div style={{ height: 22, borderRadius: 99, background: track, overflow: "hidden" }}>
              <div style={{ width: `${(Math.abs(item.value) / max) * 100}%`, height: "100%", borderRadius: 99, background: fill }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The nine archetypes                                                 */
/* ------------------------------------------------------------------ */

function Stack({ children, gap }: { children: React.ReactNode; gap: number }) {
  return <div style={{ display: "flex", flexDirection: "column", gap, alignItems: "stretch" }}>{children}</div>;
}

function InitialsDisc({ deck, theme, tpl }: { deck: DeckIR; theme: Theme; tpl: TemplateDescriptor }) {
  const avatar = deck.profile.avatar_url;
  if (avatar) {
    return <img src={avatar} alt="" style={{ width: 96, height: 96, borderRadius: 999, objectFit: "cover", flex: "0 0 auto" }} />;
  }
  const initials = (deck.profile.initials ?? "").trim();
  if (!initials) {
    // No photo and no initials: an accent rule, never a fabricated monogram.
    return <div style={{ width: 12, height: 96, borderRadius: 6, background: theme.accent, flex: "0 0 auto" }} />;
  }
  return (
    <div
      style={{
        width: 96, height: 96, borderRadius: 999, flex: "0 0 auto",
        background: theme.fg, color: theme.bgSolid,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: tpl.fonts.textEn, fontWeight: 700, fontSize: 38,
      }}
      dir="ltr"
    >
      {initials}
    </div>
  );
}

function HighlighterBody(props: PartProps) {
  const { deck, slide, theme, s, tpl, hideTails } = props;
  const p = deck.primary_lang;
  const slots = slide.slots;
  const rtl = deck.dir === "rtl";
  const common = { primary: p, theme, s, tpl } as const;

  switch (slide.archetype) {
    /* 1 — the headline block, alone. */
    case "cover_hero":
      return (
        <Stack gap={s.gap}>
          <Display lines={slots.hero_lines} {...common} />
          {slots.subline && (
            <div
              style={{
                fontFamily: fontFor(p, tpl.fonts),
                fontWeight: p === "ar" ? 400 : 500,
                fontSize: Math.max(Math.round(s.content * 0.85), tpl.ramp.floors?.content ?? 0),
                lineHeight: s.contentLh,
                color: theme.fg,
                opacity: 0.8,
                textAlign: "start",
              }}
            >
              {renderRuns(slots.subline.runs, p, tpl.fonts)}
            </div>
          )}
        </Stack>
      );

    /* 2 — the stat IS the first line of the headline, in a marker block. */
    case "cover_stat":
      return (
        <Stack gap={s.gap}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
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
                  color: theme.head,
                }}
              >
                <MarkerBlock runs={[{ t: slots.stat_value, lang: "en" }]} primary="en" theme={theme} fonts={tpl.fonts} />
              </span>
            )}
            <Display lines={slots.hero_lines} {...common} marked={() => false} />
          </div>
          <Headline node={slots.stat_label} {...common} />
          <Meta node={slots.source} {...common} />
        </Stack>
      );

    /* 3 — headline, arrow, body with one or two marker lines. */
    case "frame":
      return (
        <Stack gap={s.gap}>
          <Display lines={slots.hero_lines} {...common} marked={() => false} />
          <Headline node={slots.headline} {...common} />
          <DashedArrow theme={theme} width={190} rtl={rtl} />
          <Body
            nodes={slots.body}
            primary={p}
            theme={theme}
            s={s}
            tpl={tpl}
            hideTails={hideTails}
            /* One emphasis per slide (INV-04): the marker goes on the first
               body line only when no hero line already claimed it. */
            emphasise={(slots.hero_lines ?? []).some((l) => l.highlight) ? 0 : 1}
          />
        </Stack>
      );

    /* 4 — quotation as marker blocks, line by line, then the source. */
    case "evidence":
      return (
        <Stack gap={s.gap}>
          <Display lines={slots.hero_lines} {...common} marked={() => false} />
          {slots.stat_value && (
            <span data-hero-line="" dir="ltr" style={{ display: "inline-block", fontFamily: tpl.fonts.displayEn, fontWeight: 800, fontSize: s.display, lineHeight: s.displayLh, color: theme.head }}>
              <MarkerBlock runs={[{ t: slots.stat_value, lang: "en" }]} primary="en" theme={theme} fonts={tpl.fonts} />
            </span>
          )}
          <Headline node={slots.stat_label} {...common} />
          <Body nodes={slots.body} primary={p} theme={theme} s={s} tpl={tpl} hideTails={hideTails} emphasise={slots.stat_value ? 0 : 1} />
          <Meta node={slots.source} {...common} />
        </Stack>
      );

    /* 5 — bars. Ink is the alert; there is no red in this template. */
    case "benchmark":
      return (
        <Stack gap={s.gap}>
          <Headline node={slots.headline} {...common} />
          <Bars {...props} primary={p} />
          <Meta node={slots.source} {...common} />
        </Stack>
      );

    /* 6 — the quotation itself, big, with its opening phrase marked. */
    case "quote": {
      const quoteRuns = slots.quote?.runs ?? [];
      return (
        <Stack gap={s.gap}>
          <Display lines={slots.hero_lines} {...common} marked={() => false} />
          <div
            style={{
              fontFamily: p === "ar" ? tpl.fonts.arabic : tpl.fonts.textEn,
              fontWeight: p === "ar" ? 700 : 700,
              fontSize: Math.max(Math.round(s.headline * 0.82), tpl.ramp.floors?.content ?? 0),
              lineHeight: p === "ar" ? 1.5 : 1.2,
              color: theme.head,
              textAlign: "start",
            }}
          >
            {quoteRuns.length ? (
              <>
                <MarkerBlock runs={[quoteRuns[0]]} primary={p} theme={theme} fonts={tpl.fonts} />
                {quoteRuns.length > 1 ? <> {renderRuns(quoteRuns.slice(1), p, tpl.fonts)}</> : null}
              </>
            ) : null}
          </div>
          <Meta node={slots.source} {...common} />
        </Stack>
      );
    }

    /* 7 — up to four rows: arrow, title, one dimmed line of detail. */
    case "steps": {
      const rows = (slots.checklist ?? []).slice(0, 4);
      return (
        <Stack gap={s.gap}>
          <Display lines={slots.hero_lines} {...common} marked={() => false} />
          <Headline node={slots.headline} {...common} />
          <div style={{ display: "flex", flexDirection: "column", gap: Math.round(s.gap * 0.9) }}>
            {rows.map((item, i) => {
              const text = plainText(item);
              const cut = text.indexOf(".");
              const title = cut > 0 ? text.slice(0, cut + 1) : text;
              const detail = cut > 0 ? text.slice(cut + 1).trim() : "";
              return (
                <div key={i} style={{ display: "flex", gap: 22, alignItems: "flex-start" }}>
                  <DashedArrow theme={theme} width={90} rtl={rtl} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                    <div style={{ fontFamily: p === "ar" ? tpl.fonts.arabic : tpl.fonts.textEn, fontWeight: 700, fontSize: Math.max(Math.round(44 * (s.content / (tpl.ramp.body || 40))), tpl.ramp.floors?.content ?? 0), lineHeight: p === "ar" ? 1.5 : 1.2, color: theme.head, textAlign: "start" }}>
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

    /* 8 — the term in a marker block, then its definition. */
    case "definition":
      return (
        <Stack gap={s.gap}>
          <Display lines={slots.hero_lines} {...common} marked={() => false} />
          {slots.term && (
            <div style={{ fontFamily: p === "ar" ? tpl.fonts.arabic : tpl.fonts.displayEn, fontWeight: displayWeight(p), fontSize: s.headline, lineHeight: s.headlineLh, textAlign: "start" }}>
              <MarkerBlock runs={slots.term.runs} primary={p} theme={theme} fonts={tpl.fonts} />
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
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
            {ctaLines.slice(0, 2).map((n, i) => (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  fontFamily: p === "ar" ? tpl.fonts.arabic : tpl.fonts.displayEn,
                  fontWeight: displayWeight(p),
                  fontSize: Math.max(Math.round(84 * (s.content / (tpl.ramp.body || 40))), tpl.ramp.floors?.content ?? 0),
                  lineHeight: p === "ar" ? 1.5 : 1.12,
                  textTransform: p === "ar" ? "none" : "uppercase",
                }}
              >
                <MarkerBlock runs={n.runs} primary={p} theme={theme} fonts={tpl.fonts} />
              </span>
            ))}
          </div>
          <Body nodes={slots.body} primary={p} theme={theme} s={s} tpl={tpl} hideTails={hideTails} />
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <InitialsDisc deck={deck} theme={theme} tpl={tpl} />
            <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
              <div style={{ fontFamily: fontFor(p, tpl.fonts), fontWeight: 700, fontSize: s.identityName, color: theme.head, textAlign: "start" }}>
                {renderRuns(deck.profile.name.runs, p, tpl.fonts)}
              </div>
              {deck.profile.title && (
                <div style={{ fontFamily: fontFor(p, tpl.fonts), fontWeight: 500, fontSize: s.identitySub, color: theme.fg, opacity: 0.72, textAlign: "start" }}>
                  {renderRuns(deck.profile.title.runs, p, tpl.fonts)}
                </div>
              )}
            </div>
          </div>
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

export interface HighlighterSlideProps {
  deck: DeckIR;
  slide: SlideIR;
  theme?: string | null;
  template?: string | null;
  onFit?: (state: FitState) => void;
}

export function HighlighterSlide({ deck, slide, theme: themeName, template, onFit }: HighlighterSlideProps) {
  const theme = getTheme(themeName ?? deck.theme);
  const tpl = getTemplate(template ?? (deck as { template?: string | null }).template);
  const ref = useRef<HTMLDivElement | null>(null);
  const p = deck.primary_lang;

  const signature =
    `${deck.deck_id}:${slide.index}:${themeName ?? deck.theme}:${tpl.id}` +
    `:${plainText(slide.slots.headline)}:t${slotsTextDigest(slide.slots)}`;
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
      <Background theme={theme} green={theme.accent === "#4CC08A"} />
      <div style={{ position: "relative", display: "flex", flexDirection: "column", height: "100%", gap: s.gap }}>
        <Header deck={deck} theme={theme} s={s} tpl={tpl} />
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
          <HighlighterBody deck={deck} slide={slide} theme={theme} s={s} tpl={tpl} hideTails={hideTails} />
        </div>
        <Footer deck={deck} theme={theme} s={s} tpl={tpl} isCover={isCover} />
      </div>
    </div>
  );
}

export default HighlighterSlide;
