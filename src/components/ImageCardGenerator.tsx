import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Download, Image as ImageIcon, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import html2canvas from "html2canvas";

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

interface ImageCardGeneratorProps {
  postText: string;
  topicLabel: string;
  lang: "en" | "ar";
  userName?: string;
  userRole?: string;
}

/* ── Extraction helpers ── */

function extractHook(text: string): string {
  const sentences = text.replace(/\*\*/g, "").replace(/\*/g, "").split(/(?<=[.!?،؟])\s+/);
  return sentences.slice(0, 2).join(" ").trim();
}

function extractLines(text: string): string[] {
  return text
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function extractStat(text: string): { stat: string; context: string } {
  const clean = text.replace(/\*\*/g, "").replace(/\*/g, "");
  const match = clean.match(/(\d+(?:\.\d+)?(?:M|B|K|%|\+)?)/);
  if (match) {
    const idx = clean.indexOf(match[0]);
    const context = clean.slice(Math.max(0, idx - 20), idx + 80).trim();
    return { stat: match[0], context };
  }
  return { stat: "—", context: clean.slice(0, 100) };
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
}

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

  const hook = extractHook(postText);
  const lines = extractLines(postText);
  const statData = extractStat(postText);
  const quote = extractQuote(postText);

  const [hookText, setHookText] = useState(hook);
  const [tag, setTag] = useState(topicLabel);
  const [editName, setEditName] = useState(userName || "Your Name");
  const [editRole, setEditRole] = useState(userRole || "Your Role");
  const [statValue, setStatValue] = useState(statData.stat);
  const [statContext, setStatContext] = useState(statData.context);
  const [quoteText, setQuoteText] = useState(quote);
  const [frameTitle, setFrameTitle] = useState(topicLabel);
  const [framePoints, setFramePoints] = useState<string[]>(lines.slice(0, 3));

  useEffect(() => {
    setHookText(hook);
    setTag(topicLabel);
    setStatValue(statData.stat);
    setStatContext(statData.context);
    setQuoteText(quote);
    setFrameTitle(topicLabel);
    setFramePoints(lines.slice(0, 3));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postText, topicLabel]);

  useEffect(() => {
    if (userName) setEditName(userName);
  }, [userName]);

  useEffect(() => {
    if (userRole) setEditRole(userRole);
  }, [userRole]);

  useEffect(() => {
    if (contentVariant === "hook") {
      setHookText(extractHook(postText));
    } else if (contentVariant === "stat") {
      const s = extractStat(postText);
      setStatValue(s.stat);
      setStatContext(s.context);
    } else if (contentVariant === "quote") {
      setQuoteText(extractQuote(postText));
    } else if (contentVariant === "lines") {
      setFramePoints(extractLines(postText).slice(0, 3));
    }
  }, [contentVariant, postText]);

  const shuffle = () => {
    const variants: ContentVariant[] = ["hook", "stat", "lines", "quote"];
    const next = variants[Math.floor(Math.random() * variants.length)];
    setContentVariant(next);
    // Re-derive content from postText with the new variant emphasis
    if (next === "hook") setHookText(extractHook(postText));
    if (next === "quote") setQuoteText(extractQuote(postText));
    if (next === "stat") {
      const s = extractStat(postText);
      setStatValue(s.stat);
      setStatContext(s.context);
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

  const cardProps: CardProps = {
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
  };

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
          className="flex items-center gap-1.5 text-[11px] font-semibold text-[#F97316] bg-[rgba(249,115,22,0.1)] border border-[rgba(249,115,22,0.2)] rounded-md px-3 py-1.5 hover:bg-[rgba(249,115,22,0.18)] transition"
        >
          <Shuffle className="w-3 h-3" /> Shuffle content
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
                    selected ? "ring-2 ring-[#F97316] ring-offset-2 ring-offset-background" : "opacity-60 group-hover:opacity-100"
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
                    {renderCard(s.key, cardProps)}
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
          <div ref={cardRef} style={{ width: CARD_W, height: CARD_H }}>
            {renderCard(selectedStyle, cardProps)}
          </div>
        </div>

        {/* Edit panel */}
        <div className="w-full lg:w-72 p-5 space-y-4 border-t lg:border-t-0 lg:border-l border-border/10">
          <p className="uppercase tracking-wider text-[10px] font-semibold text-muted-foreground">
            Edit Card
          </p>

          <Field label="Topic Tag">
            <Input
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              className="bg-background border-border text-foreground text-xs"
            />
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
            </Field>
          )}

          {isHook && (
            <Field label="Hook Text">
              <Textarea
                value={hookText}
                onChange={(e) => setHookText(e.target.value)}
                className="bg-background border-border text-foreground text-xs min-h-[80px]"
              />
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
                </Field>
              ))}
            </>
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

/* CARD 1: Manifesto */
function ManifestoCard({ tag, hookText, editName, editRole, statValue }: CardProps) {
  return (
    <div style={{ ...baseCard, background: "#0d0d0d", display: "flex", flexDirection: "column" }}>
      <div style={{ position: "absolute", top: 0, left: 0, width: 4, height: "100%", background: "#F97316" }} />
      <div style={{ padding: "28px 24px 0 32px", flex: 1, display: "flex", flexDirection: "column" }}>
        <p style={{ color: "#F97316", fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 16 }}>
          {tag}
        </p>
        <p style={{ color: "#F97316", fontSize: 72, fontWeight: 900, letterSpacing: -3, lineHeight: 1, marginBottom: 16 }}>
          {statValue}
        </p>
        <p style={{ color: "#fff", fontSize: 18, fontWeight: 700, lineHeight: 1.35, marginBottom: 14, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}>
          {hookText}
        </p>
      </div>
      <div style={{ borderTop: "1px solid #141414", padding: "14px 24px 14px 32px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <p style={{ color: "#F97316", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2 }}>{editName}</p>
          <p style={{ color: "#444", fontSize: 9, marginTop: 2 }}>{editRole}</p>
        </div>
        <p style={{ color: "#1e1e1e", fontSize: 8, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" }}>AURA</p>
      </div>
    </div>
  );
}

/* CARD 2: Newspaper */
function NewspaperCard({ tag, hookText, editName, editRole, lines }: CardProps) {
  return (
    <div style={{ ...baseCard, background: "#f5ede0", display: "flex", flexDirection: "column" }}>
      <div style={{ background: "#F97316", padding: "10px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 8, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" }}>GCC INTELLIGENCE</span>
        <span style={{ color: "#fff", fontSize: 8, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" }}>AURA</span>
      </div>
      <div style={{ padding: "24px 20px", flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ color: "#F97316", fontSize: 8, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 160 }}>{tag}</span>
          <div style={{ flex: 1, height: 1, background: "#d4b896" }} />
        </div>
        <p style={{ color: "#1a1005", fontSize: 22, fontWeight: 900, lineHeight: 1.15, letterSpacing: -0.5, marginBottom: 14, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical" }}>
          {hookText}
        </p>
        <div style={{ height: 1, background: "#d4b896", marginBottom: 12 }} />
        <p style={{ color: "#6a5840", fontSize: 11, lineHeight: 1.6, flex: 1, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical" }}>{lines[1] || lines[0] || ""}</p>
      </div>
      <div style={{ borderTop: "1px solid #d4b896", padding: "12px 20px" }}>
        <p style={{ color: "#1a1005", fontSize: 10, fontWeight: 700 }}>{editName}</p>
        <p style={{ color: "#9a8060", fontSize: 9, marginTop: 2 }}>{editRole}</p>
      </div>
    </div>
  );
}

/* CARD 3: Tension Split */
function TensionSplitCard({ tag, editName, editRole, framePoints, statValue }: CardProps) {
  return (
    <div style={{ ...baseCard, background: "#0d0d0d", display: "grid", gridTemplateRows: "auto 1fr auto" }}>
      <div style={{ padding: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#555", fontSize: 8, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>{tag}</span>
        <span style={{ color: "#F97316", fontSize: 8, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" }}>AURA</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", height: "100%" }}>
        <div style={{ background: "#F97316", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: 12, height: "100%", alignSelf: "stretch" }}>
          <p style={{ color: "#fff", fontSize: 48, fontWeight: 900, lineHeight: 1, letterSpacing: -2 }}>{statValue}</p>
          <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 8, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", marginTop: 6, textAlign: "center" }}>KEY INSIGHT</p>
        </div>
        <div style={{ padding: "20px 18px", display: "flex", flexDirection: "column", gap: 14, justifyContent: "center", height: "100%", alignSelf: "stretch" }}>
          {framePoints.slice(0, 3).map((pt, i) => (
            <p key={i} style={{ color: "#e0e0e0", fontSize: 12, fontWeight: 600, paddingLeft: 12, borderLeft: "1px solid #252525", lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
              {pt}
            </p>
          ))}
        </div>
      </div>
      <div style={{ borderTop: "1px solid #141414", padding: "14px 20px" }}>
        <p style={{ color: "#F97316", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2 }}>{editName}</p>
        <p style={{ color: "#444", fontSize: 9, marginTop: 2 }}>{editRole}</p>
      </div>
    </div>
  );
}

/* CARD 4: Bold Quote */
function BoldQuoteCard({ tag, quoteText, editName, editRole }: CardProps) {
  return (
    <div style={{ ...baseCard, background: "#F97316" }}>
      <div style={{ position: "absolute", top: -20, left: 16, fontSize: 200, color: "rgba(0,0,0,0.12)", fontFamily: "Georgia, serif", lineHeight: 1, pointerEvents: "none", zIndex: 0 }}>
        “
      </div>
      <div style={{ position: "relative", zIndex: 1, padding: "32px 24px 24px", display: "flex", flexDirection: "column", height: "100%" }}>
        <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 8, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>{tag}</p>
        <p style={{ color: "#fff", fontSize: 22, fontWeight: 800, lineHeight: 1.3, marginTop: "auto", marginBottom: 20, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical" }}>
          {quoteText}
        </p>
        <div style={{ width: 32, height: 3, background: "rgba(255,255,255,0.4)", borderRadius: 2, marginBottom: 12 }} />
        <p style={{ color: "#fff", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{editName}</p>
        <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 10, marginTop: 2 }}>{editRole}</p>
      </div>
      <p style={{ position: "absolute", bottom: 18, right: 20, color: "rgba(0,0,0,0.2)", fontSize: 8, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" }}>AURA</p>
    </div>
  );
}

/* CARD 5: Dark Editorial */
function DarkEditorialCard({ tag, hookText, editName, editRole, lines }: CardProps) {
  return (
    <div style={{ ...baseCard, background: "#0d0d0d", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 20px" }}>
        <div style={{ flex: 1, height: 1, background: "#1e1e1e" }} />
        <div style={{ width: 4, height: 4, borderRadius: 2, background: "#F97316" }} />
        <span style={{ color: "#555", fontSize: 8, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", whiteSpace: "nowrap" }}>{tag}</span>
        <div style={{ width: 4, height: 4, borderRadius: 2, background: "#F97316" }} />
        <div style={{ flex: 1, height: 1, background: "#1e1e1e" }} />
      </div>
      <div style={{ padding: "0 20px", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <p style={{ color: "#F97316", fontSize: 11, fontWeight: 700, letterSpacing: 2, marginBottom: 10 }}>01 / Key Insight</p>
        <p style={{ color: "#fff", fontSize: 24, fontWeight: 900, lineHeight: 1.2, letterSpacing: -0.5, marginBottom: 16, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical" }}>
          {hookText}
        </p>
        <p style={{ color: "#555", fontSize: 11, lineHeight: 1.65, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}>{lines[0] || ""}</p>
      </div>
      <div style={{ borderTop: "1px solid #111", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <p style={{ color: "#F97316", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2 }}>{editName}</p>
          <p style={{ color: "#444", fontSize: 9, marginTop: 2 }}>{editRole}</p>
        </div>
        <p style={{ color: "#252525", fontSize: 8, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" }}>AURA</p>
      </div>
    </div>
  );
}

/* CARD 6: Contrast Framework */
function ContrastFrameworkCard({ frameTitle, framePoints, editName, editRole }: CardProps) {
  return (
    <div style={{ ...baseCard, background: "#f5ede0", display: "flex", flexDirection: "column" }}>
      <div style={{ background: "#0d0d0d", padding: 20 }}>
        <p style={{ color: "#F97316", fontSize: 8, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>FRAMEWORK</p>
        <p style={{ color: "#fff", fontSize: 17, fontWeight: 800, lineHeight: 1.25 }}>{frameTitle}</p>
        <div style={{ width: 28, height: 3, background: "#F97316", marginTop: 12 }} />
      </div>
      <div style={{ padding: 20, flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <span style={{ color: "#F97316", fontSize: 28, fontWeight: 900, minWidth: 32, lineHeight: 1 }}>
              {String(i + 1).padStart(2, "0")}
            </span>
            <p style={{ color: "#1a1005", fontSize: 12, fontWeight: 800, lineHeight: 1.35, paddingTop: 4 }}>
              {framePoints[i] || ""}
            </p>
          </div>
        ))}
      </div>
      <div style={{ borderTop: "1px solid #e0d0bc", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <p style={{ color: "#1a1005", fontSize: 10 }}>
          <span style={{ fontWeight: 700 }}>{editName}</span> · {editRole}
        </p>
        <p style={{ color: "#F97316", fontSize: 8, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" }}>AURA</p>
      </div>
    </div>
  );
}

/* CARD 7: Minimal Dark */
function MinimalDarkCard({ tag, hookText, editName, editRole }: CardProps) {
  // Highlight first word over 5 chars in orange
  const words = hookText.split(/\s+/);
  const highlightIdx = words.findIndex((w) => w.replace(/[^a-zA-Z]/g, "").length > 5);
  return (
    <div style={{ ...baseCard, background: "#0d0d0d", display: "flex", flexDirection: "column", padding: "36px 28px", justifyContent: "space-between" }}>
      <p style={{ color: "#333", fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>{tag}</p>
      <div>
        <div style={{ width: 24, height: 2, background: "#F97316", marginBottom: 20 }} />
        <p style={{ color: "#fff", fontSize: 20, fontWeight: 700, lineHeight: 1.4 }}>
          {words.map((w, i) => (
            <span key={i} style={{ color: i === highlightIdx ? "#F97316" : "#fff" }}>
              {w}{i < words.length - 1 ? " " : ""}
            </span>
          ))}
        </p>
      </div>
      <div>
        <p style={{ color: "#fff", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2 }}>{editName}</p>
        <p style={{ color: "#444", fontSize: 9, marginTop: 3 }}>{editRole}</p>
        <p style={{ color: "#1e1e1e", fontSize: 8, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", marginTop: 16 }}>AURA</p>
      </div>
    </div>
  );
}

/* CARD 8: Statement Light */
function StatementLightCard({ tag, hookText, editName, editRole }: CardProps) {
  return (
    <div style={{ ...baseCard, background: "#f5ede0" }}>
      <div style={{ position: "absolute", top: 0, right: 0, width: 68, height: 68, background: "#F97316", borderBottomLeftRadius: 14 }} />
      <div style={{ padding: "28px 24px 24px", display: "flex", flexDirection: "column", height: "100%", position: "relative", zIndex: 1 }}>
        <p style={{ color: "#F97316", fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", paddingRight: 76, lineHeight: 1.5, marginBottom: 20 }}>
          {tag}
        </p>
        <p style={{ color: "#1a1005", fontSize: 17, fontWeight: 800, lineHeight: 1.32, flex: 1 }}>
          {hookText}
        </p>
        <div style={{ width: 36, height: 3, background: "#F97316", marginTop: 16, marginBottom: 12 }} />
        <p style={{ color: "#F97316", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{editName}</p>
        <p style={{ color: "#9a8060", fontSize: 10, marginTop: 3 }}>{editRole}</p>
      </div>
      <p style={{ position: "absolute", bottom: 16, right: 18, color: "#d4b896", fontSize: 8, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" }}>AURA</p>
    </div>
  );
}

/* CARD 9: Data Point */
function DataPointCard({ tag, hookText, editName, editRole, statValue, statContext }: CardProps) {
  return (
    <div style={{ ...baseCard, display: "flex", flexDirection: "column" }}>
      <div style={{ background: "#F97316", padding: "28px 24px 20px", flex: 1, display: "flex", flexDirection: "column" }}>
        <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 8, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: "auto" }}>
          {tag}
        </p>
        <p style={{ color: "#fff", fontSize: 64, fontWeight: 900, letterSpacing: -2, lineHeight: 1, marginTop: 16 }}>
          {statValue}
        </p>
        <p style={{ color: "#fff", fontSize: 11, fontWeight: 600, lineHeight: 1.3, marginTop: 8 }}>
          {(statContext || "").slice(0, 60)}
        </p>
      </div>
      <div style={{ background: "#0d0d0d", padding: "20px 24px" }}>
        <p style={{ color: "#e0e0e0", fontSize: 12, lineHeight: 1.5, marginBottom: 16 }}>{hookText}</p>
        <p style={{ color: "#F97316", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2 }}>{editName}</p>
        <p style={{ color: "#444", fontSize: 9, marginTop: 2 }}>{editRole}</p>
      </div>
    </div>
  );
}

/* CARD 10: Arabic (preserved) */
function ArabicCard({ tag, hookText, editName, editRole }: CardProps) {
  return (
    <div dir="rtl" style={{ ...baseCard, background: "#0d0d0d", border: "1px solid #1e1e1e", padding: 32 }}>
      <div style={{ position: "absolute", top: 20, left: 20, display: "flex", gap: 4 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ width: 6, height: 6, borderRadius: 3, background: "#F97316" }} />
        ))}
      </div>
      <p style={{ position: "absolute", top: 20, right: 24, color: "#F97316", fontSize: 10, fontWeight: 700, letterSpacing: 3 }}>AURA</p>
      <p style={{ color: "#F97316", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginTop: 24, marginBottom: 16, textAlign: "right" }}>
        {tag}
      </p>
      <p style={{ color: "#fff", fontSize: 16, fontWeight: 700, lineHeight: 2.1, textAlign: "right", direction: "rtl" }}>
        {hookText || "اكتب النص العربي هنا..."}
      </p>
      <div style={{ width: 32, height: 2, background: "#F97316", marginTop: 20, marginBottom: 16, marginRight: 0, marginLeft: "auto" }} />
      <p style={{ color: "#F97316", fontSize: 11, fontWeight: 700, textAlign: "right" }}>{editName}</p>
      <p style={{ color: "#555", fontSize: 10, textAlign: "right", marginTop: 2 }}>{editRole}</p>
    </div>
  );
}
