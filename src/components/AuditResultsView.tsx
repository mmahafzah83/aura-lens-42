import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import { ArrowRight, Loader2 } from "lucide-react";
import { EVIDENCE_MATRIX } from "@/components/diagnostic/EvidenceMatrix";

interface AuditResultsViewProps {
  scores: Record<string, number>;
  onNavigate?: (tab: string) => void;
  onClose?: () => void;
}

const DIMENSION_ORDER = [
  "Strategic Architecture",
  "C-Suite Stewardship",
  "Sector Foresight",
  "Digital Synthesis",
  "Executive Presence",
  "Commercial Velocity",
  "Human-Centric Leadership",
  "Operational Resilience",
  "Geopolitical Fluency",
  "Value-Based P&L",
];

const SHORT_LABELS = [
  "Strat. Arch.",
  "C-Suite",
  "Foresight",
  "Digital",
  "Presence",
  "Commercial",
  "Human Lead.",
  "Ops Resil.",
  "Geopolitical",
  "P&L",
];

const AuditResultsView = ({ scores, onNavigate, onClose }: AuditResultsViewProps) => {
  const [interpretation, setInterpretation] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();

  const orderedScores = DIMENSION_ORDER.map((d) => scores[d] || 0);

  // Draw radar chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(cx, cy) - 40;
    const n = 10;
    const angleStep = (2 * Math.PI) / n;
    const startAngle = -Math.PI / 2;

    ctx.clearRect(0, 0, w, h);

    // Grid lines
    for (let ring = 1; ring <= 4; ring++) {
      const r = (radius * ring) / 4;
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const angle = startAngle + i * angleStep;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = "#1f1f1f";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Axis lines
    for (let i = 0; i < n; i++) {
      const angle = startAngle + i * angleStep;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
      ctx.strokeStyle = "#1f1f1f";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Data polygon
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const angle = startAngle + i * angleStep;
      const val = orderedScores[i] / 100;
      const x = cx + radius * val * Math.cos(angle);
      const y = cy + radius * val * Math.sin(angle);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(197, 165, 90, 0.12)";
    ctx.fill();
    ctx.strokeStyle = "#C5A55A";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Data points
    for (let i = 0; i < n; i++) {
      const angle = startAngle + i * angleStep;
      const val = orderedScores[i] / 100;
      const x = cx + radius * val * Math.cos(angle);
      const y = cy + radius * val * Math.sin(angle);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, 2 * Math.PI);
      ctx.fillStyle = "#C5A55A";
      ctx.fill();
    }

    // Labels
    ctx.font = "9px system-ui, sans-serif";
    ctx.fillStyle = "#666666";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < n; i++) {
      const angle = startAngle + i * angleStep;
      const labelR = radius + 22;
      let x = cx + labelR * Math.cos(angle);
      let y = cy + labelR * Math.sin(angle);
      
      // Adjust alignment based on position
      if (Math.cos(angle) < -0.1) ctx.textAlign = "right";
      else if (Math.cos(angle) > 0.1) ctx.textAlign = "left";
      else ctx.textAlign = "center";

      ctx.fillText(SHORT_LABELS[i], x, y);
    }
    ctx.textAlign = "center"; // reset
  }, [orderedScores]);

  // Fetch AI interpretation
  useEffect(() => {
    const fetchInterpretation = async () => {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const res = await supabase.functions.invoke("audit-interpretation", {
          body: { scores },
        });

        if (res.error) throw new Error(res.error.message);
        const text = res.data?.interpretation || "";
        setInterpretation(text);

        // Save to DB
        await (supabase.from("diagnostic_profiles" as any) as any)
          .update({
            audit_results: scores,
            audit_interpretation: text,
            audit_completed_at: new Date().toISOString(),
          })
          .eq("user_id", session.user.id);
      } catch (e: any) {
        console.error("AI interpretation error:", e);
        toast({ title: "Analysis error", description: e.message, variant: "destructive" });
        setInterpretation("Unable to generate interpretation. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchInterpretation();
  }, []);

  return (
    <div className="space-y-6">
      {/* Section 1 — Radar Chart */}
      <div>
        <p className="text-[13px] font-medium text-[#f0f0f0] mb-3">Your Capability Radar</p>
        <canvas
          ref={canvasRef}
          className="w-full"
          style={{ height: 260, background: "transparent" }}
        />
      </div>

      {/* Section 2 — AI Interpretation */}
      <div className="border-t border-[#252525] pt-4">
        {loading ? (
          <div className="flex items-center gap-3 py-8 justify-center">
            <div className="w-2 h-2 rounded-full bg-[#C5A55A] animate-pulse" />
            <p className="text-xs text-[#888]">Analysing your profile across 4 frameworks...</p>
          </div>
        ) : (
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown
              components={{
                h1: ({ children }) => <h1 className="text-sm font-semibold text-[#C5A55A] mt-4 mb-1">{children}</h1>,
                h2: ({ children }) => <h2 className="text-sm font-semibold text-[#C5A55A] mt-4 mb-1">{children}</h2>,
                h3: ({ children }) => <h3 className="text-xs font-semibold text-[#C5A55A] mt-3 mb-1">{children}</h3>,
                p: ({ children }) => <p className="text-xs text-[#888] mb-3 leading-relaxed">{children}</p>,
                strong: ({ children }) => <strong className="text-[#C5A55A] font-semibold">{children}</strong>,
                ul: ({ children }) => <ul className="text-xs text-[#888] space-y-1 mb-3 list-disc pl-4">{children}</ul>,
                ol: ({ children }) => <ol className="text-xs text-[#888] space-y-1 mb-3 list-decimal pl-4">{children}</ol>,
                li: ({ children }) => <li className="leading-relaxed">{children}</li>,
              }}
            >
              {interpretation || ""}
            </ReactMarkdown>
          </div>
        )}
      </div>

      {/* Section 3 — Action Cards */}
      <div className="border-t border-[#252525] pt-4 space-y-2">
        <ActionCard
          label="Complete Brand Assessment →"
          onClick={() => { onClose?.(); onNavigate?.("settings"); }}
        />
        <ActionCard
          label="View Strategic Identity →"
          onClick={() => { onClose?.(); onNavigate?.("identity"); }}
        />
        <ActionCard
          label="Start capturing →"
          onClick={() => { onClose?.(); onNavigate?.("intelligence"); }}
        />
      </div>
    </div>
  );
};

function ActionCard({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between p-3 rounded-[10px] bg-[#141414] border border-[#252525] text-[12px] text-[#f0f0f0] hover:border-[#C5A55A]/40 transition-colors text-left"
    >
      <span>{label}</span>
      <ArrowRight className="w-3.5 h-3.5 text-[#666]" />
    </button>
  );
}

export default AuditResultsView;
