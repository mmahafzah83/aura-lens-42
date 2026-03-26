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
  layout: string;
  accent_element?: string | null;
  diagram_data?: DiagramData;
  image_prompt?: string;
  image_url?: string;
  // legacy compat
  visual_type?: string;
  layout_style?: string;
}

type Lang = "en" | "ar";
type Style = "consulting" | "thought_leadership" | "minimal";

interface CarouselGeneratorProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  context?: string;
}

/* ── Style Palettes ──────────────────── */
const PALETTES: Record<Style, {
  bg: string; fg: string; accent: string; muted: string; subtle: string;
  gradientFrom: string; gradientTo: string; name: string;
}> = {
  consulting: {
    bg: "#0F1A3E", fg: "#FFFFFF", accent: "#D4AF37", muted: "#8BA4CC",
    subtle: "#1A2B5E", gradientFrom: "#0F1A3E", gradientTo: "#1E2F6E", name: "Consulting",
  },
  thought_leadership: {
    bg: "#0A0A0A", fg: "#FFFFFF", accent: "#FF4D6A", muted: "#9CA3AF",
    subtle: "#1A1A1A", gradientFrom: "#0A0A0A", gradientTo: "#1A0A14", name: "Thought Leadership",
  },
  minimal: {
    bg: "#FAFAF9", fg: "#1A1A1A", accent: "#0D6E8A", muted: "#6B7280",
    subtle: "#F0EFED", gradientFrom: "#FAFAF9", gradientTo: "#F0F0EE", name: "Minimal Strategic",
  },
};

/* ── Diagram Renderer (inline SVG-like using divs) ── */
const DiagramOverlay = ({ data, palette, isAr }: { data: DiagramData; palette: typeof PALETTES.consulting; isAr: boolean }) => {
  const nodes = data.nodes || [];
  if (nodes.length === 0) return null;

  if (data.type === "sequential_flow") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "center", direction: isAr ? "rtl" : "ltr" }}>
        {nodes.map((n, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              padding: "12px 20px", borderRadius: 10, border: `2px solid ${palette.accent}`,
              backgroundColor: `${palette.accent}20`, color: palette.fg,
              fontSize: 18, fontWeight: 700, textAlign: "center", maxWidth: 160,
              backdropFilter: "blur(4px)",
            }}>{n}</div>
            {i < nodes.length - 1 && (
              <span style={{ fontSize: 24, color: palette.accent, fontWeight: 700 }}>→</span>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (data.type === "layered") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%", maxWidth: 500, margin: "0 auto" }}>
        {nodes.map((n, i) => (
          <div key={i} style={{
            padding: "14px 24px", borderRadius: 8,
            backgroundColor: `${palette.accent}${Math.max(15, 40 - i * 8).toString(16).padStart(2, "0")}`,
            border: `1.5px solid ${palette.accent}50`, color: palette.fg,
            fontSize: 18, fontWeight: 600, textAlign: "center",
            backdropFilter: "blur(4px)",
          }}>{n}</div>
        ))}
      </div>
    );
  }

  if (data.type === "circular") {
    const count = nodes.length;
    const radius = 120;
    return (
      <div style={{ position: "relative", width: 320, height: 320, margin: "0 auto" }}>
        {nodes.map((n, i) => {
          const angle = (2 * Math.PI * i) / count - Math.PI / 2;
          const x = 160 + radius * Math.cos(angle) - 55;
          const y = 160 + radius * Math.sin(angle) - 24;
          return (
            <div key={i} style={{
              position: "absolute", left: x, top: y, width: 110, height: 48,
              display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: 8, border: `2px solid ${palette.accent}`,
              backgroundColor: `${palette.accent}20`, color: palette.fg,
              fontSize: 13, fontWeight: 700, textAlign: "center", padding: "4px 6px",
              backdropFilter: "blur(4px)",
            }}>{n}</div>
          );
        })}
        <div style={{
          position: "absolute", left: 152, top: 152, width: 16, height: 16,
          borderRadius: "50%", backgroundColor: palette.accent,
        }} />
      </div>
    );
  }

  if (data.type === "grid_2x2") {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, maxWidth: 440, margin: "0 auto" }}>
        {nodes.slice(0, 4).map((n, i) => (
          <div key={i} style={{
            padding: "20px 16px", borderRadius: 10,
            border: `2px solid ${palette.accent}50`,
            backgroundColor: `${palette.accent}15`, color: palette.fg,
            fontSize: 16, fontWeight: 700, textAlign: "center",
            backdropFilter: "blur(4px)",
          }}>{n}</div>
        ))}
      </div>
    );
  }

  return null;
};

/* ── Layout-Aware Slide Renderer with Visual ──────────────────── */
const SlidePreview = ({
  slide, style, lang, size = 320,
}: { slide: Slide; style: Style; lang: Lang; size?: number }) => {
  const p = PALETTES[style];
  const isAr = lang === "ar";
  const scale = size / 1080;
  const layout = slide.layout || slide.layout_style || "hero_center";
  const slideType = slide.slide_type;
  const hasDiagram = slideType === "framework_visual" && slide.diagram_data;
  const hasImage = !!slide.image_url;

  const isHero = layout === "hero_center" || slideType === "hook" || slideType === "closing";
  const isQuote = layout === "quote_block";
  const isNumbered = layout === "numbered_point" || slideType === "framework_step";
  const isDiagram = layout === "diagram" || hasDiagram;

  return (
    <div className="relative overflow-hidden flex-shrink-0" style={{ width: size, height: size, borderRadius: 12 }}>
      <div style={{
        width: 1080, height: 1080,
        transform: `scale(${scale})`, transformOrigin: "top left",
        background: `linear-gradient(160deg, ${p.gradientFrom}, ${p.gradientTo})`,
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
            opacity: isHero ? 0.5 : 0.35,
          }} />
        )}

        {/* Dark overlay for text readability */}
        {hasImage && (
          <div style={{
            position: "absolute", inset: 0,
            background: isHero
              ? `linear-gradient(180deg, ${p.bg}80 0%, ${p.bg}CC 50%, ${p.bg}F0 100%)`
              : `linear-gradient(180deg, ${p.bg}40 0%, ${p.bg}BB 40%, ${p.bg}EE 100%)`,
          }} />
        )}

        {/* Visual indicator when no image yet */}
        {!hasImage && slide.image_prompt && (
          <div style={{
            position: "absolute", inset: 0,
            background: `radial-gradient(circle at 30% 30%, ${p.accent}08, transparent 70%), radial-gradient(circle at 70% 70%, ${p.accent}06, transparent 70%)`,
          }} />
        )}

        {/* Top accent bar */}
        <div style={{ height: 5, background: `linear-gradient(90deg, ${p.accent}, transparent)`, position: "relative", zIndex: 2 }} />

        {/* Slide number */}
        <div style={{
          position: "absolute", top: 40, [isAr ? "right" : "left"]: 44,
          width: 48, height: 48, borderRadius: 12,
          backgroundColor: p.accent, color: p.bg === "#FAFAF9" ? "#FFFFFF" : p.bg,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22, fontWeight: 800, zIndex: 3,
        }}>
          {slide.slide_number}
        </div>

        {/* Slide type label */}
        <div style={{
          position: "absolute", top: 52, [isAr ? "left" : "right"]: 52,
          fontSize: 14, textTransform: "uppercase", letterSpacing: 5,
          color: p.muted, fontWeight: 600, opacity: 0.4, zIndex: 3,
        }}>
          {(slideType || "").replace(/_/g, " ")}
        </div>

        {/* Main content area */}
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          justifyContent: hasImage && isHero ? "flex-end" : isHero ? "center" : isDiagram ? "flex-start" : "flex-end",
          padding: hasImage && isHero ? "80px 80px 160px" : isHero ? "100px 80px" : isDiagram ? "120px 80px 80px" : "80px 80px 120px",
          position: "relative", zIndex: 2,
        }}>
          {/* Quote mark for quote layout */}
          {isQuote && (
            <div style={{ fontSize: 120, lineHeight: 0.7, color: p.accent, opacity: 0.3, marginBottom: 20, fontFamily: "Georgia, serif" }}>
              "
            </div>
          )}

          {/* Number badge for framework steps */}
          {isNumbered && slide.slide_number >= 4 && slide.slide_number <= 6 && (
            <div style={{
              width: 72, height: 72, borderRadius: "50%",
              border: `3px solid ${p.accent}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 32, fontWeight: 800, color: p.accent,
              marginBottom: 28, backgroundColor: `${p.bg}90`,
              backdropFilter: "blur(8px)",
              ...(isHero ? { marginLeft: "auto", marginRight: "auto" } : {}),
            }}>
              {slide.slide_number - 3}
            </div>
          )}

          {/* Accent divider */}
          {!isQuote && !isNumbered && (
            <div style={{
              width: 60, height: 4, backgroundColor: p.accent, borderRadius: 2,
              marginBottom: 28,
              ...(isHero ? { marginLeft: "auto", marginRight: "auto" } : {}),
            }} />
          )}

          {/* Headline */}
          <h2 style={{
            fontSize: isHero ? 72 : isQuote ? 56 : 52,
            fontWeight: 800,
            lineHeight: 1.12,
            marginBottom: isDiagram ? 20 : 24,
            textAlign: isHero ? "center" : (isAr ? "right" : "left"),
            maxWidth: 920,
            letterSpacing: "-0.02em",
            textShadow: hasImage ? `0 2px 12px ${p.bg}80` : "none",
            ...(isHero ? { marginLeft: "auto", marginRight: "auto" } : {}),
          }}>
            {slide.headline}
          </h2>

          {/* Supporting text */}
          {!isDiagram && (
            <p style={{
              fontSize: isHero ? 28 : 26,
              lineHeight: 1.55,
              color: p.muted,
              textAlign: isHero ? "center" : (isAr ? "right" : "left"),
              maxWidth: 780,
              textShadow: hasImage ? `0 1px 8px ${p.bg}60` : "none",
              ...(isHero ? { marginLeft: "auto", marginRight: "auto" } : {}),
            }}>
              {slide.supporting_text}
            </p>
          )}

          {/* Diagram */}
          {isDiagram && slide.diagram_data && (
            <div style={{ marginTop: 32 }}>
              <DiagramOverlay data={slide.diagram_data} palette={p} isAr={isAr} />
              <p style={{
                fontSize: 20, color: p.muted, textAlign: "center",
                marginTop: 28, opacity: 0.6,
              }}>
                {slide.supporting_text}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          padding: "28px 52px", display: "flex", justifyContent: "space-between",
          alignItems: "center", fontSize: 15, color: p.muted, opacity: 0.35,
          borderTop: `1px solid ${p.muted}15`, zIndex: 3,
        }}>
          <span style={{ fontWeight: 600 }}>M. Mahafdhah</span>
          <span style={{ letterSpacing: 2, textTransform: "uppercase", fontSize: 12 }}>Share →</span>
        </div>
      </div>
    </div>
  );
};

/* ── Main Component ──────────────────── */
const CarouselGenerator = ({ open, onClose, title, description, context }: CarouselGeneratorProps) => {
  const [slides, setSlides] = useState<Record<Lang, Slide[]>>({ en: [], ar: [] });
  const [lang, setLang] = useState<Lang>("en");
  const [style, setStyle] = useState<Style>("consulting");
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
      // Small delay between requests to avoid rate limits
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

      // Auto-generate visuals after text generation
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

  /* ── Regenerate single slide visual ── */
  const regenerateSlideVisual = async (idx: number) => {
    const slide = currentSlides[idx];
    if (!slide?.image_prompt) return;

    // Clear existing image
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

  /* ── PDF Export ── */
  const exportPDF = async () => {
    if (currentSlides.length === 0) return;
    setExporting(true);

    try {
      const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [1080, 1080] });
      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1080;
      const ctx = canvas.getContext("2d")!;
      const p = PALETTES[style];
      const isAr = lang === "ar";

      for (let i = 0; i < currentSlides.length; i++) {
        if (i > 0) pdf.addPage([1080, 1080], "landscape");
        const slide = currentSlides[i];
        const layout = slide.layout || slide.layout_style || "hero_center";
        const isHero = layout === "hero_center" || slide.slide_type === "hook" || slide.slide_type === "closing";

        // Background gradient
        const grd = ctx.createLinearGradient(0, 0, 1080, 1080);
        grd.addColorStop(0, p.gradientFrom);
        grd.addColorStop(1, p.gradientTo);
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, 1080, 1080);

        // Draw background image if available
        if (slide.image_url) {
          try {
            const img = new Image();
            img.crossOrigin = "anonymous";
            await new Promise<void>((resolve, reject) => {
              img.onload = () => resolve();
              img.onerror = () => reject();
              img.src = slide.image_url!;
            });
            ctx.globalAlpha = isHero ? 0.5 : 0.35;
            ctx.drawImage(img, 0, 0, 1080, 1080);
            ctx.globalAlpha = 1;

            // Dark overlay for readability
            const overlayGrd = ctx.createLinearGradient(0, 0, 0, 1080);
            if (isHero) {
              overlayGrd.addColorStop(0, `${p.bg}80`);
              overlayGrd.addColorStop(0.5, `${p.bg}CC`);
              overlayGrd.addColorStop(1, `${p.bg}F0`);
            } else {
              overlayGrd.addColorStop(0, `${p.bg}40`);
              overlayGrd.addColorStop(0.4, `${p.bg}BB`);
              overlayGrd.addColorStop(1, `${p.bg}EE`);
            }
            ctx.fillStyle = overlayGrd;
            ctx.fillRect(0, 0, 1080, 1080);
          } catch {
            // Image failed to load, continue without it
          }
        }

        // Top accent bar
        const barGrd = ctx.createLinearGradient(0, 0, 1080, 0);
        barGrd.addColorStop(0, p.accent);
        barGrd.addColorStop(1, "transparent");
        ctx.fillStyle = barGrd;
        ctx.fillRect(0, 0, 1080, 5);

        // Slide number badge
        ctx.fillStyle = p.accent;
        roundRect(ctx, 44, 40, 48, 48, 12);
        ctx.fill();
        ctx.fillStyle = p.bg === "#FAFAF9" ? "#FFFFFF" : p.bg;
        ctx.font = "800 22px Inter, Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(String(slide.slide_number), 68, 72);

        // Accent divider
        ctx.fillStyle = p.accent;
        const divX = isHero ? 510 : 80;
        const divY = isHero ? 420 : 780;
        ctx.fillRect(divX, divY, 60, 4);

        // Headline
        ctx.fillStyle = p.fg;
        const fontSize = isHero ? 64 : 48;
        ctx.font = `800 ${fontSize}px Inter, Arial, sans-serif`;
        ctx.textAlign = isHero ? "center" : (isAr ? "right" : "left");
        const hx = isHero ? 540 : (isAr ? 1000 : 80);
        const hy = isHero ? 500 : 840;
        wrapText(ctx, slide.headline, hx, hy, 900, fontSize * 1.15);

        // Supporting text
        ctx.fillStyle = p.muted;
        ctx.font = "400 24px Inter, Arial, sans-serif";
        const sy = isHero ? 600 : 920;
        wrapText(ctx, slide.supporting_text, hx, sy, 800, 34);

        // Diagram rendering on canvas for framework_visual slides
        if (slide.slide_type === "framework_visual" && slide.diagram_data?.nodes) {
          const nodes = slide.diagram_data.nodes;
          const dtype = slide.diagram_data.type;
          ctx.textAlign = "center";

          if (dtype === "sequential_flow") {
            const total = nodes.length;
            const boxW = 160;
            const gap = 40;
            const totalW = total * boxW + (total - 1) * gap;
            let sx = (1080 - totalW) / 2;
            const sy2 = 500;
            for (let j = 0; j < total; j++) {
              ctx.strokeStyle = p.accent;
              ctx.lineWidth = 2;
              roundRect(ctx, sx, sy2, boxW, 60, 10);
              ctx.stroke();
              ctx.fillStyle = `${p.accent}25`;
              roundRect(ctx, sx, sy2, boxW, 60, 10);
              ctx.fill();
              ctx.fillStyle = p.fg;
              ctx.font = "700 18px Inter, Arial, sans-serif";
              ctx.fillText(nodes[j], sx + boxW / 2, sy2 + 36, boxW - 16);
              if (j < total - 1) {
                ctx.fillStyle = p.accent;
                ctx.font = "700 24px Inter, Arial, sans-serif";
                ctx.fillText("→", sx + boxW + gap / 2, sy2 + 36);
              }
              sx += boxW + gap;
            }
          } else if (dtype === "layered") {
            let ly = 440;
            for (let j = 0; j < nodes.length; j++) {
              const w = 600;
              const lx = (1080 - w) / 2;
              ctx.fillStyle = `${p.accent}${Math.max(10, 35 - j * 8).toString(16).padStart(2, "0")}`;
              roundRect(ctx, lx, ly, w, 52, 8);
              ctx.fill();
              ctx.strokeStyle = `${p.accent}50`;
              ctx.lineWidth = 1.5;
              roundRect(ctx, lx, ly, w, 52, 8);
              ctx.stroke();
              ctx.fillStyle = p.fg;
              ctx.font = "600 20px Inter, Arial, sans-serif";
              ctx.fillText(nodes[j], 540, ly + 33, w - 24);
              ly += 64;
            }
          } else if (dtype === "grid_2x2") {
            const boxSize = 200;
            const gapG = 20;
            const startX = (1080 - boxSize * 2 - gapG) / 2;
            const startY = 460;
            for (let j = 0; j < Math.min(4, nodes.length); j++) {
              const col = j % 2;
              const row = Math.floor(j / 2);
              const bx = startX + col * (boxSize + gapG);
              const by = startY + row * (boxSize + gapG);
              ctx.fillStyle = `${p.accent}12`;
              roundRect(ctx, bx, by, boxSize, boxSize, 12);
              ctx.fill();
              ctx.strokeStyle = `${p.accent}40`;
              ctx.lineWidth = 2;
              roundRect(ctx, bx, by, boxSize, boxSize, 12);
              ctx.stroke();
              ctx.fillStyle = p.fg;
              ctx.font = "700 20px Inter, Arial, sans-serif";
              ctx.fillText(nodes[j], bx + boxSize / 2, by + boxSize / 2 + 7, boxSize - 24);
            }
          }
        }

        // Footer
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = p.muted;
        ctx.font = "600 14px Inter, Arial, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("M. Mahafdhah", 52, 1050);
        ctx.textAlign = "right";
        ctx.font = "400 12px Inter, Arial, sans-serif";
        ctx.fillText("SHARE →", 1028, 1050);
        ctx.globalAlpha = 1;

        pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, 1080, 1080);
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
              <div className="flex-1">
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

        <div className="px-5 py-4 space-y-4">
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
                  className={`text-[10px] px-3 py-1.5 flex items-center gap-1 transition-colors ${
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
            <div className="flex rounded-lg border border-border/20 overflow-hidden">
              {(Object.keys(PALETTES) as Style[]).map(s => (
                <button
                  key={s}
                  onClick={() => setStyle(s)}
                  className={`text-[10px] px-2.5 py-1.5 transition-colors ${
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
              className={`text-[10px] px-2.5 py-1.5 rounded-lg border transition-colors ${
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
                      <SlidePreview slide={slide} style={style} lang={lang} size={240} />
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
                      <SlidePreview slide={currentSlides[currentSlide]} style={style} lang={lang} size={Math.min(480, 520)} />
                    </div>
                  </div>

                  {/* Navigation */}
                  <div className="flex items-center justify-center gap-3">
                    <Button size="sm" variant="ghost" onClick={() => setCurrentSlide(Math.max(0, currentSlide - 1))} disabled={currentSlide === 0} className="h-8 w-8 p-0">
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-xs text-muted-foreground/60 font-medium min-w-[60px] text-center">
                      {currentSlide + 1} / {currentSlides.length}
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => setCurrentSlide(Math.min(currentSlides.length - 1, currentSlide + 1))} disabled={currentSlide === currentSlides.length - 1} className="h-8 w-8 p-0">
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
                            className="text-[10px] text-amber-500/70 hover:text-amber-500 flex items-center gap-1 transition-colors"
                            title="Regenerate visual"
                          >
                            <ImageIcon className="w-3 h-3" />
                            {currentSlides[currentSlide].image_url ? "Regen" : "Generate"} Visual
                          </button>
                        )}
                        <button
                          onClick={() => setEditingIdx(editingIdx === currentSlide ? null : currentSlide)}
                          className="text-[10px] text-primary/60 hover:text-primary flex items-center gap-1 transition-colors"
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
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {currentSlides.map((slide, idx) => (
                      <button
                        key={idx}
                        onClick={() => { setCurrentSlide(idx); setEditingIdx(null); }}
                        className={`flex-shrink-0 rounded-md overflow-hidden border-2 transition-colors ${
                          currentSlide === idx ? "border-primary/50" : "border-transparent opacity-60 hover:opacity-100"
                        }`}
                      >
                        <SlidePreview slide={slide} style={style} lang={lang} size={56} />
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
                    <button onClick={copyCaption} className="text-[10px] text-primary/60 hover:text-primary flex items-center gap-1 transition-colors">
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
                <Button onClick={exportPDF} disabled={exporting} className="flex-1 text-xs">
                  {exporting ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Exporting…</> : <><Download className="w-3.5 h-3.5 mr-1.5" /> Export PDF</>}
                </Button>
                <Button size="sm" variant="outline" onClick={() => generate(lang)} disabled={isLoading} className="text-xs border-border/15">
                  <RefreshCw className="w-3 h-3 mr-1.5" /> Regenerate
                </Button>
              </div>
            </>
          ) : (
            <div className="text-center py-16">
              <p className="text-xs text-muted-foreground/40">No carousel generated yet.</p>
              <Button size="sm" variant="outline" onClick={generateBoth} className="mt-3 text-xs">
                Generate Carousel
              </Button>
            </div>
          )}
        </div>

        <canvas ref={canvasRef} className="hidden" width={1080} height={1080} />
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
