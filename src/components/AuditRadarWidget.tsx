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

const DIMENSION_TIERS: Record<string, { tier: string; category: string }> = {
  "Strategic Architecture": { tier: "High", category: "Strategic" },
  "C-Suite Stewardship": { tier: "High", category: "Strategic" },
  "Sector Foresight": { tier: "High", category: "Strategic" },
  "Digital Synthesis": { tier: "High", category: "Technical" },
  "Executive Presence": { tier: "High", category: "Leadership" },
  "Commercial Velocity": { tier: "Mid", category: "Commercial" },
  "Human-Centric Leadership": { tier: "Mid", category: "Leadership" },
  "Operational Resilience": { tier: "Mid", category: "Technical" },
  "Geopolitical Fluency": { tier: "Mid", category: "Strategic" },
  "Value-Based P&L": { tier: "Mid", category: "Commercial" },
};

interface AuditRadarWidgetProps {
  onStartAudit?: () => void;
}

const AuditRadarWidget = ({ onStartAudit }: AuditRadarWidgetProps) => {
  const [auditResults, setAuditResults] = useState<Record<string, number> | null>(null);
  const [completed, setCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; name: string; score: number; tier: string } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
    const radius = Math.min(cx, cy) - 60;
    const n = 10;
    const angleStep = (2 * Math.PI) / n;
    const startAngle = -Math.PI / 2;
    const orderedScores = DIMENSION_ORDER.map((d) => auditResults[d] || 0);

    ctx.clearRect(0, 0, w, h);

    // Draw rings
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

    // Draw spokes
    for (let i = 0; i < n; i++) {
      const angle = startAngle + i * angleStep;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
      ctx.strokeStyle = "#1f1f1f";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Draw data polygon
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

    // Draw data points
    for (let i = 0; i < n; i++) {
      const angle = startAngle + i * angleStep;
      const val = orderedScores[i] / 100;
      const x = cx + radius * val * Math.cos(angle);
      const y = cy + radius * val * Math.sin(angle);
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, 2 * Math.PI);
      ctx.fillStyle = "#C5A55A";
      ctx.fill();
    }

    // Draw labels — full names, positioned outside
    ctx.fillStyle = "#888888";
    ctx.textBaseline = "middle";
    for (let i = 0; i < n; i++) {
      const angle = startAngle + i * angleStep;
      const labelR = radius + 28;
      const x = cx + labelR * Math.cos(angle);
      const y = cy + labelR * Math.sin(angle);

      ctx.save();
      ctx.translate(x, y);

      const cosA = Math.cos(angle);
      if (cosA < -0.1) ctx.textAlign = "right";
      else if (cosA > 0.1) ctx.textAlign = "left";
      else ctx.textAlign = "center";

      // Use slightly angled text for side labels to avoid overlap
      let rotation = 0;
      const absSin = Math.abs(Math.sin(angle));
      if (absSin > 0.3 && absSin < 0.95) {
        rotation = cosA > 0 ? angle * 0.15 : angle * 0.15;
      }
      ctx.rotate(rotation);

      ctx.font = "10px system-ui, sans-serif";
      ctx.fillText(DIMENSION_ORDER[i], 0, 0);
      ctx.restore();
    }
  }, [auditResults]);

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!auditResults || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const cx = canvas.clientWidth / 2;
    const cy = canvas.clientHeight / 2;
    const radius = Math.min(cx, cy) - 60;
    const n = 10;
    const angleStep = (2 * Math.PI) / n;
    const startAngle = -Math.PI / 2;

    let closest: { name: string; score: number; tier: string; dist: number } | null = null;

    for (let i = 0; i < n; i++) {
      const angle = startAngle + i * angleStep;
      const val = (auditResults[DIMENSION_ORDER[i]] || 0) / 100;
      const px = cx + radius * val * Math.cos(angle);
      const py = cy + radius * val * Math.sin(angle);
      const dist = Math.sqrt((mx - px) ** 2 + (my - py) ** 2);
      if (dist < 20 && (!closest || dist < closest.dist)) {
        closest = {
          name: DIMENSION_ORDER[i],
          score: auditResults[DIMENSION_ORDER[i]] || 0,
          tier: DIMENSION_TIERS[DIMENSION_ORDER[i]].tier,
          dist,
        };
      }
    }

    if (closest && containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      setTooltip({
        x: e.clientX - containerRect.left,
        y: e.clientY - containerRect.top - 40,
        name: closest.name,
        score: closest.score,
        tier: closest.tier,
      });
    } else {
      setTooltip(null);
    }
  };

  if (loading) return null;

  if (!completed) {
    return (
      <div className="rounded-xl border border-[#252525] bg-[#141414] p-6 mb-4">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 rounded-xl mx-auto flex items-center justify-center" style={{ background: "rgba(197,165,90,0.1)", border: "1px solid rgba(197,165,90,0.2)" }}>
            <ShieldCheck className="w-6 h-6" style={{ color: "#C5A55A" }} />
          </div>
          <div>
            <p className="text-sm font-medium" style={{ color: "#f0f0f0" }}>Complete your Evidence Audit to reveal your capability radar</p>
            <p className="text-xs mt-1" style={{ color: "#666" }}>10 dimensions · 30 evidence questions · takes 5 minutes</p>
          </div>
          <button
            onClick={onStartAudit}
            className="px-5 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: "#C5A55A", color: "#0d0d0d" }}
          >
            Start Audit →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="rounded-xl border border-[#252525] bg-[#141414] p-4 mb-4 relative">
      <p className="text-[13px] font-medium text-[#f0f0f0] mb-2">Your Capability Radar</p>
      <canvas
        ref={canvasRef}
        className="w-full"
        style={{ height: 340, background: "transparent" }}
        onMouseMove={handleCanvasMouseMove}
        onMouseLeave={() => setTooltip(null)}
      />

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: "translateX(-50%)",
            background: "#1a1a1a",
            border: "1px solid #333",
            borderRadius: 8,
            padding: "6px 10px",
            zIndex: 10,
          }}
        >
          <p className="text-[11px] font-medium" style={{ color: "#f0f0f0" }}>{tooltip.name}</p>
          <p className="text-[10px]" style={{ color: "#C5A55A" }}>
            {tooltip.score}% · {tooltip.tier} Tier
          </p>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 pt-3" style={{ borderTop: "0.5px solid #252525" }}>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: "#C5A55A" }} />
          <span className="text-[10px]" style={{ color: "#888" }}>High Tier (Strategic / Technical)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: "#666" }} />
          <span className="text-[10px]" style={{ color: "#888" }}>Mid Tier (Leadership / Commercial)</span>
        </div>
      </div>
    </div>
  );
};

export default AuditRadarWidget;
