import { useState, useEffect } from "react";
import { BookOpen, ExternalLink, Loader2, RefreshCw, CheckCircle2, Target, Sparkles, TrendingUp, PenLine, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface BriefingItem {
  type: "deep_dive" | "market_trend" | "influence";
  title: string;
  source: string;
  url: string | null;
  skill_target: string;
  bluf: string;
  icon: string;
  prompt?: string;
  estimated_minutes?: number;
  priority?: boolean;
}

interface SkillGap {
  name: string;
  current: number;
  target: number;
  delta: number;
}

const TYPE_CONFIG: Record<string, { label: string; accent: string }> = {
  deep_dive: { label: "Deep Dive", accent: "border-blue-400/30" },
  market_trend: { label: "Market Trend", accent: "border-emerald-400/30" },
  influence: { label: "Influence", accent: "border-amber-400/30" },
};

/** Bold financial figures & entities for rapid scanning */
const boldEntities = (text: string) => {
  return text.replace(
    /\b(SR\s?\d[\d,.]*[MBK]?|SAR\s?\d[\d,.]*[MBK]?|USD\s?\d[\d,.]*[MBK]?|\$\d[\d,.]*[MBK]?|NWC|MEWA|SWA|PIF|NEOM|Vision\s?2030|EY|Deloitte|McKinsey|PwC|BCG|ACWA\s?Power)\b/gi,
    "**$1**"
  );
};

/** Render text with bold markdown */
const RichText = ({ text, className }: { text: string; className?: string }) => {
  const bolded = boldEntities(text);
  const parts = bolded.split(/(\*\*.*?\*\*)/g);
  return (
    <span className={className}>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} className="font-bold text-foreground">{part.slice(2, -2)}</strong>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
};

const IntelligenceCards = () => {
  const [items, setItems] = useState<BriefingItem[]>([]);
  const [gaps, setGaps] = useState<SkillGap[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [readItems, setReadItems] = useState<Set<number>>(new Set());
  const [markingRead, setMarkingRead] = useState<number | null>(null);
  const [draftingPost, setDraftingPost] = useState<number | null>(null);
  const { toast } = useToast();

  // Auto-fetch on login (session appears)
  useEffect(() => {
    const cached = sessionStorage.getItem("aura-daily-briefing");
    const cachedTime = sessionStorage.getItem("aura-daily-briefing-time");
    if (cached && cachedTime) {
      const age = Date.now() - parseInt(cachedTime);
      if (age < 4 * 60 * 60 * 1000) {
        try {
          const data = JSON.parse(cached);
          setItems(data.items || []);
          setGaps(data.gaps || []);
          setLoaded(true);
          return;
        } catch {}
      }
    }
    // Auto-trigger on mount (login trigger)
    fetchBriefing();
  }, []);

  const fetchBriefing = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }

      const { data, error } = await supabase.functions.invoke("daily-briefing", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error) throw error;

      // Tag first item as priority
      const briefingItems = (data.items || []).map((item: BriefingItem, i: number) => ({
        ...item,
        priority: i === 0,
      }));

      setItems(briefingItems);
      setGaps(data.gaps || []);
      setLoaded(true);
      setReadItems(new Set());

      sessionStorage.setItem("aura-daily-briefing", JSON.stringify({ ...data, items: briefingItems }));
      sessionStorage.setItem("aura-daily-briefing-time", Date.now().toString());
    } catch (err) {
      console.error("Briefing failed:", err);
      toast({ title: "Briefing Error", description: "Could not generate your daily briefing.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (index: number) => {
    if (readItems.has(index)) return;
    const item = items[index];
    if (!item) return;

    setMarkingRead(index);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // 1. Award +2% skill boost
      await supabase.from("learned_intelligence" as any).insert({
        user_id: session.user.id,
        title: `Read: ${item.title}`,
        content: `${item.bluf}\n\nSource: ${item.source}`,
        intelligence_type: item.type === "deep_dive" ? "framework" : item.type === "market_trend" ? "trend" : "insight",
        skill_pillars: [item.skill_target],
        skill_boost_pct: 2,
        tags: ["daily-briefing", item.type],
      } as any);

      // 2. Auto-generate LinkedIn post draft
      try {
        await supabase.functions.invoke("generate-branded-post", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: {
            news_item: {
              title: item.title,
              summary: item.bluf,
              source: item.source,
              post_angle: `Authority positioning on ${item.skill_target}`,
              relevance_tag: item.type,
            },
          },
        });
      } catch (postErr) {
        console.warn("Auto-draft failed:", postErr);
      }

      setReadItems((prev) => new Set([...prev, index]));
      toast({
        title: "Intelligence Absorbed",
        description: `+2% to ${item.skill_target} · LinkedIn draft generated`,
      });
    } catch (err) {
      console.error("Mark as read failed:", err);
    } finally {
      setMarkingRead(null);
    }
  };

  const draftLinkedInPost = async (index: number) => {
    const item = items[index];
    if (!item) return;
    setDraftingPost(index);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase.functions.invoke("generate-branded-post", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          news_item: {
            title: item.title,
            summary: item.bluf,
            source: item.source,
            post_angle: `Authority positioning on ${item.skill_target}`,
            relevance_tag: item.type,
          },
        },
      });

      if (error) throw error;
      toast({
        title: "LinkedIn Post Drafted",
        description: "Check your Influence tab for the new draft.",
      });
    } catch (err) {
      console.error("Draft post failed:", err);
      toast({ title: "Draft Failed", description: "Could not generate LinkedIn post.", variant: "destructive" });
    } finally {
      setDraftingPost(null);
    }
  };

  /** Parse BLUF into SIGNAL / ACTION / VALUE format */
  const renderBLUF = (bluf: string) => {
    const labels = [
      { key: "SIGNAL", color: "text-amber-400" },
      { key: "ACTION", color: "text-blue-400" },
      { key: "VALUE", color: "text-emerald-400" },
    ];

    // Try splitting by pipe
    const parts = bluf.includes("|") ? bluf.split("|").map(s => s.trim()) : [];

    if (parts.length >= 3) {
      return (
        <div className="space-y-2">
          {parts.slice(0, 3).map((text, i) => {
            // Strip existing labels like "The Shift:" etc.
            const cleaned = text.replace(/^(The Shift|The Impact|The Action|SIGNAL|ACTION|VALUE)\s*:\s*/i, "");
            return (
              <div key={i} className="flex items-start gap-2">
                <span className={`text-[9px] font-black uppercase tracking-widest whitespace-nowrap mt-0.5 ${labels[i].color}`}>
                  [{labels[i].key}]
                </span>
                <RichText text={cleaned} className="text-xs text-foreground/80 leading-relaxed" />
              </div>
            );
          })}
        </div>
      );
    }

    return <RichText text={bluf} className="text-xs text-foreground/70 leading-relaxed" />;
  };

  if (!loaded && !loading) {
    return (
      <div className="rounded-2xl p-6 bg-card/40 backdrop-blur-xl border border-primary/10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/15">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground tracking-widest uppercase">Daily Intelligence</h3>
            <p className="text-[10px] text-muted-foreground/50 mt-0.5">Login-triggered deep scan</p>
          </div>
        </div>
        <button
          onClick={fetchBriefing}
          className="w-full py-8 rounded-xl border border-dashed border-primary/15 text-sm text-muted-foreground/50 hover:text-foreground/70 hover:border-primary/30 transition-all duration-200 flex flex-col items-center gap-2 tactile-press"
        >
          <Target className="w-5 h-5" />
          <span>Generate Today's Briefing</span>
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-2xl p-8 flex flex-col items-center gap-3 bg-card/40 backdrop-blur-xl border border-primary/10">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Deep Scan: MEWA · SWA · PIF · NWC · EY…</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/15">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground tracking-widest uppercase">Daily Intelligence</h3>
            <p className="text-[10px] text-muted-foreground/50 mt-0.5">
              Targeting: {gaps.map((g) => g.name).join(" & ")}
            </p>
          </div>
        </div>
        <button onClick={fetchBriefing} disabled={loading} className="text-muted-foreground/50 hover:text-primary transition-colors tactile-press">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Gap badges */}
      {gaps.length > 0 && (
        <div className="flex gap-2 px-1 flex-wrap">
          {gaps.map((gap) => (
            <div key={gap.name} className="px-3 py-1.5 rounded-lg bg-destructive/10 border border-destructive/15 text-[10px]">
              <span className="font-semibold text-destructive">{gap.name}</span>
              <span className="text-destructive/60 ml-1">−{gap.delta}%</span>
            </div>
          ))}
        </div>
      )}

      {/* Vertical Stack (mobile-first) */}
      <div className="space-y-3">
        {items.map((item, i) => {
          const config = TYPE_CONFIG[item.type] || TYPE_CONFIG.deep_dive;
          const isRead = readItems.has(i);

          return (
            <div
              key={i}
              className={`relative rounded-2xl border ${config.accent} p-5 transition-all duration-300 
                bg-card/30 backdrop-blur-xl 
                ${isRead ? "opacity-50" : ""}
                hover:border-primary/20`}
              style={{
                boxShadow: "0 4px 30px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
                borderWidth: "1px",
              }}
            >
              {/* Priority Ribbon */}
              {item.priority && !isRead && (
                <div className="absolute -top-px -right-px px-3 py-1 rounded-bl-xl rounded-tr-2xl bg-gradient-to-r from-primary/90 to-primary text-[9px] font-black uppercase tracking-widest text-primary-foreground">
                  Priority 1: High Client Impact
                </div>
              )}

              {/* Type badge + minutes */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{item.icon}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {config.label}
                  </span>
                </div>
                {item.estimated_minutes && (
                  <span className="text-[10px] text-muted-foreground/50">~{item.estimated_minutes} min</span>
                )}
              </div>

              {/* Title */}
              <h4 className="text-base font-semibold text-foreground/90 mb-2 leading-snug">
                <RichText text={item.title} />
              </h4>

              {/* Source */}
              <p className="text-xs text-muted-foreground/50 mb-3 flex items-center gap-1.5">
                {item.source}
                {item.url && (
                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-primary/60 hover:text-primary">
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </p>

              {/* BLUF — SIGNAL / ACTION / VALUE */}
              <div className="p-3 rounded-xl bg-background/30 border border-primary/10 mb-3">
                <p className="text-[9px] font-black text-primary/70 uppercase tracking-[0.2em] mb-2">Director's BLUF</p>
                {renderBLUF(item.bluf)}
              </div>

              {/* Skill target */}
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-3 h-3 text-primary/60" />
                <span className="text-[10px] text-primary/60">Closes: {item.skill_target}</span>
                <span className="text-[10px] text-emerald-400 font-semibold ml-auto">+2%</span>
              </div>

              {/* Post Starter — hidden until read (progressive disclosure) */}
              {item.prompt && isRead && (
                <div className="p-3 rounded-lg bg-muted/10 border border-border/10 mb-3 animate-fade-in">
                  <p className="text-[10px] text-muted-foreground/50 uppercase mb-1">Post Starter</p>
                  <p className="text-xs text-foreground/70 italic">"{item.prompt}"</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                {/* Mark as Read */}
                <button
                  onClick={() => markAsRead(i)}
                  disabled={isRead || markingRead === i}
                  className={`flex-1 py-3 rounded-xl text-xs font-medium tactile-press transition-all flex items-center justify-center gap-2 ${
                    isRead
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : "bg-primary text-primary-foreground border border-primary/30 hover-lift"
                  }`}
                >
                  {markingRead === i ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : isRead ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Absorbed
                    </>
                  ) : (
                    <>
                      <BookOpen className="w-3.5 h-3.5" />
                      Mark as Read (+2%)
                    </>
                  )}
                </button>

                {/* Draft LinkedIn Post */}
                <button
                  onClick={() => draftLinkedInPost(i)}
                  disabled={draftingPost === i}
                  className="px-4 py-3 rounded-xl text-xs font-medium border border-primary/20 text-primary/80 hover:bg-primary/10 transition-all flex items-center gap-2 tactile-press"
                >
                  {draftingPost === i ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <>
                      <PenLine className="w-3.5 h-3.5" />
                      Draft Post
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default IntelligenceCards;
