import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import html2canvas from "html2canvas";
import { Download, Linkedin, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { shareToLinkedIn } from "@/lib/shareLinkedIn";
import LinkedInPostSteps from "@/components/LinkedInPostSteps";
import {
  EXPORT_GOLD,
  EXPORT_TAGLINE_EN,
  EXPORT_TAGLINE_AR,
  EXPORT_AR_FONT,
  EXPORT_FOOTER_SIZE_BRAND,
  EXPORT_FOOTER_SIZE_TAGLINE,
} from "@/lib/exportBrand";

export interface MilestoneShareData {
  /** Display name e.g. "Five Signals Achieved" */
  name: string;
  /** Context line, already formatted */
  context: string;
  /** Earned date (ISO) — optional */
  earnedAt?: string | null;
  /** Emoji / icon char shown big in the card */
  icon?: string;
  /** First name for footer */
  firstName?: string | null;
  /** Tier / level for footer */
  level?: string | null;
  /** Sector for share text */
  sectorFocus?: string | null;
  /** Top strategic signal title for share caption */
  topSignal?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  data: MilestoneShareData;
}

const formatDate = (iso?: string | null) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  } catch { return ""; }
};

const MilestoneShareModal = ({ open, onClose, data }: Props) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [lang, setLang] = useState<"en" | "ar">("en");
  const [caption, setCaption] = useState("");
  const stableData = useRef<MilestoneShareData>(data);
  useEffect(() => {
    if (data && data.name) {
      stableData.current = data;
    }
  }, [data]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  useEffect(() => {
    setCaption(shareText);
  }, [lang, shareText]);

  if (!open) return null;
  if (!data && !stableData.current) return null;
  const d: MilestoneShareData = (data && data.name) ? data : stableData.current;

  const safeName = d.name || "Milestone achieved";
  const safeContext = (d.context && d.context !== "undefined")
    ? d.context
    : "Building presence, one step at a time.";
  const earnedLabel = d.earnedAt
    ? `Earned ${formatDate(d.earnedAt)}`
    : `Earned ${new Date().toLocaleDateString()}`;
  const footerLineRaw = [d.firstName, d.level].filter(Boolean).join(" · ");
  const footerLine = footerLineRaw || "aura-intel.org";
  const shareText = lang === "ar"
    ? [
        `خطوة جديدة في رحلتي المهنية ✦`,
        ``,
        d.level ? `وصلت لمستوى ${d.level} في الحضور الرقمي` : `حققت إنجاز جديد`,
        d.sectorFocus ? `في مجال ${d.sectorFocus}` : ``,
        safeContext,
        d.topSignal ? `أقوى إشارة: ${d.topSignal}` : ``,
        ``,
        `الخبرة لا تتحدث عن نفسها — لكن يمكنك أن تجعلها مرئية.`,
        ``,
        `#الحضور_الرقمي #التحول_الرقمي`,
      ].filter(Boolean).join("\n")
    : d.name
      ? [
          `Completed a new milestone: ${d.name}.`,
          ``,
          safeContext,
          d.topSignal ? `Strongest signal: ${d.topSignal}` : ``,
          ``,
          `Understanding your positioning is the first step to being visible where it matters.`,
          ``,
          `#DigitalPresence #StrategicIntelligence`,
        ].filter(Boolean).join("\n")
      : `Building presence with Aura.\n\n#DigitalPresence`;

  const handleDownload = async () => {
    if (!cardRef.current) return;
    setBusy(true);
    try {
      // Render the card inside an isolated iframe so fonts are guaranteed
      // loaded before html2canvas measures + paints. Fixes garbled,
      // overlapping text caused by the html2canvas letter-spacing +
      // custom-font measurement bug.
      const cardHtml = cardRef.current.outerHTML;
      const iframe = document.createElement("iframe");
      iframe.style.cssText = "position:fixed;left:-9999px;top:0;width:1200px;height:630px;border:none;";
      document.body.appendChild(iframe);
      let canvas: HTMLCanvasElement;
      try {
        const doc = iframe.contentDocument!;
        doc.open();
        doc.write(`<!DOCTYPE html>
          <html><head>
            <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=DM+Sans:wght@400;500;600&family=Cairo:wght@400;500;600;700&display=swap" rel="stylesheet">
            <style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body { width: 1200px; height: 630px; overflow: hidden; background: #111118; }
            </style>
          </head><body>${cardHtml}</body></html>`);
        doc.close();
        await iframe.contentWindow!.document.fonts.ready;
        await new Promise((r) => setTimeout(r, 500));
        canvas = await html2canvas(doc.body, {
          width: 1200,
          height: 630,
          scale: 2,
          useCORS: true,
          backgroundColor: "#111118",
          logging: false,
        });
      } finally {
        document.body.removeChild(iframe);
      }
      const blob = await new Promise<Blob | null>(res =>
        canvas.toBlob(b => res(b), "image/png")
      );
      if (!blob) {
        toast.error("Couldn't generate the image. Try again.");
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `aura-milestone-${safeName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Image downloaded!");
    } catch (err) {
      console.error("Milestone download failed:", err);
      toast.error("Download failed. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleShare = async () => {
    shareToLinkedIn({
      text: caption,
      url: "https://aura-intel.org/request-access",
      mode: "share",
      toastMessage: "Caption copied!",
    });
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target !== e.currentTarget || busy) return; onClose(); }}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.65)",
        zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24, overflowY: "auto",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--vellum, #fff)",
          borderRadius: 16,
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
          maxWidth: 720, width: "100%",
          padding: 24,
          position: "relative",
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute", top: 14, right: 14,
            background: "transparent", border: 0, cursor: "pointer",
            color: "var(--ink-3, #666)",
          }}
        >
          <X size={18} />
        </button>

        <div style={{ fontFamily: "var(--font-display, 'Cormorant Garamond')", fontSize: 22, color: "var(--ink, #111)", marginBottom: 4 }}>
          Share your milestone
        </div>
        <div style={{ fontSize: 13, color: "var(--ink-3, #666)", marginBottom: 18 }}>
          Preview your card, download it, or post directly to LinkedIn.
        </div>

        {/* Preview wrapper — scaled to fit modal */}
        <div
          style={{
            width: "100%",
            aspectRatio: "1200 / 630",
            overflow: "hidden",
            borderRadius: 10,
            border: "1px solid rgba(0,0,0,0.1)",
            background: "#111118",
            position: "relative",
          }}
        >
          <div
            style={{
              transform: "scale(var(--milestone-scale, 0.55))",
              transformOrigin: "top left",
              width: 1200, height: 630,
              position: "absolute", top: 0, left: 0,
            }}
          >
            {/* The actual 1200x630 card captured by html2canvas */}
            <div
              ref={cardRef}
              style={{
                width: 1200, height: 630,
                background: "#111118",
                color: "#fff",
                position: "relative",
                fontFamily: "'DM Sans', sans-serif",
                padding: "60px 70px",
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Top brand */}
              <div style={{ fontSize: 10, letterSpacing: "0.2em", color: "#B08D3A", fontWeight: 600 }}>
                AURA INTELLIGENCE
              </div>

              {/* Center block */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
                <div style={{ fontSize: 48, lineHeight: 1, marginBottom: 22 }}>
                  {d.icon || "✦"}
                </div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, color: "#fff", fontWeight: 500, marginBottom: 14 }}>
                  {safeName}
                </div>
                <div style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", maxWidth: 800, lineHeight: 1.5 }}>
                  {safeContext}
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 10 }}>
                  {earnedLabel}
                </div>
              </div>

              {/* Bottom: gold line + brand + bilingual tagline */}
              <div>
                <div style={{ height: 1, background: EXPORT_GOLD, width: 60, marginBottom: 12 }} />
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontSize: EXPORT_FOOTER_SIZE_BRAND, color: EXPORT_GOLD, fontWeight: 500 }}>
                    {footerLine}
                  </div>
                  <div style={{ fontSize: EXPORT_FOOTER_SIZE_TAGLINE, color: "rgba(255,255,255,0.8)" }}>
                    {EXPORT_TAGLINE_EN}
                  </div>
                  <div
                    dir="rtl"
                    lang="ar"
                    style={{
                      fontSize: EXPORT_FOOTER_SIZE_TAGLINE,
                      color: "rgba(255,255,255,0.8)",
                      fontFamily: EXPORT_AR_FONT,
                      textAlign: "right",
                    }}
                  >
                    {EXPORT_TAGLINE_AR}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <ScaleSetter />
        </div>

        {/* LinkedIn caption preview */}
        <div style={{
          marginTop: 16,
          padding: "12px 16px",
          background: "var(--color-background-secondary, #f5f3ee)",
          borderRadius: 8,
          position: "relative",
        }}>
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            {(["en", "ar"] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                style={{
                  padding: "4px 12px",
                  borderRadius: 20,
                  fontSize: 12,
                  cursor: "pointer",
                  background: lang === l ? "var(--brand, #B08D3A)" : "transparent",
                  color: lang === l ? "white" : "hsl(var(--muted-foreground))",
                  border: "0.5px solid hsl(var(--border))",
                  fontWeight: 500,
                }}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}>
            <span style={{
              fontSize: 12,
              fontWeight: 500,
              color: "var(--ink-3, #666)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}>
              LinkedIn caption
            </span>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(caption);
                  toast.success("Caption copied to clipboard!");
                } catch {
                  toast.error("Couldn't copy. Select the text manually.");
                }
              }}
              style={{
                fontSize: 12,
                padding: "4px 12px",
                borderRadius: 6,
                border: "0.5px solid rgba(0,0,0,0.15)",
                background: "transparent",
                cursor: "pointer",
                color: "var(--ink-3, #666)",
              }}
            >
              Copy text
            </button>
          </div>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            style={{
              width: "100%",
              minHeight: 80,
              background: "transparent",
              border: "1px solid rgba(0,0,0,0.12)",
              borderRadius: 6,
              padding: "8px 12px",
              fontSize: 13,
              lineHeight: 1.6,
              color: "hsl(var(--foreground))",
              resize: "vertical",
              fontFamily: "inherit",
              direction: lang === "ar" ? "rtl" : "ltr",
              textAlign: lang === "ar" ? "right" : "left",
            }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <Button variant="outline" onClick={handleDownload} disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="animate-spin" size={14} style={{ marginRight: 6 }} />
                Generating...
              </>
            ) : (
              <>
                <Download size={14} style={{ marginRight: 6 }} />
                Download PNG
              </>
            )}
          </Button>
          <Button onClick={handleShare} disabled={busy} style={{ background: "#0A66C2", color: "#fff" }}>
            <Linkedin size={14} style={{ marginRight: 6 }} />
            Share on LinkedIn
          </Button>
        </div>
        <LinkedInPostSteps withImage shareLabel="Share on LinkedIn" downloadLabel="Download PNG" />
      </div>
    </div>,
    document.body,
  );
};

/** Sets the --milestone-scale CSS var so the 1200px card fits its parent width. */
const ScaleSetter = () => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      el.style.setProperty("--milestone-scale", String(w / 1200));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return <div ref={ref} style={{ display: "none" }} />;
};

export default MilestoneShareModal;