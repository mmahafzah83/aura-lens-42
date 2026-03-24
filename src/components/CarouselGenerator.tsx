import { useState, useRef, useCallback } from "react";
import {
  Loader2, Globe, Download, RefreshCw, Pencil, Eye, ChevronLeft, ChevronRight,
  LayoutGrid, Crown, Check,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import jsPDF from "jspdf";

/* ── Types ──────────────────────────── */
interface Slide {
  slide_number: number;
  slide_type: string;
  headline: string;
  supporting_text: string;
  visual_type: string;
  layout_style: string;
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
const PALETTES: Record<Style, { bg: string; fg: string; accent: string; muted: string; name: string }> = {
  consulting: { bg: "#1E2761", fg: "#FFFFFF", accent: "#D4AF37", muted: "#CADCFC", name: "Consulting" },
  thought_leadership: { bg: "#0F0F0F", fg: "#FFFFFF", accent: "#F96167", muted: "#A0A0A0", name: "Thought Leadership" },
  minimal: { bg: "#FAFAFA", fg: "#1A1A1A", accent: "#065A82", muted: "#6B7280", name: "Minimal Strategic" },
};

/* ── Slide Renderer ──────────────────── */
const SlidePreview = ({
  slide, style, lang, size = 320,
}: { slide: Slide; style: Style; lang: Lang; size?: number }) => {
  const p = PALETTES[style];
  const isAr = lang === "ar";
  const scale = size / 1080;

  return (
    <div
      className="relative overflow-hidden flex-shrink-0"
      style={{ width: size, height: size, borderRadius: 12 }}
    >
      <div
        style={{
          width: 1080, height: 1080,
          transform: `scale(${scale})`, transformOrigin: "top left",
          backgroundColor: p.bg, color: p.fg,
          display: "flex", flexDirection: "column",
          justifyContent: slide.layout_style === "centered hero" ? "center" : "flex-end",
          padding: 80,
          direction: isAr ? "rtl" : "ltr",
          fontFamily: isAr ? "'Noto Sans Arabic', sans-serif" : "'Inter', sans-serif",
        }}
      >
        {/* Slide number badge */}
        <div style={{
          position: "absolute", top: 40, [isAr ? "right" : "left"]: 40,
          width: 56, height: 56, borderRadius: "50%",
          backgroundColor: p.accent, color: p.bg,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 24, fontWeight: 800,
        }}>
          {slide.slide_number}
        </div>

        {/* Slide type label */}
        <div style={{
          position: "absolute", top: 52, [isAr ? "left" : "right"]: 60,
          fontSize: 18, textTransform: "uppercase", letterSpacing: 4,
          color: p.muted, fontWeight: 600, opacity: 0.5,
        }}>
          {slide.slide_type}
        </div>

        {/* Accent line */}
        <div style={{
          width: 80, height: 5, backgroundColor: p.accent,
          marginBottom: 36, borderRadius: 3,
          [isAr ? "marginRight" : "marginLeft"]: slide.layout_style === "centered hero" ? "auto" : 0,
          ...(slide.layout_style === "centered hero" ? { marginLeft: "auto", marginRight: "auto" } : {}),
        }} />

        {/* Headline */}
        <h2 style={{
          fontSize: slide.slide_type === "hook" || slide.slide_type === "closing" ? 72 : 56,
          fontWeight: 800,
          lineHeight: 1.15,
          marginBottom: 28,
          textAlign: slide.layout_style === "centered hero" ? "center" : (isAr ? "right" : "left"),
          maxWidth: 900,
          ...(slide.layout_style === "centered hero" ? { marginLeft: "auto", marginRight: "auto" } : {}),
        }}>
          {slide.headline}
        </h2>

        {/* Supporting text */}
        <p style={{
          fontSize: 28,
          lineHeight: 1.6,
          color: p.muted,
          textAlign: slide.layout_style === "centered hero" ? "center" : (isAr ? "right" : "left"),
          maxWidth: 800,
          ...(slide.layout_style === "centered hero" ? { marginLeft: "auto", marginRight: "auto" } : {}),
        }}>
          {slide.supporting_text}
        </p>

        {/* Footer */}
        <div style={{
          position: "absolute", bottom: 36, left: 80, right: 80,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          fontSize: 16, color: p.muted, opacity: 0.4,
        }}>
          <span>M. Mahafdhah</span>
          <span>→ Share</span>
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

  /* Trigger generation on open */
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

  /* ── PDF Export using canvas rendering ── */
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

        // Background
        ctx.fillStyle = p.bg;
        ctx.fillRect(0, 0, 1080, 1080);

        // Slide number circle
        ctx.fillStyle = p.accent;
        ctx.beginPath();
        ctx.arc(68, 68, 28, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = p.bg;
        ctx.font = "bold 24px Inter, Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(String(slide.slide_number), 68, 76);

        // Accent line
        ctx.fillStyle = p.accent;
        const centered = slide.layout_style === "centered hero";
        const lineX = centered ? 500 : 80;
        ctx.fillRect(lineX, centered ? 380 : 780, 80, 5);

        // Headline
        ctx.fillStyle = p.fg;
        const fontSize = slide.slide_type === "hook" || slide.slide_type === "closing" ? 64 : 48;
        ctx.font = `800 ${fontSize}px Inter, Arial, sans-serif`;
        ctx.textAlign = centered ? "center" : (isAr ? "right" : "left");
        const hx = centered ? 540 : (isAr ? 1000 : 80);
        const hy = centered ? 480 : 840;
        wrapText(ctx, slide.headline, hx, hy, 900, fontSize * 1.2);

        // Supporting text
        ctx.fillStyle = p.muted;
        ctx.font = `400 26px Inter, Arial, sans-serif`;
        const sy = centered ? 580 : 920;
        wrapText(ctx, slide.supporting_text, hx, sy, 800, 36);

        // Footer
        ctx.fillStyle = p.muted;
        ctx.globalAlpha = 0.4;
        ctx.font = "400 16px Inter, Arial, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("M. Mahafdhah | Digital Transformation Architect", 80, 1050);
        ctx.textAlign = "right";
        ctx.fillText("→ Share this Carousel", 1000, 1050);
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

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setSlides({ en: [], ar: [] });
      setCurrentSlide(0);
      setEditingIdx(null);
      setGridView(false);
      setHasGenerated(false);
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
                /* Grid View */
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
                /* Single Slide View */
                <div className="space-y-3">
                  {/* Slide Preview */}
                  <div className="flex justify-center">
                    <div className="rounded-xl overflow-hidden shadow-2xl border border-primary/[0.08]">
                      <SlidePreview
                        slide={currentSlides[currentSlide]}
                        style={style}
                        lang={lang}
                        size={Math.min(480, 520)}
                      />
                    </div>
                  </div>

                  {/* Navigation */}
                  <div className="flex items-center justify-center gap-3">
                    <Button
                      size="sm" variant="ghost"
                      onClick={() => setCurrentSlide(Math.max(0, currentSlide - 1))}
                      disabled={currentSlide === 0}
                      className="h-8 w-8 p-0"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-xs text-muted-foreground/60 font-medium min-w-[60px] text-center">
                      {currentSlide + 1} / {currentSlides.length}
                    </span>
                    <Button
                      size="sm" variant="ghost"
                      onClick={() => setCurrentSlide(Math.min(currentSlides.length - 1, currentSlide + 1))}
                      disabled={currentSlide === currentSlides.length - 1}
                      className="h-8 w-8 p-0"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* Slide Editor */}
                  <div className="rounded-xl border border-primary/[0.08] bg-card/60 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-primary/[0.06]">
                      <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/40 font-semibold">
                        Slide {currentSlide + 1} · {currentSlides[currentSlide].slide_type}
                      </p>
                      <button
                        onClick={() => setEditingIdx(editingIdx === currentSlide ? null : currentSlide)}
                        className="text-[10px] text-primary/60 hover:text-primary flex items-center gap-1 transition-colors"
                      >
                        {editingIdx === currentSlide ? (
                          <><Eye className="w-3 h-3" /> Preview</>
                        ) : (
                          <><Pencil className="w-3 h-3" /> Edit</>
                        )}
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

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button
                  onClick={exportPDF}
                  disabled={exporting}
                  className="flex-1 bg-primary/15 text-primary hover:bg-primary/25 border border-primary/20 text-xs"
                >
                  {exporting ? (
                    <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Exporting…</>
                  ) : (
                    <><Download className="w-3.5 h-3.5 mr-1.5" /> Export PDF</>
                  )}
                </Button>
                <Button
                  size="sm" variant="outline"
                  onClick={() => generate(lang)}
                  disabled={isLoading}
                  className="text-xs border-border/15"
                >
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

        {/* Hidden canvas for PDF rendering */}
        <canvas ref={canvasRef} className="hidden" width={1080} height={1080} />
      </SheetContent>
    </Sheet>
  );
};

/* ── Canvas text wrapping utility ── */
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

export default CarouselGenerator;
