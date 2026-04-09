import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import {
  Loader2, Save, Plus, X, Send, Copy, Check, Trash2, Search,
  PenTool, LayoutGrid, FileText, BookOpen, Lightbulb,
  Sparkles, Zap, Target, ArrowRight, Crown, Layers,
  Calendar, TrendingUp, BarChart3, Upload, Mic
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
type AuthoritySubTab = "create" | "plan" | "analyze" | "library";

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
  const [selectedSignalTitle, setSelectedSignalTitle] = useState<string | null>(null);
  const [voiceWords, setVoiceWords] = useState<string[]>([]);

  // AI suggestions
  const [signals, setSignals] = useState<SignalSuggestion[]>([]);
  const [frameworks, setFrameworks] = useState<FrameworkSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase.from("strategic_signals").select("id, signal_title, explanation, content_opportunity, confidence")
        .eq("status", "active").gte("confidence", 0.6).order("confidence", { ascending: false }).limit(5),
      supabase.from("master_frameworks").select("id, title, summary, tags").order("created_at", { ascending: false }).limit(5),
      supabase.from("authority_voice_profiles").select("vocabulary_preferences, example_posts").limit(1).single(),
    ]).then(([sRes, fRes, vRes]) => {
      setSignals((sRes.data || []) as any);
      setFrameworks((fRes.data || []) as any);
      setSuggestionsLoading(false);
      // Extract words from voice profile for matching
      if (vRes.data) {
        const words: string[] = [];
        const vp = vRes.data.vocabulary_preferences;
        if (vp && typeof vp === "object") {
          Object.values(vp).forEach((v: any) => {
            if (typeof v === "string" && v.trim()) words.push(...v.toLowerCase().split(/\s+/));
            if (Array.isArray(v)) v.forEach((s: any) => { if (typeof s === "string" && s.trim()) words.push(...s.toLowerCase().split(/\s+/)); });
          });
        }
        const ep = vRes.data.example_posts;
        if (Array.isArray(ep)) {
          ep.forEach((p: any) => {
            const text = typeof p === "string" ? p : p?.content || p?.text || "";
            if (text) words.push(...text.toLowerCase().split(/\s+/).filter((w: string) => w.length > 4).slice(0, 20));
          });
        }
        setVoiceWords(Array.from(new Set(words.filter(w => w.length > 3))));
      }
    });
  }, []);

  const selectSuggestion = (t: string, ctx: string, format: ContentType, signalTitle?: string) => {
    setTopic(t);
    setContext(ctx);
    setContentType(format);
    setOutput("");
    setSelectedSignalTitle(signalTitle || null);
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
            {/* Quality Indicator Bar */}
            {!generating && (
              <div className="flex items-center gap-2 p-2 rounded-xl bg-secondary/10">
                {(() => {
                  const lowerOutput = output.toLowerCase();
                  const hasVoiceMatch = voiceWords.length > 0 && voiceWords.some(w => lowerOutput.includes(w));
                  const lines = output.split(/\n/).filter(l => l.trim());
                  const firstSentence = lines[0]?.split(/[.!?]/)[0] || "";
                  const hookOk = firstSentence.split(/\s+/).length <= 20;
                  const bodyOk = lines.length > 3;
                  const lastLine = (lines[lines.length - 1] || "").trim();
                  const closingOk = /[?]/.test(lastLine) || /\b(comment|share|follow|reach out|let['']?s|DM|subscribe|tag|try|start|join)\b/i.test(lastLine);
                  const structureOk = hookOk && bodyOk && closingOk;

                  const indicators = [
                    {
                      pass: hasVoiceMatch,
                      passLabel: "Voice match",
                      warnLabel: "Add voice samples",
                      icon: <Mic className="w-3 h-3" />,
                    },
                    {
                      pass: !!selectedSignalTitle,
                      passLabel: selectedSignalTitle ? (selectedSignalTitle.length > 30 ? selectedSignalTitle.slice(0, 30) + "…" : selectedSignalTitle) : "",
                      warnLabel: "No signal selected",
                      icon: <Zap className="w-3 h-3" />,
                    },
                    {
                      pass: structureOk,
                      passLabel: "Strong structure",
                      warnLabel: "Review structure",
                      icon: <Layers className="w-3 h-3" />,
                    },
                  ];

                  return indicators.map((ind, i) => (
                    <span
                      key={i}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium ${
                        ind.pass
                          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                          : "bg-muted/40 text-muted-foreground/60"
                      }`}
                    >
                      {ind.icon}
                      {ind.pass ? ind.passLabel : ind.warnLabel}
                    </span>
                  ));
                })()}
              </div>
            )}
          </motion.div>
            )}
            {/* Voice Feedback Buttons */}
            {!generating && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px] text-muted-foreground border-border/20 hover:bg-secondary/30"
                  onClick={async () => {
                    try {
                      const { data: { session } } = await supabase.auth.getSession();
                      if (!session?.user?.id) return;
                      const uid = session.user.id;
                      const snippet = output.slice(0, 300);
                      const { data: existing } = await supabase.from("authority_voice_profiles").select("id, example_posts, tone").eq("user_id", uid).maybeSingle();
                      const newExample = { content: snippet, added_at: new Date().toISOString(), source: "voice_feedback" };
                      if (existing) {
                        const posts = Array.isArray(existing.example_posts) ? [...(existing.example_posts as any[]), newExample] : [newExample];
                        await supabase.from("authority_voice_profiles").update({ example_posts: posts, tone: existing.tone || "analytical, calm authority" }).eq("id", existing.id);
                      } else {
                        await supabase.from("authority_voice_profiles").insert({ user_id: uid, example_posts: [newExample], tone: "analytical, calm authority" });
                      }
                      toast.success("Voice engine updated ✓");
                    } catch { toast.error("Failed to update voice engine"); }
                  }}
                >
                  <Check className="w-3 h-3 mr-1" /> Sounds like me
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px] text-muted-foreground border-border/20 hover:bg-secondary/30"
                  onClick={async () => {
                    try {
                      const { data: { session } } = await supabase.auth.getSession();
                      if (!session?.user?.id) return;
                      const uid = session.user.id;
                      const first10 = output.split(/\s+/).slice(0, 10).join(" ");
                      const avoidNote = `Avoid this pattern: ${first10}`;
                      const { data: existing } = await supabase.from("authority_voice_profiles").select("id, vocabulary_preferences").eq("user_id", uid).maybeSingle();
                      if (existing) {
                        const prefs = (typeof existing.vocabulary_preferences === "object" && existing.vocabulary_preferences) ? { ...(existing.vocabulary_preferences as any) } : {};
                        const avoidList = Array.isArray(prefs.avoid) ? [...prefs.avoid, avoidNote] : [avoidNote];
                        await supabase.from("authority_voice_profiles").update({ vocabulary_preferences: { ...prefs, avoid: avoidList } }).eq("id", existing.id);
                      } else {
                        await supabase.from("authority_voice_profiles").insert({ user_id: uid, vocabulary_preferences: { avoid: [avoidNote] } });
                      }
                      toast.success("Noted. Aura will adjust.");
                    } catch { toast.error("Failed to save preference"); }
                  }}
                >
                  <X className="w-3 h-3 mr-1" /> Doesn't sound like me
                </Button>
              </div>
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
                    <button key={s.id} onClick={() => selectSuggestion(s.content_opportunity?.title || s.signal_title, s.explanation, "post", s.signal_title)} className="w-full text-left p-3 rounded-xl bg-card/60 border border-border/8 hover:border-primary/15 transition-all">
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
   VOICE TRAINER — inline in Library tab
   ═══════════════════════════════════════════ */

const VoiceTrainer = () => {
  const [pasteText, setPasteText] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const appendToVoice = async (newText: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) throw new Error("Not authenticated");
    const uid = session.user.id;

    const { data: existing } = await supabase
      .from("authority_voice_profiles")
      .select("id, example_posts")
      .eq("user_id", uid)
      .maybeSingle();

    const current = (existing?.example_posts as any[] || []);
    const updated = [...current, { content: newText.trim() }];

    if (existing) {
      const { error } = await supabase
        .from("authority_voice_profiles")
        .update({ example_posts: updated, updated_at: new Date().toISOString() })
        .eq("user_id", uid);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("authority_voice_profiles")
        .insert({ user_id: uid, example_posts: updated, updated_at: new Date().toISOString() });
      if (error) throw error;
    }
  };

  const handlePaste = async () => {
    if (!pasteText.trim()) return;
    setSaving(true);
    try {
      await appendToVoice(pasteText);
      toast.success("Added to your voice engine");
      setPasteText("");
    } catch (e: any) {
      console.error("Voice paste error:", e);
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      let text = "";
      if (file.name.endsWith(".txt") || file.type === "text/plain") {
        text = await file.text();
      } else if (file.name.endsWith(".pdf") || file.type === "application/pdf") {
        // For PDF, read as text (basic extraction)
        const arrayBuf = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuf);
        // Simple PDF text extraction — find text between stream markers
        const raw = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
        // Extract readable text sequences (printable ASCII runs)
        const readable = raw.match(/[\x20-\x7E\n\r]{20,}/g) || [];
        text = readable.join("\n").slice(0, 10000);
        if (!text.trim()) {
          text = `[PDF uploaded: ${file.name}]`;
          toast.info("PDF text extraction was limited. For best results, paste the text directly.");
        }
      } else {
        toast.error("Please upload a PDF or TXT file");
        return;
      }

      if (text.trim()) {
        await appendToVoice(text.slice(0, 10000));
        toast.success("Document added to your voice engine");
      }
    } catch (e: any) {
      console.error("Voice upload error:", e);
      toast.error(e.message || "Failed to process file");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="glass-card rounded-xl p-5 border border-border/8">
      <div className="flex items-center gap-2 mb-4">
        <Mic className="w-4 h-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">Train your voice</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Upload */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Upload a document</p>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.txt,text/plain,application/pdf"
            onChange={handleFile}
            className="hidden"
          />
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2 text-xs border-border/15"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {uploading ? "Processing…" : "Upload PDF or TXT"}
          </Button>
        </div>

        {/* Paste */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Paste a post or text</p>
          <Textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Paste a post you've written…"
            className="min-h-[60px] bg-secondary/30 border-border/20 text-xs"
          />
          <Button
            size="sm"
            className="w-full gap-2 text-xs"
            onClick={handlePaste}
            disabled={saving || !pasteText.trim()}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Add to voice engine
          </Button>
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════
   LIBRARY TAB — Saved Content
   ═══════════════════════════════════════════ */

interface SavedPost {
  id: string;
  title: string | null;
  post_text: string | null;
  format_type: string | null;
  tracking_status: string;
  topic_label: string | null;
  created_at: string;
}

const FORMAT_BADGE: Record<string, { label: string; cls: string }> = {
  post: { label: "Post", cls: "bg-amber-500/15 text-amber-400 border-amber-500/20" },
  carousel: { label: "Carousel", cls: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
  framework: { label: "Framework", cls: "bg-purple-500/15 text-purple-400 border-purple-500/20" },
  essay: { label: "Essay", cls: "bg-muted/30 text-muted-foreground border-border/20" },
};

const LibraryTab = ({ onSwitchToCreate }: { onSwitchToCreate: () => void }) => {
  const [posts, setPosts] = useState<SavedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "published">("all");
  const [topicFilter, setTopicFilter] = useState<string>("all");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  useEffect(() => { loadPosts(); }, []);

  const loadPosts = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("linkedin_posts")
      .select("id, title, post_text, format_type, tracking_status, topic_label, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    setPosts((data || []) as SavedPost[]);
    setLoading(false);
  };

  const handleCopy = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const markPublished = async (id: string) => {
    const { error } = await supabase
      .from("linkedin_posts")
      .update({ tracking_status: "published", published_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("Failed to mark published:", error);
      toast.error("Failed to update status");
      return;
    }
    setPosts(prev => prev.map(p => p.id === id ? { ...p, tracking_status: "published" } : p));
    toast.success("Marked as published");
  };

  const deletePost = async (id: string) => {
    const { error } = await supabase
      .from("linkedin_posts")
      .delete()
      .eq("id", id);
    if (error) {
      console.error("Failed to delete post:", error);
      toast.error("Failed to delete post");
      return;
    }
    setPosts(prev => prev.filter(p => p.id !== id));
    toast.success("Post deleted");
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="glass-card rounded-xl p-5 border border-border/8 animate-pulse">
            <div className="h-4 bg-secondary/30 rounded w-2/3 mb-3" />
            <div className="h-3 bg-secondary/20 rounded w-1/4 mb-2" />
            <div className="h-3 bg-secondary/20 rounded w-1/3" />
          </div>
        ))}
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="space-y-6">
        <VoiceTrainer />
        <div className="text-center py-16 space-y-3">
          <FileText className="w-8 h-8 text-primary/30 mx-auto" />
          <p className="text-foreground font-medium">Your generated content will appear here</p>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">Start by creating a post, carousel, or essay on the Create tab.</p>
          <Button onClick={onSwitchToCreate} className="gap-2">
            <PenTool className="w-4 h-4" /> Go to Create
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Delete confirmation dialog */}
      {pendingDeleteId && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.8)" }}>
          <div className="bg-card border border-border/20 rounded-xl p-6 w-[400px] max-w-[90vw] space-y-4 shadow-2xl">
            <h3 className="text-base font-semibold text-foreground">Delete this post?</h3>
            <p className="text-sm text-muted-foreground">This action cannot be undone. The post will be permanently removed from your library.</p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setPendingDeleteId(null)}>Cancel</Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={async () => {
                  const id = pendingDeleteId;
                  setPendingDeleteId(null);
                  await deletePost(id);
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
      <VoiceTrainer />
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
          <Input
            placeholder="Search content..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-xs bg-secondary/20 border-border/10"
          />
        </div>
        <div className="flex items-center gap-1">
          {(["all", "draft", "published"] as const).map(s => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? "default" : "ghost"}
              className="h-7 text-[11px] px-2.5"
              onClick={() => setStatusFilter(s)}
            >
              {s === "all" ? "All" : s === "draft" ? "Drafts" : "Published"}
            </Button>
          ))}
        </div>
        {(() => {
          const topics = [...new Set(posts.map(p => p.topic_label).filter(Boolean))] as string[];
          if (topics.length <= 1) return null;
          return (
            <select
              value={topicFilter}
              onChange={e => setTopicFilter(e.target.value)}
              className="h-7 text-[11px] px-2 rounded-md bg-secondary/20 border border-border/10 text-foreground"
            >
              <option value="all">All topics</option>
              {topics.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          );
        })()}
      </div>

      {(() => {
        const filtered = posts.filter(p => {
          if (statusFilter === "draft" && p.tracking_status !== "draft") return false;
          if (statusFilter === "published" && p.tracking_status === "draft") return false;
          if (topicFilter !== "all" && p.topic_label !== topicFilter) return false;
          if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            const matchTitle = (p.title || "").toLowerCase().includes(q);
            const matchTopic = (p.topic_label || "").toLowerCase().includes(q);
            const matchText = (p.post_text || "").toLowerCase().includes(q);
            if (!matchTitle && !matchTopic && !matchText) return false;
          }
          return true;
        });

        return (
          <>
            <p className="text-sm text-muted-foreground">
              {filtered.length} of {posts.length} {posts.length === 1 ? "piece" : "pieces"} of content
            </p>
            {filtered.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-sm text-muted-foreground">No content matches your filters.</p>
                <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={() => { setSearchQuery(""); setStatusFilter("all"); setTopicFilter("all"); }}>
                  Clear filters
                </Button>
              </div>
            ) : filtered.map(p => {
        const badge = FORMAT_BADGE[p.format_type || "post"] || FORMAT_BADGE.post;
        const isDraft = p.tracking_status === "draft";
        return (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card rounded-xl p-5 border border-border/8 hover:border-primary/10 transition-all"
          >
            <div className="flex items-start gap-3 mb-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground leading-snug line-clamp-2">
                  {p.title || "Untitled"}
                </p>
                {p.topic_label && (
                  <p className="text-xs text-muted-foreground/50 mt-1 line-clamp-1">{p.topic_label}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${badge.cls}`}>
                  {badge.label}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                  isDraft
                    ? "bg-muted/20 text-muted-foreground border-border/15"
                    : "bg-emerald-500/15 text-emerald-400 border-emerald-500/20"
                }`}>
                  {isDraft ? "Draft" : "Published"}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-3">
              <span className="text-[10px] text-muted-foreground/40">{formatSmartDate(p.created_at)}</span>
              <div className="flex-1" />
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs gap-1.5"
                onClick={() => p.post_text && handleCopy(p.id, p.post_text)}
                disabled={!p.post_text}
              >
                {copiedId === p.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copiedId === p.id ? "Copied" : "Copy"}
              </Button>
              {isDraft && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1.5 border-border/15"
                  onClick={() => markPublished(p.id)}
                >
                  <Check className="w-3 h-3" /> Mark as published
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setPendingDeleteId(p.id)}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </motion.div>
        );
      })}
          </>
        );
      })()}
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
  { key: "library", label: "Library", icon: BookOpen },
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
      {activeTab === "library" && <LibraryTab onSwitchToCreate={() => setActiveTab("create")} />}
    </div>
  );
};

export default AuthorityTab;
