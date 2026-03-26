import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Zap, BookOpen, Layers, Sparkles, Search, Lightbulb, PenLine,
  Link, Mic, Type, FileUp, FileText, ImageIcon, Clock, Loader2,
  ArrowRight, RefreshCw, Brain, Shield
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatSmartDate } from "@/lib/formatDate";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Entry = Database["public"]["Tables"]["entries"]["Row"];

interface IntelligenceTabProps {
  entries: Entry[];
  onOpenChat?: (msg?: string) => void;
  onRefresh?: () => Promise<void> | void;
}

type SubTab = "signals" | "knowledge" | "patterns";

/* ═══════════════════════════════════════════
   Signals Sub-Tab
   ═══════════════════════════════════════════ */

interface Signal {
  id: string;
  signal_title: string;
  confidence: number;
  supporting_evidence_ids: string[];
  theme_tags: string[];
  explanation: string;
  created_at: string;
}

const SignalsPanel = ({ onOpenChat }: { onOpenChat?: (msg?: string) => void }) => {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    loadSignals();
  }, []);

  const loadSignals = async () => {
    const { data } = await supabase
      .from("strategic_signals")
      .select("id, signal_title, confidence, supporting_evidence_ids, theme_tags, explanation, created_at")
      .eq("status", "active")
      .order("confidence", { ascending: false })
      .limit(20);
    setSignals(data || []);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-primary/40" />
      </div>
    );
  }

  if (signals.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-10 text-center">
        <Zap className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-foreground font-medium mb-1">No signals detected yet</p>
        <p className="text-muted-foreground text-sm">Capture more knowledge to generate strategic signals.</p>
      </div>
    );
  }

  const visible = showAll ? signals : signals.slice(0, 6);

  return (
    <div className="space-y-4">
      {visible.map((signal, i) => {
        const conf = Math.round(signal.confidence * 100);
        const sources = signal.supporting_evidence_ids?.length || 0;

        return (
          <motion.div
            key={signal.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.05 }}
            className="glass-card rounded-2xl p-6 border border-border/8 hover:border-primary/15 transition-all"
          >
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/15 shrink-0 mt-0.5">
                <Zap className="w-5 h-5 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-foreground font-semibold text-sm leading-snug mb-2">
                  {signal.signal_title}
                </p>
                <p className="text-muted-foreground text-sm leading-relaxed line-clamp-2 mb-3">
                  {signal.explanation}
                </p>

                <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
                  <span className="tabular-nums font-medium text-amber-400">{conf}% confidence</span>
                  <span>{sources} source{sources !== 1 ? "s" : ""}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatSmartDate(signal.created_at)}</span>
                </div>

                {signal.theme_tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {signal.theme_tags.slice(0, 3).map(tag => (
                      <span key={tag} className="text-xs px-2.5 py-1 rounded-full bg-primary/8 text-primary/70 border border-primary/10">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={() => onOpenChat?.(`Explore this signal in depth: ${signal.signal_title}`)}>
                    <Search className="w-3.5 h-3.5" /> Explore
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={() => onOpenChat?.(`Create a strategic insight from: ${signal.signal_title}`)}>
                    <Lightbulb className="w-3.5 h-3.5" /> Create Insight
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={() => onOpenChat?.(`Draft LinkedIn content about: ${signal.signal_title}`)}>
                    <PenLine className="w-3.5 h-3.5" /> Draft Content
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        );
      })}

      {signals.length > 6 && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full glass-card rounded-xl p-4 text-sm font-medium text-primary/70 hover:text-primary hover:border-primary/20 transition-colors flex items-center justify-center gap-2"
        >
          View All Signals <ArrowRight className="w-4 h-4" />
        </button>
      )}
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

  useEffect(() => {
    loadKnowledge();
  }, []);

  const loadKnowledge = async () => {
    const [entriesRes, docsRes] = await Promise.all([
      supabase.from("entries").select("id, type, title, content, created_at").order("created_at", { ascending: false }).limit(200),
      supabase.from("documents").select("id, filename, file_type, created_at").order("created_at", { ascending: false }).limit(100),
    ]);

    const entryItems: KnowledgeItem[] = (entriesRes.data || []).map((e: any) => ({
      id: e.id, type: "entry", title: e.title || e.content?.slice(0, 80) || "Untitled",
      subtype: e.type, date: e.created_at,
    }));

    const docItems: KnowledgeItem[] = (docsRes.data || []).map((d: any) => ({
      id: d.id, type: "document", title: d.filename,
      subtype: "document", date: d.created_at,
    }));

    setItems([...entryItems, ...docItems].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    setLoading(false);
  };

  const filtered = items.filter(item => {
    if (filter !== "all" && item.subtype !== filter) return false;
    if (search && !item.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

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

      {/* Quick Actions */}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={() => onOpenChat?.("I want to add a quick note")}>
          <Type className="w-3.5 h-3.5" /> Add Note
        </Button>
        <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={() => onOpenChat?.("I want to add a link")}>
          <Link className="w-3.5 h-3.5" /> Add Link
        </Button>
        <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={() => onOpenChat?.("I want to upload a document")}>
          <FileUp className="w-3.5 h-3.5" /> Upload
        </Button>
        <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={() => onOpenChat?.("I want to record a voice insight")}>
          <Mic className="w-3.5 h-3.5" /> Voice
        </Button>
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
        <ScrollArea className="max-h-[600px]">
          <div className="space-y-2">
            {filtered.map((item, i) => {
              const Icon = item.type === "document" ? FileText : (ENTRY_ICONS[item.subtype] || Type);
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2, delay: Math.min(i * 0.02, 0.3) }}
                  className="flex items-center gap-3 p-4 rounded-xl glass-card border border-border/6 hover:border-primary/10 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-secondary/30 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-muted-foreground/60" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{item.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 capitalize">{item.subtype} · {formatSmartDate(item.date)}</p>
                  </div>
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

  useEffect(() => {
    loadPatterns();
  }, []);

  const loadPatterns = async () => {
    try {
      const [signalsRes, profileRes, postsRes] = await Promise.all([
        supabase.from("strategic_signals").select("signal_title, confidence, theme_tags, supporting_evidence_ids").eq("status", "active").order("confidence", { ascending: false }).limit(20),
        (supabase.from("diagnostic_profiles" as any) as any).select("sector_focus, identity_intelligence, brand_pillars").maybeSingle(),
        supabase.from("linkedin_posts").select("tone, theme").limit(50),
      ]);

      const signals = signalsRes.data || [];
      const profile = profileRes.data;
      const posts = postsRes.data || [];

      // Authority Themes
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
          name,
          evidenceCount: d.count,
          confidence: d.count >= 5 ? "High" : d.count >= 3 ? "Medium" : "Low",
        }));

      // Tone Intelligence
      const toneCounts: Record<string, number> = {};
      posts.forEach((p: any) => {
        if (p.tone) toneCounts[p.tone] = (toneCounts[p.tone] || 0) + 1;
      });
      const sortedTones = Object.entries(toneCounts).sort((a, b) => b[1] - a[1]);
      const toneIntelligence = {
        dominant: sortedTones[0]?.[0] || "—",
        secondary: sortedTones[1]?.[0] || "—",
      };

      // Industry Focus
      const identity = profile?.identity_intelligence || {};
      const industryFocus = [
        profile?.sector_focus,
        ...(identity.industries || []),
      ].filter(Boolean).slice(0, 4) as string[];

      // Language Signals from top signal titles
      const words: Record<string, number> = {};
      signals.forEach((s: any) => {
        s.signal_title.split(/\s+/).forEach((w: string) => {
          const clean = w.toLowerCase().replace(/[^a-z]/g, "");
          if (clean.length > 4) words[clean] = (words[clean] || 0) + 1;
        });
      });
      const languageSignals = Object.entries(words)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([w]) => w.charAt(0).toUpperCase() + w.slice(1));

      setData({ authorityThemes, toneIntelligence, industryFocus, languageSignals });
    } catch (err) {
      console.error("Patterns load error:", err);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-primary/40" />
      </div>
    );
  }

  if (!data) return null;

  const panels = [
    {
      title: "Authority Themes",
      icon: <Zap className="w-4 h-4 text-primary" />,
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
      ) : <p className="text-sm text-muted-foreground">Not enough data to detect themes yet.</p>,
    },
    {
      title: "Tone Intelligence",
      icon: <Mic className="w-4 h-4 text-primary" />,
      content: (
        <div className="space-y-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Dominant Tone</p>
            <p className="text-sm font-medium text-foreground capitalize">{data.toneIntelligence.dominant}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Secondary Tone</p>
            <p className="text-sm font-medium text-foreground capitalize">{data.toneIntelligence.secondary}</p>
          </div>
        </div>
      ),
    },
    {
      title: "Industry Focus",
      icon: <Layers className="w-4 h-4 text-primary" />,
      content: data.industryFocus.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {data.industryFocus.map(ind => (
            <span key={ind} className="text-xs px-3 py-1.5 rounded-full bg-primary/8 text-primary/70 border border-primary/10 font-medium">
              {ind}
            </span>
          ))}
        </div>
      ) : <p className="text-sm text-muted-foreground">Complete your profile to see industry focus.</p>,
    },
    {
      title: "Language Signals",
      icon: <BookOpen className="w-4 h-4 text-primary" />,
      content: data.languageSignals.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {data.languageSignals.map(term => (
            <span key={term} className="text-xs px-3 py-1.5 rounded-full bg-secondary/30 text-foreground/70 border border-border/10 font-medium">
              {term}
            </span>
          ))}
        </div>
      ) : <p className="text-sm text-muted-foreground">Not enough data to detect language patterns yet.</p>,
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
      <div className="flex gap-1 p-1 rounded-xl bg-secondary/15 border border-border/8 w-fit">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
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
