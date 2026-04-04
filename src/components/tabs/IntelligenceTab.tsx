import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap, BookOpen, Brain, Shield, Search, Lightbulb, PenLine, Target,
  Link, Mic, Type, FileUp, FileText, ImageIcon, Clock, Loader2,
  ArrowRight, RefreshCw, ChevronDown, ChevronUp, Layers, Trash2,
  Eye, BarChart3, Sparkles
} from "lucide-react";
import { SignalActions } from "@/components/ui/action-buttons";
import PageHeader from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatSmartDate } from "@/lib/formatDate";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import SignalExplorer from "@/components/SignalExplorer";
import FrameworkBuilder from "@/components/FrameworkBuilder";
import LinkedInDraftPanel from "@/components/LinkedInDraftPanel";
import type { Database } from "@/integrations/supabase/types";

type Entry = Database["public"]["Tables"]["entries"]["Row"];

interface IntelligenceTabProps {
  entries: Entry[];
  onOpenChat?: (msg?: string) => void;
  onRefresh?: () => Promise<void> | void;
}

type SubTab = "signals" | "knowledge" | "patterns";

/* ═══════════════════════════════════════════
   Full Signal type
   ═══════════════════════════════════════════ */

interface Signal {
  id: string;
  signal_title: string;
  confidence: number;
  supporting_evidence_ids: string[];
  theme_tags: string[];
  skill_pillars: string[];
  explanation: string;
  strategic_implications: string;
  framework_opportunity: any;
  content_opportunity: any;
  consulting_opportunity: any;
  fragment_count: number;
  created_at: string;
}

/* ── Strategic Value helper ── */
const getStrategicValue = (confidence: number, sources: number) => {
  const score = confidence * 0.6 + Math.min(sources / 10, 1) * 0.4;
  if (score >= 0.75) return { label: "High", class: "bg-emerald-500/15 text-emerald-400" };
  if (score >= 0.5) return { label: "Medium", class: "bg-amber-500/15 text-amber-400" };
  return { label: "Low", class: "bg-secondary/30 text-muted-foreground" };
};

/* ═══════════════════════════════════════════
   Evidence Sources Panel (inline in expanded card)
   ═══════════════════════════════════════════ */

const EvidenceSourcesPanel = ({ evidenceIds }: { evidenceIds: string[] }) => {
  const [fragments, setFragments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!evidenceIds || evidenceIds.length === 0) {
      setLoading(false);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("evidence_fragments")
        .select("id, title, content, fragment_type, metadata, tags")
        .in("id", evidenceIds)
        .limit(20);
      setFragments(data || []);
      setLoading(false);
    })();
  }, [evidenceIds]);

  if (loading) {
    return (
      <div className="rounded-xl bg-card/40 p-4 border border-border/10 space-y-2 animate-pulse">
        <div className="h-3 bg-muted/20 rounded w-1/3" />
        <div className="h-3 bg-muted/15 rounded w-full" />
        <div className="h-3 bg-muted/15 rounded w-2/3" />
      </div>
    );
  }

  if (fragments.length === 0) {
    return (
      <div className="rounded-xl bg-card/40 p-4 border border-border/10">
        <div className="flex items-center gap-2 mb-1">
          <FileText className="w-3.5 h-3.5 text-muted-foreground/50" />
          <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60 font-semibold">Evidence Sources</p>
        </div>
        <p className="text-xs text-muted-foreground/70 italic">Source details not available for this signal</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-card/40 p-4 border border-border/10">
      <div className="flex items-center gap-2 mb-3">
        <FileText className="w-3.5 h-3.5 text-primary/70" />
        <p className="text-[10px] uppercase tracking-[0.15em] text-primary/60 font-semibold">
          Evidence Sources ({fragments.length})
        </p>
      </div>
      <div className="space-y-2">
        {fragments.map((f) => {
          const sourceUrl = (f.metadata as any)?.source_url;
          return (
            <div key={f.id} className="rounded-lg bg-background/40 border border-border/8 p-3">
              <p className="text-xs text-foreground/80 leading-relaxed line-clamp-2 mb-1">
                {f.content?.slice(0, 200) || f.title}
              </p>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                {f.title && <span className="font-medium truncate max-w-[200px]">{f.title}</span>}
                {f.fragment_type && (
                  <span className="px-1.5 py-0.5 rounded bg-muted/20 text-muted-foreground/70">{f.fragment_type}</span>
                )}
                {sourceUrl && (
                  <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary/60 hover:text-primary truncate max-w-[180px]">
                    {new URL(sourceUrl).hostname}
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};



type SortMode = "latest" | "confidence";

const SignalsPanel = ({
  onOpenChat,
}: {
  onOpenChat?: (msg?: string) => void;
}) => {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [explorerSignal, setExplorerSignal] = useState<Signal | null>(null);
  const [builderData, setBuilderData] = useState<{ title: string; description: string; steps: string[] } | null>(null);
  const [draftData, setDraftData] = useState<{ title: string; hook?: string; angle?: string; context?: string } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("latest");
  const [activeClusterTag, setActiveClusterTag] = useState<string | null>(null);

  useEffect(() => { loadSignals(); }, [sortMode]);

  const loadSignals = async () => {
    setLoading(true);
    const orderCol = sortMode === "latest" ? "created_at" : "confidence";
    const { data } = await supabase
      .from("strategic_signals")
      .select("*")
      .eq("status", "active")
      .order(orderCol, { ascending: false })
      .limit(20);
    setSignals((data || []) as unknown as Signal[]);
    setLoading(false);
  };

  const runPatternScan = async () => {
    setScanning(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase.functions.invoke("detect-patterns", { body: { user_id: user.id } });
      if (error) throw error;
      if (data?.signals_detected > 0) {
        toast.success(`${data.signals_detected} signal${data.signals_detected > 1 ? "s" : ""} detected`);
        await loadSignals();
      } else {
        toast.info(data?.message || "No new patterns detected yet.");
      }
    } catch (err: any) {
      toast.error(err.message || "Pattern detection failed");
    } finally {
      setScanning(false);
    }
  };

  // Cluster signals by theme_tags overlap
  const clusters = useMemo(() => {
    if (signals.length === 0) return [];
    const tagToSignals: Record<string, string[]> = {};
    signals.forEach(s => {
      (s.theme_tags || []).forEach(tag => {
        if (!tagToSignals[tag]) tagToSignals[tag] = [];
        tagToSignals[tag].push(s.id);
      });
    });

    // Find clusters with 2+ signals sharing a tag
    const clusterEntries = Object.entries(tagToSignals)
      .filter(([, ids]) => ids.length >= 2)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 5);

    return clusterEntries.map(([tag, ids]) => ({
      name: tag,
      signalCount: ids.length,
      signalIds: [...new Set(ids)],
    }));
  }, [signals]);

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="glass-card rounded-2xl p-5 border border-border/8 space-y-3 animate-pulse">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-muted/30 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted/30 rounded w-3/4" />
                <div className="h-3 bg-muted/20 rounded w-full" />
                <div className="h-3 bg-muted/20 rounded w-1/2" />
                <div className="flex gap-2 mt-2">
                  <div className="h-5 w-20 bg-muted/20 rounded-full" />
                  <div className="h-5 w-16 bg-muted/20 rounded-full" />
                  <div className="h-5 w-24 bg-muted/20 rounded-full" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (signals.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-10 text-center">
        <Zap className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-foreground font-medium mb-1">No signals detected yet</p>
        <p className="text-muted-foreground text-sm mb-4">Capture more knowledge to generate strategic signals.</p>
        <Button variant="outline" size="sm" onClick={runPatternScan} disabled={scanning} className="gap-1.5">
          {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {scanning ? "Scanning…" : "Run Pattern Detection"}
        </Button>
      </div>
    );
  }

  const visible = showAll ? signals : signals.slice(0, 8);

  return (
    <div className="space-y-6">
      {/* Header row with sort + scan */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{signals.length} active signal{signals.length !== 1 ? "s" : ""}</p>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-border/20 bg-card/40 text-xs overflow-hidden">
            <button
              onClick={() => setSortMode("latest")}
              className={`px-3 py-1.5 font-medium transition-colors ${sortMode === "latest" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              Latest
            </button>
            <button
              onClick={() => setSortMode("confidence")}
              className={`px-3 py-1.5 font-medium transition-colors ${sortMode === "confidence" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              Highest confidence
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={runPatternScan} disabled={scanning} className="gap-1.5 text-xs">
            {scanning ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            {scanning ? "Scanning…" : "Detect Patterns"}
          </Button>
        </div>
      </div>

      {/* Signal Clusters */}
      {clusters.length > 0 && (
        <div className="glass-card rounded-2xl p-5 border border-border/8">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/15">
              <Layers className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Signal Clusters</p>
              <p className="text-xs text-muted-foreground">Related signals grouped by theme</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {clusters.map(c => (
              <span key={c.name} className="text-xs px-3 py-1.5 rounded-full bg-primary/8 text-primary/80 border border-primary/12 font-medium">
                {c.name} <span className="text-primary/50 ml-1">({c.signalCount})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Signal Cards */}
      {visible.map((signal, i) => {
        const conf = Math.round(signal.confidence * 100);
        const sources = signal.supporting_evidence_ids?.length || 0;
        const isExpanded = expandedId === signal.id;
        const sv = getStrategicValue(signal.confidence, sources);
        const fw = signal.framework_opportunity || {};

        return (
          <motion.div
            key={signal.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.04 }}
            className="glass-card rounded-2xl border border-border/8 hover:border-primary/15 transition-all overflow-hidden"
          >
            {/* Confidence bar */}
            <div className="h-0.5 bg-muted/20">
              <div className="h-full bg-gradient-to-r from-primary/60 to-primary/30 transition-all" style={{ width: `${conf}%` }} />
            </div>

            {/* Card header — clickable to expand */}
            <button
              onClick={() => setExpandedId(isExpanded ? null : signal.id)}
              className="w-full p-5 text-left"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/15 shrink-0 mt-0.5">
                  <Zap className="w-5 h-5 text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-foreground font-semibold text-sm leading-snug mb-1.5">
                    {signal.signal_title}
                  </p>
                  <p className={`text-muted-foreground text-sm leading-relaxed mb-3 ${isExpanded ? "" : "line-clamp-2"}`}>
                    {signal.explanation}
                  </p>

                  {/* Metrics row */}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mb-3">
                    <span className="tabular-nums font-medium text-amber-400">{conf}% confidence</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${sv.class}`}>{sv.label} value</span>
                    <span>{sources} evidence fragment{sources !== 1 ? "s" : ""}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatSmartDate(signal.created_at)}</span>
                  </div>

                  {/* Tags */}
                  {signal.theme_tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {signal.theme_tags.slice(0, 4).map(tag => (
                        <span key={tag} className="text-xs px-2.5 py-1 rounded-full bg-primary/8 text-primary/70 border border-primary/10">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="shrink-0 mt-1">
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground/30" /> : <ChevronDown className="w-4 h-4 text-muted-foreground/30" />}
                </div>
              </div>
            </button>

            {/* Expanded detail */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <div className="px-5 pb-5 space-y-4 border-t border-border/8 pt-4">
                    {/* Strategic Implication */}
                    {signal.strategic_implications && (
                      <div className="rounded-xl bg-card/60 p-4 border border-primary/[0.06]">
                        <div className="flex items-center gap-2 mb-2">
                          <Target className="w-3.5 h-3.5 text-primary/70" />
                          <p className="text-[10px] uppercase tracking-[0.15em] text-primary/60 font-semibold">Strategic Implication</p>
                        </div>
                        <p className="text-xs text-foreground/80 leading-relaxed">{signal.strategic_implications}</p>
                        {signal.skill_pillars?.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-3">
                            {signal.skill_pillars.map((p, j) => (
                              <span key={j} className="text-[9px] bg-primary/8 text-primary/60 px-2.5 py-1 rounded-full border border-primary/10 font-medium">{p}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Evidence Fragments Sources Panel */}
                    <EvidenceSourcesPanel evidenceIds={signal.supporting_evidence_ids || []} />

                    {/* Standardized Signal Actions */}
                    <SignalActions
                      onExplore={() => setExplorerSignal(signal)}
                      onCreateInsight={() => onOpenChat?.(`Create a strategic insight from this signal:\n\nSignal: ${signal.signal_title}\n\nEvidence: ${signal.explanation}\n\nImplication: ${signal.strategic_implications}`)}
                      onDevelopFramework={() => setBuilderData({
                        title: fw.title || signal.signal_title,
                        description: fw.description || signal.strategic_implications || "",
                        steps: fw.potential_steps || [],
                      })}
                      onDraftContent={() => setDraftData({
                        title: signal.signal_title,
                        hook: signal.explanation,
                        angle: "Strategic thought leadership",
                        context: signal.strategic_implications,
                      })}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}

      {signals.length > 8 && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full glass-card rounded-xl p-4 text-sm font-medium text-primary/70 hover:text-primary hover:border-primary/20 transition-colors flex items-center justify-center gap-2"
        >
          View All {signals.length} Signals <ArrowRight className="w-4 h-4" />
        </button>
      )}

      {/* Panels */}
      <SignalExplorer signal={explorerSignal} open={!!explorerSignal} onClose={() => setExplorerSignal(null)} />
      <FrameworkBuilder
        open={!!builderData}
        onClose={() => setBuilderData(null)}
        initialTitle={builderData?.title || ""}
        initialDescription={builderData?.description || ""}
        initialSteps={builderData?.steps || []}
      />
      <LinkedInDraftPanel
        open={!!draftData}
        onClose={() => setDraftData(null)}
        title={draftData?.title || ""}
        hook={draftData?.hook}
        angle={draftData?.angle}
        context={draftData?.context}
      />
    </div>
  );
};

/* ═══════════════════════════════════════════
   Knowledge Sub-Tab
   ═══════════════════════════════════════════ */

interface KnowledgeItem {
  id: string;
  type: "entry" | "document";
  title: string;
  subtype: string;
  date: string;
  signalCount?: number;
  sourceUrl?: string;
  storagePath?: string;
}

const ENTRY_ICONS: Record<string, typeof Link> = { link: Link, voice: Mic, text: Type, image: ImageIcon };
const FILTERS = [
  { key: "all", label: "All" },
  { key: "text", label: "Notes" },
  { key: "link", label: "Links" },
  { key: "document", label: "Documents" },
  { key: "voice", label: "Voice" },
] as const;

const KnowledgePanel = ({ onOpenChat }: { onOpenChat?: (msg?: string) => void }) => {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<KnowledgeItem | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => { loadKnowledge(); }, []);

  const isAbsoluteUrl = (value?: string | null) => Boolean(value && /^https?:\/\//i.test(value.trim()));

  const resolveEntrySourceUrl = (entry: any) => {
    if (entry.type === "link" && isAbsoluteUrl(entry.content)) {
      return entry.content.trim();
    }

    if (entry.type === "image") {
      const rawImageUrl = entry.image_url?.trim();
      if (!rawImageUrl) return undefined;
      if (isAbsoluteUrl(rawImageUrl)) return rawImageUrl;
      return supabase.storage.from("capture-images").getPublicUrl(rawImageUrl).data.publicUrl;
    }

    return undefined;
  };

  const loadKnowledge = async () => {
    setLoading(true);

    const [entriesRes, docsRes, registryRes] = await Promise.all([
      supabase.from("entries").select("id, type, title, content, image_url, created_at").order("created_at", { ascending: false }).limit(200),
      supabase.from("documents").select("id, filename, file_type, file_url, created_at").order("created_at", { ascending: false }).limit(100),
      supabase.from("source_registry").select("source_id, fragment_count").limit(500),
    ]);

    const fragmentMap: Record<string, number> = {};
    (registryRes.data || []).forEach((r: any) => { fragmentMap[r.source_id] = r.fragment_count || 0; });

    const entryItems: KnowledgeItem[] = (entriesRes.data || []).map((e: any) => ({
      id: e.id,
      type: "entry",
      title: e.title || e.content?.slice(0, 80) || "Untitled",
      subtype: e.type,
      date: e.created_at,
      signalCount: fragmentMap[e.id] || 0,
      sourceUrl: resolveEntrySourceUrl(e),
    }));

    const docItems: KnowledgeItem[] = (docsRes.data || []).map((d: any) => ({
      id: d.id,
      type: "document",
      title: d.filename,
      subtype: "document",
      date: d.created_at,
      signalCount: fragmentMap[d.id] || 0,
      sourceUrl: isAbsoluteUrl(d.file_url) ? d.file_url.trim() : undefined,
      storagePath: d.file_url,
    }));

    setItems([...entryItems, ...docItems].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    setLoading(false);
  };

  const openSource = async (item: KnowledgeItem) => {
    if (item.type !== "document") {
      if (!item.sourceUrl) {
        toast.info("No source URL available for this item");
        return;
      }
      window.open(item.sourceUrl, "_blank", "noopener,noreferrer");
      return;
    }

    if (item.sourceUrl) {
      window.open(item.sourceUrl, "_blank", "noopener,noreferrer");
      return;
    }

    if (!item.storagePath) {
      toast.info("No source file available for this document");
      return;
    }

    const previewTab = window.open("", "_blank");
    if (!previewTab) {
      toast.error("Popup blocked — allow popups to open this document");
      return;
    }

    previewTab.document.write(`
      <html>
        <head><title>Opening document…</title></head>
        <body style="margin:0;font-family:sans-serif;padding:24px;color:#444;">Opening document…</body>
      </html>
    `);
    previewTab.document.close();

    setOpeningId(item.id);

    try {
      const { data, error } = await supabase.storage.from("documents").download(item.storagePath);
      if (error || !data) {
        throw error || new Error("Document download failed");
      }

      const fileBlob = data instanceof Blob ? data : new Blob([data]);
      const objectUrl = URL.createObjectURL(fileBlob);
      const mimeType = fileBlob.type || "application/octet-stream";

      previewTab.document.title = item.title;
      previewTab.document.body.innerHTML = "";
      previewTab.document.body.style.margin = "0";
      previewTab.document.body.style.background = "#0b0b0b";

      if (mimeType.includes("pdf")) {
        const frame = previewTab.document.createElement("iframe");
        frame.src = objectUrl;
        frame.title = item.title;
        frame.style.width = "100vw";
        frame.style.height = "100vh";
        frame.style.border = "0";
        previewTab.document.body.appendChild(frame);
      } else if (mimeType.startsWith("image/")) {
        const image = previewTab.document.createElement("img");
        image.src = objectUrl;
        image.alt = item.title;
        image.style.maxWidth = "100%";
        image.style.maxHeight = "100vh";
        image.style.display = "block";
        image.style.margin = "0 auto";
        previewTab.document.body.style.display = "flex";
        previewTab.document.body.style.alignItems = "center";
        previewTab.document.body.style.justifyContent = "center";
        previewTab.document.body.appendChild(image);
      } else {
        previewTab.location.href = objectUrl;
      }

      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (err: any) {
      previewTab.close();
      toast.error(err?.message || "Could not open document");
    } finally {
      setOpeningId(null);
    }
  };

  const analyzeSource = async (item: KnowledgeItem) => {
    setAnalyzingId(item.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.functions.invoke("extract-evidence", {
        body: {
          user_id: user.id,
          source_type: item.type === "document" ? "document" : "entry",
          source_id: item.id,
        },
      });
      if (error) throw error;
      toast.success("Analysis complete — signals extracted");
      await loadKnowledge();
    } catch (err: any) {
      toast.error(err.message || "Analysis failed");
    } finally {
      setAnalyzingId(null);
    }
  };

  const deleteSource = async (item: KnowledgeItem) => {
    try {
      const table = item.type === "document" ? "documents" : "entries";
      const { error } = await supabase.from(table).delete().eq("id", item.id);
      if (error) throw error;
      setItems(prev => prev.filter(i => i.id !== item.id));
      if (selectedId === item.id) { setSelectedId(null); setSelectedItem(null); }
      toast.success("Source deleted");
    } catch (err: any) {
      toast.error(err.message || "Delete failed");
    }
  };

  const filtered = items.filter(item => {
    if (filter !== "all" && item.subtype !== filter) return false;
    if (search && !item.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const subtypeLabel = (subtype: string) => {
    const map: Record<string, string> = { text: "Note", link: "Link", voice: "Voice", image: "Image", document: "Document" };
    return map[subtype] || subtype;
  };

  return (
    <div className="space-y-5">
      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search knowledge…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-secondary/20 border border-border/10 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/20"
          />
        </div>
        <div className="flex gap-1.5">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                filter === f.key
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/20"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Feed */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-primary/40" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card rounded-2xl p-10 text-center">
          <BookOpen className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-foreground font-medium mb-1">No knowledge items found</p>
          <p className="text-muted-foreground text-sm">Start capturing insights to build your knowledge base.</p>
        </div>
      ) : (
        <ScrollArea className="h-[600px]">
          <div className="space-y-2 pr-2">
            {filtered.map((item, i) => {
              const Icon = item.type === "document" ? FileText : (ENTRY_ICONS[item.subtype] || Type);
              const isSelected = selectedId === item.id;

              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2, delay: Math.min(i * 0.02, 0.3) }}
                >
                  <button
                    onClick={() => {
                      setSelectedId(isSelected ? null : item.id);
                      setSelectedItem(isSelected ? null : item);
                    }}
                    className={`w-full flex items-center gap-3 p-4 rounded-xl glass-card border text-left transition-all ${
                      isSelected ? "border-primary/20 bg-primary/[0.03]" : "border-border/6 hover:border-primary/10"
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-secondary/30 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-muted-foreground/60" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate" dir="auto">{item.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">{subtypeLabel(item.subtype)}</span>
                        <span className="text-xs text-muted-foreground/40">·</span>
                        <span className="text-xs text-muted-foreground">{formatSmartDate(item.date)}</span>
                        {(item.signalCount || 0) > 0 && (
                          <>
                            <span className="text-xs text-muted-foreground/40">·</span>
                            <span className="text-xs text-primary/70 font-medium">{item.signalCount} signal{item.signalCount !== 1 ? "s" : ""}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground/30 transition-transform ${isSelected ? "rotate-180" : ""}`} />
                  </button>

                  {/* Expanded actions */}
                  <AnimatePresence>
                    {isSelected && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="flex gap-2 px-4 py-3">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs gap-1.5"
                            onClick={() => analyzeSource(item)}
                            disabled={analyzingId === item.id}
                          >
                            {analyzingId === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                            Analyze
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs gap-1.5"
                            onClick={() => void openSource(item)}
                            disabled={openingId === item.id || (!item.sourceUrl && !item.storagePath)}
                          >
                            {openingId === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
                            Open
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs gap-1.5 text-destructive/70 hover:text-destructive"
                            onClick={() => deleteSource(item)}
                          >
                            <Trash2 className="w-3 h-3" /> Delete
                          </Button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════
   Patterns Sub-Tab
   ═══════════════════════════════════════════ */

interface PatternData {
  authorityThemes: Array<{ name: string; evidenceCount: number; confidence: string }>;
  toneIntelligence: { dominant: string; secondary: string };
  industryFocus: string[];
  languageSignals: string[];
}

const PatternsPanel = () => {
  const [data, setData] = useState<PatternData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadPatterns(); }, []);

  const loadPatterns = async () => {
    try {
      const [signalsRes, profileRes, postsRes] = await Promise.all([
        supabase.from("strategic_signals").select("signal_title, confidence, theme_tags, supporting_evidence_ids").eq("status", "active").order("confidence", { ascending: false }).limit(20),
        (supabase.from("diagnostic_profiles" as any) as any).select("sector_focus, identity_intelligence, brand_pillars").maybeSingle(),
        supabase.from("linkedin_posts").select("tone, theme").neq("tracking_status", "rejected").limit(50),
      ]);

      const signals = signalsRes.data || [];
      const profile = profileRes.data;
      const posts = postsRes.data || [];

      const themeCounts: Record<string, { count: number; totalConf: number }> = {};
      signals.forEach((s: any) => {
        (s.theme_tags || []).forEach((t: string) => {
          if (!themeCounts[t]) themeCounts[t] = { count: 0, totalConf: 0 };
          themeCounts[t].count += (s.supporting_evidence_ids?.length || 1);
          themeCounts[t].totalConf += Number(s.confidence) || 0.7;
        });
      });
      const authorityThemes = Object.entries(themeCounts)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 5)
        .map(([name, d]) => ({
          name, evidenceCount: d.count,
          confidence: d.count >= 5 ? "High" : d.count >= 3 ? "Medium" : "Low",
        }));

      const toneCounts: Record<string, number> = {};
      posts.forEach((p: any) => { if (p.tone) toneCounts[p.tone] = (toneCounts[p.tone] || 0) + 1; });
      const sortedTones = Object.entries(toneCounts).sort((a, b) => b[1] - a[1]);
      const toneIntelligence = { dominant: sortedTones[0]?.[0] || "—", secondary: sortedTones[1]?.[0] || "—" };

      const identity = profile?.identity_intelligence || {};
      const industryFocus = [profile?.sector_focus, ...(identity.industries || [])].filter(Boolean).slice(0, 4) as string[];

      const words: Record<string, number> = {};
      signals.forEach((s: any) => {
        s.signal_title.split(/\s+/).forEach((w: string) => {
          const clean = w.toLowerCase().replace(/[^a-z]/g, "");
          if (clean.length > 4) words[clean] = (words[clean] || 0) + 1;
        });
      });
      const languageSignals = Object.entries(words).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([w]) => w.charAt(0).toUpperCase() + w.slice(1));

      setData({ authorityThemes, toneIntelligence, industryFocus, languageSignals });
    } catch (err) {
      console.error("Patterns load error:", err);
    }
    setLoading(false);
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-primary/40" /></div>;
  if (!data) return null;

  const panels = [
    {
      title: "Authority Themes", icon: <Zap className="w-4 h-4 text-primary" />,
      content: data.authorityThemes.length > 0 ? (
        <div className="space-y-3">
          {data.authorityThemes.map(t => (
            <div key={t.name} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.evidenceCount} evidence sources</p>
              </div>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                t.confidence === "High" ? "bg-emerald-500/10 text-emerald-400" :
                t.confidence === "Medium" ? "bg-amber-500/10 text-amber-400" :
                "bg-secondary/30 text-muted-foreground"
              }`}>{t.confidence}</span>
            </div>
          ))}
        </div>
      ) : <p className="text-sm text-muted-foreground">Not enough data yet.</p>,
    },
    {
      title: "Tone Intelligence", icon: <Mic className="w-4 h-4 text-primary" />,
      content: (
        <div className="space-y-3">
          <div><p className="text-xs text-muted-foreground mb-1">Dominant</p><p className="text-sm font-medium text-foreground capitalize">{data.toneIntelligence.dominant}</p></div>
          <div><p className="text-xs text-muted-foreground mb-1">Secondary</p><p className="text-sm font-medium text-foreground capitalize">{data.toneIntelligence.secondary}</p></div>
        </div>
      ),
    },
    {
      title: "Industry Focus", icon: <Layers className="w-4 h-4 text-primary" />,
      content: data.industryFocus.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {data.industryFocus.map(ind => (
            <span key={ind} className="text-xs px-3 py-1.5 rounded-full bg-primary/8 text-primary/70 border border-primary/10 font-medium">{ind}</span>
          ))}
        </div>
      ) : <p className="text-sm text-muted-foreground">Complete your profile to see industry focus.</p>,
    },
    {
      title: "Language Signals", icon: <BookOpen className="w-4 h-4 text-primary" />,
      content: data.languageSignals.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {data.languageSignals.map(term => (
            <span key={term} className="text-xs px-3 py-1.5 rounded-full bg-secondary/30 text-foreground/70 border border-border/10 font-medium">{term}</span>
          ))}
        </div>
      ) : <p className="text-sm text-muted-foreground">Not enough data yet.</p>,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
      {panels.map((panel, i) => (
        <motion.div
          key={panel.title}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: i * 0.08 }}
          className="glass-card rounded-2xl p-6 border border-border/8"
        >
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/15">
              {panel.icon}
            </div>
            <p className="text-label uppercase tracking-wider text-xs font-semibold">{panel.title}</p>
          </div>
          {panel.content}
        </motion.div>
      ))}
    </div>
  );
};

/* ═══════════════════════════════════════════
   Main Intelligence Tab
   ═══════════════════════════════════════════ */

const TABS: { key: SubTab; label: string; icon: typeof Zap }[] = [
  { key: "signals", label: "Signals", icon: Zap },
  { key: "knowledge", label: "Knowledge", icon: BookOpen },
  { key: "patterns", label: "Patterns", icon: Brain },
];

const IntelligenceTab = ({ entries, onOpenChat, onRefresh }: IntelligenceTabProps) => {
  const [activeTab, setActiveTab] = useState<SubTab>("signals");

  return (
    <div className="space-y-8">
      <PageHeader
        icon={Shield}
        title="Intelligence"
        question="What signals are shaping your domain?"
        processLogic="Sources → Signals → Clusters → Insights"
      />

      {/* Tab Bar */}
      <div className="flex gap-1 p-1 rounded-xl bg-secondary/15 border border-border/8 w-full sm:w-fit overflow-x-auto scrollbar-hide">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                active
                  ? "bg-primary/10 text-primary border border-primary/20 shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/20"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === "signals" && <SignalsPanel onOpenChat={onOpenChat} />}
      {activeTab === "knowledge" && <KnowledgePanel onOpenChat={onOpenChat} />}
      {activeTab === "patterns" && <PatternsPanel />}
    </div>
  );
};

export default IntelligenceTab;
