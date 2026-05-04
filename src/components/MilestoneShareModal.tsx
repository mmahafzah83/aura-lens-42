import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import html2canvas from "html2canvas";
import { Download, Linkedin, X } from "lucide-react";
import { Button } from "@/components/ui/button";

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

  if (!open) return null;

  const earnedLabel = data.earnedAt ? `Earned ${formatDate(data.earnedAt)}` : "";
  const footerLine = [data.firstName, data.level].filter(Boolean).join(" · ");
  const shareText = `I just earned the '${data.name}' milestone on Aura — ${data.context}. Building strategic intelligence in ${data.sectorFocus || "my field"}. #StrategicIntelligence #Aura`;

  const generateBlob = async (): Promise<Blob | null> => {
    if (!cardRef.current) return null;
    const canvas = await html2canvas(cardRef.current, {
      backgroundColor: "#111118",
      scale: 2,
      useCORS: true,
      logging: false,
    });
    return await new Promise(res => canvas.toBlob(b => res(b), "image/png"));
  };

  const handleDownload = async () => {
    setBusy(true);
    try {
      const blob = await generateBlob();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `aura-milestone-${data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
    } catch { /* ignore */ }
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent("https://aura-intel.org/request-access")}&text=${encodeURIComponent(shareText)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
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
              <div style={{ fontSize: 9, letterSpacing: "0.2em", color: "#C5A55A", fontWeight: 600 }}>
                AURA INTELLIGENCE
              </div>

              {/* Center block */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
                <div style={{ fontSize: 48, lineHeight: 1, marginBottom: 22 }}>
                  {data.icon || "✦"}
                </div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, color: "#fff", fontWeight: 500, marginBottom: 14 }}>
                  {data.name}
                </div>
                <div style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", maxWidth: 800, lineHeight: 1.5 }}>
                  {data.context}
                </div>
                {earnedLabel && (
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 10 }}>
                    {earnedLabel}
                  </div>
                )}
              </div>

              {/* Bottom: gold line + name */}
              <div>
                <div style={{ height: 1, background: "#C5A55A", width: 60, marginBottom: 12 }} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                  <div style={{ fontSize: 12, color: "#C5A55A" }}>
                    {footerLine}
                  </div>
                  <div style={{ fontSize: 8, letterSpacing: "0.2em", color: "rgba(197,165,90,0.25)", fontWeight: 600 }}>
                    AURA
                  </div>
                </div>
              </div>
            </div>
          </div>
          <ScaleSetter />
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <Button variant="outline" onClick={handleDownload} disabled={busy}>
            <Download size={14} style={{ marginRight: 6 }} />
            Download PNG
          </Button>
          <Button onClick={handleShare} disabled={busy} style={{ background: "#0A66C2", color: "#fff" }}>
            <Linkedin size={14} style={{ marginRight: 6 }} />
            Share on LinkedIn
          </Button>
        </div>
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