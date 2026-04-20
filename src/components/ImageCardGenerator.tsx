import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import html2canvas from "html2canvas";

type CardStyle = "statement" | "framework" | "split" | "arabic";

interface ImageCardGeneratorProps {
  postText: string;
  topicLabel: string;
  lang: "en" | "ar";
  userName?: string;
  userRole?: string;
}

function extractHook(text: string): string {
  const sentences = text.replace(/\*\*/g, "").replace(/\*/g, "").split(/(?<=[.!?،؟])\s+/);
  return sentences.slice(0, 2).join(" ").trim();
}

function extractLines(text: string): string[] {
  return text
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .split(/\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);
}

const STYLES: { key: CardStyle; label: string }[] = [
  { key: "statement", label: "Statement (dark)" },
  { key: "framework", label: "Framework (light)" },
  { key: "split", label: "Split (contrast)" },
  { key: "arabic", label: "Arabic (RTL)" },
];

export default function ImageCardGenerator({ postText, topicLabel, lang, userName, userRole }: ImageCardGeneratorProps) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CardStyle>("statement");
  const cardRef = useRef<HTMLDivElement>(null);

  const hook = extractHook(postText);
  const lines = extractLines(postText);

  const [hookText, setHookText] = useState(hook);
  const [tag, setTag] = useState(topicLabel);
  const [name, setName] = useState(userName || "Your Name");
  const [role, setRole] = useState(userRole || "Your Role");
  const [leftItems, setLeftItems] = useState(lines.slice(0, 4).join("\n"));
  const [rightItems, setRightItems] = useState(lines.slice(4, 8).join("\n"));
  const [frameworkTitle, setFrameworkTitle] = useState(topicLabel);
  const [frameworkPoints, setFrameworkPoints] = useState(
    lines.slice(0, 3).map((l, i) => ({ title: l.slice(0, 60), subtitle: "" }))
  );
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    setHookText(hook);
    setTag(topicLabel);
    setLeftItems(lines.slice(0, 4).join("\n"));
    setRightItems(lines.slice(4, 8).join("\n"));
    setFrameworkTitle(topicLabel);
    setFrameworkPoints(
      lines.slice(0, 3).map(l => ({ title: l.slice(0, 60), subtitle: "" }))
    );
  }, [postText, topicLabel]);

  useEffect(() => {
    if (userName) setName(userName);
  }, [userName]);

  useEffect(() => {
    if (userRole) setRole(userRole);
  }, [userRole]);

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
      link.download = `aura-card-${style}-${date}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch {
      // silent fail
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

  const leftArr = leftItems.split("\n").filter(l => l.trim());
  const rightArr = rightItems.split("\n").filter(l => l.trim());

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="rounded-2xl border border-border/10 bg-secondary/10 overflow-hidden"
    >
      {/* Style selector */}
      <div className="p-4 border-b border-border/10 flex flex-wrap gap-2">
        {STYLES.map(s => (
          <button
            key={s.key}
            onClick={() => setStyle(s.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
              style === s.key
                ? "bg-primary/10 border-primary/30 text-primary"
                : "bg-secondary/20 border-border/10 text-muted-foreground hover:border-border/30"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row gap-0">
        {/* Card Preview */}
        <div className="flex-1 p-6 flex items-center justify-center bg-[#161616] min-h-[400px]">
          <div ref={cardRef} className="w-[400px]">
            {style === "statement" && (
              <StatementCard hook={hookText} tag={tag} name={name} role={role} />
            )}
            {style === "framework" && (
              <FrameworkCard title={frameworkTitle} points={frameworkPoints} name={name} />
            )}
            {style === "split" && (
              <SplitCard leftItems={leftArr} rightItems={rightArr} name={name} hook={hookText} />
            )}
            {style === "arabic" && (
              <ArabicCard hook={lang === "ar" ? hookText : ""} name={name} role={role} tag={tag} />
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="w-full lg:w-72 p-5 space-y-4 border-t lg:border-t-0 lg:border-l border-border/10">
          <p className="text-label uppercase tracking-wider text-[10px] font-semibold text-muted-foreground">Edit Card</p>

          {(style === "statement" || style === "arabic") && (
            <>
              <div>
                <label className="text-[11px] text-muted-foreground/60 mb-1 block">Topic Tag</label>
                <Input value={tag} onChange={e => setTag(e.target.value)} className="bg-background border-border text-foreground text-xs focus:border-[hsl(43_80%_45%)]" />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground/60 mb-1 block">Hook Text</label>
                <Textarea value={hookText} onChange={e => setHookText(e.target.value)} className="bg-background border-border text-foreground text-xs min-h-[80px] focus:border-[hsl(43_80%_45%)]" />
              </div>
            </>
          )}

          {style === "framework" && (
            <>
              <div>
                <label className="text-[11px] text-muted-foreground/60 mb-1 block">Headline</label>
                <Input value={frameworkTitle} onChange={e => setFrameworkTitle(e.target.value)} className="bg-background border-border text-foreground text-xs focus:border-[hsl(43_80%_45%)]" />
              </div>
              {frameworkPoints.map((pt, idx) => (
                <div key={idx}>
                  <label className="text-[11px] text-muted-foreground/60 mb-1 block">Point {idx + 1}</label>
                  <Input
                    value={pt.title}
                    onChange={e => {
                      const next = [...frameworkPoints];
                      next[idx] = { ...next[idx], title: e.target.value };
                      setFrameworkPoints(next);
                    }}
                    className="bg-background border-border text-foreground text-xs mb-1 focus:border-[hsl(43_80%_45%)]"
                    placeholder="Title"
                  />
                  <Input
                    value={pt.subtitle}
                    onChange={e => {
                      const next = [...frameworkPoints];
                      next[idx] = { ...next[idx], subtitle: e.target.value };
                      setFrameworkPoints(next);
                    }}
                    className="bg-background border-border text-foreground text-xs focus:border-[hsl(43_80%_45%)]"
                    placeholder="Subtitle (optional)"
                  />
                </div>
              ))}
            </>
          )}

          {style === "split" && (
            <>
              <div>
                <label className="text-[11px] text-muted-foreground/60 mb-1 block">Left Column (one per line)</label>
                <Textarea value={leftItems} onChange={e => setLeftItems(e.target.value)} className="bg-background border-border text-foreground text-xs min-h-[80px] focus:border-[hsl(43_80%_45%)]" />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground/60 mb-1 block">Right Column (one per line)</label>
                <Textarea value={rightItems} onChange={e => setRightItems(e.target.value)} className="bg-background border-border text-foreground text-xs min-h-[80px] focus:border-[hsl(43_80%_45%)]" />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground/60 mb-1 block">Closing Line</label>
                <Input value={hookText} onChange={e => setHookText(e.target.value)} className="bg-background border-border text-foreground text-xs focus:border-[hsl(43_80%_45%)]" />
              </div>
            </>
          )}

          <div>
            <label className="text-[11px] text-muted-foreground/60 mb-1 block">Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} className="bg-background border-border text-foreground text-xs focus:border-[hsl(43_80%_45%)]" />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground/60 mb-1 block">Role</label>
            <Input value={role} onChange={e => setRole(e.target.value)} className="bg-background border-border text-foreground text-xs focus:border-[hsl(43_80%_45%)]" />
          </div>

          <Button
            onClick={downloadPNG}
            disabled={downloading}
            className="w-full gap-2"
          >
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

/* ── Card Components ── */

function StatementCard({ hook, tag, name, role }: { hook: string; tag: string; name: string; role: string }) {
  return (
    <div style={{ background: "#0d0d0d", border: "1px solid #1e1e1e", borderRadius: 16, padding: 32, position: "relative", overflow: "hidden", minHeight: 300 }}>
      {/* Gold triangle */}
      <div style={{ position: "absolute", top: 0, right: 0, width: 80, height: 80, background: "#F97316", clipPath: "polygon(100% 0, 0 0, 100% 100%)" }} />
      {/* Tag */}
      <p style={{ color: "#F97316", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 16 }}>{tag}</p>
      {/* Hook */}
      <p style={{ color: "#fff", fontSize: 16, fontWeight: 800, lineHeight: 1.55, marginBottom: 20 }}>{hook}</p>
      {/* Divider */}
      <div style={{ width: 40, height: 2, background: "#F97316", marginBottom: 16 }} />
      {/* Footer */}
      <p style={{ color: "#F97316", fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" }}>{name}</p>
      <p style={{ color: "#555", fontSize: 10, marginTop: 2 }}>{role}</p>
      {/* AURA mark */}
      <p style={{ position: "absolute", bottom: 16, right: 20, color: "#F97316", fontSize: 8, fontWeight: 700, letterSpacing: 3, opacity: 0.5 }}>AURA</p>
    </div>
  );
}

function FrameworkCard({ title, points, name }: { title: string; points: { title: string; subtitle: string }[]; name: string }) {
  return (
    <div style={{ background: "#faf8f4", border: "1px solid #e8e4da", borderRadius: 16, padding: 32, minHeight: 300 }}>
      {/* Eyebrow */}
      <p style={{ color: "#F97316", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>FRAMEWORK</p>
      {/* Title */}
      <p style={{ color: "#1a1a1a", fontSize: 18, fontWeight: 900, lineHeight: 1.3, marginBottom: 12 }}>{title}</p>
      {/* Accent bar */}
      <div style={{ width: 32, height: 3, background: "#F97316", marginBottom: 20 }} />
      {/* Points */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {points.map((pt, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ width: 24, height: 24, borderRadius: 12, background: "#F97316", color: "#ffffff", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {i + 1}
            </div>
            <div>
              <p style={{ color: "#1a1a1a", fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>{pt.title}</p>
              {pt.subtitle && <p style={{ color: "#888", fontSize: 11, marginTop: 2 }}>{pt.subtitle}</p>}
            </div>
          </div>
        ))}
      </div>
      {/* Footer */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24 }}>
        <p style={{ color: "#1a1a1a", fontSize: 11, fontWeight: 600 }}>{name}</p>
        <p style={{ color: "#F97316", fontSize: 11, fontWeight: 600 }}>Save this ↑</p>
      </div>
    </div>
  );
}

function SplitCard({ leftItems, rightItems, name, hook }: { leftItems: string[]; rightItems: string[]; name: string; hook: string }) {
  return (
    <div style={{ borderRadius: 16, overflow: "hidden", border: "1px solid #1e1e1e", minHeight: 300 }}>
      {/* Header */}
      <div style={{ background: "#0d0d0d", padding: "16px 24px", borderBottom: "2px solid #F97316" }}>
        <p style={{ color: "#fff", fontSize: 14, fontWeight: 800 }}>Compare & Contrast</p>
      </div>
      {/* Columns */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
        {/* Left */}
        <div style={{ background: "#faf8f4", padding: 20 }}>
          <p style={{ color: "#888", fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>BEFORE</p>
          {leftItems.map((item, i) => (
            <div key={i} style={{ borderLeft: "2px solid #ccc", paddingLeft: 10, marginBottom: 8 }}>
              <p style={{ color: "#333", fontSize: 11, lineHeight: 1.4 }}>{item}</p>
            </div>
          ))}
        </div>
        {/* Right */}
        <div style={{ background: "#0d0d0d", padding: 20 }}>
          <p style={{ color: "#F97316", fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>AFTER</p>
          {rightItems.map((item, i) => (
            <div key={i} style={{ borderLeft: "2px solid #F97316", paddingLeft: 10, marginBottom: 8 }}>
              <p style={{ color: "#fff", fontSize: 11, lineHeight: 1.4 }}>{item}</p>
            </div>
          ))}
        </div>
      </div>
      {/* Footer */}
      <div style={{ background: "#0d0d0d", padding: "12px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <p style={{ color: "#F97316", fontSize: 10, fontWeight: 700 }}>{name}</p>
        <p style={{ color: "#666", fontSize: 10, fontStyle: "italic" }}>{hook.slice(0, 60)}</p>
      </div>
    </div>
  );
}

function ArabicCard({ hook, name, role, tag }: { hook: string; name: string; role: string; tag: string }) {
  return (
    <div dir="rtl" style={{ background: "#0d0d0d", border: "1px solid #1e1e1e", borderRadius: 16, padding: 32, position: "relative", minHeight: 300 }}>
      {/* Three gold dots */}
      <div style={{ position: "absolute", top: 20, left: 20, display: "flex", gap: 4 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ width: 6, height: 6, borderRadius: 3, background: "#F97316" }} />
        ))}
      </div>
      {/* AURA top right */}
      <p style={{ position: "absolute", top: 20, right: 24, color: "#F97316", fontSize: 10, fontWeight: 700, letterSpacing: 3 }}>AURA</p>
      {/* Tag */}
      <p style={{ color: "#F97316", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginTop: 24, marginBottom: 16, textAlign: "right" }}>{tag}</p>
      {/* Hook */}
      <p style={{ color: "#fff", fontSize: 16, fontWeight: 700, lineHeight: 2.1, textAlign: "right", direction: "rtl" }}>
        {hook || "اكتب النص العربي هنا..."}
      </p>
      {/* Accent bar */}
      <div style={{ width: 32, height: 2, background: "#F97316", marginTop: 20, marginBottom: 16, marginRight: 0, marginLeft: "auto" }} />
      {/* Footer */}
      <p style={{ color: "#F97316", fontSize: 11, fontWeight: 700, textAlign: "right" }}>{name}</p>
      <p style={{ color: "#555", fontSize: 10, textAlign: "right", marginTop: 2 }}>{role}</p>
    </div>
  );
}
