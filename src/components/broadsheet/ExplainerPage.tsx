import React from "react";
import Masthead from "./Masthead";
import PressFooter from "./PressFooter";
import { FigPlate } from "./figs";
import { PAPER, INK, INK2, SPOT, RULE, RULE_SOFT, SERIF, MONO, ARABIC } from "./pressTokens";
import type { ExplainerDoc } from "./onepagerTypes";

export interface ExplainerPageProps {
  doc: ExplainerDoc;
  authorName?: string;
  authorTitle?: string;
  w?: number;
  h?: number;
  renderHeadlineWithAccent: (
    headline: string,
    accent: string | undefined,
    fg: string,
    accentColor: string,
    italic?: boolean,
  ) => React.ReactNode;
  wrapText: (text: string, maxCharsPerLine: number) => string[];
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

// Four simple line glyphs for the NEXT-IN-SERIES row.
function NextGlyph({ kind, cx, cy }: { kind: number; cx: number; cy: number }) {
  const s = 60; // 60px SPOT-stroked
  const half = s / 2;
  const x = cx - half, y = cy - half;
  const stroke = SPOT;
  const sw = 2;
  switch (kind % 4) {
    case 0: // chart-frame
      return (
        <g>
          <rect x={x + 8} y={y + 8} width={s - 16} height={s - 16} fill="none" stroke={stroke} strokeWidth={sw} />
          <polyline points={`${x + 14},${y + s - 16} ${x + 24},${y + s - 26} ${x + 34},${y + s - 20} ${x + s - 14},${y + 14}`}
                    fill="none" stroke={stroke} strokeWidth={sw} />
        </g>
      );
    case 1: // doc-lines
      return (
        <g>
          <rect x={x + 12} y={y + 6} width={s - 24} height={s - 12} fill="none" stroke={stroke} strokeWidth={sw} />
          <line x1={x + 18} x2={x + s - 18} y1={y + 20} y2={y + 20} stroke={stroke} strokeWidth={sw} />
          <line x1={x + 18} x2={x + s - 18} y1={y + 30} y2={y + 30} stroke={stroke} strokeWidth={sw} />
          <line x1={x + 18} x2={x + s - 22} y1={y + 40} y2={y + 40} stroke={stroke} strokeWidth={sw} />
        </g>
      );
    case 2: // clock
      return (
        <g>
          <circle cx={cx} cy={cy} r={s / 2 - 8} fill="none" stroke={stroke} strokeWidth={sw} />
          <line x1={cx} y1={cy} x2={cx} y2={cy - (s / 2 - 16)} stroke={stroke} strokeWidth={sw} />
          <line x1={cx} y1={cy} x2={cx + (s / 2 - 18)} y2={cy} stroke={stroke} strokeWidth={sw} />
        </g>
      );
    case 3: // building
    default:
      return (
        <g>
          <rect x={x + 12} y={y + 12} width={s - 24} height={s - 20} fill="none" stroke={stroke} strokeWidth={sw} />
          {[0, 1, 2].map((r) =>
            [0, 1, 2].map((c) => (
              <rect key={`${r}-${c}`} x={x + 18 + c * 8} y={y + 18 + r * 8} width={4} height={4}
                    fill="none" stroke={stroke} strokeWidth={1} />
            ))
          )}
        </g>
      );
  }
}

export default function ExplainerPage({
  doc, authorName = "Your Name", authorTitle = "", w = 1080, h = 1350,
  renderHeadlineWithAccent, wrapText,
}: ExplainerPageProps) {
  const rtl = doc.lang === "ar";
  const edgePad = rtl ? 96 : 68;
  const textW = w - edgePad * 2;
  const leftX = rtl ? w - edgePad : edgePad;
  const anchor: "start" | "end" = rtl ? "end" : "start";
  const HEAD = rtl ? ARABIC : SERIF;
  const nameplate: { name: string; style: "classic" | "arabic" } = rtl
    ? { name: "الموجز", style: "arabic" }
    : { name: `The ${(authorName || "").split(/\s+/)[0] || "Brief"} Brief`, style: "classic" };
  const topLeft = rtl ? "شرحٌ من صفحة واحدة" : "A ONE-PAGE EXPLAINER";
  const topRight = rtl ? `العدد ${doc.series_no} من السلسلة` : `Nº ${doc.series_no} IN THE SERIES`;
  const editionLabel = rtl ? "شرح" : "EXPLAINER";
  const kicker = doc.kicker;
  const grainId = "explainer-grain";

  const contentY = 220;
  // Term headline
  const termLines = wrapText(doc.term_headline, rtl ? 18 : 22);
  const termLineH = 78;
  const termStartY = contentY;
  const termEndY = termStartY + (termLines.length - 1) * termLineH;

  // Sections stack
  const sectionTop = termEndY + 70;
  const sectionH = 220;
  const figW = 184, figH = 108;

  // NEXT row
  const nextTop = sectionTop + sectionH * 2 + 60;
  const cellW = textW / 4;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} xmlns="http://www.w3.org/2000/svg"
         style={{ width: "100%", height: "100%", display: "block", unicodeBidi: "plaintext" as any }}>
      <defs>{rtl && <style>{`text, tspan { unicode-bidi: plaintext; }`}</style>}</defs>
      <rect width={w} height={h} fill={PAPER} />
      <PaperGrain w={w} h={h} id={grainId} />
      <Masthead
        w={w}
        variant="full"
        nameplate={nameplate}
        topLeft={topLeft}
        topRight={topRight}
        editionLabel={editionLabel}
        kicker={kicker}
        rtl={rtl}
      />

      {termLines.map((ln, i) => (
        <text key={i} x={leftX} y={termStartY + i * termLineH} textAnchor={anchor}
              fontFamily={HEAD} fontWeight={rtl ? 800 : 500} fontSize={68} fill={INK}
              style={rtl ? undefined : { letterSpacing: "-0.01em" }}>
          {renderHeadlineWithAccent(ln, doc.headline_accent, INK, SPOT, true)}
        </text>
      ))}

      {doc.sections.slice(0, 2).map((sec, si) => {
        const y = sectionTop + si * sectionH;
        const figX = rtl ? w - edgePad - figW : edgePad;
        const rightColX = rtl ? edgePad : edgePad + figW + 30;
        const rightColW = textW - figW - 30;
        const rightAnchor: "start" | "end" = rtl ? "end" : "start";
        const rightAnchorX = rtl ? w - edgePad : rightColX;
        const bodyLines = wrapText(sec.body, rtl ? 32 : 42).slice(0, 5);
        return (
          <g key={si}>
            <line x1={edgePad} x2={w - edgePad} y1={y - 22} y2={y - 22} stroke={RULE} strokeWidth={1} />
            <FigPlate x={figX} y={y} w={figW} h={figH} kind={sec.fig_kind} rtl={rtl} />
            <text x={figX + figW / 2} y={y + figH + 22} textAnchor="middle"
                  fontFamily={MONO} fontSize={16} fill={INK2} letterSpacing={2}
                  direction="ltr" style={{ unicodeBidi: "isolate" as any, textTransform: "uppercase" }}>
              {sec.fig_label.toUpperCase()}
            </text>
            <text x={rightAnchorX} y={y + 26} textAnchor={rightAnchor}
                  fontFamily={rtl ? ARABIC : MONO} fontSize={19}
                  letterSpacing={rtl ? undefined : 3}
                  fontWeight={rtl ? 700 : 600} fill={SPOT}
                  style={rtl ? undefined : { textTransform: "uppercase" }}>
              {rtl ? sec.label : sec.label.toUpperCase()}
            </text>
            {bodyLines.map((ln, li) => (
              <text key={li} x={rightAnchorX} y={y + 60 + li * 36} textAnchor={rightAnchor}
                    fontFamily={rtl ? ARABIC : SERIF}
                    fontWeight={rtl ? 600 : 400}
                    fontSize={27} fill={INK2}>
                {ln}
              </text>
            ))}
            {/* enforce right-column width via invisible sizing marker */}
            <rect x={rightColX} y={y} width={rightColW} height={1} fill="none" />
          </g>
        );
      })}

      {/* NEXT title with trailing hairline */}
      <text x={leftX} y={nextTop} textAnchor={anchor}
            fontFamily={rtl ? ARABIC : MONO} fontSize={19}
            letterSpacing={rtl ? undefined : 3}
            fontWeight={rtl ? 700 : 600} fill={SPOT}
            style={rtl ? undefined : { textTransform: "uppercase" }}>
        {rtl ? doc.next_title : doc.next_title.toUpperCase()}
      </text>
      <line
        x1={rtl ? edgePad : edgePad + Math.min(doc.next_title.length * 12 + 30, textW - 40)}
        x2={rtl ? w - edgePad - Math.min(doc.next_title.length * 14 + 30, textW - 40) : w - edgePad}
        y1={nextTop - 6} y2={nextTop - 6}
        stroke={RULE_SOFT} strokeWidth={1}
      />

      {/* 4-cell row */}
      {doc.next_items.slice(0, 4).map((it, i) => {
        const visualIdx = rtl ? 3 - i : i;
        const x0 = edgePad + visualIdx * cellW;
        const cx = x0 + cellW / 2;
        const glyphY = nextTop + 74;
        const textY = glyphY + 60;
        const underlineY = textY + 14;
        return (
          <g key={i}>
            {i > 0 ? (
              <line x1={x0} x2={x0} y1={nextTop + 30} y2={nextTop + 210}
                    stroke={RULE_SOFT} strokeWidth={1} />
            ) : null}
            <NextGlyph kind={i} cx={cx} cy={glyphY} />
            <text x={cx} y={textY} textAnchor="middle"
                  fontFamily={rtl ? ARABIC : SERIF}
                  fontWeight={rtl ? 700 : 500}
                  fontSize={22} fill={INK}>
              {it}
            </text>
            <line x1={cx - 22} x2={cx + 22} y1={underlineY} y2={underlineY}
                  stroke={SPOT} strokeWidth={3} />
          </g>
        );
      })}

      <PressFooter
        w={w} h={h}
        authorName={authorName || (rtl ? "اسمك" : "Your Name")}
        authorTitle={authorTitle || ""}
        rtl={rtl}
        mode="rule"
      />
    </svg>
  );
}