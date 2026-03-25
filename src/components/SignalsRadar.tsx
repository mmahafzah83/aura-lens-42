import { useState, useEffect, useMemo } from "react";
import { Loader2, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface RadarSignal {
  id: string;
  signal_title: string;
  confidence: number;
  fragment_count: number;
  theme_tags: string[];
  explanation: string;
  framework_opportunity: any;
}

const SignalsRadar = () => {
  const [signals, setSignals] = useState<RadarSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("strategic_signals")
        .select("id, signal_title, confidence, fragment_count, theme_tags, explanation, framework_opportunity")
        .eq("status", "active")
        .order("confidence", { ascending: false })
        .limit(12);
      setSignals((data || []) as RadarSignal[]);
      setLoading(false);
    };
    load();
  }, []);

  // Position signals around concentric rings
  const positioned = useMemo(() => {
    if (!signals.length) return [];
    const cx = 200, cy = 200;
    return signals.map((s, i) => {
      const angle = (i / signals.length) * Math.PI * 2 - Math.PI / 2;
      const ringRadius = 60 + (1 - s.confidence) * 110; // higher confidence = closer to center
      return {
        ...s,
        x: cx + Math.cos(angle) * ringRadius,
        y: cy + Math.sin(angle) * ringRadius,
        radius: 6 + Math.min(s.fragment_count, 10) * 1.5,
      };
    });
  }, [signals]);

  const hovered = hoveredId ? positioned.find(p => p.id === hoveredId) : null;

  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-10 flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-5 h-5 animate-spin text-primary/40" />
      </div>
    );
  }

  if (!signals.length) {
    return (
      <div className="glass-card rounded-2xl p-8 text-center min-h-[200px] flex flex-col items-center justify-center gap-2">
        <Zap className="w-6 h-6 text-primary/20" />
        <p className="text-xs text-muted-foreground/40">No strategic signals detected yet.</p>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl p-6 border border-border/8">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/15">
          <Zap className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Strategic Signals Radar</h3>
          <p className="text-[10px] text-muted-foreground/40">Where your thinking concentrates</p>
        </div>
      </div>

      <div className="relative flex items-center justify-center">
        {/* SVG Radar */}
        <svg viewBox="0 0 400 400" className="w-full max-w-[400px] h-auto">
          {/* Concentric rings */}
          {[60, 110, 170].map((r) => (
            <circle
              key={r} cx={200} cy={200} r={r}
              fill="none" stroke="hsl(var(--border))" strokeWidth="0.5" opacity={0.3}
            />
          ))}
          {/* Cross lines */}
          <line x1={200} y1={30} x2={200} y2={370} stroke="hsl(var(--border))" strokeWidth="0.5" opacity={0.15} />
          <line x1={30} y1={200} x2={370} y2={200} stroke="hsl(var(--border))" strokeWidth="0.5" opacity={0.15} />

          {/* Sweep line animation */}
          <line x1={200} y1={200} x2={200} y2={30} stroke="hsl(var(--primary))" strokeWidth="0.8" opacity={0.15}>
            <animateTransform
              attributeName="transform" type="rotate"
              from="0 200 200" to="360 200 200" dur="12s" repeatCount="indefinite"
            />
          </line>

          {/* Signal nodes */}
          {positioned.map((s) => {
            const isHovered = hoveredId === s.id;
            const glowIntensity = Math.min(s.fragment_count / 8, 1);
            return (
              <g
                key={s.id}
                onMouseEnter={() => setHoveredId(s.id)}
                onMouseLeave={() => setHoveredId(null)}
                className="cursor-pointer"
              >
                {/* Outer glow */}
                <circle
                  cx={s.x} cy={s.y} r={s.radius + 8}
                  fill="hsl(var(--primary))"
                  opacity={isHovered ? 0.15 : 0.03 + glowIntensity * 0.06}
                >
                  <animate attributeName="r" values={`${s.radius + 6};${s.radius + 12};${s.radius + 6}`} dur="3s" repeatCount="indefinite" />
                </circle>
                {/* Core */}
                <circle
                  cx={s.x} cy={s.y} r={s.radius}
                  fill={isHovered ? "hsl(var(--primary))" : `hsl(var(--primary) / ${0.4 + glowIntensity * 0.5})`}
                  stroke="hsl(var(--primary))" strokeWidth={isHovered ? 1.5 : 0.5}
                  opacity={isHovered ? 1 : 0.8}
                  className="transition-all duration-300"
                />
                {/* Label */}
                <text
                  x={s.x} y={s.y + s.radius + 14}
                  textAnchor="middle"
                  fill={isHovered ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))"}
                  fontSize={isHovered ? 10 : 8}
                  fontWeight={isHovered ? 600 : 400}
                  className="transition-all duration-200"
                  style={{ fontFamily: "Inter, sans-serif" }}
                >
                  {s.signal_title.length > 22 ? s.signal_title.slice(0, 20) + "…" : s.signal_title}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Hover tooltip */}
        {hovered && (
          <div className="absolute bottom-0 left-0 right-0 bg-secondary/80 backdrop-blur-xl rounded-xl p-4 border border-primary/15 animate-fade-in mx-4 mb-2">
            <h4 className="text-sm font-semibold text-foreground mb-1">{hovered.signal_title}</h4>
            <p className="text-[11px] text-muted-foreground/60 leading-relaxed line-clamp-2 mb-2">{hovered.explanation}</p>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="text-primary font-medium">{Math.round(hovered.confidence * 100)}% confidence</span>
              <span className="text-muted-foreground/40">{hovered.fragment_count} evidence sources</span>
              {hovered.framework_opportunity?.title && (
                <span className="text-emerald-400">Framework: {hovered.framework_opportunity.title}</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SignalsRadar;
