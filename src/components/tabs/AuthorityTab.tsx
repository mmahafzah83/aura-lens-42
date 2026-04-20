import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import {
  Loader2, Save, Plus, X, Send, Copy, Check, Trash2, Search,
  PenTool, LayoutGrid, FileText, BookOpen, Lightbulb,
  Sparkles, Zap, Target, ArrowRight, Crown, Layers,
  Calendar, TrendingUp, BarChart3, Upload, Mic, ChevronLeft, ChevronDown, Image as ImageIcon, Download
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatSmartDate } from "@/lib/formatDate";
import CarouselGenerator from "@/components/CarouselGenerator";
import FrameworkBuilderInline from "@/components/FrameworkBuilderInline";
import ImageCardGenerator from "@/components/ImageCardGenerator";
import StartFromPanel from "@/components/StartFromPanel";

/* ── Shared Types ── */
type ContentType = "post" | "carousel" | "essay" | "framework_summary";
type AuthoritySubTab = "create" | "plan" | "analyze" | "library";
type ContentFramework = "auto" | "hook_insight_question" | "slap" | "bab" | "pas" | "wwh" | "chef" | "story_lesson_question";

const FORMAT_LABELS: Record<string, { label: string; icon: any }> = {
  post: { label: "LinkedIn Post", icon: PenTool },
  carousel: { label: "Carousel", icon: LayoutGrid },
  framework_summary: { label: "Framework Builder", icon: BookOpen },
};

const FRAMEWORK_OPTIONS: { key: ContentFramework; label: string }[] = [
  { key: "auto", label: "Auto" },
  { key: "hook_insight_question", label: "Hook → Insight → Question" },
  { key: "slap", label: "SLAP" },
  { key: "bab", label: "BAB" },
  { key: "pas", label: "PAS" },
  { key: "wwh", label: "WWH" },
  { key: "chef", label: "CHEF" },
  { key: "story_lesson_question", label: "Story → Lesson → Question" },
];

const FRAMEWORK_PROMPTS: Record<string, string> = {
  hook_insight_question: "Structure this content using the Hook → Insight → Question framework exactly. Label each section internally in your reasoning but do not show section labels in the output.",
  slap: "Structure this content using the SLAP (Stop, Look, Act, Purchase) framework exactly. Label each section internally in your reasoning but do not show section labels in the output.",
  bab: "Structure this content using the BAB (Before, After, Bridge) framework exactly. Label each section internally in your reasoning but do not show section labels in the output.",
  pas: "Structure this content using the PAS (Problem, Agitate, Solution) framework exactly. Label each section internally in your reasoning but do not show section labels in the output.",
  wwh: "Structure this content using the WWH (What, Why, How) framework exactly. Label each section internally in your reasoning but do not show section labels in the output.",
  chef: "Structure this content using the CHEF (Curate, Heat, Enhance, Feed) framework exactly. Label each section internally in your reasoning but do not show section labels in the output.",
  story_lesson_question: "Structure this content using the Story → Lesson → Question framework exactly. Label each section internally in your reasoning but do not show section labels in the output.",
};

/* ── Quality Rubric Scoring ── */
interface DimensionScore {
  key: string;
  label: string;
  score: number;
  max: 10;
  suggestion?: string;
}

const FILLER_PHRASES = ["i am excited", "in today's world", "i want to share", "i'm excited", "in this article", "let me share"];
const JARGON_WORDS = ["synergy", "leverage", "paradigm", "holistic", "ecosystem", "deep dive", "circle back", "move the needle", "low-hanging fruit", "best-in-class", "game-changer", "disruptive", "scalable solution"];

function scoreContent(
  text: string,
  lang: "en" | "ar",
  voiceWords: string[],
  preferredStructures: string[],
  selectedSignalTitle: string | null,
  signalInsight: string | null,
): { dimensions: DimensionScore[]; total: number } {
  const lower = text.toLowerCase();
  const lines = text.split(/\n/).filter(l => l.trim());
  const firstLine = lines[0] || "";
  const firstLineWords = firstLine.split(/\s+/).length;
  const lastLine = (lines[lines.length - 1] || "").trim();
  const paragraphs = text.split(/\n\s*\n/);

  // H — Hook
  let h = 0;
  if (firstLineWords <= 20) h += 5;
  const hasContrarian = /\b(not|never|stop|wrong|myth|mistake|fail|lie|broken)\b/i.test(firstLine);
  const hasTension = /\b(but|yet|however|while|despite|although|tension|contradiction)\b/i.test(firstLine);
  const hasNumber = /\b\d+\b/.test(firstLine);
  const hasStory = /\b(when i|last week|yesterday|one day|i remember|i was)\b/i.test(firstLine);
  if (hasContrarian || hasTension || hasNumber || hasStory) h += 3;
  const hasFillerOpen = FILLER_PHRASES.some(f => lower.startsWith(f));
  if (!hasFillerOpen) h += 2;
  const hSuggestion = h < 7 ? (firstLineWords > 20 ? "Shorten your hook to under 20 words" : "Open with a contrarian truth or specific tension") : undefined;

  // S — Structure
  let s = 0;
  const hasHookAndBody = lines.length >= 3;
  const hasClose = /[?]/.test(lastLine) || /\b(comment|share|follow|DM|try|start|join)\b/i.test(lastLine);
  const secondLine = lines[1] || "";
  const hasRehook = secondLine.length > 10 && lines.length >= 4;
  if (hasHookAndBody && hasClose) s += 4;
  if (hasRehook) s += 3;
  const genericClose = /what do you think\??$/i.test(lastLine) || /thoughts\??$/i.test(lastLine);
  if (hasClose && !genericClose) s += 3;
  else if (hasClose && genericClose) s += 1;
  const sSuggestion = s < 7 ? (!hasClose ? "Add a specific closing question" : "Add a re-hook sentence after your opening") : undefined;

  // F — Formatting
  let f = 0;
  const longParagraph = paragraphs.some(p => p.split(/\n/).filter(l => l.trim()).length > 3);
  if (!longParagraph) f += 4;
  const hasBlankLines = text.includes("\n\n") || text.includes("\n \n");
  if (hasBlankLines) f += 3;
  const denseBlock = paragraphs.some(p => p.length > 500);
  if (!denseBlock) f += 3;
  const fSuggestion = f < 7 ? (longParagraph ? "Break paragraphs into 3 lines or fewer" : "Add blank lines between sections") : undefined;

  // T — Tone
  let t = 0;
  const hasJargon = JARGON_WORDS.some(j => lower.includes(j));
  if (!hasJargon) t += 4;
  const hasYou = /\byou\b/i.test(text);
  const hasI = /\bi\b/i.test(text);
  if (hasYou || hasI) t += 3;
  const passivePatterns = /\b(was done|were made|is being|has been|will be done)\b/i;
  if (!passivePatterns.test(text)) t += 3;
  const tSuggestion = t < 7 ? (hasJargon ? "Remove jargon and corporate speak" : "Write as if speaking to one person") : undefined;

  // E — Engagement
  let e = 0;
  const endsWithQ = /\?/.test(lastLine);
  if (endsWithQ) e += 5;
  const specificQ = endsWithQ && lastLine.split(/\s+/).length >= 5 && !/^(what do you think|thoughts|agree)\??$/i.test(lastLine.trim());
  if (specificQ) e += 3;
  const hasPS = /\bp\.?s\.?\b/i.test(text) || /\brepost\b/i.test(lower) || /\bsave this\b/i.test(lower) || /\bbookmark\b/i.test(lower);
  if (hasPS) e += 2;
  const eSuggestion = e < 7 ? (!endsWithQ ? "End with a specific question" : "Add a save/repost prompt or P.S.") : undefined;

  // V — Voice match
  let v = 0;
  if (voiceWords.length > 0) {
    const matched = voiceWords.filter(w => lower.includes(w));
    const matchPct = matched.length / Math.min(voiceWords.length, 20);
    v += Math.min(5, Math.round(matchPct * 15));
  }
  if (preferredStructures.length > 0) {
    const structLower = preferredStructures.join(" ").toLowerCase();
    const hasStructMatch = structLower.includes("hook") && firstLineWords <= 20;
    v += hasStructMatch ? 5 : 2;
  } else if (voiceWords.length === 0) {
    v = 0;
  }
  const vSuggestion = v < 7 ? "Add more writing samples to your voice engine" : undefined;

  // I — Signal integration
  let i = 0;
  if (selectedSignalTitle) {
    i += 5;
    if (signalInsight && lower.includes(signalInsight.toLowerCase().slice(0, 30))) {
      i += 5;
    } else if (selectedSignalTitle && lower.includes(selectedSignalTitle.toLowerCase().slice(0, 20))) {
      i += 3;
    }
  }
  const iSuggestion = i < 7 ? (!selectedSignalTitle ? "Select a signal from the sidebar" : "Weave the signal's insight into the body text") : undefined;

  // A — Arabic/EN quality
  let a = 0;
  if (lang === "ar") {
    const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
    const ratio = arabicChars / Math.max(text.length, 1);
    if (ratio > 0.3) a += 5;
    const shortSentences = text.split(/[.،؟!]/).filter(s => s.trim().length > 5 && s.trim().split(/\s+/).length <= 15);
    if (shortSentences.length >= 3) a += 5;
  } else {
    const translationArtifacts = /\b(the the|is is)\b/i.test(text);
    if (!translationArtifacts) a += 5;
    const readable = lines.length >= 3 && firstLineWords <= 25;
    if (readable) a += 5;
  }
  const aSuggestion = a < 7 ? (lang === "ar" ? "Use shorter sentences in conversational Arabic" : "Ensure text reads as native English") : undefined;

  const dimensions: DimensionScore[] = [
    { key: "H", label: "Hook", score: Math.min(10, h), max: 10, suggestion: hSuggestion },
    { key: "S", label: "Structure", score: Math.min(10, s), max: 10, suggestion: sSuggestion },
    { key: "F", label: "Formatting", score: Math.min(10, f), max: 10, suggestion: fSuggestion },
    { key: "T", label: "Tone", score: Math.min(10, t), max: 10, suggestion: tSuggestion },
    { key: "E", label: "Engagement", score: Math.min(10, e), max: 10, suggestion: eSuggestion },
    { key: "V", label: "Voice", score: Math.min(10, v), max: 10, suggestion: vSuggestion },
    { key: "I", label: "Signal", score: Math.min(10, i), max: 10, suggestion: iSuggestion },
    { key: "A", label: lang === "ar" ? "Arabic" : "English", score: Math.min(10, a), max: 10, suggestion: aSuggestion },
  ];

  return { dimensions, total: dimensions.reduce((sum, d) => sum + d.score, 0) };
}

/* ═══════════════════════════════════════════
   CREATE TAB — Content Creation Engine
   ═══════════════════════════════════════════ */

interface SignalPrefill {
  topic: string;
  context: string;
  signalId?: string;
  signalTitle?: string;
  sourceType?: string;
  sourceTitle?: string;
  contentFormat?: "post" | "carousel" | "framework_summary";
  trendHeadline?: string;
}

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

interface PlanPrefill {
  topic: string;
  context: string;
  contentType: ContentType;
  planTitle: string;
}

const CreateTab = ({ planPrefill, signalPrefill, onSignalPrefillConsumed }: { planPrefill?: PlanPrefill | null; signalPrefill?: SignalPrefill | null; onSignalPrefillConsumed?: () => void }) => {
  const [topic, setTopic] = useState("");
  const [context, setContext] = useState("");
  const [contentType, setContentType] = useState<ContentType>("post");
  const [trendPrefillLabel, setTrendPrefillLabel] = useState<string | null>(null);
  const [framework, setFramework] = useState<ContentFramework>("auto");
  const [lang, setLang] = useState<"en" | "ar">("en");
  const [output, setOutput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showCarousel, setShowCarousel] = useState(false);
  const [selectedSignalId, setSelectedSignalId] = useState<string | null>(null);
  const [selectedSignalTitle, setSelectedSignalTitle] = useState<string | null>(null);
  const [selectedSignalInsight, setSelectedSignalInsight] = useState<string | null>(null);
  const [generationTimestamp, setGenerationTimestamp] = useState<string | null>(null);
  const [voiceWords, setVoiceWords] = useState<string[]>([]);
  const [preferredStructures, setPreferredStructures] = useState<string[]>([]);
  const [profileName, setProfileName] = useState<string>("");
  const [profileRole, setProfileRole] = useState<string>("");
  const [planRef, setPlanRef] = useState<string | null>(null);

  // Short version state
  const [fullVersion, setFullVersion] = useState("");
  const [shortVersion, setShortVersion] = useState("");
  const [showingShort, setShowingShort] = useState(false);
  const [generatingShort, setGeneratingShort] = useState(false);

  // Visual companion state
  const [visualUrl, setVisualUrl] = useState<string | null>(null);
  const [visualLoading, setVisualLoading] = useState(false);

  // Free-tier generation limit
  const [monthlyGenerationCount, setMonthlyGenerationCount] = useState(0);
  const FREE_LIMIT = 3;
  // AI suggestions (used by voice profile loading only)
  const [_signals, setSignals] = useState<SignalSuggestion[]>([]);
  const [_frameworks, setFrameworks] = useState<FrameworkSuggestion[]>([]);
  const [_suggestionsLoading, setSuggestionsLoading] = useState(true);

  const [critiqueLoading, setCritiqueLoading] = useState(false);
  const [critique, setCritique] = useState<any>(null);
  const [critiqueError, setCritiqueError] = useState<string | null>(null);

  // Load monthly generation count
  useEffect(() => {
    (async () => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
      const { count } = await supabase
        .from("content_items")
        .select("id", { count: "exact", head: true })
        .gte("created_at", monthStart)
        .lt("created_at", nextMonth);
      setMonthlyGenerationCount(count || 0);
    })();
  }, []);

  useEffect(() => {
    Promise.all([
      supabase.from("strategic_signals").select("id, signal_title, explanation, content_opportunity, confidence")
        .eq("status", "active").gte("confidence", 0.6).order("confidence", { ascending: false }).limit(5),
      supabase.from("master_frameworks").select("id, title, summary, tags").order("created_at", { ascending: false }).limit(5),
      supabase.from("authority_voice_profiles").select("vocabulary_preferences, example_posts, preferred_structures").limit(1).single(),
      supabase.from("diagnostic_profiles").select("first_name, level, firm").limit(1).maybeSingle(),
    ]).then(([sRes, fRes, vRes, pRes]) => {
      setSignals((sRes.data || []) as any);
      setFrameworks((fRes.data || []) as any);
      setSuggestionsLoading(false);
      if (pRes?.data) {
        setProfileName(pRes.data.first_name || "");
        setProfileRole([pRes.data.level, pRes.data.firm].filter(Boolean).join(" · "));
      }
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
        // preferred structures
        const ps = vRes.data.preferred_structures;
        if (Array.isArray(ps)) setPreferredStructures(ps.map((s: any) => typeof s === "string" ? s : JSON.stringify(s)));
        else if (typeof ps === "string") setPreferredStructures([ps]);
      }
    });
  }, []);

  const selectSuggestion = (t: string, ctx: string, format: ContentType, signalTitle?: string, signalInsight?: string) => {
    setTopic(t);
    setContext(ctx);
    setContentType(format);
    setOutput("");
    setFullVersion("");
    setShortVersion("");
    setShowingShort(false);
    setSelectedSignalTitle(signalTitle || null);
    setSelectedSignalInsight(signalInsight || null);
  };

  // Apply plan prefill
  useEffect(() => {
    if (planPrefill) {
      setTopic(planPrefill.topic);
      setContext(planPrefill.context);
      setContentType(planPrefill.contentType);
      setPlanRef(planPrefill.planTitle);
      setOutput("");
      setFullVersion("");
      setShortVersion("");
      setShowingShort(false);
    }
  }, [planPrefill]);

  // Apply signal prefill from Intelligence page
  useEffect(() => {
    if (signalPrefill) {
      setTopic(signalPrefill.topic);
      setContext(signalPrefill.context);
      // Determine content type from explicit contentFormat or sourceType
      if (signalPrefill.contentFormat === "carousel") {
        setContentType("carousel");
        // Auto-open carousel workflow
        setTimeout(() => setShowCarousel(true), 100);
      } else if (signalPrefill.contentFormat === "framework_summary" || signalPrefill.sourceType === "framework_build") {
        setContentType("framework_summary");
        setFramework("auto");
      } else {
        setContentType("post");
        setFramework("hook_insight_question");
      }
      setSelectedSignalId(signalPrefill.signalId || null);
      setSelectedSignalTitle(signalPrefill.signalTitle || null);
      setSelectedSignalInsight(signalPrefill.context || null);
      setOutput("");
      setFullVersion("");
      setShortVersion("");
      setShowingShort(false);
      setVisualUrl(null);
      setPlanRef(null);
      if (signalPrefill.trendHeadline) {
        setTrendPrefillLabel(signalPrefill.trendHeadline);
        setTimeout(() => {
          document.getElementById("aura-generate-btn")?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 250);
      }
      onSignalPrefillConsumed?.();
    }
  }, [signalPrefill]);

  // Visual companion generation
  const generateVisual = async () => {
    setVisualLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const prompt = `Strategic framework diagram for: ${topic}. Key insight: ${output ? output.slice(0, 120) : context.slice(0, 120)}`;
      const { data, error } = await supabase.functions.invoke("regenerate-schematic", {
        body: { image_prompt: prompt },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setVisualUrl(data.image_url || null);
      toast.success("Visual generated");
    } catch (e: any) {
      toast.error(e.message || "Failed to generate visual");
    } finally {
      setVisualLoading(false);
    }
  };

  const streamGeneration = async (extraPromptInstruction?: string): Promise<string> => {
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
        framework: framework !== "auto" ? framework : undefined,
        extra_instruction: extraPromptInstruction,
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
    return accumulated;
  };

  const generate = async () => {
    if (!topic.trim()) return;
    if (contentType === "carousel") { setShowCarousel(true); return; }
    setGenerating(true);
    setOutput("");
    setCritique(null);
    setCritiqueError(null);
    setFullVersion("");
    setShortVersion("");
    setShowingShort(false);
    setGenerationTimestamp(new Date().toISOString());
    try {
      const accumulated = await streamGeneration();
      setFullVersion(accumulated);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const fetchCritique = async () => {
    setCritiqueLoading(true);
    setCritiqueError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/strategic-critique`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({}),
        }
      );
      if (!response.ok) throw new Error("Review failed");
      const data = await response.json();
      setCritique(data.critique);
    } catch (e: any) {
      setCritiqueError(e.message || "Failed to load review");
    } finally {
      setCritiqueLoading(false);
    }
  };

  const generateShort = async () => {
    setGeneratingShort(true);
    setShowingShort(true);
    setOutput("");
    try {
      const shortInstruction = lang === "ar"
        ? "أعد كتابة هذا كنسخة قصيرة ومؤثرة. الحد الأقصى 120 كلمة. احتفظ فقط بالخطاف والفكرة الأقوى والسؤال الختامي. احذف جميع القوائم المرقمة والعناوين الفرعية. كل جملة يجب أن تكون أقل من 12 كلمة."
        : "Rewrite this as a punchy short version. Maximum 150 words for English. Keep only the hook, the single strongest insight, and the closing question. Remove all numbered lists and subheadings. Every sentence must be under 12 words.";
      const accumulated = await streamGeneration(shortInstruction);
      setShortVersion(accumulated);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGeneratingShort(false);
    }
  };

  const switchToFull = () => {
    setShowingShort(false);
    setOutput(fullVersion);
  };

  const stripMarkdown = (text: string) => text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1").replace(/^#{1,6}\s+/gm, "").replace(/`(.+?)`/g, "$1");

  const renderMarkdown = (text: string) => {
    return text.split(/\n/).map((line, i) => {
      const html = line
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/^#{1,6}\s+(.*)/, "<strong>$1</strong>")
        .replace(/`(.+?)`/g, "$1");
      return <p key={i} className={line.trim() ? "" : "h-3"} dangerouslySetInnerHTML={{ __html: html || "&nbsp;" }} />;
    });
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(stripMarkdown(output));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const displayedOutput = output;
  const isGeneratingAny = generating || generatingShort;

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Main Editor */}
      <div className="flex-1 min-w-0 space-y-5">
        {/* Format Selector */}
        <div>
          <p className="text-label uppercase tracking-wider text-xs font-semibold mb-3">Content Format</p>
          <div className="grid grid-cols-3 gap-2">
            {(Object.entries(FORMAT_LABELS) as [ContentType, { label: string; icon: any }][]).map(([key, { label, icon: Icon }]) => (
              <button key={key} onClick={() => setContentType(key)} className={`p-3 rounded-xl border text-left transition-all ${contentType === key ? "bg-primary/10 border-primary/30 text-primary" : "bg-secondary/20 border-border/10 text-muted-foreground hover:border-border/30"}`}>
                <Icon className="w-4 h-4 mb-1.5" />
                <span className="text-xs font-medium">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Framework Builder Mode */}
        {contentType === "framework_summary" ? (
          <FrameworkBuilderInline
            initialTitle={topic}
            initialDescription={context}
          />
        ) : contentType === "carousel" && showCarousel ? (
          /* Inline carousel workflow */
          <CarouselGenerator
            open={showCarousel}
            onClose={() => setShowCarousel(false)}
            title={topic}
            context={context}
            inline
          />
        ) : (
          <>
            {/* Framework Selector */}
            <div>
              <p className="text-label uppercase tracking-wider text-xs font-semibold mb-2">Framework</p>
              <div className="flex flex-wrap gap-1.5">
                {FRAMEWORK_OPTIONS.map(fw => (
                  <button
                    key={fw.key}
                    onClick={() => setFramework(fw.key)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                      framework === fw.key
                        ? "bg-primary/10 border-primary/30 text-primary"
                        : "bg-secondary/20 border-border/10 text-muted-foreground hover:border-border/30"
                    }`}
                  >
                    {fw.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Topic */}
            <div>
              {trendPrefillLabel && (
                <p className="text-xs text-muted-foreground/70 mb-1.5 italic">
                  Pre-filled from trend: {trendPrefillLabel.length > 40 ? trendPrefillLabel.slice(0, 40) + "…" : trendPrefillLabel}
                </p>
              )}
              <p className="text-label uppercase tracking-wider text-xs font-semibold mb-2">Topic</p>
              <Input value={topic} onChange={(e) => { setTopic(e.target.value); if (trendPrefillLabel) setTrendPrefillLabel(null); }} placeholder="e.g. Why AI-native organizations will outperform digital transformations" className="bg-secondary/30 border-border/20 text-sm" />
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
            <Button id="aura-generate-btn" onClick={generate} disabled={isGeneratingAny || !topic.trim()} className="w-full gap-2">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Generate {FORMAT_LABELS[contentType]?.label || "Content"}
            </Button>

            {/* Output */}
            {displayedOutput && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-label uppercase tracking-wider text-xs font-semibold">
                    {showingShort ? "Short Version" : "Generated Content"}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="ghost" onClick={handleCopy} className="h-7 gap-1.5 text-xs">
                      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copied ? "Copied" : "Copy"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1.5 text-xs border-border/15"
                      onClick={async () => {
                        try {
                          const { data: { session } } = await supabase.auth.getSession();
                          if (!session?.user?.id) throw new Error("Not authenticated");
                          const body = stripMarkdown(output || fullVersion || shortVersion || "");
                          if (!body.trim()) { toast.error("Nothing to save"); return; }

                          // Fetch diagnostic profile for identity_snapshot
                          const { data: profile } = await supabase.from("diagnostic_profiles")
                            .select("level, sector_focus, core_practice, firm")
                            .eq("user_id", session.user.id)
                            .maybeSingle();

                          const generationParams = {
                            model: "google/gemini-3-flash-preview",
                            prompt_template_version: "v1",
                            signal_ids: selectedSignalId ? [selectedSignalId] : [],
                            signal_titles: selectedSignalTitle ? [selectedSignalTitle] : [],
                            identity_snapshot: {
                              role: profile?.level ?? null,
                              industry: profile?.firm ?? null,
                              sector_focus: profile?.sector_focus ?? null,
                              core_practice: profile?.core_practice ?? null,
                            },
                            topic: topic || null,
                            language: lang,
                            timestamp: generationTimestamp || new Date().toISOString(),
                          };

                          const { error } = await supabase.from("content_items").insert({
                            user_id: session.user.id,
                            type: (contentType as string) === "carousel" ? "carousel" : (contentType as string) === "framework_summary" ? "framework" : "post",
                            body,
                            language: lang,
                            status: "draft",
                            generation_params: generationParams,
                          });
                          if (error) throw error;
                          setMonthlyGenerationCount(prev => prev + 1);
                          toast.success("Draft saved to your library.");
                        } catch (e: any) {
                          toast.error(e.message || "Failed to save");
                        }
                      }}
                    >
                      <Save className="w-3 h-3" /> Save Draft
                    </Button>
                  </div>
                </div>

                {/* Back to full version link */}
                {showingShort && !generatingShort && (
                  <button onClick={switchToFull} className="flex items-center gap-1 text-xs text-primary hover:underline">
                    <ChevronLeft className="w-3 h-3" /> Back to full version
                  </button>
                )}

                <div dir={lang === "ar" ? "rtl" : "ltr"} className="p-5 rounded-xl bg-secondary/20 border border-border/10 text-sm text-foreground/90 leading-relaxed max-h-[500px] overflow-y-auto">
                  {renderMarkdown(displayedOutput)}
                  {isGeneratingAny && <span className="inline-block w-1.5 h-4 bg-primary/60 ml-1 animate-pulse rounded-sm" />}
                </div>

                {/* Aura's Strategic Review */}
                {(fullVersion || shortVersion) && (
                  <div className="mt-4 border border-border/20 rounded-lg overflow-hidden">
                    <button
                      onClick={fetchCritique}
                      disabled={critiqueLoading}
                      className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors disabled:opacity-50"
                    >
                      <span>Aura's Strategic Review</span>
                      {critiqueLoading ? (
                        <span className="text-[10px] normal-case font-normal animate-pulse">Analysing...</span>
                      ) : critique ? (
                        <span className="text-[10px] normal-case font-normal text-primary">Refresh</span>
                      ) : (
                        <span className="text-[10px] normal-case font-normal">Tap to review</span>
                      )}
                    </button>
                    {critiqueError && (
                      <div className="px-4 py-3 text-xs text-destructive border-t border-border/20">
                        {critiqueError}
                      </div>
                    )}
                    {critique && !critiqueLoading && (
                      <div className="px-4 py-4 space-y-4 border-t border-border/20 text-xs">
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Pattern Detected</p>
                          <p className="text-foreground/90 leading-relaxed">{critique.observation?.summary}</p>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {(critique.observation?.key_themes || []).map((t: string) => (
                              <span key={t} className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px]">{t}</span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Strategic Insight</p>
                          <p className="text-foreground/90 leading-relaxed">{critique.synthesis?.insight}</p>
                          <p className="mt-1.5 text-primary/80 italic">{critique.synthesis?.emerging_thesis}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Challenge</p>
                          <p className="text-foreground/90 leading-relaxed">{critique.challenge?.assumption_gap}</p>
                          <p className="mt-1.5 text-primary font-medium">{critique.challenge?.question}</p>
                        </div>
                        <div className="bg-primary/5 border border-primary/15 rounded-md px-3 py-2.5">
                          <p className="text-[10px] uppercase tracking-wider text-primary font-semibold mb-1">Highest Leverage Move</p>
                          <p className="text-foreground/90 leading-relaxed">{critique.recommendation?.action}</p>
                          <p className="text-muted-foreground mt-1 leading-relaxed">{critique.recommendation?.reason}</p>
                        </div>
                        {(critique.alerts || []).length > 0 && (
                          <div className="space-y-2">
                            {critique.alerts.map((alert: any, i: number) => (
                              <div key={i} className={`px-3 py-2 rounded-md border text-[11px] ${
                                alert.urgency === "high"
                                  ? "border-destructive/30 bg-destructive/5 text-destructive"
                                  : alert.urgency === "medium"
                                  ? "border-amber-500/30 bg-amber-500/5 text-amber-600"
                                  : "border-border/20 bg-muted/20 text-muted-foreground"
                              }`}>
                                <span className="font-semibold">{alert.title}: </span>
                                {alert.message}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Generate shorter version button */}
                {!isGeneratingAny && !showingShort && fullVersion && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1.5 border-border/15"
                    onClick={generateShort}
                  >
                    <Zap className="w-3 h-3" /> Generate shorter version →
                  </Button>
                )}

                {/* Quality Rubric */}
                {!isGeneratingAny && (
                  <div className="p-3 rounded-xl bg-secondary/10 space-y-3">
                    {(() => {
                      const { dimensions, total } = scoreContent(displayedOutput, lang, voiceWords, preferredStructures, selectedSignalTitle, selectedSignalInsight);
                      const pct = Math.round((total / 80) * 100);
                      return (
                        <>
                          {/* Total score */}
                          <div className="flex items-center gap-3">
                            <span className={`text-lg font-bold tabular-nums ${pct >= 80 ? "text-amber-500" : "text-muted-foreground"}`}>
                              {total}/80
                            </span>
                            <div className="flex-1 bg-secondary/30 rounded-full h-2 overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${pct}%` }}
                                transition={{ duration: 0.6 }}
                                className={`h-full rounded-full ${pct >= 80 ? "bg-amber-500" : "bg-muted-foreground/40"}`}
                              />
                            </div>
                            <span className={`text-xs font-medium tabular-nums ${pct >= 80 ? "text-amber-500" : "text-muted-foreground"}`}>
                              {pct}%
                            </span>
                          </div>
                          {/* Dimension rows */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                            {dimensions.map(d => (
                              <div key={d.key} className="flex items-center gap-1.5" title={d.suggestion || ""}>
                                <span className={`text-[10px] font-bold w-4 shrink-0 ${d.score >= 7 ? "text-amber-500" : "text-muted-foreground/50"}`}>
                                  {d.key}
                                </span>
                                <span className={`text-[10px] truncate ${d.score >= 7 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground/50"}`}>
                                  {d.label}
                                </span>
                                <span className={`text-[10px] font-semibold tabular-nums ml-auto shrink-0 ${d.score >= 7 ? "text-amber-500" : "text-muted-foreground/40"}`}>
                                  {d.score}
                                </span>
                              </div>
                            ))}
                          </div>
                          {/* Show first suggestion for low-scoring dimension */}
                          {(() => {
                            const lowDim = dimensions.find(d => d.score < 7 && d.suggestion);
                            if (!lowDim) return null;
                            return (
                              <p className="text-[10px] text-muted-foreground/50 leading-tight">
                                💡 {lowDim.key}: {lowDim.suggestion}
                              </p>
                            );
                          })()}
                        </>
                      );
                    })()}
                  </div>
                )}
              </motion.div>
            )}
            {/* Voice Feedback Buttons */}
            {displayedOutput && !isGeneratingAny && (
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

            {/* Image Card Generator */}
            {displayedOutput && !isGeneratingAny && (
              <ImageCardGenerator
                postText={displayedOutput}
                topicLabel={topic}
                lang={lang}
                userName={profileName}
                userRole={profileRole}
              />
            )}

            {/* Visual Companion — LinkedIn Post Visual */}
            {topic.trim() && !isGeneratingAny && (() => {
              const visualMode = visualLoading || !!visualUrl;
              return (
                <div className={`rounded-xl border transition-all duration-300 ${
                  visualMode
                    ? "border-primary/20 bg-card/80 backdrop-blur-sm shadow-lg shadow-primary/5"
                    : "border-border/10 bg-card/60 backdrop-blur-sm"
                }`}>
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/8">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="w-3.5 h-3.5 text-primary/60" />
                      <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/50 font-semibold">
                        Visual Companion
                      </p>
                      {visualLoading && (
                        <span className="text-[10px] text-primary/70 font-medium animate-pulse ml-1">
                          Generating visual…
                        </span>
                      )}
                      {visualUrl && !visualLoading && (
                        <span className="text-[10px] text-emerald-500/80 font-medium ml-1">
                          ✓ Visual ready
                        </span>
                      )}
                    </div>
                    {!visualUrl && !visualLoading && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={generateVisual}
                        className="text-[10px] h-6 px-2 text-primary/60 hover:text-primary"
                      >
                        <Sparkles className="w-3 h-3 mr-1" />
                        Generate Schematic
                      </Button>
                    )}
                  </div>

                  {/* States */}
                  {visualLoading ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                      <Loader2 className="w-6 h-6 text-primary/50 animate-spin" />
                      <p className="text-xs text-muted-foreground/50">Creating your visual…</p>
                    </div>
                  ) : visualUrl ? (
                    <div>
                      {/* Scrollable visual preview */}
                      <div className="w-full overflow-y-auto bg-[#0a0a0a] p-4" style={{ maxHeight: "60vh" }}>
                        <img
                          src={visualUrl}
                          alt="Visual companion schematic"
                          className="max-w-full h-auto object-contain rounded-lg mx-auto block"
                        />
                      </div>
                      {/* Action bar */}
                      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-t border-border/8 bg-secondary/10">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={generateVisual}
                          disabled={visualLoading}
                          className="h-7 text-[11px] gap-1.5 border-border/15"
                        >
                          <Sparkles className="w-3 h-3" /> Regenerate Visual
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setVisualUrl(null)}
                          className="h-7 text-[11px] gap-1.5 border-border/15"
                        >
                          <PenTool className="w-3 h-3" /> Edit Text
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            try {
                              const { data: { session } } = await supabase.auth.getSession();
                              if (!session?.user?.id) throw new Error("Not authenticated");
                              const { error } = await supabase.from("content_items").insert({
                                user_id: session.user.id,
                                type: "linkedin_post",
                                title: topic,
                                body: stripMarkdown(output || fullVersion || ""),
                                status: "draft",
                                language: lang,
                                generation_params: {
                                  visual_url: visualUrl,
                                  framework,
                                  content_type: contentType,
                                },
                              });
                              if (error) throw error;
                              toast.success("Draft saved to your library.");
                            } catch (e: any) {
                              toast.error(e.message || "Failed to save");
                            }
                          }}
                          className="h-7 text-[11px] gap-1.5 border-border/15"
                        >
                          <Save className="w-3 h-3" /> Save to Library
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            try {
                              const resp = await fetch(visualUrl!);
                              const blob = await resp.blob();
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              a.href = url;
                              a.download = `visual-${topic.replace(/\s+/g, "-").slice(0, 30)}.png`;
                              document.body.appendChild(a);
                              a.click();
                              document.body.removeChild(a);
                              URL.revokeObjectURL(url);
                            } catch {
                              toast.error("Failed to download");
                            }
                          }}
                          className="h-7 text-[11px] gap-1.5 border-border/15"
                        >
                          <Download className="w-3 h-3" /> Download
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setVisualUrl(null)}
                          className="h-7 text-[11px] gap-1.5 text-muted-foreground hover:text-foreground ml-auto"
                        >
                          <X className="w-3 h-3" /> Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="py-8 text-center">
                      <p className="text-[10px] text-muted-foreground/30">Generate a strategic visual to complement your content</p>
                    </div>
                  )}
                </div>
              );
            })()}

            
          </>
        )}
      </div>

      <StartFromPanel
        currentFormat={contentType}
        hasDraft={!!(topic.trim() || output)}
        onSelect={(t, ctx, fmt, sigTitle, sigInsight) => {
          selectSuggestion(t, ctx, fmt, sigTitle, sigInsight);
        }}
      />
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

const FORMAT_TO_CONTENT_TYPE: Record<string, ContentType> = {
  post: "post",
  carousel: "carousel",
  essay: "essay",
  framework_summary: "framework_summary",
  framework: "framework_summary",
};

const PlanTab = ({ onGenerateFromPlan }: { onGenerateFromPlan: (prefill: PlanPrefill) => void }) => {
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
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3 h-7 text-xs gap-1.5 border-border/15"
                        onClick={() => onGenerateFromPlan({
                          topic: s.topic,
                          context: `${s.angle}\n\nReason: ${s.reason}`,
                          contentType: FORMAT_TO_CONTENT_TYPE[s.recommended_format] || "post",
                          planTitle: s.topic,
                        })}
                      >
                        <ArrowRight className="w-3 h-3" /> Generate this →
                      </Button>
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
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      const { data: allPosts } = await supabase
        .from("linkedin_posts")
        .select("theme, tone, format_type, engagement_score, like_count, comment_count, repost_count, source_type, tracking_status")
        .neq("tracking_status", "rejected")
        .order("published_at", { ascending: false })
        .limit(200);

      const rows = allPosts || [];
      setPosts(rows);

      // External posts = synced from LinkedIn
      const externalPosts = rows.filter((p: any) => p.source_type === "external_reference");
      // Aura drafts
      const auraDrafts = rows.filter((p: any) => p.source_type === "aura_generated" && p.tracking_status === "draft");
      // Aura published with real engagement
      const auraPublishedWithData = rows.filter(
        (p: any) => p.source_type === "aura_generated" && p.tracking_status === "published" && p.like_count != null && p.like_count > 0
      );

      // Summary cards use external posts only
      const themeCounts: Record<string, number> = {};
      const toneCounts: Record<string, number> = {};
      externalPosts.forEach((p: any) => {
        if (p.theme) themeCounts[p.theme] = (themeCounts[p.theme] || 0) + 1;
        if (p.tone) toneCounts[p.tone] = (toneCounts[p.tone] || 0) + 1;
      });
      const topTheme = Object.entries(themeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
      const tones = Object.entries(toneCounts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([tone, count]) => ({ tone, count }));

      // Avg engagement from external posts only
      const avgEng = externalPosts.length > 0
        ? externalPosts.reduce((sum: number, p: any) => sum + (Number(p.engagement_score) || 0), 0) / externalPosts.length
        : 0;

      // Top format = most common format_type among top 25% external posts by engagement
      let topFormat = "—";
      if (externalPosts.length > 0) {
        const sorted = [...externalPosts].sort((a: any, b: any) => (Number(b.engagement_score) || 0) - (Number(a.engagement_score) || 0));
        const top25 = sorted.slice(0, Math.max(1, Math.ceil(sorted.length * 0.25)));
        const fmtCounts: Record<string, number> = {};
        top25.forEach((p: any) => {
          if (p.format_type) fmtCounts[p.format_type] = (fmtCounts[p.format_type] || 0) + 1;
        });
        topFormat = Object.entries(fmtCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
      }

      setStats({
        postCount: externalPosts.length,
        topTheme,
        avgEngagement: Math.round(avgEng * 10) / 10,
        topFormat,
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

  // Separate posts for detailed view
  const externalPosts = posts.filter((p: any) => p.source_type === "external_reference");
  const auraDrafts = posts.filter((p: any) => p.source_type === "aura_generated" && p.tracking_status === "draft");
  const auraPublished = posts.filter((p: any) => p.source_type === "aura_generated" && p.tracking_status === "published");

  return (
    <div className="space-y-6">
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

      {/* Aura drafts notice */}
      {auraDrafts.length > 0 && (
        <div className="glass-card rounded-2xl p-5 border border-border/8">
          <p className="text-label uppercase tracking-wider text-xs font-semibold mb-3 text-muted-foreground/60">Aura Drafts ({auraDrafts.length})</p>
          <div className="space-y-2">
            {auraDrafts.slice(0, 5).map((p: any, i: number) => (
              <div key={`${p.theme}-${p.tone}-${i}`} className="flex items-center justify-between py-1.5">
                <span className="text-sm text-foreground/70 truncate flex-1">{p.theme || p.format_type || "Untitled"}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted/20 text-muted-foreground border border-border/15 shrink-0 ml-2">
                  Not published yet
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

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
        const arrayBuf = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuf);
        const raw = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
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
  source_metadata: any;
  _source: "linkedin_posts" | "content_items";
}

const FORMAT_BADGE: Record<string, { label: string; cls: string }> = {
  post: { label: "Post", cls: "bg-amber-500/15 text-amber-400 border-amber-500/20" },
  post_short: { label: "Short", cls: "bg-orange-500/15 text-orange-400 border-orange-500/20" },
  carousel: { label: "Carousel", cls: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
  framework: { label: "Framework", cls: "bg-purple-500/15 text-purple-400 border-purple-500/20" },
  essay: { label: "Essay", cls: "bg-muted/30 text-muted-foreground border-border/20" },
};

/* ── Library Card with Performance Logger ── */
const LibraryCard = ({
  post: p,
  badge,
  isDraft,
  isPublished,
  copiedId,
  onCopy,
  onMarkPublished,
  onDelete,
}: {
  post: SavedPost;
  badge: { label: string; cls: string };
  isDraft: boolean;
  isPublished: boolean;
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
  onMarkPublished: (id: string) => void;
  onDelete: (id: string) => void;
}) => {
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [impressions, setImpressions] = useState("");
  const [reactions, setReactions] = useState("");
  const [comments, setComments] = useState("");
  const [saving, setSaving] = useState(false);

  const saveMetrics = async () => {
    const imp = parseInt(impressions) || 0;
    const react = parseInt(reactions) || 0;
    const comm = parseInt(comments) || 0;
    const engScore = imp > 0 ? Math.round(((react + comm * 2) / imp) * 100 * 100) / 100 : 0;

    setSaving(true);
    const { error } = await supabase
      .from("linkedin_posts")
      .update({
        like_count: react,
        comment_count: comm,
        engagement_score: engScore,
      })
      .eq("id", p.id);
    setSaving(false);

    if (error) {
      toast.error("Failed to save metrics");
      return;
    }
    toast.success("Metrics saved. Aura is learning.");
    setMetricsOpen(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-xl p-5 border border-border/8 hover:border-primary/10 transition-all"
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="flex-1 min-w-0">
          {p._source === "content_items" ? (
            <>
              <p className="text-sm text-foreground leading-snug line-clamp-3" dir="auto">
                {p.post_text || "Untitled"}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-muted-foreground/40">Aura Draft</span>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm font-bold text-foreground leading-snug line-clamp-2">
                {p.title || "Untitled"}
              </p>
              {p.topic_label && (
                <p className="text-xs text-muted-foreground/50 mt-1 line-clamp-1">{p.topic_label}</p>
              )}
              {p.source_metadata?.from_plan && (
                <p className="text-[10px] text-muted-foreground/40 mt-0.5">From plan: {p.source_metadata.from_plan}</p>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${badge.cls}`}>
            {badge.label}
          </span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
            isDraft
              ? "bg-amber-500/15 text-amber-400 border-amber-500/20"
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
          onClick={() => p.post_text && onCopy(p.id, p.post_text)}
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
            onClick={() => onMarkPublished(p.id)}
          >
            <Check className="w-3 h-3" /> Mark as published
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={() => onDelete(p.id)}
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>

      {/* Performance logger for published posts */}
      {isPublished && p._source === "linkedin_posts" && (
        <div className="mt-3 pt-3 border-t border-border/8">
          {!metricsOpen ? (
            <button
              onClick={() => setMetricsOpen(true)}
              className="text-xs text-primary/70 hover:text-primary transition-colors font-medium"
            >
              Log performance →
            </button>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">Impressions</label>
                  <Input
                    type="number"
                    min="0"
                    value={impressions}
                    onChange={e => setImpressions(e.target.value)}
                    className="h-7 text-xs bg-secondary/20 border-border/10"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">Reactions</label>
                  <Input
                    type="number"
                    min="0"
                    value={reactions}
                    onChange={e => setReactions(e.target.value)}
                    className="h-7 text-xs bg-secondary/20 border-border/10"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">Comments</label>
                  <Input
                    type="number"
                    min="0"
                    value={comments}
                    onChange={e => setComments(e.target.value)}
                    className="h-7 text-xs bg-secondary/20 border-border/10"
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1.5"
                  onClick={saveMetrics}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  Save metrics
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => setMetricsOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
};

interface SavedFramework {
  id: string;
  title: string;
  summary: string | null;
  tags: string[];
  diagram_url: string | null;
  framework_steps: any;
  created_at: string;
}

const FrameworkLibrarySection = ({ pendingDeleteId, setPendingDeleteId, expandedCards, toggleCardExpand }: { pendingDeleteId: string | null; setPendingDeleteId: (id: string | null) => void; expandedCards: Set<string>; toggleCardExpand: (id: string) => void }) => {
  const [frameworks, setFrameworks] = useState<SavedFramework[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("master_frameworks")
        .select("id, title, summary, tags, diagram_url, framework_steps, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      setFrameworks((data || []) as SavedFramework[]);
      setLoading(false);
    })();
  }, []);

  const sanitiseFilename = (title: string) =>
    (title || "framework")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 80) || "framework";

  const handleDownloadText = (fw: SavedFramework) => {
    try {
      const steps: any[] = Array.isArray(fw.framework_steps) ? fw.framework_steps : [];
      const stepLines = steps.length
        ? steps.map((s, i) => {
            const stepTitle = typeof s === "string" ? s : (s?.title || s?.name || s?.label || `Step ${i + 1}`);
            const stepDesc = typeof s === "string" ? "" : (s?.description || s?.detail || s?.body || "");
            return `Step ${i + 1}: ${stepTitle}${stepDesc ? ` — ${stepDesc}` : ""}`;
          }).join("\n")
        : "(No steps defined)";

      const date = new Date().toLocaleDateString();
      const content =
`FRAMEWORK TITLE
===============
${fw.title || "Untitled"}

DESCRIPTION
-----------
${fw.summary || "(No description)"}

STEPS
-----
${stepLines}

Generated by Aura — ${date}
`;

      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${sanitiseFilename(fw.title)}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[Library] framework download failed", err);
      toast.error("Could not download framework");
    }
  };

  const handleDownloadDiagram = async (url: string, title: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `${sanitiseFilename(title)}_diagram.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      toast.error("Failed to download diagram");
    }
  };

  const deleteFramework = async (id: string) => {
    const { error } = await supabase.from("master_frameworks").delete().eq("id", id);
    if (error) { toast.error("Failed to delete framework"); return; }
    setFrameworks(prev => prev.filter(fw => fw.id !== id));
    toast.success("Framework deleted");
  };

  if (loading || frameworks.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2.5 w-full text-left group"
        style={{ borderLeft: "1px solid #f0f0f0", paddingLeft: 12, marginBottom: expanded ? 12 : 0, background: "none", border: "none", cursor: "pointer", borderLeftWidth: 1, borderLeftStyle: "solid", borderLeftColor: "#f0f0f0" }}
      >
        <h3 style={{ fontSize: 14, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#f0f0f0", margin: 0 }}>
          Frameworks
        </h3>
        <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, backgroundColor: "var(--bg-subtle)", color: "var(--color-muted)" }}>

        </span>
        <ChevronDown
          className="ml-auto transition-transform duration-200 group-hover:text-primary"
          style={{ width: 16, height: 16, color: "#888", transform: expanded ? "rotate(0deg)" : "rotate(-90deg)" }}
        />
      </button>
      {expanded && (
        <div style={{ display: "grid", gap: 12 }}>
          {frameworks.map(fw => {
            const isApproved = fw.tags?.includes("Approved");
            return (
              <div
                key={fw.id}
                style={{ background: "var(--bg-card)", borderRadius: 8, padding: 16, border: "1px solid var(--color-border)", transition: "border-color 0.2s" }}
                className="hover:border-[rgba(255,255,255,0.08)]"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p style={{ fontSize: 14, fontWeight: 700, color: "#f0f0f0", lineHeight: 1.4 }} className="line-clamp-1">{fw.title}</p>
                    {fw.summary && (
                      <>
                        <p style={{ fontSize: 13, color: "var(--color-muted)", lineHeight: 1.5, marginTop: 4 }} className={expandedCards.has(fw.id) ? "" : "line-clamp-2"}>{fw.summary}</p>
                        {fw.summary.split("\n").length > 2 || fw.summary.length > 120 ? (
                          <button
                            onClick={() => toggleCardExpand(fw.id)}
                            style={{ fontSize: 13, color: "#F97316", background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 4 }}
                            className="hover:underline"
                          >
                            {expandedCards.has(fw.id) ? "Show less" : "Read more"}
                          </button>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <span style={{ fontSize: 12, color: "var(--color-muted)" }}>{formatSmartDate(fw.created_at)}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 999,
                    backgroundColor: isApproved ? "rgba(16,185,129,0.12)" : "var(--bg-subtle)",
                    color: isApproved ? "#34d399" : "var(--color-muted)",
                  }}>
                    {isApproved ? "Approved" : "Draft"}
                  </span>
                  <div className="flex-1" />
                  <div className="flex items-center gap-2">
                    {fw.diagram_url && (
                      <button
                        onClick={() => window.open(fw.diagram_url!, "_blank")}
                        style={{ fontSize: 12, fontWeight: 500, padding: "4px 12px", borderRadius: 6, backgroundColor: "var(--bg-subtle)", color: "var(--color-muted)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
                        className="hover:bg-muted/40 transition-colors"
                      >
                        <ImageIcon className="w-3 h-3" /> View
                      </button>
                    )}
                    <button
                      onClick={() => handleDownloadText(fw)}
                      style={{ fontSize: 12, fontWeight: 500, padding: "4px 12px", borderRadius: 6, backgroundColor: "var(--bg-subtle)", color: "var(--color-muted)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
                      className="hover:bg-muted/40 transition-colors"
                      title="Download framework as text"
                    >
                      <Download className="w-3 h-3" /> Download
                    </button>
                    <button
                      onClick={() => setPendingDeleteId(`fw_${fw.id}`)}
                      style={{ fontSize: 12, fontWeight: 500, padding: "4px 8px", borderRadius: 6, backgroundColor: "transparent", color: "#ef4444", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                      className="hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Framework delete confirmation */}
      {pendingDeleteId?.startsWith("fw_") && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.8)" }}>
          <div className="bg-card border border-border/20 rounded-xl p-6 w-[400px] max-w-[90vw] space-y-4 shadow-2xl">
            <h3 className="text-base font-semibold text-foreground">Delete this framework?</h3>
            <p className="text-sm text-muted-foreground">Are you sure you want to delete this framework? This action cannot be undone.</p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setPendingDeleteId(null)}>Cancel</Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={async () => {
                  const id = pendingDeleteId!.replace("fw_", "");
                  setPendingDeleteId(null);
                  await deleteFramework(id);
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

const LibraryTab = ({ onSwitchToCreate }: { onSwitchToCreate: () => void }) => {
  const [drafts, setDrafts] = useState<SavedPost[]>([]);
  const [publishedPosts, setPublishedPosts] = useState<SavedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [showPublished, setShowPublished] = useState(false);
  const [showDrafts, setShowDrafts] = useState(true);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const toggleCardExpand = (id: string) => setExpandedCards(prev => { const next = new Set(prev); if (next.has(id)) { next.delete(id); } else { next.add(id); } return next; });

  useEffect(() => { loadPosts(); }, []);

  const loadPosts = async () => {
    setLoading(true);
    const [liRes, ciRes] = await Promise.all([
      supabase
        .from("linkedin_posts")
        .select("id, title, post_text, format_type, tracking_status, topic_label, created_at, source_metadata, source_type, published_at")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("content_items")
        .select("id, type, body, language, status, generation_params, created_at")
        .eq("status", "draft")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    // Drafts from content_items
    const ciDrafts: SavedPost[] = (ciRes.data || []).map((ci: any) => ({
      id: ci.id,
      title: null,
      post_text: ci.body,
      format_type: ci.type === "framework" ? "framework" : ci.type,
      tracking_status: ci.status,
      topic_label: null,
      created_at: ci.created_at,
      source_metadata: { ...ci.generation_params, _language: ci.language },
      _source: "content_items" as const,
    }));

    // Published linkedin posts — filter out empty/short post_text
    const liPublished: SavedPost[] = (liRes.data || [])
      .filter((p: any) => p.post_text && p.post_text.trim().length >= 20)
      .filter((p: any) => p.published_at || p.tracking_status === "published")
      .map((p: any) => ({
        ...p,
        _source: "linkedin_posts" as const,
      }));

    setDrafts(ciDrafts);
    setPublishedPosts(liPublished);
    setLoading(false);
  };

  const handleCopy = async (id: string, text: string) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch (err) {
      console.error("[Library] copy failed", err);
      toast.error("Could not copy — please select and copy manually");
    }
  };

  const markPublished = async (id: string) => {
    const item = drafts.find(p => p.id === id);
    if (!item) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("linkedin_posts")
        .insert({
          user_id: session.user.id,
          post_text: item.post_text || "",
          format_type: item.format_type || "post",
          tracking_status: "published",
          source_type: "aura_generated",
          published_at: new Date().toISOString(),
          like_count: 0,
          comment_count: 0,
          repost_count: 0,
          engagement_score: 0,
          source_trust: 100,
          source_metadata: item.source_metadata || {},
          enriched_by: [],
          synced_at: new Date().toISOString(),
        });
      if (error) throw error;
      await supabase
        .from("content_items")
        .update({ status: "published" })
        .eq("id", id);
      setDrafts(prev => prev.filter(p => p.id !== id));
      toast.success("Marked as published — visible in your library.");
      loadPosts();
    } catch (e: any) {
      toast.error(e.message || "Failed to mark as published");
    }
  };

  const deletePost = async (id: string) => {
    // Check drafts first, then published
    const inDrafts = drafts.find(p => p.id === id);
    const inPublished = publishedPosts.find(p => p.id === id);
    const item = inDrafts || inPublished;
    if (!item) return;
    const table = item._source === "content_items" ? "content_items" : "linkedin_posts";
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) { toast.error("Failed to delete"); return; }
    if (inDrafts) setDrafts(prev => prev.filter(p => p.id !== id));
    if (inPublished) setPublishedPosts(prev => prev.filter(p => p.id !== id));
    toast.success("Deleted");
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

  const hasAnyContent = drafts.length > 0 || publishedPosts.length > 0;

  if (!hasAnyContent) {
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
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
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

      {/* ── Section 1: Aura Drafts ── */}
      <div>
        <button
          onClick={() => setShowDrafts(!showDrafts)}
          className="flex items-center gap-2.5 w-full text-left group"
          style={{ borderLeft: "1px solid #F97316", paddingLeft: 12, marginBottom: showDrafts ? 12 : 0, background: "none", border: "none", cursor: "pointer", borderLeftWidth: 1, borderLeftStyle: "solid", borderLeftColor: "#F97316" }}
        >
          <h3 style={{ fontSize: 14, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#F97316", margin: 0 }}>
            Your Drafts
          </h3>
          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, backgroundColor: "var(--bg-subtle)", color: "#F97316" }}>
            {drafts.length}
          </span>
          <ChevronDown
            className="ml-auto transition-transform duration-200 group-hover:text-primary"
            style={{ width: 16, height: 16, color: "#F97316", transform: showDrafts ? "rotate(0deg)" : "rotate(-90deg)" }}
          />
        </button>
        {showDrafts && (drafts.length === 0 ? (
          <div style={{ background: "var(--bg-card)", borderRadius: 8, padding: 16, textAlign: "center" }}>
            <p style={{ fontSize: 13, color: "var(--color-muted)" }}>No drafts yet. Generate content on the Create tab.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {drafts.map(p => {
              const lang = (p.source_metadata as any)?._language || "en";
              const badge = FORMAT_BADGE[p.format_type || "post"] || FORMAT_BADGE.post;
              return (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    background: "var(--bg-card)",
                    borderLeft: "2px solid #F97316",
                    borderRadius: 8,
                    padding: 16,
                    border: "1px solid var(--color-border)",
                    borderLeftWidth: 2,
                    borderLeftColor: "#F97316",
                    transition: "all 0.2s",
                  }}
                  className="hover:bg-muted/20 hover:border-l-[#D4B57A]"
                >
                  {/* Body text */}
                  <p style={{ fontSize: 14, color: "var(--color-foreground, #e0e0e0)", lineHeight: 1.6 }} className={expandedCards.has(p.id) ? "" : "line-clamp-4"} dir="auto">
                    {p.post_text || "Untitled draft"}
                  </p>
                  {(p.post_text?.split("\n").length || 0) > 4 || (p.post_text?.length || 0) > 280 ? (
                    <button
                      onClick={() => toggleCardExpand(p.id)}
                      style={{ fontSize: 13, color: "#F97316", background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 4 }}
                      className="hover:underline"
                    >
                      {expandedCards.has(p.id) ? "Show less" : "Read more"}
                    </button>
                  ) : null}

                  {/* Badge row */}
                  <div className="flex items-center flex-wrap" style={{ gap: 8, marginTop: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, backgroundColor: "var(--bg-subtle)", color: "var(--color-muted)", textTransform: "uppercase" }}>
                      {lang === "ar" ? "AR" : "EN"}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, backgroundColor: "var(--bg-subtle)" }} className={badge.cls.includes("text-") ? badge.cls.split(" ").filter(c => c.startsWith("text-")).join(" ") : "text-muted-foreground"}>
                      {badge.label}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, backgroundColor: "rgba(245,158,11,0.12)", color: "#fbbf24" }}>
                      Draft
                    </span>
                  </div>

                  {/* Date + Actions */}
                  <div className="flex items-center" style={{ marginTop: 12, gap: 16 }}>
                    <span style={{ fontSize: 12, color: "var(--color-muted)" }}>{formatSmartDate(p.created_at)}</span>
                    <div className="flex-1" />
                    <button
                      onClick={() => p.post_text && handleCopy(p.id, p.post_text)}
                      disabled={!p.post_text}
                      style={{ fontSize: 13, color: "var(--color-muted)", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
                      className="hover:text-foreground transition-colors disabled:opacity-30"
                    >
                      {copiedId === p.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedId === p.id ? "Copied" : "Copy"}
                    </button>
                    <button
                      onClick={() => markPublished(p.id)}
                      style={{ fontSize: 13, color: "var(--color-muted)", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
                      className="hover:text-foreground transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" /> Mark as Published
                    </button>
                    <button
                      onClick={() => setPendingDeleteId(p.id)}
                      style={{ fontSize: 13, color: "#ef4444", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                      className="hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ))}
      </div>

      {/* ── Section 2: Published Posts (collapsed by default) ── */}
      <div>
        <button
          onClick={() => setShowPublished(!showPublished)}
          className="flex items-center gap-2.5 w-full text-left group"
          style={{ borderLeft: "1px solid #f0f0f0", paddingLeft: 12, marginBottom: showPublished ? 12 : 0, background: "none", border: "none", cursor: "pointer", borderLeftWidth: 1, borderLeftStyle: "solid", borderLeftColor: "#f0f0f0" }}
        >
          <h3 style={{ fontSize: 14, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#f0f0f0", margin: 0 }}>
            Published Posts
          </h3>
          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, backgroundColor: "var(--bg-subtle)", color: "var(--color-muted)" }}>
            {publishedPosts.length}
          </span>
          <ChevronDown
            className="ml-auto transition-transform duration-200 group-hover:text-primary"
            style={{ width: 16, height: 16, color: "#888", transform: showPublished ? "rotate(0deg)" : "rotate(-90deg)" }}
          />
        </button>
        {showPublished && (
          <div style={{ display: "grid", gap: 12 }}>
            {publishedPosts.length === 0 ? (
              <div style={{ background: "var(--bg-card)", borderRadius: 8, padding: 16, textAlign: "center" }}>
                <p style={{ fontSize: 13, color: "var(--color-muted)" }}>No published posts yet.</p>
              </div>
            ) : publishedPosts.map(p => {
              const badge = FORMAT_BADGE[p.format_type || "post"] || FORMAT_BADGE.post;
              return (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{ background: "var(--bg-card)", borderRadius: 8, padding: 16, border: "1px solid var(--color-border)", transition: "border-color 0.2s" }}
                  className="hover:border-[rgba(255,255,255,0.08)]"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p style={{ fontSize: 14, color: "var(--color-foreground, #e0e0e0)", lineHeight: 1.5 }} className={expandedCards.has(p.id) ? "" : "line-clamp-2"} dir="auto">
                        {p.post_text}
                      </p>
                      {(p.post_text?.split("\n").length || 0) > 2 || (p.post_text?.length || 0) > 140 ? (
                        <button
                          onClick={() => toggleCardExpand(p.id)}
                          style={{ fontSize: 13, color: "#F97316", background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 4 }}
                          className="hover:underline"
                        >
                          {expandedCards.has(p.id) ? "Show less" : "Read more"}
                        </button>
                      ) : null}
                      {p.topic_label && (
                        <p style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 4 }} className="line-clamp-1">{p.topic_label}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, backgroundColor: "var(--bg-subtle)" }} className={badge.cls.includes("text-") ? badge.cls.split(" ").filter(c => c.startsWith("text-")).join(" ") : "text-muted-foreground"}>
                        {badge.label}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, backgroundColor: "rgba(16,185,129,0.12)", color: "#34d399" }}>
                        Published
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center" style={{ marginTop: 12, gap: 16 }}>
                    <span style={{ fontSize: 12, color: "var(--color-muted)" }}>{formatSmartDate(p.created_at)}</span>
                    <div className="flex-1" />
                    <button
                      onClick={() => p.post_text && handleCopy(p.id, p.post_text)}
                      disabled={!p.post_text}
                      style={{ fontSize: 13, color: "var(--color-muted)", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
                      className="hover:text-foreground transition-colors disabled:opacity-30"
                    >
                      {copiedId === p.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedId === p.id ? "Copied" : "Copy"}
                    </button>
                    <button
                      onClick={() => setPendingDeleteId(p.id)}
                      style={{ fontSize: 13, color: "#ef4444", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                      className="hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Section 3: Frameworks ── */}
      <FrameworkLibrarySection pendingDeleteId={pendingDeleteId} setPendingDeleteId={setPendingDeleteId} expandedCards={expandedCards} toggleCardExpand={toggleCardExpand} />

      {/* ── Section 4: Voice Trainer ── */}
      <VoiceTrainer />
    </div>
  );
};

/* ═══════════════════════════════════════════
   MAIN AUTHORITY TAB
   ═══════════════════════════════════════════ */

interface AuthorityTabProps {
  entries: any[];
  onRefresh?: () => void;
  signalPrefill?: SignalPrefill | null;
  onSignalPrefillConsumed?: () => void;
}

const TABS: { key: AuthoritySubTab; label: string; icon: typeof PenTool }[] = [
  { key: "create", label: "Create", icon: PenTool },
  { key: "plan", label: "Plan", icon: Calendar },
  { key: "analyze", label: "Analyze", icon: BarChart3 },
  { key: "library", label: "Library", icon: BookOpen },
];

const AuthorityTab = ({ entries, onRefresh, signalPrefill, onSignalPrefillConsumed }: AuthorityTabProps) => {
  const [activeTab, setActiveTab] = useState<AuthoritySubTab>("create");
  const [brandDone, setBrandDone] = useState<boolean | null>(null);
  const [planPrefill, setPlanPrefill] = useState<PlanPrefill | null>(null);

  useEffect(() => {
    supabase.from("diagnostic_profiles").select("brand_assessment_completed_at").limit(1).maybeSingle()
      .then(({ data }) => setBrandDone(!!data?.brand_assessment_completed_at));
  }, []);

  const handleGenerateFromPlan = (prefill: PlanPrefill) => {
    setPlanPrefill({ ...prefill });
    setActiveTab("create");
  };

  // When signalPrefill arrives, switch to create tab
  useEffect(() => {
    if (signalPrefill) {
      setActiveTab("create");
    }
  }, [signalPrefill]);

  return (
    <div className="space-y-8">
      <PageHeader
        icon={Crown}
        title="Content Studio"
        question="Content Studio"
        processLogic="Signal → Insight → Framework → Content → Audience"
      />

      {brandDone === false && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-primary/15 bg-primary/[0.04]">
          <Target className="w-4 h-4 text-primary shrink-0" />
          <p className="text-xs text-muted-foreground flex-1">
            Complete your Brand Assessment to get content fully calibrated to your positioning.
          </p>
          <a href="/dashboard?tab=identity" className="text-xs text-primary font-medium whitespace-nowrap hover:underline">
            Start →
          </a>
        </div>
      )}

      

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

      {activeTab === "create" && <CreateTab planPrefill={planPrefill} signalPrefill={signalPrefill} onSignalPrefillConsumed={onSignalPrefillConsumed} />}
      {activeTab === "plan" && <PlanTab onGenerateFromPlan={handleGenerateFromPlan} />}
      {activeTab === "analyze" && <AnalyzeTab />}
      {activeTab === "library" && <LibraryTab onSwitchToCreate={() => setActiveTab("create")} />}
    </div>
  );
};

export default AuthorityTab;
