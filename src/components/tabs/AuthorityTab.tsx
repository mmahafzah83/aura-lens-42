import { useState, useEffect } from "react";
import {
  Loader2, Save, Plus, X, Pencil, BookOpen, Sparkles,
  FileText, LayoutGrid, PenTool, Lightbulb, RefreshCw,
  Send, ChevronRight, Copy, Check, Globe
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { formatSmartDate } from "@/lib/formatDate";
import CarouselGenerator from "@/components/CarouselGenerator";
import LinkedInIntelligence from "@/components/LinkedInIntelligence";

/* ── Types ── */
interface VoiceProfile {
  id?: string;
  tone: string;
  preferred_structures: string[];
  storytelling_patterns: string[];
  example_posts: { label: string; content: string }[];
  admired_posts: { label: string; content: string }[];
}

interface NarrativeSuggestion {
  id: string;
  topic: string;
  angle: string;
  recommended_format: string;
  reason: string;
  status: string;
  created_at: string;
}

type ContentType = "post" | "carousel" | "essay" | "framework_summary";
type Lang = "en" | "ar";

const FORMAT_LABELS: Record<string, { label: string; icon: any }> = {
  post: { label: "LinkedIn Post", icon: PenTool },
  carousel: { label: "Carousel", icon: LayoutGrid },
  essay: { label: "Essay", icon: FileText },
  framework_summary: { label: "Framework Brief", icon: BookOpen },
};

const EMPTY_VOICE: VoiceProfile = {
  tone: "",
  preferred_structures: [],
  storytelling_patterns: [],
  example_posts: [],
  admired_posts: [],
};

/* ══════════════════════════════════════════════════
   Voice & Style Memory Section
   ══════════════════════════════════════════════════ */
const VoiceMemory = () => {
  const [voice, setVoice] = useState<VoiceProfile>(EMPTY_VOICE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newStructure, setNewStructure] = useState("");
  const [newPattern, setNewPattern] = useState("");
  const [newExampleLabel, setNewExampleLabel] = useState("");
  const [newExampleContent, setNewExampleContent] = useState("");
  const [newAdmiredLabel, setNewAdmiredLabel] = useState("");
  const [newAdmiredContent, setNewAdmiredContent] = useState("");
  const [showExampleForm, setShowExampleForm] = useState(false);
  const [showAdmiredForm, setShowAdmiredForm] = useState(false);

  useEffect(() => {
    loadVoice();
  }, []);

  const loadVoice = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await (supabase.from("authority_voice_profiles" as any) as any)
      .select("*").eq("user_id", user.id).maybeSingle();
    if (data) {
      setVoice({
        id: data.id,
        tone: data.tone || "",
        preferred_structures: data.preferred_structures || [],
        storytelling_patterns: data.storytelling_patterns || [],
        example_posts: data.example_posts || [],
        admired_posts: data.admired_posts || [],
      });
    }
    setLoading(false);
  };

  const saveVoice = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const payload = {
      user_id: user.id,
      tone: voice.tone,
      preferred_structures: voice.preferred_structures,
      storytelling_patterns: voice.storytelling_patterns,
      example_posts: voice.example_posts,
      admired_posts: voice.admired_posts,
    };

    if (voice.id) {
      await (supabase.from("authority_voice_profiles" as any) as any)
        .update(payload).eq("id", voice.id);
    } else {
      const { data } = await (supabase.from("authority_voice_profiles" as any) as any)
        .insert(payload).select().single();
      if (data) setVoice(prev => ({ ...prev, id: data.id }));
    }
    toast.success("Voice profile saved");
    setSaving(false);
  };

  const addItem = (key: "preferred_structures" | "storytelling_patterns", value: string, setter: (v: string) => void) => {
    if (!value.trim()) return;
    setVoice(prev => ({ ...prev, [key]: [...prev[key], value.trim()] }));
    setter("");
  };

  const removeItem = (key: "preferred_structures" | "storytelling_patterns", idx: number) => {
    setVoice(prev => ({ ...prev, [key]: prev[key].filter((_, i) => i !== idx) }));
  };

  const addPost = (key: "example_posts" | "admired_posts", label: string, content: string) => {
    if (!content.trim()) return;
    setVoice(prev => ({ ...prev, [key]: [...prev[key], { label: label || "Untitled", content }] }));
  };

  const removePost = (key: "example_posts" | "admired_posts", idx: number) => {
    setVoice(prev => ({ ...prev, [key]: prev[key].filter((_, i) => i !== idx) }));
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      {/* Tone */}
      <div>
        <label className="text-[10px] text-muted-foreground tracking-wider uppercase mb-2 block">Writing Tone</label>
        <Input
          value={voice.tone}
          onChange={(e) => setVoice(prev => ({ ...prev, tone: e.target.value }))}
          placeholder="e.g. Analytical, calm authority with strategic depth"
          className="bg-secondary/30 border-border/20 text-sm"
        />
      </div>

      {/* Preferred Structures */}
      <div>
        <label className="text-[10px] text-muted-foreground tracking-wider uppercase mb-2 block">Preferred Post Structures</label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {voice.preferred_structures.map((s, i) => (
            <span key={i} className="text-xs px-3 py-1.5 rounded-lg bg-secondary/40 text-foreground/80 border border-border/10 flex items-center gap-1.5">
              {s}
              <button onClick={() => removeItem("preferred_structures", i)} className="hover:text-destructive"><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="e.g. Observation → Insight → Framework → Question"
            value={newStructure}
            onChange={(e) => setNewStructure(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addItem("preferred_structures", newStructure, setNewStructure)}
            className="h-8 bg-secondary/20 border-border/20 text-sm flex-1"
          />
          <Button size="sm" variant="outline" onClick={() => addItem("preferred_structures", newStructure, setNewStructure)} className="h-8"><Plus className="w-3.5 h-3.5" /></Button>
        </div>
      </div>

      {/* Storytelling Patterns */}
      <div>
        <label className="text-[10px] text-muted-foreground tracking-wider uppercase mb-2 block">Storytelling Patterns</label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {voice.storytelling_patterns.map((s, i) => (
            <span key={i} className="text-xs px-3 py-1.5 rounded-lg bg-secondary/40 text-foreground/80 border border-border/10 flex items-center gap-1.5">
              {s}
              <button onClick={() => removeItem("storytelling_patterns", i)} className="hover:text-destructive"><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="e.g. Contrast → Reframe → Evidence → Implication"
            value={newPattern}
            onChange={(e) => setNewPattern(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addItem("storytelling_patterns", newPattern, setNewPattern)}
            className="h-8 bg-secondary/20 border-border/20 text-sm flex-1"
          />
          <Button size="sm" variant="outline" onClick={() => addItem("storytelling_patterns", newPattern, setNewPattern)} className="h-8"><Plus className="w-3.5 h-3.5" /></Button>
        </div>
      </div>

      {/* Example Posts */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] text-muted-foreground tracking-wider uppercase">Your Example Posts</label>
          <button onClick={() => setShowExampleForm(!showExampleForm)} className="text-[10px] text-primary hover:text-primary/80 font-medium">
            {showExampleForm ? "Cancel" : "+ Add Post"}
          </button>
        </div>
        {voice.example_posts.map((p, i) => (
          <div key={i} className="p-3 rounded-xl bg-secondary/20 border border-border/10 mb-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-foreground">{p.label}</span>
              <button onClick={() => removePost("example_posts", i)} className="text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-3">{p.content}</p>
          </div>
        ))}
        {showExampleForm && (
          <div className="p-4 rounded-xl bg-secondary/20 border border-border/10 space-y-2">
            <Input placeholder="Label (e.g. Digital Governance Post)" value={newExampleLabel} onChange={(e) => setNewExampleLabel(e.target.value)} className="h-8 bg-secondary/30 border-border/20 text-sm" />
            <Textarea placeholder="Paste your post content here…" value={newExampleContent} onChange={(e) => setNewExampleContent(e.target.value)} className="min-h-[100px] bg-secondary/30 border-border/20 text-sm" />
            <Button size="sm" onClick={() => { addPost("example_posts", newExampleLabel, newExampleContent); setNewExampleLabel(""); setNewExampleContent(""); setShowExampleForm(false); }} className="h-8">Add Example</Button>
          </div>
        )}
      </div>

      {/* Admired Posts */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] text-muted-foreground tracking-wider uppercase">Posts You Admire</label>
          <button onClick={() => setShowAdmiredForm(!showAdmiredForm)} className="text-[10px] text-primary hover:text-primary/80 font-medium">
            {showAdmiredForm ? "Cancel" : "+ Add Post"}
          </button>
        </div>
        {voice.admired_posts.map((p, i) => (
          <div key={i} className="p-3 rounded-xl bg-secondary/20 border border-border/10 mb-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-foreground">{p.label}</span>
              <button onClick={() => removePost("admired_posts", i)} className="text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-3">{p.content}</p>
          </div>
        ))}
        {showAdmiredForm && (
          <div className="p-4 rounded-xl bg-secondary/20 border border-border/10 space-y-2">
            <Input placeholder="Author or Label" value={newAdmiredLabel} onChange={(e) => setNewAdmiredLabel(e.target.value)} className="h-8 bg-secondary/30 border-border/20 text-sm" />
            <Textarea placeholder="Paste admired post content…" value={newAdmiredContent} onChange={(e) => setNewAdmiredContent(e.target.value)} className="min-h-[100px] bg-secondary/30 border-border/20 text-sm" />
            <Button size="sm" onClick={() => { addPost("admired_posts", newAdmiredLabel, newAdmiredContent); setNewAdmiredLabel(""); setNewAdmiredContent(""); setShowAdmiredForm(false); }} className="h-8">Add Post</Button>
          </div>
        )}
      </div>

      <Button onClick={saveVoice} disabled={saving} className="w-full gap-2">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Save Voice Profile
      </Button>
    </div>
  );
};

/* ══════════════════════════════════════════════════
   Content Builder Section
   ══════════════════════════════════════════════════ */
const ContentBuilder = () => {
  const [topic, setTopic] = useState("");
  const [context, setContext] = useState("");
  const [contentType, setContentType] = useState<ContentType>("post");
  const [lang, setLang] = useState<Lang>("en");
  const [output, setOutput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showCarousel, setShowCarousel] = useState(false);

  const generate = async () => {
    if (!topic.trim()) return;
    if (contentType === "carousel") {
      setShowCarousel(true);
      return;
    }
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
        body: JSON.stringify({
          action: "generate_content",
          content_type: contentType,
          topic,
          context,
          language: lang,
        }),
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

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              accumulated += content;
              setOutput(accumulated);
            }
          } catch {}
        }
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
    <div className="space-y-5">
      {/* Topic Input */}
      <div>
        <label className="text-[10px] text-muted-foreground tracking-wider uppercase mb-2 block">Topic</label>
        <Input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. Why AI-native organizations will outperform digital transformations"
          className="bg-secondary/30 border-border/20 text-sm"
        />
      </div>

      {/* Context */}
      <div>
        <label className="text-[10px] text-muted-foreground tracking-wider uppercase mb-2 block">Additional Context <span className="text-muted-foreground/50">(optional)</span></label>
        <Textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="Add specific angles, data points, or frameworks to include…"
          className="min-h-[80px] bg-secondary/30 border-border/20 text-sm"
        />
      </div>

      {/* Format Selection */}
      <div>
        <label className="text-[10px] text-muted-foreground tracking-wider uppercase mb-2 block">Format</label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {(Object.entries(FORMAT_LABELS) as [ContentType, { label: string; icon: any }][]).map(([key, { label, icon: Icon }]) => (
            <button
              key={key}
              onClick={() => setContentType(key)}
              className={`p-3 rounded-xl border text-left transition-all tactile-press ${
                contentType === key
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "bg-secondary/20 border-border/10 text-muted-foreground hover:border-border/30"
              }`}
            >
              <Icon className="w-4 h-4 mb-1.5" />
              <span className="text-xs font-medium">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Language Toggle */}
      <div className="flex items-center gap-3">
        <label className="text-[10px] text-muted-foreground tracking-wider uppercase">Language</label>
        <div className="flex gap-1 bg-secondary/30 rounded-lg p-0.5 border border-border/10">
          <button
            onClick={() => setLang("en")}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${lang === "en" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
          >
            English
          </button>
          <button
            onClick={() => setLang("ar")}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${lang === "ar" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
          >
            العربية
          </button>
        </div>
      </div>

      {/* Generate Button */}
      <Button onClick={generate} disabled={generating || !topic.trim()} className="w-full gap-2">
        {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        Generate {FORMAT_LABELS[contentType]?.label || "Content"}
      </Button>

      {/* Output */}
      {output && (
        <div className="space-y-3 animate-fade-in">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground tracking-wider uppercase">Generated Content</span>
            <Button size="sm" variant="ghost" onClick={handleCopy} className="h-7 gap-1.5 text-xs">
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <div
            dir={lang === "ar" ? "rtl" : "ltr"}
            className="p-5 rounded-xl bg-secondary/20 border border-border/10 text-sm text-foreground/90 leading-relaxed whitespace-pre-line max-h-[500px] overflow-y-auto"
          >
            {output}
            {generating && <span className="inline-block w-1.5 h-4 bg-primary/60 ml-1 animate-pulse rounded-sm" />}
          </div>
        </div>
      )}

      {/* Carousel Generator */}
      {showCarousel && (
        <CarouselGenerator
          open={showCarousel}
          onClose={() => setShowCarousel(false)}
          title={topic}
          context={context}
        />
      )}
    </div>
  );
};

/* ══════════════════════════════════════════════════
   Narrative Planner Section
   ══════════════════════════════════════════════════ */
const NarrativePlanner = ({ onSelectTopic }: { onSelectTopic: (topic: string, format: ContentType) => void }) => {
  const [suggestions, setSuggestions] = useState<NarrativeSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    loadSuggestions();
  }, []);

  const loadSuggestions = async () => {
    const { data } = await (supabase.from("narrative_suggestions" as any) as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
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
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
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

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Topics and formats suggested based on your signals and insights.</p>
        <Button variant="outline" size="sm" onClick={generatePlan} disabled={generating} className="gap-2">
          {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          Generate Plan
        </Button>
      </div>

      {suggestions.length === 0 ? (
        <div className="text-center py-12 space-y-3">
          <Lightbulb className="w-8 h-8 text-primary/40 mx-auto" />
          <p className="text-sm text-muted-foreground">No narrative suggestions yet. Click "Generate Plan" to get AI-powered topic recommendations.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {suggestions.map((s) => {
            const fmt = FORMAT_LABELS[s.recommended_format] || FORMAT_LABELS.post;
            const Icon = fmt.icon;
            return (
              <div key={s.id} className="glass-card rounded-xl p-5 border border-border/10 hover:border-primary/15 transition-all group">
                <div className="flex items-start gap-4">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 border border-primary/15">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-foreground">{s.topic}</h4>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{s.angle}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{fmt.label}</span>
                      <span className="text-[10px] text-muted-foreground/50">{s.reason}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => onSelectTopic(s.topic, s.recommended_format as ContentType)}
                    className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    Create <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ══════════════════════════════════════════════════
   Authority Tab (Main)
   ══════════════════════════════════════════════════ */
interface AuthorityTabProps {
  entries: any[];
  onRefresh?: () => void;
}

const AuthorityTab = ({ entries, onRefresh }: AuthorityTabProps) => {
  const [activeSection, setActiveSection] = useState<"builder" | "voice" | "planner">("builder");
  const [builderTopic, setBuilderTopic] = useState("");
  const [builderFormat, setBuilderFormat] = useState<ContentType>("post");

  const handleSelectTopic = (topic: string, format: ContentType) => {
    setBuilderTopic(topic);
    setBuilderFormat(format);
    setActiveSection("builder");
  };

  const sections = [
    { key: "builder" as const, label: "Content Builder", icon: PenTool },
    { key: "voice" as const, label: "Voice & Style", icon: Pencil },
    { key: "planner" as const, label: "Narrative Planner", icon: Lightbulb },
    { key: "linkedin" as const, label: "LinkedIn Intel", icon: BarChart3 },
  ];

  return (
    <div className="h-[calc(100dvh-180px)] overflow-y-auto overscroll-contain space-y-6 pb-36">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 aura-glow">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground tracking-tight">Authority Engine</h2>
          <p className="text-xs text-muted-foreground">Turn strategic thinking into thought leadership</p>
        </div>
      </div>

      {/* Section Tabs */}
      <div className="flex gap-2 border-b border-border/10 pb-0">
        {sections.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveSection(key)}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-all duration-200 tactile-press ${
              activeSection === key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span className="text-sm font-medium">{label}</span>
          </button>
        ))}
      </div>

      {/* Section Content */}
      <div className="glass-card rounded-2xl p-6 sm:p-8">
        {activeSection === "builder" && <ContentBuilder key={builderTopic} />}
        {activeSection === "voice" && <VoiceMemory />}
        {activeSection === "planner" && <NarrativePlanner onSelectTopic={handleSelectTopic} />}
        {activeSection === "linkedin" && <LinkedInIntelligence />}
      </div>
    </div>
  );
};

export default AuthorityTab;
