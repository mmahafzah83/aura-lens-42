import { useState, useEffect, useCallback } from "react";
import ReactFlow, {
  Background, Controls, MiniMap, useNodesState, useEdgesState,
  type Node, type Edge, MarkerType,
} from "reactflow";
import "reactflow/dist/style.css";
import { supabase } from "@/integrations/supabase/client";
import {
  Loader2, Network, X, Zap, Lightbulb, Layers,
  FileText, Users
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

/* ── Node type styling ── */
const NODE_STYLES: Record<string, { bg: string; border: string; label: string; icon: typeof Zap }> = {
  signal:    { bg: "hsl(45 93% 90%)",   border: "hsl(45 93% 47%)",   label: "Signal",    icon: Zap },
  insight:   { bg: "hsl(217 91% 90%)",  border: "hsl(217 91% 60%)",  label: "Insight",   icon: Lightbulb },
  framework: { bg: "hsl(142 71% 90%)",  border: "hsl(142 71% 45%)",  label: "Framework", icon: Layers },
  content:   { bg: "hsl(270 67% 90%)",  border: "hsl(270 67% 58%)",  label: "Content",   icon: FileText },
  audience:  { bg: "hsl(350 80% 92%)",  border: "hsl(350 80% 55%)",  label: "Audience",  icon: Users },
};

interface SignalGraphProps {
  open: boolean;
  onClose: () => void;
}

const SignalGraph = ({ open, onClose }: SignalGraphProps) => {
  const [loading, setLoading] = useState(true);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  const loadGraph = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [signalsRes, insightsRes, frameworksRes, contentRes, snapshotRes] = await Promise.all([
        supabase.from("strategic_signals").select("id, signal_title, explanation, confidence, supporting_evidence_ids, theme_tags, skill_pillars").eq("status", "active").order("confidence", { ascending: false }).limit(15),
        supabase.from("learned_intelligence").select("id, title, content, intelligence_type, skill_pillars, tags").order("created_at", { ascending: false }).limit(20),
        supabase.from("master_frameworks").select("id, title, summary, tags, framework_steps").order("created_at", { ascending: false }).limit(15),
        supabase.from("framework_activations").select("id, title, output_type, framework_id").order("created_at", { ascending: false }).limit(15),
        supabase.from("influence_snapshots").select("id, followers, engagement_rate, authority_themes, audience_breakdown, top_topic").order("snapshot_date", { ascending: false }).limit(1),
      ]);

      const gNodes: Node[] = [];
      const gEdges: Edge[] = [];
      let edgeId = 0;
      const nextEdge = () => `e-${edgeId++}`;

      const mkStyle = (type: string, extra?: Partial<React.CSSProperties>) => ({
        background: NODE_STYLES[type]?.bg || "#eee",
        border: `2px solid ${NODE_STYLES[type]?.border || "#999"}`,
        borderRadius: 14,
        padding: "8px 14px",
        fontSize: 10,
        fontWeight: 600,
        maxWidth: 170,
        color: "#1a1a1a",
        ...extra,
      });

      const mkEdge = (src: string, tgt: string, label: string, color: string): Edge => ({
        id: nextEdge(),
        source: src,
        target: tgt,
        label,
        labelStyle: { fontSize: 8, fontWeight: 600, fill: "#888" },
        style: { stroke: color, strokeWidth: 1.5, opacity: 0.6 },
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 12, height: 12 },
        animated: true,
      });

      // Layout constants
      const CX = 700, CY = 500;
      const signals = signalsRes.data || [];
      const insights = insightsRes.data || [];
      const frameworks = frameworksRes.data || [];
      const content = contentRes.data || [];
      const snapshot = snapshotRes.data?.[0];

      // ── Signal nodes (top) ──
      signals.forEach((s, i) => {
        const nid = `signal-${s.id}`;
        const spread = Math.min(signals.length, 8);
        const x = CX - (spread * 100) / 2 + (i % spread) * 120;
        const y = 60 + Math.floor(i / spread) * 100;
        gNodes.push({
          id: nid,
          data: { label: s.signal_title, type: "signal", confidence: s.confidence, detail: s.explanation, evidenceCount: s.supporting_evidence_ids?.length || 0, themes: s.theme_tags },
          position: { x, y },
          style: mkStyle("signal"),
        });
      });

      // ── Insight nodes (second row) ──
      const insightMap: Record<string, string> = {}; // tag → insight id for linking
      insights.forEach((ins, i) => {
        const nid = `insight-${ins.id}`;
        const spread = Math.min(insights.length, 8);
        const x = CX - (spread * 100) / 2 + (i % spread) * 120;
        const y = 300 + Math.floor(i / spread) * 100;
        gNodes.push({
          id: nid,
          data: { label: ins.title, type: "insight", detail: ins.content, intelligenceType: ins.intelligence_type, pillars: ins.skill_pillars },
          position: { x, y },
          style: mkStyle("insight"),
        });
        ins.tags?.forEach(t => { insightMap[t.toLowerCase()] = nid; });

        // Link signals → insights via matching tags/pillars
        signals.forEach(s => {
          const sigTags = [...(s.theme_tags || []), ...(s.skill_pillars || [])].map(t => t.toLowerCase());
          const insTags = [...(ins.tags || []), ...(ins.skill_pillars || [])].map(t => t.toLowerCase());
          if (sigTags.some(st => insTags.includes(st))) {
            gEdges.push(mkEdge(`signal-${s.id}`, nid, "generates", NODE_STYLES.signal.border));
          }
        });
      });

      // ── Framework nodes (third row) ──
      const fwMap: Record<string, string> = {}; // fw id → node id
      frameworks.forEach((fw, i) => {
        const nid = `framework-${fw.id}`;
        fwMap[fw.id] = nid;
        const spread = Math.min(frameworks.length, 6);
        const x = CX - (spread * 130) / 2 + (i % spread) * 140;
        const y = 550 + Math.floor(i / spread) * 110;
        const steps = Array.isArray(fw.framework_steps) ? fw.framework_steps : [];
        gNodes.push({
          id: nid,
          data: {
            label: fw.title, type: "framework", detail: fw.summary,
            components: steps.slice(0, 5).map((s: any) => typeof s === "string" ? s : s.title || s.name || "Step"),
          },
          position: { x, y },
          style: mkStyle("framework"),
        });

        // Link insights → frameworks via matching tags
        fw.tags?.forEach(t => {
          const key = t.toLowerCase();
          if (insightMap[key]) {
            gEdges.push(mkEdge(insightMap[key], nid, "informs", NODE_STYLES.insight.border));
          }
        });
      });

      // ── Content nodes (fourth row) ──
      content.forEach((c, i) => {
        const nid = `content-${c.id}`;
        const spread = Math.min(content.length, 6);
        const x = CX - (spread * 130) / 2 + (i % spread) * 140;
        const y = 800 + Math.floor(i / spread) * 100;
        gNodes.push({
          id: nid,
          data: { label: c.title, type: "content", contentType: c.output_type },
          position: { x, y },
          style: mkStyle("content"),
        });

        // Link framework → content
        if (c.framework_id && fwMap[c.framework_id]) {
          gEdges.push(mkEdge(fwMap[c.framework_id], nid, "produces", NODE_STYLES.framework.border));
        }
      });

      // ── Audience node (bottom, singular summary) ──
      if (snapshot) {
        const themes = (snapshot.authority_themes || []) as any[];
        const segments = snapshot.audience_breakdown as any;
        const nid = "audience-main";
        gNodes.push({
          id: nid,
          data: {
            label: `${snapshot.followers?.toLocaleString() || 0} followers`,
            type: "audience",
            detail: snapshot.top_topic ? `Top topic: ${snapshot.top_topic}` : undefined,
            engagement: snapshot.engagement_rate,
            themes: themes.slice(0, 4).map((t: any) => typeof t === "string" ? t : t.theme || t.name),
            segments: segments?.industries?.slice(0, 3)?.map((s: any) => s.name) || [],
          },
          position: { x: CX - 80, y: 1020 },
          style: mkStyle("audience", { minWidth: 180 }),
        });

        // Link content → audience
        content.slice(0, 5).forEach(c => {
          gEdges.push(mkEdge(`content-${c.id}`, nid, "influences", NODE_STYLES.content.border));
        });

        // Audience → signals (feedback loop)
        signals.slice(0, 2).forEach(s => {
          gEdges.push(mkEdge(nid, `signal-${s.id}`, "validates", NODE_STYLES.audience.border));
        });
      }

      setNodes(gNodes);
      setEdges(gEdges);
    } catch (err) {
      console.error("Signal graph error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) loadGraph();
  }, [open, loadGraph]);

  const onNodeClick = useCallback((_: any, node: Node) => setSelectedNode(node), []);

  // Detail panel content
  const renderDetail = () => {
    if (!selectedNode) return null;
    const d = selectedNode.data;
    const style = NODE_STYLES[d.type] || NODE_STYLES.signal;

    return (
      <div className="absolute bottom-4 left-4 right-4 max-w-lg mx-auto glass-card rounded-xl border border-primary/10 p-5 animate-in slide-in-from-bottom-4 duration-300 z-50">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: style.bg, border: `1.5px solid ${style.border}` }}>
                <style.icon className="w-3 h-3" style={{ color: style.border }} />
              </div>
              <span className="text-[9px] uppercase tracking-[0.12em] font-semibold" style={{ color: style.border }}>
                {style.label}
              </span>
            </div>
            <p className="text-sm font-bold text-foreground leading-snug">{d.label}</p>

            {d.detail && <p className="text-xs text-muted-foreground/70 mt-1.5 leading-relaxed line-clamp-3">{d.detail}</p>}

            {d.confidence != null && (
              <p className="text-[10px] text-primary/60 mt-1.5 tabular-nums">Confidence: {Math.round(d.confidence * 100)}%</p>
            )}
            {d.evidenceCount != null && (
              <p className="text-[10px] text-muted-foreground/50 mt-0.5">{d.evidenceCount} evidence sources</p>
            )}
            {d.components?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {d.components.map((c: string, i: number) => (
                  <span key={i} className="text-[9px] px-2 py-0.5 rounded-full bg-secondary/30 border border-border/10 text-foreground/70">{c}</span>
                ))}
              </div>
            )}
            {d.contentType && <p className="text-[10px] text-muted-foreground/50 mt-1 capitalize">Type: {d.contentType}</p>}
            {d.engagement != null && (
              <p className="text-[10px] text-primary/60 mt-1 tabular-nums">Engagement: {Number(d.engagement).toFixed(1)}%</p>
            )}
            {d.themes?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {d.themes.map((t: string, i: number) => (
                  <span key={i} className="text-[9px] px-2 py-0.5 rounded-full bg-primary/8 text-primary/70 border border-primary/10">{t}</span>
                ))}
              </div>
            )}
            {d.segments?.length > 0 && (
              <p className="text-[10px] text-muted-foreground/50 mt-1">Segments: {d.segments.join(", ")}</p>
            )}
          </div>
          <button onClick={() => setSelectedNode(null)} className="text-muted-foreground/40 hover:text-foreground shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="bottom" className="h-[90vh] p-0 bg-background/98 backdrop-blur-xl border-primary/10">
        <SheetHeader className="px-5 pt-5 pb-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-blue-500/10 flex items-center justify-center border border-primary/10">
              <Network className="w-4.5 h-4.5 text-primary" />
            </div>
            <div className="flex-1">
              <SheetTitle className="text-base font-bold text-foreground">Signal Graph</SheetTitle>
              <SheetDescription className="text-[10px] text-muted-foreground/50">
                Strategic intelligence network · Signal → Insight → Framework → Content → Audience
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="h-0.5 bg-gradient-to-r from-primary/40 via-blue-500/30 to-transparent mt-3" />

        {/* Legend */}
        <div className="px-5 py-2.5 flex flex-wrap gap-4">
          {Object.entries(NODE_STYLES).map(([key, s]) => (
            <div key={key} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.border }} />
              <span className="text-[9px] text-muted-foreground/60 font-medium">{s.label}</span>
            </div>
          ))}
        </div>

        <div className="flex-1 h-[calc(90vh-130px)]">
          {loading ? (
            <div className="flex items-center justify-center h-full gap-3">
              <Loader2 className="w-5 h-5 text-primary/60 animate-spin" />
              <span className="text-sm text-muted-foreground/60">Building signal graph…</span>
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              fitView
              fitViewOptions={{ padding: 0.15 }}
              minZoom={0.2}
              maxZoom={2.5}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={24} size={1} color="hsl(var(--muted-foreground) / 0.05)" />
              <Controls className="!bg-card/80 !border-border/20 !rounded-xl !shadow-lg" />
              <MiniMap
                nodeColor={(n) => NODE_STYLES[n.data?.type]?.border || "#888"}
                className="!bg-card/60 !border-border/10 !rounded-xl"
                maskColor="hsl(var(--background) / 0.7)"
              />
            </ReactFlow>
          )}
        </div>

        {renderDetail()}
      </SheetContent>
    </Sheet>
  );
};

export default SignalGraph;
