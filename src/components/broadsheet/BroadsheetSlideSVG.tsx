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