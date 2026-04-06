import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ShieldCheck } from "lucide-react";

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

interface AuditRadarWidgetProps {
  onStartAudit?: () => void;
}

const AuditRadarWidget = ({ onStartAudit }: AuditRadarWidgetProps) => {
  const [auditResults, setAuditResults] = useState<Record<string, number> | null>(null);
  const [completed, setCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await (supabase.from("diagnostic_profiles" as any) as any)
        .select("audit_results, audit_completed_at")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data?.audit_completed_at && data?.audit_results) {
        setAuditResults(data.audit_results as Record<string, number>);
        setCompleted(true);
      }
      setLoading(false);
    };
    load();
  }, []);

  useEffect(() => {
    if (!auditResults || !canvasRef.current) return;
    const canvas = canvasRef.current;
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
    const radius = Math.min(cx, cy) - 36;
    const n = 10;
    const angleStep = (2 * Math.PI) / n;
    const startAngle = -Math.PI / 2;
    const orderedScores = DIMENSION_ORDER.map((d) => auditResults[d] || 0);

    ctx.clearRect(0, 0, w, h);

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

    for (let i = 0; i < n; i++) {
      const angle = startAngle + i * angleStep;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
      ctx.strokeStyle = "#1f1f1f";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

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

    ctx.font = "9px system-ui, sans-serif";
    ctx.fillStyle = "#666666";
    ctx.textBaseline = "middle";
    for (let i = 0; i < n; i++) {
      const angle = startAngle + i * angleStep;
      const labelR = radius + 20;
      const x = cx + labelR * Math.cos(angle);
      const y = cy + labelR * Math.sin(angle);
      if (Math.cos(angle) < -0.1) ctx.textAlign = "right";
      else if (Math.cos(angle) > 0.1) ctx.textAlign = "left";
      else ctx.textAlign = "center";
      ctx.fillText(SHORT_LABELS[i], x, y);
    }
  }, [auditResults]);

  if (loading) return null;

  if (!completed) {
    return (
      <div className="rounded-xl border border-[#252525] bg-[#141414] p-4 mb-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-[#888]">Complete your Evidence Audit to see your capability radar</p>
          <button
            onClick={onStartAudit}
            className="text-xs text-[#C5A55A] font-medium hover:underline flex items-center gap-1"
          >
            <ShieldCheck className="w-3.5 h-3.5" /> Start Audit →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#252525] bg-[#141414] p-4 mb-4">
      <p className="text-[13px] font-medium text-[#f0f0f0] mb-2">Your Capability Radar</p>
      <canvas
        ref={canvasRef}
        className="w-full"
        style={{ height: 240, background: "transparent" }}
      />
    </div>
  );
};

export default AuditRadarWidget;
