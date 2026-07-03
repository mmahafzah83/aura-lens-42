import React from "react";
import Masthead from "./Masthead";
import PressFooter from "./PressFooter";
import { FigPlate, pickFig } from "./figs";
import {
  PAPER, INK, INK2, SPOT, RULE, RULE_SOFT, SERIF, MONO, ARABIC,
} from "./pressTokens";
import { pickFig as pickFigKind } from "./figs";

// Minimal structural types — kept local so the file is decoupled from the studio.
export interface BroadsheetSlide {
  slide_number: number;
  slide_type: string;
  section_label?: string;
  headline?: string;
  headline_accent?: string;
  body?: string;
  number?: string;
  number_context?: string;
  number_source?: string;
  question_text?: string;
  cta_main?: string;
  cta_sub?: string;
  cta_button?: string;
  grid_items?: string[];
  compare_left_title?: string;
  compare_left_items?: string[];
  compare_right_title?: string;
  compare_right_items?: string[];
  list_items?: { label: "KILL"|"KEEP"|"DO"|"DONT"|"STOP"|"START"; text: string }[];
  terminal_file?: string;
  terminal_lines?: string[];
  terminal_punchline?: string;
  terminal_keywords?: string[];
}

export interface BroadsheetCarousel {
  slides?: BroadsheetSlide[];
  author_name?: string;
  author_title?: string;
  author_handle?: string;
  carousel_title?: string;
  signal_attribution?: string | null;
}

export interface BroadsheetProps {
  slide: BroadsheetSlide;
  total: number;
  w: number;
  h: number;
  carousel: BroadsheetCarousel;
  lang?: "en" | "ar";
  displayLabel: string;
  sectorFocus?: string;
  renderHeadlineWithAccent: (
    headline: string,
    accent: string | undefined,
    fg: string,
    accentColor: string,
    italic?: boolean,
  ) => React.ReactNode;
  wrapText: (text: string, maxCharsPerLine: number) => string[];
}

function firstWord(s: string): string {
  const t = (s || "").trim();
  if (!t) return "";
  return t.split(/\s+/)[0];
}

export function getNameplate(carousel: BroadsheetCarousel): {
  name: string;
  style: "classic" | "monogram" | "arabic";
  monogramChar?: string;
} {
  const author = (carousel.author_name || "").trim();
  const name = author ? `The ${firstWord(author)} Brief` : "The Brief";
  return { name, style: "classic" };
}

function formatDateline(d: Date): string {
  // Week number (ISO)
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(
    ((target.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7,
  );
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const dd = String(d.getDate()).padStart(2, "0");
  return `Week ${String(week).padStart(2, "0")} · ${dd} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function PaperGrain({ w, h, id }: { w: number; h: number; id: string }) {
  return (
    <g pointerEvents="none">
      <defs>
        <pattern id={id} x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
          <circle cx="0.5" cy="0.5" r="0.5" fill={INK} fillOpacity="0.045" />
        </pattern>
      </defs>
      <rect width={w} height={h} fill={`url(#${id})`} />
    </g>
  );
}

export default function BroadsheetSlideSVG(props: BroadsheetProps) {
  const { slide, total, w, h, carousel, lang = "en", displayLabel, sectorFocus, renderHeadlineWithAccent, wrapText } = props;
  const rtl = lang === "ar";
  const edgePad = rtl ? 96 : 68;
  const nameplate = getNameplate(carousel);
  if (rtl) nameplate.style = "arabic";
  const variant: "full" | "slim" = slide.slide_number === 1 ? "full" : "slim";
  const now = new Date();
  const dateline = formatDateline(now);
  const topLeft = sectorFocus ? sectorFocus : "Strategic Intelligence";
  const editionLabel = variant === "full" ? dateline : `P.${slide.slide_number}/${total}`;
  const contentY = variant === "full" ? 200 : 164;
  const grainId = `grain-${slide.slide_number}`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} xmlns="http://www.w3.org/2000/svg"
         style={{ width: "100%", height: "100%", display: "block", unicodeBidi: "plaintext" as any }}>
      <defs>
        {rtl && <style>{`text, tspan { unicode-bidi: plaintext; }`}</style>}
      </defs>
      <rect width={w} height={h} fill={PAPER} />
      <PaperGrain w={w} h={h} id={grainId} />

      <Masthead
        w={w}
        variant={variant}
        nameplate={nameplate}
        topLeft={variant === "full" ? topLeft : undefined}
        topRight={variant === "full" ? dateline : undefined}
        editionLabel={editionLabel}
        kicker={variant === "full" ? displayLabel : undefined}
        rtl={rtl}
      />

      <BroadsheetBody
        slide={slide}
        w={w}
        h={h}
        contentY={contentY}
        rtl={rtl}
        edgePad={edgePad}
        carousel={carousel}
        sectorFocus={sectorFocus}
        displayLabel={displayLabel}
        renderHeadlineWithAccent={renderHeadlineWithAccent}
        wrapText={wrapText}
      />

      <PressFooter
        w={w}
        h={h}
        authorName={(carousel.author_name || "").trim() || (rtl ? "اسمك" : "Your Name")}
        authorTitle={carousel.author_title || ""}
        rtl={rtl}
        mode="rail"
        current={slide.slide_number}
        total={total}
      />
    </svg>
  );
}

function BroadsheetBody({
  slide, w, h, contentY, rtl, edgePad, carousel, sectorFocus, displayLabel,
  renderHeadlineWithAccent, wrapText,
}: {
  slide: BroadsheetSlide;
  w: number; h: number; contentY: number;
  rtl: boolean; edgePad: number;
  carousel: BroadsheetCarousel;
  sectorFocus?: string;
  displayLabel: string;
  renderHeadlineWithAccent: BroadsheetProps["renderHeadlineWithAccent"];
  wrapText: BroadsheetProps["wrapText"];
}) {
  const textW = w - edgePad * 2;
  const leftX = rtl ? w - edgePad : edgePad;
  const rightX = rtl ? edgePad : w - edgePad;
  const anchorStart: "start" | "end" = rtl ? "end" : "start";
  const HEAD_FONT = rtl ? ARABIC : SERIF;
  const BODY_FONT = rtl ? ARABIC : SERIF;
  const LABEL_FONT = rtl ? ARABIC : MONO;
  const HEAD_WEIGHT = rtl ? 800 : 500;
  const BODY_WEIGHT = rtl ? 600 : 400;
  const LABEL_WEIGHT = rtl ? 700 : 600;
  const L: Record<string, string> = {
    myth_tag: rtl ? "كان السائد يقول —" : "THE RECORD PREVIOUSLY READ —",
    corrected: rtl ? "والتصحيح" : "CORRECTED TO READ",
    KILL: rtl ? "حذف" : "KILL",
    KEEP: rtl ? "إبقاء" : "KEEP",
    STOP: rtl ? "توقف" : "STOP",
    START: rtl ? "ابدأ" : "START",
    DO: rtl ? "افعل" : "DO",
    DONT: rtl ? "لا تفعل" : "DONT",
  };

  if (slide.slide_type === "COVER") {
    const figY = contentY;
    const figH = 150;
    const headlineY = figY + figH + 90;
    const headline = slide.headline || "";
    const lines = rtl ? wrapText(headline, 18) : wrapText(headline, 20);
    const lineHeight = rtl ? 1.5 * 74 : 1.05 * 86;
    const deckY = headlineY + lines.length * lineHeight + 40;
    const deckLines = wrapText(slide.body || "", rtl ? 40 : 50).slice(0, 2);
    const swipeLabel = rtl ? "اسحب ——" : "SWIPE ——";
    const swipeX = rtl ? 40 : w - 40;
    return (
      <g>
        <text
          x={leftX} y={figY - 22} textAnchor={anchorStart}
          fontFamily={MONO} fontSize={18} letterSpacing={4}
          fill={INK2} style={{ textTransform: "uppercase" }}
        >
          FIG.
        </text>
        <FigPlate x={edgePad} y={figY} w={textW} h={figH} kind={pickFig(sectorFocus || "", 0)} rtl={rtl} />
        <g>
          {lines.map((ln, i) => (
            <text key={i}
              x={leftX} y={headlineY + i * lineHeight}
              textAnchor={anchorStart}
              fontFamily={rtl ? ARABIC : SERIF}
              fontWeight={rtl ? 800 : 500}
              fontSize={rtl ? 74 : 86}
              fill={INK}
              style={{ letterSpacing: rtl ? undefined : "-0.02em" }}
            >
              {renderHeadlineWithAccent(ln, slide.headline_accent, INK, SPOT, true)}
            </text>
          ))}
        </g>
        {deckLines.map((ln, i) => (
          <text key={`d${i}`}
            x={leftX} y={deckY + i * 40}
            textAnchor={anchorStart}
            fontFamily={rtl ? ARABIC : SERIF}
            fontSize={31} fill={INK2}
          >
            {ln}
          </text>
        ))}
        <g transform={`translate(${swipeX},${h / 2}) rotate(${rtl ? -90 : 90})`}>
          <text textAnchor="middle" fontFamily={rtl ? ARABIC : MONO}
                fontSize={20} letterSpacing={rtl ? undefined : 6}
                fill={INK2}
                style={rtl ? undefined : { textTransform: "uppercase" }}>
            {swipeLabel}
          </text>
        </g>
      </g>
    );
  }

  if (slide.slide_type === "BIG_NUMBER") {
    const raw = (slide.number || "").trim();
    const m = raw.match(/^([-−]?[\d.,]+)(.*)$/);
    const numMain = m ? m[1] : raw;
    const suffix = m ? m[2].trim() : "";
    const numY = contentY + 260;
    const ruleY = numY + 40;
    const ctxY = ruleY + 70;
    const ctxLines = wrapText(slide.number_context || "", rtl ? 34 : 42).slice(0, 3);
    const srcY = ctxY + ctxLines.length * 44 + 30;
    return (
      <g>
        <text
          x={leftX} y={numY} textAnchor={anchorStart}
          fontFamily={SERIF} fontWeight={300} fontSize={336}
          fill={INK} style={{ letterSpacing: "-0.03em" }}
        >
          {numMain}
          {suffix ? (
            <tspan fontSize={128} fill={SPOT} dy={-100} dx={8}>{suffix}</tspan>
          ) : null}
        </text>
        <line x1={edgePad} x2={w - edgePad} y1={ruleY} y2={ruleY} stroke={INK} strokeWidth={2} />
        {ctxLines.map((ln, i) => (
          <text key={i}
            x={leftX} y={ctxY + i * 44}
            textAnchor={anchorStart}
            fontFamily={rtl ? ARABIC : SERIF} fontSize={40} fill={INK}
          >
            {ln}
          </text>
        ))}
        {slide.number_source ? (
          <g>
            <line
              x1={rtl ? w - edgePad : edgePad}
              x2={rtl ? w - edgePad - 44 : edgePad + 44}
              y1={srcY - 6} y2={srcY - 6}
              stroke={SPOT} strokeWidth={2}
            />
            <text
              x={rtl ? w - edgePad - 56 : edgePad + 56} y={srcY}
              textAnchor={anchorStart}
              fontFamily={MONO} fontSize={20} letterSpacing={2}
              fill={INK2} style={{ textTransform: "uppercase" }}
            >
              {slide.number_source.toUpperCase()}
            </text>
          </g>
        ) : null}
      </g>
    );
  }

  if (slide.slide_type === "QUESTION") {
    const glyph = rtl ? "؟" : "?";
    const glyphX = rtl ? edgePad + 100 : w - edgePad - 100;
    const glyphY = h - 220;
    const q = slide.question_text || slide.headline || "";
    const qLines = wrapText(q, rtl ? 22 : 24);
    const qFontSize = rtl ? 60 : 72;
    const qLineHeight = qFontSize * (rtl ? 1.5 : 1.15);
    const qStartY = contentY + 120;
    const barX = rtl ? w - edgePad + 12 : edgePad - 12;
    const barHeight = qLines.length * qLineHeight + 20;
    const noteY = qStartY + qLines.length * qLineHeight + 60;
    return (
      <g>
        <text
          x={glyphX} y={glyphY}
          textAnchor="middle"
          fontFamily={SERIF} fontStyle="italic" fontWeight={300}
          fontSize={600} fill={SPOT} fillOpacity={0.07}
        >
          {glyph}
        </text>
        <rect x={barX - 3} y={qStartY - qFontSize} width={6} height={barHeight} fill={SPOT} />
        {qLines.map((ln, i) => (
          <text key={i}
            x={leftX} y={qStartY + i * qLineHeight}
            textAnchor={anchorStart}
            fontFamily={rtl ? ARABIC : SERIF}
            fontStyle={rtl ? "normal" : "italic"}
            fontWeight={rtl ? 800 : 400}
            fontSize={qFontSize} fill={INK}
          >
            {ln}
          </text>
        ))}
        <text
          x={leftX} y={noteY} textAnchor={anchorStart}
          fontFamily={MONO} fontSize={20} letterSpacing={2}
          fill={INK2} style={{ textTransform: "uppercase" }}
        >
          {displayLabel}
        </text>
      </g>
    );
  }

  if (slide.slide_type === "CTA") {
    // Framed card
    const cardX = edgePad;
    const cardY = contentY + 40;
    const cardW = textW;
    const cardH = 520;
    const headlineLines = wrapText(slide.headline || "", rtl ? 20 : 26).slice(0, 2);
    const ctaMain = slide.cta_main || "";
    const actionRowY = cardY + cardH - 130;
    const cellW = cardW / 4;
    const glyphs = ["♡", "✎", "↗", "❒"];
    const labelsEn = ["Endorse", "Annotate", "Circulate", "Archive"];
    const labelsAr = ["أعجبني", "تعليق", "مشاركة", "حفظ"];
    const labels = rtl ? labelsAr : labelsEn;

    // Follow pill
    const fromBtn = (slide.cta_button || "").match(/@[A-Za-z0-9_]+/)?.[0] || "";
    const raw = (carousel.author_handle || fromBtn || "").trim();
    const hasHandle = raw.length > 1 && raw !== "@" &&
      raw.toLowerCase() !== "@handle" && raw.toLowerCase() !== "@your-handle";
    const handle = hasHandle ? (raw.startsWith("@") ? raw : `@${raw}`) : "";
    const pillLabel = rtl
      ? (hasHandle ? `تابع ${handle} ←` : "تابع للمزيد ←")
      : (hasHandle ? `FOLLOW ${handle} →` : "FOLLOW FOR MORE →");
    const pillY = cardY + cardH + 32;
    const pillH = 56;
    const pillW = Math.min(cardW * 0.55, 18 + pillLabel.length * 14);
    const pillX = rtl ? w - edgePad - pillW : edgePad;

    return (
      <g>
        <rect x={cardX} y={cardY} width={cardW} height={cardH} fill="none" stroke={INK} strokeWidth={3} />
        <rect x={cardX + 10} y={cardY + 10} width={cardW - 20} height={cardH - 20} fill="none" stroke={RULE_SOFT} strokeWidth={1} />
        {headlineLines.map((ln, i) => (
          <text key={i}
            x={leftX} y={cardY + 90 + i * 72}
            textAnchor={anchorStart}
            fontFamily={rtl ? ARABIC : SERIF}
            fontWeight={rtl ? 800 : 500}
            fontSize={62} fill={INK}
          >
            {renderHeadlineWithAccent(ln, slide.headline_accent, INK, SPOT, true)}
          </text>
        ))}
        {ctaMain ? (
          <text
            x={leftX} y={cardY + 90 + headlineLines.length * 72 + 40}
            textAnchor={anchorStart}
            fontFamily={rtl ? ARABIC : SERIF}
            fontSize={31} fill={INK2}
          >
            {ctaMain.length > 90 ? ctaMain.slice(0, 87) + "…" : ctaMain}
          </text>
        ) : null}
        {/* action row */}
        {glyphs.map((g, i) => {
          const visualIdx = rtl ? 3 - i : i;
          const cx = cardX + cellW * visualIdx + cellW / 2;
          return (
            <g key={i}>
              {i > 0 ? (
                <line
                  x1={cardX + cellW * visualIdx}
                  x2={cardX + cellW * visualIdx}
                  y1={actionRowY} y2={actionRowY + 110}
                  stroke={RULE_SOFT} strokeWidth={1}
                />
              ) : null}
              <text x={cx} y={actionRowY + 44} textAnchor="middle"
                    fontFamily={SERIF} fontSize={38} fill={SPOT}>
                {g}
              </text>
              <text x={cx} y={actionRowY + 84} textAnchor="middle"
                    fontFamily={rtl ? ARABIC : MONO}
                    fontSize={18} letterSpacing={rtl ? undefined : 2.5}
                    fill={INK}
                    style={rtl ? undefined : { textTransform: "uppercase" }}>
                {rtl ? labels[i] : labels[i].toUpperCase()}
              </text>
            </g>
          );
        })}
        {/* Follow pill */}
        <rect x={pillX} y={pillY} width={pillW} height={pillH} fill={INK} />
        <text x={pillX + pillW / 2} y={pillY + pillH / 2 + 8}
              textAnchor="middle"
              fontFamily={rtl ? ARABIC : MONO}
              fontSize={22} letterSpacing={rtl ? undefined : 2}
              fill={PAPER}>
          {pillLabel}
        </text>
        {slide.cta_sub ? (
          <text
            x={rtl ? pillX - 20 : pillX + pillW + 20}
            y={pillY + pillH / 2 + 6}
            textAnchor={rtl ? "end" : "start"}
            fontFamily={MONO} fontSize={18} fill={INK2}
          >
            {slide.cta_sub}
          </text>
        ) : null}
      </g>
    );
  }

  if (slide.slide_type === "REFRAME") {
    const stripMythPrefix = (s: string) =>
      s.replace(/^\s*(يعتقد الأغلبية|MOST PEOPLE THINK|Most people think|كان السائد يقول|THE RECORD PREVIOUSLY READ)[:\s\-—]*/i, "").trim();
    const cleanedMyth = stripMythPrefix(slide.headline || "");
    const mythLines = wrapText(cleanedMyth, rtl ? 26 : 32);
    const truthHeadRaw = slide.headline_accent || slide.body || "";
    const truthBodyRaw = slide.headline_accent ? (slide.body || "") : "";
    const truthHeadLines = wrapText(truthHeadRaw, rtl ? 20 : 24);
    const truthBodyLines = truthBodyRaw ? wrapText(truthBodyRaw, rtl ? 34 : 46).slice(0, 5) : [];
    const tagY = contentY + 40;
    const mythLineH = 68;
    const mythStart = tagY + 50;
    const dividerY = mythStart + mythLines.length * mythLineH + 40;
    const truthTagY = dividerY + 44;
    const truthHeadStart = truthTagY + 60;
    const truthHeadLineH = 82;
    const truthBodyStart = truthHeadStart + truthHeadLines.length * truthHeadLineH + 28;
    return (
      <g>
        <text x={leftX} y={tagY} textAnchor={anchorStart}
              fontFamily={LABEL_FONT} fontSize={18}
              letterSpacing={rtl ? undefined : 3}
              fontWeight={LABEL_WEIGHT}
              fill={INK2}
              style={rtl ? undefined : { textTransform: "uppercase" }}>
          {L.myth_tag}
        </text>
        {mythLines.map((ln, i) => {
          const y = mythStart + i * mythLineH;
          const strikeY = y - 58 * 0.42;
          const approxW = Math.min(textW, ln.length * 30);
          const x1 = rtl ? leftX - approxW : leftX;
          const x2 = rtl ? leftX : leftX + approxW;
          return (
            <g key={i}>
              <text x={leftX} y={y} textAnchor={anchorStart}
                    fontFamily={HEAD_FONT}
                    fontStyle={rtl ? "normal" : "italic"}
                    fontWeight={rtl ? 600 : 400}
                    fontSize={58} fill={INK2}>
                {ln}
              </text>
              <line x1={x1} x2={x2} y1={strikeY} y2={strikeY}
                    stroke={SPOT} strokeWidth={4} />
            </g>
          );
        })}
        <line x1={edgePad} x2={edgePad + textW * 0.28} y1={dividerY} y2={dividerY} stroke={INK} strokeWidth={1} />
        <text x={w / 2} y={dividerY + 6} textAnchor="middle"
              fontFamily={LABEL_FONT} fontSize={18}
              letterSpacing={rtl ? undefined : 3}
              fontWeight={LABEL_WEIGHT}
              fill={SPOT}
              style={rtl ? undefined : { textTransform: "uppercase" }}>
          {L.corrected}
        </text>
        <line x1={w - edgePad - textW * 0.28} x2={w - edgePad} y1={dividerY} y2={dividerY} stroke={INK} strokeWidth={1} />
        {truthHeadLines.map((ln, i) => (
          <text key={`th${i}`} x={leftX} y={truthHeadStart + i * truthHeadLineH}
                textAnchor={anchorStart}
                fontFamily={HEAD_FONT}
                fontWeight={rtl ? 800 : 600}
                fontSize={74} fill={INK}
                style={rtl ? undefined : { letterSpacing: "-0.01em" }}>
            {renderHeadlineWithAccent(ln, undefined, INK, SPOT, false)}
          </text>
        ))}
        {truthBodyLines.map((ln, i) => (
          <text key={`tb${i}`} x={leftX} y={truthBodyStart + i * 46}
                textAnchor={anchorStart}
                fontFamily={BODY_FONT}
                fontWeight={BODY_WEIGHT}
                fontSize={33} fill={INK2}>
            {ln}
          </text>
        ))}
      </g>
    );
  }

  if (slide.slide_type === "GRID") {
    const cleanItem = (s: string) =>
      s.replace(/^\s*\d+[\.\)]\s*/, "").replace(/^\s*[◆◇►▸●○•\-–—]\s*/, "").trim();
    const items = (slide.grid_items || []).map(cleanItem).slice(0, 6);
    const hasHeadline = !!slide.headline;
    const hlLines = hasHeadline ? wrapText(slide.headline!, rtl ? 24 : 30).slice(0, 2) : [];
    const hlStart = contentY + 30;
    const gridTop = hlStart + hlLines.length * 66 + (hasHeadline ? 40 : 0);
    const cols = 2;
    const gap = 32;
    const cellW = (textW - gap) / cols;
    const rows = Math.ceil(items.length / cols);
    const cellH = Math.min(300, (h - gridTop - 160) / Math.max(1, rows));
    const figW = 130, figH = 68;
    const labels = "ABCDEF";
    return (
      <g>
        {hlLines.map((ln, i) => (
          <text key={`h${i}`} x={leftX} y={hlStart + i * 66}
                textAnchor={anchorStart}
                fontFamily={HEAD_FONT} fontWeight={HEAD_WEIGHT}
                fontSize={58} fill={INK}>
            {renderHeadlineWithAccent(ln, slide.headline_accent, INK, SPOT, true)}
          </text>
        ))}
        {items.map((it, i) => {
          const r = Math.floor(i / cols);
          const c = i % cols;
          const cVisual = rtl ? cols - 1 - c : c;
          const x = edgePad + cVisual * (cellW + gap);
          const y = gridTop + r * cellH;
          const wrapped = wrapText(it, rtl ? 18 : 22).slice(0, 2);
          const labelX = rtl ? x + cellW : x;
          const labelAnchor: "start" | "end" = rtl ? "end" : "start";
          const figX = rtl ? x + cellW - figW : x;
          return (
            <g key={i}>
              <line x1={x} x2={x + cellW} y1={y} y2={y} stroke={RULE} strokeWidth={1} />
              {c === 1 ? (
                <line
                  x1={rtl ? x + cellW : x}
                  x2={rtl ? x + cellW : x}
                  y1={y + 20} y2={y + cellH - 20}
                  stroke={RULE_SOFT} strokeWidth={1}
                />
              ) : null}
              <text x={labelX} y={y + 34} textAnchor={labelAnchor}
                    fontFamily={MONO} fontSize={18} letterSpacing={3}
                    fill={SPOT} direction="ltr" style={{ textTransform: "uppercase" }}>
                {`FIG. ${String(slide.slide_number).padStart(2, "0")}·${labels[i] || "?"}`}
              </text>
              <FigPlate x={figX} y={y + 46} w={figW} h={figH} kind={pickFigKind(sectorFocus || "", i)} rtl={rtl} />
              {wrapped.map((ln, li) => (
                <text key={li} x={labelX} y={y + 46 + figH + 40 + li * 40}
                      textAnchor={labelAnchor}
                      fontFamily={HEAD_FONT}
                      fontWeight={rtl ? 700 : 500}
                      fontSize={31} fill={INK}>
                  {ln}
                </text>
              ))}
            </g>
          );
        })}
      </g>
    );
  }

  if (slide.slide_type === "COMPARE") {
    const wrongTitle = slide.compare_left_title || (rtl ? "قبل" : "BEFORE");
    const wrongItems = (slide.compare_left_items || []).slice(0, 4);
    const correctTitle = slide.compare_right_title || (rtl ? "بعد" : "AFTER");
    const correctItems = (slide.compare_right_items || []).slice(0, 4);
    // RTL: WRONG on visual right (read first), CORRECT on visual left
    const visLeftTitle = rtl ? correctTitle : wrongTitle;
    const visLeftItems = rtl ? correctItems : wrongItems;
    const visLeftIsCorrect = rtl;
    const visRightTitle = rtl ? wrongTitle : correctTitle;
    const visRightItems = rtl ? wrongItems : correctItems;
    const colGap = 40;
    const colW = (textW - colGap) / 2;
    const leftColX = edgePad;
    const rightColX = edgePad + colW + colGap;
    const dividerX = edgePad + colW + colGap / 2;
    const headerY = contentY + 40;
    const itemsY = headerY + 60;
    const itemLineH = 40;
    const itemGap = 22;
    const wrapCol = rtl ? 16 : 20;
    const renderCol = (title: string, items: string[], colX: number, isCorrect: boolean) => {
      const titleAnchor = "start" as const;
      let yCursor = itemsY;
      const wrappedList = items.map((it) => wrapText(it, wrapCol));
      return (
        <g>
          <text x={colX} y={headerY} textAnchor={titleAnchor}
                fontFamily={LABEL_FONT} fontSize={20}
                letterSpacing={rtl ? undefined : 3}
                fontWeight={isCorrect ? 700 : LABEL_WEIGHT}
                fill={isCorrect ? SPOT : INK2}
                fillOpacity={isCorrect ? 1 : 0.5}
                style={rtl ? undefined : { textTransform: "uppercase" }}>
            {rtl ? title : title.toUpperCase()}
          </text>
          {wrappedList.map((wrapped, i) => {
            const blockH = wrapped.length * itemLineH;
            const blockTop = yCursor;
            const rendered = (
              <g key={i}>
                {isCorrect ? (
                  <rect
                    x={rtl ? colX + colW - 3 : colX - 12}
                    y={blockTop - 30}
                    width={3} height={blockH}
                    fill={SPOT}
                  />
                ) : null}
                {wrapped.map((ln, li) => {
                  const y = blockTop + li * itemLineH;
                  return (
                    <g key={li}>
                      <text x={colX} y={y} textAnchor={titleAnchor}
                            fontFamily={isCorrect ? HEAD_FONT : BODY_FONT}
                            fontWeight={isCorrect ? (rtl ? 800 : 600) : BODY_WEIGHT}
                            fontSize={31} fill={isCorrect ? INK : INK2}>
                        {ln}
                      </text>
                      {!isCorrect ? (
                        <line
                          x1={colX} x2={colX + Math.min(colW - 8, ln.length * 15)}
                          y1={y - 9} y2={y - 9}
                          stroke={INK} strokeOpacity={0.55} strokeWidth={2}
                        />
                      ) : null}
                    </g>
                  );
                })}
              </g>
            );
            yCursor += blockH + itemGap;
            return rendered;
          })}
        </g>
      );
    };
    return (
      <g>
        {renderCol(visLeftTitle, visLeftItems, leftColX, visLeftIsCorrect)}
        {renderCol(visRightTitle, visRightItems, rightColX, !visLeftIsCorrect)}
        <line x1={dividerX} x2={dividerX} y1={headerY - 20} y2={h - 160}
              stroke={RULE} strokeWidth={1} />
      </g>
    );
  }

  if (slide.slide_type === "LIST") {
    const items = slide.list_items || [];
    const rowY0 = contentY + 30;
    const rowH = 96;
    return (
      <g>
        {items.map((it, i) => {
          const y = rowY0 + i * rowH;
          const kill = it.label === "KILL" || it.label === "DONT" || it.label === "STOP";
          const labelColor = kill ? SPOT : INK;
          const labelText = L[it.label] || it.label;
          const labelX = rtl ? w - edgePad : edgePad;
          const textX = rtl ? w - edgePad - 180 : edgePad + 180;
          const anchor: "start" | "end" = rtl ? "end" : "start";
          return (
            <g key={i}>
              <line x1={edgePad} x2={w - edgePad} y1={y - 34} y2={y - 34} stroke={RULE} strokeWidth={1} />
              <text x={labelX} y={y + 12} textAnchor={anchor}
                    fontFamily={LABEL_FONT} fontSize={20}
                    letterSpacing={rtl ? undefined : 3}
                    fontWeight={rtl ? 700 : 600}
                    fill={labelColor}
                    style={rtl ? undefined : { textTransform: "uppercase" }}>
                {rtl ? labelText : labelText.toUpperCase()}
              </text>
              <text x={textX} y={y + 12} textAnchor={anchor}
                    fontFamily={HEAD_FONT}
                    fontWeight={kill ? BODY_WEIGHT : (rtl ? 700 : 500)}
                    fontSize={36}
                    fill={kill ? INK2 : INK}
                    textDecoration={kill ? "line-through" : "none"}>
                {it.text}
              </text>
            </g>
          );
        })}
        {items.length > 0 ? (
          <line x1={edgePad} x2={w - edgePad} y1={rowY0 + items.length * rowH - 34} y2={rowY0 + items.length * rowH - 34} stroke={RULE} strokeWidth={1} />
        ) : null}
      </g>
    );
  }

  if (slide.slide_type === "INSIGHT") {
    const hLines = wrapText(slide.headline || "", rtl ? 20 : 26);
    const bodyLines = wrapText(slide.body || "", rtl ? 34 : 44).slice(0, 6);
    const startY = contentY + 60;
    const headLineH = 78;
    const dashY = startY + hLines.length * headLineH + 12;
    const bodyStart = dashY + 40;
    return (
      <g>
        {hLines.map((ln, i) => (
          <text key={i} x={leftX} y={startY + i * headLineH}
                textAnchor={anchorStart}
                fontFamily={HEAD_FONT}
                fontStyle={rtl ? "normal" : "italic"}
                fontWeight={rtl ? 800 : 600}
                fontSize={68} fill={INK}>
            {renderHeadlineWithAccent(ln, slide.headline_accent, INK, SPOT, true)}
          </text>
        ))}
        <line
          x1={rtl ? leftX - 60 : leftX}
          x2={rtl ? leftX : leftX + 60}
          y1={dashY} y2={dashY}
          stroke={SPOT} strokeWidth={2}
        />
        {bodyLines.map((ln, i) => (
          <text key={`b${i}`} x={leftX} y={bodyStart + i * 56}
                textAnchor={anchorStart}
                fontFamily={BODY_FONT} fontWeight={BODY_WEIGHT}
                fontSize={36} fill={INK2}>
            {ln}
          </text>
        ))}
      </g>
    );
  }

  if (slide.slide_type === "TERMINAL") {
    const boxX = edgePad;
    const boxY = contentY + 30;
    const boxW = textW;
    const boxH = h - boxY - 160;
    const lines = slide.terminal_lines || [];
    const keywords = (slide.terminal_keywords || []).filter(Boolean);
    const innerPad = 36;
    const lineX = rtl ? boxX + boxW - innerPad : boxX + innerPad;
    const lineAnchor: "start" | "end" = rtl ? "end" : "start";
    const lineGap = 40;
    const startLinesY = boxY + 64;
    const highlightSegs = (raw: string) => {
      let displayLine = raw;
      if (rtl) {
        const stripped = raw.replace(/^[→\->]+\s*/, "").replace(/\s*[←]+$/, "");
        displayLine = `\u200F${stripped} \u200F←`;
      }
      let segs: { text: string; hl: boolean }[] = [{ text: displayLine, hl: false }];
      for (const kw of keywords) {
        if (!kw) continue;
        const next: { text: string; hl: boolean }[] = [];
        for (const seg of segs) {
          if (seg.hl) { next.push(seg); continue; }
          const lower = seg.text.toLowerCase();
          const ki = lower.indexOf(kw.toLowerCase());
          if (ki === -1) { next.push(seg); continue; }
          const before = seg.text.slice(0, ki);
          const mid = seg.text.slice(ki, ki + kw.length);
          const after = seg.text.slice(ki + kw.length);
          if (before) next.push({ text: before, hl: false });
          next.push({ text: mid, hl: true });
          if (after) next.push({ text: after, hl: false });
        }
        segs = next;
      }
      return segs;
    };
    const punchY = startLinesY + lines.length * lineGap + 36;
    return (
      <g>
        <rect x={boxX} y={boxY} width={boxW} height={boxH} fill="none" stroke={INK} strokeWidth={1.5} />
        {slide.terminal_file ? (
          <text x={boxX + boxW - innerPad} y={boxY + 34} textAnchor="end"
                fontFamily={MONO} fontSize={18} fill={SPOT}
                direction="ltr" style={{ unicodeBidi: "isolate" as any }}>
            {slide.terminal_file}
          </text>
        ) : null}
        {lines.map((raw, i) => {
          const segs = highlightSegs(raw);
          return (
            <text key={i} x={lineX} y={startLinesY + i * lineGap}
                  textAnchor={lineAnchor}
                  xmlSpace="preserve"
                  fontFamily={rtl ? ARABIC : MONO} fontSize={26} fill={INK}>
              {segs.map((s, si) => (
                <tspan key={si} fill={s.hl ? SPOT : INK} fontWeight={s.hl ? 600 : 400}>
                  {s.text}
                </tspan>
              ))}
            </text>
          );
        })}
        {slide.terminal_punchline ? (
          <text x={lineX} y={punchY} textAnchor={lineAnchor}
                fontFamily={rtl ? ARABIC : SERIF}
                fontStyle={rtl ? "normal" : "italic"}
                fontWeight={rtl ? 800 : 400}
                fontSize={34} fill={SPOT}>
            {rtl
              ? slide.terminal_punchline.replace(/^\/\/\s*/, "").replace(/^[→\->]+\s*/, "")
              : slide.terminal_punchline}
          </text>
        ) : null}
      </g>
    );
  }

  if (slide.slide_type === "BOLD_CLAIM") {
    const lines = wrapText(slide.headline || "", rtl ? 14 : 16);
    const barY = contentY + 60;
    const blockStart = barY + 40;
    const lineH = rtl ? 88 : 110;
    const barX1 = rtl ? w - edgePad - 120 : edgePad;
    const barX2 = rtl ? w - edgePad : edgePad + 120;
    return (
      <g>
        <line x1={barX1} x2={barX2} y1={barY} y2={barY} stroke={SPOT} strokeWidth={4} />
        {lines.map((ln, i) => (
          <text key={i} x={leftX} y={blockStart + i * lineH}
                textAnchor={anchorStart}
                fontFamily={HEAD_FONT}
                fontWeight={rtl ? 800 : 500}
                fontSize={rtl ? 72 : 96} fill={INK}
                style={rtl ? undefined : { letterSpacing: "-0.02em" }}>
            {renderHeadlineWithAccent(ln, slide.headline_accent, INK, SPOT, true)}
          </text>
        ))}
      </g>
    );
  }

  // Fallback for other slide types: headline + body, plain paper.
  const headline = slide.headline || "";
  const hLines = wrapText(headline, rtl ? 22 : 28);
  const bodyLines = wrapText(slide.body || "", rtl ? 38 : 52).slice(0, 6);
  const bodyStart = contentY + hLines.length * 62 + 60;
  return (
    <g>
      {hLines.map((ln, i) => (
        <text key={i}
          x={leftX} y={contentY + 60 + i * 62}
          textAnchor={anchorStart}
          fontFamily={rtl ? ARABIC : SERIF}
          fontWeight={rtl ? 800 : 500}
          fontSize={54} fill={INK}
        >
          {renderHeadlineWithAccent(ln, slide.headline_accent, INK, SPOT, true)}
        </text>
      ))}
      {bodyLines.map((ln, i) => (
        <text key={`b${i}`}
          x={leftX} y={bodyStart + i * 44}
          textAnchor={anchorStart}
          fontFamily={rtl ? ARABIC : SERIF}
          fontSize={30} fill={INK2}
        >
          {ln}
        </text>
      ))}
    </g>
  );
}