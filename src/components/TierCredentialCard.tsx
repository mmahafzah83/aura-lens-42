import { forwardRef, useEffect, useRef, useState } from "react";
import html2canvas from "html2canvas";
import { Download, Copy, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { downloadBlob, trunc } from "@/components/visual-cards/exportCard";

interface Props {
  userId: string;
  tierName: string; // "Strategist" | "Authority" | etc
  earnedAt: string;
  onShared: () => void;
}

interface Profile {
  first_name?: string | null;
  level?: string | null;
  firm?: string | null;
}

const CARD_W = 1200;
const CARD_H = 628;

export default function TierCredentialCard({ userId, tierName, earnedAt, onShared }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [profile, setProfile] = useState<Profile>({});
  const [signals, setSignals] = useState(0);
  const [posts, setPosts] = useState(0);
  const [busy, setBusy] = useState<null | "download" | "copy">(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: prof }, { count: sig }, { count: pub }] = await Promise.all([
        supabase
          .from("diagnostic_profiles")
          .select("first_name,level,firm")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("strategic_signals")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("status", "active"),
        supabase
          .from("linkedin_posts")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .not("published_at", "is", null),
      ]);
      if (cancelled) return;
      if (prof) setProfile(prof as any);
      setSignals(sig ?? 0);
      setPosts(pub ?? 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const exportCard = async (): Promise<Blob | null> => {
    if (!cardRef.current) return null;
    const canvas = await html2canvas(cardRef.current, {
      width: CARD_W,
      height: CARD_H,
      scale: 2,
      useCORS: true,
      backgroundColor: null,
      logging: false,
      letterRendering: true,
    } as any);
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png", 1.0));
  };

  const handleDownload = async () => {
    setBusy("download");
    try {
      const blob = await exportCard();
      if (!blob) throw new Error("Export failed");
      downloadBlob(blob, `aura-${tierName.toLowerCase()}-credential.png`);
      toast.success("Credential downloaded");
      onShared();
    } catch (e: any) {
      toast.error(e.message || "Download failed");
    } finally {
      setBusy(null);
    }
  };

  const handleCopy = async () => {
    setBusy("copy");
    try {
      const blob = await exportCard();
      if (!blob) throw new Error("Export failed");
      // @ts-ignore
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setCopied(true);
      toast.success("Credential copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
      onShared();
    } catch (e: any) {
      toast.error(e.message || "Copy failed — try Download instead");
    } finally {
      setBusy(null);
    }
  };

  const fullName = trunc(profile.first_name || "Aura Member", 40);
  const role = trunc([profile.level, profile.firm].filter(Boolean).join(" · ") || "Strategic Operator", 64);
  const dateStr = new Date(earnedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Preview scale (so 1200x628 fits inside the modal)
  const previewScale = 0.4;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
      {/* Preview wrapper at scaled size */}
      <div
        style={{
          width: CARD_W * previewScale,
          height: CARD_H * previewScale,
          overflow: "hidden",
          borderRadius: 8,
          border: "1px solid var(--brand-line, rgba(197,165,90,0.25))",
        }}
      >
        <div
          style={{
            transform: `scale(${previewScale})`,
            transformOrigin: "top left",
            width: CARD_W,
            height: CARD_H,
          }}
        >
          <CredentialCardSurface
            ref={cardRef}
            tierName={tierName}
            fullName={fullName}
            role={role}
            dateStr={dateStr}
            signals={signals}
            posts={posts}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, width: "100%" }}>
        <button
          onClick={handleDownload}
          disabled={busy !== null}
          style={{
            flex: 1,
            padding: "12px 18px",
            borderRadius: 8,
            background: "var(--brand, #C5A55A)",
            color: "var(--ink-on-brand, #1a160f)",
            border: "none",
            fontWeight: 600,
            fontSize: 13,
            cursor: busy ? "wait" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          {busy === "download" ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          Download PNG
        </button>
        <button
          onClick={handleCopy}
          disabled={busy !== null}
          style={{
            flex: 1,
            padding: "12px 18px",
            borderRadius: 8,
            background: "transparent",
            color: "var(--ink, #f5efe1)",
            border: "1px solid var(--brand-line, rgba(197,165,90,0.3))",
            fontWeight: 500,
            fontSize: 13,
            cursor: busy ? "wait" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          {busy === "copy" ? (
            <Loader2 size={14} className="animate-spin" />
          ) : copied ? (
            <Check size={14} />
          ) : (
            <Copy size={14} />
          )}
          {copied ? "Copied!" : "Copy to clipboard"}
        </button>
      </div>
    </div>
  );
}

/* --- Credential card surface (1200x628 LinkedIn OG) --- */

interface SurfaceProps {
  tierName: string;
  fullName: string;
  role: string;
  dateStr: string;
  signals: number;
  posts: number;
}

const CredentialCardSurface = forwardRef<HTMLDivElement, SurfaceProps>(
  ({ tierName, fullName, role, dateStr, signals, posts }, ref) => {
    return (
      <div
        ref={ref}
        style={{
          width: CARD_W,
          height: CARD_H,
          background:
            "linear-gradient(135deg, #FAF6EE 0%, #F4ECDB 100%)",
          color: "#1a160f",
          fontFamily: "'DM Sans', system-ui, sans-serif",
          padding: "56px 72px",
          boxSizing: "border-box",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        {/* Gold corner ornaments */}
        <div style={{ position: "absolute", top: 24, left: 24, width: 48, height: 48, borderTop: "2px solid #C5A55A", borderLeft: "2px solid #C5A55A" }} />
        <div style={{ position: "absolute", top: 24, right: 24, width: 48, height: 48, borderTop: "2px solid #C5A55A", borderRight: "2px solid #C5A55A" }} />
        <div style={{ position: "absolute", bottom: 24, left: 24, width: 48, height: 48, borderBottom: "2px solid #C5A55A", borderLeft: "2px solid #C5A55A" }} />
        <div style={{ position: "absolute", bottom: 24, right: 24, width: 48, height: 48, borderBottom: "2px solid #C5A55A", borderRight: "2px solid #C5A55A" }} />

        {/* Header */}
        <div>
          <div
            style={{
              fontSize: 14,
              letterSpacing: 6,
              color: "#7a6a3f",
              fontWeight: 600,
            }}
          >
            AURA {tierName.toUpperCase()} CREDENTIAL
          </div>
          <div
            style={{
              marginTop: 8,
              height: 2,
              width: 64,
              background: "#C5A55A",
            }}
          />
        </div>

        {/* Body */}
        <div style={{ marginTop: -20 }}>
          <div
            style={{
              fontFamily: "'Cormorant Garamond', 'Times New Roman', serif",
              fontSize: 64,
              lineHeight: 1.05,
              color: "#1a160f",
              letterSpacing: -1,
            }}
          >
            {fullName}
          </div>
          <div style={{ marginTop: 10, fontSize: 18, color: "#3d362a" }}>{role}</div>
          <div style={{ marginTop: 4, fontSize: 13, color: "#7a6a3f" }}>Awarded {dateStr}</div>
        </div>

        {/* Footer */}
        <div>
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 14,
              color: "#3d362a",
              marginBottom: 14,
            }}
          >
            Active strategic signals: <span style={{ color: "#1a160f", fontWeight: 600 }}>{signals}</span>
            {"  ·  "}
            Published authority content: <span style={{ color: "#1a160f", fontWeight: 600 }}>{posts}</span>
          </div>
          <div
            style={{
              fontSize: 11,
              letterSpacing: 2,
              color: "#7a6a3f",
              textTransform: "uppercase",
            }}
          >
            Powered by Aura — Strategic Intelligence OS · aura-intel.org
          </div>
        </div>
      </div>
    );
  }
);
CredentialCardSurface.displayName = "CredentialCardSurface";