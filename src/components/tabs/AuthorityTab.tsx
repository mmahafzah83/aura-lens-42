import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Loader2, Save, Plus, X, Send, Copy, Check,
  PenTool, LayoutGrid, FileText, BookOpen, Lightbulb,
  Sparkles, Zap, Target, ArrowRight, Crown, Layers,
  Calendar, TrendingUp, BarChart3
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatSmartDate } from "@/lib/formatDate";
import CarouselGenerator from "@/components/CarouselGenerator";
import LinkedInIntelligence from "@/components/LinkedInIntelligence";
import StrategicAdvisorPanel from "@/components/StrategicAdvisorPanel";

/* ── Shared Types ── */
type ContentType = "post" | "carousel" | "essay" | "framework_summary";
type AuthoritySubTab = "create" | "plan" | "analyze";

const FORMAT_LABELS: Record<string, { label: string; icon: any }> = {
  post: { label: "LinkedIn Post", icon: PenTool },
  carousel: { label: "Carousel", icon: LayoutGrid },
  essay: { label: "Strategic Essay", icon: FileText },
  framework_summary: { label: "Framework Breakdown", icon: BookOpen },
};

/* ═══════════════════════════════════════════
   CREATE TAB — Content Creation Engine
   ═══════════════════════════════════════════ */

interface SignalSuggestion {
  id: string;
  signal_title: string;
  explanation: string;
  content_opportunity: any;
  confidence: number;
}

interface FrameworkSuggestion {
  id: string;
  title: string;
  summary: string | null;
  tags: string[];
}

const CreateTab = () => {
  const [topic, setTopic] = useState("");
  const [context, setContext] = useState("");
  const [contentType, setContentType] = useState<ContentType>("post");
  const [lang, setLang] = useState<"en" | "ar">("en");
  const [output, setOutput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showCarousel, setShowCarousel] = useState(false);

  // AI suggestions
  const [signals, setSignals] = useState<SignalSuggestion[]>([]);
  const [frameworks, setFrameworks] = useState<FrameworkSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase.from("strategic_signals").select("id, signal_title, explanation, content_opportunity, confidence")
        .eq("status", "active").gte("confidence", 0.6).order("confidence", { ascending: false }).limit(5),
      supabase.from("master_frameworks").select("id, title, summary, tags").order("created_at", { ascending: false }).limit(5),
    ]).then(([sRes, fRes]) => {
      setSignals((sRes.data || []) as any);
      setFrameworks((fRes.data || []) as any);
      setSuggestionsLoading(false);
    });
  }, []);

  const selectSuggestion = (t: string, ctx: string, format: ContentType) => {
    setTopic(t);
    setContext(ctx);
    setContentType(format);
    setOutput("");
  };

  const generate = async () => {
    if (!topic.trim()) return;
    if (contentType === "carousel") { setShowCarousel(true); return; }
    setGenerating(true);
    setOutput("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-authority-content`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ action: "generate_content", content_type: contentType, topic, context, language: lang }),
      });
      if (!resp.ok || !resp.body) throw new Error("Generation failed");
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let accumulated = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, nl);
          textBuffer = textBuffer.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") break;
          try {
            const c = JSON.parse(json).choices?.[0]?.delta?.content;
            if (c) { accumulated += c; setOutput(accumulated); }
          } catch {}
        }
      }
      // Fire-and-forget save to linkedin_posts
      if (accumulated) {
        supabase.auth.getSession().then(({ data: { session: s } }) => {
          if (!s?.user?.id) return;
          const firstLine = accumulated.split(/\n/).find(l => l.trim())?.trim() || "";
          supabase.from("linkedin_posts").insert({
            user_id: s.user.id,
            linkedin_post_id: `aura_${Date.now()}`,
            post_text: accumulated,
            title: topic,
            hook: firstLine.slice(0, 300),
            tone: lang === "ar" ? "arabic_executive" : "authority",
            format_type: contentType === "framework_summary" ? "framework" : contentType,
            content_type: contentType === "framework_summary" ? "framework" : contentType,
            topic_label: topic,
            source_type: "aura_generated",
            tracking_status: "draft",
          }).then(({ error: saveErr }) => {
            if (saveErr) console.error("Auto-save to linkedin_posts failed:", saveErr);
          });
        });
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Main Editor */}
      <div className="flex-1 min-w-0 space-y-5">
        {/* Format Selector */}
        <div>
          <p className="text-label uppercase tracking-wider text-xs font-semibold mb-3">Content Format</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {(Object.entries(FORMAT_LABELS) as [ContentType, { label: string; icon: any }][]).map(([key, { label, icon: Icon }]) => (
              <button key={key} onClick={() => setContentType(key)} className={`p-3 rounded-xl border text-left transition-all ${contentType === key ? "bg-primary/10 border-primary/30 text-primary" : "bg-secondary/20 border-border/10 text-muted-foreground hover:border-border/30"}`}>
                <Icon className="w-4 h-4 mb-1.5" />
                <span className="text-xs font-medium">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Topic */}
        <div>
          <p className="text-label uppercase tracking-wider text-xs font-semibold mb-2">Topic</p>
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Why AI-native organizations will outperform digital transformations" className="bg-secondary/30 border-border/20 text-sm" />
        </div>

        {/* Context */}
        <div>
          <p className="text-label uppercase tracking-wider text-xs font-semibold mb-2">Context <span className="text-muted-foreground/50 normal-case">(optional)</span></p>
          <Textarea value={context} onChange={(e) => setContext(e.target.value)} placeholder="Add angles, data points, or frameworks to include…" className="min-h-[80px] bg-secondary/30 border-border/20 text-sm" />
        </div>

        {/* Language */}
        <div className="flex items-center gap-3">
          <p className="text-label uppercase tracking-wider text-xs font-semibold">Language</p>
          <div className="flex gap-1 bg-secondary/30 rounded-lg p-0.5 border border-border/10">
            <button onClick={() => setLang("en")} className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${lang === "en" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}>English</button>
            <button onClick={() => setLang("ar")} className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${lang === "ar" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}>العربية</button>
          </div>
        </div>

        {/* Generate */}
        <Button onClick={generate} disabled={generating || !topic.trim()} className="w-full gap-2">
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Generate {FORMAT_LABELS[contentType]?.label || "Content"}
        </Button>

        {/* Output */}
        {output && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-label uppercase tracking-wider text-xs font-semibold">Generated Content</span>
              <Button size="sm" variant="ghost" onClick={handleCopy} className="h-7 gap-1.5 text-xs">
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <div dir={lang === "ar" ? "rtl" : "ltr"} className="p-5 rounded-xl bg-secondary/20 border border-border/10 text-sm text-foreground/90 leading-relaxed whitespace-pre-line max-h-[500px] overflow-y-auto">
              {output}
              {generating && <span className="inline-block w-1.5 h-4 bg-primary/60 ml-1 animate-pulse rounded-sm" />}
            </div>
          </motion.div>
        )}

        {showCarousel && <CarouselGenerator open={showCarousel} onClose={() => setShowCarousel(false)} title={topic} context={context} />}
      </div>

      {/* Suggestions Sidebar */}
      <div className="hidden lg:block w-72 shrink-0">
        <div className="sticky top-0 glass-card rounded-2xl p-5 border border-border/8 max-h-[calc(100vh-240px)] overflow-y-auto space-y-5">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <h4 className="text-label uppercase tracking-wider text-xs font-semibold">Start From</h4>
          </div>

          {suggestionsLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-primary/40" /></div>
          ) : (
            <>
              {signals.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] text-muted-foreground/50 uppercase tracking-widest font-semibold flex items-center gap-1"><Zap className="w-3 h-3" /> Signals</p>
                  {signals.map(s => (
                    <button key={s.id} onClick={() => selectSuggestion(s.content_opportunity?.title || s.signal_title, s.explanation, "post")} className="w-full text-left p-3 rounded-xl bg-card/60 border border-border/8 hover:border-primary/15 transition-all">
                      <p className="text-xs font-semibold text-foreground leading-snug line-clamp-2">{s.content_opportunity?.title || s.signal_title}</p>
                      <span className="text-[10px] text-muted-foreground/50 mt-1 block">{Math.round(s.confidence * 100)}% confidence</span>
                    </button>
                  ))}
                </div>
              )}
              {frameworks.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] text-muted-foreground/50 uppercase tracking-widest font-semibold flex items-center gap-1"><Target className="w-3 h-3" /> Frameworks</p>
                  {frameworks.map(fw => (
                    <button key={fw.id} onClick={() => selectSuggestion(fw.title, fw.summary || "", "framework_summary")} className="w-full text-left p-3 rounded-xl bg-card/60 border border-border/8 hover:border-primary/15 transition-all">
                      <p className="text-xs font-semibold text-foreground leading-snug line-clamp-2">{fw.title}</p>
                    </button>
                  ))}
                </div>
              )}
              {signals.length === 0 && frameworks.length === 0 && (
                <div className="text-center py-6">
                  <Lightbulb className="w-6 h-6 text-primary/20 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground/40">Capture more insights to unlock suggestions</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════
   PLAN TAB — Narrative Planning
   ═══════════════════════════════════════════ */

interface NarrativeSuggestion {
  id: string;
  topic: string;
  angle: string;
  recommended_format: string;
  reason: string;
  status: string;
  created_at: string;
}

const PlanTab = () => {
  const [suggestions, setSuggestions] = useState<NarrativeSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => { loadSuggestions(); }, []);

  const loadSuggestions = async () => {
    const { data } = await (supabase.from("narrative_suggestions" as any) as any).select("*").order("created_at", { ascending: false }).limit(20);
    setSuggestions(data || []);
    setLoading(false);
  };

  const generatePlan = async () => {
    setGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-authority-content`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ action: "generate_narrative_plan" }),
      });
      if (!resp.ok) throw new Error("Generation failed");
      const data = await resp.json();
      toast.success(`Generated ${data.suggestions?.length || 0} narrative suggestions`);
      await loadSuggestions();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGenerating(false);
    }
  };

  // Group by format for planning view
  const grouped = suggestions.reduce((acc, s) => {
    const fmt = s.recommended_format || "post";
    if (!acc[fmt]) acc[fmt] = [];
    acc[fmt].push(s);
    return acc;
  }, {} as Record<string, NarrativeSuggestion[]>);

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-primary/40" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Plan your authority narrative based on signals and insights.</p>
        <Button variant="outline" size="sm" onClick={generatePlan} disabled={generating} className="gap-2">
          {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          Generate Plan
        </Button>
      </div>

      {suggestions.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <Calendar className="w-8 h-8 text-primary/30 mx-auto" />
          <p className="text-foreground font-medium">No narrative plan yet</p>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">Generate an AI-powered content plan based on your strongest signals and frameworks.</p>
          <Button onClick={generatePlan} disabled={generating} className="gap-2">
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Generate Plan
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([format, items]) => {
            const fmt = FORMAT_LABELS[format] || FORMAT_LABELS.post;
            const Icon = fmt.icon;
            return (
              <motion.div
                key={format}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3"
              >
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/15">
                    <Icon className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <p className="text-label uppercase tracking-wider text-xs font-semibold">{fmt.label}s</p>
                  <span className="text-xs text-muted-foreground ml-auto">{items.length} planned</span>
                </div>

                <div className="space-y-2">
                  {items.map(s => (
                    <div key={s.id} className="glass-card rounded-xl p-5 border border-border/8 hover:border-primary/15 transition-all">
                      <p className="text-sm font-semibold text-foreground mb-1">{s.topic}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed mb-2">{s.angle}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="px-2 py-0.5 rounded-full bg-primary/8 text-primary/70 font-medium">{s.reason}</span>
                        <span className="ml-auto">{formatSmartDate(s.created_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════
   ANALYZE TAB — Content Performance
   ═══════════════════════════════════════════ */

const AnalyzeTab = () => {
  const [stats, setStats] = useState<{
    postCount: number;
    topTheme: string;
    avgEngagement: number;
    topFormat: string;
    tones: Array<{ tone: string; count: number }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      const [postsRes, snapshotRes] = await Promise.all([
        supabase.from("linkedin_posts").select("theme, tone, format_type, engagement_score").neq("tracking_status", "rejected").order("published_at", { ascending: false }).limit(100),
        supabase.from("influence_snapshots").select("followers, engagement_rate, top_topic, top_format, authority_themes").order("snapshot_date", { ascending: false }).limit(1),
      ]);

      const posts = postsRes.data || [];
      const snapshot = snapshotRes.data?.[0];

      // Theme counts
      const themeCounts: Record<string, number> = {};
      const toneCounts: Record<string, number> = {};
      posts.forEach((p: any) => {
        if (p.theme) themeCounts[p.theme] = (themeCounts[p.theme] || 0) + 1;
        if (p.tone) toneCounts[p.tone] = (toneCounts[p.tone] || 0) + 1;
      });
      const topTheme = Object.entries(themeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || snapshot?.top_topic || "—";
      const tones = Object.entries(toneCounts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([tone, count]) => ({ tone, count }));
      const avgEng = posts.length > 0
        ? posts.reduce((sum: number, p: any) => sum + (Number(p.engagement_score) || 0), 0) / posts.length
        : Number(snapshot?.engagement_rate) || 0;

      setStats({
        postCount: posts.length,
        topTheme,
        avgEngagement: Math.round(avgEng * 10) / 10,
        topFormat: snapshot?.top_format || "—",
        tones,
      });
    } catch (err) {
      console.error("Analyze load error:", err);
    }
    setLoading(false);
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-primary/40" /></div>;
  }

  if (!stats || stats.postCount === 0) {
    return (
      <div className="text-center py-16 space-y-3">
        <BarChart3 className="w-8 h-8 text-primary/30 mx-auto" />
        <p className="text-foreground font-medium">No content data yet</p>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">Publish content and sync your LinkedIn to see performance analytics here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Posts Analyzed", value: stats.postCount, icon: FileText },
          { label: "Top Theme", value: stats.topTheme, icon: Zap },
          { label: "Avg Engagement", value: `${stats.avgEngagement}%`, icon: TrendingUp },
          { label: "Top Format", value: stats.topFormat, icon: LayoutGrid },
        ].map((m, i) => (
          <motion.div
            key={m.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.05 }}
            className="glass-card rounded-xl p-5 border border-border/8"
          >
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/15 mb-3">
              <m.icon className="w-4 h-4 text-primary" />
            </div>
            <p className="text-foreground font-bold text-lg capitalize">{m.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{m.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Tone Breakdown */}
      {stats.tones.length > 0 && (
        <div className="glass-card rounded-2xl p-6 border border-border/8">
          <p className="text-label uppercase tracking-wider text-xs font-semibold mb-4">Tone Distribution</p>
          <div className="space-y-3">
            {stats.tones.map(t => {
              const maxCount = stats.tones[0].count;
              const pct = Math.round((t.count / maxCount) * 100);
              return (
                <div key={t.tone} className="flex items-center gap-3">
                  <span className="text-sm text-foreground capitalize w-28 shrink-0">{t.tone}</span>
                  <div className="flex-1 bg-secondary/20 rounded-full h-2 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.6 }}
                      className="h-full bg-primary/40 rounded-full"
                    />
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">{t.count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recommendation */}
      <div className="glass-card rounded-2xl p-6 border border-primary/10 bg-gradient-to-br from-primary/[0.03] to-transparent">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-primary" />
          <p className="text-label uppercase tracking-wider text-xs font-semibold text-primary/60">Insight</p>
        </div>
        <p className="text-sm text-foreground leading-relaxed">
          {stats.topTheme !== "—"
            ? `Your strongest authority theme is "${stats.topTheme}". Continue publishing on this topic to deepen audience trust.`
            : "Publish more content to unlock performance insights."
          }
        </p>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════
   MAIN AUTHORITY TAB
   ═══════════════════════════════════════════ */

interface AuthorityTabProps {
  entries: any[];
  onRefresh?: () => void;
}

const TABS: { key: AuthoritySubTab; label: string; icon: typeof PenTool }[] = [
  { key: "create", label: "Create", icon: PenTool },
  { key: "plan", label: "Plan", icon: Calendar },
  { key: "analyze", label: "Analyze", icon: BarChart3 },
];

const AuthorityTab = ({ entries, onRefresh }: AuthorityTabProps) => {
  const [activeTab, setActiveTab] = useState<AuthoritySubTab>("create");
  const [brandDone, setBrandDone] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.from("diagnostic_profiles").select("brand_assessment_completed_at").limit(1).maybeSingle()
      .then(({ data }) => setBrandDone(!!data?.brand_assessment_completed_at));
  }, []);

  return (
    <div className="space-y-8">
      <PageHeader
        icon={Crown}
        title="Authority"
        question="What should you publish to strengthen your authority?"
        processLogic="Signal → Insight → Framework → Content → Audience"
      />

      {/* Brand calibration nudge */}
      {brandDone === false && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-primary/15 bg-primary/[0.04]">
          <Target className="w-4 h-4 text-primary shrink-0" />
          <p className="text-xs text-muted-foreground flex-1">
            Complete your Brand Assessment to get content fully calibrated to your positioning.
          </p>
          <a href="/dashboard?tab=me&subtab=settings" className="text-xs text-primary font-medium whitespace-nowrap hover:underline">
            Start →
          </a>
        </div>
      )}

      {/* Strategic Advisor — authority context */}
      <StrategicAdvisorPanel context="authority" compact />

      {/* Tab Bar */}
      <div className="flex gap-1 p-1 rounded-xl bg-secondary/15 border border-border/8 w-full sm:w-fit">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
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
      {activeTab === "create" && <CreateTab />}
      {activeTab === "plan" && <PlanTab />}
      {activeTab === "analyze" && <AnalyzeTab />}
    </div>
  );
};

export default AuthorityTab;
