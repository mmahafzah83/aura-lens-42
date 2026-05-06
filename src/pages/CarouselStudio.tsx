import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, Plus, Trash2, ArrowUp, ArrowDown, Loader2, Download, FileImage, FileArchive, FileText, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

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
}

function SlideSVG({ slide, total, style, dim, carousel }: RenderProps) {
  const { w, h } = DIM[dim];
  const bgIsGradient = !!style.bgGradient && style.key === "bold_statement";

  return (
    <svg viewBox={`0 0 ${w} ${h}`} xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%", display: "block" }}>
      <defs>
        {bgIsGradient && (
          <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1C1812" />
            <stop offset="100%" stopColor="#2A1F14" />
          </linearGradient>
        )}
      </defs>
      <rect width={w} height={h} fill={bgIsGradient ? "url(#bgGrad)" : style.bg} />

      {/* Section label */}
      {slide.section_label && (
        <text x={60} y={70} fontFamily={style.bodyFont} fontSize={20} letterSpacing={3} fill={style.accent} fontWeight={600}>
          {slide.section_label.toUpperCase()}
        </text>
      )}

      {/* Page number */}
      <text x={w - 60} y={70} textAnchor="end" fontFamily={style.monoFont} fontSize={24} fill={style.muted}>
        {slide.slide_number}/{total}
      </text>

      {/* Slide-type body */}
      <SlideBody slide={slide} style={style} w={w} h={h} />

      {/* Footer */}
      <g>
        <HorizonEye x={60} y={h - 60} size={20} color={style.accent} />
        <text x={90} y={h - 45} fontFamily={style.bodyFont} fontSize={16} fill={style.fg}>
          {slide.slide_type === "CTA" ? "Built with Aura · " : ""}{carousel.author_name || "M. Mahafzah"}
        </text>
        <text x={w - 60} y={h - 45} textAnchor="end" fontFamily={style.bodyFont} fontSize={14} fill={style.muted}>
          aura-intel.org
        </text>
        {slide.slide_type === "COVER" && (
          <text x={w - 60} y={h - 95} textAnchor="end" fontFamily={style.bodyFont} fontSize={18} fill={style.accent} fontWeight={600}>
            SWIPE →
          </text>
        )}
      </g>

      {/* Progress bar */}
      <g>
        <rect x={0} y={h - 3} width={w} height={3} fill={style.border} />
        <rect x={0} y={h - 3} width={(slide.slide_number / total) * w} height={3} fill={style.accent} />
      </g>
    </svg>
  );
}

function SlideBody({ slide, style, w, h }: { slide: Slide; style: StylePalette; w: number; h: number }) {
  const cx = w / 2;
  const cy = h / 2;
  switch (slide.slide_type) {
    case "COVER": {
      const lines = wrapText(slide.headline || "", 22);
      const lh = 84;
      const startY = cy - (lines.length * lh) / 2 + 30;
      return (
        <g>
          {lines.map((ln, i) => (
            <text key={i} x={cx} y={startY + i * lh} textAnchor="middle"
                  fontFamily={style.headingFont} fontSize={72} fontWeight={500}>
              {renderHeadlineWithAccent(ln, slide.headline_accent, style.fg, style.accent)}
            </text>
          ))}
          {slide.body && (
            <text x={cx} y={startY + lines.length * lh + 40} textAnchor="middle"
                  fontFamily={style.bodyFont} fontSize={24} fill={style.muted}>
              {slide.body}
            </text>
          )}
        </g>
      );
    }
    case "BOLD_CLAIM": {
      const lines = wrapText(slide.headline || "", 22);
      const lh = 72;
      const startY = cy - (lines.length * lh) / 2 + 24;
      return (
        <g>
          {lines.map((ln, i) => (
            <text key={i} x={cx} y={startY + i * lh} textAnchor="middle"
                  fontFamily={style.headingFont} fontSize={60} fontWeight={500}>
              {renderHeadlineWithAccent(ln, slide.headline_accent, style.fg, style.emphasis)}
            </text>
          ))}
        </g>
      );
    }
    case "REFRAME": {
      const beliefLines = wrapText(slide.headline || "", 28);
      const truthLines = wrapText(slide.body || "", 24);
      const beliefStartY = cy - 140;
      return (
        <g>
          <text x={60} y={beliefStartY - 30} fontFamily={style.bodyFont} fontSize={14} letterSpacing={2} fill={style.muted}>
            MOST PEOPLE THINK
          </text>
          {beliefLines.map((ln, i) => (
            <text key={i} x={60} y={beliefStartY + i * 50} fontFamily={style.bodyFont} fontSize={40} fill={style.muted} textDecoration="line-through">
              {ln}
            </text>
          ))}
          <line x1={60} y1={cy} x2={w - 60} y2={cy} stroke={style.accent} strokeWidth={1.5} opacity={0.4} />
          <text x={60} y={cy + 60} fontFamily={style.bodyFont} fontSize={14} letterSpacing={2} fill={style.accent}>
            THE TRUTH
          </text>
          {truthLines.map((ln, i) => (
            <text key={i} x={60} y={cy + 110 + i * 56} fontFamily={style.headingFont} fontSize={48} fontWeight={600} fill={style.fg}>
              {ln}
            </text>
          ))}
        </g>
      );
    }
    case "BIG_NUMBER": {
      return (
        <g>
          <text x={cx} y={cy + 30} textAnchor="middle" fontFamily={style.monoFont} fontSize={200} fontWeight={700} fill={style.accent}>
            {slide.number || "—"}
          </text>
          {slide.number_context && (
            <text x={cx} y={cy + 100} textAnchor="middle" fontFamily={style.bodyFont} fontSize={28} fill={style.muted}>
              {slide.number_context}
            </text>
          )}
          {slide.number_source && (
            <text x={cx} y={h - 130} textAnchor="middle" fontFamily={style.bodyFont} fontSize={18} fill={style.muted} fontStyle="italic">
              {slide.number_source}
            </text>
          )}
        </g>
      );
    }
    case "TERMINAL": {
      const blockX = 60, blockY = 180, blockW = w - 120, blockH = h - 360;
      const lines = slide.terminal_lines || [];
      const renderLine = (line: string, idx: number) => {
        // Highlight [bracketed] text in accent color
        const parts: { text: string; color: string }[] = [];
        const re = /(\[[^\]]+\])/g;
        let lastIdx = 0;
        const matches = Array.from(line.matchAll(re));
        const isStep = line.startsWith("→");
        const baseColor = isStep ? style.muted : style.fg;
        if (matches.length === 0) {
          parts.push({ text: line, color: baseColor });
        } else {
          for (const m of matches) {
            const i = m.index!;
            if (i > lastIdx) parts.push({ text: line.slice(lastIdx, i), color: baseColor });
            parts.push({ text: m[0].slice(1, -1), color: style.accent });
            lastIdx = i + m[0].length;
          }
          if (lastIdx < line.length) parts.push({ text: line.slice(lastIdx), color: baseColor });
        }
        return (
          <text key={idx} x={blockX + 40} y={blockY + 110 + idx * 36} fontFamily={style.monoFont} fontSize={22}>
            {parts.map((p, i) => <tspan key={i} fill={p.color}>{p.text}</tspan>)}
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
            <text x={blockX + blockW - 24} y={blockY + 38} textAnchor="end" fontFamily={style.monoFont} fontSize={18} fill={style.muted}>
              {slide.terminal_file}
            </text>
          )}
          {lines.map(renderLine)}
          {slide.terminal_punchline && (
            <text x={blockX + 40} y={blockY + blockH - 40} fontFamily={style.monoFont} fontSize={22} fontWeight={700} fill={style.accent}>
              {slide.terminal_punchline}
            </text>
          )}
        </g>
      );
    }
    case "GRID": {
      const items = slide.grid_items || [];
      const cols = items.length > 4 ? 2 : 2;
      const rows = Math.ceil(items.length / cols);
      const gridX = 60, gridY = 220, gridW = w - 120, gridH = h - 380;
      const gap = 24;
      const cellW = (gridW - gap * (cols - 1)) / cols;
      const cellH = (gridH - gap * (rows - 1)) / Math.max(rows, 1);
      return (
        <g>
          {slide.headline && (
            <text x={60} y={150} fontFamily={style.headingFont} fontSize={42} fontWeight={500} fill={style.fg}>
              {slide.headline}
            </text>
          )}
          {items.map((it, i) => {
            const r = Math.floor(i / cols);
            const c = i % cols;
            const x = gridX + c * (cellW + gap);
            const y = gridY + r * (cellH + gap);
            const wrapped = wrapText(it, 28);
            return (
              <g key={i}>
                <rect x={x} y={y} width={cellW} height={cellH} rx={12} fill="none" stroke={style.border} strokeWidth={1} />
                <circle cx={x + 36} cy={y + 36} r={20} fill={style.emphasis} fillOpacity={0.15} />
                <text x={x + 36} y={y + 43} textAnchor="middle" fontFamily={style.monoFont} fontSize={18} fontWeight={700} fill={style.emphasis}>
                  {i + 1}
                </text>
                {wrapped.map((ln, li) => (
                  <text key={li} x={x + 24} y={y + 90 + li * 30} fontFamily={style.bodyFont} fontSize={22} fill={style.muted}>
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
      const left = slide.compare_left_items || [];
      const right = slide.compare_right_items || [];
      return (
        <g>
          {slide.headline && (
            <text x={60} y={150} fontFamily={style.headingFont} fontSize={40} fontWeight={500} fill={style.fg}>
              {slide.headline}
            </text>
          )}
          <line x1={cx} y1={200} x2={cx} y2={h - 180} stroke={style.border} strokeWidth={1} />
          <text x={80} y={230} fontFamily={style.bodyFont} fontSize={20} letterSpacing={2} fill={style.muted}>
            {(slide.compare_left_title || "BEFORE").toUpperCase()}
          </text>
          <text x={cx + 40} y={230} fontFamily={style.bodyFont} fontSize={20} letterSpacing={2} fill={style.accent} fontWeight={600}>
            {(slide.compare_right_title || "AFTER").toUpperCase()}
          </text>
          {left.map((it, i) => {
            const lns = wrapText(it, 24);
            return lns.map((ln, li) => (
              <text key={`l${i}-${li}`} x={80} y={290 + i * 90 + li * 32} fontFamily={style.bodyFont} fontSize={26} fill={style.muted}>
                {ln}
              </text>
            ));
          })}
          {right.map((it, i) => {
            const lns = wrapText(it, 24);
            return lns.map((ln, li) => (
              <text key={`r${i}-${li}`} x={cx + 40} y={290 + i * 90 + li * 32} fontFamily={style.bodyFont} fontSize={26} fill={style.fg} fontWeight={500}>
                {ln}
              </text>
            ));
          })}
        </g>
      );
    }
    case "LIST": {
      const items = slide.list_items || [];
      return (
        <g>
          {slide.headline && (
            <text x={60} y={150} fontFamily={style.headingFont} fontSize={42} fontWeight={500} fill={style.fg}>
              {slide.headline}
            </text>
          )}
          {items.map((it, i) => {
            const y = 230 + i * 90;
            const isKill = it.label === "KILL" || it.label === "DONT";
            const labelColor = isKill ? "#ef4444" : style.accent;
            const textColor = isKill ? style.muted : style.fg;
            return (
              <g key={i}>
                <line x1={60} y1={y - 30} x2={w - 60} y2={y - 30} stroke={style.border} />
                <text x={60} y={y + 18} fontFamily={style.monoFont} fontSize={18} fontWeight={700} fill={labelColor}>
                  {it.label}
                </text>
                <text x={200} y={y + 18} fontFamily={style.bodyFont} fontSize={26} fill={textColor}
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
      const lines = wrapText(q, 26);
      const lh = 64;
      const startY = cy - (lines.length * lh) / 2 + 20;
      return (
        <g>
          <text x={cx} y={cy + 80} textAnchor="middle" fontFamily={style.headingFont} fontSize={300} fill={style.accent} opacity={0.06}>
            ?
          </text>
          {lines.map((ln, i) => (
            <text key={i} x={cx} y={startY + i * lh} textAnchor="middle"
                  fontFamily={style.headingFont} fontSize={48} fontStyle="italic" fill={style.fg}>
              {ln}
            </text>
          ))}
        </g>
      );
    }
    case "INSIGHT": {
      const headlineLines = wrapText(slide.headline || "", 26);
      const bodyLines = wrapText(slide.body || "", 38);
      return (
        <g>
          {headlineLines.map((ln, i) => (
            <text key={i} x={60} y={220 + i * 58} fontFamily={style.headingFont} fontSize={48} fontWeight={500}>
              {renderHeadlineWithAccent(ln, slide.headline_accent, style.fg, style.emphasis)}
            </text>
          ))}
          <line x1={60} y1={220 + headlineLines.length * 58 + 20} x2={120} y2={220 + headlineLines.length * 58 + 20} stroke={style.accent} strokeWidth={2} opacity={0.4} />
          {bodyLines.map((ln, i) => (
            <text key={i} x={60} y={220 + headlineLines.length * 58 + 70 + i * 36} fontFamily={style.bodyFont} fontSize={26} fill={style.muted}>
              {ln}
            </text>
          ))}
        </g>
      );
    }
    case "CTA": {
      const headlineLines = wrapText(slide.headline || "", 24);
      return (
        <g>
          {headlineLines.map((ln, i) => (
            <text key={i} x={60} y={250 + i * 56} fontFamily={style.headingFont} fontSize={48} fontWeight={500} fill={style.fg}>
              {ln}
            </text>
          ))}
          {slide.cta_main && (
            <text x={60} y={cy + 80} fontFamily={style.bodyFont} fontSize={26} fill={style.muted}>
              {slide.cta_main}
            </text>
          )}
          {slide.cta_sub && (
            <text x={60} y={cy + 120} fontFamily={style.bodyFont} fontSize={26} fontStyle="italic" fill={style.accent}>
              {slide.cta_sub}
            </text>
          )}
          {slide.cta_button && (
            <g>
              <rect x={60} y={cy + 160} width={420} height={64} rx={32} fill="none" stroke={style.accent} strokeWidth={1.5} />
              <text x={270} y={cy + 200} textAnchor="middle" fontFamily={style.bodyFont} fontSize={22} fill={style.accent} fontWeight={600}>
                {slide.cta_button}
              </text>
            </g>
          )}
        </g>
      );
    }
    default:
      return (
        <text x={cx} y={cy} textAnchor="middle" fontFamily={style.bodyFont} fontSize={32} fill={style.muted}>
          {slide.slide_type}
        </text>
      );
  }
}

/* ============================ EXPORT ============================ */

function svgToPngBlob(svgEl: SVGSVGElement, width: number, height: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xml = new XMLSerializer().serializeToString(svgEl);
    const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Canvas toBlob failed")), "image/png");
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
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
  const [dim, setDim] = useState<Dimension>("1080x1080");
  const [topic, setTopic] = useState("");
  const [generating, setGenerating] = useState(false);
  const [carousel, setCarousel] = useState<Carousel>(() => sampleCarousel(""));
  const [activeIdx, setActiveIdx] = useState(0);
  const [exporting, setExporting] = useState(false);

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
      const { data, error } = await supabase.functions.invoke("generate-carousel-v2", {
        body: { topic, lang: "en", style: styleKey, total_slides: 8, user_id: sess.session?.user?.id },
      });
      if (error) throw error;
      if (!data?.slides?.length) throw new Error("No slides returned");
      const numbered = data.slides.map((s: Slide, i: number) => ({ ...s, slide_number: i + 1 }));
      setCarousel({ ...data, slides: numbered, total_slides: numbered.length });
      setActiveIdx(0);
      toast.success(`${numbered.length} slides generated`);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Generation failed");
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
        <SlideSVG slide={s} total={slides.length} style={style} dim={dim} carousel={carousel} />
      );
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    const svgEl = wrapper.querySelector("svg") as SVGSVGElement;
    if (!svgEl) throw new Error("SVG not found");
    svgEl.setAttribute("width", String(w));
    svgEl.setAttribute("height", String(h));
    const blob = await svgToPngBlob(svgEl, w, h);
    root.unmount();
    return blob;
  };

  const exportCurrent = async () => {
    setExporting(true);
    try {
      const blob = await renderSlideToBlob(slide);
      downloadBlob(blob, `slide-${slide.slide_number}-${slugify(carousel.carousel_title || topic)}.png`);
    } catch (e: any) { toast.error(e.message || "Export failed"); }
    finally { setExporting(false); }
  };

  const exportZip = async () => {
    setExporting(true);
    try {
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

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="Topic — e.g. Why comprehensive transformations outperform incremental change"
            className="flex-1 min-w-[260px] px-3 py-2 rounded-lg bg-white/5 border text-sm"
            style={{ borderColor: "rgba(255,255,255,0.12)" }}
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
      <div className="px-4 md:px-8 py-6 grid gap-6" style={{ gridTemplateColumns: "minmax(0,1fr)" }}>
        <div className="grid gap-6" style={{ gridTemplateColumns: "minmax(0,1fr)" }}>
          <div className="grid gap-6 md:grid-cols-[3fr_2fr]">
            {/* Preview */}
            <div className="space-y-4">
              <div className="mx-auto" style={{ maxWidth: dim === "1200x628" ? 900 : 640, width: "100%" }}>
                <div style={{ aspectRatio: `${DIM[dim].w} / ${DIM[dim].h}`, boxShadow: "0 30px 80px rgba(0,0,0,0.5)", borderRadius: 16, overflow: "hidden" }}>
                  {slide && <SlideSVG slide={slide} total={slides.length} style={style} dim={dim} carousel={carousel} />}
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
                    <button key={i} onClick={() => setActiveIdx(i)}
                            style={{
                              flex: "0 0 auto", width: 96, aspectRatio: `${DIM[dim].w} / ${DIM[dim].h}`,
                              borderRadius: 8, overflow: "hidden",
                              border: i === activeIdx ? "2px solid #C5A55A" : "1px solid rgba(255,255,255,0.1)",
                              cursor: "pointer", padding: 0, background: "transparent",
                            }}>
                      <SlideSVG slide={s} total={slides.length} style={style} dim={dim} carousel={carousel} />
                    </button>
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
          </div>
        </div>
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