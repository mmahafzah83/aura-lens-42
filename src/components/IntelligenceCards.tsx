import { useState, useEffect, useRef } from "react";
import { BookOpen, ExternalLink, Loader2, RefreshCw, CheckCircle2, ChevronLeft, ChevronRight, Target, Sparkles, TrendingUp } from "lucide-react";
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
}

interface SkillGap {
  name: string;
  current: number;
  target: number;
  delta: number;
}

const TYPE_CONFIG: Record<string, { label: string; gradient: string; border: string }> = {
  deep_dive: { label: "Deep Dive", gradient: "from-blue-500/10 to-indigo-500/5", border: "border-blue-500/15" },
  market_trend: { label: "Market Trend", gradient: "from-emerald-500/10 to-teal-500/5", border: "border-emerald-500/15" },
  influence: { label: "Influence Opportunity", gradient: "from-amber-500/10 to-orange-500/5", border: "border-amber-500/15" },
};

const IntelligenceCards = () => {
  const [items, setItems] = useState<BriefingItem[]>([]);
  const [gaps, setGaps] = useState<SkillGap[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [readItems, setReadItems] = useState<Set<number>>(new Set());
  const [markingRead, setMarkingRead] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Check cache on mount
  useEffect(() => {
    const cached = sessionStorage.getItem("aura-daily-briefing");
    const cachedTime = sessionStorage.getItem("aura-daily-briefing-time");
    if (cached && cachedTime) {
      const age = Date.now() - parseInt(cachedTime);
      if (age < 4 * 60 * 60 * 1000) { // 4 hours cache
        try {
          const data = JSON.parse(cached);
          setItems(data.items || []);
          setGaps(data.gaps || []);
          setLoaded(true);
          return;
        } catch {}
      }
    }
  }, []);

  const fetchBriefing = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase.functions.invoke("daily-briefing", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error) throw error;
      setItems(data.items || []);
      setGaps(data.gaps || []);
      setLoaded(true);
      setActiveIndex(0);
      setReadItems(new Set());

      // Cache
      sessionStorage.setItem("aura-daily-briefing", JSON.stringify(data));
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

      // Insert learned intelligence with +2% boost
      await supabase.from("learned_intelligence" as any).insert({
        user_id: session.user.id,
        title: `Read: ${item.title}`,
        content: `${item.bluf}\n\nSource: ${item.source}`,
        intelligence_type: item.type === "deep_dive" ? "framework" : item.type === "market_trend" ? "trend" : "insight",
        skill_pillars: [item.skill_target],
        skill_boost_pct: 2,
        tags: ["daily-briefing", item.type],
      } as any);

      setReadItems((prev) => new Set([...prev, index]));
      toast({
        title: "Intelligence Absorbed",
        description: `+2% boost to ${item.skill_target}`,
      });
    } catch (err) {
      console.error("Mark as read failed:", err);
    } finally {
      setMarkingRead(null);
    }
  };

  const scrollToCard = (index: number) => {
    setActiveIndex(index);
    if (scrollRef.current) {
      const card = scrollRef.current.children[index] as HTMLElement;
      if (card) {
        card.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      }
    }
  };

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    const scrollLeft = container.scrollLeft;
    const cardWidth = container.children[0]?.clientWidth || 300;
    const gap = 16;
    const newIndex = Math.round(scrollLeft / (cardWidth + gap));
    if (newIndex !== activeIndex && newIndex >= 0 && newIndex < items.length) {
      setActiveIndex(newIndex);
    }
  };

  if (!loaded && !loading) {
    return (
      <div className="glass-card rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/15">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground tracking-widest uppercase">Daily Intelligence Briefing</h3>
            <p className="text-[10px] text-muted-foreground/50 mt-0.5">3 items tailored to your skill gaps</p>
          </div>
        </div>
        <button
          onClick={fetchBriefing}
          className="w-full py-8 rounded-xl border border-dashed border-border/20 text-sm text-muted-foreground/50 hover:text-foreground/70 hover:border-primary/20 transition-all duration-200 flex flex-col items-center gap-2 tactile-press"
        >
          <Target className="w-5 h-5" />
          <span>Generate Today's Briefing</span>
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-8 flex flex-col items-center gap-3">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Curating your intelligence briefing...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/15">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground tracking-widest uppercase">Daily Intelligence</h3>
            <p className="text-[10px] text-muted-foreground/50 mt-0.5">
              Closing gaps in {gaps.map((g) => g.name).join(" & ")}
            </p>
          </div>
        </div>
        <button onClick={fetchBriefing} disabled={loading} className="text-muted-foreground/50 hover:text-primary transition-colors tactile-press">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Gap badges */}
      {gaps.length > 0 && (
        <div className="flex gap-2 px-1">
          {gaps.map((gap) => (
            <div key={gap.name} className="px-3 py-1.5 rounded-lg bg-destructive/10 border border-destructive/15 text-[10px]">
              <span className="font-semibold text-destructive">{gap.name}</span>
              <span className="text-destructive/60 ml-1">−{gap.delta}%</span>
            </div>
          ))}
        </div>
      )}

      {/* Swipeable carousel */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-2 -mx-2 px-2"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {items.map((item, i) => {
          const config = TYPE_CONFIG[item.type] || TYPE_CONFIG.deep_dive;
          const isRead = readItems.has(i);

          return (
            <div
              key={i}
              className={`snap-center shrink-0 w-[85vw] max-w-[360px] rounded-2xl border p-5 transition-all duration-300 ${
                config.border
              } bg-gradient-to-br ${config.gradient} ${isRead ? "opacity-60" : ""}`}
            >
              {/* Type badge */}
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
              <h4 className="text-base font-semibold text-foreground/90 mb-2 leading-snug line-clamp-2">{item.title}</h4>

              {/* Source */}
              <p className="text-xs text-muted-foreground/50 mb-3 flex items-center gap-1.5">
                {item.source}
                {item.url && (
                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-primary/60 hover:text-primary">
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </p>

              {/* BLUF */}
              <div className="p-3 rounded-xl bg-background/40 border border-border/10 mb-3">
                <p className="text-[10px] font-bold text-primary/70 uppercase tracking-wider mb-1">Director's BLUF</p>
                {item.bluf.includes("|") ? (
                  <ul className="space-y-1.5 text-xs text-foreground/70 leading-relaxed">
                    {item.bluf.split("|").map((bullet, bi) => {
                      const labels = ["The Shift", "The Impact", "The Action"];
                      return (
                        <li key={bi} className="flex items-start gap-1.5">
                          <span className="text-[9px] font-bold text-primary/60 uppercase whitespace-nowrap mt-0.5">{labels[bi] || "•"}</span>
                          <span>{bullet.trim()}</span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-xs text-foreground/70 leading-relaxed">{item.bluf}</p>
                )}
              </div>

              {/* Skill target */}
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-3 h-3 text-primary/60" />
                <span className="text-[10px] text-primary/60">Closes: {item.skill_target}</span>
                <span className="text-[10px] text-emerald-400 font-semibold ml-auto">+2%</span>
              </div>

              {/* LinkedIn prompt (for influence type) */}
              {item.prompt && (
                <div className="p-3 rounded-lg bg-muted/10 border border-border/10 mb-3">
                  <p className="text-[10px] text-muted-foreground/50 uppercase mb-1">Post Starter</p>
                  <p className="text-xs text-foreground/70 italic">"{item.prompt}"</p>
                </div>
              )}

              {/* Mark as Read */}
              <button
                onClick={() => markAsRead(i)}
                disabled={isRead || markingRead === i}
                className={`w-full py-3 rounded-xl text-sm font-medium tactile-press transition-all flex items-center justify-center gap-2 ${
                  isRead
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-primary text-primary-foreground border border-primary/30 hover-lift"
                }`}
              >
                {markingRead === i ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : isRead ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Read & Absorbed
                  </>
                ) : (
                  <>
                    <BookOpen className="w-4 h-4" />
                    Mark as Read (+2%)
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Dot indicators */}
      {items.length > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => scrollToCard(Math.max(0, activeIndex - 1))}
            className="w-7 h-7 rounded-full bg-muted/10 flex items-center justify-center text-muted-foreground/40 hover:text-foreground tactile-press"
            disabled={activeIndex === 0}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          {items.map((_, i) => (
            <button
              key={i}
              onClick={() => scrollToCard(i)}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                i === activeIndex ? "bg-primary w-6" : "bg-muted-foreground/20"
              }`}
            />
          ))}
          <button
            onClick={() => scrollToCard(Math.min(items.length - 1, activeIndex + 1))}
            className="w-7 h-7 rounded-full bg-muted/10 flex items-center justify-center text-muted-foreground/40 hover:text-foreground tactile-press"
            disabled={activeIndex === items.length - 1}
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};

export default IntelligenceCards;
