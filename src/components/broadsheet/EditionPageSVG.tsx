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

/* Measured block height in px. */
function blockH(lines: string[], fontSize: number, lineHeight: number) {
  return Math.max(0, lines.length) * fontSize * lineHeight;
}

/* Cap by max lines with ellipsis on the last visible line. */
function capLines(lines: string[], maxLines: number, ellipsis = ELLIPSIS) {
  if (!lines || lines.length <= maxLines) return lines;
  const kept = lines.slice(0, Math.max(1, maxLines));
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
  ellipsis = ELLIPSIS,
) {
  const perLine = fontSize * lineHeight;
  const room = Math.max(1, Math.floor((endY - startY) / perLine));
  return capLines(lines, Math.min(maxLines, room), ellipsis);
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
  fill, lineHeight = 1.28, anchor = "start",
}: {
  x: number; y: number; lines: string[];
  fontFamily: string; fontSize: number;
  fontWeight?: number | string; fontStyle?: string;
  fill: string; lineHeight?: number; anchor?: "start" | "end" | "middle";
}) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontFamily={fontFamily} fontSize={fontSize} fontWeight={fontWeight as any} fontStyle={fontStyle} fill={fill}>
      {lines.map((l, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 0 : fontSize * lineHeight}>{l}</tspan>
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

  const contentTop = MASTHEAD_BOTTOM_FULL + 40;

  const leadLines = capLines(wrap(page.lead_headline || "", rtl ? 22 : 26), 4);
  const leadY = contentTop;
  const leadBottom = leadY + blockH(leadLines, leadFS, leadLH);

  const accentLinesRaw = page.lead_accent ? wrap(page.lead_accent, rtl ? 30 : 40) : [];
  const accentLines = capLines(accentLinesRaw, 3);
  const accentY = leadBottom + 24;
  const accentBottom = accentLines.length ? accentY + blockH(accentLines, accentFS, accentLH) : leadBottom;

  const deckY = accentBottom + 32;
  const deckLines = capLines(wrap(page.deck || "", rtl ? 34 : 46), 4);
  const deckBottom = deckY + blockH(deckLines, deckFS, deckLH);

  const figH = 190;
  const figY = deckBottom + 32;
  const figLabelY = figY + figH + 26;
  const tocRuleY = figLabelY + 22;
  const tocHeaderY = tocRuleY + 30;
  const tocFirstRowY = tocHeaderY + 40;
  const rowStep = 34;

  const maxRowsByBand = Math.max(0, Math.floor((FOOTER_TOP - 60 - tocFirstRowY) / rowStep));
  const tocRows = (page.toc || []).slice(0, Math.min(6, maxRowsByBand));
  const lastRowY = tocRows.length ? tocFirstRowY + (tocRows.length - 1) * rowStep : tocFirstRowY;
  const alsoY = lastRowY + 40;
  const showAlso = (page.also_inside || []).length > 0 && alsoY <= FOOTER_TOP - 8;

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

      <TextBlock
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
        <TextBlock
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

      <TextBlock
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

      <FigPlate x={edgePad} y={figY} w={W - edgePad * 2} h={figH} kind={page.fig?.kind || "line_signal"} rtl={rtl} />
      <text x={leftX} y={figLabelY} textAnchor={anchor} fontFamily={monoFont} fontSize={16} letterSpacing={rtl ? undefined : 2} fill={SPOT} style={rtl ? undefined : { textTransform: "uppercase" }}>
        {rtl ? page.fig?.label : (page.fig?.label || "").toUpperCase()}
      </text>

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

function renderInlineAccent(text: string, accent: string | undefined, font: string, size: number, weight: number, x: number, y: number, anchor: "start" | "end") {
  if (!accent || !text.includes(accent)) {
    return (
      <text x={x} y={y} textAnchor={anchor} fontFamily={font} fontSize={size} fontWeight={weight} fill={INK}>{text}</text>
    );
  }
  const idx = text.indexOf(accent);
  const before = text.slice(0, idx);
  const after = text.slice(idx + accent.length);
  return (
    <text x={x} y={y} textAnchor={anchor} fontFamily={font} fontSize={size} fontWeight={weight} fill={INK}>
      {before}
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
  const bodyFS = rtl ? 24 : 26;
  const bodyLH = 1.44;
  const readFS = rtl ? 22 : 24;
  const readLH = 1.42;

  const storyY = 200;
  const headlineTop = 260;

  const headlineLines = capLines(wrap(page.headline || "", rtl ? 22 : 28), 4);
  // renderInlineAccent draws each line at y = headlineTop + i * step (step in current code)
  const headStep = headFS * headLH;
  const headlineBottom = headlineTop + Math.max(0, headlineLines.length) * headStep;

  const figH = 210;
  const figY = Math.max(480, headlineBottom + 28);
  const figLabelY = figY + figH + 26;
  const newsLabelY = figLabelY + 42;
  const bodyY = newsLabelY + 32;

  const bodyLinesRaw = wrap(page.body || "", rtl ? 40 : 62);
  // Reserve space: rule + MY READ label + my_read block + source line
  const sourceY = FOOTER_TOP - 14;
  const readLabelPad = 30;
  const readTextPad = 32;
  // Guess my_read at max 6 lines when reserving.
  const readReserveLines = 6;
  const readReserveH = readReserveLines * readFS * readLH;
  const bodyEndCap = sourceY - 24 /* source label breathing */ - readReserveH - readTextPad - readLabelPad - 24 /* rule pad */;
  const bodyLines = capToBand(bodyLinesRaw, bodyY, bodyFS, bodyLH, bodyEndCap, 6);
  const bodyBottom = bodyY + blockH(bodyLines, bodyFS, bodyLH);

  const ruleY = bodyBottom + 24;
  const readLabelY = ruleY + readLabelPad;
  const readY = readLabelY + readTextPad;

  const readLines = capToBand(wrap(page.my_read || "", rtl ? 38 : 58), readY, readFS, readLH, sourceY - 20, 6);

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
        {headlineLines.map((line, i) => renderInlineAccent(line, i === 0 ? page.headline_accent : undefined, headlineFont, headFS, rtl ? 800 : 600, leftX, headlineTop + i * headStep, anchor))}
      </g>

      <FigPlate x={edgePad} y={figY} w={W - edgePad * 2} h={figH} kind={page.fig?.kind || "line_signal"} rtl={rtl} />
      <text x={leftX} y={figLabelY} textAnchor={anchor} fontFamily={monoFont} fontSize={14} letterSpacing={rtl ? undefined : 2} fill={SPOT} style={rtl ? undefined : { textTransform: "uppercase" }}>
        {rtl ? page.fig?.label : (page.fig?.label || "").toUpperCase()}
      </text>

      <text x={leftX} y={newsLabelY} textAnchor={anchor} fontFamily={monoFont} fontSize={13} letterSpacing={rtl ? undefined : 2.5} fill={INK2} style={rtl ? undefined : { textTransform: "uppercase" }}>
        {rtl ? "الخبر" : "THE NEWS"}
      </text>
      <TextBlock
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
      <TextBlock
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
        {rtl ? page.source_line : (page.source_line || "").toUpperCase()}
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
  const introLines = capLines(wrap(page.intro || "", rtl ? 38 : 56), 2);
  const introBottom = introY + blockH(introLines, introFS, introLH);

  const itemsStart = introBottom + 40;

  // Reserve for close block at the bottom.
  const closeLines = capLines(wrap(page.close || "", rtl ? 34 : 50), 2);
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

      <TextBlock
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
        const bigY = rowTop + 60;
        const claimY = rowTop + 8;
        const claimLines = capLines(wrap(item.claim || "", rtl ? 22 : 32), 2);
        const claimBottom = claimY + blockH(claimLines, claimFS, claimLH);
        const takeY = claimBottom + 16;
        // Cap takeaway so source fits within row.
        const rowBottom = rowTop + perItem;
        const sourceRowY = rowBottom - 14;
        const takeLines = capToBand(wrap(item.takeaway || "", rtl ? 34 : 48), takeY, takeFS, takeLH, sourceRowY - 20, 3);
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
            <TextBlock
              x={textX} y={claimY}
              lines={claimLines}
              fontFamily={rtl ? ARABIC : SERIF}
              fontSize={claimFS}
              fontWeight={600}
              fill={INK}
              anchor={anchor}
              lineHeight={claimLH}
            />
            <TextBlock
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
              {rtl ? item.source : (item.source || "").toUpperCase()}
            </text>
          </g>
        );
      })}

      <line x1={edgePad} x2={W - edgePad} y1={closeRuleY} y2={closeRuleY} stroke={INK} strokeWidth={2} />
      <TextBlock
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
  const aFS = 34;
  const aLH = 1.32;
  const inviteFS = 28;
  const inviteLH = 1.28;

  const qLines = capLines(wrap(page.question || "", rtl ? 26 : 34), 4);
  const qTop = 272;
  const barY = qTop - 42;
  const qBottom = qTop + blockH(qLines, qFS, qLH);
  const askedByY = qBottom + 24;
  const ruleY = askedByY + 34;
  const answerLabelY = ruleY + 36;
  const answerY = answerLabelY + 40;

  const inviteLines = capLines(wrap(page.invite || "", rtl ? 36 : 52), 3);
  const inviteH = blockH(inviteLines, inviteFS, inviteLH);
  const inviteY = FOOTER_TOP - inviteH - 8;

  const aLines = capToBand(wrap(page.answer || "", rtl ? 30 : 42), answerY, aFS, aLH, inviteY - 24, 8);

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
      <TextBlock
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
      <TextBlock
        x={leftX} y={answerY}
        lines={aLines}
        fontFamily={rtl ? ARABIC : SERIF}
        fontSize={aFS}
        fontWeight={400}
        fill={INK}
        anchor={anchor}
        lineHeight={aLH}
      />

      <TextBlock
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
  const headlineLines = capLines(wrap(page.headline || "", rtl ? 22 : 28), 3);
  const headStep = headFS * headLH;
  const headlineBottom = headlineTop + Math.max(0, headlineLines.length) * headStep;

  const promiseY = headlineBottom + 40;
  // The card ends at cardY + cardH = 1060; follow pill sits at cardY+cardH-148, sign at cardY+cardH-...; keep promise capped so it stays above signature.
  const signatureY = Math.min(cardY + 470, cardY + cardH - 250);
  const promiseLines = capToBand(wrap(page.promise || "", rtl ? 30 : 44), promiseY, promiseFS, promiseLH, signatureY - 20, 4);
  const signLineY = signatureY + 38;
  const followSubY = cardY + cardH - 40;

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
        {headlineLines.map((line, i) => renderInlineAccent(line, i === 0 ? page.headline_accent : undefined, rtl ? ARABIC : SERIF, headFS, rtl ? 800 : 600, cardLeft, headlineTop + i * headStep, cardAnchor))}
      </g>

      <TextBlock
        x={cardLeft} y={promiseY}
        lines={promiseLines}
        fontFamily={rtl ? ARABIC : SERIF}
        fontSize={promiseFS}
        fontWeight={400}
        fill={INK2}
        anchor={cardAnchor}
        lineHeight={promiseLH}
      />

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

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" direction={rtl ? "rtl" : "ltr"}>
      <rect x={0} y={0} width={W} height={H} fill={PAPER} />
      {body}
      <PressFooter
        w={W} h={H}
        authorName={authorFirst || edition.nameplate.name}
        authorTitle={edition.dateline}
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