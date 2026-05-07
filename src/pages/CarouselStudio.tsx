import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, Plus, Trash2, ArrowUp, ArrowDown, Loader2, Download, FileImage, FileArchive, FileText, Sparkles, ChevronDown, ChevronUp, BarChart3, Copy, RefreshCw, BookmarkPlus, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import StartFromPanel from "@/components/StartFromPanel";

/* ============================ STYLES ============================ */

type StyleKey = "clean_paper" | "bold_statement" | "executive_briefing" | "terminal" | "high_contrast";

interface StylePalette {
  key: StyleKey;
  name: string;
  bg: string;
  bgGradient?: string;
  fg: string;
  accent: string;
  emphasis: string;
  muted: string;
  border: string;
  codeBg: string;
  bodyFont: string;
  headingFont: string;
  monoFont: string;
}

const STYLES: Record<StyleKey, StylePalette> = {
  clean_paper: {
    key: "clean_paper", name: "Clean Paper",
    bg: "#F7F3E8", fg: "#2A2419", accent: "#B08D3A", emphasis: "#B08D3A", muted: "#888888", border: "#D3D1C7", codeBg: "#EFEAD9",
    bodyFont: "'DM Sans', system-ui, sans-serif",
    headingFont: "'Cormorant Garamond', Georgia, serif",
    monoFont: "'JetBrains Mono', ui-monospace, monospace",
  },
  bold_statement: {
    key: "bold_statement", name: "Bold Statement",
    bg: "#1C1812", bgGradient: "linear-gradient(135deg,#1C1812 0%,#2A1F14 100%)",
    fg: "#F5F0E6", accent: "#D4B056", emphasis: "#F97316", muted: "#888888", border: "#3A3128", codeBg: "#0D0B08",
    bodyFont: "'DM Sans', system-ui, sans-serif",
    headingFont: "'Cormorant Garamond', Georgia, serif",
    monoFont: "'JetBrains Mono', ui-monospace, monospace",
  },
  executive_briefing: {
    key: "executive_briefing", name: "Executive Briefing",
    bg: "#F7F3E8", fg: "#2A2419", accent: "#B08D3A", emphasis: "#B08D3A", muted: "#5F5E5A", border: "#D3D1C7", codeBg: "#EFEAD9",
    bodyFont: "'DM Sans', system-ui, sans-serif",
    headingFont: "'Cormorant Garamond', Georgia, serif",
    monoFont: "'JetBrains Mono', ui-monospace, monospace",
  },
  terminal: {
    key: "terminal", name: "Terminal",
    bg: "#0D0B08", fg: "#E8E3D8", accent: "#D4B056", emphasis: "#F97316", muted: "#666666", border: "#1F1B14", codeBg: "#0A0908",
    bodyFont: "'JetBrains Mono', ui-monospace, monospace",
    headingFont: "'JetBrains Mono', ui-monospace, monospace",
    monoFont: "'JetBrains Mono', ui-monospace, monospace",
  },
  high_contrast: {
    key: "high_contrast", name: "High Contrast",
    bg: "#0A0908", fg: "#FFFFFF", accent: "#D4B056", emphasis: "#D4B056", muted: "#777777", border: "#1F1B14", codeBg: "#000000",
    bodyFont: "'DM Sans', system-ui, sans-serif",
    headingFont: "'Cormorant Garamond', Georgia, serif",
    monoFont: "'JetBrains Mono', ui-monospace, monospace",
  },
};

/* ============================ TYPES ============================ */

type SlideType = "COVER"|"BOLD_CLAIM"|"REFRAME"|"BIG_NUMBER"|"TERMINAL"|"GRID"|"COMPARE"|"QUESTION"|"LIST"|"INSIGHT"|"CTA";

interface Slide {
  slide_number: number;
  slide_type: SlideType;
  section_label?: string;
  headline?: string;
  headline_accent?: string;
  body?: string;
  density?: "light"|"medium"|"dense";
  number?: string;
  number_context?: string;
  number_source?: string;
  terminal_file?: string;
  terminal_lines?: string[];
  terminal_punchline?: string;
  terminal_keywords?: string[];
  grid_items?: string[];
  compare_left_title?: string;
  compare_left_items?: string[];
  compare_right_title?: string;
  compare_right_items?: string[];
  list_items?: { label: "KILL"|"KEEP"|"DO"|"DONT"; text: string }[];
  question_text?: string;
  cta_main?: string;
  cta_sub?: string;
  cta_button?: string;
}

interface Carousel {
  slides: Slide[];
  carousel_title?: string;
  linkedin_caption?: string;
  hashtags?: string[];
  total_slides?: number;
  author_name?: string;
  author_title?: string;
  author_handle?: string;
  signal_attribution?: string | null;
}

type Dimension = "1080x1080" | "1080x1350" | "1200x628";
const DIM: Record<Dimension, { w: number; h: number; label: string }> = {
  "1080x1080": { w: 1080, h: 1080, label: "1:1 Square" },
  "1080x1350": { w: 1080, h: 1350, label: "4:5 Portrait" },
  "1200x628":  { w: 1200, h: 628,  label: "OG / Landscape" },
};

/* ============================ SAMPLE FALLBACK ============================ */

const sampleCarousel = (topic: string): Carousel => ({
  carousel_title: topic || "Sample carousel",
  total_slides: 3,
  author_name: "M. Mahafzah", author_title: "Director", author_handle: "@mmahafzah",
  signal_attribution: null,
  hashtags: ["#strategy", "#leadership"],
  linkedin_caption: "Sample caption — generate to populate.",
  slides: [
    { slide_number: 1, slide_type: "COVER", section_label: "PREVIEW", headline: topic || "Edit this cover", headline_accent: "this", body: "A subtitle line", density: "light" },
    { slide_number: 2, slide_type: "BIG_NUMBER", section_label: "THE NUMBER", number: "78%", number_context: "of transformations stall in year two", number_source: "McKinsey, 2024", density: "light" },
    { slide_number: 3, slide_type: "CTA", section_label: "YOUR TURN.", headline: "What is your next move?", cta_main: "Save this.", cta_sub: "Share it with your CTO.", cta_button: "Follow @mmahafzah →", density: "light" },
  ],
});

/* ============================ SVG HELPERS ============================ */

function wrapText(text: string, maxCharsPerLine: number): string[] {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    if ((current + " " + w).trim().length > maxCharsPerLine) {
      if (current) lines.push(current);
      current = w;
    } else {
      current = (current ? current + " " : "") + w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function HorizonEye({ x, y, size = 20, color }: { x: number; y: number; size?: number; color: string }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <ellipse cx={size/2} cy={size/2} rx={size/2} ry={size/3.2} fill="none" stroke={color} strokeWidth={1.4} />
      <circle cx={size/2} cy={size/2} r={size/5.5} fill={color} />
    </g>
  );
}

/* Render headline with accent word highlighted */
function renderHeadlineWithAccent(headline: string, accent: string | undefined, fg: string, accentColor: string, italic = false) {
  if (!accent || !headline.toLowerCase().includes(accent.toLowerCase())) {
    return <tspan fill={fg} fontStyle={italic ? "italic" : "normal"}>{headline}</tspan>;
  }
  const idx = headline.toLowerCase().indexOf(accent.toLowerCase());
  const before = headline.slice(0, idx);
  const middle = headline.slice(idx, idx + accent.length);
  const after = headline.slice(idx + accent.length);
  return (
    <>
      {before && <tspan fill={fg}>{before}</tspan>}
      <tspan fill={accentColor} fontStyle="italic">{middle}</tspan>
      {after && <tspan fill={fg}>{after}</tspan>}
    </>
  );
}

/* ============================ SLIDE RENDERER ============================ */

interface RenderProps {
  slide: Slide;
  total: number;
  style: StylePalette;
  dim: Dimension;
  carousel: Carousel;
  lang?: "en" | "ar";
}

/* Per-type accent strip color (left edge) */
const STRIP_COLORS: Record<SlideType, string> = {
  COVER: "#D4B056",
  BOLD_CLAIM: "#D4B056",
  REFRAME: "#EF9F27",
  BIG_NUMBER: "#EF9F27",
  TERMINAL: "#5DCAA5",
  GRID: "#5DCAA5",
  COMPARE: "#5DCAA5",
  QUESTION: "#85B7EB",
  INSIGHT: "#85B7EB",
  LIST: "#EF9F27",
  CTA: "#D4B056",
};

const RAW_TYPE_NAMES = new Set([
  "COVER","BOLD_CLAIM","REFRAME","BIG_NUMBER","TERMINAL",
  "GRID","COMPARE","QUESTION","LIST","INSIGHT","CTA",
]);

const TYPE_FALLBACK_LABEL: Record<SlideType, string> = {
  COVER: "OVERVIEW",
  BOLD_CLAIM: "THE CLAIM",
  REFRAME: "RETHINK",
  BIG_NUMBER: "THE DATA",
  TERMINAL: "THE PLAYBOOK",
  GRID: "THE PILLARS",
  COMPARE: "OLD VS NEW",
  QUESTION: "REFLECT",
  LIST: "DO / DONT",
  INSIGHT: "KEY INSIGHT",
  CTA: "ACTION",
};

function getDisplayLabel(slide: Slide): string {
  const raw = (slide.section_label || "").trim();
  const norm = raw.toUpperCase().replace(/\s+/g, "_");
  if (!raw || RAW_TYPE_NAMES.has(norm)) return TYPE_FALLBACK_LABEL[slide.slide_type] || raw || "";
  return raw.toUpperCase();
}

/* Tiny inline SVG icon paths per slide type (24x24 viewBox), single-stroke */
const ICON_PATHS: Record<SlideType, string> = {
  COVER:      "M13 2 L3 14 H12 L11 22 L21 10 H12 Z",                                   // zap
  BOLD_CLAIM: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",          // message
  REFRAME:    "M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0 0 20.49 15", // refresh
  BIG_NUMBER: "M3 3v18h18 M7 14l4-4 4 4 5-5",                                            // chart
  TERMINAL:   "M4 17l6-6-6-6 M12 19h8",                                                  // terminal
  GRID:       "M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z",                  // grid
  COMPARE:    "M8 3 4 7l4 4 M4 7h16 M16 21l4-4-4-4 M20 17H4",                            // arrows lr
  QUESTION:   "M9 9a3 3 0 1 1 6 0c0 2-3 3-3 3 M12 17h.01",                              // help
  LIST:       "M9 11l3 3 8-8 M3 12a9 9 0 1 0 9-9",                                       // check
  INSIGHT:    "M9 18h6 M10 22h4 M12 2a7 7 0 0 1 4 12.7c-.6.5-1 1.2-1 2V17H9v-.3c0-.8-.4-1.5-1-2A7 7 0 0 1 12 2z", // bulb
  CTA:        "M22 2 11 13 M22 2l-7 20-4-9-9-4z",                                        // send
};

function TypeIcon({ type, x, y, color, size = 18 }: { type: SlideType; x: number; y: number; color: string; size?: number }) {
  const d = ICON_PATHS[type];
  if (!d) return null;
  return (
    <g transform={`translate(${x},${y}) scale(${size / 24})`} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </g>
  );
}

function ProgressDots({ current, total, cx, y, accent, dotOutline }: { current: number; total: number; cx: number; y: number; accent: string; dotOutline: string }) {
  const r = 3;
  const gap = 11; // center-to-center
  const startX = cx - ((total - 1) * gap) / 2;
  return (
    <g>
      {Array.from({ length: total }, (_, i) => (
        <circle
          key={i}
          cx={startX + i * gap}
          cy={y}
          r={r}
          fill={i === current ? accent : "transparent"}
          stroke={i === current ? accent : dotOutline}
          strokeWidth={1}
        />
      ))}
    </g>
  );
}

/* Subtle SVG noise texture filter — embedded once per slide */
function NoiseTexture({ id, opacity, w, h }: { id: string; opacity: number; w: number; h: number }) {
  return (
    <g pointerEvents="none">
      <defs>
        <filter id={id} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.6 0" />
        </filter>
      </defs>
      <rect width={w} height={h} filter={`url(#${id})`} opacity={opacity} />
    </g>
  );
}

function SlideSVG({ slide, total, style, dim, carousel, lang = "en" }: RenderProps) {
  const { w, h } = DIM[dim];
  const isRTL = lang === "ar";
  const arFont = "'Cairo', 'DM Sans', sans-serif";
  const bodyFont = isRTL ? arFont : style.bodyFont;
  const monoFont = isRTL ? arFont : style.monoFont;
  const bgIsGradient = !!style.bgGradient && style.key === "bold_statement";
  const stripColor = STRIP_COLORS[slide.slide_type] || style.accent;
  const displayLabel = getDisplayLabel(slide);
  const isDarkStyle = style.key === "bold_statement" || style.key === "terminal" || style.key === "high_contrast";
  const dotOutline = isDarkStyle ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.18)";
  const textureOpacity = style.key === "bold_statement" || style.key === "terminal"
    ? 0.025
    : style.key === "executive_briefing"
    ? 0.015
    : 0;
  const noiseId = `noise-${slide.slide_number}-${style.key}`;
  // Generous edge padding for RTL — Arabic glyphs are wider and need breathing room
  const edgePad = isRTL ? 96 : 60;
  // Header positions — mirror in RTL
  const labelIconX = isRTL ? w - edgePad - 16 : edgePad;
  const labelTextX = isRTL ? w - edgePad - 16 - 8 : edgePad + 22;
  const labelAnchor: "start" | "end" = isRTL ? "end" : "start";
  const numberX = isRTL ? edgePad : w - edgePad;
  const numberAnchor: "start" | "end" = isRTL ? "start" : "end";
  // Footer
  const authorEyeX = isRTL ? w - edgePad - 20 : edgePad;
  const authorTextX = isRTL ? w - edgePad - 30 : edgePad + 30;
  const authorAnchor: "start" | "end" = isRTL ? "end" : "start";
  const urlX = isRTL ? edgePad : w - edgePad;
  const urlAnchor: "start" | "end" = isRTL ? "start" : "end";
  const swipeX = isRTL ? edgePad : w - edgePad;
  const swipeAnchor: "start" | "end" = isRTL ? "start" : "end";
  const swipeText = isRTL ? "← اسحب" : "SWIPE →";
  const stripX = isRTL ? w - 4 : 0;
  // Author name fallback for Arabic
  const rawAuthor = carousel.author_name || "M. Mahafzah";
  const displayAuthor = isRTL && /^mohammad$/i.test(rawAuthor.trim()) ? "محمد" : rawAuthor;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} xmlns="http://www.w3.org/2000/svg"
         style={{ width: "100%", height: "100%", display: "block", unicodeBidi: "plaintext" as any }}>
      <defs>
        {isRTL && (
          <style>{`text, tspan { unicode-bidi: plaintext; }`}</style>
        )}
        {bgIsGradient && (
          <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1C1812" />
            <stop offset="100%" stopColor="#2A1F14" />
          </linearGradient>
        )}
      </defs>
      <rect width={w} height={h} fill={bgIsGradient ? "url(#bgGrad)" : style.bg} />

      {/* Subtle texture overlay */}
      {textureOpacity > 0 && <NoiseTexture id={noiseId} opacity={textureOpacity} w={w} h={h} />}

      {/* Accent strip — left in LTR, right in RTL */}
      <rect x={stripX} y={0} width={4} height={h} fill={stripColor} rx={0} />

      {/* Section label + icon */}
      <TypeIcon type={slide.slide_type} x={labelIconX} y={56} color={style.accent} size={16} />
      <text x={labelTextX} y={70} textAnchor={labelAnchor}
            fontFamily={bodyFont} fontSize={isRTL ? 20 : 18} letterSpacing={isRTL ? 0 : 3}
            fill={style.accent} fontWeight={isRTL ? 700 : 600}>
        {displayLabel}
      </text>

      {/* Page number */}
      <text x={numberX} y={70} textAnchor={numberAnchor}
            fontFamily={monoFont} fontSize={24} fill={style.muted}>
        {slide.slide_number}/{total}
      </text>

      {/* Header → content divider */}
      <line x1={60} y1={92} x2={w - 60} y2={92} stroke={style.accent} strokeOpacity={0.13} strokeWidth={1} />

      {/* Slide-type body */}
      <SlideBody slide={slide} style={style} w={w} h={h} lang={lang} />

      {/* Progress dots — above footer */}
      <ProgressDots current={slide.slide_number - 1} total={total} cx={w / 2} y={h - 100} accent={style.accent} dotOutline={dotOutline} />

      {/* Signal attribution badge — COVER only */}
      {slide.slide_type === "COVER" && carousel.signal_attribution && (
        (() => {
          // For Arabic, prefer a localized short badge using extracted % when possible
          const raw = carousel.signal_attribution!;
          const pct = raw.match(/(\d{1,3})\s*%/);
          const badgeText = isRTL
            ? (pct ? `إشارة بثقة ${pct[1]}%` : "مبني على إشارة")
            : raw;
          const maxW = Math.floor(w * 0.6);
          const charW = isRTL ? 9 : 7;
          const estW = Math.min(maxW, 18 + badgeText.length * charW + 16);
          const padEdge = 56;
          const rectX = isRTL ? w - padEdge - estW : padEdge;
          const iconX = isRTL ? w - padEdge - 14 : padEdge + 8;
          const textX = isRTL ? w - padEdge - 28 : padEdge + 28;
          return (
            <g>
              <rect x={rectX} y={h - 148} rx={4} ry={4}
                    width={estW} height={22}
                    fill={style.accent} fillOpacity={0.1}
                    stroke={style.accent} strokeOpacity={0.25} strokeWidth={1} />
              <g transform={`translate(${iconX}, ${h - 142})`}>
                <path d="M3 3v10h10" fill="none" stroke={style.accent} strokeWidth={1.4}
                      strokeLinecap="round" strokeLinejoin="round" transform="scale(0.7)" />
                <path d="M5 9l2-2 2 2 3-3" fill="none" stroke={style.accent} strokeWidth={1.4}
                      strokeLinecap="round" strokeLinejoin="round" transform="scale(0.7)" />
              </g>
              <text x={textX} y={h - 132}
                    textAnchor={isRTL ? "end" : "start"}
                    fontFamily={monoFont} fontSize={11}
                    letterSpacing={isRTL ? 0 : 0.5} fill={style.accent}>
                {badgeText}
              </text>
            </g>
          );
        })()
      )}

      {/* Footer */}
      <g>
        <HorizonEye x={authorEyeX} y={h - 60} size={20} color={style.accent} />
        <text x={authorTextX} y={h - 45} textAnchor={authorAnchor}
              fontFamily={bodyFont} fontSize={16} fill={style.fg}>
          {displayAuthor}
        </text>
        <text x={urlX} y={h - 45} textAnchor={urlAnchor}
              fontFamily={bodyFont} fontSize={14} fill={style.muted}>
          aura-intel.org
        </text>
        {slide.slide_type === "COVER" && (
          <text x={swipeX} y={h - 95} textAnchor={swipeAnchor}
                fontFamily={bodyFont} fontSize={18} fill={style.accent} fontWeight={600}>
            {swipeText}
          </text>
        )}
      </g>

      {/* Progress bar */}
      <g>
        <rect x={0} y={h - 3} width={w} height={3} fill={style.border} />
        <rect x={isRTL ? w - (slide.slide_number / total) * w : 0}
              y={h - 3} width={(slide.slide_number / total) * w} height={3} fill={style.accent} />
      </g>
    </svg>
  );
}

function SlideBody({ slide, style, w, h, lang = "en" }: { slide: Slide; style: StylePalette; w: number; h: number; lang?: "en" | "ar" }) {
  const cx = w / 2;
  const isRTL = lang === "ar";
  const arFont = "'Cairo', 'DM Sans', sans-serif";
  const headingFont = isRTL ? arFont : style.headingFont;
  const bodyFont = isRTL ? arFont : style.bodyFont;
  const monoFont = isRTL ? arFont : style.monoFont;
  const edgePad = isRTL ? 96 : 60;
  const startX = isRTL ? w - edgePad : edgePad;
  const sideAnchor: "start" | "end" = isRTL ? "end" : "start";
  const L = {
    myth: isRTL ? "يعتقد الأغلبية" : "MOST PEOPLE THINK",
    truth: isRTL ? "الحقيقة" : "THE TRUTH",
    KILL: isRTL ? "حذف" : "KILL",
    KEEP: isRTL ? "إبقاء" : "KEEP",
    STOP: isRTL ? "توقف" : "STOP",
    START: isRTL ? "ابدأ" : "START",
    DO: isRTL ? "افعل" : "DO",
    DONT: isRTL ? "لا تفعل" : "DONT",
  } as Record<string, string>;
  // Vertical center of the *content zone* (between header ~100 and footer ~120)
  const contentTop = 100;
  const contentBottom = h - 120;
  const cy = (contentTop + contentBottom) / 2;
  switch (slide.slide_type) {
    case "COVER": {
      const lines = wrapText(slide.headline || "", 20);
      const lh = isRTL ? 96 : 84;
      const startY = cy - (lines.length * lh) / 2 + 30;
      const bodyLines = wrapText(slide.body || "", 40);
      return (
        <g>
          {lines.map((ln, i) => (
            <text key={i} x={cx} y={startY + i * lh} textAnchor="middle"
                  fontFamily={headingFont} fontSize={isRTL ? 56 : 72} fontWeight={isRTL ? 800 : 500}>
              {renderHeadlineWithAccent(ln, slide.headline_accent, style.fg, style.accent)}
            </text>
          ))}
          {bodyLines.map((ln, i) => (
            <text key={`b${i}`} x={cx} y={startY + lines.length * lh + 40 + i * 32} textAnchor="middle"
                  fontFamily={bodyFont} fontSize={24} fill={style.muted} fontWeight={isRTL ? 600 : 400}>
              {ln}
            </text>
          ))}
        </g>
      );
    }
    case "BOLD_CLAIM": {
      const lines = wrapText(slide.headline || "", 22);
      const lh = isRTL ? 84 : 72;
      const startY = cy - (lines.length * lh) / 2 + 24;
      return (
        <g>
          {lines.map((ln, i) => (
            <text key={i} x={cx} y={startY + i * lh} textAnchor="middle"
                  fontFamily={headingFont} fontSize={isRTL ? 52 : 60} fontWeight={isRTL ? 800 : 500}>
              {renderHeadlineWithAccent(ln, slide.headline_accent, style.fg, style.emphasis)}
            </text>
          ))}
        </g>
      );
    }
    case "REFRAME": {
      const beliefLines = wrapText(slide.headline || "", isRTL ? 22 : 28);
      const truthRaw = slide.body || slide.headline_accent || "";
      const truthLines = wrapText(truthRaw, isRTL ? 20 : 24);
      const beliefStartY = cy - 160;
      return (
        <g>
          <text x={startX} y={beliefStartY - 30} textAnchor={sideAnchor}
                fontFamily={bodyFont} fontSize={isRTL ? 16 : 14} letterSpacing={isRTL ? 0 : 2} fill={style.muted}
                fontWeight={isRTL ? 700 : 400}>
            {L.myth}
          </text>
          {beliefLines.map((ln, i) => (
            <text key={i} x={startX} y={beliefStartY + i * 36} textAnchor={sideAnchor}
                  fontFamily={bodyFont} fontSize={28} fill={style.muted} opacity={0.6}
                  fontWeight={isRTL ? 600 : 400}
                  textDecoration="line-through" style={{ textDecorationColor: `${style.muted}` }}>
              {ln}
            </text>
          ))}
          <line x1={edgePad} y1={cy} x2={w - edgePad} y2={cy} stroke={style.accent} strokeWidth={1.5} opacity={0.4} />
          <text x={startX} y={cy + 60} textAnchor={sideAnchor}
                fontFamily={bodyFont} fontSize={isRTL ? 16 : 14} letterSpacing={isRTL ? 0 : 2} fill={style.accent}
                fontWeight={isRTL ? 800 : 400}>
            {L.truth}
          </text>
          {truthLines.length > 0 ? truthLines.map((ln, i) => (
            <text key={i} x={startX} y={cy + 120 + i * 64} textAnchor={sideAnchor}
                  fontFamily={headingFont} fontSize={isRTL ? 40 : 56} fontWeight={isRTL ? 800 : 700} fill={style.fg}>
              {ln}
            </text>
          )) : (
            <text x={startX} y={cy + 110} textAnchor={sideAnchor}
                  fontFamily={bodyFont} fontSize={20} fill={style.muted}
                  fontStyle={isRTL ? "normal" : "italic"}>
              (Add the truth in the Body field)
            </text>
          )}
        </g>
      );
    }
    case "BIG_NUMBER": {
      return (
        <g>
          <text x={cx} y={cy + 30} textAnchor="middle" fontFamily={style.monoFont} fontSize={200} fontWeight={700} fill={style.accent} direction="ltr">
            {slide.number || "—"}
          </text>
          {slide.number_context && (
            <text x={cx} y={cy + 100} textAnchor="middle" fontFamily={bodyFont} fontSize={isRTL ? 24 : 28} fill={style.muted} fontWeight={isRTL ? 600 : 400}>
              {slide.number_context}
            </text>
          )}
          {slide.number_source && (
            <text x={cx} y={cy + 160} textAnchor="middle" fontFamily={bodyFont} fontSize={18} fill={style.muted}
                  fontStyle={isRTL ? "normal" : "italic"} fontWeight={isRTL ? 600 : 400}>
              {slide.number_source}
            </text>
          )}
        </g>
      );
    }
    case "TERMINAL": {
      const blockX = edgePad, blockY = 180, blockW = w - edgePad * 2, blockH = h - 360;
      const lines = slide.terminal_lines || [];
      const keywords = (slide.terminal_keywords || []).filter(Boolean);
      const lineX = isRTL ? blockX + blockW - 40 : blockX + 40;
      const lineAnchor: "start" | "end" = isRTL ? "end" : "start";
      // Vertically distribute the lines block + punchline within the terminal box
      const lineGap = 36;
      const linesBlockH = lines.length * lineGap;
      const punchH = slide.terminal_punchline ? 40 : 0;
      const innerTop = blockY + 70; // below the dot bar
      const innerBottom = blockY + blockH - 30;
      const innerH = innerBottom - innerTop;
      const totalContent = linesBlockH + (punchH ? punchH + 24 : 0);
      const startLinesY = innerTop + Math.max(0, (innerH - totalContent) / 2) + 24;
      const punchY = startLinesY + linesBlockH + 32;
      const renderLine = (line: string, idx: number) => {
        // Arabic RTL: strip leading "→"/"->" prefix; append "←" so arrow sits on the right edge
        let displayLine = line;
        let isStep: boolean;
        if (isRTL) {
          const stripped = line.replace(/^[→\->]+\s*/, "").replace(/\s*[←]+$/, "");
          isStep = stripped !== line || /^[→\->]/.test(line);
          displayLine = `${stripped} ←`;
        } else {
          isStep = line.startsWith("→");
          displayLine = line;
        }
        // Highlight [bracketed] text in accent color
        const parts: { text: string; color: string }[] = [];
        const re = /(\[[^\]]+\])/g;
        let lastIdx = 0;
        const matches = Array.from(displayLine.matchAll(re));
        const baseColor = isStep ? style.muted : style.fg;
        if (matches.length === 0) {
          parts.push({ text: displayLine, color: baseColor });
        } else {
          for (const m of matches) {
            const i = m.index!;
            if (i > lastIdx) parts.push({ text: displayLine.slice(lastIdx, i), color: baseColor });
            parts.push({ text: m[0].slice(1, -1), color: style.accent });
            lastIdx = i + m[0].length;
          }
          if (lastIdx < displayLine.length) parts.push({ text: displayLine.slice(lastIdx), color: baseColor });
        }
        // Apply terminal_keywords highlighting on top of any base segments
        let withKw = parts;
        if (keywords.length) {
          for (const kw of keywords) {
            if (!kw) continue;
            const next: { text: string; color: string }[] = [];
            for (const seg of withKw) {
              if (seg.color === style.accent) { next.push(seg); continue; }
              const lower = seg.text.toLowerCase();
              const ki = lower.indexOf(kw.toLowerCase());
              if (ki === -1) { next.push(seg); continue; }
              const before = seg.text.slice(0, ki);
              const mid = seg.text.slice(ki, ki + kw.length);
              const after = seg.text.slice(ki + kw.length);
              if (before) next.push({ text: before, color: seg.color });
              next.push({ text: mid, color: style.accent });
              if (after) next.push({ text: after, color: seg.color });
            }
            withKw = next;
          }
        }
        return (
          <text key={idx} x={lineX} y={startLinesY + idx * lineGap} textAnchor={lineAnchor}
                fontFamily={isRTL ? arFont : style.monoFont} fontSize={isRTL ? 18 : 22}>
            {withKw.map((p, i) => (
              <tspan key={i} fill={p.color} fontWeight={p.color === style.accent ? 600 : 400}>{p.text}</tspan>
            ))}
          </text>
        );
      };
      return (
        <g>
          <rect x={blockX} y={blockY} width={blockW} height={blockH} rx={16} fill={style.codeBg} stroke={style.accent} strokeOpacity={0.2} />
          <circle cx={blockX + 28} cy={blockY + 32} r={8} fill="#ef4444" />
          <circle cx={blockX + 56} cy={blockY + 32} r={8} fill="#eab308" />
          <circle cx={blockX + 84} cy={blockY + 32} r={8} fill="#22c55e" />
          {slide.terminal_file && (
            <text x={blockX + blockW - 24} y={blockY + 38} textAnchor="end" fontFamily={style.monoFont} fontSize={18} fill={style.muted} direction="ltr">
              {slide.terminal_file}
            </text>
          )}
          {lines.map(renderLine)}
          {slide.terminal_punchline && (
            <text x={lineX} y={punchY} textAnchor={lineAnchor}
                  fontFamily={isRTL ? arFont : style.monoFont} fontSize={isRTL ? 18 : 22} fontWeight={isRTL ? 800 : 700} fill={style.accent}>
              {isRTL ? slide.terminal_punchline.replace(/^\/\/\s*/, "").replace(/^[→\->]+\s*/, "") : slide.terminal_punchline}
            </text>
          )}
        </g>
      );
    }
    case "GRID": {
      const items = slide.grid_items || [];
      const cols = items.length > 4 ? 2 : 2;
      const rows = Math.ceil(items.length / cols);
      const gap = 20;
      const gridX = edgePad, gridW = w - edgePad * 2;
      const cellW = (gridW - gap * (cols - 1)) / cols;
      const cellH = isRTL ? 130 : 120;
      const gridTotalH = rows * cellH + (rows - 1) * gap;
      const headlineSpace = slide.headline ? 80 : 0;
      const gridY = Math.max(180, cy - gridTotalH / 2 + headlineSpace / 2);
      return (
        <g>
          {slide.headline && (
            <text x={startX} y={gridY - 40} textAnchor={sideAnchor}
                  fontFamily={headingFont} fontSize={36} fontWeight={isRTL ? 800 : 500} fill={style.fg}>
              {slide.headline}
            </text>
          )}
          {items.map((it, i) => {
            const r = Math.floor(i / cols);
            const c = i % cols;
            const cVisual = isRTL ? (cols - 1 - c) : c;
            const x = gridX + cVisual * (cellW + gap);
            const y = gridY + r * (cellH + gap);
            const wrapped = wrapText(it, isRTL ? 22 : 28);
            const lineH = isRTL ? 28 : 26;
            const textBlockH = wrapped.length * lineH;
            const textStartY = y + cellH / 2 - textBlockH / 2 + 18;
            const numCx = isRTL ? x + cellW - 36 : x + 36;
            const textXi = isRTL ? x + cellW - 72 : x + 72;
            const cellTextAnchor: "start" | "end" = isRTL ? "end" : "start";
            return (
              <g key={i}>
                <rect x={x} y={y} width={cellW} height={cellH} rx={12} fill="none" stroke={style.border} strokeWidth={1} />
                <circle cx={numCx} cy={y + cellH / 2} r={20} fill={style.emphasis} fillOpacity={0.15} />
                <text x={numCx} y={y + cellH / 2 + 7} textAnchor="middle" fontFamily={monoFont} fontSize={18} fontWeight={700} fill={style.emphasis}>
                  {i + 1}
                </text>
                {wrapped.map((ln, li) => (
                  <text key={li} x={textXi} y={textStartY + li * lineH} textAnchor={cellTextAnchor}
                        fontFamily={bodyFont} fontSize={isRTL ? 17 : 19} fill={style.fg} fontWeight={isRTL ? 600 : 400}>
                    {ln}
                  </text>
                ))}
              </g>
            );
          })}
        </g>
      );
    }
    case "COMPARE": {
      // Convention: compare_left_* = WRONG (mistake, muted+strike), compare_right_* = CORRECT (gold, bold).
      // RTL swap: in Arabic the WRONG renders on visual RIGHT (read first), CORRECT on visual LEFT (read second, payoff).
      const wrongTitle = slide.compare_left_title || "BEFORE";
      const wrongItems = slide.compare_left_items || [];
      const correctTitle = slide.compare_right_title || "AFTER";
      const correctItems = slide.compare_right_items || [];
      const visLeftTitle = isRTL ? correctTitle : wrongTitle;
      const visLeftItems = isRTL ? correctItems : wrongItems;
      const visRightTitle = isRTL ? wrongTitle : correctTitle;
      const visRightItems = isRTL ? wrongItems : correctItems;
      const correctOnLeft = isRTL;
      const itemH = 60;
      const rowsCount = Math.max(visLeftItems.length, visRightItems.length, 1);
      const blockH = 80 + rowsCount * itemH;
      const headlineSpace = slide.headline ? 70 : 0;
      const blockTop = Math.max(140, cy - blockH / 2 - headlineSpace / 2);
      const headerY = blockTop + 30;
      const rowsStartY = blockTop + 80;
      const rightColX = cx + 30;
      const rightColW = w - edgePad - rightColX;
      const leftColX = edgePad + 20;
      const leftColW = cx - leftColX - 10;
      // Headline centered above
      const headlineLines = slide.headline ? wrapText(slide.headline, isRTL ? 22 : 28) : [];
      const headLineH = 44;
      return (
        <g>
          {headlineLines.map((ln, i) => (
            <text key={`hl${i}`} x={cx}
                  y={blockTop - 24 - (headlineLines.length - 1 - i) * headLineH}
                  textAnchor="middle"
                  fontFamily={headingFont} fontSize={isRTL ? 34 : 38}
                  fontWeight={isRTL ? 800 : 600} fill={style.fg}>
              {ln}
            </text>
          ))}
          <line x1={cx} y1={blockTop} x2={cx} y2={blockTop + blockH} stroke={style.border} strokeWidth={1} />
          {/* Gold tinted background lives on whichever side holds the CORRECT column */}
          {correctOnLeft ? (
            <rect x={leftColX - 16} y={blockTop} width={leftColW + 16} height={blockH} fill={style.accent} fillOpacity={0.05} rx={6} />
          ) : (
            <rect x={rightColX - 16} y={blockTop} width={rightColW + 16} height={blockH} fill={style.accent} fillOpacity={0.05} rx={6} />
          )}
          <text x={leftColX} y={headerY} fontFamily={bodyFont} fontSize={correctOnLeft ? 20 : 18}
                letterSpacing={isRTL ? 0 : 2}
                fill={correctOnLeft ? style.accent : style.muted}
                opacity={correctOnLeft ? 1 : 0.4}
                fontWeight={correctOnLeft ? (isRTL ? 800 : 700) : (isRTL ? 600 : 400)}
                textAnchor={isRTL ? "end" : "start"}
                {...(isRTL ? { x: leftColX + leftColW } : {})}>
            {visLeftTitle.toUpperCase()}
          </text>
          <text x={isRTL ? rightColX + rightColW : rightColX} y={headerY} fontFamily={bodyFont} fontSize={correctOnLeft ? 18 : 20}
                letterSpacing={isRTL ? 0 : 2}
                fill={correctOnLeft ? style.muted : style.accent}
                opacity={correctOnLeft ? 0.4 : 1}
                fontWeight={correctOnLeft ? (isRTL ? 600 : 400) : (isRTL ? 800 : 700)}
                textAnchor={isRTL ? "end" : "start"}>
            {visRightTitle.toUpperCase()}
          </text>
          {/* Visual LEFT column items */}
          {visLeftItems.map((it, i) => {
            const lns = wrapText(it, isRTL ? 18 : 24);
            const rowY = rowsStartY + i * itemH;
            const textXi = isRTL ? leftColX + leftColW : leftColX;
            const anchor: "start" | "end" = isRTL ? "end" : "start";
            if (correctOnLeft) {
              return (
                <g key={`l${i}`}>
                  {/* Gold accent on the inner edge (right side in RTL since text reads RTL) */}
                  <line
                    x1={isRTL ? leftColX + leftColW + 8 : leftColX - 8}
                    y1={rowY - 24}
                    x2={isRTL ? leftColX + leftColW + 8 : leftColX - 8}
                    y2={rowY - 24 + Math.max(28, lns.length * 28)}
                    stroke={style.accent} strokeWidth={2} />
                  {lns.map((ln, li) => (
                    <text key={li} x={textXi} y={rowY + li * 28} textAnchor={anchor}
                          fontFamily={bodyFont} fontSize={isRTL ? 20 : 24} fill={style.fg} fontWeight={isRTL ? 800 : 600}>
                      {ln}
                    </text>
                  ))}
                </g>
              );
            }
            return lns.map((ln, li) => (
              <text key={`l${i}-${li}`} x={textXi} y={rowY + li * 28} textAnchor={anchor}
                    fontFamily={bodyFont} fontSize={isRTL ? 19 : 22} fill={style.muted} opacity={0.4}
                    fontWeight={isRTL ? 600 : 400}
                    textDecoration="line-through" style={{ textDecorationColor: `${style.muted}` }}>
                {ln}
              </text>
            ));
          })}
          {/* Visual RIGHT column items */}
          {visRightItems.map((it, i) => {
            const lns = wrapText(it, isRTL ? 18 : 24);
            const rowY = rowsStartY + i * itemH;
            const textXi = isRTL ? rightColX + rightColW : rightColX;
            const anchor: "start" | "end" = isRTL ? "end" : "start";
            if (!correctOnLeft) {
              return (
                <g key={`rg${i}`}>
                  <line x1={rightColX - 8} y1={rowY - 24} x2={rightColX - 8} y2={rowY - 24 + Math.max(28, lns.length * 28)}
                        stroke={style.accent} strokeWidth={2} />
                  {lns.map((ln, li) => (
                    <text key={li} x={textXi} y={rowY + li * 28} textAnchor={anchor}
                          fontFamily={bodyFont} fontSize={isRTL ? 20 : 24} fill={style.fg} fontWeight={isRTL ? 800 : 600}>
                      {ln}
                    </text>
                  ))}
                </g>
              );
            }
            return lns.map((ln, li) => (
              <text key={`r${i}-${li}`} x={textXi} y={rowY + li * 28} textAnchor={anchor}
                    fontFamily={bodyFont} fontSize={isRTL ? 19 : 22} fill={style.muted} opacity={0.4}
                    fontWeight={isRTL ? 600 : 400}
                    textDecoration="line-through" style={{ textDecorationColor: `${style.muted}` }}>
                {ln}
              </text>
            ));
          })}
        </g>
      );
    }
    case "LIST": {
      const items = slide.list_items || [];
      const itemSpacing = isRTL ? 80 : 90;
      const totalListH = items.length * itemSpacing;
      const listStartY = (slide.headline ? 230 : Math.max(180, cy - totalListH / 2));
      return (
        <g>
          {slide.headline && (
            <text x={startX} y={150} textAnchor={sideAnchor}
                  fontFamily={headingFont} fontSize={42} fontWeight={isRTL ? 800 : 500} fill={style.fg}>
              {slide.headline}
            </text>
          )}
          {items.map((it, i) => {
            const y = listStartY + i * itemSpacing;
            const isKill = it.label === "KILL" || it.label === "DONT";
            const labelColor = isKill ? "#ef4444" : style.accent;
            const textColor = isKill ? style.muted : style.fg;
            const labelX = isRTL ? w - edgePad : edgePad;
            const itemTextX = isRTL ? w - edgePad - 140 : edgePad + 140;
            const listAnchor: "start" | "end" = isRTL ? "end" : "start";
            const labelText = L[it.label] || it.label;
            return (
              <g key={i}>
                <line x1={edgePad} y1={y - 30} x2={w - edgePad} y2={y - 30} stroke={style.border} />
                <text x={labelX} y={y + 18} textAnchor={listAnchor}
                      fontFamily={monoFont} fontSize={18} fontWeight={700} fill={labelColor}>
                  {labelText}
                </text>
                <text x={itemTextX} y={y + 18} textAnchor={listAnchor}
                      fontFamily={bodyFont} fontSize={isRTL ? 22 : 26} fill={textColor} fontWeight={isRTL ? 600 : 400}
                      textDecoration={isKill ? "line-through" : "none"}>
                  {it.text}
                </text>
              </g>
            );
          })}
        </g>
      );
    }
    case "QUESTION": {
      const q = slide.question_text || slide.headline || "?";
      const lines = wrapText(q, isRTL ? 22 : 26);
      const lh = isRTL ? 76 : 64;
      const startY = cy - (lines.length * lh) / 2 + 20;
      const watermark = isRTL ? "؟" : "?";
      return (
        <g>
          <text x={cx} y={cy + 80} textAnchor="middle" fontFamily={headingFont} fontSize={300} fill={style.accent} opacity={0.06}>
            {watermark}
          </text>
          {lines.map((ln, i) => (
            <text key={i} x={cx} y={startY + i * lh} textAnchor="middle"
                  fontFamily={headingFont} fontSize={isRTL ? 42 : 48}
                  fontStyle={isRTL ? "normal" : "italic"} fontWeight={isRTL ? 800 : 400}
                  fill={style.fg}>
              {ln}
            </text>
          ))}
        </g>
      );
    }
    case "INSIGHT": {
      const headlineLines = wrapText(slide.headline || "", 26);
      const bodyLines = wrapText(slide.body || "", 38);
      const headLineH = 58;
      const bodyLineH = 36;
      const blockH = headlineLines.length * headLineH + 40 + bodyLines.length * bodyLineH;
      const startY = cy - blockH / 2 + 40;
      // Arabic: center horizontally (matches COVER/QUESTION feel)
      const insightX = isRTL ? cx : startX;
      const insightAnchor: "start" | "middle" | "end" = isRTL ? "middle" : sideAnchor;
      const dividerX1 = isRTL ? cx - 30 : edgePad;
      const dividerX2 = isRTL ? cx + 30 : edgePad + 30;
      return (
        <g>
          {headlineLines.map((ln, i) => (
            <text key={i} x={insightX} y={startY + i * headLineH} textAnchor={insightAnchor}
                  fontFamily={headingFont} fontSize={isRTL ? 44 : 50} fontWeight={isRTL ? 800 : 600}>
              {renderHeadlineWithAccent(ln, slide.headline_accent, style.fg, style.accent)}
            </text>
          ))}
          <line x1={dividerX1} y1={startY + headlineLines.length * headLineH + 16}
                x2={dividerX2} y2={startY + headlineLines.length * headLineH + 16}
                stroke={style.accent} strokeWidth={2} opacity={0.5} />
          {bodyLines.map((ln, i) => (
            <text key={i} x={insightX} y={startY + headlineLines.length * headLineH + 56 + i * bodyLineH}
                  textAnchor={insightAnchor}
                  fontFamily={bodyFont} fontSize={26} fill={style.muted} fontWeight={isRTL ? 600 : 400}>
              {ln}
            </text>
          ))}
        </g>
      );
    }
    case "CTA": {
      const headlineLines = wrapText(slide.headline || "", 22);
      const ctaMainLines = wrapText(slide.cta_main || "", 38);
      const ctaSubLines = wrapText(slide.cta_sub || "", 38);
      const headLineH = 56;
      const lineH = 32;
      const btnH = slide.cta_button ? 80 : 0;
      const headBlockH = headlineLines.length * headLineH;
      const mainBlockH = ctaMainLines.length * lineH;
      const subBlockH = ctaSubLines.length * lineH;
      const gap1 = headBlockH && mainBlockH ? 32 : 0;
      const gap2 = mainBlockH && subBlockH ? 18 : 0;
      const gap3 = (headBlockH || mainBlockH || subBlockH) && btnH ? 32 : 0;
      const totalH = headBlockH + gap1 + mainBlockH + gap2 + subBlockH + gap3 + btnH;
      const top = cy - totalH / 2;
      const startY = top + headLineH;
      const mainY = top + headBlockH + gap1 + lineH * 0.8;
      const subY = mainY + (mainBlockH ? mainBlockH - lineH * 0.2 : 0) + gap2;
      const btnY = top + headBlockH + gap1 + mainBlockH + gap2 + subBlockH + gap3;
      const btnW = 420;
      const btnX = cx - btnW / 2;
      return (
        <g>
          {headlineLines.map((ln, i) => (
            <text key={i} x={cx} y={startY + i * headLineH} textAnchor="middle"
                  fontFamily={headingFont} fontSize={isRTL ? 42 : 48} fontWeight={isRTL ? 800 : 500} fill={style.fg}>
              {renderHeadlineWithAccent(ln, slide.headline_accent, style.fg, style.accent)}
            </text>
          ))}
          {ctaMainLines.map((ln, i) => (
            <text key={`m${i}`} x={cx} y={mainY + i * lineH} textAnchor="middle"
                  fontFamily={bodyFont} fontSize={26} fill={style.muted} fontWeight={isRTL ? 600 : 400}>
              {ln}
            </text>
          ))}
          {ctaSubLines.map((ln, i) => (
            <text key={`s${i}`} x={cx} y={subY + i * lineH} textAnchor="middle"
                  fontFamily={bodyFont} fontSize={26}
                  fontStyle={isRTL ? "normal" : "italic"}
                  fontWeight={isRTL ? 800 : 400}
                  fill={style.accent}>
              {ln}
            </text>
          ))}
          {slide.cta_button && (
            <g>
              <rect x={btnX} y={btnY} width={btnW} height={64} rx={32} fill="none" stroke={style.accent} strokeWidth={1.5} />
              <text x={cx} y={btnY + 40} textAnchor="middle" fontFamily={bodyFont} fontSize={22} fill={style.accent} fontWeight={isRTL ? 800 : 600}>
                {slide.cta_button}
              </text>
            </g>
          )}
        </g>
      );
    }
    default:
      return (
        <text x={cx} y={cy} textAnchor="middle" fontFamily={bodyFont} fontSize={32} fill={style.muted}>
          {slide.slide_type}
        </text>
      );
  }
}

/* ============================ EXPORT ============================ */

const FONT_IMPORT_CSS = `@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&family=DM+Sans:wght@400;500;600;700&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=JetBrains+Mono:wght@400;500;600;700&display=block');`;

// Cache of base64 data URLs for Cairo font weights — embedding directly in SVG
// guarantees the font is available inside the Image()/canvas raster sandbox,
// which cannot fetch external @import URLs reliably.
const CAIRO_WOFF2_URLS: Record<number, string> = {
  400: "https://fonts.gstatic.com/s/cairo/v28/SLXgc1nY6HkvalIvTp2mxdt0UX8.woff2",
  600: "https://fonts.gstatic.com/s/cairo/v28/SLXgc1nY6HkvalIvTp2mxdt0UX8.woff2",
  700: "https://fonts.gstatic.com/s/cairo/v28/SLXgc1nY6HkvalIvTp2mxdt0UX8.woff2",
  800: "https://fonts.gstatic.com/s/cairo/v28/SLXgc1nY6HkvalIvTp2mxdt0UX8.woff2",
};
let CAIRO_EMBEDDED_CSS: string | null = null;
let CAIRO_EMBED_PROMISE: Promise<string> | null = null;
async function getCairoEmbeddedCSS(): Promise<string> {
  if (CAIRO_EMBEDDED_CSS) return CAIRO_EMBEDDED_CSS;
  if (CAIRO_EMBED_PROMISE) return CAIRO_EMBED_PROMISE;
  CAIRO_EMBED_PROMISE = (async () => {
    try {
      const weights = [400, 600, 700, 800];
      const fetched = await Promise.all(weights.map(async (w) => {
        const res = await fetch(CAIRO_WOFF2_URLS[w]);
        const buf = await res.arrayBuffer();
        let bin = "";
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        const b64 = btoa(bin);
        return `@font-face{font-family:'Cairo';font-style:normal;font-weight:${w};font-display:block;src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
      }));
      CAIRO_EMBEDDED_CSS = fetched.join("\n");
      return CAIRO_EMBEDDED_CSS;
    } catch (e) {
      console.warn("Cairo embed failed, falling back to @import", e);
      CAIRO_EMBEDDED_CSS = "";
      return "";
    }
  })();
  return CAIRO_EMBED_PROMISE;
}

function svgToPngBlob(svgEl: SVGSVGElement, width: number, height: number, extraCSS = ""): Promise<Blob> {
  return new Promise((resolve, reject) => {
    // Clone and inject <style> with @import so fonts load inside the SVG sandbox
    const clone = svgEl.cloneNode(true) as SVGSVGElement;
    const styleEl = document.createElementNS("http://www.w3.org/2000/svg", "style");
    styleEl.setAttribute("type", "text/css");
    // Inline base64 fonts FIRST so they are guaranteed to load in the Image() sandbox.
    styleEl.textContent = (extraCSS ? extraCSS + "\n" : "") + FONT_IMPORT_CSS;
    clone.insertBefore(styleEl, clone.firstChild);
    const xml = new XMLSerializer().serializeToString(clone);
    const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      // Small delay so SVG-loaded fonts have a frame to apply before raster
      setTimeout(() => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Canvas toBlob failed")), "image/png");
      }, 500);
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

async function ensureFontsReady(lang: "en" | "ar") {
  try {
    if ((document as any).fonts?.ready) {
      await (document as any).fonts.ready;
    }
    const families = lang === "ar"
      ? ["16px Cairo", "700 16px Cairo", "800 16px Cairo"]
      : ["16px 'DM Sans'", "16px 'Cormorant Garamond'", "16px 'JetBrains Mono'"];
    const checks = families.map((f) => {
      try { return (document as any).fonts?.check?.(f); } catch { return true; }
    });
    if (checks.some((c) => !c)) {
      // Force-load by injecting offscreen text
      const probe = document.createElement("div");
      probe.style.cssText = "position:absolute;left:-9999px;top:-9999px;visibility:hidden;";
      probe.innerHTML = lang === "ar"
        ? `<span style="font-family:'Cairo';font-weight:400">تحميل</span>
           <span style="font-family:'Cairo';font-weight:700">تحميل</span>
           <span style="font-family:'Cairo';font-weight:800">تحميل</span>`
        : `<span style="font-family:'DM Sans'">Aa</span>
           <span style="font-family:'Cormorant Garamond'">Aa</span>
           <span style="font-family:'JetBrains Mono'">Aa</span>`;
      document.body.appendChild(probe);
      try { await (document as any).fonts?.ready; } catch {}
      document.body.removeChild(probe);
    }
    await new Promise((r) => setTimeout(r, 200));
  } catch {}
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slugify(s: string): string {
  return (s || "carousel").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

/* ============================ MAIN PAGE ============================ */

export default function CarouselStudio() {
  const navigate = useNavigate();
  const [styleKey, setStyleKey] = useState<StyleKey>("clean_paper");
  const [dim, setDim] = useState<Dimension>("1080x1350");
  const [topic, setTopic] = useState("");
  const [lang, setLang] = useState<"en" | "ar">("en");
  const [generating, setGenerating] = useState(false);
  const [carousel, setCarousel] = useState<Carousel>(() => sampleCarousel(""));
  const [activeIdx, setActiveIdx] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [contextText, setContextText] = useState("");
  const [selectedSignalId, setSelectedSignalId] = useState<string | undefined>(undefined);
  const [showSignals, setShowSignals] = useState(true);
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedToLibrary, setSavedToLibrary] = useState(false);

  const offscreenRef = useRef<HTMLDivElement>(null);

  const style = STYLES[styleKey];
  const slides = carousel.slides;
  const slide = slides[activeIdx];

  useEffect(() => {
    if (activeIdx >= slides.length) setActiveIdx(Math.max(0, slides.length - 1));
  }, [slides.length, activeIdx]);

  const generate = async () => {
    if (!topic.trim()) { toast.error("Enter a topic first"); return; }
    setGenerating(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session?.user?.id) {
        toast.error("Please sign in to generate a carousel");
        return;
      }
      const { data, error } = await supabase.functions.invoke("generate-carousel-v2", {
        body: {
          topic,
          context: contextText || undefined,
          lang,
          style: styleKey,
          total_slides: 8,
          user_id: sess.session.user.id,
          signal_id: selectedSignalId,
        },
      });
      console.log("EF raw response:", { data, error, hasSlides: !!data?.slides });
      if (error) {
        console.error("EF invoke error:", error);
        toast.error("Generation failed: " + (error.message || JSON.stringify(error)));
        return;
      }
      if (data?.error) {
        toast.error("Generation failed: " + data.error);
        return;
      }
      if (!data?.slides?.length) {
        toast.error("No slides returned — check edge function logs");
        return;
      }
      const numbered = data.slides.map((s: Slide, i: number) => ({ ...s, slide_number: i + 1 }));
      setCarousel({ ...data, slides: numbered, total_slides: numbered.length });
      // Auto-collapse signals once a real carousel is loaded
      setShowSignals(false);
      setActiveIdx(0);
      setSavedToLibrary(false);
      toast.success(`${numbered.length} slides generated`);
    } catch (e: any) {
      console.error("Carousel generation failed:", e);
      toast.error("Generation failed: " + (e?.message || JSON.stringify(e)));
    } finally {
      setGenerating(false);
    }
  };

  const updateSlide = (patch: Partial<Slide>) => {
    setCarousel(c => ({
      ...c,
      slides: c.slides.map((s, i) => i === activeIdx ? { ...s, ...patch } : s),
    }));
  };

  const addSlide = (type: SlideType) => {
    setCarousel(c => {
      const next = [...c.slides];
      next.splice(activeIdx + 1, 0, {
        slide_number: 0, slide_type: type,
        section_label: type, headline: "New slide", body: "",
      });
      const renum = next.map((s, i) => ({ ...s, slide_number: i + 1 }));
      return { ...c, slides: renum, total_slides: renum.length };
    });
    setActiveIdx(activeIdx + 1);
  };

  const deleteSlide = () => {
    if (slides.length <= 1) { toast.error("At least one slide required"); return; }
    setCarousel(c => {
      const next = c.slides.filter((_, i) => i !== activeIdx).map((s, i) => ({ ...s, slide_number: i + 1 }));
      return { ...c, slides: next, total_slides: next.length };
    });
    setActiveIdx(Math.max(0, activeIdx - 1));
  };

  const moveSlide = (dir: -1 | 1) => {
    const newIdx = activeIdx + dir;
    if (newIdx < 0 || newIdx >= slides.length) return;
    setCarousel(c => {
      const next = [...c.slides];
      [next[activeIdx], next[newIdx]] = [next[newIdx], next[activeIdx]];
      return { ...c, slides: next.map((s, i) => ({ ...s, slide_number: i + 1 })) };
    });
    setActiveIdx(newIdx);
  };

  const regenerateSlide = async (slideIndex: number) => {
    const target = slides[slideIndex];
    if (!target) return;
    setRegeneratingIndex(slideIndex);
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session?.user?.id) { toast.error("Please sign in"); return; }
      const prev = slideIndex > 0 ? slides[slideIndex - 1].headline : "none";
      const next = slideIndex < slides.length - 1 ? slides[slideIndex + 1].headline : "none";
      const ctx = `Regenerate ONLY slide ${slideIndex + 1} of ${slides.length}.
It MUST be slide_type: ${target.slide_type}.
Carousel topic: ${carousel.carousel_title || topic}.
Previous slide headline: ${prev}.
Next slide headline: ${next}.
Make it sharper, more specific, more provocative than: "${target.headline || target.question_text || target.cta_main || ''}".`;
      const { data, error } = await supabase.functions.invoke("generate-carousel-v2", {
        body: {
          topic: topic || carousel.carousel_title || "",
          context: ctx,
          lang,
          style: styleKey,
          total_slides: 1,
          user_id: sess.session.user.id,
          signal_id: selectedSignalId,
        },
      });
      if (error) throw error;
      const newSlide = data?.slides?.[0];
      if (!newSlide) { toast.error("No slide returned"); return; }
      setCarousel(c => ({
        ...c,
        slides: c.slides.map((s, i) => i === slideIndex
          ? { ...newSlide, slide_type: s.slide_type, slide_number: s.slide_number }
          : s),
      }));
      toast.success(`Slide ${slideIndex + 1} regenerated`);
    } catch (e: any) {
      console.error(e);
      toast.error("Regenerate failed: " + (e?.message || "Unknown error"));
    } finally {
      setRegeneratingIndex(null);
    }
  };

  const saveToLibrary = async () => {
    if (!slides.length) return;
    setSaving(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session?.user?.id) { toast.error("Please sign in"); return; }
      const { error } = await supabase.from('linkedin_posts').insert({
        user_id: sess.session.user.id,
        post_text: carousel.linkedin_caption || '',
        hook: slides[0]?.headline || carousel.carousel_title || '',
        title: carousel.carousel_title || topic || 'Carousel',
        content_type: 'carousel',
        source_type: 'carousel_studio',
        source_metadata: {
          slides,
          style: styleKey,
          carousel_title: carousel.carousel_title,
          hashtags: carousel.hashtags,
          signal_id: selectedSignalId,
          signal_attribution: carousel.signal_attribution,
          author_name: carousel.author_name,
          author_title: carousel.author_title,
          total_slides: slides.length,
          lang,
        },
        tracking_status: 'draft',
      } as any);
      if (error) throw error;
      setSavedToLibrary(true);
      toast.success("Carousel saved to Library");
    } catch (e: any) {
      console.error(e);
      toast.error("Save failed: " + (e?.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  const renderSlideToBlob = async (s: Slide): Promise<Blob> => {
    // Render into offscreen container
    const container = offscreenRef.current!;
    container.innerHTML = "";
    const wrapper = document.createElement("div");
    container.appendChild(wrapper);
    const { w, h } = DIM[dim];
    // Use ReactDOM via dynamic import to render
    const ReactDOM = await import("react-dom/client");
    const root = ReactDOM.createRoot(wrapper);
    await new Promise<void>((resolve) => {
      root.render(
        <SlideSVG slide={s} total={slides.length} style={style} dim={dim} carousel={carousel} lang={lang} />
      );
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    const svgEl = wrapper.querySelector("svg") as SVGSVGElement;
    if (!svgEl) throw new Error("SVG not found");
    svgEl.setAttribute("width", String(w));
    svgEl.setAttribute("height", String(h));
    // For Arabic, embed Cairo as base64 inside the SVG so the raster sandbox uses it.
    const extraCSS = lang === "ar" ? await getCairoEmbeddedCSS() : "";
    const blob = await svgToPngBlob(svgEl, w, h, extraCSS);
    root.unmount();
    return blob;
  };

  const exportCurrent = async () => {
    setExporting(true);
    try {
      await ensureFontsReady(lang);
      const blob = await renderSlideToBlob(slide);
      downloadBlob(blob, `slide-${slide.slide_number}-${slugify(carousel.carousel_title || topic)}.png`);
    } catch (e: any) { toast.error(e.message || "Export failed"); }
    finally { setExporting(false); }
  };

  const exportZip = async () => {
    setExporting(true);
    try {
      await ensureFontsReady(lang);
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      for (let i = 0; i < slides.length; i++) {
        const blob = await renderSlideToBlob(slides[i]);
        const padded = String(i + 1).padStart(2, "0");
        zip.file(`slide-${padded}.png`, blob);
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      downloadBlob(zipBlob, `carousel-${slugify(carousel.carousel_title || topic)}.zip`);
      toast.success(`${slides.length} slides exported`);
    } catch (e: any) { console.error(e); toast.error(e.message || "ZIP export failed"); }
    finally { setExporting(false); }
  };

  const exportPdf = async () => {
    setExporting(true);
    try {
      await ensureFontsReady(lang);
      const { jsPDF } = await import("jspdf");
      const { w, h } = DIM[dim];
      const pdf = new jsPDF({ orientation: w > h ? "landscape" : "portrait", unit: "px", format: [w, h] });
      for (let i = 0; i < slides.length; i++) {
        const blob = await renderSlideToBlob(slides[i]);
        const dataUrl = await new Promise<string>((resolve) => {
          const r = new FileReader(); r.onload = () => resolve(r.result as string); r.readAsDataURL(blob);
        });
        if (i > 0) pdf.addPage([w, h], w > h ? "landscape" : "portrait");
        pdf.addImage(dataUrl, "PNG", 0, 0, w, h);
      }
      pdf.save(`carousel-${slugify(carousel.carousel_title || topic)}.pdf`);
    } catch (e: any) { console.error(e); toast.error(e.message || "PDF export failed"); }
    finally { setExporting(false); }
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--background, #0F0E0C)", color: "var(--foreground, #F5F0E6)", paddingBottom: 100 }}>
      {/* Top bar */}
      <div className="px-4 md:px-8 py-4 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <button onClick={() => navigate("/home?tab=authority")} className="flex items-center gap-1 text-sm opacity-70 hover:opacity-100">
            <ArrowLeft className="w-4 h-4" /> Back to Publish
          </button>
          <div className="ml-auto flex items-center gap-2">
            <Sparkles className="w-4 h-4" style={{ color: "#C5A55A" }} />
            <span className="text-sm font-medium">Carousel Studio</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          {(Object.keys(STYLES) as StyleKey[]).map(k => (
            <button key={k} onClick={() => setStyleKey(k)}
                    className="px-3 py-1.5 rounded-full text-xs font-medium border"
                    style={{
                      background: styleKey === k ? STYLES[k].accent : "transparent",
                      color: styleKey === k ? "#0A0908" : "inherit",
                      borderColor: styleKey === k ? STYLES[k].accent : "rgba(255,255,255,0.15)",
                    }}>
              {STYLES[k].name}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-xs opacity-60 mr-1">Language</span>
          {(["en", "ar"] as const).map(l => (
            <button key={l} onClick={() => setLang(l)}
                    className="px-3 py-1.5 rounded-full text-xs font-medium border"
                    style={{
                      background: lang === l ? "#C5A55A" : "transparent",
                      color: lang === l ? "#0A0908" : "inherit",
                      borderColor: lang === l ? "#C5A55A" : "rgba(255,255,255,0.15)",
                      fontFamily: l === "ar" ? "'Cairo', sans-serif" : undefined,
                    }}>
              {l === "ar" ? "العربية" : "English"}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="Topic — e.g. Why comprehensive transformations outperform incremental change"
            dir={lang === "ar" ? "rtl" : "ltr"}
            className="flex-1 min-w-[260px] px-3 py-2 rounded-lg bg-white/5 border text-sm"
            style={{ borderColor: "rgba(255,255,255,0.12)", fontFamily: lang === "ar" ? "'Cairo', sans-serif" : undefined }}
          />
          <button onClick={generate} disabled={generating}
                  className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
                  style={{ background: "#C5A55A", color: "#0A0908" }}>
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Generate Carousel
          </button>
        </div>
      </div>

      {/* Main */}
      <div className="px-4 md:px-8 py-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="grid gap-6" style={{ gridTemplateColumns: "minmax(0,1fr)" }}>
          <div className="grid gap-6">
            {/* Preview */}
            <div className="space-y-4">
              <div className="mx-auto" style={{ maxWidth: dim === "1200x628" ? 900 : 640, width: "100%" }}>
                <div style={{ aspectRatio: `${DIM[dim].w} / ${DIM[dim].h}`, boxShadow: "0 30px 80px rgba(0,0,0,0.5)", borderRadius: 16, overflow: "hidden" }}>
                  {slide && <SlideSVG slide={slide} total={slides.length} style={style} dim={dim} carousel={carousel} lang={lang} />}
                </div>
              </div>

              {/* Nav */}
              <div className="flex items-center justify-center gap-3">
                <button onClick={() => setActiveIdx(Math.max(0, activeIdx - 1))} disabled={activeIdx === 0}
                        className="p-2 rounded-full bg-white/5 disabled:opacity-30">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="flex gap-1.5">
                  {slides.map((_, i) => (
                    <button key={i} onClick={() => setActiveIdx(i)}
                            className="w-2 h-2 rounded-full transition-all"
                            style={{ background: i === activeIdx ? "#C5A55A" : "rgba(255,255,255,0.2)", width: i === activeIdx ? 18 : 8 }} />
                  ))}
                </div>
                <button onClick={() => setActiveIdx(Math.min(slides.length - 1, activeIdx + 1))} disabled={activeIdx >= slides.length - 1}
                        className="p-2 rounded-full bg-white/5 disabled:opacity-30">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Filmstrip */}
              <div className="overflow-x-auto -mx-4 px-4">
                <div className="flex gap-2 pb-2">
                  {slides.map((s, i) => (
                    <div key={i} className="group relative" style={{ flex: "0 0 auto", width: 96 }}>
                      <button onClick={() => setActiveIdx(i)}
                              style={{
                                width: "100%", aspectRatio: `${DIM[dim].w} / ${DIM[dim].h}`,
                                borderRadius: 8, overflow: "hidden",
                                border: i === activeIdx ? "2px solid #C5A55A" : "1px solid rgba(255,255,255,0.1)",
                                cursor: "pointer", padding: 0, background: "transparent", display: "block",
                              }}>
                        <SlideSVG slide={s} total={slides.length} style={style} dim={dim} carousel={carousel} lang={lang} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); regenerateSlide(i); }}
                        disabled={regeneratingIndex !== null}
                        title={`Regenerate slide ${i + 1}`}
                        className="absolute top-1 right-1 p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                        style={{ background: "rgba(15,14,12,0.85)", border: "1px solid rgba(197,165,90,0.4)" }}
                      >
                        {regeneratingIndex === i
                          ? <Loader2 className="w-3 h-3 animate-spin" style={{ color: "#C5A55A" }} />
                          : <RefreshCw className="w-3 h-3" style={{ color: "#C5A55A" }} />}
                      </button>
                      {regeneratingIndex === i && (
                        <div className="absolute inset-0 flex items-center justify-center rounded-lg"
                             style={{ background: "rgba(15,14,12,0.6)" }}>
                          <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#C5A55A" }} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Slide management */}
              <div className="flex flex-wrap items-center gap-2 justify-center">
                <select onChange={e => { if (e.target.value) { addSlide(e.target.value as SlideType); e.target.value = ""; } }}
                        defaultValue=""
                        className="px-3 py-1.5 text-xs rounded-lg bg-white/5 border" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
                  <option value="">+ Add slide</option>
                  {(["COVER","BOLD_CLAIM","REFRAME","BIG_NUMBER","TERMINAL","GRID","COMPARE","QUESTION","LIST","INSIGHT","CTA"] as SlideType[]).map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <button onClick={() => moveSlide(-1)} className="p-1.5 rounded bg-white/5"><ArrowUp className="w-3.5 h-3.5" /></button>
                <button onClick={() => moveSlide(1)} className="p-1.5 rounded bg-white/5"><ArrowDown className="w-3.5 h-3.5" /></button>
                <button onClick={deleteSlide} className="p-1.5 rounded bg-white/5 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          </div>
        </div>
        {/* Right column: signals (collapsible) + edit panel */}
        <aside className="space-y-4 lg:sticky lg:top-4 self-start" style={{ maxHeight: "calc(100vh - 32px)", overflowY: "auto" }}>
          <div className="rounded-2xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <button
              onClick={() => setShowSignals(s => !s)}
              className="w-full flex items-center justify-between px-4 py-3 text-left"
            >
              <span className="text-xs uppercase tracking-wider opacity-70 font-semibold">Your publishing window</span>
              {showSignals ? <ChevronUp className="w-4 h-4 opacity-60" /> : <ChevronDown className="w-4 h-4 opacity-60" />}
            </button>
            {showSignals && (
              <div style={{ maxHeight: 320, overflowY: "auto" }} className="px-1 pb-2">
                <StartFromPanel
                  currentFormat="carousel"
                  hasDraft={false}
                  onSelect={(t, ctx, _format, _signalTitle, _insight, signalId) => {
                    setTopic(t);
                    if (ctx) setContextText(ctx);
                    setSelectedSignalId(signalId);
                    toast.success("Signal loaded — click Generate Carousel");
                  }}
                />
              </div>
            )}
          </div>

          {/* Edit panel */}
          <div className="space-y-3 p-4 rounded-2xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-wider opacity-60">Edit · {slide?.slide_type}</div>
              <div className="text-xs opacity-50">Slide {activeIdx + 1} of {slides.length}</div>
            </div>
            {slide && <EditPanel slide={slide} onChange={updateSlide} />}

            <div className="pt-3 mt-3 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
              <div className="text-xs uppercase tracking-wider opacity-60 mb-2">Author & attribution</div>
              <Field label="Name" value={carousel.author_name || ""} onChange={v => setCarousel({ ...carousel, author_name: v })} />
              <Field label="Title" value={carousel.author_title || ""} onChange={v => setCarousel({ ...carousel, author_title: v })} />
              <Field label="Handle" value={carousel.author_handle || ""} onChange={v => setCarousel({ ...carousel, author_handle: v })} />
              <Field label="Signal attribution" value={carousel.signal_attribution || ""} onChange={v => setCarousel({ ...carousel, signal_attribution: v })} />
            </div>
          </div>

          {/* LinkedIn caption + hashtags */}
          {(carousel.linkedin_caption || (carousel.hashtags && carousel.hashtags.length > 0)) && (
            <div className="space-y-3 p-4 rounded-2xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-wider opacity-60">LinkedIn caption</div>
                <button
                  onClick={() => {
                    const tags = (carousel.hashtags || []).map(h => h.startsWith("#") ? h : "#" + h).join(" ");
                    const text = `${carousel.linkedin_caption || ""}${tags ? "\n\n" + tags : ""}`;
                    navigator.clipboard.writeText(text).then(
                      () => toast.success("Caption copied to clipboard"),
                      () => toast.error("Copy failed"),
                    );
                  }}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-white/5 hover:bg-white/10"
                >
                  <Copy className="w-3 h-3" /> Copy
                </button>
              </div>
              <textarea
                value={carousel.linkedin_caption || ""}
                onChange={e => setCarousel({ ...carousel, linkedin_caption: e.target.value })}
                className="w-full px-2.5 py-1.5 text-sm rounded-lg bg-white/5 border focus:outline-none focus:border-amber-500"
                style={{ borderColor: "rgba(255,255,255,0.1)", minHeight: 130, resize: "vertical" }}
              />
              {carousel.hashtags && carousel.hashtags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {carousel.hashtags.map((h, i) => (
                    <span key={i} className="text-xs px-2 py-0.5 rounded-full"
                          style={{ background: "rgba(197,165,90,0.12)", color: "#C5A55A", border: "1px solid rgba(197,165,90,0.25)" }}>
                      {h.startsWith("#") ? h : "#" + h}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* Sticky bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 px-4 py-3 backdrop-blur-md flex flex-wrap items-center gap-2 justify-center"
           style={{ background: "rgba(15,14,12,0.85)", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="flex items-center gap-1 mr-2">
          {(Object.keys(DIM) as Dimension[]).map(d => (
            <button key={d} onClick={() => setDim(d)}
                    className="px-2.5 py-1 text-xs rounded"
                    style={{
                      background: dim === d ? "#C5A55A" : "rgba(255,255,255,0.06)",
                      color: dim === d ? "#0A0908" : "inherit",
                    }}>
              {d.replace("x", "×")}
            </button>
          ))}
        </div>
        <button onClick={exportCurrent} disabled={exporting}
                className="px-3 py-1.5 text-xs rounded-lg flex items-center gap-1.5 bg-white/10">
          <FileImage className="w-3.5 h-3.5" /> This slide
        </button>
        <button onClick={exportZip} disabled={exporting}
                className="px-3 py-1.5 text-xs rounded-lg flex items-center gap-1.5 bg-white/10">
          <FileArchive className="w-3.5 h-3.5" /> All slides (ZIP)
        </button>
        <button onClick={exportPdf} disabled={exporting}
                className="px-3 py-1.5 text-xs rounded-lg flex items-center gap-1.5"
                style={{ background: "#C5A55A", color: "#0A0908" }}>
          {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />} PDF
        </button>
        <button onClick={saveToLibrary} disabled={saving || savedToLibrary || !slides.length}
                className="px-3 py-1.5 text-xs rounded-lg flex items-center gap-1.5"
                style={{
                  background: savedToLibrary ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.1)",
                  color: savedToLibrary ? "#22c55e" : "inherit",
                  border: savedToLibrary ? "1px solid rgba(34,197,94,0.4)" : "1px solid transparent",
                }}>
          {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
            : savedToLibrary ? <><Check className="w-3.5 h-3.5" /> Saved to Library</>
            : <><BookmarkPlus className="w-3.5 h-3.5" /> Save to Library</>}
        </button>
      </div>

      {/* Offscreen render container (for export) */}
      <div ref={offscreenRef} style={{ position: "fixed", left: -10000, top: 0, width: DIM[dim].w, height: DIM[dim].h, pointerEvents: "none" }} />
    </div>
  );
}

/* ============================ EDIT PANEL ============================ */

function Field({ label, value, onChange, multiline = false, mono = false }:
  { label: string; value: string; onChange: (v: string) => void; multiline?: boolean; mono?: boolean }) {
  const cls = "w-full mt-1 px-2.5 py-1.5 text-sm rounded-lg bg-white/5 border focus:outline-none focus:border-amber-500";
  const style = { borderColor: "rgba(255,255,255,0.1)", fontFamily: mono ? "'JetBrains Mono', monospace" : undefined };
  return (
    <label className="block mb-2">
      <span className="text-[11px] uppercase tracking-wider opacity-60">{label}</span>
      {multiline ? (
        <textarea className={cls} style={{ ...style, minHeight: 70 }} value={value} onChange={e => onChange(e.target.value)} />
      ) : (
        <input className={cls} style={style} value={value} onChange={e => onChange(e.target.value)} />
      )}
    </label>
  );
}

function EditPanel({ slide, onChange }: { slide: Slide; onChange: (p: Partial<Slide>) => void }) {
  const t = slide.slide_type;
  return (
    <div>
      <Field label="Section label" value={slide.section_label || ""} onChange={v => onChange({ section_label: v })} />
      {t !== "QUESTION" && t !== "BIG_NUMBER" && t !== "TERMINAL" && (
        <>
          <Field label="Headline" value={slide.headline || ""} onChange={v => onChange({ headline: v })} multiline />
          <Field label="Headline accent (word to highlight)" value={slide.headline_accent || ""} onChange={v => onChange({ headline_accent: v })} />
        </>
      )}
      {(t === "COVER" || t === "REFRAME" || t === "INSIGHT") && (
        <Field label={t === "REFRAME" ? "The truth" : "Body / subtitle"} value={slide.body || ""} onChange={v => onChange({ body: v })} multiline />
      )}
      {t === "BIG_NUMBER" && (
        <>
          <Field label="Number" value={slide.number || ""} onChange={v => onChange({ number: v })} mono />
          <Field label="Context" value={slide.number_context || ""} onChange={v => onChange({ number_context: v })} multiline />
          <Field label="Source" value={slide.number_source || ""} onChange={v => onChange({ number_source: v })} />
        </>
      )}
      {t === "TERMINAL" && (
        <>
          <Field label="Filename" value={slide.terminal_file || ""} onChange={v => onChange({ terminal_file: v })} mono />
          <Field label="Lines (one per line, [bracket] for accent)" value={(slide.terminal_lines || []).join("\n")}
                 onChange={v => onChange({ terminal_lines: v.split("\n") })} multiline mono />
          <Field label="Punchline" value={slide.terminal_punchline || ""} onChange={v => onChange({ terminal_punchline: v })} mono />
        </>
      )}
      {t === "GRID" && (
        <Field label="Grid items (one per line)" value={(slide.grid_items || []).join("\n")}
               onChange={v => onChange({ grid_items: v.split("\n").filter(x => x.trim()) })} multiline />
      )}
      {t === "COMPARE" && (
        <>
          <Field label="Left title" value={slide.compare_left_title || ""} onChange={v => onChange({ compare_left_title: v })} />
          <Field label="Left items (one per line)" value={(slide.compare_left_items || []).join("\n")}
                 onChange={v => onChange({ compare_left_items: v.split("\n").filter(x => x.trim()) })} multiline />
          <Field label="Right title" value={slide.compare_right_title || ""} onChange={v => onChange({ compare_right_title: v })} />
          <Field label="Right items (one per line)" value={(slide.compare_right_items || []).join("\n")}
                 onChange={v => onChange({ compare_right_items: v.split("\n").filter(x => x.trim()) })} multiline />
        </>
      )}
      {t === "LIST" && (
        <div>
          <div className="text-[11px] uppercase tracking-wider opacity-60 mb-1">List items</div>
          {(slide.list_items || []).map((it, i) => (
            <div key={i} className="flex gap-2 mb-1.5">
              <select value={it.label} onChange={e => {
                const next = [...(slide.list_items || [])];
                next[i] = { ...it, label: e.target.value as any };
                onChange({ list_items: next });
              }} className="px-2 py-1 text-xs rounded bg-white/5 border" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
                <option>KILL</option><option>KEEP</option><option>DO</option><option>DONT</option>
              </select>
              <input value={it.text} onChange={e => {
                const next = [...(slide.list_items || [])];
                next[i] = { ...it, text: e.target.value };
                onChange({ list_items: next });
              }} className="flex-1 px-2 py-1 text-sm rounded bg-white/5 border" style={{ borderColor: "rgba(255,255,255,0.1)" }} />
              <button onClick={() => {
                const next = (slide.list_items || []).filter((_, j) => j !== i);
                onChange({ list_items: next });
              }} className="px-2 text-xs opacity-60 hover:opacity-100">×</button>
            </div>
          ))}
          <button onClick={() => onChange({ list_items: [...(slide.list_items || []), { label: "KEEP", text: "" }] })}
                  className="text-xs flex items-center gap-1 opacity-70 hover:opacity-100 mt-1">
            <Plus className="w-3 h-3" /> Add item
          </button>
        </div>
      )}
      {t === "QUESTION" && (
        <Field label="Question" value={slide.question_text || slide.headline || ""}
               onChange={v => onChange({ question_text: v, headline: v })} multiline />
      )}
      {t === "CTA" && (
        <>
          <Field label="Main CTA" value={slide.cta_main || ""} onChange={v => onChange({ cta_main: v })} />
          <Field label="Sub CTA" value={slide.cta_sub || ""} onChange={v => onChange({ cta_sub: v })} />
          <Field label="Button text" value={slide.cta_button || ""} onChange={v => onChange({ cta_button: v })} />
        </>
      )}
    </div>
  );
}