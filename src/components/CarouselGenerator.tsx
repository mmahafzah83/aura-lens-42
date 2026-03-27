import { useState, useRef, useCallback } from "react";
import {
  Loader2, Globe, Download, RefreshCw, Pencil, Eye, ChevronLeft, ChevronRight,
  LayoutGrid, Check, Copy, Hash, ImageIcon, Sparkles, Layers, ArrowRight,
  Lightbulb, Target, PenLine, Linkedin, Share2, User, Briefcase, Zap, Camera,
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

interface FrameworkVisual {
  concept: string;
  type: "PHOTO" | "INFOGRAPHIC";
}

interface Framework {
  id: string;
  name: string;
  description: string;
  steps: string[];
  diagram_type: "sequential_flow" | "layered" | "circular" | "grid_2x2";
  key_visuals: FrameworkVisual[];
}

interface TopicAnalysis {
  core_challenge: string;
  strategic_insight: string;
  transformation_theme: string;
  target_audience: string;
}

type PipelineStep = "input" | "frameworks" | "carousel" | "visuals";

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
const VISUAL_REQUEST_DELAY_MS = 2000;
const VISUAL_RETRY_DELAYS_MS = [4000, 8000] as const;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
  const isHero = layout === "hero_center" || layout === "closing_centered";
  const isQuote = layout === "quote_block";
  const isNumbered = layout === "numbered_point";
  const isStat = layout === "stat_callout";
  const isLeft = layout === "left_impact";
  const isRight = layout === "right_impact";
  const isSplit = layout === "split_vertical";
  const isInfographic = layout === "infographic";
  const isCTA = layout === "closing_centered" || slideType === "cta";
  const isFrameworkStep = slideType === "framework_step" || slideType === "framework";

  // Determine text alignment based on layout
  const getTextAlign = (): string => {
    if (isHero || isStat || isCTA) return "center";
    if (isRight) return isAr ? "left" : "right";
    return isAr ? "right" : "left";
  };
  const textAlign = getTextAlign();

  // Determine content vertical position based on layout
  const getJustify = (): string => {
    if (isHero || isStat || isCTA) return "center";
    if (isLeft || isRight) return "center";
    return "flex-end";
  };

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
          flex: 1, display: "flex",
          flexDirection: isSplit ? "row" : "column",
          justifyContent: getJustify(),
          alignItems: isSplit ? "center" : undefined,
          padding: `${SAFE_M + 40}px ${SAFE_M}px ${isCTA ? SAFE_M + 180 : SAFE_M + 60}px`,
          position: "relative", zIndex: 2,
          gap: 20,
        }}>
          {/* Quote mark for quote layout */}
          {isQuote && <VisualAnchor type="quote_mark" palette={p} />}

          {/* Stat callout — large number */}
          {isStat && slide.pattern_interrupt && (
            <div style={{
              fontSize: 120, fontWeight: 900, color: p.accent,
              textAlign: "center", lineHeight: 1, marginBottom: 8,
            }}>
              {slide.pattern_interrupt}
            </div>
          )}

          {/* Numbered point badge */}
          {isNumbered && isFrameworkStep && (
            <div style={{
              width: 80, height: 80, borderRadius: "50%",
              border: `3px solid ${p.accent}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 36, fontWeight: 900, color: p.accent,
              backgroundColor: `${p.accent}10`,
              ...(isHero ? { marginLeft: "auto", marginRight: "auto" } : {}),
            }}>
              {slide.slide_number >= 6 && slide.slide_number <= 8 ? slide.slide_number - 5 : slide.slide_number}
            </div>
          )}

          {/* Visual anchor (before headline) */}
          {!isQuote && !isNumbered && !isStat && slide.visual_anchor !== "arrow_down" && (
            <VisualAnchor type={slide.visual_anchor || "underline_bar"} palette={p} />
          )}

          {/* Pattern interrupt (non-stat) */}
          {slide.pattern_interrupt && !isStat && (
            <div style={{
              fontSize: 32, fontWeight: 900, letterSpacing: 6,
              textTransform: "uppercase", color: p.accent,
              textAlign: textAlign as any,
              marginBottom: 8,
            }}>
              {slide.pattern_interrupt}
            </div>
          )}

          {/* Split layout — left column */}
          {isSplit ? (
            <>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 16 }}>
                <HighlightedHeadline
                  text={slide.headline}
                  emphasisWords={slide.emphasis_words}
                  palette={p}
                  fontSize={52}
                  textAlign={isAr ? "right" : "left"}
                  isAr={isAr}
                />
              </div>
              <div style={{
                width: 2, backgroundColor: `${p.accent}30`,
                alignSelf: "stretch", margin: "0 16px",
              }} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <p style={{
                  fontSize: 26, lineHeight: 1.6, color: p.muted, fontWeight: 400,
                  textAlign: "justify" as any,
                  margin: 0,
                }}>
                  {slide.supporting_text}
                </p>
              </div>
            </>
          ) : (
            <>
              {/* Headline with emphasis highlighting */}
              <HighlightedHeadline
                text={slide.headline}
                emphasisWords={slide.emphasis_words}
                palette={p}
                fontSize={isHero || isCTA ? 76 : isStat ? 56 : 60}
                textAlign={textAlign}
                isAr={isAr}
              />

              {/* Supporting text */}
              {!hasDiagram && slide.supporting_text && !isCTA && (
                <p style={{
                  fontSize: 28, lineHeight: 1.6,
                  color: p.muted, fontWeight: 400,
                  textAlign: isHero || isStat ? "center" : "justify" as any,
                  maxWidth: 800,
                  margin: 0,
                  ...(isHero ? { marginLeft: "auto", marginRight: "auto" } : {}),
                }}>
                  {slide.supporting_text}
                </p>
              )}
            </>
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

        {/* CTA Authority Branding Block */}
        {isCTA && (
          <div style={{
            position: "absolute", bottom: SAFE_M + 20, left: SAFE_M, right: SAFE_M,
            display: "flex", flexDirection: "column", alignItems: "center",
            gap: 16, zIndex: 3,
          }}>
            {/* Divider line */}
            <div style={{
              width: 80, height: 2,
              background: `linear-gradient(90deg, transparent, ${p.accent}, transparent)`,
            }} />

            {/* Name with icon */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: "50%",
                background: `linear-gradient(135deg, ${p.accent}30, ${p.accent}10)`,
                border: `1.5px solid ${p.accent}40`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, color: p.accent,
              }}>👤</div>
              <div style={{
                fontSize: 26, fontWeight: 800, color: p.fg, textAlign: "center",
                letterSpacing: "0.02em",
              }}>
                M. Mahafzah
              </div>
            </div>

            {/* Role line with icon */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14, color: p.accent }}>💼</span>
              <div style={{
                fontSize: 16, color: p.muted, textAlign: "center", lineHeight: 1.4,
              }}>
                Strategy | Digital & Business Transformation
              </div>
            </div>

            {/* Focus area */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14, color: p.accent }}>⚡</span>
              <div style={{
                fontSize: 15, color: p.accent, textAlign: "center", fontWeight: 700,
                letterSpacing: "0.05em",
              }}>
                Focus on Utilities & Power
              </div>
            </div>

            {/* Spacer */}
            <div style={{ height: 6 }} />

            {/* LinkedIn link */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "8px 20px", borderRadius: 20,
              backgroundColor: `${p.accent}12`, border: `1px solid ${p.accent}25`,
            }}>
              <span style={{ fontSize: 14, color: p.accent }}>🔗</span>
              <span style={{
                fontSize: 14, color: p.accent, fontWeight: 600,
              }}>linkedin.com/in/mmahafzah</span>
            </div>

            {/* Repost CTA */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              marginTop: 4,
            }}>
              <span style={{ fontSize: 16, color: p.muted, opacity: 0.6 }}>↻</span>
              <span style={{
                fontSize: 15, color: p.muted, opacity: 0.7, fontWeight: 500,
              }}>Repost if this was helpful</span>
            </div>
          </div>
        )}

        {/* Footer (non-CTA) */}
        {!isCTA && (
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0,
            padding: `24px ${SAFE_M}px`, display: "flex", justifyContent: "space-between",
            alignItems: "center", fontSize: 14, color: p.muted, opacity: 0.3,
            borderTop: `1px solid ${p.muted}15`, zIndex: 3,
          }}>
            <span style={{ fontWeight: 700, letterSpacing: 1 }}>M. Mahafzah</span>
            <span style={{ letterSpacing: 3, textTransform: "uppercase", fontSize: 11 }}>Save ↗</span>
          </div>
        )}
      </div>
    </div>
  );
};

/* ── Main Component ──────────────────── */
const CarouselGenerator = ({ open, onClose, title, description, context }: CarouselGeneratorProps) => {
  const [pipelineStep, setPipelineStep] = useState<PipelineStep>("input");
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

  // Framework pipeline state
  const [topicAnalysis, setTopicAnalysis] = useState<TopicAnalysis | null>(null);
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [selectedFramework, setSelectedFramework] = useState<Framework | null>(null);
  const [generatingFrameworks, setGeneratingFrameworks] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);

  const currentSlides = slides[lang];
  const isLoading = loading[lang];

  const invokeSlideVisual = useCallback(async (slide: Slide) => {
    let lastMessage = "Failed to generate visual";
    for (let attempt = 0; attempt <= VISUAL_RETRY_DELAYS_MS.length; attempt++) {
      const { data, error } = await supabase.functions.invoke("generate-slide-visual", {
        body: { image_prompt: slide.image_prompt, slide_number: slide.slide_number, style },
      });
      if (!error && data?.image_url) return data.image_url as string;
      const status = (error as any)?.context?.status ?? (error as any)?.status;
      const message = data?.error || error?.message || "Failed to generate visual";
      const normalized = String(message).toLowerCase();
      const shouldRetry = status === 429 || normalized.includes("rate limit") || normalized.includes("no image generated");
      lastMessage = message;
      if (shouldRetry && attempt < VISUAL_RETRY_DELAYS_MS.length) { await sleep(VISUAL_RETRY_DELAYS_MS[attempt]); continue; }
      throw new Error(message);
    }
    throw new Error(lastMessage);
  }, [style]);

  /* ── Step 1-3: Generate frameworks ── */
  const generateFrameworksStep = useCallback(async () => {
    setGeneratingFrameworks(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-frameworks", {
        body: { title, description, context, lang },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data.topic_analysis) setTopicAnalysis(data.topic_analysis);
      if (data.frameworks) { setFrameworks(data.frameworks); setSelectedFramework(null); }
      setPipelineStep("frameworks");
    } catch (e: any) {
      toast.error(e.message || "Failed to generate frameworks");
    } finally {
      setGeneratingFrameworks(false);
    }
  }, [title, description, context, lang]);

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
        const imageUrl = await invokeSlideVisual(slide);
        setSlides(prev => ({
          ...prev,
          [targetLang]: prev[targetLang].map(s =>
            s.slide_number === slide.slide_number ? { ...s, image_url: imageUrl } : s
          ),
        }));
      } catch (e: any) {
        console.warn(`Failed to generate visual for slide ${slide.slide_number}:`, e);
      }
      setVisualProgress(i + 1);
      if (i < slidesWithPrompts.length - 1) await sleep(VISUAL_REQUEST_DELAY_MS);
    }
    setGeneratingVisuals(false);
    toast.success("Slide visuals generated");
  }, [invokeSlideVisual]);

  /* ── Generate carousel (Step 6) ── */
  const generate = useCallback(async (targetLang: Lang) => {
    setLoading(prev => ({ ...prev, [targetLang]: true }));
    try {
      const { data, error } = await supabase.functions.invoke("generate-carousel", {
        body: {
          title, description, context, style, lang: targetLang,
          selected_framework: selectedFramework ? {
            name: selectedFramework.name,
            description: selectedFramework.description,
            steps: selectedFramework.steps,
            diagram_type: selectedFramework.diagram_type,
          } : undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const newSlides = data.slides || [];
      setSlides(prev => ({ ...prev, [targetLang]: newSlides }));
      if (data.linkedin_caption) setCaption(data.linkedin_caption);
      if (data.hashtags) setHashtags(data.hashtags);
      if (targetLang === lang) setCurrentSlide(0);
      setPipelineStep("carousel");
    } catch (e: any) {
      toast.error(e.message || "Failed to generate carousel");
    } finally {
      setLoading(prev => ({ ...prev, [targetLang]: false }));
    }
  }, [title, description, context, style, lang, selectedFramework, generateVisuals]);

  // Auto-start pipeline on open
  if (open && title && !hasStarted) {
    setHasStarted(true);
    setTimeout(() => generateFrameworksStep(), 0);
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
      const imageUrl = await invokeSlideVisual(slide);
      if (imageUrl) {
        setSlides(prev => ({
          ...prev,
          [lang]: prev[lang].map((s, i) => i === idx ? { ...s, image_url: imageUrl } : s),
        }));
        toast.success(`Slide ${idx + 1} visual regenerated`);
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to regenerate visual");
    }
  };

  /* ── PDF Export (1080×1350) — Layout-Aware ── */
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
        const slideType = slide.slide_type || "";
        const isHero = layout === "hero_center" || layout === "closing_centered";
        const isCta = layout === "closing_centered" || slideType === "cta";
        const isStat = layout === "stat_callout";
        const isQuote = layout === "quote_block";
        const isNumbered = layout === "numbered_point";
        const isLeft = layout === "left_impact";
        const isRight = layout === "right_impact";
        const isSplitL = layout === "split_vertical";
        const isInfographicL = layout === "infographic";

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
          } catch { /* Image failed to load */ }
        }

        // Top accent bar
        const barGrd = ctx.createLinearGradient(0, 0, CANVAS_W, 0);
        barGrd.addColorStop(0, p.accent);
        barGrd.addColorStop(0.5, `${p.accent}40`);
        barGrd.addColorStop(1, "transparent");
        ctx.fillStyle = barGrd;
        ctx.fillRect(0, 0, CANVAS_W, 5);

        // Slide number badge
        const badgeX = isAr ? CANVAS_W - SAFE_M - 52 : SAFE_M;
        ctx.fillStyle = p.accent;
        roundRect(ctx, badgeX, SAFE_M - 40, 52, 52, 14);
        ctx.fill();
        ctx.fillStyle = style === "minimal_creator" ? "#FFFFFF" : p.bg;
        ctx.font = "900 24px Inter, Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(String(slide.slide_number), badgeX + 26, SAFE_M - 8);

        // Slide type label
        ctx.fillStyle = p.muted;
        ctx.globalAlpha = 0.3;
        ctx.font = "700 12px Inter, Arial, sans-serif";
        ctx.textAlign = isAr ? "left" : "right";
        const labelX = isAr ? SAFE_M : CANVAS_W - SAFE_M;
        ctx.fillText((slideType).replace(/_/g, " ").toUpperCase(), labelX, SAFE_M - 18);
        ctx.globalAlpha = 1;

        // Content area
        const contentTop = SAFE_M + 60;
        const contentBottom = isCta ? CANVAS_H - SAFE_M - 220 : CANVAS_H - SAFE_M - 80;
        const contentH = contentBottom - contentTop;
        const textX = SAFE_M;
        const textW = CANVAS_W - SAFE_M * 2;

        // Layout-specific rendering
        if (isStat && slide.pattern_interrupt) {
          ctx.fillStyle = p.accent;
          ctx.font = "900 120px Inter, Arial, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(slide.pattern_interrupt, CANVAS_W / 2, contentTop + contentH * 0.35);
          ctx.fillStyle = p.fg;
          ctx.font = "900 56px Inter, Arial, sans-serif";
          drawHeadlineWithEmphasis(ctx, slide.headline, slide.emphasis_words || [], CANVAS_W / 2, contentTop + contentH * 0.55, textW, 64, p, "center");
          ctx.fillStyle = p.muted;
          ctx.font = "400 26px Inter, Arial, sans-serif";
          ctx.textAlign = "center";
          wrapText(ctx, slide.supporting_text, CANVAS_W / 2, contentTop + contentH * 0.72, textW - 60, 36);
        } else if (isQuote) {
          ctx.fillStyle = p.accent;
          ctx.globalAlpha = 0.25;
          ctx.font = "400 160px Georgia, serif";
          ctx.textAlign = isAr ? "right" : "left";
          ctx.fillText("\u201C", isAr ? CANVAS_W - SAFE_M : SAFE_M, contentTop + contentH * 0.35);
          ctx.globalAlpha = 1;
          ctx.fillStyle = p.fg;
          ctx.font = "900 56px Inter, Arial, sans-serif";
          const qAlign = isAr ? "right" : "left";
          const qHx = isAr ? CANVAS_W - SAFE_M : SAFE_M;
          drawHeadlineWithEmphasis(ctx, slide.headline, slide.emphasis_words || [], qHx, contentTop + contentH * 0.5, textW, 64, p, qAlign);
          ctx.fillStyle = p.muted;
          ctx.font = "400 26px Inter, Arial, sans-serif";
          ctx.textAlign = qAlign as CanvasTextAlign;
          wrapText(ctx, slide.supporting_text, qHx, contentTop + contentH * 0.7, textW - 40, 36);
        } else if (isNumbered) {
          const circY = contentTop + contentH * 0.25;
          const circX = isHero ? CANVAS_W / 2 : (isAr ? CANVAS_W - SAFE_M - 40 : SAFE_M + 40);
          ctx.beginPath();
          ctx.arc(circX, circY, 40, 0, Math.PI * 2);
          ctx.strokeStyle = p.accent;
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.fillStyle = `${p.accent}10`;
          ctx.fill();
          ctx.fillStyle = p.accent;
          ctx.font = "900 36px Inter, Arial, sans-serif";
          ctx.textAlign = "center";
          const stepNum = slide.slide_number >= 6 && slide.slide_number <= 8 ? slide.slide_number - 5 : slide.slide_number;
          ctx.fillText(String(stepNum), circX, circY + 13);
          ctx.fillStyle = p.fg;
          ctx.font = "900 56px Inter, Arial, sans-serif";
          const nAlign = isAr ? "right" : "left";
          const nHx = isAr ? CANVAS_W - SAFE_M : SAFE_M;
          drawHeadlineWithEmphasis(ctx, slide.headline, slide.emphasis_words || [], nHx, contentTop + contentH * 0.5, textW, 64, p, nAlign);
          ctx.fillStyle = p.muted;
          ctx.font = "400 26px Inter, Arial, sans-serif";
          ctx.textAlign = nAlign as CanvasTextAlign;
          wrapText(ctx, slide.supporting_text, nHx, contentTop + contentH * 0.7, textW - 40, 36);
        } else if (isSplitL) {
          const midX = CANVAS_W / 2;
          ctx.strokeStyle = `${p.accent}30`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(midX, contentTop + 40);
          ctx.lineTo(midX, contentBottom - 40);
          ctx.stroke();
          ctx.fillStyle = p.fg;
          ctx.font = "900 48px Inter, Arial, sans-serif";
          const sLeftAlign = isAr ? "right" : "left";
          const sLeftX = isAr ? midX - 30 : SAFE_M;
          ctx.textAlign = sLeftAlign as CanvasTextAlign;
          drawHeadlineWithEmphasis(ctx, slide.headline, slide.emphasis_words || [], sLeftX, contentTop + contentH * 0.4, midX - SAFE_M - 40, 56, p, sLeftAlign);
          ctx.fillStyle = p.muted;
          ctx.font = "400 26px Inter, Arial, sans-serif";
          const sRightAlign = isAr ? "right" : "left";
          const sRightX = isAr ? CANVAS_W - SAFE_M : midX + 30;
          ctx.textAlign = sRightAlign as CanvasTextAlign;
          wrapText(ctx, slide.supporting_text, sRightX, contentTop + contentH * 0.4, midX - SAFE_M - 40, 36);
        } else if (isLeft || isRight) {
          const align = isRight ? (isAr ? "left" : "right") : (isAr ? "right" : "left");
          const hx = align === "right" ? CANVAS_W - SAFE_M : SAFE_M;
          ctx.fillStyle = p.accent;
          const barX2 = align === "right" ? CANVAS_W - SAFE_M - 80 : SAFE_M;
          ctx.fillRect(barX2, contentTop + contentH * 0.32, 80, 6);
          if (slide.pattern_interrupt) {
            ctx.fillStyle = p.accent;
            ctx.font = "900 28px Inter, Arial, sans-serif";
            ctx.textAlign = align as CanvasTextAlign;
            ctx.fillText(slide.pattern_interrupt, hx, contentTop + contentH * 0.4);
          }
          ctx.fillStyle = p.fg;
          ctx.font = "900 60px Inter, Arial, sans-serif";
          drawHeadlineWithEmphasis(ctx, slide.headline, slide.emphasis_words || [], hx, contentTop + contentH * 0.5, textW * 0.75, 68, p, align);
          ctx.fillStyle = p.muted;
          ctx.font = "400 26px Inter, Arial, sans-serif";
          ctx.textAlign = align as CanvasTextAlign;
          wrapText(ctx, slide.supporting_text, hx, contentTop + contentH * 0.72, textW * 0.75, 36);
        } else if (isInfographicL) {
          ctx.fillStyle = p.fg;
          ctx.font = "900 48px Inter, Arial, sans-serif";
          const iAlign = isAr ? "right" : "left";
          const iHx = isAr ? CANVAS_W - SAFE_M : SAFE_M;
          drawHeadlineWithEmphasis(ctx, slide.headline, slide.emphasis_words || [], iHx, contentTop + contentH * 0.18, textW, 56, p, iAlign);
          if (slide.diagram_data?.nodes?.length) {
            const nodes = slide.diagram_data.nodes;
            const dType = slide.diagram_data.type;
            if (dType === "sequential_flow") {
              const stepH = 52;
              const gap = 16;
              const startY = contentTop + contentH * 0.35;
              nodes.forEach((n, ni) => {
                const ny = startY + ni * (stepH + gap);
                ctx.strokeStyle = p.accent;
                ctx.lineWidth = 2;
                roundRect(ctx, SAFE_M + 40, ny, textW - 80, stepH, 12);
                ctx.stroke();
                ctx.fillStyle = `${p.accent}15`;
                roundRect(ctx, SAFE_M + 40, ny, textW - 80, stepH, 12);
                ctx.fill();
                ctx.fillStyle = p.fg;
                ctx.font = "800 20px Inter, Arial, sans-serif";
                ctx.textAlign = "center";
                ctx.fillText(n, CANVAS_W / 2, ny + 33);
                if (ni < nodes.length - 1) {
                  ctx.fillStyle = p.accent;
                  ctx.font = "700 28px Inter, Arial, sans-serif";
                  ctx.fillText("↓", CANVAS_W / 2, ny + stepH + 12);
                }
              });
            } else if (dType === "layered") {
              const startY2 = contentTop + contentH * 0.35;
              nodes.forEach((n, ni) => {
                const ny = startY2 + ni * 56;
                const alpha = Math.max(12, 35 - ni * 6);
                ctx.fillStyle = `${p.accent}${alpha.toString(16).padStart(2, "0")}`;
                roundRect(ctx, SAFE_M + 20, ny, textW - 40, 46, 10);
                ctx.fill();
                ctx.strokeStyle = `${p.accent}40`;
                ctx.lineWidth = 1.5;
                roundRect(ctx, SAFE_M + 20, ny, textW - 40, 46, 10);
                ctx.stroke();
                ctx.fillStyle = p.fg;
                ctx.font = "700 20px Inter, Arial, sans-serif";
                ctx.textAlign = "center";
                ctx.fillText(n, CANVAS_W / 2, ny + 30);
              });
            } else if (dType === "grid_2x2") {
              const gStartY = contentTop + contentH * 0.38;
              const cellW = (textW - 60) / 2;
              const cellH = 80;
              nodes.slice(0, 4).forEach((n, ni) => {
                const col = ni % 2;
                const row = Math.floor(ni / 2);
                const cx = SAFE_M + 10 + col * (cellW + 20);
                const cy = gStartY + row * (cellH + 16);
                ctx.strokeStyle = `${p.accent}40`;
                ctx.lineWidth = 2;
                roundRect(ctx, cx, cy, cellW, cellH, 12);
                ctx.stroke();
                ctx.fillStyle = `${p.accent}10`;
                roundRect(ctx, cx, cy, cellW, cellH, 12);
                ctx.fill();
                ctx.fillStyle = p.fg;
                ctx.font = "800 18px Inter, Arial, sans-serif";
                ctx.textAlign = "center";
                ctx.fillText(n, cx + cellW / 2, cy + cellH / 2 + 6);
              });
            }
          }
          ctx.fillStyle = p.muted;
          ctx.font = "400 24px Inter, Arial, sans-serif";
          ctx.textAlign = isAr ? "right" : "left";
          wrapText(ctx, slide.supporting_text, isAr ? CANVAS_W - SAFE_M : SAFE_M, contentTop + contentH * 0.85, textW - 40, 32);
        } else {
          // Hero center / default
          ctx.fillStyle = p.accent;
          const divX = isHero ? (CANVAS_W - 80) / 2 : SAFE_M;
          const divY = isHero ? contentTop + contentH * 0.3 : contentTop + contentH * 0.35;
          ctx.fillRect(divX, divY, 80, 6);
          if (slide.pattern_interrupt && !isStat) {
            ctx.fillStyle = p.accent;
            ctx.font = "900 32px Inter, Arial, sans-serif";
            ctx.textAlign = isHero ? "center" : (isAr ? "right" : "left");
            const piX = isHero ? CANVAS_W / 2 : (isAr ? CANVAS_W - SAFE_M : SAFE_M);
            ctx.fillText(slide.pattern_interrupt, piX, divY + 50);
          }
          ctx.fillStyle = p.fg;
          const fontSize = isHero || isCta ? 72 : 56;
          ctx.font = `900 ${fontSize}px Inter, Arial, sans-serif`;
          const hAlign = isHero ? "center" : (isAr ? "right" : "left");
          const hx = isHero ? CANVAS_W / 2 : (isAr ? CANVAS_W - SAFE_M : SAFE_M);
          const hy = isHero ? contentTop + contentH * 0.45 : contentTop + contentH * 0.5;
          drawHeadlineWithEmphasis(ctx, slide.headline, slide.emphasis_words || [], hx, hy, textW, fontSize * 1.12, p, hAlign);
          if (!isCta) {
            ctx.fillStyle = p.muted;
            ctx.font = "400 26px Inter, Arial, sans-serif";
            ctx.textAlign = hAlign as CanvasTextAlign;
            const sy = isHero ? contentTop + contentH * 0.65 : contentTop + contentH * 0.72;
            wrapText(ctx, slide.supporting_text, hx, sy, textW - 40, 36);
          }
          if (slide.visual_anchor === "arrow_down") {
            ctx.fillStyle = p.accent;
            ctx.font = "400 48px Inter, Arial, sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("↓", CANVAS_W / 2, contentTop + contentH * 0.82);
          }
        }

        // CTA Authority Branding
        if (isCta) {
          const ctaY = CANVAS_H - SAFE_M - 260;

          // Divider
          const divGrd = ctx.createLinearGradient(CANVAS_W / 2 - 40, 0, CANVAS_W / 2 + 40, 0);
          divGrd.addColorStop(0, "transparent");
          divGrd.addColorStop(0.5, p.accent);
          divGrd.addColorStop(1, "transparent");
          ctx.fillStyle = divGrd;
          ctx.fillRect(CANVAS_W / 2 - 40, ctaY, 80, 2);

          // Avatar circle
          ctx.beginPath();
          ctx.arc(CANVAS_W / 2 - 80, ctaY + 40, 18, 0, Math.PI * 2);
          ctx.fillStyle = `${p.accent}25`;
          ctx.fill();
          ctx.strokeStyle = `${p.accent}40`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.fillStyle = p.accent;
          ctx.font = "400 18px Inter, Arial, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("👤", CANVAS_W / 2 - 80, ctaY + 46);

          // Name
          ctx.textAlign = "left";
          ctx.fillStyle = p.fg;
          ctx.font = "800 26px Inter, Arial, sans-serif";
          ctx.fillText("M. Mahafzah", CANVAS_W / 2 - 50, ctaY + 46);

          // Role
          ctx.fillStyle = p.muted;
          ctx.font = "400 16px Inter, Arial, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("💼  Strategy | Digital & Business Transformation", CANVAS_W / 2, ctaY + 86);

          // Focus
          ctx.fillStyle = p.accent;
          ctx.font = "700 15px Inter, Arial, sans-serif";
          ctx.fillText("⚡  Focus on Utilities & Power", CANVAS_W / 2, ctaY + 120);

          // LinkedIn pill
          roundRect(ctx, CANVAS_W / 2 - 130, ctaY + 148, 260, 36, 18);
          ctx.fillStyle = `${p.accent}12`;
          ctx.fill();
          ctx.strokeStyle = `${p.accent}25`;
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.fillStyle = p.accent;
          ctx.font = "600 14px Inter, Arial, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("🔗  linkedin.com/in/mmahafzah", CANVAS_W / 2, ctaY + 172);

          // Repost
          ctx.fillStyle = p.muted;
          ctx.globalAlpha = 0.7;
          ctx.font = "500 15px Inter, Arial, sans-serif";
          ctx.fillText("↻  Repost if this was helpful", CANVAS_W / 2, ctaY + 214);
          ctx.globalAlpha = 1;
        }

        // Footer (non-CTA)
        if (!isCta) {
          ctx.globalAlpha = 0.3;
          ctx.fillStyle = p.muted;
          ctx.font = "700 13px Inter, Arial, sans-serif";
          ctx.textAlign = isAr ? "right" : "left";
          ctx.fillText("M. Mahafzah", isAr ? CANVAS_W - SAFE_M : SAFE_M, CANVAS_H - 28);
          ctx.textAlign = isAr ? "left" : "right";
          ctx.font = "400 11px Inter, Arial, sans-serif";
          ctx.fillText("SAVE ↗", isAr ? SAFE_M : CANVAS_W - SAFE_M, CANVAS_H - 28);
          ctx.globalAlpha = 1;
        }

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
      setHasStarted(false);
      setCaption("");
      setHashtags([]);
      setGeneratingVisuals(false);
      setVisualProgress(0);
      setVisualTotal(0);
      setPipelineStep("input");
      setTopicAnalysis(null);
      setFrameworks([]);
      setSelectedFramework(null);
    }, 300);
  };

  const imagesReady = currentSlides.filter(s => s.image_url).length;
  const imagesTotal = currentSlides.filter(s => s.image_prompt).length;

  /* ── Pipeline Step Indicator ── */
  const pipelineSteps: { key: PipelineStep; label: string; icon: typeof Lightbulb }[] = [
    { key: "input", label: "Analysis", icon: Lightbulb },
    { key: "frameworks", label: "Framework", icon: Layers },
    { key: "carousel", label: "Carousel", icon: LayoutGrid },
    { key: "visuals", label: "Visuals", icon: Camera },
  ];
  const stepOrder: PipelineStep[] = ["input", "frameworks", "carousel", "visuals"];
  const currentStepIdx = stepOrder.indexOf(pipelineStep);

  const canNavigateTo = (targetStep: PipelineStep): boolean => {
    const targetIdx = stepOrder.indexOf(targetStep);
    if (targetIdx >= currentStepIdx) return false; // can only go back
    if (targetStep === "input") return false; // can't go back to loading
    if (targetStep === "frameworks") return frameworks.length > 0;
    if (targetStep === "carousel") return currentSlides.length > 0;
    return false;
  };

  const StepIndicator = () => (
    <div className="flex items-center gap-1 px-1">
      {pipelineSteps.map((step, i) => {
        const isActive = pipelineStep === step.key;
        const stepIdx = stepOrder.indexOf(step.key);
        const isDone = stepIdx < currentStepIdx;
        const canClick = canNavigateTo(step.key);
        const Icon = step.icon;
        return (
          <div key={step.key} className="flex items-center gap-1">
            {i > 0 && <ArrowRight className="w-3 h-3 text-muted-foreground/20" />}
            <button
              onClick={() => canClick && setPipelineStep(step.key)}
              disabled={!canClick}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors ${
                isActive ? "bg-primary/15 text-primary" : isDone ? "text-primary/60 hover:text-primary hover:bg-primary/8 cursor-pointer" : "text-muted-foreground/30 cursor-default"
              }`}
            >
              {isDone ? <Check className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
              {step.label}
            </button>
          </div>
        );
      })}
    </div>
  );

  /* ── Framework Selection UI ── */
  const FrameworkSelectionPanel = () => (
    <div className="space-y-4">
      {/* Topic Analysis Summary */}
      {topicAnalysis && (
        <div className="rounded-xl border border-primary/[0.08] bg-card/60 p-4 space-y-3">
          <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/40 font-semibold flex items-center gap-1.5">
            <Lightbulb className="w-3 h-3" /> Topic Analysis
          </p>
          <div className="space-y-2">
            <div>
              <span className="text-[9px] text-muted-foreground/50 uppercase tracking-wider">Challenge</span>
              <p className="text-xs text-foreground/80">{topicAnalysis.core_challenge}</p>
            </div>
            <div>
              <span className="text-[9px] text-muted-foreground/50 uppercase tracking-wider">Strategic Insight</span>
              <p className="text-xs text-foreground/80">{topicAnalysis.strategic_insight}</p>
            </div>
            <div>
              <span className="text-[9px] text-muted-foreground/50 uppercase tracking-wider">Transformation Theme</span>
              <p className="text-xs text-foreground/80">{topicAnalysis.transformation_theme}</p>
            </div>
          </div>
        </div>
      )}

      {/* Framework Cards */}
      <div className="space-y-3">
        <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/40 font-semibold flex items-center gap-1.5">
          <Layers className="w-3 h-3" /> Select a Framework
        </p>
        {frameworks.map((fw) => (
          <button
            key={fw.id}
            onClick={() => setSelectedFramework(fw)}
            className={`w-full text-left rounded-xl border p-4 transition-all ${
              selectedFramework?.id === fw.id
                ? "border-primary/40 bg-primary/[0.06] ring-1 ring-primary/20"
                : "border-border/20 bg-card/40 hover:border-primary/20 hover:bg-card/60"
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                selectedFramework?.id === fw.id ? "bg-primary/20" : "bg-muted/20"
              }`}>
                <Target className={`w-4 h-4 ${selectedFramework?.id === fw.id ? "text-primary" : "text-muted-foreground/50"}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground">{fw.name}</p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">{fw.description}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {fw.steps.map((step, si) => (
                    <div key={si} className="flex items-center gap-1">
                      <span className="text-[9px] bg-primary/8 text-primary/70 px-1.5 py-0.5 rounded font-medium">
                        {si + 1}. {step}
                      </span>
                      {si < fw.steps.length - 1 && <ArrowRight className="w-2.5 h-2.5 text-muted-foreground/20" />}
                    </div>
                  ))}
                </div>
                <span className="text-[9px] text-muted-foreground/40 mt-1.5 block capitalize">
                  {(fw.diagram_type || "").replace(/_/g, " ")} diagram
                </span>
              </div>
              {selectedFramework?.id === fw.id && (
                <Check className="w-4 h-4 text-primary flex-shrink-0 mt-1" />
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 pt-2">
        <Button
          onClick={() => generate(lang)}
          disabled={!selectedFramework || isLoading}
          className="flex-1 text-xs min-h-[44px]"
        >
          {isLoading ? (
            <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Generating…</>
          ) : (
            <><PenLine className="w-3.5 h-3.5 mr-1.5" /> Generate Carousel</>
          )}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={generateFrameworksStep}
          disabled={generatingFrameworks}
          className="text-xs border-border/15 min-h-[44px]"
        >
          <RefreshCw className={`w-3 h-3 mr-1.5 ${generatingFrameworks ? "animate-spin" : ""}`} />
          Regenerate
        </Button>
      </div>

      {/* Skip framework - generate directly */}
      <button
        onClick={() => generate(lang)}
        disabled={isLoading}
        className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground/60 w-full text-center py-1 transition-colors"
      >
        Skip framework selection → generate directly
      </button>
    </div>
  );

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
                  {pipelineStep === "visuals"
                    ? `${imagesReady}/${imagesTotal} visuals generated`
                    : pipelineStep === "carousel"
                    ? `${currentSlides.length} slides · ${PALETTES[style].name}`
                    : pipelineStep === "frameworks"
                    ? `${frameworks.length} frameworks generated`
                    : "Analyzing topic…"
                  }
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>
        </div>

        <div className="h-0.5 bg-gradient-to-r from-primary/40 via-amber-500/30 to-transparent mt-4" />

        {/* Pipeline Step Indicator */}
        <div className="px-4 pt-3 pb-1">
          <StepIndicator />
        </div>

        <div className="px-4 sm:px-5 py-4 space-y-4 overflow-x-hidden">



          {/* ═══ STEP: Generating Frameworks ═══ */}
          {(pipelineStep === "input" || generatingFrameworks) && (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="w-5 h-5 text-primary/60 animate-spin" />
              <p className="text-xs text-muted-foreground/60">
                {lang === "ar" ? "جارٍ تحليل الموضوع وإنشاء الأطر..." : "Analyzing topic & generating frameworks…"}
              </p>
            </div>
          )}

          {/* ═══ STEP: Framework Selection ═══ */}
          {pipelineStep === "frameworks" && !generatingFrameworks && (
            <>
              {/* Language Toggle */}
              <div className="flex flex-wrap gap-2">
                <div className="flex rounded-lg border border-border/20 overflow-hidden">
                  {(["en", "ar"] as Lang[]).map(l => (
                    <button
                      key={l}
                      onClick={() => { setLang(l); }}
                      className={`text-[10px] px-3 py-1.5 flex items-center gap-1 transition-colors min-h-[36px] ${
                        lang === l ? "bg-primary/15 text-primary font-semibold" : "text-muted-foreground/50 hover:text-foreground/70"
                      }`}
                    >
                      <Globe className="w-3 h-3" />
                      {l === "en" ? "EN" : "AR"}
                    </button>
                  ))}
                </div>
              </div>
              <FrameworkSelectionPanel />
            </>
          )}

          {/* ═══ STEP: Carousel View ═══ */}
          {pipelineStep === "carousel" && (
            <>
              {/* Controls Row */}
              <div className="flex flex-wrap gap-2">
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
                      <div className="flex justify-center">
                        <div className="rounded-xl overflow-hidden shadow-2xl border border-primary/[0.08]">
                          <SlidePreview slide={currentSlides[currentSlide]} style={style} lang={lang} width={Math.min(380, window.innerWidth - 48)} />
                        </div>
                      </div>

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
                    <Button onClick={() => { setPipelineStep("visuals"); }} className="flex-1 text-xs min-h-[44px]">
                      <Camera className="w-3.5 h-3.5 mr-1.5" /> Generate Visuals →
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => generate(lang)} disabled={isLoading} className="text-xs border-border/15 min-h-[44px]">
                      <RefreshCw className="w-3 h-3 mr-1.5" /> Regenerate
                    </Button>
                  </div>
                </>
              ) : (
                <div className="text-center py-16">
                  <p className="text-xs text-muted-foreground/40">No carousel generated yet.</p>
                  <Button size="sm" variant="outline" onClick={() => generate(lang)} className="mt-3 text-xs min-h-[44px]">
                    Generate Carousel
                  </Button>
                </div>
              )}
            </>
          )}

          {/* ═══ STEP: Visuals ═══ */}
          {pipelineStep === "visuals" && (
            <>
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

              {/* Slide visual status grid */}
              <div className="space-y-3">
                <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/40 font-semibold flex items-center gap-1.5">
                  <Camera className="w-3 h-3" /> Slide Visuals
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {currentSlides.map((slide, idx) => (
                    <div
                      key={idx}
                      className={`rounded-xl border p-3 space-y-2 ${
                        slide.image_url
                          ? "border-emerald-500/20 bg-emerald-500/[0.04]"
                          : slide.image_prompt
                          ? "border-amber-500/20 bg-amber-500/[0.04]"
                          : "border-border/10 bg-card/30"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-foreground/80">Slide {slide.slide_number}</span>
                        {slide.image_url ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        ) : slide.image_prompt ? (
                          <ImageIcon className="w-3.5 h-3.5 text-amber-500/60" />
                        ) : null}
                      </div>
                      <p className="text-[9px] text-muted-foreground/50 line-clamp-2">
                        {slide.image_prompt ? slide.image_prompt.substring(0, 80) + "…" : "No visual prompt"}
                      </p>
                      {slide.image_url && (
                        <img src={slide.image_url} alt={`Slide ${slide.slide_number}`} className="w-full h-20 object-cover rounded-lg" />
                      )}
                      {slide.image_prompt && (
                        <button
                          onClick={() => regenerateSlideVisual(idx)}
                          className="text-[10px] text-primary/60 hover:text-primary flex items-center gap-1 transition-colors"
                        >
                          <RefreshCw className="w-3 h-3" />
                          {slide.image_url ? "Regenerate" : "Generate"}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button
                  onClick={() => generateVisuals(lang, currentSlides)}
                  disabled={generatingVisuals}
                  className="flex-1 text-xs min-h-[44px]"
                >
                  {generatingVisuals ? (
                    <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Generating…</>
                  ) : (
                    <><Sparkles className="w-3.5 h-3.5 mr-1.5" /> Generate All Visuals</>
                  )}
                </Button>
                <Button onClick={exportPDF} disabled={exporting} variant="outline" className="text-xs border-border/15 min-h-[44px]">
                  {exporting ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Exporting…</> : <><Download className="w-3.5 h-3.5 mr-1.5" /> Export PDF</>}
                </Button>
              </div>

              {/* Skip visuals */}
              <button
                onClick={exportPDF}
                disabled={exporting}
                className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground/60 w-full text-center py-1 transition-colors"
              >
                Skip visuals → export PDF directly
              </button>
            </>
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

function drawHeadlineWithEmphasis(
  ctx: CanvasRenderingContext2D,
  text: string,
  emphasisWords: string[],
  x: number, y: number,
  maxWidth: number, lineHeight: number,
  p: { emphBg: string; emphFg: string; fg: string },
  align: string,
) {
  if (!emphasisWords || emphasisWords.length === 0) {
    ctx.textAlign = align as CanvasTextAlign;
    wrapText(ctx, text, x, y, maxWidth, lineHeight);
    return;
  }

  const lowerEmph = emphasisWords.map(w => w.toLowerCase());
  const words = text.split(" ");
  let line: { text: string; highlight: boolean }[][] = [[]];
  let testStr = "";

  for (const word of words) {
    const test = testStr + (testStr ? " " : "") + word;
    if (ctx.measureText(test).width > maxWidth && testStr) {
      line.push([]);
      testStr = word;
    } else {
      testStr = test;
    }
    const isEmph = lowerEmph.includes(word.toLowerCase().replace(/[.,!?;:]/g, ""));
    line[line.length - 1].push({ text: word, highlight: isEmph });
  }

  ctx.textAlign = "left";
  const savedFont = ctx.font;

  line.forEach((lineWords, li) => {
    const cy = y + li * lineHeight;
    const fullLine = lineWords.map(w => w.text).join(" ");
    const lineW = ctx.measureText(fullLine).width;
    let startX: number;
    if (align === "center") startX = x - lineW / 2;
    else if (align === "right") startX = x - lineW;
    else startX = x;

    let cx = startX;
    lineWords.forEach((w) => {
      const wordW = ctx.measureText(w.text).width;
      if (w.highlight) {
        ctx.fillStyle = p.emphBg;
        roundRect(ctx, cx - 6, cy - lineHeight * 0.7, wordW + 12, lineHeight * 0.9, 4);
        ctx.fill();
        ctx.fillStyle = p.emphFg;
      } else {
        ctx.fillStyle = p.fg;
      }
      ctx.font = savedFont;
      ctx.textAlign = "left";
      ctx.fillText(w.text, cx, cy);
      cx += wordW + ctx.measureText(" ").width;
    });
  });

  ctx.font = savedFont;
}

export default CarouselGenerator;
