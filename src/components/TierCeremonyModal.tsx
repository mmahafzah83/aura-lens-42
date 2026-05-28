import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { toast } from "sonner";
import { Download, Copy, FileText, X, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import useMilestones, { type Milestone } from "@/hooks/useMilestones";
import { shareToLinkedIn } from "@/lib/shareLinkedIn";
import {
  CONCEPTS,
  type ConceptKey,
  type CredentialData,
} from "@/components/TierCredentialCard";

interface Props {
  userId: string | null;
}

const TIER_QUOTES: Record<string, string> = {
  observer: "Every signal starts with one capture.",
  strategist: "The market is starting to see what you already know.",
  authority: "Your sector watches you before you speak.",
};

const TIER_NEXT: Record<string, { name: string; threshold: number } | null> = {
  observer: { name: "Strategist", threshold: 35 },
  strategist: { name: "Authority", threshold: 65 },
  authority: null,
};

const BG = "#0c0b0a";
const GOLD = "#D4B056";
const GOLD_LINE = "rgba(212,176,86,.25)";
const TEXT = "#f0ede8";
const TEXT_MUTED = "rgba(240,237,232,.55)";
const SERIF = "'Cormorant Garamond', 'Cairo', Georgia, serif";

export default function TierCeremonyModal({ userId }: Props) {
  const { unacknowledgedMilestones, acknowledgeMilestone, shareMilestone } =
    useMilestones(userId);

  const tierMilestone: Milestone | undefined = useMemo(
    () => unacknowledgedMilestones.find((m) => m.milestone_id?.startsWith("tier_")),
    [unacknowledgedMilestones]
  );

  // Once-per-session gate so the modal doesn't reappear on rapid refreshes
  // before the optimistic acknowledgement is persisted.
  const [sessionGate, setSessionGate] = useState(false);
  useEffect(() => {
    if (!tierMilestone) return;
    try {
      const key = `aura_tier_ceremony_seen_${tierMilestone.id}`;
      if (sessionStorage.getItem(key) === "1") setSessionGate(true);
      else sessionStorage.setItem(key, "1");
    } catch {}
  }, [tierMilestone]);

  const [profile, setProfile] = useState<{
    first_name?: string | null;
    last_name?: string | null;
    level?: string | null;
    firm?: string | null;
    sector_focus?: string | null;
  }>({});
  const [score, setScore] = useState<number | null>(null);
  const [topSignal, setTopSignal] = useState<{ title: string; confidence: number } | null>(null);

  const [step, setStep] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [concept, setConcept] = useState<ConceptKey>("A");
  const [lang, setLang] = useState<"EN" | "AR">("EN");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!tierMilestone || !userId) return;
    let cancelled = false;
    (async () => {
      const [{ data: prof }, { data: sigTop }, { data: latestSnapshot }] =
        await Promise.all([
          supabase
            .from("diagnostic_profiles")
            .select("first_name,last_name,level,firm,sector_focus")
            .eq("user_id", userId)
            .maybeSingle(),
          supabase
            .from("strategic_signals")
            .select("signal_title,confidence")
            .eq("user_id", userId)
            .eq("status", "active")
            .order("confidence", { ascending: false })
            .limit(1)
            .maybeSingle(),
          (supabase.from("score_snapshots") as any)
            .select("score")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
      if (cancelled) return;
      if (prof) setProfile(prof as any);
      const ctx = (tierMilestone.context || {}) as any;
      const t = sigTop as any;
      setTopSignal(
        t?.signal_title
          ? { title: t.signal_title, confidence: Number(t.confidence) || 0 }
          : ctx?.top_signal_title
          ? { title: ctx.top_signal_title, confidence: 0 }
          : null
      );
      const snapScore = (latestSnapshot as any)?.score;
      setScore(
        typeof snapScore === "number"
          ? Math.round(snapScore)
          : typeof ctx?.score === "number"
          ? Math.round(ctx.score)
          : null
      );
      requestAnimationFrame(() => setMounted(true));
    })();
    return () => {
      cancelled = true;
    };
  }, [tierMilestone, userId]);

  // Esc closes
  useEffect(() => {
    if (!tierMilestone || sessionGate) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tierMilestone, sessionGate, busy]);

  const tierName = useMemo(() => {
    if (!tierMilestone) return "";
    const raw = tierMilestone.milestone_id.replace("tier_", "");
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }, [tierMilestone]);

  const quote = TIER_QUOTES[tierName.toLowerCase()] || TIER_QUOTES.strategist;

  const fullName = useMemo(() => {
    const parts = [profile.first_name, profile.last_name].filter(Boolean);
    return parts.join(" ") || "Aura Member";
  }, [profile]);

  const role = useMemo(
    () => [profile.level, profile.firm].filter(Boolean).join(" · ") || "Strategic Operator",
    [profile]
  );

  const data: CredentialData = {
    tierName,
    fullName,
    role,
    sector: profile.sector_focus || undefined,
    score,
    quote,
    topSignalTitle: topSignal?.title,
    topSignalConfidence: topSignal?.confidence,
  };

  const close = () => {
    if (dismissing || !tierMilestone || busy) return;
    setDismissing(true);
    setMounted(false);
    // Fire-and-forget — hook updates local state optimistically.
    void acknowledgeMilestone(tierMilestone.id);
  };

  // Close for the current session WITHOUT acknowledging — modal will
  // re-appear next session so the user can return to their credential.
  const closeForSession = () => {
    if (busy || !tierMilestone) return;
    try {
      sessionStorage.setItem(`aura_tier_ceremony_seen_${tierMilestone.id}`, "1");
    } catch {}
    setMounted(false);
    setSessionGate(true);
  };

  // --- Export refs (off-screen full-size cards we capture from) ---
  const wideRef = useRef<HTMLDivElement>(null);
  const squareRef = useRef<HTMLDivElement>(null);

  const exportCanvas = async (
    target: HTMLDivElement | null,
    w: number,
    h: number
  ): Promise<HTMLCanvasElement | null> => {
    if (!target) return null;
    return await html2canvas(target, {
      width: w,
      height: h,
      scale: 2,
      useCORS: true,
      backgroundColor: BG,
      logging: false,
    } as any);
  };

  const toBlob = (canvas: HTMLCanvasElement): Promise<Blob | null> =>
    new Promise((res) => canvas.toBlob((b) => res(b), "image/png", 1));

  const filename = (ext: string, square = false) =>
    `aura-${tierName.toLowerCase()}-credential${square ? "-square" : ""}.${ext}`;

  const downloadPng = async (square = false) => {
    setBusy(square ? "sq-png" : "png");
    try {
      const c = square
        ? await exportCanvas(squareRef.current, 1080, 1080)
        : await exportCanvas(wideRef.current, 1200, 628);
      if (!c) throw new Error("Export failed");
      const blob = await toBlob(c);
      if (!blob) throw new Error("Encode failed");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename("png", square);
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Credential downloaded");
      if (tierMilestone) void shareMilestone(tierMilestone.id);
    } catch (e: any) {
      toast.error(e.message || "Download failed");
    } finally {
      setBusy(null);
    }
  };

  const downloadPdf = async () => {
    setBusy("pdf");
    try {
      const c = await exportCanvas(wideRef.current, 1200, 628);
      if (!c) throw new Error("Export failed");
      const img = c.toDataURL("image/png", 1.0);
      const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [1200, 628] });
      pdf.addImage(img, "PNG", 0, 0, 1200, 628);
      pdf.save(filename("pdf"));
      toast.success("PDF downloaded");
      if (tierMilestone) void shareMilestone(tierMilestone.id);
    } catch (e: any) {
      toast.error(e.message || "PDF export failed");
    } finally {
      setBusy(null);
    }
  };

  const copyImage = async () => {
    setBusy("copy");
    try {
      const c = await exportCanvas(wideRef.current, 1200, 628);
      if (!c) throw new Error("Export failed");
      const blob = await toBlob(c);
      if (!blob) throw new Error("Encode failed");
      // @ts-ignore
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast.success("Credential copied — paste anywhere");
      if (tierMilestone) void shareMilestone(tierMilestone.id);
    } catch (e: any) {
      toast.error(e.message || "Copy failed — try Download");
    } finally {
      setBusy(null);
    }
  };

  const buildPost = (which: "EN" | "AR") => {
    const sc = score ?? "—";
    const sig = topSignal?.title || data.quote;
    const confPct = topSignal?.confidence ? Math.round(topSignal.confidence * 100) : 80;
    if (which === "AR") {
      return `حققت ${sc} على Aura.\n\nمو اختبار..\n\nنظام يقرأ اللي أقرأه، يكتشف الأنماط اللي ما انتبهت لها، ويخبرني إن السوق تحرّك قبل ما ألاحظ.\n\nالحين يتابع ${sig}..\n\n${confPct}٪ ثقة.. ومستمرة.\n\nإذا خبرتك موجودة بس السوق ما يشوفها..\n\nهذا اللي صنع الفرق.\n\naura-intel.org`;
    }
    return `Scored ${sc} on Aura.\n\nNot a test. A signal tracker. It reads what I read, finds the patterns I miss, and tells me when the market is moving before I notice.\n\nRight now it's tracking ${sig}. ${confPct}% confidence. Still growing.\n\nIf you're a senior professional whose expertise is invisible to the market — you'll want to see this.\n\naura-intel.org`;
  };

  const shareLinkedIn = async () => {
    setBusy("share");
    try {
      // Download image
      const c = await exportCanvas(wideRef.current, 1200, 628);
      if (c) {
        const blob = await toBlob(c);
        if (blob) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = filename("png");
          a.click();
          URL.revokeObjectURL(url);
        }
      }
      await shareToLinkedIn({
        text: buildPost(lang),
        mode: "feed",
        toastMessage: "Text copied and image downloaded — paste both into LinkedIn",
      });
      if (tierMilestone) void shareMilestone(tierMilestone.id);
    } catch (e: any) {
      toast.error(e.message || "Share failed");
    } finally {
      setBusy(null);
    }
  };

  if (!tierMilestone || sessionGate) return null;

  const next = TIER_NEXT[tierName.toLowerCase()];

  const SelectedConcept = CONCEPTS.find((c) => c.key === concept)!.component;

  const node = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`You have reached ${tierName} tier`}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        opacity: mounted ? 1 : 0,
        transition: "opacity 350ms ease-out",
        padding: 20,
        overflowY: "auto",
      }}
    >
      {/* Off-screen export surfaces (selected concept) */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          left: -99999,
          top: 0,
          pointerEvents: "none",
        }}
      >
        <SelectedConcept ref={wideRef} data={data} size="wide" />
        <SelectedConcept ref={squareRef} data={data} size="square" />
      </div>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: step === 1 ? 720 : 560,
          background: BG,
          color: TEXT,
          border: `1px solid ${GOLD_LINE}`,
          borderRadius: 16,
          padding: 36,
          boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
          fontFamily: "'DM Sans', system-ui, sans-serif",
          position: "relative",
          transform: mounted ? "translateY(0)" : "translateY(8px)",
          transition: "transform 350ms ease-out",
        }}
      >
        <button
          aria-label="Close"
          onClick={close}
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            background: "transparent",
            border: 0,
            color: TEXT_MUTED,
            cursor: "pointer",
            padding: 6,
            borderRadius: 6,
          }}
        >
          <X size={18} />
        </button>

        <div key={step} className="aura-step-fade" style={{ animation: "auraFade 280ms ease-out" }}>
          {step === 0 && (
            <StepReveal tierName={tierName} quote={quote} fullName={fullName} role={role} />
          )}
          {step === 1 && (
            <StepCredential
              data={data}
              concept={concept}
              setConcept={setConcept}
              lang={lang}
              setLang={setLang}
              busy={busy}
              onDownloadPng={() => downloadPng(false)}
              onDownloadPdf={downloadPdf}
              onCopy={copyImage}
              onShare={shareLinkedIn}
              onDownloadSquare={() => downloadPng(true)}
            />
          )}
          {step === 2 && (
            <StepNext
              score={score}
              next={next}
              topSignalTitle={topSignal?.title}
            />
          )}
        </div>

        {/* Dots + CTA row */}
        <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 18, alignItems: "center" }}>
          <Dots step={step} total={3} />
          {step === 0 && (
            <button
              onClick={() => setStep(1)}
              style={primaryBtn}
            >
              See your credential →
            </button>
          )}
          {step === 1 && (
            <button onClick={() => setStep(2)} style={ghostBtn}>
              Continue →
            </button>
          )}
          {step === 2 && (
            <button onClick={close} style={primaryBtn}>
              Let&apos;s go →
            </button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes auraFade {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );

  return createPortal(node, document.body);
}

/* ─────────────── Step components ─────────────── */

function StepReveal({
  tierName,
  quote,
  fullName,
  role,
}: {
  tierName: string;
  quote: string;
  fullName: string;
  role: string;
}) {
  return (
    <div style={{ textAlign: "center", padding: "16px 4px 0" }}>
      <div
        style={{
          fontSize: 10,
          letterSpacing: ".3em",
          textTransform: "uppercase",
          color: GOLD,
          marginBottom: 28,
        }}
      >
        ✦ &nbsp; {tierName} &nbsp; ✦
      </div>
      <div
        style={{
          fontFamily: SERIF,
          fontSize: 28,
          lineHeight: 1.25,
          color: TEXT,
          maxWidth: 420,
          margin: "0 auto",
        }}
      >
        &ldquo;{quote}&rdquo;
      </div>
      <div
        style={{
          marginTop: 28,
          fontSize: 11,
          letterSpacing: ".22em",
          textTransform: "uppercase",
          color: TEXT_MUTED,
        }}
      >
        {fullName} · {role}
      </div>
    </div>
  );
}

function StepCredential({
  data,
  concept,
  setConcept,
  lang,
  setLang,
  busy,
  onDownloadPng,
  onDownloadPdf,
  onCopy,
  onShare,
  onDownloadSquare,
}: {
  data: CredentialData;
  concept: ConceptKey;
  setConcept: (k: ConceptKey) => void;
  lang: "EN" | "AR";
  setLang: (l: "EN" | "AR") => void;
  busy: string | null;
  onDownloadPng: () => void;
  onDownloadPdf: () => void;
  onCopy: () => void;
  onShare: () => void;
  onDownloadSquare: () => void;
}) {
  const PREVIEW_W = 200;
  const scale = PREVIEW_W / 1200;
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          letterSpacing: ".25em",
          textTransform: "uppercase",
          color: GOLD,
          textAlign: "center",
          marginBottom: 8,
        }}
      >
        Your Credential
      </div>
      <div style={{ fontFamily: SERIF, fontSize: 22, color: TEXT, textAlign: "center", marginBottom: 18 }}>
        Choose a style
      </div>

      {/* Concept selector */}
      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginBottom: 20 }}>
        {CONCEPTS.map(({ key, label, component: Cmp }) => {
          const selected = key === concept;
          return (
            <button
              key={key}
              onClick={() => setConcept(key)}
              style={{
                background: "transparent",
                border: `1.5px solid ${selected ? GOLD : GOLD_LINE}`,
                borderRadius: 10,
                padding: 6,
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
              }}
            >
              <div
                style={{
                  width: PREVIEW_W,
                  height: PREVIEW_W * (628 / 1200),
                  overflow: "hidden",
                  borderRadius: 4,
                  position: "relative",
                  background: BG,
                }}
              >
                <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
                  <Cmp data={data} size="wide" />
                </div>
              </div>
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: ".2em",
                  textTransform: "uppercase",
                  color: selected ? GOLD : TEXT_MUTED,
                }}
              >
                {label}
              </div>
            </button>
          );
        })}
      </div>

      {/* Subtle action buttons */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginBottom: 14 }}>
        <SubtleBtn onClick={onDownloadPng} disabled={!!busy} icon={<Download size={13} />} label={busy === "png" ? "…" : "PNG"} />
        <SubtleBtn onClick={onDownloadPdf} disabled={!!busy} icon={<FileText size={13} />} label={busy === "pdf" ? "…" : "PDF"} />
        <SubtleBtn onClick={onCopy} disabled={!!busy} icon={<Copy size={13} />} label={busy === "copy" ? "…" : "Copy"} />
      </div>

      {/* LinkedIn share with language pills */}
      <div
        style={{
          marginTop: 8,
          padding: 16,
          border: `1px solid ${GOLD_LINE}`,
          borderRadius: 10,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12 }}>
          <div style={{ fontSize: 12, color: TEXT_MUTED, letterSpacing: ".05em" }}>Share on LinkedIn</div>
          <div style={{ display: "flex", gap: 4 }}>
            {(["EN", "AR"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                style={{
                  padding: "4px 10px",
                  fontSize: 11,
                  letterSpacing: ".15em",
                  borderRadius: 999,
                  border: `1px solid ${lang === l ? GOLD : GOLD_LINE}`,
                  background: lang === l ? "rgba(212,176,86,.12)" : "transparent",
                  color: lang === l ? GOLD : TEXT_MUTED,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={onShare}
          disabled={!!busy}
          style={{ ...primaryBtn, width: "100%" }}
        >
          {busy === "share" ? "Preparing…" : `Share on LinkedIn (${lang})`}
        </button>
      </div>

      <div style={{ marginTop: 12, textAlign: "center" }}>
        <button
          onClick={onDownloadSquare}
          disabled={!!busy}
          style={{
            background: "transparent",
            border: 0,
            color: TEXT_MUTED,
            fontSize: 11,
            cursor: "pointer",
            textDecoration: "underline",
            letterSpacing: ".05em",
          }}
        >
          {busy === "sq-png" ? "Preparing…" : "Download square version (1080×1080) ↓"}
        </button>
      </div>
    </div>
  );
}

function StepNext({
  score,
  next,
  topSignalTitle,
}: {
  score: number | null;
  next: { name: string; threshold: number } | null;
  topSignalTitle?: string;
}) {
  const moves = [
    {
      tone: "danger",
      label: "PUBLISH",
      action: topSignalTitle
        ? `Publish from your ${truncate(topSignalTitle, 40)} signal`
        : "Publish from your strongest signal",
      helper: "Biggest single score boost",
      pts: "+8 pts",
    },
    {
      tone: "warning",
      label: "CAPTURE",
      action: "Capture 2 more articles this week",
      helper: "Raises consistency + confidence",
      pts: "+5 pts",
    },
    {
      tone: "info",
      label: "IMPACT",
      action: "Upload LinkedIn analytics",
      helper: "Unlocks your full impact dashboard",
      pts: "+6 pts",
    },
  ] as const;

  return (
    <div style={{ padding: "8px 4px 0" }}>
      <div style={{ textAlign: "center", marginBottom: 18 }}>
        <div
          style={{
            fontSize: 11,
            letterSpacing: ".25em",
            textTransform: "uppercase",
            color: GOLD,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 12,
          }}
        >
          <Target size={14} /> Your next milestone
        </div>
        {next ? (
          <>
            <div style={{ fontFamily: SERIF, fontSize: 22, color: TEXT, marginBottom: 6 }}>
              {next.name} tier: {next.threshold} points
            </div>
            <div style={{ fontSize: 13, color: TEXT_MUTED }}>
              You&apos;re at {score ?? "—"}. Fastest path:
            </div>
          </>
        ) : (
          <div style={{ fontFamily: SERIF, fontSize: 22, color: TEXT }}>
            You&apos;ve reached the top tier — keep compounding.
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {moves.map((m) => (
          <MoveRow key={m.label} {...m} />
        ))}
      </div>
    </div>
  );
}

function MoveRow({
  tone,
  label,
  action,
  helper,
  pts,
}: {
  tone: "danger" | "warning" | "info";
  label: string;
  action: string;
  helper: string;
  pts: string;
}) {
  const dot =
    tone === "danger" ? "#E07857" : tone === "warning" ? GOLD : "#8AB4D8";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 16px",
        borderRadius: 10,
        border: `1px solid ${GOLD_LINE}`,
        background: "rgba(212,176,86,.03)",
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 999,
          background: `${dot}22`,
          border: `1px solid ${dot}66`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          letterSpacing: ".15em",
          color: dot,
          fontWeight: 700,
          flex: "none",
        }}
      >
        {label.slice(0, 3)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 10,
            letterSpacing: ".2em",
            textTransform: "uppercase",
            color: dot,
            marginBottom: 2,
          }}
        >
          {label}
        </div>
        <div style={{ fontSize: 13, fontWeight: 500, color: TEXT, lineHeight: 1.35 }}>{action}</div>
        <div style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 2 }}>{helper}</div>
      </div>
      <div
        style={{
          fontSize: 11,
          fontFamily: "'JetBrains Mono', monospace",
          color: "#84C188",
          fontWeight: 600,
          flex: "none",
        }}
      >
        {pts}
      </div>
    </div>
  );
}

/* ─────────────── Bits ─────────────── */

function Dots({ step, total }: { step: number; total: number }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: i === step ? GOLD : "rgba(240,237,232,.25)",
            transition: "background 200ms ease",
          }}
        />
      ))}
    </div>
  );
}

function SubtleBtn({
  onClick,
  disabled,
  icon,
  label,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 14px",
        borderRadius: 8,
        border: `1px solid ${GOLD_LINE}`,
        background: "transparent",
        color: TEXT,
        fontSize: 12,
        letterSpacing: ".05em",
        cursor: disabled ? "wait" : "pointer",
        fontFamily: "inherit",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

const primaryBtn: React.CSSProperties = {
  padding: "12px 28px",
  borderRadius: 8,
  background: GOLD,
  color: "#1a160f",
  border: "none",
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
  fontFamily: "inherit",
  letterSpacing: ".02em",
};

const ghostBtn: React.CSSProperties = {
  padding: "10px 24px",
  borderRadius: 8,
  background: "transparent",
  color: TEXT,
  border: `1px solid ${GOLD_LINE}`,
  fontWeight: 500,
  fontSize: 13,
  cursor: "pointer",
  fontFamily: "inherit",
};

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}