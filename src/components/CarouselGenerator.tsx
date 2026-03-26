import { useState, useRef, useCallback } from "react";
import {
  Loader2, Globe, Download, RefreshCw, Pencil, Eye, ChevronLeft, ChevronRight,
  LayoutGrid, Check, Copy, Hash, ImageIcon, Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import jsPDF from "jspdf";

/* ── Types ──────────────────────────── */
interface DiagramData {
  type: "sequential_flow" | "layered" | "circular" | "grid_2x2";
  nodes: string[];
  connections?: string[];
}

interface Slide {
  slide_number: number;
  slide_type: string;
  headline: string;
  supporting_text: string;
  emphasis_words?: string[];
  pattern_interrupt?: string | null;
  visual_anchor?: string | null;
  layout: string;
  accent_element?: string | null;
  diagram_data?: DiagramData;
  image_prompt?: string;
  image_url?: string;
  visual_type?: string;
  layout_style?: string;
}

type Lang = "en" | "ar";
type Style = "minimal_creator" | "dark_creator" | "corporate_gradient";

interface CarouselGeneratorProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  context?: string;
}

/* ── Canvas Dimensions (LinkedIn Portrait) ── */
const CANVAS_W = 1080;
const CANVAS_H = 1350;
const SAFE_M = 120;

/* ── Style Palettes ──────────────────── */
const PALETTES: Record<Style, {
  bg: string; fg: string; accent: string; muted: string; subtle: string;
  gradientFrom: string; gradientTo: string; name: string;
  emphBg: string; emphFg: string;
}> = {
  minimal_creator: {
    bg: "#FDF6EC", fg: "#1A1A1A", accent: "#C8A862", muted: "#6B6560",
    subtle: "#F5EDE0", gradientFrom: "#FDF6EC", gradientTo: "#F8F0E3",
    name: "Minimal Creator",
    emphBg: "#1A1A1A", emphFg: "#FDF6EC",
  },
  dark_creator: {
    bg: "#0A0A0A", fg: "#FFFFFF", accent: "#FFD700", muted: "#9CA3AF",
    subtle: "#1A1A1A", gradientFrom: "#0A0A0A", gradientTo: "#111111",
    name: "Dark Creator",
    emphBg: "#FFD700", emphFg: "#0A0A0A",
  },
  corporate_gradient: {
    bg: "#0C1B2E", fg: "#FFFFFF", accent: "#2ECDA7", muted: "#8BA4CC",
    subtle: "#142640", gradientFrom: "#0C1B2E", gradientTo: "#1A2B45",
    name: "Corporate Gradient",
    emphBg: "#2ECDA7", emphFg: "#0C1B2E",
  },
};

/* ── Highlight Headline with emphasis words ── */
const HighlightedHeadline = ({
  text, emphasisWords = [], palette, fontSize, textAlign, isAr,
}: {
  text: string; emphasisWords?: string[]; palette: typeof PALETTES.minimal_creator;
  fontSize: number; textAlign: string; isAr: boolean;
}) => {
  if (!emphasisWords || emphasisWords.length === 0) {
    return (
      <h2 style={{
        fontSize, fontWeight: 900, lineHeight: 1.1, letterSpacing: "-0.03em",
        textAlign: textAlign as any, color: palette.fg, margin: 0,
      }}>
        {text}
      </h2>
    );
  }

  const parts: { text: string; highlight: boolean }[] = [];
  let remaining = text;
  const lowerEmphasis = emphasisWords.map(w => w.toLowerCase());

  // Simple word-by-word splitting
  const words = remaining.split(/(\s+)/);
  for (const word of words) {
    if (lowerEmphasis.includes(word.toLowerCase().replace(/[.,!?;:]/g, ""))) {
      parts.push({ text: word, highlight: true });
    } else {
      parts.push({ text: word, highlight: false });
    }
  }

  return (
    <h2 style={{
      fontSize, fontWeight: 900, lineHeight: 1.1, letterSpacing: "-0.03em",
      textAlign: textAlign as any, color: palette.fg, margin: 0,
    }}>
      {parts.map((part, i) => part.highlight ? (
        <span key={i} style={{
          backgroundColor: palette.emphBg,
          color: palette.emphFg,
          padding: "2px 10px",
          borderRadius: 4,
          boxDecorationBreak: "clone" as any,
          WebkitBoxDecorationBreak: "clone" as any,
        }}>{part.text}</span>
      ) : (
        <span key={i}>{part.text}</span>
      ))}
    </h2>
  );
};

/* ── Visual Anchor Elements ── */
const VisualAnchor = ({ type, palette }: { type: string | null | undefined; palette: typeof PALETTES.minimal_creator }) => {
  if (!type) return null;

  switch (type) {
    case "arrow_down":
      return (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 24 }}>
          <div style={{ fontSize: 48, color: palette.accent, lineHeight: 1 }}>↓</div>
        </div>
      );
    case "underline_bar":
      return (
        <div style={{
          width: 80, height: 6, backgroundColor: palette.accent,
          borderRadius: 3, marginTop: 20,
        }} />
      );
    case "highlight_box":
      return (
        <div style={{
          width: 48, height: 48, border: `3px solid ${palette.accent}`,
          borderRadius: 8, marginTop: 20, opacity: 0.5,
        }} />
      );
    case "divider_accent":
      return (
        <div style={{
          width: 120, height: 2, background: `linear-gradient(90deg, ${palette.accent}, transparent)`,
          marginTop: 20,
        }} />
      );
     case "number_badge":
      return null; // handled separately in layout
    case "large_number":
      return null; // handled in slide content
    case "quote_mark":
      return (
        <div style={{ fontSize: 96, lineHeight: 0.7, color: palette.accent, opacity: 0.25, fontFamily: "Georgia, serif" }}>
          "
        </div>
      );
    default:
      return null;
  }
};

/* ── Diagram Renderer ── */
const DiagramOverlay = ({ data, palette, isAr }: { data: DiagramData; palette: typeof PALETTES.minimal_creator; isAr: boolean }) => {
  const nodes = data.nodes || [];
  if (nodes.length === 0) return null;

  if (data.type === "sequential_flow") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "stretch" }}>
        {nodes.map((n, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <div style={{
              padding: "16px 28px", borderRadius: 12, border: `2px solid ${palette.accent}`,
              backgroundColor: `${palette.accent}15`, color: palette.fg,
              fontSize: 20, fontWeight: 800, textAlign: "center", width: "100%", maxWidth: 420,
            }}>{n}</div>
            {i < nodes.length - 1 && (
              <span style={{ fontSize: 28, color: palette.accent, fontWeight: 700 }}>↓</span>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (data.type === "layered") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
        {nodes.map((n, i) => (
          <div key={i} style={{
            padding: "18px 28px", borderRadius: 10,
            backgroundColor: `${palette.accent}${Math.max(12, 35 - i * 6).toString(16).padStart(2, "0")}`,
            border: `1.5px solid ${palette.accent}40`, color: palette.fg,
            fontSize: 20, fontWeight: 700, textAlign: "center",
          }}>{n}</div>
        ))}
      </div>
    );
  }

  if (data.type === "grid_2x2") {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, width: "100%" }}>
        {nodes.slice(0, 4).map((n, i) => (
          <div key={i} style={{
            padding: "24px 16px", borderRadius: 12,
            border: `2px solid ${palette.accent}40`,
            backgroundColor: `${palette.accent}10`, color: palette.fg,
            fontSize: 18, fontWeight: 800, textAlign: "center",
          }}>{n}</div>
        ))}
      </div>
    );
  }

  if (data.type === "circular") {
    const count = nodes.length;
    const radius = 140;
    return (
      <div style={{ position: "relative", width: 380, height: 380, margin: "0 auto" }}>
        {nodes.map((n, i) => {
          const angle = (2 * Math.PI * i) / count - Math.PI / 2;
          const x = 190 + radius * Math.cos(angle) - 65;
          const y = 190 + radius * Math.sin(angle) - 28;
          return (
            <div key={i} style={{
              position: "absolute", left: x, top: y, width: 130, height: 56,
              display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: 10, border: `2px solid ${palette.accent}`,
              backgroundColor: `${palette.accent}15`, color: palette.fg,
              fontSize: 14, fontWeight: 800, textAlign: "center", padding: "4px 8px",
            }}>{n}</div>
          );
        })}
        <div style={{
          position: "absolute", left: 183, top: 183, width: 14, height: 14,
          borderRadius: "50%", backgroundColor: palette.accent,
        }} />
      </div>
    );
  }

  return null;
};

/* ── Slide Renderer (1080×1350 Portrait) ──────────────────── */
const SlidePreview = ({
  slide, style, lang, width = 320,
}: { slide: Slide; style: Style; lang: Lang; width?: number }) => {
  const p = PALETTES[style];
  const isAr = lang === "ar";
  const scale = width / CANVAS_W;
  const height = width * (CANVAS_H / CANVAS_W);
  const layout = slide.layout || slide.layout_style || "hero_center";
  const slideType = slide.slide_type;
  const hasDiagram = slide.diagram_data && slide.diagram_data.nodes?.length > 0;
  const hasImage = !!slide.image_url;
  const isHero = layout === "hero_center" || slideType === "hook" || slideType === "cta" || layout === "closing_centered";
  const isQuote = layout === "quote_block";
  const isNumbered = layout === "numbered_point";
  const isFramework = slideType === "framework";

  return (
    <div className="relative overflow-hidden flex-shrink-0" style={{ width, height, borderRadius: 12 }}>
      <div style={{
        width: CANVAS_W, height: CANVAS_H,
        transform: `scale(${scale})`, transformOrigin: "top left",
        background: `linear-gradient(170deg, ${p.gradientFrom}, ${p.gradientTo})`,
        color: p.fg,
        display: "flex", flexDirection: "column",
        position: "relative",
        fontFamily: isAr ? "'Noto Sans Arabic', sans-serif" : "'Inter', system-ui, sans-serif",
        direction: isAr ? "rtl" : "ltr",
      }}>
        {/* Background image */}
        {hasImage && (
          <div style={{
            position: "absolute", inset: 0,
            backgroundImage: `url(${slide.image_url})`,
            backgroundSize: "cover", backgroundPosition: "center",
            opacity: isHero ? 0.4 : 0.25,
          }} />
        )}
        {hasImage && (
          <div style={{
            position: "absolute", inset: 0,
            background: isHero
              ? `linear-gradient(180deg, ${p.bg}60 0%, ${p.bg}CC 50%, ${p.bg}F5 100%)`
              : `linear-gradient(180deg, ${p.bg}30 0%, ${p.bg}BB 35%, ${p.bg}F0 100%)`,
          }} />
        )}

        {/* Subtle ambient glow (no image) */}
        {!hasImage && (
          <div style={{
            position: "absolute", inset: 0,
            background: `radial-gradient(ellipse at 20% 20%, ${p.accent}08, transparent 60%), radial-gradient(ellipse at 80% 80%, ${p.accent}05, transparent 60%)`,
          }} />
        )}

        {/* Top accent bar */}
        <div style={{
          height: 5, width: "100%",
          background: `linear-gradient(90deg, ${p.accent}, ${p.accent}40, transparent)`,
          position: "relative", zIndex: 2,
        }} />

        {/* Slide number badge */}
        <div style={{
          position: "absolute", top: SAFE_M - 40, [isAr ? "right" : "left"]: SAFE_M,
          width: 52, height: 52, borderRadius: 14,
          backgroundColor: p.accent, color: style === "minimal_creator" ? "#FFFFFF" : p.bg,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 24, fontWeight: 900, zIndex: 3,
          boxShadow: `0 4px 20px ${p.accent}40`,
        }}>
          {slide.slide_number}
        </div>

        {/* Slide type label */}
        <div style={{
          position: "absolute", top: SAFE_M - 28, [isAr ? "left" : "right"]: SAFE_M,
          fontSize: 12, textTransform: "uppercase", letterSpacing: 6,
          color: p.muted, fontWeight: 700, opacity: 0.3, zIndex: 3,
        }}>
          {(slideType || "").replace(/_/g, " ")}
        </div>

        {/* Main content area */}
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          justifyContent: isHero ? "center" : "flex-end",
          padding: `${SAFE_M + 40}px ${SAFE_M}px ${SAFE_M + 60}px`,
          position: "relative", zIndex: 2,
          gap: 20,
        }}>
          {/* Quote mark for quote layout */}
          {isQuote && <VisualAnchor type="quote_mark" palette={p} />}

          {/* Framework number badge */}
          {isFramework && isNumbered && (
            <div style={{
              width: 80, height: 80, borderRadius: "50%",
              border: `3px solid ${p.accent}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 36, fontWeight: 900, color: p.accent,
              backgroundColor: `${p.accent}10`,
              ...(isHero ? { marginLeft: "auto", marginRight: "auto" } : {}),
            }}>
              {slide.slide_number - 5}
            </div>
          )}

          {/* Visual anchor (before headline) */}
          {!isQuote && !isNumbered && slide.visual_anchor !== "arrow_down" && (
            <VisualAnchor type={slide.visual_anchor || "underline_bar"} palette={p} />
          )}

          {/* Pattern interrupt */}
          {slide.pattern_interrupt && (
            <div style={{
              fontSize: 32, fontWeight: 900, letterSpacing: 6,
              textTransform: "uppercase", color: p.accent,
              textAlign: isHero ? "center" : (isAr ? "right" : "left"),
              marginBottom: 8,
            }}>
              {slide.pattern_interrupt}
            </div>
          )}

          {/* Headline with emphasis highlighting */}
          <HighlightedHeadline
            text={slide.headline}
            emphasisWords={slide.emphasis_words}
            palette={p}
            fontSize={isHero ? 76 : 60}
            textAlign={isHero ? "center" : (isAr ? "right" : "left")}
            isAr={isAr}
          />

          {/* Supporting text */}
          {!hasDiagram && slide.supporting_text && (
            <p style={{
              fontSize: 28, lineHeight: 1.5,
              color: p.muted, fontWeight: 400,
              textAlign: isHero ? "center" : (isAr ? "right" : "left"),
              maxWidth: 800,
              ...(isHero ? { marginLeft: "auto", marginRight: "auto" } : {}),
            }}>
              {slide.supporting_text}
            </p>
          )}

          {/* Diagram */}
          {hasDiagram && slide.diagram_data && (
            <div style={{ marginTop: 16 }}>
              <DiagramOverlay data={slide.diagram_data} palette={p} isAr={isAr} />
            </div>
          )}

          {/* Visual anchor (after content — arrow down) */}
          {slide.visual_anchor === "arrow_down" && (
            <VisualAnchor type="arrow_down" palette={p} />
          )}
        </div>

        {/* Footer */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          padding: `24px ${SAFE_M}px`, display: "flex", justifyContent: "space-between",
          alignItems: "center", fontSize: 14, color: p.muted, opacity: 0.3,
          borderTop: `1px solid ${p.muted}15`, zIndex: 3,
        }}>
          <span style={{ fontWeight: 700, letterSpacing: 1 }}>M. Mahafdhah</span>
          <span style={{ letterSpacing: 3, textTransform: "uppercase", fontSize: 11 }}>Save ↗</span>
        </div>
      </div>
    </div>
  );
};

/* ── Main Component ──────────────────── */
const CarouselGenerator = ({ open, onClose, title, description, context }: CarouselGeneratorProps) => {
  const [slides, setSlides] = useState<Record<Lang, Slide[]>>({ en: [], ar: [] });
  const [lang, setLang] = useState<Lang>("en");
  const [style, setStyle] = useState<Style>("minimal_creator");
  const [loading, setLoading] = useState<Record<Lang, boolean>>({ en: false, ar: false });
  const [currentSlide, setCurrentSlide] = useState(0);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [gridView, setGridView] = useState(false);
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [generatingVisuals, setGeneratingVisuals] = useState(false);
  const [visualProgress, setVisualProgress] = useState(0);
  const [visualTotal, setVisualTotal] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const currentSlides = slides[lang];
  const isLoading = loading[lang];

  /* ── Generate slide visuals ── */
  const generateVisuals = useCallback(async (targetLang: Lang, slideList: Slide[]) => {
    const slidesWithPrompts = slideList.filter(s => s.image_prompt && !s.image_url);
    if (slidesWithPrompts.length === 0) return;

    setGeneratingVisuals(true);
    setVisualTotal(slidesWithPrompts.length);
    setVisualProgress(0);

    for (let i = 0; i < slidesWithPrompts.length; i++) {
      const slide = slidesWithPrompts[i];
      try {
        const { data, error } = await supabase.functions.invoke("generate-slide-visual", {
          body: { image_prompt: slide.image_prompt, slide_number: slide.slide_number, style },
        });

        if (!error && data?.image_url) {
          setSlides(prev => ({
            ...prev,
            [targetLang]: prev[targetLang].map(s =>
              s.slide_number === slide.slide_number ? { ...s, image_url: data.image_url } : s
            ),
          }));
        }
      } catch (e) {
        console.warn(`Failed to generate visual for slide ${slide.slide_number}:`, e);
      }
      setVisualProgress(i + 1);
      if (i < slidesWithPrompts.length - 1) {
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    setGeneratingVisuals(false);
    toast.success("Slide visuals generated");
  }, [style]);

  const generate = useCallback(async (targetLang: Lang) => {
    setLoading(prev => ({ ...prev, [targetLang]: true }));
    try {
      const { data, error } = await supabase.functions.invoke("generate-carousel", {
        body: { title, description, context, style, lang: targetLang },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const newSlides = data.slides || [];
      setSlides(prev => ({ ...prev, [targetLang]: newSlides }));
      if (data.linkedin_caption) setCaption(data.linkedin_caption);
      if (data.hashtags) setHashtags(data.hashtags);
      if (targetLang === lang) setCurrentSlide(0);

      if (newSlides.length > 0) {
        setTimeout(() => generateVisuals(targetLang, newSlides), 500);
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to generate carousel");
    } finally {
      setLoading(prev => ({ ...prev, [targetLang]: false }));
    }
  }, [title, description, context, style, lang, generateVisuals]);

  const generateBoth = useCallback(() => {
    generate("en");
    generate("ar");
  }, [generate]);

  const [hasGenerated, setHasGenerated] = useState(false);
  if (open && title && !hasGenerated && !loading.en && !loading.ar && currentSlides.length === 0) {
    setHasGenerated(true);
    setTimeout(() => generateBoth(), 0);
  }

  const updateSlide = (idx: number, field: keyof Slide, value: string) => {
    setSlides(prev => ({
      ...prev,
      [lang]: prev[lang].map((s, i) => i === idx ? { ...s, [field]: value } : s),
    }));
  };

  const regenerateSlideVisual = async (idx: number) => {
    const slide = currentSlides[idx];
    if (!slide?.image_prompt) return;

    setSlides(prev => ({
      ...prev,
      [lang]: prev[lang].map((s, i) => i === idx ? { ...s, image_url: undefined } : s),
    }));

    try {
      const { data, error } = await supabase.functions.invoke("generate-slide-visual", {
        body: { image_prompt: slide.image_prompt, slide_number: slide.slide_number, style },
      });
      if (!error && data?.image_url) {
        setSlides(prev => ({
          ...prev,
          [lang]: prev[lang].map((s, i) => i === idx ? { ...s, image_url: data.image_url } : s),
        }));
        toast.success(`Slide ${idx + 1} visual regenerated`);
      }
    } catch (e) {
      toast.error("Failed to regenerate visual");
    }
  };

  /* ── PDF Export (1080×1350) ── */
  const exportPDF = async () => {
    if (currentSlides.length === 0) return;
    setExporting(true);

    try {
      const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: [CANVAS_W, CANVAS_H] });
      const canvas = document.createElement("canvas");
      canvas.width = CANVAS_W;
      canvas.height = CANVAS_H;
      const ctx = canvas.getContext("2d")!;
      const p = PALETTES[style];
      const isAr = lang === "ar";

      for (let i = 0; i < currentSlides.length; i++) {
        if (i > 0) pdf.addPage([CANVAS_W, CANVAS_H], "portrait");
        const slide = currentSlides[i];
        const layout = slide.layout || slide.layout_style || "hero_center";
        const isHero = layout === "hero_center" || slide.slide_type === "hook" || slide.slide_type === "cta";

        // Background gradient
        const grd = ctx.createLinearGradient(0, 0, CANVAS_W, CANVAS_H);
        grd.addColorStop(0, p.gradientFrom);
        grd.addColorStop(1, p.gradientTo);
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        // Background image
        if (slide.image_url) {
          try {
            const img = new Image();
            img.crossOrigin = "anonymous";
            await new Promise<void>((resolve, reject) => {
              img.onload = () => resolve();
              img.onerror = () => reject();
              img.src = slide.image_url!;
            });
            ctx.globalAlpha = isHero ? 0.4 : 0.25;
            ctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H);
            ctx.globalAlpha = 1;

            const overlayGrd = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
            overlayGrd.addColorStop(0, `${p.bg}60`);
            overlayGrd.addColorStop(0.5, `${p.bg}CC`);
            overlayGrd.addColorStop(1, `${p.bg}F5`);
            ctx.fillStyle = overlayGrd;
            ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
          } catch {
            // Image failed to load
          }
        }

        // Top accent bar
        const barGrd = ctx.createLinearGradient(0, 0, CANVAS_W, 0);
        barGrd.addColorStop(0, p.accent);
        barGrd.addColorStop(0.5, `${p.accent}40`);
        barGrd.addColorStop(1, "transparent");
        ctx.fillStyle = barGrd;
        ctx.fillRect(0, 0, CANVAS_W, 5);

        // Slide number badge
        ctx.fillStyle = p.accent;
        roundRect(ctx, SAFE_M, SAFE_M - 40, 52, 52, 14);
        ctx.fill();
        ctx.fillStyle = style === "minimal_creator" ? "#FFFFFF" : p.bg;
        ctx.font = "900 24px Inter, Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(String(slide.slide_number), SAFE_M + 26, SAFE_M - 8);

        // Underline bar accent
        ctx.fillStyle = p.accent;
        const divX = isHero ? (CANVAS_W - 80) / 2 : SAFE_M;
        const divY = isHero ? CANVAS_H / 2 - 140 : CANVAS_H - SAFE_M - 260;
        ctx.fillRect(divX, divY, 80, 6);

        // Headline
        ctx.fillStyle = p.fg;
        const fontSize = isHero ? 72 : 56;
        ctx.font = `900 ${fontSize}px Inter, Arial, sans-serif`;
        ctx.textAlign = isHero ? "center" : (isAr ? "right" : "left");
        const hx = isHero ? CANVAS_W / 2 : (isAr ? CANVAS_W - SAFE_M : SAFE_M);
        const hy = isHero ? CANVAS_H / 2 - 60 : CANVAS_H - SAFE_M - 180;
        wrapText(ctx, slide.headline, hx, hy, CANVAS_W - SAFE_M * 2, fontSize * 1.12);

        // Supporting text
        ctx.fillStyle = p.muted;
        ctx.font = "400 26px Inter, Arial, sans-serif";
        const sy = isHero ? CANVAS_H / 2 + 60 : CANVAS_H - SAFE_M - 100;
        wrapText(ctx, slide.supporting_text, hx, sy, CANVAS_W - SAFE_M * 2 - 40, 36);

        // Footer
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = p.muted;
        ctx.font = "700 13px Inter, Arial, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("M. Mahafdhah", SAFE_M, CANVAS_H - 28);
        ctx.textAlign = "right";
        ctx.font = "400 11px Inter, Arial, sans-serif";
        ctx.fillText("SAVE ↗", CANVAS_W - SAFE_M, CANVAS_H - 28);
        ctx.globalAlpha = 1;

        pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, CANVAS_W, CANVAS_H);
      }

      pdf.save(`carousel-${lang}-${style}.pdf`);
      toast.success("Carousel PDF exported");
    } catch (e: any) {
      toast.error("Export failed: " + (e.message || "Unknown error"));
    } finally {
      setExporting(false);
    }
  };

  const copyCaption = () => {
    const full = caption + "\n\n" + hashtags.map(h => h.startsWith("#") ? h : `#${h}`).join(" ");
    navigator.clipboard.writeText(full);
    toast.success("Caption & hashtags copied");
  };

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setSlides({ en: [], ar: [] });
      setCurrentSlide(0);
      setEditingIdx(null);
      setGridView(false);
      setHasGenerated(false);
      setCaption("");
      setHashtags([]);
      setGeneratingVisuals(false);
      setVisualProgress(0);
      setVisualTotal(0);
    }, 300);
  };

  const imagesReady = currentSlides.filter(s => s.image_url).length;
  const imagesTotal = currentSlides.filter(s => s.image_prompt).length;

  return (
    <Sheet open={open} onOpenChange={v => !v && handleClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto bg-background/95 backdrop-blur-xl border-primary/10 p-0">
        {/* Header */}
        <div className="p-5 pb-0">
          <SheetHeader>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-amber-500/10 flex items-center justify-center border border-primary/10">
                <LayoutGrid className="w-4.5 h-4.5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <SheetTitle className="text-base font-bold text-foreground leading-tight">
                  LinkedIn Carousel
                </SheetTitle>
                <SheetDescription className="text-[10px] text-muted-foreground/50 mt-0.5">
                  {currentSlides.length} slides · {PALETTES[style].name} · {imagesReady}/{imagesTotal} visuals
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>
        </div>

        <div className="h-0.5 bg-gradient-to-r from-primary/40 via-amber-500/30 to-transparent mt-4" />

        <div className="px-4 sm:px-5 py-4 space-y-4 overflow-x-hidden">
          {/* Visual Generation Progress */}
          {generatingVisuals && (
            <div className="rounded-xl border border-primary/[0.12] bg-primary/[0.04] p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary animate-pulse" />
                <span className="text-xs font-semibold text-foreground">Generating slide visuals…</span>
                <span className="text-[10px] text-muted-foreground/60 ml-auto">{visualProgress}/{visualTotal}</span>
              </div>
              <Progress value={(visualProgress / Math.max(1, visualTotal)) * 100} className="h-1.5" />
            </div>
          )}

          {/* Controls Row */}
          <div className="flex flex-wrap gap-2">
            {/* Language Toggle */}
            <div className="flex rounded-lg border border-border/20 overflow-hidden">
              {(["en", "ar"] as Lang[]).map(l => (
                <button
                  key={l}
                  onClick={() => { setLang(l); setCurrentSlide(0); setEditingIdx(null); }}
                  className={`text-[10px] px-3 py-1.5 flex items-center gap-1 transition-colors min-h-[36px] ${
                    lang === l ? "bg-primary/15 text-primary font-semibold" : "text-muted-foreground/50 hover:text-foreground/70"
                  }`}
                >
                  <Globe className="w-3 h-3" />
                  {l === "en" ? "EN" : "AR"}
                  {loading[l] && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                </button>
              ))}
            </div>

            {/* Style Selector */}
            <div className="flex rounded-lg border border-border/20 overflow-hidden flex-wrap">
              {(Object.keys(PALETTES) as Style[]).map(s => (
                <button
                  key={s}
                  onClick={() => setStyle(s)}
                  className={`text-[10px] px-2.5 py-1.5 transition-colors min-h-[36px] whitespace-nowrap ${
                    style === s ? "bg-primary/15 text-primary font-semibold" : "text-muted-foreground/50 hover:text-foreground/70"
                  }`}
                >
                  {PALETTES[s].name}
                </button>
              ))}
            </div>

            {/* Grid toggle */}
            <button
              onClick={() => setGridView(!gridView)}
              className={`text-[10px] px-2.5 py-1.5 rounded-lg border transition-colors min-h-[36px] ${
                gridView ? "bg-primary/15 text-primary border-primary/20" : "border-border/20 text-muted-foreground/50"
              }`}
            >
              <LayoutGrid className="w-3 h-3" />
            </button>
          </div>

          {/* Content */}
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="w-5 h-5 text-primary/60 animate-spin" />
              <p className="text-xs text-muted-foreground/60">
                {lang === "ar" ? "جارٍ إنشاء الشرائح..." : "Generating carousel slides…"}
              </p>
            </div>
          ) : currentSlides.length > 0 ? (
            <>
              {gridView ? (
                <div className="grid grid-cols-2 gap-3">
                  {currentSlides.map((slide, idx) => (
                    <button
                      key={idx}
                      onClick={() => { setCurrentSlide(idx); setGridView(false); }}
                      className={`rounded-xl overflow-hidden border-2 transition-colors relative ${
                        currentSlide === idx ? "border-primary/40" : "border-transparent hover:border-primary/15"
                      }`}
                    >
                      <SlidePreview slide={slide} style={style} lang={lang} width={160} />
                      {!slide.image_url && slide.image_prompt && (
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center">
                          <ImageIcon className="w-3 h-3 text-amber-500/60" />
                        </div>
                      )}
                      {slide.image_url && (
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
                          <Check className="w-3 h-3 text-emerald-500" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Slide Preview */}
                  <div className="flex justify-center">
                    <div className="rounded-xl overflow-hidden shadow-2xl border border-primary/[0.08]">
                      <SlidePreview slide={currentSlides[currentSlide]} style={style} lang={lang} width={Math.min(380, window.innerWidth - 48)} />
                    </div>
                  </div>

                  {/* Navigation */}
                  <div className="flex items-center justify-center gap-3">
                    <Button size="sm" variant="ghost" onClick={() => setCurrentSlide(Math.max(0, currentSlide - 1))} disabled={currentSlide === 0} className="h-10 w-10 p-0">
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-xs text-muted-foreground/60 font-medium min-w-[60px] text-center">
                      {currentSlide + 1} / {currentSlides.length}
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => setCurrentSlide(Math.min(currentSlides.length - 1, currentSlide + 1))} disabled={currentSlide === currentSlides.length - 1} className="h-10 w-10 p-0">
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* Slide Editor */}
                  <div className="rounded-xl border border-primary/[0.08] bg-card/60 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-primary/[0.06]">
                      <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/40 font-semibold">
                        Slide {currentSlide + 1} · {(currentSlides[currentSlide].slide_type || "").replace(/_/g, " ")}
                      </p>
                      <div className="flex items-center gap-2">
                        {currentSlides[currentSlide].image_prompt && (
                          <button
                            onClick={() => regenerateSlideVisual(currentSlide)}
                            className="text-[10px] text-amber-500/70 hover:text-amber-500 flex items-center gap-1 transition-colors min-h-[36px]"
                            title="Regenerate visual"
                          >
                            <ImageIcon className="w-3 h-3" />
                            {currentSlides[currentSlide].image_url ? "Regen" : "Generate"}
                          </button>
                        )}
                        <button
                          onClick={() => setEditingIdx(editingIdx === currentSlide ? null : currentSlide)}
                          className="text-[10px] text-primary/60 hover:text-primary flex items-center gap-1 transition-colors min-h-[36px]"
                        >
                          {editingIdx === currentSlide ? <><Eye className="w-3 h-3" /> Preview</> : <><Pencil className="w-3 h-3" /> Edit</>}
                        </button>
                      </div>
                    </div>

                    {editingIdx === currentSlide ? (
                      <div className="p-4 space-y-3">
                        <div>
                          <label className="text-[10px] text-muted-foreground/40 uppercase tracking-wider font-semibold">Headline</label>
                          <Input
                            value={currentSlides[currentSlide].headline}
                            onChange={e => updateSlide(currentSlide, "headline", e.target.value)}
                            className="mt-1 text-sm"
                            dir={lang === "ar" ? "rtl" : "ltr"}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground/40 uppercase tracking-wider font-semibold">Supporting Text</label>
                          <Textarea
                            value={currentSlides[currentSlide].supporting_text}
                            onChange={e => updateSlide(currentSlide, "supporting_text", e.target.value)}
                            className="mt-1 text-sm min-h-[80px]"
                            dir={lang === "ar" ? "rtl" : "ltr"}
                          />
                        </div>
                        {currentSlides[currentSlide].image_prompt && (
                          <div>
                            <label className="text-[10px] text-muted-foreground/40 uppercase tracking-wider font-semibold">Image Prompt</label>
                            <Textarea
                              value={currentSlides[currentSlide].image_prompt || ""}
                              onChange={e => updateSlide(currentSlide, "image_prompt" as keyof Slide, e.target.value)}
                              className="mt-1 text-xs min-h-[60px] text-muted-foreground/70"
                            />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-4" dir={lang === "ar" ? "rtl" : "ltr"}>
                        <p className="text-sm font-bold text-foreground mb-1">{currentSlides[currentSlide].headline}</p>
                        <p className="text-xs text-muted-foreground/60 leading-relaxed">{currentSlides[currentSlide].supporting_text}</p>
                        {currentSlides[currentSlide].emphasis_words && currentSlides[currentSlide].emphasis_words!.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {currentSlides[currentSlide].emphasis_words!.map((w, i) => (
                              <span key={i} className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-semibold">
                                {w}
                              </span>
                            ))}
                          </div>
                        )}
                        {currentSlides[currentSlide].image_url && (
                          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-emerald-500/70">
                            <Check className="w-3 h-3" /> Visual generated
                          </div>
                        )}
                        {!currentSlides[currentSlide].image_url && currentSlides[currentSlide].image_prompt && (
                          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-amber-500/60">
                            <ImageIcon className="w-3 h-3" /> Visual pending
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Thumbnail strip */}
                  <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                    {currentSlides.map((slide, idx) => (
                      <button
                        key={idx}
                        onClick={() => { setCurrentSlide(idx); setEditingIdx(null); }}
                        className={`flex-shrink-0 rounded-md overflow-hidden border-2 transition-colors ${
                          currentSlide === idx ? "border-primary/50" : "border-transparent opacity-60 hover:opacity-100"
                        }`}
                      >
                        <SlidePreview slide={slide} style={style} lang={lang} width={48} />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* LinkedIn Caption & Hashtags */}
              {(caption || hashtags.length > 0) && (
                <div className="rounded-xl border border-primary/[0.08] bg-card/60 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-primary/[0.06]">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/40 font-semibold flex items-center gap-1.5">
                      <Hash className="w-3 h-3" /> Authority Package
                    </p>
                    <button onClick={copyCaption} className="text-[10px] text-primary/60 hover:text-primary flex items-center gap-1 transition-colors min-h-[36px]">
                      <Copy className="w-3 h-3" /> Copy All
                    </button>
                  </div>
                  <div className="p-4 space-y-3">
                    {caption && (
                      <div>
                        <label className="text-[9px] text-muted-foreground/40 uppercase tracking-wider font-semibold">LinkedIn Caption</label>
                        <Textarea
                          value={caption}
                          onChange={e => setCaption(e.target.value)}
                          className="mt-1 text-xs min-h-[100px] text-muted-foreground/80"
                        />
                      </div>
                    )}
                    {hashtags.length > 0 && (
                      <div>
                        <label className="text-[9px] text-muted-foreground/40 uppercase tracking-wider font-semibold">Hashtags</label>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {hashtags.map((h, i) => (
                            <span key={i} className="text-[10px] bg-primary/8 text-primary/70 px-2 py-0.5 rounded-full border border-primary/10">
                              {h.startsWith("#") ? h : `#${h}`}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button onClick={exportPDF} disabled={exporting} className="flex-1 text-xs min-h-[44px]">
                  {exporting ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Exporting…</> : <><Download className="w-3.5 h-3.5 mr-1.5" /> Export PDF</>}
                </Button>
                <Button size="sm" variant="outline" onClick={() => generate(lang)} disabled={isLoading} className="text-xs border-border/15 min-h-[44px]">
                  <RefreshCw className="w-3 h-3 mr-1.5" /> Regenerate
                </Button>
              </div>
            </>
          ) : (
            <div className="text-center py-16">
              <p className="text-xs text-muted-foreground/40">No carousel generated yet.</p>
              <Button size="sm" variant="outline" onClick={generateBoth} className="mt-3 text-xs min-h-[44px]">
                Generate Carousel
              </Button>
            </div>
          )}
        </div>

        <canvas ref={canvasRef} className="hidden" width={CANVAS_W} height={CANVAS_H} />
      </SheetContent>
    </Sheet>
  );
};

/* ── Canvas utilities ── */
function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(" ");
  let line = "";
  let cy = y;

  for (const word of words) {
    const testLine = line + (line ? " " : "") + word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, x, cy);
      line = word;
      cy += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) ctx.fillText(line, x, cy);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export default CarouselGenerator;
