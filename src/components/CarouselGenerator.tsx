import { useState, useRef, useCallback } from "react";
import {
  Loader2, Globe, Download, RefreshCw, Pencil, Eye, ChevronLeft, ChevronRight,
  LayoutGrid, Check, Copy, Hash,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
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
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", justifyContent: "center", direction: isAr ? "rtl" : "ltr" }}>
        {nodes.map((n, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{
              padding: "16px 28px", borderRadius: 12, border: `2px solid ${palette.accent}`,
              backgroundColor: `${palette.accent}15`, color: palette.fg,
              fontSize: 22, fontWeight: 700, textAlign: "center", maxWidth: 200,
            }}>{n}</div>
            {i < nodes.length - 1 && (
              <span style={{ fontSize: 28, color: palette.accent, fontWeight: 700 }}>→</span>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (data.type === "layered") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", maxWidth: 700, margin: "0 auto" }}>
        {nodes.map((n, i) => (
          <div key={i} style={{
            padding: "18px 32px", borderRadius: 10,
            backgroundColor: `${palette.accent}${Math.max(10, 30 - i * 6).toString(16).padStart(2, "0")}`,
            border: `1.5px solid ${palette.accent}40`, color: palette.fg,
            fontSize: 22, fontWeight: 600, textAlign: "center",
          }}>{n}</div>
        ))}
      </div>
    );
  }

  if (data.type === "circular") {
    const count = nodes.length;
    const radius = 160;
    return (
      <div style={{ position: "relative", width: 400, height: 400, margin: "0 auto" }}>
        {nodes.map((n, i) => {
          const angle = (2 * Math.PI * i) / count - Math.PI / 2;
          const x = 200 + radius * Math.cos(angle) - 70;
          const y = 200 + radius * Math.sin(angle) - 30;
          return (
            <div key={i} style={{
              position: "absolute", left: x, top: y, width: 140, height: 60,
              display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: 10, border: `2px solid ${palette.accent}`,
              backgroundColor: `${palette.accent}18`, color: palette.fg,
              fontSize: 16, fontWeight: 700, textAlign: "center", padding: "4px 8px",
            }}>{n}</div>
          );
        })}
        {/* Center dot */}
        <div style={{
          position: "absolute", left: 190, top: 190, width: 20, height: 20,
          borderRadius: "50%", backgroundColor: palette.accent,
        }} />
      </div>
    );
  }

  if (data.type === "grid_2x2") {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, maxWidth: 600, margin: "0 auto" }}>
        {nodes.slice(0, 4).map((n, i) => (
          <div key={i} style={{
            padding: "24px 20px", borderRadius: 12,
            border: `2px solid ${palette.accent}40`,
            backgroundColor: `${palette.accent}10`, color: palette.fg,
            fontSize: 20, fontWeight: 700, textAlign: "center",
          }}>{n}</div>
        ))}
      </div>
    );
  }

  return null;
};

/* ── Layout-Aware Slide Renderer ──────────────────── */
const SlidePreview = ({
  slide, style, lang, size = 320,
}: { slide: Slide; style: Style; lang: Lang; size?: number }) => {
  const p = PALETTES[style];
  const isAr = lang === "ar";
  const scale = size / 1080;
  const layout = slide.layout || slide.layout_style || "hero_center";
  const slideType = slide.slide_type;
  const hasDiagram = slideType === "framework_visual" && slide.diagram_data;

  const isHero = layout === "hero_center" || slideType === "hook" || slideType === "closing";
  const isQuote = layout === "quote_block";
  const isNumbered = layout === "numbered_point" || slideType === "framework_step";
  const isSplit = layout === "split_insight";
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
        {/* Top accent bar */}
        <div style={{ height: 5, background: `linear-gradient(90deg, ${p.accent}, transparent)` }} />

        {/* Slide number */}
        <div style={{
          position: "absolute", top: 40, [isAr ? "right" : "left"]: 44,
          width: 48, height: 48, borderRadius: 12,
          backgroundColor: p.accent, color: p.bg === "#FAFAF9" ? "#FFFFFF" : p.bg,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22, fontWeight: 800,
        }}>
          {slide.slide_number}
        </div>

        {/* Slide type label */}
        <div style={{
          position: "absolute", top: 52, [isAr ? "left" : "right"]: 52,
          fontSize: 14, textTransform: "uppercase", letterSpacing: 5,
          color: p.muted, fontWeight: 600, opacity: 0.4,
        }}>
          {(slideType || "").replace(/_/g, " ")}
        </div>

        {/* Main content area */}
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          justifyContent: isHero ? "center" : isDiagram ? "flex-start" : "flex-end",
          padding: isHero ? "100px 80px" : isDiagram ? "120px 80px 80px" : "80px 80px 120px",
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
              marginBottom: 28,
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

          {/* Split layout accent block */}
          {isSplit && (
            <div style={{
              marginTop: 32, padding: "24px 32px", borderRadius: 12,
              backgroundColor: `${p.accent}12`, borderLeft: `4px solid ${p.accent}`,
            }}>
              <p style={{ fontSize: 22, color: p.fg, opacity: 0.8, lineHeight: 1.5 }}>
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
          borderTop: `1px solid ${p.muted}15`,
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
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const currentSlides = slides[lang];
  const isLoading = loading[lang];

  const generate = useCallback(async (targetLang: Lang) => {
    setLoading(prev => ({ ...prev, [targetLang]: true }));
    try {
      const { data, error } = await supabase.functions.invoke("generate-carousel", {
        body: { title, description, context, style, lang: targetLang },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSlides(prev => ({ ...prev, [targetLang]: data.slides || [] }));
      if (data.linkedin_caption) setCaption(data.linkedin_caption);
      if (data.hashtags) setHashtags(data.hashtags);
      if (targetLang === lang) setCurrentSlide(0);
    } catch (e: any) {
      toast.error(e.message || "Failed to generate carousel");
    } finally {
      setLoading(prev => ({ ...prev, [targetLang]: false }));
    }
  }, [title, description, context, style, lang]);

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
    }, 300);
  };

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
                  {currentSlides.length} slides · {PALETTES[style].name}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>
        </div>

        <div className="h-0.5 bg-gradient-to-r from-primary/40 via-amber-500/30 to-transparent mt-4" />

        <div className="px-5 py-4 space-y-4">
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
                      className={`rounded-xl overflow-hidden border-2 transition-colors ${
                        currentSlide === idx ? "border-primary/40" : "border-transparent hover:border-primary/15"
                      }`}
                    >
                      <SlidePreview slide={slide} style={style} lang={lang} size={240} />
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
                      <button
                        onClick={() => setEditingIdx(editingIdx === currentSlide ? null : currentSlide)}
                        className="text-[10px] text-primary/60 hover:text-primary flex items-center gap-1 transition-colors"
                      >
                        {editingIdx === currentSlide ? <><Eye className="w-3 h-3" /> Preview</> : <><Pencil className="w-3 h-3" /> Edit</>}
                      </button>
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
                      </div>
                    ) : (
                      <div className="p-4" dir={lang === "ar" ? "rtl" : "ltr"}>
                        <p className="text-sm font-bold text-foreground mb-1">{currentSlides[currentSlide].headline}</p>
                        <p className="text-xs text-muted-foreground/60 leading-relaxed">{currentSlides[currentSlide].supporting_text}</p>
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
                <Button onClick={exportPDF} disabled={exporting} className="flex-1 bg-primary/15 text-primary hover:bg-primary/25 border border-primary/20 text-xs">
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
