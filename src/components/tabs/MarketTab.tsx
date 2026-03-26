import { useState, useEffect } from "react";
import { Loader2, RefreshCw, ExternalLink, Sparkles, Check, X, Copy, ChevronDown, ChevronUp, Settings2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface NewsItem {
  title: string;
  summary: string;
  source: string;
  url: string;
  relevance_tag: string;
  content_type: string;
  post_angle: string;
}

interface DraftPost {
  post: string;
  brand_pillar_alignment: string;
  content_mix_category: string;
  hook_type: string;
  audit_passed: boolean;
  audit_notes: string;
}

interface BrandStats {
  awareness: number;
  authority: number;
  conversion: number;
}

const MarketTab = () => {
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [loadingNews, setLoadingNews] = useState(false);
  const [generatingIdx, setGeneratingIdx] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, DraftPost>>({});
  const [approvedPosts, setApprovedPosts] = useState<number[]>([]);
  const [expandedDraft, setExpandedDraft] = useState<number | null>(null);
  const [brandPillars, setBrandPillars] = useState<string[]>([]);
  const [editingPillars, setEditingPillars] = useState(false);
  const [pillarInput, setPillarInput] = useState("");
  const [savingPillars, setSavingPillars] = useState(false);
  const [swipingIdx, setSwipingIdx] = useState<number | null>(null);
  const [swipeDirection, setSwipeDirection] = useState<"left" | "right" | null>(null);
  const { toast } = useToast();

  // Fetch brand pillars
  useEffect(() => {
    const fetchPillars = async () => {
      const { data } = await supabase
        .from("diagnostic_profiles" as any)
        .select("brand_pillars")
        .maybeSingle();
      if (data) {
        const pillars = (data as any).brand_pillars || [];
        setBrandPillars(pillars);
        setPillarInput(pillars.join(", "));
      }
    };
    fetchPillars();
  }, []);

  const fetchNews = async () => {
    setLoadingNews(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data, error } = await supabase.functions.invoke("market-intelligence", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;
      setNewsItems(data.items || []);
      setDrafts({});
      setApprovedPosts([]);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to fetch news", variant: "destructive" });
    } finally {
      setLoadingNews(false);
    }
  };

  const generateDraft = async (item: NewsItem, idx: number) => {
    setGeneratingIdx(idx);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data, error } = await supabase.functions.invoke("generate-branded-post", {
        body: { news_item: item },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;
      setDrafts((prev) => ({ ...prev, [idx]: data }));
      setExpandedDraft(idx);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to generate post", variant: "destructive" });
    } finally {
      setGeneratingIdx(null);
    }
  };

  const approveDraft = (idx: number) => {
    setSwipingIdx(idx);
    setSwipeDirection("right");
    setTimeout(() => {
      setApprovedPosts((prev) => [...prev, idx]);
      if (drafts[idx]) {
        navigator.clipboard?.writeText(drafts[idx].post).catch(() => {});
        toast({ title: "Post Approved ✓", description: "Copied to clipboard. Ready to publish." });
      }
      setSwipingIdx(null);
      setSwipeDirection(null);
    }, 400);
  };

  const rejectDraft = (idx: number) => {
    setSwipingIdx(idx);
    setSwipeDirection("left");
    setTimeout(() => {
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[idx];
        return next;
      });
      setSwipingIdx(null);
      setSwipeDirection(null);
      setExpandedDraft(null);
    }, 400);
  };

  const savePillars = async () => {
    setSavingPillars(true);
    try {
      const pillars = pillarInput.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 3);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await supabase.from("diagnostic_profiles" as any).update({
        brand_pillars: pillars,
      } as any).eq("user_id", session.user.id);
      setBrandPillars(pillars);
      setEditingPillars(false);
      toast({ title: "Brand Pillars Updated" });
    } catch {
      toast({ title: "Error saving pillars", variant: "destructive" });
    } finally {
      setSavingPillars(false);
    }
  };

  // Brand Balance calculation
  const brandStats: BrandStats = Object.values(drafts).reduce(
    (acc, d) => {
      if (d.content_mix_category === "awareness") acc.awareness++;
      else if (d.content_mix_category === "authority") acc.authority++;
      else if (d.content_mix_category === "conversion") acc.conversion++;
      return acc;
    },
    { awareness: 0, authority: 0, conversion: 0 } as BrandStats
  );
  const totalDrafts = brandStats.awareness + brandStats.authority + brandStats.conversion;

  const typeColor = (type: string) => {
    switch (type) {
      case "trend": return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      case "whitepaper": return "bg-purple-500/10 text-purple-400 border-purple-500/20";
      case "insight": return "bg-amber-500/10 text-amber-400 border-amber-500/20";
      case "regulation": return "bg-red-500/10 text-red-400 border-red-500/20";
      default: return "bg-muted/10 text-muted-foreground border-border/20";
    }
  };

  return (
    <div className="space-y-8">
      {/* Brand Pillars Bar */}
      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground tracking-widest uppercase">Brand Pillar Guardrails</h3>
          <button onClick={() => setEditingPillars(true)} className="text-muted-foreground/50 hover:text-primary transition-colors">
            <Settings2 className="w-4 h-4" />
          </button>
        </div>
        <div className="flex gap-2 flex-wrap">
          {brandPillars.length > 0 ? brandPillars.map((p, i) => (
            <div key={i} className="px-4 py-2 rounded-xl bg-primary/8 border border-primary/15 text-xs font-medium text-primary">
              {p}
            </div>
          )) : (
            <p className="text-xs text-muted-foreground/40">No brand pillars set. Complete the Executive Diagnostic or edit here.</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Market Intelligence Feed */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                Market Intelligence
              </h3>
              <p className="text-[10px] text-muted-foreground/50 tracking-wide uppercase mt-0.5">Filtered by your sector & skills</p>
            </div>
            <button
              onClick={fetchNews}
              disabled={loadingNews}
              className="flex items-center gap-2 px-4 py-2 rounded-xl glass-card text-xs text-muted-foreground hover:text-primary transition-all tactile-press"
            >
              {loadingNews ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              <span>Scan Market</span>
            </button>
          </div>

          {!newsItems.length && !loadingNews && (
            <div className="glass-card rounded-2xl p-12 flex flex-col items-center justify-center text-center">
              <Sparkles className="w-8 h-8 text-primary/40 mb-4" />
              <h4 className="text-sm font-semibold text-foreground/80 mb-1">Your Intelligence Radar</h4>
              <p className="text-xs text-muted-foreground/50 max-w-xs">
                Tap "Scan Market" to pull the latest sector trends, whitepapers, and insights tailored to your brand pillars.
              </p>
            </div>
          )}

          {loadingNews && (
            <div className="glass-card rounded-2xl p-12 flex flex-col items-center justify-center">
              <Loader2 className="w-6 h-6 text-primary animate-spin mb-3" />
              <p className="text-xs text-muted-foreground/50">Scanning your sector intelligence...</p>
            </div>
          )}

          <div className="space-y-3">
            {newsItems.map((item, idx) => (
              <div
                key={idx}
                className={`glass-card rounded-xl p-5 border border-border/10 transition-all duration-300 ${
                  swipingIdx === idx
                    ? swipeDirection === "right"
                      ? "translate-x-[100%] opacity-0"
                      : "-translate-x-[100%] opacity-0"
                    : approvedPosts.includes(idx)
                    ? "opacity-40 pointer-events-none"
                    : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className={`text-[9px] tracking-widest uppercase px-2 py-0.5 rounded-md border ${typeColor(item.content_type)}`}>
                        {item.content_type}
                      </span>
                      <span className="text-[10px] text-primary/60">{item.relevance_tag}</span>
                    </div>
                    <h4 className="text-sm font-semibold text-foreground/90 mb-1">{item.title}</h4>
                    <p className="text-xs text-muted-foreground/60 leading-relaxed mb-2">{item.summary}</p>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground/40">
                      <span>{item.source}</span>
                      {item.url && (
                        <a href={item.url} target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>

                    {/* Post angle hint */}
                    {item.post_angle && (
                      <div className="mt-3 px-3 py-2 rounded-lg bg-primary/5 border border-primary/10">
                        <p className="text-[10px] text-primary/70">
                          <span className="font-semibold">Post angle:</span> {item.post_angle}
                        </p>
                      </div>
                    )}

                    {/* Generate / Draft section */}
                    <div className="mt-3 flex items-center gap-2">
                      {!drafts[idx] && !approvedPosts.includes(idx) && (
                        <button
                          onClick={() => generateDraft(item, idx)}
                          disabled={generatingIdx === idx}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-[11px] text-primary font-medium hover:bg-primary/15 transition-all tactile-press"
                        >
                          {generatingIdx === idx ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                          Draft Content
                        </button>
                      )}
                    </div>

                    {/* Draft preview with swipe actions */}
                    {drafts[idx] && !approvedPosts.includes(idx) && (
                      <div className="mt-4 rounded-xl bg-muted/5 border border-border/15 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className={`text-[9px] px-2 py-0.5 rounded-md ${drafts[idx].audit_passed ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}>
                              {drafts[idx].audit_passed ? "Audit ✓" : "Audit ✗"}
                            </span>
                            <span className="text-[9px] text-primary/50">{drafts[idx].brand_pillar_alignment}</span>
                            <span className="text-[9px] text-muted-foreground/40 capitalize">{drafts[idx].content_mix_category}</span>
                          </div>
                          <button onClick={() => setExpandedDraft(expandedDraft === idx ? null : idx)}>
                            {expandedDraft === idx ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground/40" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/40" />}
                          </button>
                        </div>

                        <p className="text-xs text-foreground/80 whitespace-pre-line leading-relaxed">
                          {expandedDraft === idx ? drafts[idx].post : drafts[idx].post.slice(0, 200) + "..."}
                        </p>

                        {/* Swipe-to-approve actions */}
                        <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/10">
                          <button
                            onClick={() => rejectDraft(idx)}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive tactile-press hover:bg-destructive/15 transition-all"
                          >
                            <X className="w-3.5 h-3.5" />
                            Reject
                          </button>
                          <button
                            onClick={() => {
                              navigator.clipboard?.writeText(drafts[idx].post);
                              toast({ title: "Copied to clipboard" });
                            }}
                            className="p-2 rounded-lg hover:bg-muted/10 transition-colors"
                          >
                            <Copy className="w-3.5 h-3.5 text-muted-foreground/50" />
                          </button>
                          <button
                            onClick={() => approveDraft(idx)}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 tactile-press hover:bg-emerald-500/15 transition-all"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Approve
                          </button>
                        </div>
                      </div>
                    )}

                    {approvedPosts.includes(idx) && (
                      <div className="mt-3 flex items-center gap-2 text-emerald-400 text-[11px]">
                        <Check className="w-3.5 h-3.5" />
                        <span>Approved & copied</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right sidebar: Brand Balance + Pillar KPIs */}
        <div className="space-y-6">
          {/* Brand Balance Chart */}
          <div className="glass-card rounded-2xl p-6">
            <h4 className="text-sm font-semibold text-foreground tracking-widest uppercase mb-4">Brand Balance</h4>
            <p className="text-[10px] text-muted-foreground/40 mb-4">70-20-10 content mix target</p>

            {totalDrafts > 0 ? (
              <div className="space-y-4">
                {[
                  { label: "Awareness", value: brandStats.awareness, target: 70, color: "bg-blue-400" },
                  { label: "Authority", value: brandStats.authority, target: 20, color: "bg-purple-400" },
                  { label: "Conversion", value: brandStats.conversion, target: 10, color: "bg-amber-400" },
                ].map((cat) => {
                  const pct = totalDrafts > 0 ? Math.round((cat.value / totalDrafts) * 100) : 0;
                  return (
                    <div key={cat.label}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-foreground/70">{cat.label}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-foreground/80">{pct}%</span>
                          <span className="text-[10px] text-muted-foreground/40">/ {cat.target}%</span>
                        </div>
                      </div>
                      <div className="h-2 rounded-full bg-muted/15 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${cat.color} transition-all duration-500`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/30 text-center py-4">
                Generate drafts to see your content mix balance.
              </p>
            )}
          </div>

          {/* Pillar alignment summary */}
          <div className="glass-card rounded-2xl p-6">
            <h4 className="text-sm font-semibold text-foreground tracking-widest uppercase mb-4">Pillar Alignment</h4>
            {brandPillars.length > 0 ? (
              <div className="space-y-3">
                {brandPillars.map((pillar, i) => {
                  const aligned = Object.values(drafts).filter(
                    (d) => d.brand_pillar_alignment?.toLowerCase().includes(pillar.toLowerCase())
                  ).length;
                  return (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-xs text-foreground/70 truncate flex-1">{pillar}</span>
                      <span className="text-xs font-semibold text-primary ml-2">{aligned} posts</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/30 text-center py-2">Set brand pillars to track alignment.</p>
            )}
          </div>

          {/* Approved queue */}
          {approvedPosts.length > 0 && (
            <div className="glass-card rounded-2xl p-6">
              <h4 className="text-sm font-semibold text-foreground tracking-widest uppercase mb-3">
                Approved Queue
              </h4>
              <div className="space-y-2">
                {approvedPosts.map((idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs text-emerald-400/70">
                    <Check className="w-3 h-3" />
                    <span className="truncate">{newsItems[idx]?.title}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground/40 mt-3">
                {approvedPosts.length} post{approvedPosts.length > 1 ? "s" : ""} ready to publish
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Brand Pillars Editor Dialog */}
      <Dialog open={editingPillars} onOpenChange={setEditingPillars}>
        <DialogContent className="glass-card border-border/30 sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-gradient-gold text-lg">Edit Brand Pillars</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground/60 mb-3">
            Define 3 core strategic themes that define your personal brand. Separate with commas.
          </p>
          <Input
            value={pillarInput}
            onChange={(e) => setPillarInput(e.target.value)}
            placeholder="e.g., Digital Transformation, Innovation, Future of Work"
            className="bg-secondary border-border/30"
          />
          <Button onClick={savePillars} disabled={savingPillars} className="w-full mt-3 bg-primary text-primary-foreground">
            {savingPillars ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Save Pillars
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MarketTab;
