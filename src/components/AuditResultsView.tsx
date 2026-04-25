import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";

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
    ctx.strokeStyle = "#F97316";
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
      ctx.fillStyle = "#F97316";
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
      
      if (Math.cos(angle) < -0.1) ctx.textAlign = "right";
      else if (Math.cos(angle) > 0.1) ctx.textAlign = "left";
      else ctx.textAlign = "center";

      ctx.fillText(SHORT_LABELS[i], x, y);
    }
    ctx.textAlign = "center";
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

  // Parse interpretation into sections for styled rendering
  const HEADER_RENAMES: Record<string, string> = {
    "YOUR DISTINCTIVE CAPABILITY": "WHAT I DO BEST",
    "YOUR BLUE OCEAN ANGLE": "MY UNCONTESTED SPACE",
    "YOUR PURPOSE-MARKET FIT": "WHY THIS WORK MATTERS TO ME",
    // Legacy headers (kept for backwards-compatible parsing of older saved results):
    "YOUR ZONE OF GENIUS": "WHAT I DO BEST",
    "YOUR PROFESSIONAL IKIGAI": "WHY THIS WORK MATTERS TO ME",
    "YOUR TOP 3 CONTENT PILLARS": "MY 3 AUTHORITY THEMES",
    "YOUR 2 BLIND SPOTS": "WHERE I NEED TO GROW",
  };

  const renameHeader = (header: string) => HEADER_RENAMES[header] || header;

  const renderInterpretation = (text: string) => {
    // Split by known section headers (ALL CAPS lines)
    const sectionRegex = /^(YOUR [A-Z0-9\s&'\-]+(?:DOMAIN|GENIUS|ANGLE|IKIGAI|PILLARS|SPOTS|CAPABILITY|FIT|CONTENT PILLARS|BLIND SPOTS|BLUE OCEAN ANGLE|DOMINANT GALLUP DOMAIN|ZONE OF GENIUS|PROFESSIONAL IKIGAI|DISTINCTIVE CAPABILITY|PURPOSE-MARKET FIT|TOP 3 CONTENT PILLARS|2 BLIND SPOTS))$/gm;
    const parts = text.split(sectionRegex);
    
    const sections: { header?: string; body: string }[] = [];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim();
      if (!part) continue;
      if (sectionRegex.test(part)) {
        // Reset regex lastIndex
        sectionRegex.lastIndex = 0;
        sections.push({ header: part, body: parts[i + 1]?.trim() || "" });
        i++; // skip the body part
      } else if (sections.length === 0) {
        sections.push({ body: part });
      }
    }

    // If regex didn't match, fall back to markdown with styled headers
    if (sections.length <= 1) {
      return (
        <ReactMarkdown
          components={{
            h1: ({ children }) => <SectionHeader first>{children}</SectionHeader>,
            h2: ({ children }) => <SectionHeader>{children}</SectionHeader>,
            h3: ({ children }) => <SectionHeader>{children}</SectionHeader>,
            p: ({ children }) => <p className="text-xs text-[#888] mb-3 leading-relaxed">{children}</p>,
            strong: ({ children }) => <strong className="text-[#F97316] font-semibold">{children}</strong>,
            ul: ({ children }) => <ul className="text-xs text-[#888] space-y-1 mb-3 list-disc pl-4">{children}</ul>,
            ol: ({ children }) => <ol className="text-xs text-[#888] space-y-1 mb-3 list-decimal pl-4">{children}</ol>,
            li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          }}
        >
          {text}
        </ReactMarkdown>
      );
    }

    return sections.map((s, i) => (
      <div key={i}>
        {s.header && <SectionHeader first={i === 0}>{renameHeader(s.header)}</SectionHeader>}
        <ReactMarkdown
          components={{
            p: ({ children }) => <p className="text-xs text-[#888] mb-3 leading-relaxed">{children}</p>,
            strong: ({ children }) => <strong className="text-[#F97316] font-semibold">{children}</strong>,
            ul: ({ children }) => <ul className="text-xs text-[#888] space-y-1 mb-3 list-disc pl-4">{children}</ul>,
            ol: ({ children }) => <ol className="text-xs text-[#888] space-y-1 mb-3 list-decimal pl-4">{children}</ol>,
            li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          }}
        >
          {s.body}
        </ReactMarkdown>
      </div>
    ));
  };

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
            <div className="w-2 h-2 rounded-full bg-[#F97316] animate-pulse" />
            <p className="text-xs text-[#888]">Analysing your profile across 4 frameworks...</p>
          </div>
        ) : (
          <div className="prose prose-sm max-w-none">
            {renderInterpretation(interpretation || "")}
          </div>
        )}
      </div>

      {/* Section 3 — Guided Actions */}
      <div className="border-t border-[#252525] pt-4 space-y-2">
        {/* Primary CTA */}
        <button
          onClick={() => { onClose?.(); onNavigate?.("settings"); }}
          className="w-full py-3 rounded-xl text-[13px] font-medium tracking-wide transition-all active:scale-[0.98] hover:brightness-110"
          style={{
            background: "linear-gradient(to bottom, hsl(43 80% 55%), #F97316)",
            color: "#0d0d0d",
          }}
        >
          Continue to Brand Assessment →
        </button>

        {/* Secondary ghost buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => { onClose?.(); onNavigate?.("identity"); }}
            className="flex-1 py-2.5 rounded-xl text-[12px] transition-colors text-center"
            style={{
              background: "transparent",
              border: "1px solid #252525",
              color: "#888",
            }}
          >
            View Strategic Identity
          </button>
          <button
            onClick={() => { onClose?.(); onNavigate?.("intelligence"); }}
            className="flex-1 py-2.5 rounded-xl text-[12px] transition-colors text-center"
            style={{
              background: "transparent",
              border: "1px solid #252525",
              color: "#888",
            }}
          >
            Start capturing
          </button>
        </div>
      </div>
    </div>
  );
};

function SectionHeader({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return (
    <div>
      {!first && (
        <div className="mt-[14px] mb-[4px]" style={{ borderTop: "0.5px solid #F97316", opacity: 0.4 }} />
      )}
      <h3
        className="uppercase tracking-wider"
        style={{
          color: "#F97316",
          fontWeight: 500,
          fontSize: 12,
          marginTop: first ? 0 : 14,
          marginBottom: 4,
        }}
      >
        {children}
      </h3>
    </div>
  );
}

export default AuditResultsView;
