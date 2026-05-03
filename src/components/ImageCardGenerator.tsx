import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Download, Image as ImageIcon, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import html2canvas from "html2canvas";

/* Arabic font: load Cairo once on first mount */
const CAIRO_FONT_ID = "aura-cairo-font";
function ensureCairoFont() {
  if (typeof document === "undefined") return;
  if (document.getElementById(CAIRO_FONT_ID)) return;
  const link = document.createElement("link");
  link.id = CAIRO_FONT_ID;
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap";
  document.head.appendChild(link);
}

/* Brand fonts: Cormorant Garamond (display) + DM Sans (body) */
const BRAND_FONT_ID = "aura-brand-fonts";
function ensureBrandFonts() {
  if (typeof document === "undefined") return;
  if (document.getElementById(BRAND_FONT_ID)) return;
  const link = document.createElement("link");
  link.id = BRAND_FONT_ID;
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=DM+Sans:wght@400;500;600;700&display=swap";
  document.head.appendChild(link);
}

/* Aura Premium design tokens (applied to all infographic cards) */
const AURA = {
  surface: "#111118",
  surfaceAlt: "#161620",
  text: "#FFFFFF",
  textMuted: "rgba(255,255,255,0.6)",
  textFaint: "rgba(255,255,255,0.5)",
  textDim: "rgba(255,255,255,0.4)",
  brand: "#B08D3A",
  brandLine: "rgba(176,141,58,0.30)",
  brandFaint: "rgba(176,141,58,0.20)",
  brandWatermark: "rgba(176,141,58,0.25)",
  display: "'Cormorant Garamond', Georgia, serif",
  body: "'DM Sans', system-ui, sans-serif",
  arabic: "'Cairo', sans-serif",
};

const AR_REGEX = /[\u0600-\u06FF]/;
const isArabicText = (s: string | undefined | null) => !!s && AR_REGEX.test(s);
const ARABIC_FONT = "'Cairo', sans-serif";

type CardStyle =
  | "manifesto"
  | "newspaper"
  | "tension_split"
  | "bold_quote"
  | "dark_editorial"
  | "contrast_framework"
  | "minimal_dark"
  | "statement_light"
  | "data_point"
  | "arabic";

type ContentVariant = "hook" | "stat" | "lines" | "quote";

const VARIANT_ORDER: ContentVariant[] = ["hook", "stat", "lines", "quote"];

/* Universal text truncation for html2canvas (CSS clamp is invisible to it) */
function trunc(text: string, maxChars: number): string {
  if (!text) return "";
  const clean = text.trim();
  if (clean.length <= maxChars) return clean;
  const cut = clean.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return cut.slice(0, lastSpace > maxChars * 0.5 ? lastSpace : maxChars) + "…";
}

interface ImageCardGeneratorProps {
  postText: string;
  topicLabel: string;
  lang: "en" | "ar";
  userName?: string;
  userRole?: string;
}

/* ── Extraction helpers ── */

function extractHook(text: string): string {
  const clean = text.replace(/\*\*/g, "").replace(/\*/g, "").trim();
  const sentences = clean.split(/(?<=[.!?])\s+/).filter((s) => s.length > 10);
  const first = sentences[0] || clean;
  return first.length > 120 ? first.slice(0, 117) + "..." : first;
}

function extractTag(topicLabel: string): string {
  const words = topicLabel.trim().split(/\s+/);
  return words.slice(0, 5).join(" ");
}

function extractLines(text: string): string[] {
  return text
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function extractStat(text: string): { stat: string; context: string; hasStat: boolean } {
  const clean = text.replace(/\*\*/g, "").replace(/\*/g, "");
  const match = clean.match(/(\d+(?:\.\d+)?(?:M|B|K|%|\+|x)?)/);
  if (match) {
    const idx = clean.indexOf(match[0]);
    const before = clean.slice(Math.max(0, idx - 30), idx).trim();
    const after = clean.slice(idx + match[0].length, idx + match[0].length + 60).trim();
    const context = (before + " " + match[0] + " " + after).trim();
    const firstWord = context.split(/\s+/)[0];
    const contextClean = /^[a-z]/.test(firstWord) ? context.replace(/^\S+\s/, "") : context;
    return { stat: match[0], context: contextClean, hasStat: true };
  }
  const lineCount = clean.split(/\n/).filter((l) => l.trim().length > 20).length;
  return {
    stat: String(Math.min(lineCount || 3, 9)),
    context: "key insights from this analysis",
    hasStat: false,
  };
}

function extractQuote(text: string): string {
  const clean = text.replace(/\*\*/g, "").replace(/\*/g, "");
  const sentences = clean.split(/(?<=[.!?])\s+/).filter((s) => s.length > 20);
  return sentences[0]?.trim() || clean.slice(0, 120);
}

/* ── Card style metadata ── */

const STYLE_META: { key: CardStyle; label: string }[] = [
  { key: "manifesto", label: "Manifesto" },
  { key: "newspaper", label: "Newspaper" },
  { key: "tension_split", label: "Tension" },
  { key: "bold_quote", label: "Bold Quote" },
  { key: "dark_editorial", label: "Editorial" },
  { key: "contrast_framework", label: "Framework" },
  { key: "minimal_dark", label: "Minimal" },
  { key: "statement_light", label: "Statement" },
  { key: "data_point", label: "Data Point" },
  { key: "arabic", label: "Arabic" },
];

const CARD_W = 355;
const CARD_H = 444;

interface CardProps {
  tag: string;
  hookText: string;
  editName: string;
  editRole: string;
  lines: string[];
  statValue: string;
  statContext: string;
  quoteText: string;
  frameTitle: string;
  framePoints: string[];
  hasStat: boolean;
  bodyFontSize: number;
  titleFontSize: number;
  headerFontSize: number;
  accentColor: string;
  cardFont: string;
  preset: { bg: string; text: string; tagCol: string; roleCol: string };
  ledeText: string;
  bodyText: string;
  isArabic: boolean;
}

const BODY_SIZES = { xs: 12, s: 14, m: 17, l: 20, xl: 23 } as const;
const TITLE_SIZES = { xs: 11, s: 13, m: 16, l: 19, xl: 22 } as const;
const HEADER_SIZES = { xs: 7, s: 9, m: 11, l: 13, xl: 15 } as const;

type CardStyleConfig = {
  bodySize: "xs" | "s" | "m" | "l" | "xl";
  titleSize: "xs" | "s" | "m" | "l" | "xl";
  headerSize: "xs" | "s" | "m" | "l" | "xl";
  accentColor: string;
  cardFont: string;
  preset: "default" | "bold" | "warm" | "minimal" | "midnight";
};

const DEFAULT_CARD_STYLE: CardStyleConfig = {
  bodySize: "m",
  titleSize: "m",
  headerSize: "m",
  accentColor: "var(--brand)",
  cardFont: "Inter, sans-serif",
  preset: "default",
};

const PRESETS = (accent: string) => ({
  default: { bg: "var(--ink)", text: "#ffffff", tagCol: accent, roleCol: "var(--ink-5)" },
  bold: { bg: "var(--ink)", text: "#ffffff", tagCol: accent, roleCol: "var(--ink-5)" },
  warm: { bg: "var(--surface-subtle)", text: "#1a1005", tagCol: accent, roleCol: "#9a8060" },
  minimal: { bg: "#ffffff", text: "var(--ink)", tagCol: "var(--ink-5)", roleCol: "var(--ink-6)" },
  midnight: { bg: "#080818", text: "#e8e8ff", tagCol: "#a78bfa", roleCol: "#4b4b7a" },
});

const CharHint = ({ value, ideal }: { value: string; ideal: number }) => {
  const len = value.length;
  const color = len <= ideal ? "var(--success)" : len <= ideal * 1.4 ? "var(--warning)" : "var(--danger)";
  return (
    <div
      style={{
        fontSize: 9,
        color,
        textAlign: "right",
        marginTop: 2,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {len} / {ideal}
    </div>
  );
};

export default function ImageCardGenerator({
  postText,
  topicLabel,
  lang,
  userName,
  userRole,
}: ImageCardGeneratorProps) {
  const [open, setOpen] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<CardStyle>("manifesto");
  const [contentVariant, setContentVariant] = useState<ContentVariant>("hook");
  const [downloading, setDownloading] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [variantIndex, setVariantIndex] = useState(0);

  // Detect Arabic from the main post body (not from topic tag or stat field).
  const isArabic = lang === "ar" || isArabicText(postText);

  // Inject Cairo font once when this component mounts.
  useEffect(() => {
    ensureCairoFont();
    ensureBrandFonts();
  }, []);

  const hook = extractHook(postText);
  const lines = extractLines(postText);
  const statData = extractStat(postText);
  const quote = extractQuote(postText);

  const [hookText, setHookText] = useState(hook);
  const [tag, setTag] = useState(extractTag(topicLabel));
  const [editName, setEditName] = useState(userName || "Your Name");
  const [editRole, setEditRole] = useState(userRole || "Your Role");
  const [statValue, setStatValue] = useState(statData.stat);
  const [statContext, setStatContext] = useState(statData.context);
  const [hasStat, setHasStat] = useState(statData.hasStat);
  const [quoteText, setQuoteText] = useState(quote);
  const [frameTitle, setFrameTitle] = useState(topicLabel);
  const [framePoints, setFramePoints] = useState<string[]>(lines.slice(0, 3));
  const [ledeText, setLedeText] = useState(lines[1] || lines[0] || "");
  const [bodyText, setBodyText] = useState(lines[0] || "");

  // ── Per-card independent style state ──
  const [cardStyles, setCardStyles] = useState<Record<string, CardStyleConfig>>({});

  const getCardStyle = (cardName: string): CardStyleConfig => ({
    ...DEFAULT_CARD_STYLE,
    ...cardStyles[cardName],
  });

  const updateCardStyle = <K extends keyof CardStyleConfig>(key: K, value: CardStyleConfig[K]) => {
    setCardStyles((prev) => ({
      ...prev,
      [selectedStyle]: {
        ...getCardStyle(selectedStyle),
        [key]: value,
      },
    }));
  };

  const activeStyle = getCardStyle(selectedStyle);

  useEffect(() => {
    setHookText(hook);
    setTag(extractTag(topicLabel));
    setStatValue(statData.stat);
    setStatContext(statData.context);
    setHasStat(statData.hasStat);
    setQuoteText(quote);
    setFrameTitle(topicLabel);
    setFramePoints(lines.slice(0, 3));
    setLedeText(lines[1] || lines[0] || "");
    setBodyText(lines[0] || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postText, topicLabel]);

  useEffect(() => {
    if (userName) setEditName(userName);
  }, [userName]);

  useEffect(() => {
    if (userRole) setEditRole(userRole);
  }, [userRole]);

  useEffect(() => {
    const newHook = extractHook(postText);
    const newStat = extractStat(postText);
    const newQuote = extractQuote(postText);
    const newLines = extractLines(postText);
    setHookText(newHook);
    setStatValue(newStat.stat);
    setStatContext(newStat.context);
    setHasStat(newStat.hasStat);
    setQuoteText(newQuote);
    setFramePoints(newLines.slice(0, 3));
    setLedeText(newLines[1] || newLines[0] || "");
    setBodyText(newLines[0] || "");
    setTag(extractTag(topicLabel));
  }, [contentVariant, postText, topicLabel]);

  const shuffle = () => {
    const nextIdx = (variantIndex + 1) % VARIANT_ORDER.length;
    const next = VARIANT_ORDER[nextIdx];
    setVariantIndex(nextIdx);
    setContentVariant(next);
    // Re-derive content from postText with the new variant emphasis
    if (next === "hook") setHookText(extractHook(postText));
    if (next === "quote") setQuoteText(extractQuote(postText));
    if (next === "stat") {
      const s = extractStat(postText);
      setStatValue(s.stat);
      setStatContext(s.context);
      setHasStat(s.hasStat);
    }
    if (next === "lines") {
      const l = extractLines(postText);
      setFramePoints(l.slice(0, 3));
    }
  };

  const downloadPNG = async () => {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        scale: 3,
        backgroundColor: null,
        useCORS: true,
      });
      const link = document.createElement("a");
      const date = new Date().toISOString().slice(0, 10);
      link.download = `aura-card-${selectedStyle}-${date}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch {
      // silent
    } finally {
      setDownloading(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[hsl(43_80%_45%)] text-[hsl(43_80%_45%)] bg-transparent text-xs font-semibold hover:bg-[hsl(43_80%_45%/0.06)] transition-all"
      >
        <ImageIcon className="w-3.5 h-3.5" /> Create image card →
      </button>
    );
  }

  const buildCardProps = (cfg: CardStyleConfig): CardProps => ({
    tag,
    hookText,
    editName,
    editRole,
    lines,
    statValue,
    statContext,
    quoteText,
    frameTitle,
    framePoints,
    hasStat,
    ledeText,
    bodyText,
    bodyFontSize: BODY_SIZES[cfg.bodySize],
    titleFontSize: TITLE_SIZES[cfg.titleSize],
    headerFontSize: HEADER_SIZES[cfg.headerSize],
    accentColor: cfg.accentColor,
    cardFont: isArabic ? ARABIC_FONT : cfg.cardFont,
    preset: PRESETS(cfg.accentColor)[cfg.preset],
    isArabic,
  });

  const renderCard = (style: CardStyle, props: CardProps) => {
    switch (style) {
      case "manifesto":
        return <ManifestoCard {...props} />;
      case "newspaper":
        return <NewspaperCard {...props} />;
      case "tension_split":
        return <TensionSplitCard {...props} />;
      case "bold_quote":
        return <BoldQuoteCard {...props} />;
      case "dark_editorial":
        return <DarkEditorialCard {...props} />;
      case "contrast_framework":
        return <ContrastFrameworkCard {...props} />;
      case "minimal_dark":
        return <MinimalDarkCard {...props} />;
      case "statement_light":
        return <StatementLightCard {...props} />;
      case "data_point":
        return <DataPointCard {...props} />;
      case "arabic":
        return <ArabicCard {...props} />;
    }
  };

  const isStat = ["manifesto", "tension_split", "data_point"].includes(selectedStyle);
  const isQuote = ["bold_quote", "minimal_dark"].includes(selectedStyle);
  const isHook = ["newspaper", "dark_editorial", "statement_light", "arabic"].includes(selectedStyle);
  const isFramework = selectedStyle === "contrast_framework";
  const isTension = selectedStyle === "tension_split";
  const isNewspaper = selectedStyle === "newspaper";
  const isDarkEditorial = selectedStyle === "dark_editorial";

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="rounded-2xl border border-border/10 bg-secondary/10 overflow-hidden"
    >
      {/* Header: style label + shuffle */}
      <div className="p-4 border-b border-border/10 flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          {STYLE_META.find((s) => s.key === selectedStyle)?.label} · {contentVariant} content
        </span>
        <button
          onClick={shuffle}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-brand bg-[var(--brand-muted)] border border-[var(--bronze-line)] rounded-md px-3 py-1.5 hover:bg-[var(--brand-muted)] transition"
        >
          <Shuffle className="w-3 h-3" /> {VARIANT_ORDER[variantIndex]} content →
        </button>
      </div>

      {/* Thumbnail gallery */}
      <div className="p-4 border-b border-border/10">
        <div
          className="flex gap-3 overflow-x-auto pb-2"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {STYLE_META.map((s) => {
            const selected = s.key === selectedStyle;
            return (
              <button
                key={s.key}
                onClick={() => setSelectedStyle(s.key)}
                className="flex-shrink-0 flex flex-col items-center gap-1 group"
              >
                <div
                  className={`relative rounded-lg overflow-hidden transition-all ${
                    selected ? "ring-2 ring-brand ring-offset-2 ring-offset-background" : "opacity-60 group-hover:opacity-100"
                  }`}
                  style={{ width: 64, height: 80 }}
                >
                  <div
                    style={{
                      width: CARD_W,
                      height: CARD_H,
                      transform: "scale(0.18)",
                      transformOrigin: "top left",
                      pointerEvents: "none",
                    }}
                  >
                    {renderCard(s.key, buildCardProps(getCardStyle(s.key)))}
                  </div>
                </div>
                <span className="text-[8px] text-muted-foreground text-center max-w-[64px] truncate">
                  {s.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-0">
        {/* Full-size preview */}
        <div className="flex-1 p-6 flex items-center justify-center bg-[#161616] min-h-[480px]">
          <div key={`${selectedStyle}-${contentVariant}`} ref={cardRef} style={{ width: CARD_W, height: CARD_H }}>
            {renderCard(selectedStyle, buildCardProps(activeStyle))}
          </div>
        </div>

        {/* Edit panel */}
        <div className="w-full lg:w-72 p-5 space-y-4 border-t lg:border-t-0 lg:border-l border-border/10">
          <p className="uppercase tracking-wider text-[10px] font-semibold text-muted-foreground">
            Edit Card
          </p>

          {/* ── Style Controls (per-card) ── */}
          <div style={{ marginBottom: 16 }}>
            {/* Title size */}
            <div style={{ marginBottom: 10 }}>
              <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink-5)", marginBottom: 6 }}>
                Title size
              </p>
              <div style={{ display: "flex", gap: 4 }}>
                {(["xs", "s", "m", "l", "xl"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => updateCardStyle("titleSize", s)}
                    style={{
                      flex: 1, padding: "5px 0", borderRadius: 5, border: "0.5px solid",
                      fontSize: 10, fontWeight: 600, cursor: "pointer",
                      background: activeStyle.titleSize === s ? "var(--brand-muted)" : "transparent",
                      borderColor: activeStyle.titleSize === s ? "var(--bronze-line)" : "var(--ink-3)",
                      color: activeStyle.titleSize === s ? "var(--brand)" : "var(--ink-5)",
                    }}
                  >
                    {s.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            {/* Header size */}
            <div style={{ marginBottom: 10 }}>
              <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink-5)", marginBottom: 6 }}>
                Header size
              </p>
              <div style={{ display: "flex", gap: 4 }}>
                {(["xs", "s", "m", "l", "xl"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => updateCardStyle("headerSize", s)}
                    style={{
                      flex: 1, padding: "5px 0", borderRadius: 5, border: "0.5px solid",
                      fontSize: 10, fontWeight: 600, cursor: "pointer",
                      background: activeStyle.headerSize === s ? "var(--brand-muted)" : "transparent",
                      borderColor: activeStyle.headerSize === s ? "var(--bronze-line)" : "var(--ink-3)",
                      color: activeStyle.headerSize === s ? "var(--brand)" : "var(--ink-5)",
                    }}
                  >
                    {s.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            {/* Body size */}
            <div style={{ marginBottom: 10 }}>
              <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink-5)", marginBottom: 6 }}>
                Body size
              </p>
              <div style={{ display: "flex", gap: 4 }}>
                {(["xs", "s", "m", "l", "xl"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => updateCardStyle("bodySize", s)}
                    style={{
                      flex: 1, padding: "5px 0", borderRadius: 5, border: "0.5px solid",
                      fontSize: 10, fontWeight: 600, cursor: "pointer",
                      background: activeStyle.bodySize === s ? "var(--brand-muted)" : "transparent",
                      borderColor: activeStyle.bodySize === s ? "var(--bronze-line)" : "var(--ink-3)",
                      color: activeStyle.bodySize === s ? "var(--brand)" : "var(--ink-5)",
                    }}
                  >
                    {s.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            {/* Card preset */}
            <div style={{ marginBottom: 10 }}>
              <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink-5)", marginBottom: 6 }}>
                Style
              </p>
              <div style={{ display: "flex", gap: 4 }}>
                {(["default", "bold", "warm", "minimal", "midnight"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => updateCardStyle("preset", p)}
                    style={{
                      flex: 1, padding: "5px 0", borderRadius: 5, border: "0.5px solid",
                      fontSize: 9, fontWeight: 600, cursor: "pointer",
                      background: activeStyle.preset === p ? "var(--brand-muted)" : "transparent",
                      borderColor: activeStyle.preset === p ? "var(--bronze-line)" : "var(--ink-3)",
                      color: activeStyle.preset === p ? "var(--brand)" : "var(--ink-5)",
                      textTransform: "capitalize",
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            {/* Accent color */}
            <div style={{ marginBottom: 10 }}>
              <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink-5)", marginBottom: 6 }}>
                Accent color
              </p>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                {["var(--brand)", "var(--danger)", "var(--success)", "#378ADD", "#7F77DD", "#1D9E75", "var(--warning)", "#ffffff"].map((c) => (
                  <div
                    key={c}
                    onClick={() => updateCardStyle("accentColor", c)}
                    style={{
                      width: 22, height: 22, borderRadius: "50%", background: c,
                      cursor: "pointer", flexShrink: 0,
                      border: activeStyle.accentColor === c ? "2px solid #fff" : "1.5px solid var(--ink-3)",
                      transform: activeStyle.accentColor === c ? "scale(1.2)" : "scale(1)",
                      transition: "all .15s",
                    }}
                  />
                ))}
                <div style={{ position: "relative", width: 22, height: 22 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%",
                    border: "1.5px dashed var(--ink-4)", display: "flex",
                    alignItems: "center", justifyContent: "center",
                    fontSize: 14, color: "var(--ink-5)", cursor: "pointer",
                  }}>+</div>
                  <input
                    type="color"
                    value={activeStyle.accentColor}
                    onChange={(e) => updateCardStyle("accentColor", e.target.value)}
                    style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }}
                  />
                </div>
              </div>
            </div>
            {/* Font */}
            <div>
              <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink-5)", marginBottom: 6 }}>
                Font
              </p>
              <div style={{ display: "flex", gap: 4 }}>
                {[
                  { label: "Inter", value: "Inter, sans-serif" },
                  { label: "Serif", value: "Georgia, serif" },
                  { label: "Mono", value: "monospace" },
                ].map((f) => (
                  <button
                    key={f.value}
                    onClick={() => updateCardStyle("cardFont", f.value)}
                    style={{
                      flex: 1, padding: "5px 0", borderRadius: 5, border: "0.5px solid",
                      fontSize: 10, fontWeight: 600, cursor: "pointer",
                      fontFamily: f.value,
                      background: activeStyle.cardFont === f.value ? "var(--brand-muted)" : "transparent",
                      borderColor: activeStyle.cardFont === f.value ? "var(--bronze-line)" : "var(--ink-3)",
                      color: activeStyle.cardFont === f.value ? "var(--brand)" : "var(--ink-5)",
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div style={{ borderTop: "0.5px solid var(--surface-ink-subtle)", marginBottom: 12 }} />

          <Field label="Topic Tag">
            <Input
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              className="bg-background border-border text-foreground text-xs"
            />
            <CharHint value={tag} ideal={40} />
          </Field>

          {isStat && (
            <>
              <Field label="Stat Value">
                <Input
                  value={statValue}
                  onChange={(e) => setStatValue(e.target.value)}
                  className="bg-background border-border text-foreground text-xs"
                />
              </Field>
              <Field label="Stat Context">
                <Textarea
                  value={statContext}
                  onChange={(e) => setStatContext(e.target.value)}
                  className="bg-background border-border text-foreground text-xs min-h-[60px]"
                />
                <CharHint value={statContext} ideal={60} />
              </Field>
            </>
          )}

          {isQuote && (
            <Field label="Quote Text">
              <Textarea
                value={quoteText}
                onChange={(e) => setQuoteText(e.target.value)}
                className="bg-background border-border text-foreground text-xs min-h-[80px]"
              />
              <CharHint value={quoteText} ideal={90} />
            </Field>
          )}

          {isHook && (
            <Field label="Hook Text">
              <Textarea
                value={hookText}
                onChange={(e) => setHookText(e.target.value)}
                className="bg-background border-border text-foreground text-xs min-h-[80px]"
              />
              <CharHint value={hookText} ideal={80} />
            </Field>
          )}

          {isFramework && (
            <>
              <Field label="Headline">
                <Input
                  value={frameTitle}
                  onChange={(e) => setFrameTitle(e.target.value)}
                  className="bg-background border-border text-foreground text-xs"
                />
                <CharHint value={frameTitle} ideal={50} />
              </Field>
              {[0, 1, 2].map((i) => (
                <Field key={i} label={`Point ${i + 1}`}>
                  <Input
                    value={framePoints[i] || ""}
                    onChange={(e) => {
                      const next = [...framePoints];
                      next[i] = e.target.value;
                      setFramePoints(next);
                    }}
                    className="bg-background border-border text-foreground text-xs"
                  />
                  <CharHint value={framePoints[i] || ""} ideal={50} />
                </Field>
              ))}
            </>
          )}

          {isTension && (
            <>
              {[0, 1, 2].map((i) => (
                <Field key={i} label={`Point ${i + 1}`}>
                  <Input
                    value={framePoints[i] || ""}
                    onChange={(e) => {
                      const next = [...framePoints];
                      next[i] = e.target.value;
                      setFramePoints(next);
                    }}
                    className="bg-background border-border text-foreground text-xs"
                  />
                  <CharHint value={framePoints[i] || ""} ideal={50} />
                </Field>
              ))}
            </>
          )}

          {isNewspaper && (
            <Field label="Lede text">
              <Textarea
                value={ledeText}
                onChange={(e) => setLedeText(e.target.value)}
                className="bg-background border-border text-foreground text-xs min-h-[60px]"
              />
              <CharHint value={ledeText} ideal={80} />
            </Field>
          )}

          {isDarkEditorial && (
            <Field label="Body text">
              <Textarea
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                className="bg-background border-border text-foreground text-xs min-h-[60px]"
              />
              <CharHint value={bodyText} ideal={80} />
            </Field>
          )}

          <Field label="Name">
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="bg-background border-border text-foreground text-xs"
            />
          </Field>
          <Field label="Role">
            <Input
              value={editRole}
              onChange={(e) => setEditRole(e.target.value)}
              className="bg-background border-border text-foreground text-xs"
            />
          </Field>

          <Button onClick={downloadPNG} disabled={downloading} className="w-full gap-2">
            <Download className="w-4 h-4" />
            {downloading ? "Exporting…" : "Download PNG"}
          </Button>

          <button
            onClick={() => setOpen(false)}
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] text-muted-foreground/70 mb-1 block">{label}</label>
      {children}
    </div>
  );
}

/* ── Card Components (full size 355 × 444) ── */

const baseCard: React.CSSProperties = {
  width: CARD_W,
  height: CARD_H,
  borderRadius: 16,
  overflow: "hidden",
  position: "relative",
  fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
};

/* Arabic helpers: keep headings tight, give body text breathing room. */
const arDir = (isArabic: boolean) => (isArabic ? ("rtl" as const) : undefined);
const arAlign = (isArabic: boolean) => (isArabic ? ("right" as const) : undefined);
const arBodyLh = (isArabic: boolean, fallback: number) => (isArabic ? 1.9 : fallback);

/* ── Aura Premium card primitives ────────────────────────────────────── */

function AuraAuthor({ name, role, isArabic }: { name: string; role: string; isArabic: boolean }) {
  return (
    <div style={{ marginTop: "auto" }}>
      <div style={{ height: 1, background: AURA.brandLine, marginBottom: 10 }} />
      <p style={{
        color: AURA.brand, fontSize: 11, fontWeight: 600, letterSpacing: ".08em",
        textTransform: "uppercase", fontFamily: isArabic ? AURA.arabic : AURA.body,
        textAlign: arAlign(isArabic),
      }}>{trunc(name, 30)}</p>
      <p style={{
        color: AURA.textFaint, fontSize: 10, marginTop: 3,
        fontFamily: isArabic ? AURA.arabic : AURA.body,
        textAlign: arAlign(isArabic),
      }}>{trunc(role, 45)}</p>
    </div>
  );
}

function AuraWatermark({ position = "bottom-right" }: { position?: "bottom-right" | "top-left" }) {
  const pos: React.CSSProperties =
    position === "top-left"
      ? { top: 18, left: 20 }
      : { bottom: 18, right: 20 };
  return (
    <p style={{
      position: "absolute", ...pos,
      color: AURA.brandWatermark, fontSize: 8, fontWeight: 700,
      letterSpacing: 3, textTransform: "uppercase",
      fontFamily: AURA.body,
    }}>AURA</p>
  );
}

const auraShell: React.CSSProperties = {
  ...baseCard,
  background: AURA.surface,
  padding: 40,
  display: "flex",
  flexDirection: "column",
  height: "100%",
};

/* CARD 1: Manifesto */
function ManifestoCard({ hookText, editName, editRole, statValue, statContext, isArabic }: CardProps) {
  const dispFont = isArabic ? AURA.arabic : AURA.display;
  const bodyFont = isArabic ? AURA.arabic : AURA.body;
  return (
    <div dir={arDir(isArabic)} style={auraShell}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
        <p style={{ fontFamily: dispFont, fontSize: 72, fontWeight: 600, color: AURA.brand, lineHeight: 1, letterSpacing: -2 }}>
          {trunc(statValue, 8)}
        </p>
        <p style={{ fontFamily: bodyFont, fontSize: 14, color: AURA.textFaint, marginTop: 12, lineHeight: 1.5, maxWidth: 240 }}>
          {trunc(statContext, 80)}
        </p>
        <div style={{ width: 60, height: 1, background: AURA.brandLine, margin: "20px 0" }} />
        <p style={{ fontFamily: dispFont, fontSize: 24, color: AURA.text, lineHeight: 1.3, fontWeight: 500, fontStyle: isArabic ? "normal" : "italic" }}>
          {trunc(hookText, 90)}
        </p>
      </div>
      <AuraAuthor name={editName} role={editRole} isArabic={isArabic} />
      <AuraWatermark />
    </div>
  );
}

/* CARD 2: Newspaper */
function NewspaperCard({ tag, hookText, editName, editRole, ledeText, isArabic }: CardProps) {
  const dispFont = isArabic ? AURA.arabic : AURA.display;
  const bodyFont = isArabic ? AURA.arabic : AURA.body;
  return (
    <div dir={arDir(isArabic)} style={auraShell}>
      <p style={{
        fontFamily: AURA.body, fontSize: 9, fontWeight: 600, letterSpacing: "0.2em",
        textTransform: "uppercase", color: AURA.brand, textAlign: arAlign(isArabic),
      }}>GCC Intelligence</p>
      <p style={{
        fontFamily: AURA.body, fontSize: 11, fontWeight: 500, letterSpacing: ".08em",
        textTransform: "uppercase", color: AURA.textDim, marginTop: 8, textAlign: arAlign(isArabic),
      }}>{trunc(tag, 40)}</p>
      <div style={{ width: 40, height: 1, background: AURA.brandLine, marginTop: 16, marginBottom: 16, marginLeft: isArabic ? "auto" : 0 }} />
      <p style={{
        fontFamily: dispFont, fontSize: 28, fontWeight: 600, color: AURA.text,
        lineHeight: 1.2, marginBottom: 16, textAlign: arAlign(isArabic),
        display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
      }}>{trunc(hookText, 90)}</p>
      <p style={{ fontFamily: bodyFont, fontSize: 13, color: AURA.textMuted, lineHeight: arBodyLh(isArabic, 1.6), textAlign: arAlign(isArabic) }}>
        {trunc(ledeText, 140)}
      </p>
      <AuraAuthor name={editName} role={editRole} isArabic={isArabic} />
      <AuraWatermark />
    </div>
  );
}

/* CARD 3: Tension */
function TensionSplitCard({ framePoints, editName, editRole, isArabic }: CardProps) {
  const dispFont = isArabic ? AURA.arabic : AURA.display;
  const bodyFont = isArabic ? AURA.arabic : AURA.body;
  return (
    <div dir={arDir(isArabic)} style={{
      ...auraShell,
      background: `linear-gradient(160deg, ${AURA.surface} 0%, ${AURA.surfaceAlt} 100%)`,
    }}>
      <p style={{
        fontFamily: AURA.body, fontSize: 9, fontWeight: 600, letterSpacing: "0.2em",
        textTransform: "uppercase", color: AURA.brand, marginBottom: 24, textAlign: arAlign(isArabic),
      }}>Three points of tension</p>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 18 }}>
        {[0, 1, 2].map((i) => {
          const pt = framePoints[i];
          if (!pt) return null;
          return (
            <div key={i}>
              <div style={{ display: "flex", gap: 14, alignItems: "baseline", flexDirection: isArabic ? "row-reverse" : "row" }}>
                <span style={{ fontFamily: dispFont, fontSize: 20, color: AURA.brand, fontWeight: 600, minWidth: 28 }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p style={{
                  fontFamily: bodyFont, fontSize: 14, color: AURA.text,
                  lineHeight: arBodyLh(isArabic, 1.5), flex: 1, textAlign: arAlign(isArabic),
                }}>{trunc(pt, 70)}</p>
              </div>
              {i < 2 && framePoints[i + 1] && (
                <div style={{ marginTop: 14, borderTop: `1px dashed ${AURA.brandLine}` }} />
              )}
            </div>
          );
        })}
      </div>
      <AuraAuthor name={editName} role={editRole} isArabic={isArabic} />
      <AuraWatermark />
    </div>
  );
}

/* CARD 4: Bold Quote */
function BoldQuoteCard({ quoteText, editName, editRole, isArabic }: CardProps) {
  const dispFont = isArabic ? AURA.arabic : AURA.display;
  const openMark = isArabic ? "«" : "「";
  return (
    <div dir={arDir(isArabic)} style={{ ...auraShell, position: "relative" }}>
      <span aria-hidden style={{
        position: "absolute", top: 18, left: isArabic ? "auto" : 28, right: isArabic ? 28 : "auto",
        fontFamily: dispFont, fontSize: 80, color: AURA.brand, opacity: 0.20,
        lineHeight: 1, pointerEvents: "none",
      }}>{openMark}</span>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{
          fontFamily: dispFont, fontStyle: isArabic ? "normal" : "italic",
          fontSize: 22, fontWeight: 500, color: AURA.text,
          lineHeight: arBodyLh(isArabic, 1.45), textAlign: "center",
        }}>
          {trunc(quoteText, 140)}
        </p>
      </div>
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ width: 40, height: 1, background: AURA.brand, marginBottom: 10 }} />
        <p style={{ fontFamily: AURA.body, fontSize: 11, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: AURA.brand }}>
          {trunc(editName, 30)}
        </p>
        <p style={{ fontFamily: AURA.body, fontSize: 10, color: AURA.textFaint, marginTop: 3 }}>
          {trunc(editRole, 45)}
        </p>
      </div>
      <AuraWatermark />
    </div>
  );
}

/* CARD 5: Editorial */
function DarkEditorialCard({ tag, hookText, editName, editRole, bodyText, isArabic }: CardProps) {
  const dispFont = isArabic ? AURA.arabic : AURA.display;
  const bodyFont = isArabic ? AURA.arabic : AURA.body;
  return (
    <div dir={arDir(isArabic)} style={auraShell}>
      <p style={{
        fontFamily: AURA.body, fontSize: 9, fontWeight: 600, letterSpacing: ".15em",
        textTransform: "uppercase", color: AURA.brand, textAlign: arAlign(isArabic),
      }}>01 / Key Insight</p>
      <p style={{
        fontFamily: AURA.body, fontSize: 11, fontWeight: 500, letterSpacing: ".08em",
        textTransform: "uppercase", color: AURA.textDim, marginTop: 24, textAlign: arAlign(isArabic),
      }}>{trunc(tag, 40)}</p>
      <p style={{
        fontFamily: dispFont, fontSize: 24, fontWeight: 600, color: AURA.text,
        lineHeight: 1.25, marginTop: 24, textAlign: arAlign(isArabic),
      }}>{trunc(hookText, 100)}</p>
      <p style={{
        fontFamily: bodyFont, fontSize: 13, color: AURA.textMuted,
        lineHeight: arBodyLh(isArabic, 1.65), marginTop: 24, textAlign: arAlign(isArabic),
      }}>{trunc(bodyText, 130)}</p>
      <AuraAuthor name={editName} role={editRole} isArabic={isArabic} />
      <AuraWatermark />
    </div>
  );
}

/* CARD 6: Framework */
function ContrastFrameworkCard({ frameTitle, framePoints, editName, editRole, isArabic }: CardProps) {
  const dispFont = isArabic ? AURA.arabic : AURA.display;
  const bodyFont = isArabic ? AURA.arabic : AURA.body;
  return (
    <div dir={arDir(isArabic)} style={auraShell}>
      <p style={{
        fontFamily: AURA.body, fontSize: 9, fontWeight: 600, letterSpacing: ".15em",
        textTransform: "uppercase", color: AURA.brand, textAlign: arAlign(isArabic),
      }}>Framework</p>
      <p style={{
        fontFamily: dispFont, fontSize: 22, fontWeight: 600, color: AURA.text,
        lineHeight: 1.25, marginTop: 12, textAlign: arAlign(isArabic),
      }}>{trunc(frameTitle, 70)}</p>
      <div style={{ width: 60, height: 2, background: AURA.brand, marginTop: 14, marginLeft: isArabic ? "auto" : 0 }} />
      <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 16, flex: 1 }}>
        {[0, 1, 2].map((i) => framePoints[i] ? (
          <div key={i} style={{ display: "flex", gap: 14, alignItems: "baseline", flexDirection: isArabic ? "row-reverse" : "row" }}>
            <span style={{ fontFamily: dispFont, fontSize: 18, color: AURA.brand, fontWeight: 600, minWidth: 26 }}>
              {String(i + 1).padStart(2, "0")}
            </span>
            <p style={{
              fontFamily: bodyFont, fontSize: 13, color: AURA.text,
              lineHeight: arBodyLh(isArabic, 1.5), flex: 1, textAlign: arAlign(isArabic),
            }}>{trunc(framePoints[i], 75)}</p>
          </div>
        ) : null)}
      </div>
      <AuraAuthor name={editName} role={editRole} isArabic={isArabic} />
      <AuraWatermark />
    </div>
  );
}

/* CARD 7: Minimal */
function MinimalDarkCard({ hookText, quoteText, editName, editRole, isArabic }: CardProps) {
  const dispFont = isArabic ? AURA.arabic : AURA.display;
  return (
    <div dir={arDir(isArabic)} style={auraShell}>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{
          fontFamily: dispFont, fontSize: 26, fontWeight: 500, color: AURA.text,
          lineHeight: arBodyLh(isArabic, 1.4), textAlign: "center",
          display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>
          {trunc(quoteText || hookText, 110)}
        </p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 16 }}>
        <div style={{ width: 40, height: 1, background: AURA.brand, marginBottom: 12 }} />
        <p style={{ fontFamily: AURA.body, fontSize: 11, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: AURA.brand }}>
          {trunc(editName, 30)}
        </p>
        <p style={{ fontFamily: AURA.body, fontSize: 10, color: AURA.textFaint, marginTop: 3 }}>
          {trunc(editRole, 45)}
        </p>
      </div>
      <AuraWatermark />
    </div>
  );
}

/* CARD 8: Statement */
function StatementLightCard({ tag, hookText, editName, editRole, isArabic }: CardProps) {
  const dispFont = isArabic ? AURA.arabic : AURA.display;
  return (
    <div dir={arDir(isArabic)} style={{ ...auraShell, position: "relative" }}>
      <div style={{ position: "absolute", top: 24, right: 24, width: 8, height: 8, background: AURA.brand }} />
      <p style={{
        fontFamily: AURA.body, fontSize: 9, fontWeight: 600, letterSpacing: ".2em",
        textTransform: "uppercase", color: AURA.brand, textAlign: arAlign(isArabic),
      }}>{trunc(tag, 40)}</p>
      <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
        <p style={{
          fontFamily: dispFont, fontSize: 24, fontWeight: 500, color: AURA.text,
          lineHeight: arBodyLh(isArabic, 1.35), textAlign: arAlign(isArabic),
        }}>{trunc(hookText, 110)}</p>
      </div>
      <AuraAuthor name={editName} role={editRole} isArabic={isArabic} />
      <AuraWatermark />
    </div>
  );
}


/* CARD 9: Data Point */
function DataPointCard({ tag, hookText, editName, editRole, statValue, statContext, titleFontSize, bodyFontSize, headerFontSize, accentColor, cardFont, preset, isArabic }: CardProps) {
  return (
    <div dir={arDir(isArabic)} style={{ ...baseCard, fontFamily: cardFont, display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ background: accentColor, padding: "28px 24px 20px", flex: 1, display: "flex", flexDirection: "column" }}>
        <p style={{ color: "rgba(255,255,255,0.65)", fontSize: headerFontSize, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: "auto", textAlign: arAlign(isArabic) }}>
          {trunc(tag, 35)}
        </p>
        <p style={{ color: "#fff", fontSize: Math.min(72, titleFontSize * 3.5), fontWeight: 900, letterSpacing: -2, lineHeight: 1, marginTop: 16, textAlign: arAlign(isArabic) }}>
          {statValue}
        </p>
        <p style={{ color: "#fff", fontSize: 11, fontWeight: 600, lineHeight: arBodyLh(isArabic, 1.3), marginTop: 8, textAlign: arAlign(isArabic) }}>
          {trunc(statContext, 75)}
        </p>
      </div>
      <div style={{ marginTop: "auto", paddingTop: 12, background: preset.bg, padding: "20px 24px" }}>
        <p style={{ color: preset.text, fontSize: bodyFontSize, lineHeight: arBodyLh(isArabic, 1.5), marginBottom: 16, textAlign: arAlign(isArabic) }}>{trunc(hookText, 100)}</p>
        <p style={{ color: accentColor, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, textAlign: arAlign(isArabic) }}>{trunc(editName, 30)}</p>
        <p style={{ color: preset.roleCol, fontSize: 9, marginTop: 2, textAlign: arAlign(isArabic) }}>{trunc(editRole, 45)}</p>
      </div>
    </div>
  );
}

/* CARD 10: Arabic (RTL Aura Premium) */
function ArabicCard({ tag, hookText, editName, editRole }: CardProps) {
  return (
    <div dir="rtl" style={{ ...auraShell, position: "relative" }}>
      <p style={{
        position: "absolute", top: 20, left: 24,
        fontFamily: AURA.body, fontSize: 8, fontWeight: 700,
        letterSpacing: 3, textTransform: "uppercase", color: AURA.brand,
      }}>AURA</p>
      <p style={{
        fontFamily: AURA.arabic, fontSize: 11, fontWeight: 600, letterSpacing: ".05em",
        color: AURA.brand, textAlign: "right", marginTop: 18,
      }}>{trunc(tag, 40)}</p>
      <div style={{ width: 60, height: 1, background: AURA.brandLine, marginTop: 16, marginBottom: 16, marginRight: 0, marginLeft: "auto" }} />
      <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
        <p style={{
          fontFamily: AURA.arabic, fontSize: 22, fontWeight: 600, color: AURA.text,
          lineHeight: 1.9, textAlign: "right",
        }}>
          {trunc(hookText || "اكتب النص العربي هنا...", 110)}
        </p>
      </div>
      <div style={{ marginTop: "auto" }}>
        <div style={{ height: 1, background: AURA.brandLine, marginBottom: 10 }} />
        <p style={{ fontFamily: AURA.arabic, fontSize: 12, fontWeight: 600, color: AURA.brand, textAlign: "right" }}>
          {trunc(editName, 30)}
        </p>
        <p style={{ fontFamily: AURA.arabic, fontSize: 11, color: AURA.textFaint, textAlign: "right", marginTop: 3 }}>
          {trunc(editRole, 45)}
        </p>
      </div>
    </div>
  );
}
