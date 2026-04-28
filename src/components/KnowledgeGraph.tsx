import { useState, useEffect, useCallback, useMemo } from "react";
import ReactFlow, {
  Background, Controls, MiniMap, useNodesState, useEdgesState,
  type Node, type Edge, MarkerType,
} from "reactflow";
import "reactflow/dist/style.css";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Network, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

/* ── Types ── */
interface GraphEntity {
  id: string;
  label: string;
  type: "signal" | "framework" | "entry" | "evidence" | "pillar";
  metadata?: Record<string, any>;
}

interface GraphLink {
  source: string;
  target: string;
  relationship: string;
}

interface KnowledgeGraphProps {
  open: boolean;
  onClose: () => void;
}

/* ── Node colors by type ── */
const NODE_COLORS: Record<string, { bg: string; border: string }> = {
  signal: { bg: "var(--warning-pale)", border: "#f59e0b" },
  framework: { bg: "#dbeafe", border: "#3b82f6" },
  entry: { bg: "#f3e8ff", border: "#8b5cf6" },
  evidence: { bg: "#dcfce7", border: "#22c55e" },
  pillar: { bg: "#ffe4e6", border: "#f43f5e" },
};

const KnowledgeGraph = ({ open, onClose }: KnowledgeGraphProps) => {
  const [loading, setLoading] = useState(true);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  const loadGraphData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch data in parallel
      const [signalsRes, frameworksRes, entriesRes, evidenceRes] = await Promise.all([
        supabase.from("strategic_signals").select("id, signal_title, skill_pillars, theme_tags, confidence").eq("status", "active").limit(20),
        supabase.from("master_frameworks").select("id, title, tags, summary").limit(20),
        supabase.from("entries").select("id, title, skill_pillar, type, summary").order("created_at", { ascending: false }).limit(30),
        supabase.from("evidence_fragments").select("id, title, fragment_type, skill_pillars, tags, source_registry_id").limit(40),
      ]);

      const graphNodes: Node[] = [];
      const graphEdges: Edge[] = [];
      const pillarSet = new Set<string>();

      // Collect all pillars
      signalsRes.data?.forEach(s => s.skill_pillars?.forEach((p: string) => pillarSet.add(p)));
      frameworksRes.data?.forEach(f => f.tags?.forEach((t: string) => { if (t.includes("Advisory") || t.includes("Architecture") || t.includes("Foresight") || t.includes("Stewardship") || t.includes("Fluency")) pillarSet.add(t); }));
      entriesRes.data?.forEach(e => { if (e.skill_pillar) pillarSet.add(e.skill_pillar); });

      // Place pillar nodes in a circle at center
      const pillars = Array.from(pillarSet);
      const pillarRadius = 250;
      pillars.forEach((p, i) => {
        const angle = (2 * Math.PI * i) / pillars.length - Math.PI / 2;
        graphNodes.push({
          id: `pillar-${p}`,
          data: { label: p, type: "pillar" },
          position: { x: 600 + pillarRadius * Math.cos(angle), y: 400 + pillarRadius * Math.sin(angle) },
          style: {
            background: NODE_COLORS.pillar.bg, border: `2px solid ${NODE_COLORS.pillar.border}`,
            borderRadius: 20, padding: "8px 16px", fontSize: 11, fontWeight: 700,
            color: "var(--surface-ink-subtle)",
          },
        });
      });

      // Signals
      signalsRes.data?.forEach((s, i) => {
        const nodeId = `signal-${s.id}`;
        const angle = (2 * Math.PI * i) / (signalsRes.data?.length || 1);
        const r = 500 + Math.random() * 100;
        graphNodes.push({
          id: nodeId,
          data: { label: s.signal_title, type: "signal", confidence: s.confidence },
          position: { x: 600 + r * Math.cos(angle), y: 400 + r * Math.sin(angle) },
          style: {
            background: NODE_COLORS.signal.bg, border: `2px solid ${NODE_COLORS.signal.border}`,
            borderRadius: 12, padding: "6px 12px", fontSize: 10, fontWeight: 600,
            maxWidth: 160, color: "var(--surface-ink-subtle)",
          },
        });
        s.skill_pillars?.forEach((p: string) => {
          if (pillarSet.has(p)) {
            graphEdges.push({
              id: `e-${nodeId}-pillar-${p}`, source: nodeId, target: `pillar-${p}`,
              style: { stroke: "#f59e0b", strokeWidth: 1.5, opacity: 0.5 },
              markerEnd: { type: MarkerType.ArrowClosed, color: "#f59e0b" },
            });
          }
        });
      });

      // Frameworks
      frameworksRes.data?.forEach((f, i) => {
        const nodeId = `framework-${f.id}`;
        const angle = (2 * Math.PI * i) / (frameworksRes.data?.length || 1) + Math.PI / 4;
        const r = 520 + Math.random() * 80;
        graphNodes.push({
          id: nodeId,
          data: { label: f.title, type: "framework", summary: f.summary },
          position: { x: 600 + r * Math.cos(angle), y: 400 + r * Math.sin(angle) },
          style: {
            background: NODE_COLORS.framework.bg, border: `2px solid ${NODE_COLORS.framework.border}`,
            borderRadius: 12, padding: "6px 12px", fontSize: 10, fontWeight: 600,
            maxWidth: 160, color: "var(--surface-ink-subtle)",
          },
        });
        f.tags?.forEach((t: string) => {
          if (pillarSet.has(t)) {
            graphEdges.push({
              id: `e-${nodeId}-pillar-${t}`, source: nodeId, target: `pillar-${t}`,
              style: { stroke: "#3b82f6", strokeWidth: 1.5, opacity: 0.4 },
            });
          }
        });
      });

      // Entries (recent, subset)
      entriesRes.data?.slice(0, 15).forEach((e, i) => {
        const nodeId = `entry-${e.id}`;
        const angle = (2 * Math.PI * i) / 15 + Math.PI / 6;
        const r = 650 + Math.random() * 100;
        graphNodes.push({
          id: nodeId,
          data: { label: e.title || (e as any).content?.slice(0, 40) || "Capture", type: "entry", entryType: e.type },
          position: { x: 600 + r * Math.cos(angle), y: 400 + r * Math.sin(angle) },
          style: {
            background: NODE_COLORS.entry.bg, border: `1.5px solid ${NODE_COLORS.entry.border}`,
            borderRadius: 10, padding: "4px 10px", fontSize: 9, fontWeight: 500,
            maxWidth: 140, opacity: 0.8, color: "var(--surface-ink-subtle)",
          },
        });
        if (e.skill_pillar && pillarSet.has(e.skill_pillar)) {
          graphEdges.push({
            id: `e-${nodeId}-pillar-${e.skill_pillar}`, source: nodeId, target: `pillar-${e.skill_pillar}`,
            style: { stroke: "#8b5cf6", strokeWidth: 1, opacity: 0.3 },
          });
        }
      });

      setNodes(graphNodes);
      setEdges(graphEdges);
    } catch (err) {
      console.error("Knowledge graph error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) loadGraphData();
  }, [open, loadGraphData]);

  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNode(node);
  }, []);

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="bottom" className="h-[85vh] p-0 bg-background/98 backdrop-blur-xl border-primary/10">
        <SheetHeader className="px-5 pt-5 pb-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-blue-500/10 flex items-center justify-center border border-primary/10">
              <Network className="w-4.5 h-4.5 text-primary" />
            </div>
            <div className="flex-1">
              <SheetTitle className="text-base font-bold text-foreground">Knowledge Graph</SheetTitle>
              <SheetDescription className="text-[10px] text-muted-foreground/50">
                Interactive map of your strategic thinking
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="h-0.5 bg-gradient-to-r from-primary/40 via-blue-500/30 to-transparent mt-3" />

        {/* Legend */}
        <div className="px-5 py-2 flex flex-wrap gap-3">
          {[
            { label: "Skill Pillar", color: NODE_COLORS.pillar },
            { label: "Signal", color: NODE_COLORS.signal },
            { label: "Framework", color: NODE_COLORS.framework },
            { label: "Capture", color: NODE_COLORS.entry },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: l.color.border }} />
              <span className="text-[9px] text-muted-foreground/60 font-medium">{l.label}</span>
            </div>
          ))}
        </div>

        <div className="flex-1 h-[calc(85vh-120px)]">
          {loading ? (
            <div className="flex items-center justify-center h-full gap-3">
              <Loader2 className="w-5 h-5 text-primary/60 animate-spin" />
              <span className="text-sm text-muted-foreground/60">Building knowledge graph…</span>
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              fitView
              minZoom={0.3}
              maxZoom={2}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={24} size={1} color="hsl(var(--muted-foreground) / 0.05)" />
              <Controls className="!bg-card/80 !border-border/20 !rounded-xl !shadow-lg" />
              <MiniMap
                nodeColor={(n) => {
                  const t = n.data?.type || "entry";
                  return NODE_COLORS[t]?.border || "var(--ink-5)";
                }}
                className="!bg-card/60 !border-border/10 !rounded-xl"
                maskColor="hsl(var(--background) / 0.7)"
              />
            </ReactFlow>
          )}
        </div>

        {/* Selected node detail */}
        {selectedNode && (
          <div className="absolute bottom-4 left-4 right-4 glass-card rounded-xl border border-primary/10 p-4 animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[9px] uppercase tracking-[0.12em] text-primary/50 font-semibold">
                  {selectedNode.data?.type}
                </span>
                <p className="text-sm font-bold text-foreground mt-0.5">{selectedNode.data?.label}</p>
                {selectedNode.data?.summary && (
                  <p className="text-xs text-muted-foreground/60 mt-1 line-clamp-2">{selectedNode.data.summary}</p>
                )}
                {selectedNode.data?.confidence && (
                  <p className="text-[10px] text-primary/60 mt-1">
                    Confidence: {Math.round(selectedNode.data.confidence * 100)}%
                  </p>
                )}
              </div>
              <button onClick={() => setSelectedNode(null)} className="text-muted-foreground/40 hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default KnowledgeGraph;
