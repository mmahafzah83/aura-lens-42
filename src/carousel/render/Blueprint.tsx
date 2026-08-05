/**
 * BLUEPRINT — template 04 of the locked v7.4 library. A near-black field under
 * a hairline drafting grid, Poppins throughout, violet as the only colour.
 *
 * Same standing laws as every other family:
 * RULE A — no CSS custom properties in this subtree; every colour is an inline
 * literal from the theme object, because html-to-image cannot resolve custom
 * properties from inside its iframe.
 * RULE B — no network fonts. Poppins and IBM Plex Sans Arabic are bundled.
 * RULE C — the grid, the leader lines and the ghost numeral are deterministic
 * CSS. No feTurbulence, no noise filter, no mix-blend-mode: the ghost numeral
 * is dimmed with `opacity` alone, because a blend mode exports as a black box.
 *
 * NO INVERSION. Every slide in this family is the same dark field, so the
 * theme declares no `invert` and this renderer never asks for one.
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
import { getTemplate, BLUEPRINT_GRID_PITCH, type FontSet, type TemplateDescriptor } from "./template";
import { MAX_FIT_STEP, useFitLadder, type FitState } from "./useFitLadder";
import { checkEngagementRow, checkTypeFloor } from "../invariants";
import EngagementRow from "./EngagementRow";
import { dottedLeader, hairlineGrid } from "./fieldPatterns";

type Lang = "en" | "ar";

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

/**
 * The emphasis device. Blueprint does not fill — it UNDERLINES, with a violet
 * rule set below the baseline, the way a draughtsman marks a dimension.
 */
function Underline({ runs, primary, theme, fonts, style }: {
  runs: Run[]; primary: Lang; theme: Theme; fonts: FontSet; style?: React.CSSProperties;
}) {
  return (
    <span
      data-underline=""
      style={{
        display: "inline-block",
        color: theme.accent,
        borderBottom: `6px solid ${theme.accent}`,
        paddingBottom: 6,
        ...style,
      }}
    >
      {renderRuns(runs, primary, fonts)}
    </span>
  );
}

/**
 * The dotted leader. A run of dots that ends in a solid terminal — the
 * drafting mark that ties a label to the thing it labels.
 */
function Leader({ color, height = 2 }: { color: string; height?: number }) {
  const run = dottedLeader(color);
  return (
    <span
      aria-hidden
      data-leader=""
      data-css={run}
      style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 auto", minWidth: 40 }}
    >
      <span style={{ flex: "1 1 auto", height, backgroundImage: run }} />
      <span style={{ width: 10, height: 10, borderRadius: 999, background: color, flex: "0 0 auto" }} />
    </span>
  );
}

/**
 * THE GHOST NUMERAL — the slide number set enormous behind the content.
 * Dimmed by `opacity` only. A blend mode would export as a black rectangle.
 */
function GhostNumeral({ n, color, rtl, fonts }: { n: number; color: string; rtl: boolean; fonts: FontSet }) {
  return (
    <div
      aria-hidden
      data-ghost-numeral={n}
      dir="ltr"
      style={{
        position: "absolute",
        top: 40,
        [rtl ? "left" : "right"]: 48,
        fontFamily: fonts.displayEn,
        fontWeight: 700,
        fontSize: 420,
        lineHeight: 1,
        color,
        opacity: 0.07,
        pointerEvents: "none",
      }}
    >
      {String(n).padStart(2, "0")}
    </div>
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

function Header({ deck, s, tpl, theme }: {
  deck: DeckIR; s: Sizes; tpl: TemplateDescriptor; theme: Theme;
}) {
  const p = deck.primary_lang;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, flex: "0 0 auto" }}>
      <span
        style={{
          fontFamily: fontFor(p, tpl.fonts),
          fontWeight: 500,
          fontSize: s.identitySub,
          letterSpacing: p === "ar" ? "0" : ".16em",
          textTransform: p === "ar" ? "none" : "uppercase",
          color: theme.dim,
          flex: "0 0 auto",
          minWidth: 0,
        }}
      >
        {renderRuns(deck.profile.name.runs, p, tpl.fonts)}
      </span>
      <Leader color={theme.accent} />
    </div>
  );
}

function Footer({ deck, slide, s, tpl, theme, isCover }: {
  deck: DeckIR; slide: SlideIR; s: Sizes; tpl: TemplateDescriptor; theme: Theme; isCover: boolean;
}) {
  const rtl = deck.dir === "rtl";
  const p = deck.primary_lang;
  // DeckIR declares western numerals only.
  const numeral = String(slide.index + 1).padStart(2, "0");
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 32, flex: "0 0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* The glyph REPLACES "in/". Never both. */}
        <LinkedInGlyph size={Math.round(s.meta * 1.1)} color={theme.fg} />
        {deck.profile.handle && (
          <span style={{ fontFamily: tpl.fonts.textEn, fontWeight: 400, fontSize: s.meta, color: theme.fg }} dir="ltr">
            {deck.profile.handle}
          </span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 18, flex: "0 0 auto" }}>
        {isCover && <ArrowMark size={50} color={theme.accent} rtl={rtl} />}
        <span
          data-pagination=""
          style={{
            fontFamily: tpl.fonts.textEn,
            fontWeight: 500,
            fontSize: s.meta,
            letterSpacing: ".14em",
            color: theme.accent,
          }}
          dir="ltr"
        >
          {p === "ar" ? numeral : `/ ${numeral}`}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Background — the hairline grid. repeating-linear-gradient, no filter. */
/* ------------------------------------------------------------------ */

function Background({ theme }: { theme: Theme }) {
  const grid = hairlineGrid("rgba(255,255,255,.07)", BLUEPRINT_GRID_PITCH);
  return (
    <>
      <div aria-hidden style={{ position: "absolute", inset: 0, background: theme.bgSolid }} />
      <div
        aria-hidden
        data-grid=""
        data-css={grid}
        style={{ position: "absolute", inset: 0, backgroundImage: grid }}
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

function Display({ lines, primary, theme, s, tpl, marked }: {
  lines?: HeroLine[]; primary: Lang; theme: Theme; s: Sizes; tpl: TemplateDescriptor;
  marked?: (line: HeroLine, i: number) => boolean;
}) {
  if (!lines?.length) return null;
  const test = marked ?? ((l: HeroLine) => Boolean(l.highlight));
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: primary === "ar" ? 14 : 8 }}>
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
            color: theme.head,
            letterSpacing: primary === "ar" ? "0" : "-.015em",
          }}
        >
          {test(line, i)
            ? <Underline runs={line.runs} primary={primary} theme={theme} fonts={tpl.fonts} />
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
        fontWeight: displayWeight(),
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
            fontWeight: 400,
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
    <div style={{ fontFamily: fontFor(primary, tpl.fonts), fontWeight: 400, fontSize: s.meta, color: theme.dim, textAlign: "start" }}>
      {renderRuns(node.runs, primary, tpl.fonts)}
    </div>
  );
}

/** Bars, each label tied to its figure by a dotted leader. */
function Bars({ slide, theme, s, tpl, deck }: PartProps) {
  const p = deck.primary_lang;
  const series = slide.slots.media?.chart?.series ?? [];
  if (!series.length) return null;
  const max = Math.max(...series.map((x) => Math.abs(x.value))) || 1;
  return (
    <div data-media-node="chart" style={{ display: "flex", flexDirection: "column", gap: Math.round(s.gap * 0.9) }}>
      {series.map((item, i) => {
        const fill = item.emphasis === "alert" ? theme.alert : theme.accent;
        return (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span style={{ fontFamily: fontFor(p, tpl.fonts), fontWeight: 400, fontSize: Math.max(s.meta, 28), color: theme.fg, flex: "0 0 auto" }}>
                {renderRuns(item.label.runs, p, tpl.fonts)}
              </span>
              <Leader color="rgba(255,255,255,.28)" height={1} />
              <span style={{ fontFamily: tpl.fonts.textEn, fontWeight: 700, fontSize: Math.max(s.meta, 28), color: theme.head, flex: "0 0 auto" }} dir="ltr">
                {item.value}{item.unit ?? ""}
              </span>
            </div>
            <div style={{ height: 16, background: theme.neutral, overflow: "hidden" }}>
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
        <img src={avatar} alt="" style={{ width: 92, height: 92, objectFit: "cover", borderRadius: 999, flex: "0 0 auto" }} />
      ) : initials ? (
        <div
          style={{
            width: 92, height: 92, flex: "0 0 auto", borderRadius: 999,
            background: theme.accent, color: theme.accentInk,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: tpl.fonts.textEn, fontWeight: 700, fontSize: 38,
          }}
          dir="ltr"
        >
          {initials}
        </div>
      ) : (
        // No photo and no initials: an accent rule, never a fabricated monogram.
        <div style={{ width: 10, height: 92, background: theme.accent, flex: "0 0 auto" }} />
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
        <div style={{ fontFamily: fontFor(p, tpl.fonts), fontWeight: 700, fontSize: s.identityName, color: theme.head, textAlign: "start" }}>
          {renderRuns(deck.profile.name.runs, p, tpl.fonts)}
        </div>
        {deck.profile.title && (
          <div style={{ fontFamily: fontFor(p, tpl.fonts), fontWeight: 400, fontSize: s.identitySub, color: theme.dim, textAlign: "start" }}>
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

function BlueprintBody(props: PartProps) {
  const { deck, slide, theme, s, tpl, hideTails } = props;
  const p = deck.primary_lang;
  const slots = slide.slots;
  const common = { primary: p, theme, s, tpl } as const;

  switch (slide.archetype) {
    /* 1 — the display, one line underlined in violet. */
    case "cover_hero":
      return (
        <Stack gap={s.gap}>
          <Display lines={slots.hero_lines} {...common} />
          {slots.subline && (
            <div
              style={{
                fontFamily: fontFor(p, tpl.fonts),
                fontWeight: 400,
                fontSize: Math.max(Math.round(s.content * 0.9), tpl.ramp.floors?.content ?? 0),
                lineHeight: s.contentLh,
                color: theme.dim,
                textAlign: "start",
              }}
            >
              {renderRuns(slots.subline.runs, p, tpl.fonts)}
            </div>
          )}
        </Stack>
      );

    /* 2 — the figure in violet, underlined, at display size. */
    case "cover_stat":
      return (
        <Stack gap={s.gap}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12 }}>
            {slots.stat_value && (
              <span
                data-hero-line=""
                dir="ltr"
                style={{ display: "inline-block", fontFamily: tpl.fonts.displayEn, fontWeight: 700, fontSize: s.display, lineHeight: s.displayLh }}
              >
                <Underline runs={[{ t: slots.stat_value, lang: "en" }]} primary="en" theme={theme} fonts={tpl.fonts} />
              </span>
            )}
            <Display lines={slots.hero_lines} {...common} marked={() => false} />
          </div>
          <Headline node={slots.stat_label} {...common} />
          <Meta node={slots.source} {...common} />
        </Stack>
      );

    /* 3 — the frame. */
    case "frame":
      return (
        <Stack gap={s.gap}>
          <Display lines={slots.hero_lines} {...common} />
          <Headline node={slots.headline} {...common} />
          <Body nodes={slots.body} primary={p} theme={theme} s={s} tpl={tpl} hideTails={hideTails} />
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
              style={{ display: "inline-block", fontFamily: tpl.fonts.displayEn, fontWeight: 700, fontSize: s.display, lineHeight: s.displayLh, color: theme.accent }}
            >
              {slots.stat_value}
            </span>
          )}
          <Headline node={slots.stat_label} {...common} />
          <Body nodes={slots.body} primary={p} theme={theme} s={s} tpl={tpl} hideTails={hideTails} />
          <Meta node={slots.source} {...common} />
        </Stack>
      );

    /* 5 — bars with leader lines. */
    case "benchmark":
      return (
        <Stack gap={s.gap}>
          <Headline node={slots.headline} {...common} />
          <Bars {...props} />
          <Meta node={slots.source} {...common} />
        </Stack>
      );

    /* 6 — the quotation, opened by a violet rule above it. */
    case "quote": {
      const quoteRuns = slots.quote?.runs ?? [];
      return (
        <Stack gap={s.gap}>
          <div style={{ width: 140, height: 6, background: theme.accent, flex: "0 0 auto" }} />
          <div
            style={{
              fontFamily: displayFamily(p, tpl.fonts),
              fontWeight: displayWeight(),
              fontSize: Math.max(Math.round(s.headline * 0.84), tpl.ramp.floors?.content ?? 0),
              lineHeight: p === "ar" ? tpl.ramp.heroArLh : 1.22,
              color: theme.head,
              textAlign: "start",
            }}
          >
            {quoteRuns.length ? renderRuns(quoteRuns, p, tpl.fonts) : null}
          </div>
          <Meta node={slots.source} {...common} />
        </Stack>
      );
    }

    /* 7 — numbered rows, each tied to its number by a leader. */
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
                <div key={i} style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
                  <span
                    dir="ltr"
                    style={{
                      display: "inline-block",
                      flex: "0 0 auto",
                      minWidth: 72,
                      fontFamily: tpl.fonts.displayEn,
                      fontWeight: 700,
                      fontSize: Math.max(s.content, tpl.ramp.floors?.content ?? 0),
                      color: theme.accent,
                    }}
                  >
                    {numeral(i + 1)}
                  </span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                    <div style={{ fontFamily: fontFor(p, tpl.fonts), fontWeight: 700, fontSize: Math.max(s.content, tpl.ramp.floors?.content ?? 0), lineHeight: p === "ar" ? tpl.ramp.bodyLhAr : 1.3, color: theme.head, textAlign: "start" }}>
                      {title}
                    </div>
                    {detail && (
                      <div style={{ fontFamily: fontFor(p, tpl.fonts), fontWeight: 400, fontSize: Math.max(Math.round(s.content * 0.85), tpl.ramp.floors?.content ?? 0), lineHeight: 1.5, color: theme.dim, textAlign: "start" }}>
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

    /* 8 — the term underlined, the definition under it. */
    case "definition":
      return (
        <Stack gap={s.gap}>
          <Display lines={slots.hero_lines} {...common} marked={() => false} />
          {slots.term && (
            <div style={{ fontFamily: displayFamily(p, tpl.fonts), fontWeight: displayWeight(), fontSize: s.headline, lineHeight: s.headlineLh, textAlign: "start" }}>
              <Underline runs={slots.term.runs} primary={p} theme={theme} fonts={tpl.fonts} />
            </div>
          )}
          {slots.term_def && (
            <div style={{ fontFamily: fontFor(p, tpl.fonts), fontWeight: 400, fontSize: s.content, lineHeight: s.contentLh, color: theme.fg, textAlign: "start" }}>
              {renderRuns(slots.term_def.runs, p, tpl.fonts)}
            </div>
          )}
          <Body nodes={slots.body} primary={p} theme={theme} s={s} tpl={tpl} hideTails={hideTails} />
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
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12 }}>
            {ctaLines.slice(0, 2).map((n, i) => (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  fontFamily: displayFamily(p, tpl.fonts),
                  fontWeight: displayWeight(),
                  fontSize: Math.max(Math.round(s.headline * 0.9), tpl.ramp.floors?.content ?? 0),
                  lineHeight: p === "ar" ? tpl.ramp.heroArLh : 1.2,
                }}
              >
                {i === 0
                  ? <Underline runs={n.runs} primary={p} theme={theme} fonts={tpl.fonts} />
                  : <span style={{ color: theme.head }}>{renderRuns(n.runs, p, tpl.fonts)}</span>}
              </span>
            ))}
          </div>
          <Body nodes={slots.body} primary={p} theme={theme} s={s} tpl={tpl} hideTails={hideTails} />
          <IdentityCard deck={deck} theme={theme} s={s} tpl={tpl} />
          <EngagementRow color={theme.accent} size={48} />
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

export interface BlueprintSlideProps {
  deck: DeckIR;
  slide: SlideIR;
  theme?: string | null;
  template?: string | null;
  onFit?: (state: FitState) => void;
}

export function BlueprintSlide({ deck, slide, theme: themeName, template, onFit }: BlueprintSlideProps) {
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
      {!isCover && <GhostNumeral n={slide.index + 1} color={theme.fg} rtl={rtl} fonts={tpl.fonts} />}
      <div style={{ position: "relative", display: "flex", flexDirection: "column", height: "100%", gap: s.gap }}>
        <Header deck={deck} s={s} tpl={tpl} theme={theme} />
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
          <BlueprintBody deck={deck} slide={slide} theme={theme} s={s} tpl={tpl} hideTails={hideTails} rtl={rtl} />
        </div>
        <Footer deck={deck} slide={slide} s={s} tpl={tpl} theme={theme} isCover={isCover} />
      </div>
    </div>
  );
}

export default BlueprintSlide;