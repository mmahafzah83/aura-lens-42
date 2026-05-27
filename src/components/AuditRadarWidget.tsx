import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ShieldCheck, Loader2 } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";

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

// Shorter labels for tight radar rendering; full names are kept for tooltips & data keys.
const DIMENSION_SHORT_LABELS: Record<string, string> = {
  "Strategic Architecture": "Strategy",
  "C-Suite Stewardship": "C-Suite",
  "Sector Foresight": "Sector",
  "Digital Synthesis": "Digital",
  "Executive Presence": "Exec. Presence",
  "Commercial Velocity": "Commercial",
  "Human-Centric Leadership": "Human Leadership",
  "Operational Resilience": "Op. Resilience",
  "Geopolitical Fluency": "Geo. Fluency",
  "Value-Based P&L": "Value P&L",
};

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
  hideEditScores?: boolean;
}

const AuditRadarWidget = ({ onStartAudit, hideEditScores }: AuditRadarWidgetProps) => {
  const [auditResults, setAuditResults] = useState<Record<string, number> | null>(null);
  const [completed, setCompleted] = useState(false);
  const [auditMethod, setAuditMethod] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; name: string; score: number; tier: string } | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editScores, setEditScores] = useState<Record<string, number>>({});
  const [savingScores, setSavingScores] = useState(false);
  const [themeTick, setThemeTick] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Re-render canvas on theme toggle
  useEffect(() => {
    if (typeof document === "undefined") return;
    const observer = new MutationObserver(() => setThemeTick((t) => t + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await (supabase.from("diagnostic_profiles" as any) as any)
        .select("audit_results, audit_completed_at, audit_method, skill_ratings")
        .eq("user_id", user.id)
        .maybeSingle();

      const scores =
        (data?.audit_results && Object.keys(data.audit_results || {}).length > 0
          ? data.audit_results
          : data?.skill_ratings) as Record<string, number> | null;
      const hasScores = scores && Object.keys(scores).length > 0;
      if (data?.audit_completed_at && hasScores) {
        setAuditResults(scores);
        setAuditMethod((data?.audit_method as string) || "self_calibration");
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

    const cs = getComputedStyle(document.documentElement);
    const resolvedInk3 = cs.getPropertyValue("--ink-3").trim() || "#C9C0AC";
    const resolvedInk5 = cs.getPropertyValue("--ink-5").trim() || "#8A8170";
    const resolvedBrand = cs.getPropertyValue("--bronze").trim() || "#D4B056";
    const resolvedBorder = cs.getPropertyValue("--brand-line").trim() || "rgba(212,176,86,0.28)";

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
      ctx.strokeStyle = resolvedBorder;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Draw spokes
    for (let i = 0; i < n; i++) {
      const angle = startAngle + i * angleStep;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
      ctx.strokeStyle = resolvedBorder;
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
    ctx.strokeStyle = resolvedBrand;
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
      ctx.fillStyle = resolvedBrand;
      ctx.fill();
    }

    // Draw labels — full names, positioned outside
    ctx.fillStyle = resolvedInk3;
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

      ctx.font = "600 12px system-ui, sans-serif";
      ctx.fillText(DIMENSION_SHORT_LABELS[DIMENSION_ORDER[i]] || DIMENSION_ORDER[i], 0, 0);
      ctx.restore();
    }
  }, [auditResults, themeTick]);

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
      <div className="rounded-xl border border-ink-3 bg-surface-ink-raised p-6 mb-4">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 rounded-xl mx-auto flex items-center justify-center" style={{ background: "rgba(197,165,90,0.1)", border: "1px solid rgba(197,165,90,0.2)" }}>
            <ShieldCheck className="w-6 h-6" style={{ color: "var(--brand)" }} />
          </div>
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--ink-7)" }}>Complete your capability diagnostic to reveal your radar</p>
            <p className="text-xs mt-1" style={{ color: "var(--ink-5)" }}>10 dimensions · 30 evidence questions · takes 5 minutes</p>
          </div>
          <button
            onClick={onStartAudit}
            className="px-5 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: "var(--brand)", color: "var(--ink)" }}
          >
            Start diagnostic →
          </button>
        </div>
      </div>
    );
  }

  const startEdit = () => {
    if (auditResults) {
      const scores: Record<string, number> = {};
      DIMENSION_ORDER.forEach(d => { scores[d] = auditResults[d] || 0; });
      setEditScores(scores);
      setEditMode(true);
    }
  };

  const saveScores = async () => {
    setSavingScores(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSavingScores(false); return; }

    // Update audit_results with edited scores
    const { error } = await (supabase.from("diagnostic_profiles" as any) as any)
      .update({ audit_results: editScores, skill_ratings: editScores })
      .eq("user_id", user.id);

    if (error) {
      toast.error("Couldn't save scores");
    } else {
      setAuditResults(editScores);
      setEditMode(false);
      toast.success("Capability scores updated.");
    }
    setSavingScores(false);
  };

  return (
    <div ref={containerRef} className="rounded-xl border border-ink-3 bg-surface-ink-raised p-4 mb-4 relative">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-ink-7">Your Capability Radar</p>
        {hideEditScores ? null : !editMode ? (
          <button
            onClick={startEdit}
            className="text-xs font-medium hover:underline"
            style={{ color: "var(--brand)" }}
          >
            Edit scores
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditMode(false)}
              className="text-xs"
              style={{ color: "var(--ink-5)" }}
            >
              Cancel
            </button>
            <button
              onClick={saveScores}
              disabled={savingScores}
              className="text-xs font-medium px-3 py-1 rounded-lg"
              style={{ background: "var(--brand)", color: "var(--ink)" }}
            >
              {savingScores ? "Saving..." : "Save"}
            </button>
          </div>
        )}
      </div>

      {editMode ? (
        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
          {DIMENSION_ORDER.map(dim => (
            <div key={dim} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-ink-7">{dim}</span>
                <span className="text-xs font-medium" style={{ color: "var(--brand)" }}>{editScores[dim] || 0}%</span>
              </div>
              <Slider
                value={[editScores[dim] || 0]}
                onValueChange={([v]) => setEditScores(prev => ({ ...prev, [dim]: v }))}
                max={100}
                step={1}
                className="w-full"
              />
            </div>
          ))}
        </div>
      ) : (
        <>
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
                background: "var(--surface-ink-subtle)",
                border: "1px solid var(--ink-3)",
                borderRadius: 8,
                padding: "6px 10px",
                zIndex: 10,
              }}
            >
              <p className="text-xs font-medium" style={{ color: "var(--ink-7)" }}>{tooltip.name}</p>
              <p className="text-xs" style={{ color: "var(--brand)" }}>
                {tooltip.score}% · {tooltip.tier} Tier
              </p>
            </div>
          )}

          {/* Legend */}
          <div className="flex items-center gap-4 mt-3 pt-3" style={{ borderTop: "0.5px solid var(--ink-3)" }}>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: "var(--brand)" }} />
              <span className="text-xs" style={{ color: "var(--ink-5)" }}>High Tier (Strategic / Technical)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: "var(--ink-5)" }} />
              <span className="text-xs" style={{ color: "var(--ink-5)" }}>Mid Tier (Leadership / Commercial)</span>
            </div>
          </div>

          {/* Audit provenance */}
          <div className="mt-3 flex items-center justify-between gap-3">
            {auditMethod === "evidence_audit" ? (
              <span className="text-xs font-medium inline-flex items-center gap-1.5" style={{ color: "var(--brand)" }}>
                <ShieldCheck className="w-3.5 h-3.5" /> Evidence verified
              </span>
            ) : (
              <>
                <span className="text-xs" style={{ color: "var(--brand)" }}>Based on self-assessment</span>
                {onStartAudit && (
                  <button
                    onClick={onStartAudit}
                    className="text-xs font-medium hover:underline"
                    style={{ color: "var(--brand)" }}
                  >
                    Verify with evidence →
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default AuditRadarWidget;
