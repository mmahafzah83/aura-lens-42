import { useState, useEffect, useCallback, useMemo } from "react";
import { X, Loader2, GitBranch, ZoomIn, ZoomOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ConstellationNode {
  id: string;
  label: string;
  type: "capture" | "signal" | "insight" | "framework" | "authority" | "influence";
  x: number;
  y: number;
  detail?: string;
}

interface ConstellationEdge {
  from: string;
  to: string;
}

const TYPE_COLORS: Record<string, string> = {
  capture: "hsl(var(--muted-foreground))",
  signal: "hsl(43, 80%, 55%)",
  insight: "hsl(210, 70%, 60%)",
  framework: "hsl(150, 60%, 50%)",
  authority: "hsl(var(--primary))",
  influence: "hsl(280, 60%, 60%)",
};

const TYPE_LABELS: Record<string, string> = {
  capture: "Capture",
  signal: "Signal",
  insight: "Insight",
  framework: "Framework",
  authority: "Authority",
  influence: "Influence",
};

interface KnowledgeConstellationProps {
  open: boolean;
  onClose: () => void;
}

const KnowledgeConstellation = ({ open, onClose }: KnowledgeConstellationProps) => {
  const [nodes, setNodes] = useState<ConstellationNode[]>([]);
  const [edges, setEdges] = useState<ConstellationEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<ConstellationNode | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const loadData = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const [entriesRes, signalsRes, insightsRes, frameworksRes, activationsRes, influenceRes] = await Promise.all([
        supabase.from("entries").select("id, title, type, skill_pillar").order("created_at", { ascending: false }).limit(20),
        supabase.from("strategic_signals").select("id, signal_title, theme_tags, supporting_evidence_ids").eq("status", "active").limit(15),
        supabase.from("learned_intelligence").select("id, title, intelligence_type, source_entry_id").limit(20),
        supabase.from("master_frameworks").select("id, title, entry_id").limit(10),
        supabase.from("framework_activations").select("id, title, framework_id, output_type").limit(10),
        supabase.from("influence_snapshots").select("id, top_topic, engagement_rate").order("created_at", { ascending: false }).limit(3),
      ]);

      const allNodes: ConstellationNode[] = [];
      const allEdges: ConstellationEdge[] = [];

      const cx = 500, cy = 400;

      // Captures - outer ring
      (entriesRes.data || []).forEach((e: any, i: number) => {
        const angle = (i / Math.max((entriesRes.data || []).length, 1)) * Math.PI * 2;
        allNodes.push({
          id: `e-${e.id}`, label: e.title || "Untitled", type: "capture",
          x: cx + Math.cos(angle) * 320, y: cy + Math.sin(angle) * 280,
          detail: `Type: ${e.type} | Pillar: ${e.skill_pillar || "—"}`,
        });
      });

      // Signals - second ring
      (signalsRes.data || []).forEach((s: any, i: number) => {
        const angle = (i / Math.max((signalsRes.data || []).length, 1)) * Math.PI * 2 + 0.3;
        allNodes.push({
          id: `s-${s.id}`, label: s.signal_title, type: "signal",
          x: cx + Math.cos(angle) * 220, y: cy + Math.sin(angle) * 190,
          detail: `Themes: ${(s.theme_tags || []).join(", ")}`,
        });
        // Connect to supporting entries
        (s.supporting_evidence_ids || []).forEach((eid: string) => {
          allEdges.push({ from: `e-${eid}`, to: `s-${s.id}` });
        });
      });

      // Insights - third ring
      (insightsRes.data || []).forEach((ins: any, i: number) => {
        const angle = (i / Math.max((insightsRes.data || []).length, 1)) * Math.PI * 2 + 0.6;
        allNodes.push({
          id: `i-${ins.id}`, label: ins.title, type: "insight",
          x: cx + Math.cos(angle) * 150, y: cy + Math.sin(angle) * 130,
          detail: `Type: ${ins.intelligence_type}`,
        });
        if (ins.source_entry_id) {
          allEdges.push({ from: `e-${ins.source_entry_id}`, to: `i-${ins.id}` });
        }
      });

      // Frameworks - inner ring
      (frameworksRes.data || []).forEach((f: any, i: number) => {
        const angle = (i / Math.max((frameworksRes.data || []).length, 1)) * Math.PI * 2 + 0.9;
        allNodes.push({
          id: `f-${f.id}`, label: f.title, type: "framework",
          x: cx + Math.cos(angle) * 80, y: cy + Math.sin(angle) * 70,
        });
        if (f.entry_id) {
          allEdges.push({ from: `e-${f.entry_id}`, to: `f-${f.id}` });
        }
      });

      // Authority - near center
      (activationsRes.data || []).forEach((a: any, i: number) => {
        const angle = (i / Math.max((activationsRes.data || []).length, 1)) * Math.PI * 2 + 1.2;
        allNodes.push({
          id: `a-${a.id}`, label: a.title, type: "authority",
          x: cx + Math.cos(angle) * 45, y: cy + Math.sin(angle) * 40,
          detail: `Format: ${a.output_type}`,
        });
        allEdges.push({ from: `f-${a.framework_id}`, to: `a-${a.id}` });
      });

      // Influence - center
      (influenceRes.data || []).forEach((inf: any, i: number) => {
        allNodes.push({
          id: `inf-${inf.id}`, label: inf.top_topic || "Influence", type: "influence",
          x: cx + (i - 1) * 30, y: cy,
          detail: `Engagement: ${Number(inf.engagement_rate || 0).toFixed(1)}%`,
        });
      });

      setNodes(allNodes);
      setEdges(allEdges.filter(e => allNodes.find(n => n.id === e.from) && allNodes.find(n => n.id === e.to)));
    } catch (err) {
      console.error("Constellation load error:", err);
    }
    setLoading(false);
  }, [open]);

  useEffect(() => { loadData(); }, [loadData]);

  const nodeMap = useMemo(() => {
    const map: Record<string, ConstellationNode> = {};
    nodes.forEach(n => { map[n.id] = n; });
    return map;
  }, [nodes]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl flex flex-col animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/15">
            <GitBranch className="w-4.5 h-4.5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
              Knowledge Constellation
            </h2>
            <p className="text-[10px] text-muted-foreground/40">Explore how your ideas connect</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setZoom(z => Math.min(z + 0.2, 2.5))} className="p-2 rounded-lg bg-secondary/30 text-muted-foreground hover:text-foreground transition-colors">
            <ZoomIn className="w-4 h-4" />
          </button>
          <button onClick={() => setZoom(z => Math.max(z - 0.2, 0.4))} className="p-2 rounded-lg bg-secondary/30 text-muted-foreground hover:text-foreground transition-colors">
            <ZoomOut className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="p-2 rounded-lg bg-secondary/30 text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 py-3 border-b border-border/5">
        {Object.entries(TYPE_LABELS).map(([key, label]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: TYPE_COLORS[key] }} />
            <span className="text-[10px] text-muted-foreground/50">{label}</span>
          </div>
        ))}
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-hidden relative">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-primary/40" />
          </div>
        ) : (
          <svg
            viewBox="0 0 1000 800"
            className="w-full h-full"
            style={{ transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`, transformOrigin: "center" }}
          >
            {/* Edges */}
            {edges.map((e, i) => {
              const from = nodeMap[e.from];
              const to = nodeMap[e.to];
              if (!from || !to) return null;
              const isHighlighted = selectedNode && (selectedNode.id === e.from || selectedNode.id === e.to);
              return (
                <line
                  key={i}
                  x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                  stroke={isHighlighted ? "hsl(var(--primary))" : "hsl(var(--border))"}
                  strokeWidth={isHighlighted ? 1.5 : 0.5}
                  opacity={isHighlighted ? 0.7 : 0.2}
                  className="transition-all duration-300"
                />
              );
            })}

            {/* Nodes */}
            {nodes.map((node) => {
              const isSelected = selectedNode?.id === node.id;
              const isConnected = selectedNode && edges.some(e =>
                (e.from === selectedNode.id && e.to === node.id) ||
                (e.to === selectedNode.id && e.from === node.id)
              );
              const highlight = isSelected || isConnected;
              const r = node.type === "influence" ? 10 : node.type === "authority" ? 8 : node.type === "framework" ? 7 : 5;

              return (
                <g
                  key={node.id}
                  onClick={() => setSelectedNode(isSelected ? null : node)}
                  className="cursor-pointer"
                >
                  {/* Glow */}
                  {highlight && (
                    <circle cx={node.x} cy={node.y} r={r + 12} fill={TYPE_COLORS[node.type]} opacity={0.1}>
                      <animate attributeName="r" values={`${r + 10};${r + 16};${r + 10}`} dur="2s" repeatCount="indefinite" />
                    </circle>
                  )}
                  <circle
                    cx={node.x} cy={node.y} r={r}
                    fill={TYPE_COLORS[node.type]}
                    opacity={highlight ? 1 : selectedNode ? 0.3 : 0.7}
                    stroke={isSelected ? "hsl(var(--foreground))" : "none"}
                    strokeWidth={1}
                    className="transition-all duration-300"
                  />
                  {(highlight || !selectedNode) && (
                    <text
                      x={node.x} y={node.y + r + 12}
                      textAnchor="middle"
                      fill={highlight ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))"}
                      fontSize={highlight ? 9 : 7}
                      fontWeight={highlight ? 600 : 400}
                      opacity={highlight ? 1 : 0.5}
                      style={{ fontFamily: "Inter, sans-serif" }}
                    >
                      {node.label.length > 20 ? node.label.slice(0, 18) + "…" : node.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}

        {/* Detail panel */}
        {selectedNode && (
          <div className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 bg-secondary/90 backdrop-blur-xl rounded-xl p-5 border border-primary/15 animate-fade-in">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: TYPE_COLORS[selectedNode.type] }} />
              <span className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">{TYPE_LABELS[selectedNode.type]}</span>
            </div>
            <h4 className="text-sm font-semibold text-foreground mb-1" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
              {selectedNode.label}
            </h4>
            {selectedNode.detail && (
              <p className="text-[11px] text-muted-foreground/50 leading-relaxed">{selectedNode.detail}</p>
            )}
            <div className="mt-3 pt-3 border-t border-border/10">
              <p className="text-[10px] text-muted-foreground/30">
                {edges.filter(e => e.from === selectedNode.id || e.to === selectedNode.id).length} connections
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default KnowledgeConstellation;
