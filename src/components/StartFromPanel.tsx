import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Sparkles, Zap, Target, Lightbulb, RefreshCw, Loader2,
  Clock, TrendingUp, BookOpen
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type ContentType = "post" | "carousel" | "framework_summary";

interface RawSignal {
  id: string;
  signal_title: string;
  explanation: string;
  content_opportunity: any;
  confidence: number;
  created_at: string;
  status: string;
}

interface RawFramework {
  id: string;
  title: string;
  summary: string | null;
  tags: string[];
  created_at: string;
}

interface CuratedItem {
  id: string;
  title: string;
  context: string;
  sourceType: "signal" | "framework" | "insight";
  confidence?: number;
  reason: string;
  contentType: ContentType;
  signalTitle?: string;
  signalInsight?: string;
  freshness: number; // days ago
}

interface StartFromPanelProps {
  currentFormat: ContentType;
  hasDraft: boolean;
  onSelect: (
    topic: string,
    context: string,
    format: ContentType,
    signalTitle?: string,
    signalInsight?: string
  ) => void;
}

/** Deduplicate by comparing lowercased title keywords (≥3 overlap = duplicate) */
function isDuplicate(a: string, b: string): boolean {
  const wordsA = new Set(a.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 3));
  const wordsB = new Set(b.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 3));
  let overlap = 0;
  for (const w of wordsA) if (wordsB.has(w)) overlap++;
  return overlap >= 3;
}

function daysAgo(dateStr: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000));
}

export default function StartFromPanel({ currentFormat, hasDraft, onSelect }: StartFromPanelProps) {
  const [signals, setSignals] = useState<RawSignal[]>([]);
  const [frameworks, setFrameworks] = useState<RawFramework[]>([]);
  const [usedIds, setUsedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, fRes, usedRes] = await Promise.all([
        supabase
          .from("strategic_signals")
          .select("id, signal_title, explanation, content_opportunity, confidence, created_at, status")
          .eq("status", "active")
          .gte("confidence", 0.5)
          .order("confidence", { ascending: false })
          .limit(10),
        supabase
          .from("master_frameworks")
          .select("id, title, summary, tags, created_at")
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("content_items")
          .select("generation_params")
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      setSignals((sRes.data || []) as any);
      setFrameworks((fRes.data || []) as any);
      // Track used signal/framework titles to deprioritize
      const used = new Set<string>();
      (usedRes.data || []).forEach((item: any) => {
        const params = item.generation_params;
        if (params?.signal_id) used.add(params.signal_id);
      });
      setUsedIds(used);
    } catch (e) {
      console.error("StartFromPanel fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Build curated list
  const curated = useMemo(() => {
    const items: CuratedItem[] = [];
    const titles: string[] = [];

    const addIfNew = (item: CuratedItem) => {
      if (titles.some(t => isDuplicate(t, item.title))) return;
      titles.push(item.title);
      items.push(item);
    };

    // Map signals
    for (const s of signals) {
      const title = s.content_opportunity?.title || s.signal_title;
      const fresh = daysAgo(s.created_at);
      const isUsed = usedIds.has(s.id);

      let reason = "";
      if (s.confidence >= 0.85) reason = "High confidence";
      else if (fresh <= 3) reason = "Fresh signal";
      else if (!isUsed) reason = "Unused opportunity";
      else reason = "Related to your work";

      // Determine best format for this signal
      let bestFormat: ContentType = "post";
      if (currentFormat === "framework_summary" && s.content_opportunity?.framework_angle) {
        bestFormat = "framework_summary";
      } else if (currentFormat === "carousel") {
        bestFormat = "carousel";
      }

      addIfNew({
        id: s.id,
        title,
        context: s.explanation,
        sourceType: "signal",
        confidence: s.confidence,
        reason,
        contentType: bestFormat,
        signalTitle: s.signal_title,
        signalInsight: s.explanation,
        freshness: fresh,
      });
    }

    // Map frameworks
    for (const fw of frameworks) {
      const fresh = daysAgo(fw.created_at);
      addIfNew({
        id: fw.id,
        title: fw.title,
        context: fw.summary || "",
        sourceType: "framework",
        reason: fresh <= 7 ? "Recent framework" : "Your framework",
        contentType: currentFormat === "framework_summary" ? "framework_summary" : "post",
        freshness: fresh,
      });
    }

    // Score and sort
    items.sort((a, b) => {
      // Format match bonus
      const aMatch = a.contentType === currentFormat ? 10 : 0;
      const bMatch = b.contentType === currentFormat ? 10 : 0;
      // Confidence bonus
      const aConf = (a.confidence || 0.5) * 5;
      const bConf = (b.confidence || 0.5) * 5;
      // Freshness bonus (newer = better)
      const aFresh = Math.max(0, 5 - a.freshness * 0.5);
      const bFresh = Math.max(0, 5 - b.freshness * 0.5);
      // Unused bonus
      const aUsed = usedIds.has(a.id) ? 0 : 3;
      const bUsed = usedIds.has(b.id) ? 0 : 3;

      return (bMatch + bConf + bFresh + bUsed) - (aMatch + aConf + aFresh + aUsed);
    });

    return items.slice(0, 7);
  }, [signals, frameworks, currentFormat, usedIds]);

  // Group items
  const groups = useMemo(() => {
    const recommended = curated.filter(i => (i.confidence || 0) >= 0.8 || i.freshness <= 2);
    const fresh = curated.filter(i => !recommended.includes(i) && i.freshness <= 14);
    const rest = curated.filter(i => !recommended.includes(i) && !fresh.includes(i));

    const result: { label: string; icon: any; items: CuratedItem[] }[] = [];
    if (recommended.length) result.push({ label: "Recommended now", icon: Sparkles, items: recommended.slice(0, 3) });
    if (fresh.length) result.push({ label: "Fresh signals", icon: TrendingUp, items: fresh.slice(0, 3) });
    if (rest.length) result.push({ label: "More opportunities", icon: Lightbulb, items: rest.slice(0, 2) });
    return result;
  }, [curated]);

  const handleItemClick = (item: CuratedItem) => {
    if (hasDraft) {
      if (confirmId === item.id) {
        onSelect(item.title, item.context, item.contentType, item.signalTitle, item.signalInsight);
        setConfirmId(null);
      } else {
        setConfirmId(item.id);
      }
    } else {
      onSelect(item.title, item.context, item.contentType, item.signalTitle, item.signalInsight);
    }
  };

  const sourceIcon = (type: CuratedItem["sourceType"]) => {
    switch (type) {
      case "signal": return <Zap className="w-3 h-3 text-amber-500/70" />;
      case "framework": return <BookOpen className="w-3 h-3 text-blue-400/70" />;
      default: return <Lightbulb className="w-3 h-3 text-primary/50" />;
    }
  };

  return (
    <div className="hidden lg:block w-72 shrink-0">
      <div className="sticky top-0 glass-card rounded-2xl border border-border/8 max-h-[calc(100vh-240px)] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <h4 className="text-label uppercase tracking-wider text-xs font-semibold">Start From</h4>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={fetchData}
            disabled={loading}
            className="h-6 w-6 p-0 text-muted-foreground/40 hover:text-primary"
            title="Refresh suggestions"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Content */}
        <div className="px-5 pb-5 space-y-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-4 h-4 animate-spin text-primary/40" />
            </div>
          ) : groups.length === 0 ? (
            <div className="text-center py-8">
              <Lightbulb className="w-6 h-6 text-primary/20 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground/40">Capture more insights to unlock suggestions</p>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.label} className="space-y-1.5">
                <p className="text-[10px] text-muted-foreground/50 uppercase tracking-widest font-semibold flex items-center gap-1">
                  <group.icon className="w-3 h-3" />
                  {group.label}
                </p>
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      confirmId === item.id
                        ? "bg-amber-500/10 border-amber-500/30"
                        : "bg-card/60 border-border/8 hover:border-primary/15"
                    }`}
                  >
                    {confirmId === item.id ? (
                      <p className="text-[11px] text-amber-500 font-medium">
                        Replace current draft? Click again to confirm.
                      </p>
                    ) : (
                      <>
                        <div className="flex items-start gap-2">
                          <div className="mt-0.5 shrink-0">{sourceIcon(item.sourceType)}</div>
                          <p className="text-xs font-semibold text-foreground leading-snug line-clamp-2">{item.title}</p>
                        </div>
                        <div className="flex items-center gap-2 mt-1.5 ml-5">
                          <span className="text-[10px] text-muted-foreground/40 leading-none">{item.reason}</span>
                          {item.confidence && item.confidence >= 0.7 && (
                            <span className="text-[10px] text-primary/50 tabular-nums">{Math.round(item.confidence * 100)}%</span>
                          )}
                        </div>
                      </>
                    )}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
