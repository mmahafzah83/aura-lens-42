import React from "react";
import Masthead from "./Masthead";
import PressFooter from "./PressFooter";
import { FigPlate, type FigKind } from "./figs";
import {
  PAPER, INK, INK2, SPOT, RULE, RULE_SOFT,
  SERIF, MONO, ARABIC,
} from "./pressTokens";

/* ============================================================
 * Edition JSON shape (renderer contract — mirrors the EF output).
 * ============================================================ */

export interface Nameplate {
  name: string;
  style: "classic" | "monogram" | "arabic";
  monogram_char?: string;
}

export interface TocRow { title: string; section: string; page: number }
export interface DigestItem { big_value: string; claim: string; takeaway: string; source: string }

export interface FrontPage {
  page_type: "FRONT";
  kicker: string;
  lead_headline: string;
  lead_accent?: string;
  deck: string;
  fig: { kind: FigKind; label: string };
  toc: TocRow[];
  also_inside: string[];
}
export interface ArticlePage {
  page_type: "ARTICLE";
  section: string;
  story_no: string;
  kicker: string;
  headline: string;
  headline_accent?: string;
  fig: { kind: FigKind; label: string };
  body: string;
  my_read: string;
  source_line: string;
}
export interface DigestPage {
  page_type: "DIGEST";
  kicker: string;
  intro: string;
  items: DigestItem[];
  close: string;
}
export interface QAPage {
  page_type: "QA";
  kicker: string;
  question: string;
  asked_by_role: string;
  answer: string;
  invite: string;
}
export interface BackPage {
  page_type: "BACK";
  kicker: string;
  headline: string;
  headline_accent?: string;
  promise: string;
  sign_name: string;
  sign_line: string;
  follow_label: string;
  follow_sub: string;
}
export type EditionPage = FrontPage | ArticlePage | DigestPage | QAPage | BackPage;

export interface Edition {
  nameplate: Nameplate;
  edition_no: number;
  dateline: string;
  sector_line: string;
  lang: "en" | "ar";
  linkedin_caption: string;
  hashtags: string[];
  pages: EditionPage[];
}

/* ============================================================
 * Layout constants — 1080 × 1350 broadsheet page.
 * ============================================================ */

const W = 1080;
const H = 1350;

/* Vertical band: nothing except PressFooter renders at/below FOOTER_TOP. */
const FOOTER_TOP = H - 132; // 1218
const MASTHEAD_BOTTOM_FULL = 200;
const MASTHEAD_BOTTOM_SLIM = 180;
const ELLIPSIS = "…";

/* ============================================================
 * Fit-to-canvas width calibration.
 * charBudget(widthPx, fontSizePx, factor) → glyphs that fit per line.
 * ============================================================ */
const CHAR_FACTOR = {
  serif: 0.50,
  serifItalic: 0.49,
  serifBold: 0.52,
  arabic: 0.55,
  arabicBold: 0.60,
  mono: 0.70,
};
const charBudget = (widthPx: number, fs: number, factor: number) =>
  Math.floor((widthPx / (fs * factor)) * 0.94);

/* Cap a single source-style string with an ellipsis (applied BEFORE uppercase). */
const capSource = (s: string, max: number) => {
  const t = (s || "").trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
};

/* Measured block height in px. */
function blockH(lines: string[], fontSize: number, lineHeight: number) {
  return Math.max(0, lines.length) * fontSize * lineHeight;
}

/* Cap by max lines. Sentence-safe when it retains ≥80% of the kept text;
 * otherwise falls back to ellipsis on the last visible line.
 * `wrapChars` is the ORIGINAL per-line char budget used to produce `lines`. */
function capLines(lines: string[], maxLines: number, wrapChars: number, ellipsis = ELLIPSIS) {
  if (!lines || lines.length <= maxLines) return lines;
  const kept = lines.slice(0, Math.max(1, maxLines));
  const joined = kept.join(" ");
  const minCut = Math.floor(joined.length * 0.55);
  const terminators = [".", "؟", "!", "۔"];
  let cutIdx = -1;
  for (let i = joined.length - 1; i >= minCut; i--) {
    if (terminators.includes(joined[i])) { cutIdx = i; break; }
  }
  if (cutIdx > 0 && cutIdx >= joined.length * 0.8) {
    const clean = joined.slice(0, cutIdx + 1).trim();
    // Re-wrap the cut text with the ORIGINAL per-line budget.
    return wrap(clean, wrapChars).slice(0, maxLines);
  }
  const last = (kept[kept.length - 1] || "").replace(/[\s.…]+$/, "");
  kept[kept.length - 1] = last + ellipsis;
  return kept;
}

/* Cap so the block, drawn from startY, stays above endY; also honor a hard maxLines. */
function capToBand(
  lines: string[],
  startY: number,
  fontSize: number,
  lineHeight: number,
  endY: number,
  maxLines: number,
  wrapChars: number,
  ellipsis = ELLIPSIS,
) {
  const perLine = fontSize * lineHeight;
  const room = Math.max(1, Math.floor((endY - startY) / perLine));
  return capLines(lines, Math.min(maxLines, room), wrapChars, ellipsis);
}

/* Wrap plain text into <tspan> lines at a max width in glyphs. */
function wrap(text: string, chars: number): string[] {
  const words = (text || "").split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > chars) {
      if (line) out.push(line);
      line = w;
    } else {
      line = line ? line + " " + w : w;
    }
  }
  if (line) out.push(line);
  return out;
}

function TextBlock({
  x, y, lines, fontFamily, fontSize, fontWeight = 400, fontStyle = "normal",
  fill, lineHeight = 1.28, anchor = "start", rtl = false,
}: {
  x: number; y: number; lines: string[];
  fontFamily: string; fontSize: number;
  fontWeight?: number | string; fontStyle?: string;
  fill: string; lineHeight?: number; anchor?: "start" | "end" | "middle"; rtl?: boolean;
}) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontFamily={fontFamily} fontSize={fontSize} fontWeight={fontWeight as any} fontStyle={fontStyle} fill={fill}>
      {lines.map((l, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 0 : fontSize * lineHeight}>{rtl ? "\u200F" + l : l}</tspan>
      ))}
    </text>
  );
}

/* Numbers stay Western + LTR-isolated inside Arabic text runs. */
function ltrNum(s: string) {
  return (
    <tspan direction="ltr" style={{ unicodeBidi: "isolate" as any }}>{s}</tspan>
  );
}

/* ============================================================
 * FRONT
 * ============================================================ */

function FrontLayout({ page, edition, rtl }: { page: FrontPage; edition: Edition; rtl: boolean }) {
  const edgePad = rtl ? 96 : 68;
  const leftX = rtl ? W - edgePad : edgePad;
  const anchor = rtl ? "end" : "start";
  const headlineFont = rtl ? ARABIC : SERIF;
  const monoFont = rtl ? ARABIC : MONO;

  const leadFS = rtl ? 68 : 74;
  const leadLH = 1.08;
  const accentFS = rtl ? 40 : 44;
  const accentLH = 1.18;
  const deckFS = rtl ? 26 : 28;
  const deckLH = 1.44;

  const contentTop = MASTHEAD_BOTTOM_FULL + 68;

  const usable = W - edgePad * 2;
  const leadWrap = charBudget(usable, leadFS, rtl ? CHAR_FACTOR.arabicBold : CHAR_FACTOR.serifBold);
  const leadLines = capLines(wrap(page.lead_headline || "", leadWrap), 4, leadWrap);
  const leadY = contentTop;
  const leadBottom = leadY + blockH(leadLines, leadFS, leadLH);

  const accentWrap = charBudget(usable, accentFS, rtl ? CHAR_FACTOR.arabic : CHAR_FACTOR.serifItalic);
  const accentLinesRaw = page.lead_accent ? wrap(page.lead_accent, accentWrap) : [];
  const accentLines = capLines(accentLinesRaw, rtl ? 2 : 3, accentWrap);
  const accentY = leadBottom + 24;
  const accentBottom = accentLines.length ? accentY + blockH(accentLines, accentFS, accentLH) : leadBottom;

  const deckY = accentBottom + 32;
  const deckWrap = charBudget(usable, deckFS, rtl ? CHAR_FACTOR.arabic : CHAR_FACTOR.serif);
  const deckLines = capLines(wrap(page.deck || "", deckWrap), rtl ? 3 : 4, deckWrap);
  const deckBottom = deckY + blockH(deckLines, deckFS, deckLH);

  // TOC-FIRST budgeting. All planned rows appear; fig gets whatever remains.
  const rowStep = 34;
  const tocRowsPlanned = Math.min((page.toc || []).length, 4);
  const hasAlso = (page.also_inside || []).length > 0;
  const alsoAllowance = hasAlso ? 40 : 0;
  // tocRule → tocHeader(30) → firstRow(40) → (rows-1)*step → also(40 if any) → 8 slack
  const tocBlockAfterRule = 30 + 40 + Math.max(0, tocRowsPlanned - 1) * rowStep + alsoAllowance + 8;
  const spaceRemaining = FOOTER_TOP - deckBottom - 32 - tocBlockAfterRule;
  // If fig shown: figH + 26 (label pad) + 22 (rule pad) sits above tocRule
  const figHmax = Math.max(0, Math.min(190, spaceRemaining - 48));
  const showFig = figHmax >= 70;
  const figH = showFig ? figHmax : 0;
  const figY = deckBottom + 32;
  const figLabelY = figY + figH + 26;
  const tocRuleY = showFig ? figLabelY + 22 : deckBottom + 32;
  const tocHeaderY = tocRuleY + 30;
  const tocFirstRowY = tocHeaderY + 40;

  const tocRows = (page.toc || []).slice(0, tocRowsPlanned);
  const lastRowY = tocRows.length ? tocFirstRowY + (tocRows.length - 1) * rowStep : tocFirstRowY;
  const alsoY = lastRowY + 40;
  const showAlso = hasAlso && alsoY <= FOOTER_TOP - 8;

  return (
    <>
      <Masthead
        w={W}
        variant="full"
        nameplate={{ name: edition.nameplate.name, style: edition.nameplate.style, monogramChar: edition.nameplate.monogram_char }}
        topLeft={edition.dateline}
        topRight={edition.sector_line}
        editionLabel={rtl ? `الإصدار رقم ${edition.edition_no}` : `EDITION Nº ${edition.edition_no}`}
        kicker={page.kicker}
        rtl={rtl}
      />

      <TextBlock rtl={rtl}
        x={leftX}
        y={leadY}
        lines={leadLines}
        fontFamily={headlineFont}
        fontSize={leadFS}
        fontWeight={rtl ? 800 : 600}
        fill={INK}
        anchor={anchor}
        lineHeight={leadLH}
      />

      {accentLines.length ? (
        <TextBlock rtl={rtl}
          x={leftX}
          y={accentY}
          lines={accentLines}
          fontFamily={headlineFont}
          fontSize={accentFS}
          fontWeight={rtl ? 600 : 500}
          fontStyle={rtl ? "normal" : "italic"}
          fill={SPOT}
          anchor={anchor}
          lineHeight={accentLH}
        />
      ) : null}

      <TextBlock rtl={rtl}
        x={leftX}
        y={deckY}
        lines={deckLines}
        fontFamily={rtl ? ARABIC : SERIF}
        fontSize={deckFS}
        fontWeight={400}
        fill={INK2}
        anchor={anchor}
        lineHeight={deckLH}
      />

      {showFig ? (
        <>
          <FigPlate x={edgePad} y={figY} w={W - edgePad * 2} h={figH} kind={page.fig?.kind || "line_signal"} rtl={rtl} />
          <text x={leftX} y={figLabelY} textAnchor={anchor} fontFamily={monoFont} fontSize={16} letterSpacing={rtl ? undefined : 2} fill={SPOT} style={rtl ? undefined : { textTransform: "uppercase" }}>
            {rtl ? page.fig?.label : (page.fig?.label || "").toUpperCase()}
          </text>
        </>
      ) : null}

      <line x1={edgePad} x2={W - edgePad} y1={tocRuleY} y2={tocRuleY} stroke={INK} strokeWidth={2} />
      <text x={leftX} y={tocHeaderY} textAnchor={anchor} fontFamily={monoFont} fontSize={18} letterSpacing={rtl ? undefined : 3} fill={SPOT} style={rtl ? undefined : { textTransform: "uppercase" }}>
        {rtl ? "في هذا الإصدار" : "IN THIS EDITION"}
      </text>

      {tocRows.map((row, i) => {
        const rowY = tocFirstRowY + i * rowStep;
        const titleX = leftX;
        const folioText = `${row.section} · P.${row.page}`;
        return (
          <g key={i}>
            <text x={titleX} y={rowY} textAnchor={anchor} fontFamily={rtl ? ARABIC : SERIF} fontWeight={rtl ? 700 : 500} fontSize={22} fill={INK}>
              {row.title}
            </text>
            <line
              x1={rtl ? edgePad + 180 : edgePad + Math.min(row.title.length * 12 + 20, 520)}
              x2={rtl ? W - edgePad - Math.min(row.title.length * 13 + 20, 520) : W - edgePad - 180}
              y1={rowY - 6}
              y2={rowY - 6}
              stroke={INK2}
              strokeWidth={1}
              strokeDasharray="2 6"
            />
            <text x={rtl ? edgePad : W - edgePad} y={rowY} textAnchor={rtl ? "start" : "end"} fontFamily={MONO} fontSize={16} letterSpacing={2} fill={SPOT} direction="ltr" style={{ unicodeBidi: "isolate" as any, textTransform: "uppercase" }}>
              {folioText}
            </text>
          </g>
        );
      })}

      {showAlso ? (
        <text x={leftX} y={alsoY} textAnchor={anchor} fontFamily={monoFont} fontSize={15} letterSpacing={rtl ? undefined : 2.5} fill={INK2} style={rtl ? undefined : { textTransform: "uppercase" }}>
          {(page.also_inside || []).join("   ·   ")}
        </text>
      ) : null}
    </>
  );
}

/* ============================================================
 * ARTICLE
 * ============================================================ */

function renderInlineAccent(text: string, accent: string | undefined, font: string, size: number, weight: number, x: number, y: number, anchor: "start" | "end", rtl = false) {
  const rlm = rtl ? "\u200F" : "";
  if (!accent || !text.includes(accent)) {
    return (
      <text x={x} y={y} textAnchor={anchor} fontFamily={font} fontSize={size} fontWeight={weight} fill={INK}>{rlm + text}</text>
    );
  }
  const idx = text.indexOf(accent);
  const before = text.slice(0, idx);
  const after = text.slice(idx + accent.length);
  return (
    <text x={x} y={y} textAnchor={anchor} fontFamily={font} fontSize={size} fontWeight={weight} fill={INK}>
      {rlm + before}
      <tspan fill={SPOT} fontStyle="italic">{accent}</tspan>
      {after}
    </text>
  );
}

function ArticleLayout({ page, edition, pageIndex, total, rtl }: { page: ArticlePage; edition: Edition; pageIndex: number; total: number; rtl: boolean }) {
  const edgePad = rtl ? 96 : 68;
  const leftX = rtl ? W - edgePad : edgePad;
  const anchor = rtl ? "end" : "start";
  const headlineFont = rtl ? ARABIC : SERIF;
  const monoFont = rtl ? ARABIC : MONO;

  const headFS = rtl ? 46 : 52;
  const headLH = 1.14;
  const bodyLH = 1.44;
  const readLH = 1.42;

  const storyY = 200;
  const headlineTop = 260;

  const usable = W - edgePad * 2;
  const headWrap = charBudget(usable, headFS, rtl ? CHAR_FACTOR.arabicBold : CHAR_FACTOR.serifBold);
  const headlineLines = capLines(wrap(page.headline || "", headWrap), 4, headWrap);
  const headStep = headFS * headLH;
  const headlineBottom = headlineTop + Math.max(0, headlineLines.length) * headStep;

  // GROW-CAPABLE ladders: largest first, first-fit picks the largest that fits.
  const bodySizes = rtl ? [27, 25, 24, 22, 20] : [30, 28, 26, 24, 22];
  const readSizes = rtl ? [24, 23, 22, 20, 19] : [26, 25, 24, 22, 20];
  const bodyFactor = rtl ? CHAR_FACTOR.arabic : CHAR_FACTOR.serif;
  const readFactor = rtl ? CHAR_FACTOR.arabic : CHAR_FACTOR.serifItalic;

  const FIG_MIN = 150;
  const sourceY = FOOTER_TOP - 14;
  const figYstart = Math.max(480, headlineBottom + 28);
  const available = sourceY - 20 - figYstart;

  // GAP constants (label pads etc.): fig→figLabel 26, figLabel→newsLabel 42,
  // newsLabel→body 32, body→rule 24, rule→readLabel 30, readLabel→read 32.
  const G_FIG_LABEL = 26;
  const G_NEWS_LABEL = 42;
  const G_BODY = 32;
  const G_RULE = 24;
  const G_READ_LABEL = 30;
  const G_READ = 32;

  let chosenBodyFS = bodySizes[bodySizes.length - 1];
  let chosenReadFS = readSizes[readSizes.length - 1];
  let bodyLinesRaw: string[] = [];
  let readLinesPre: string[] = [];
  let bodyH = 0;
  let readH = 0;
  let fit = false;

  for (let i = 0; i < bodySizes.length; i++) {
    const bFS = bodySizes[i];
    const rFS = readSizes[i];
    const bWrap = charBudget(usable, bFS, bodyFactor);
    const rWrap = charBudget(usable, rFS, readFactor);
    const bLines = wrap(page.body || "", bWrap);
    const rLines = wrap(page.my_read || "", rWrap);
    const bH = blockH(bLines, bFS, bodyLH);
    const rH = blockH(rLines, rFS, readLH);
    const needed = FIG_MIN + G_FIG_LABEL + G_NEWS_LABEL + G_BODY + bH + G_RULE + G_READ_LABEL + G_READ + rH;
    if (needed <= available) {
      chosenBodyFS = bFS;
      chosenReadFS = rFS;
      bodyLinesRaw = bLines;
      readLinesPre = rLines;
      bodyH = bH;
      readH = rH;
      fit = true;
      break;
    }
  }

  const bodyFS = chosenBodyFS;
  const readFS = chosenReadFS;
  const bodyWrap = charBudget(usable, bodyFS, bodyFactor);
  const readWrap = charBudget(usable, readFS, readFactor);

  let figH = FIG_MIN;
  let extraAboveRule = 0;
  let extraAboveReadLabel = 0;
  let bodyLines: string[];
  let readLines: string[];

  if (fit) {
    const needed = FIG_MIN + G_FIG_LABEL + G_NEWS_LABEL + G_BODY + bodyH + G_RULE + G_READ_LABEL + G_READ + readH;
    const slack = Math.max(0, available - needed);
    figH = Math.min(260, FIG_MIN + slack * 0.6);
    const slackRest = slack - (figH - FIG_MIN);
    extraAboveRule = Math.max(0, slackRest * 0.5);
    extraAboveReadLabel = Math.max(0, slackRest * 0.5);
    bodyLines = bodyLinesRaw;
    readLines = readLinesPre;
  } else {
    // Smallest ladder still overflows: capToBand (sentence-safe now fixed).
    bodyLinesRaw = wrap(page.body || "", bodyWrap);
    readLinesPre = wrap(page.my_read || "", readWrap);
    // Reserve read region using its full text first, then cap body to what remains.
    const readCappedForReserve = capLines(readLinesPre, 5, readWrap);
    const readReserveH = blockH(readCappedForReserve, readFS, readLH);
    const bodyEndCap = sourceY - 20 - readReserveH - G_READ - G_READ_LABEL - G_RULE;
    const bodyY0 = figYstart + FIG_MIN + G_FIG_LABEL + G_NEWS_LABEL + G_BODY;
    bodyLines = capToBand(bodyLinesRaw, bodyY0, bodyFS, bodyLH, bodyEndCap, 6, bodyWrap);
    bodyH = blockH(bodyLines, bodyFS, bodyLH);
    const readY0 = bodyY0 + bodyH + G_RULE + G_READ_LABEL + G_READ;
    readLines = capToBand(readLinesPre, readY0, readFS, readLH, sourceY - 20, 5, readWrap);
    readH = blockH(readLines, readFS, readLH);
  }

  const figY = figYstart;
  const figLabelY = figY + figH + G_FIG_LABEL;
  const newsLabelY = figLabelY + G_NEWS_LABEL;
  const bodyY = newsLabelY + G_BODY;
  const bodyBottom = bodyY + bodyH;
  const ruleY = bodyBottom + G_RULE + extraAboveRule;
  const readLabelY = ruleY + G_READ_LABEL + extraAboveReadLabel;
  const readY = readLabelY + G_READ;

  const slimNameplate = { name: edition.nameplate.name, style: edition.nameplate.style, monogramChar: edition.nameplate.monogram_char };
  return (
    <>
      <Masthead
        w={W}
        variant="slim"
        nameplate={slimNameplate}
        editionLabel={`Nº ${edition.edition_no} · ${page.section} · P.${pageIndex + 1}/${total}`}
        kicker={page.kicker}
        rtl={rtl}
      />

      <text x={leftX} y={storyY} textAnchor={anchor} fontFamily={monoFont} fontSize={16} letterSpacing={rtl ? undefined : 3} fill={INK2} style={rtl ? undefined : { textTransform: "uppercase" }}>
        {page.story_no}
      </text>

      <g>
        {headlineLines.map((line, i) => renderInlineAccent(line, i === 0 ? page.headline_accent : undefined, headlineFont, headFS, rtl ? 800 : 600, leftX, headlineTop + i * headStep, anchor, rtl))}
      </g>

      <FigPlate x={edgePad} y={figY} w={W - edgePad * 2} h={figH} kind={page.fig?.kind || "line_signal"} rtl={rtl} />
      <text x={leftX} y={figLabelY} textAnchor={anchor} fontFamily={monoFont} fontSize={14} letterSpacing={rtl ? undefined : 2} fill={SPOT} style={rtl ? undefined : { textTransform: "uppercase" }}>
        {rtl ? page.fig?.label : (page.fig?.label || "").toUpperCase()}
      </text>

      <text x={leftX} y={newsLabelY} textAnchor={anchor} fontFamily={monoFont} fontSize={13} letterSpacing={rtl ? undefined : 2.5} fill={INK2} style={rtl ? undefined : { textTransform: "uppercase" }}>
        {rtl ? "الخبر" : "THE NEWS"}
      </text>
      <TextBlock rtl={rtl}
        x={leftX}
        y={bodyY}
        lines={bodyLines}
        fontFamily={rtl ? ARABIC : SERIF}
        fontSize={bodyFS}
        fontWeight={400}
        fill={INK}
        anchor={anchor}
        lineHeight={bodyLH}
      />

      <line x1={edgePad} x2={W - edgePad} y1={ruleY} y2={ruleY} stroke={INK} strokeWidth={2} />

      <text x={leftX} y={readLabelY} textAnchor={anchor} fontFamily={monoFont} fontSize={13} letterSpacing={rtl ? undefined : 2.5} fill={SPOT} style={rtl ? undefined : { textTransform: "uppercase" }}>
        {rtl ? "قراءتي" : "MY READ"}
      </text>
      <TextBlock rtl={rtl}
        x={leftX}
        y={readY}
        lines={readLines}
        fontFamily={rtl ? ARABIC : SERIF}
        fontSize={readFS}
        fontWeight={400}
        fontStyle={rtl ? "normal" : "italic"}
        fill={INK}
        anchor={anchor}
        lineHeight={readLH}
      />

      <text x={leftX} y={sourceY} textAnchor={anchor} fontFamily={monoFont} fontSize={14} letterSpacing={rtl ? undefined : 2} fill={INK2} style={rtl ? undefined : { textTransform: "uppercase" }}>
        {rtl ? capSource(page.source_line, 86) : capSource(page.source_line, 86).toUpperCase()}
      </text>
    </>
  );
}

/* ============================================================
 * DIGEST
 * ============================================================ */

function DigestLayout({ page, edition, pageIndex, total, rtl }: { page: DigestPage; edition: Edition; pageIndex: number; total: number; rtl: boolean }) {
  const edgePad = rtl ? 96 : 68;
  const leftX = rtl ? W - edgePad : edgePad;
  const anchor = rtl ? "end" : "start";
  const monoFont = rtl ? ARABIC : MONO;

  const introFS = rtl ? 26 : 28;
  const introLH = 1.36;
  const claimFS = 30;
  const claimLH = 1.22;
  const takeFS = rtl ? 22 : 24;
  const takeLH = 1.36;
  const closeFS = 22;
  const closeLH = 1.28;
  const lane = 240;

  const introY = 220;
  const introWrap = rtl ? 38 : 56;
  const introLines = capLines(wrap(page.intro || "", introWrap), 2, introWrap);
  const introBottom = introY + blockH(introLines, introFS, introLH);

  const itemsStart = introBottom + 40;

  // Reserve for close block at the bottom.
  const closeWrap = rtl ? 34 : 50;
  const closeLines = capLines(wrap(page.close || "", closeWrap), 2, closeWrap);
  const closeH = blockH(closeLines, closeFS, closeLH);
  const closeY = FOOTER_TOP - closeH - 10;
  const closeRuleY = closeY - 22;

  const items = (page.items || []).slice(0, 3);
  const availableForItems = closeRuleY - itemsStart;
  const perItem = items.length ? availableForItems / items.length : 0;

  return (
    <>
      <Masthead
        w={W} variant="slim"
        nameplate={{ name: edition.nameplate.name, style: edition.nameplate.style, monogramChar: edition.nameplate.monogram_char }}
        editionLabel={`Nº ${edition.edition_no} · DIGEST · P.${pageIndex + 1}/${total}`}
        kicker={page.kicker}
        rtl={rtl}
      />

      <TextBlock rtl={rtl}
        x={leftX} y={introY}
        lines={introLines}
        fontFamily={rtl ? ARABIC : SERIF}
        fontSize={introFS}
        fontWeight={400}
        fontStyle={rtl ? "normal" : "italic"}
        fill={INK2}
        anchor={anchor}
        lineHeight={introLH}
      />

      {items.map((item, i) => {
        const rowTop = itemsStart + i * perItem;
        const rowRuleY = rowTop - 8;
        const bigX = rtl ? W - edgePad : edgePad;
        const textX = rtl ? W - edgePad - lane : edgePad + lane;
        const bigY = rowTop + 82;
        const claimY = rowTop + 34;
        const claimWrap = rtl ? 22 : 32;
        const claimLines = capLines(wrap(item.claim || "", claimWrap), 2, claimWrap);
        const claimBottom = claimY + blockH(claimLines, claimFS, claimLH);
        const takeY = claimBottom + 16;
        // Cap takeaway so source fits within row.
        const rowBottom = rowTop + perItem;
        const sourceRowY = rowBottom - 14;
        const takeWrap = rtl ? 34 : 48;
        const takeLines = capToBand(wrap(item.takeaway || "", takeWrap), takeY, takeFS, takeLH, sourceRowY - 20, 3, takeWrap);
        const takeBottom = takeY + blockH(takeLines, takeFS, takeLH);
        const sourceY = Math.min(sourceRowY, takeBottom + 24);
        return (
          <g key={i}>
            <line x1={edgePad} x2={W - edgePad} y1={rowRuleY} y2={rowRuleY} stroke={RULE} strokeWidth={1} />
            <text
              x={bigX} y={bigY}
              textAnchor={rtl ? "end" : "start"}
              fontFamily={SERIF}
              fontWeight={300}
              fontSize={76}
              fill={SPOT}
              direction="ltr"
              style={{ unicodeBidi: "isolate" as any }}
            >
              {item.big_value}
            </text>
            <TextBlock rtl={rtl}
              x={textX} y={claimY}
              lines={claimLines}
              fontFamily={rtl ? ARABIC : SERIF}
              fontSize={claimFS}
              fontWeight={600}
              fill={INK}
              anchor={anchor}
              lineHeight={claimLH}
            />
            <TextBlock rtl={rtl}
              x={textX} y={takeY}
              lines={takeLines}
              fontFamily={rtl ? ARABIC : SERIF}
              fontSize={takeFS}
              fontWeight={400}
              fill={INK2}
              anchor={anchor}
              lineHeight={takeLH}
            />
            <text x={textX} y={sourceY} textAnchor={anchor} fontFamily={monoFont} fontSize={16} letterSpacing={rtl ? undefined : 2} fill={INK2} style={rtl ? undefined : { textTransform: "uppercase" }}>
              {rtl ? capSource(item.source, 40) : capSource(item.source, 40).toUpperCase()}
            </text>
          </g>
        );
      })}

      <line x1={edgePad} x2={W - edgePad} y1={closeRuleY} y2={closeRuleY} stroke={INK} strokeWidth={2} />
      <TextBlock rtl={rtl}
        x={leftX} y={closeY}
        lines={closeLines}
        fontFamily={rtl ? ARABIC : SERIF}
        fontSize={closeFS}
        fontStyle={rtl ? "normal" : "italic"}
        fill={INK}
        anchor={anchor}
        lineHeight={closeLH}
      />
    </>
  );
}

/* ============================================================
 * QA
 * ============================================================ */

function QALayout({ page, edition, pageIndex, total, rtl }: { page: QAPage; edition: Edition; pageIndex: number; total: number; rtl: boolean }) {
  const edgePad = rtl ? 96 : 68;
  const leftX = rtl ? W - edgePad : edgePad;
  const anchor = rtl ? "end" : "start";
  const monoFont = rtl ? ARABIC : MONO;
  const barW = 6;
  const barX = rtl ? W - edgePad - barW : edgePad;
  const questionX = rtl ? W - edgePad - 32 : edgePad + 32;

  const qFS = 58;
  const qLH = 1.22;
  const inviteFS = 28;
  const inviteLH = 1.28;

  const qWrap = rtl ? 26 : 34;
  const qLines = capLines(wrap(page.question || "", qWrap), 4, qWrap);
  const qTop = 272;
  const barY = qTop - 42;
  const qBottom = qTop + blockH(qLines, qFS, qLH);
  const askedByY = qBottom + 24;
  const ruleY = askedByY + 34;
  const answerLabelY = ruleY + 36;
  const answerY = answerLabelY + 40;

  const inviteWrap = rtl ? 36 : 52;
  const inviteLines = capLines(wrap(page.invite || "", inviteWrap), 3, inviteWrap);
  const inviteH = blockH(inviteLines, inviteFS, inviteLH);
  const inviteY = FOOTER_TOP - inviteH - 8;

  // Adaptive fit for the answer: ladder aSizes with scaled char budget.
  const aSizes = rtl ? [34, 30, 27] : [34, 31, 28];
  const aBaseFS = aSizes[0];
  const aBaseChars = rtl ? 30 : 42;
  const aAvailable = (inviteY - 24) - answerY;
  const aLHmin = 1.32;
  const aLHmax = 1.44;
  let aFS = aSizes[aSizes.length - 1];
  let aLH = aLHmin;
  let aWrap = Math.round((aBaseChars * aBaseFS) / aFS);
  let aLines: string[] = [];
  let aFit = false;
  for (const fs of aSizes) {
    const w = Math.round((aBaseChars * aBaseFS) / fs);
    const lines = wrap(page.answer || "", w);
    const h = blockH(lines, fs, aLHmin);
    if (h <= aAvailable) {
      aFS = fs;
      aWrap = w;
      aLines = lines;
      const slack = aAvailable - h;
      if (slack > 60 && lines.length > 0) {
        // Distribute slack across lines by growing lineHeight up to aLHmax.
        const wantLH = aAvailable / (lines.length * fs);
        aLH = Math.min(aLHmax, Math.max(aLHmin, wantLH));
      } else {
        aLH = aLHmin;
      }
      aFit = true;
      break;
    }
  }
  if (!aFit) {
    aWrap = Math.round((aBaseChars * aBaseFS) / aFS);
    aLines = capToBand(wrap(page.answer || "", aWrap), answerY, aFS, aLH, inviteY - 24, 8, aWrap);
  }

  return (
    <>
      <Masthead
        w={W} variant="slim"
        nameplate={{ name: edition.nameplate.name, style: edition.nameplate.style, monogramChar: edition.nameplate.monogram_char }}
        editionLabel={`Nº ${edition.edition_no} · QA · P.${pageIndex + 1}/${total}`}
        kicker={page.kicker}
        rtl={rtl}
      />

      <rect x={barX} y={barY} width={barW} height={blockH(qLines, qFS, qLH) + 20} fill={SPOT} />
      <TextBlock rtl={rtl}
        x={questionX} y={qTop}
        lines={qLines}
        fontFamily={rtl ? ARABIC : SERIF}
        fontSize={qFS}
        fontWeight={rtl ? 700 : 400}
        fontStyle={rtl ? "normal" : "italic"}
        fill={INK}
        anchor={anchor}
        lineHeight={qLH}
      />

      <text x={questionX} y={askedByY} textAnchor={anchor} fontFamily={monoFont} fontSize={18} letterSpacing={rtl ? undefined : 2.5} fill={INK2} style={rtl ? undefined : { textTransform: "uppercase" }}>
        {rtl ? `— ${page.asked_by_role}` : `— ${(page.asked_by_role || "").toUpperCase()}`}
      </text>

      <line x1={edgePad} x2={W - edgePad} y1={ruleY} y2={ruleY} stroke={INK} strokeWidth={2} />
      <text x={leftX} y={answerLabelY} textAnchor={anchor} fontFamily={monoFont} fontSize={16} letterSpacing={rtl ? undefined : 3} fill={SPOT} style={rtl ? undefined : { textTransform: "uppercase" }}>
        {rtl ? "إجابتي" : "MY ANSWER"}
      </text>
      <TextBlock rtl={rtl}
        x={leftX} y={answerY}
        lines={aLines}
        fontFamily={rtl ? ARABIC : SERIF}
        fontSize={aFS}
        fontWeight={400}
        fill={INK}
        anchor={anchor}
        lineHeight={aLH}
      />

      <TextBlock rtl={rtl}
        x={leftX} y={inviteY}
        lines={inviteLines}
        fontFamily={rtl ? ARABIC : SERIF}
        fontSize={inviteFS}
        fontStyle={rtl ? "normal" : "italic"}
        fill={INK2}
        anchor={anchor}
        lineHeight={inviteLH}
      />
    </>
  );
}

/* ============================================================
 * BACK — colophon card
 * ============================================================ */

function BackLayout({ page, edition, pageIndex, total, rtl }: { page: BackPage; edition: Edition; pageIndex: number; total: number; rtl: boolean }) {
  const edgePad = rtl ? 96 : 68;
  const leftX = rtl ? W - edgePad : edgePad;
  const anchor = rtl ? "end" : "start";
  const monoFont = rtl ? ARABIC : MONO;

  const cardX = 100;
  const cardY = 340;
  const cardW = W - 200;
  const cardH = 720;
  const cardLeft = rtl ? W - cardX - 40 : cardX + 40;
  const cardAnchor = rtl ? "end" : "start";

  const headFS = rtl ? 42 : 48;
  const headLH = 1.16;
  const promiseFS = 26;
  const promiseLH = 1.42;

  const headlineTop = cardY + 90;
  const headWrapB = rtl ? 22 : 28;
  const headlineLines = capLines(wrap(page.headline || "", headWrapB), 3, headWrapB);
  const headStep = headFS * headLH;
  const headlineBottom = headlineTop + Math.max(0, headlineLines.length) * headStep;

  const promiseY = headlineBottom + 40;
  // Reserve: action row (96) + gap (40) + signature (46) + sign_line (16+gap) + follow pill (64) + follow_sub.
  // Follow pill sits at cardY+cardH-148, followSubY at cardY+cardH-40.
  const followPillY = cardY + cardH - 148;
  // Signature must sit above the follow pill with room for sign_line.
  const maxSignatureY = followPillY - 60;
  // Action row height budget.
  const ACTION_ROW_H = 96;
  const ACTION_GAP_ABOVE = 36;
  const ACTION_GAP_BELOW = 40;
  // Cap promise so action row + signature stay inside card.
  const promiseCap = maxSignatureY - ACTION_GAP_BELOW - ACTION_ROW_H - ACTION_GAP_ABOVE - 20;
  const promiseWrap = rtl ? 30 : 44;
  const promiseLines = capToBand(wrap(page.promise || "", promiseWrap), promiseY, promiseFS, promiseLH, promiseCap, 3, promiseWrap);
  const promiseBottom = promiseY + blockH(promiseLines, promiseFS, promiseLH);
  const iconRowY = promiseBottom + ACTION_GAP_ABOVE;
  const signatureY = Math.min(maxSignatureY, iconRowY + ACTION_ROW_H + ACTION_GAP_BELOW);
  const signLineY = signatureY + 38;
  const followSubY = cardY + cardH - 40;

  // 4-action row (like carousel CTA). RTL reverses visual order so أعجبني sits rightmost.
  const actionsEN = [
    { glyph: "♡", label: "Like" },
    { glyph: "✎", label: "Comment" },
    { glyph: "↗", label: "Share" },
    { glyph: "❒", label: "Save" },
  ];
  const actionsAR = [
    { glyph: "♡", label: "أعجبني" },
    { glyph: "✎", label: "تعليق" },
    { glyph: "↗", label: "مشاركة" },
    { glyph: "❒", label: "حفظ" },
  ];
  const actions = rtl ? [...actionsAR].reverse() : actionsEN;
  const actionCount = actions.length;
  const actionSpan = cardW - 200;
  const actionStep = actionSpan / (actionCount - 1);
  const actionStartX = cardX + (cardW - actionSpan) / 2;
  const actionCenterY = iconRowY + 34;
  const actionLabelY = actionCenterY + 44;
  const actionFont = rtl ? ARABIC : MONO;

  return (
    <>
      <Masthead
        w={W} variant="slim"
        nameplate={{ name: edition.nameplate.name, style: edition.nameplate.style, monogramChar: edition.nameplate.monogram_char }}
        editionLabel={`Nº ${edition.edition_no} · BACK · P.${pageIndex + 1}/${total}`}
        kicker={page.kicker}
        rtl={rtl}
      />

      <rect x={cardX} y={cardY} width={cardW} height={cardH} fill="none" stroke={INK} strokeWidth={2} />
      <rect x={cardX + 12} y={cardY + 12} width={cardW - 24} height={cardH - 24} fill="none" stroke={RULE_SOFT} strokeWidth={1} />

      <g>
        {headlineLines.map((line, i) => renderInlineAccent(line, i === 0 ? page.headline_accent : undefined, rtl ? ARABIC : SERIF, headFS, rtl ? 800 : 600, cardLeft, headlineTop + i * headStep, cardAnchor, rtl))}
      </g>

      <TextBlock rtl={rtl}
        x={cardLeft} y={promiseY}
        lines={promiseLines}
        fontFamily={rtl ? ARABIC : SERIF}
        fontSize={promiseFS}
        fontWeight={400}
        fill={INK2}
        anchor={cardAnchor}
        lineHeight={promiseLH}
      />

      <g>
        {actions.map((a, i) => {
          const cx = actionStartX + i * actionStep;
          return (
            <g key={i}>
              <circle cx={cx} cy={actionCenterY} r={22} fill="none" stroke={SPOT} strokeWidth={1.5} />
              <text x={cx} y={actionCenterY + 8} textAnchor="middle" fontFamily={SERIF} fontSize={22} fill={SPOT}>
                {a.glyph}
              </text>
              <text x={cx} y={actionLabelY} textAnchor="middle" fontFamily={actionFont} fontSize={12} fontWeight={700} letterSpacing={rtl ? undefined : 1.5} fill={INK2} style={rtl ? undefined : { textTransform: "uppercase" }}>
                {a.label}
              </text>
            </g>
          );
        })}
      </g>

      <text x={cardLeft} y={signatureY} textAnchor={cardAnchor} fontFamily={rtl ? ARABIC : SERIF} fontStyle={rtl ? "normal" : "italic"} fontWeight={rtl ? 700 : 400} fontSize={46} fill={INK}>
        {page.sign_name}
      </text>
      <text x={cardLeft} y={signLineY} textAnchor={cardAnchor} fontFamily={monoFont} fontSize={16} letterSpacing={rtl ? undefined : 2} fill={INK2} style={rtl ? undefined : { textTransform: "uppercase" }}>
        {rtl ? page.sign_line : (page.sign_line || "").toUpperCase()}
      </text>

      <g transform={`translate(${rtl ? W - cardX - 40 - 320 : cardX + 40}, ${cardY + cardH - 148})`}>
        <rect x={0} y={0} width={320} height={64} rx={32} ry={32} fill={INK} />
        <text x={160} y={40} textAnchor="middle" fontFamily={monoFont} fontSize={16} letterSpacing={rtl ? undefined : 2.5} fill={PAPER} style={rtl ? undefined : { textTransform: "uppercase" }}>
          {page.follow_label}
        </text>
      </g>
      <text x={cardLeft} y={followSubY} textAnchor={cardAnchor} fontFamily={monoFont} fontSize={15} letterSpacing={rtl ? undefined : 2} fill={INK2} style={rtl ? undefined : { textTransform: "uppercase" }}>
        {rtl ? page.follow_sub : (page.follow_sub || "").toUpperCase()}
      </text>
    </>
  );
}

/* ============================================================
 * Dispatcher
 * ============================================================ */

export interface EditionPageSVGProps {
  page: EditionPage;
  pageIndex: number;
  total: number;
  edition: Edition;
}

export default function EditionPageSVG({ page, pageIndex, total, edition }: EditionPageSVGProps) {
  const rtl = edition.lang === "ar";
  const authorFirst = edition.nameplate.name.replace(/^(The|نشرة)\s+/i, "").split(/\s+/)[0] || "";

  let body: React.ReactNode = null;
  switch (page.page_type) {
    case "FRONT":   body = <FrontLayout page={page} edition={edition} rtl={rtl} />; break;
    case "ARTICLE": body = <ArticleLayout page={page} edition={edition} pageIndex={pageIndex} total={total} rtl={rtl} />; break;
    case "DIGEST":  body = <DigestLayout page={page} edition={edition} pageIndex={pageIndex} total={total} rtl={rtl} />; break;
    case "QA":      body = <QALayout page={page} edition={edition} pageIndex={pageIndex} total={total} rtl={rtl} />; break;
    case "BACK":    body = <BackLayout page={page} edition={edition} pageIndex={pageIndex} total={total} rtl={rtl} />; break;
    default:
      body = <text x={W / 2} y={H / 2} textAnchor="middle" fontFamily={SERIF} fill={INK}>Unknown page type</text>;
  }

  const footerDate = (edition.dateline || "").split("·").pop()?.trim() || edition.dateline;

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ unicodeBidi: "plaintext" as any, direction: "ltr" }}>
      {rtl && (
        <defs>
          <style>{`text, tspan { unicode-bidi: plaintext; }`}</style>
        </defs>
      )}
      <rect x={0} y={0} width={W} height={H} fill={PAPER} />
      {body}
      <PressFooter
        w={W} h={H}
        authorName={authorFirst || edition.nameplate.name}
        authorTitle={footerDate}
        rtl={rtl}
        mode="rail"
        current={pageIndex + 1}
        total={total}
      />
    </svg>
  );
}

/* Small helper the Studio page uses to describe the page in the filmstrip. */
export function pageLabel(page: EditionPage, lang: "en" | "ar"): string {
  const rtl = lang === "ar";
  switch (page.page_type) {
    case "FRONT":   return rtl ? "الغلاف" : "Front";
    case "ARTICLE": return page.section || (rtl ? "قصة" : "Article");
    case "DIGEST":  return rtl ? "الملخّص" : "Digest";
    case "QA":      return rtl ? "أنت سألت" : "You Asked";
    case "BACK":    return rtl ? "حتى المرة القادمة" : "Back";
  }
}

// silence unused warning
void ltrNum;