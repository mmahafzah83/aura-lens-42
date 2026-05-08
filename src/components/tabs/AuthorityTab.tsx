import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { AuraButton } from "@/components/ui/AuraButton";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import {
  Loader2, Save, Plus, X, Send, Copy, Check, Trash2, Search,
  PenTool, LayoutGrid, FileText, BookOpen, Lightbulb,
  Sparkles, Zap, Target, ArrowRight, Layers,
  Calendar, TrendingUp, BarChart3, Upload, Mic, ChevronLeft, ChevronDown, Image as ImageIcon, Download
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Linkedin } from "lucide-react";
import { shareToLinkedIn } from "@/lib/shareLinkedIn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatSmartDate } from "@/lib/formatDate";
import { isArabicText } from "@/lib/utils";
import FrameworkBuilderInline from "@/components/FrameworkBuilderInline";
import CardPreviewPanel from "@/components/visual-cards/CardPreviewPanel";
import SchematicPreviewPanel from "@/components/visual-cards/SchematicPreviewPanel";
import StartFromPanel from "@/components/StartFromPanel";
import FirstVisitHint from "@/components/ui/FirstVisitHint";
import FlashPanel from "@/components/FlashPanel";
import EmptyState from "@/components/ui/EmptyState";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { CollapsibleList } from "@/components/ui/CollapsibleList";
import { ChevronRight } from "lucide-react";
import LinkedInFeedPreview from "@/components/LinkedInFeedPreview";

/* ── Shared Types ── */
type ContentType = "post" | "carousel" | "essay" | "framework_summary" | "flash";
type AuthoritySubTab = "create" | "plan" | "library";
type ContentFramework = "auto" | "hook_insight_question" | "slap" | "bab" | "pas" | "wwh" | "chef" | "story_lesson_question";

const FORMAT_LABELS: Record<string, { label: string; icon: any; subtitle?: string }> = {
  post: { label: "LinkedIn Post", icon: PenTool },
  carousel: { label: "Carousel", icon: LayoutGrid },
  framework_summary: { label: "Framework Builder", icon: BookOpen },
  flash: { label: "Flash", icon: Zap, subtitle: "بوست في 60 ثانية" },
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
  strategic_implications?: string | null;
  fragment_count?: number | null;
  unique_orgs?: number | null;
  theme_tags?: string[] | null;
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
  const navigate = useNavigate();
  const [topic, setTopic] = useState("");
  const [context, setContext] = useState("");
  const [contentType, setContentType] = useState<ContentType>("post");
  const [trendPrefillLabel, setTrendPrefillLabel] = useState<string | null>(null);
  const [framework, setFramework] = useState<ContentFramework>("auto");
  const [lang, setLang] = useState<"en" | "ar">("en");
  const [output, setOutput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [showSlowHint, setShowSlowHint] = useState(false);
  const [copied, setCopied] = useState(false);
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
  const [visualMode, setVisualMode] = useState<'card' | 'schematic'>('card');
  const [cardRecommendation, setCardRecommendation] = useState<any>(null);

  // Quick actions / variations state
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [translatedPost, setTranslatedPost] = useState<string | null>(null);
  const [translatedLang, setTranslatedLang] = useState<"en" | "ar" | null>(null);

  // Free-tier generation limit
  const [monthlyGenerationCount, setMonthlyGenerationCount] = useState(0);
  const FREE_LIMIT = 3;
  // AI suggestions (used by voice profile loading only)
  const [_signals, setSignals] = useState<SignalSuggestion[]>([]);
  const [_frameworks, setFrameworks] = useState<FrameworkSuggestion[]>([]);
  const [_suggestionsLoading, setSuggestionsLoading] = useState(true);

  // Customize collapsible (persisted)
  const [customizeOpen, setCustomizeOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("aura_publish_expanded") === "1";
  });
  useEffect(() => {
    try { window.localStorage.setItem("aura_publish_expanded", customizeOpen ? "1" : "0"); } catch {}
  }, [customizeOpen]);

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
      supabase.from("strategic_signals").select("id, signal_title, explanation, content_opportunity, confidence, strategic_implications, fragment_count, unique_orgs, theme_tags")
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
        // Route directly to Carousel Studio with prefill
        navigate("/carousel-studio", {
          state: {
            topic: signalPrefill.topic,
            context: signalPrefill.context,
            signalId: signalPrefill.signalId || undefined,
            signalTitle: signalPrefill.signalTitle || undefined,
            lang,
            autoGenerate: true,
          },
        });
        onSignalPrefillConsumed?.();
        return;
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
      setCardRecommendation(null);
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

  // Auto-detect best card style/type after content is generated
  const displayedOutputForDetect = output;
  useEffect(() => {
    if (!displayedOutputForDetect || displayedOutputForDetect.length < 30) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const { data } = await supabase.functions.invoke("detect-card-style", {
          body: { post_text: displayedOutputForDetect, language: lang },
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!cancelled && data?.recommendation) setCardRecommendation(data.recommendation);
      } catch (err) {
        console.warn("Card detection failed (non-blocking):", err);
      }
    })();
    return () => { cancelled = true; };
  }, [displayedOutputForDetect, lang]);

  const streamGeneration = async (
    extraPromptInstruction?: string,
    overrides?: { topic?: string; context?: string; language?: "en" | "ar"; framework?: ContentFramework; contentType?: ContentType; signal?: AbortSignal }
  ): Promise<string> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Not authenticated");
    const effTopic = overrides?.topic ?? topic;
    const effContext = overrides?.context ?? context;
    const effLang = overrides?.language ?? lang;
    const effFramework = overrides?.framework ?? framework;
    const effContentType = overrides?.contentType ?? contentType;
    const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-authority-content`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({
        action: "generate_content",
        content_type: effContentType,
        topic: effTopic,
        context: effContext,
        language: effLang,
        framework: effFramework !== "auto" ? effFramework : undefined,
        extra_instruction: extraPromptInstruction,
        signal_id: selectedSignalId,
        stream: false,
      }),
      signal: overrides?.signal,
    });
    if (!resp.ok) {
      let detail = "";
      try { detail = (await resp.text()).slice(0, 300); } catch {}
      throw new Error(`Generation failed (${resp.status})${detail ? `: ${detail}` : ""}`);
    }
    const json = await resp.json();
    const accumulated: string = json?.content || "";
    if (accumulated) setOutput(accumulated);
    return accumulated;
  };

  const generate = async (overrides?: { topic?: string; context?: string; language?: "en" | "ar"; framework?: ContentFramework; contentType?: ContentType }) => {
    const effTopic = (overrides?.topic ?? topic).trim();
    const effContentType = overrides?.contentType ?? contentType;
    if (!effTopic) {
      toast.error("Add a topic before generating.");
      return;
    }
    if (effContentType === "carousel") {
      navigate("/carousel-studio", {
        state: {
          topic: effTopic,
          context: (overrides?.context ?? context),
          signalId: selectedSignalId || undefined,
          signalTitle: selectedSignalTitle || undefined,
          lang: overrides?.language ?? lang,
          autoGenerate: true,
        },
      });
      return;
    }
    setGenerating(true);
    setShowSlowHint(false);
    setOutput("");
    setCritique(null);
    setCritiqueError(null);
    setFullVersion("");
    setShortVersion("");
    setShowingShort(false);
    setGenerationTimestamp(new Date().toISOString());
    const slowTimer = setTimeout(() => setShowSlowHint(true), 5000);
    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), 60000);
    try {
      const accumulated = await streamGeneration(undefined, { ...overrides, topic: effTopic, signal: controller.signal });
      setFullVersion(accumulated);
      if (!accumulated.trim()) {
        toast.error("No content was returned. Please try again.");
      }
    } catch (e: any) {
      console.error("[generate-authority-content] error:", e);
      if (e?.name === "AbortError") {
        toast.error("Generation timed out. Please try again.");
      } else {
        toast.error(e?.message || "Generation failed. Please try again.");
      }
    } finally {
      clearTimeout(slowTimer);
      clearTimeout(timeoutTimer);
      setShowSlowHint(false);
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
      const escapeHtml = (s: string) =>
        s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      const safe = escapeHtml(line);
      const html = safe
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

  // Quick action: rewrites the existing post with an extra instruction and replaces the output
  const runQuickAction = async (key: string, instruction: string) => {
    if (!displayedOutput || isGeneratingAny || actionLoading) return;
    setActionLoading(key);
    const previous = displayedOutput;
    setOutput("");
    try {
      const fullInstruction = `${instruction}\n\nHere is the existing post to rewrite:\n\n${previous}`;
      const accumulated = await streamGeneration(fullInstruction);
      if (accumulated.trim()) {
        setFullVersion(accumulated);
        setShowingShort(false);
      } else {
        setOutput(previous);
        toast.error("No content returned. Keeping original.");
      }
    } catch (e: any) {
      setOutput(previous);
      toast.error(e?.message || "Action failed");
    } finally {
      setActionLoading(null);
    }
  };

  // Translate side-by-side
  const runTranslate = async () => {
    if (!displayedOutput || isGeneratingAny || actionLoading) return;
    const targetLang: "en" | "ar" = lang === "en" ? "ar" : "en";
    setActionLoading("translate");
    setTranslatedPost("");
    setTranslatedLang(targetLang);
    try {
      const instruction = targetLang === "ar"
        ? `Translate this LinkedIn post to natural professional Arabic for a GCC executive audience. Keep the same structure and tone. Return only the translated post, no commentary.\n\n${displayedOutput}`
        : `Translate this LinkedIn post to natural professional English for an executive audience. Keep the same structure and tone. Return only the translated post, no commentary.\n\n${displayedOutput}`;
      // Stream into translatedPost without touching main output
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
          language: targetLang,
          extra_instruction: instruction,
          stream: false,
        }),
      });
      if (!resp.ok) throw new Error(`Translate failed (${resp.status})`);
      const j = await resp.json();
      const accumulated: string = j?.content || "";
      if (accumulated) setTranslatedPost(accumulated);
    } catch (e: any) {
      setTranslatedPost(null);
      setTranslatedLang(null);
      toast.error(e?.message || "Translation failed");
    } finally {
      setActionLoading(null);
    }
  };

  // Variations: regenerate with a new opening style
  const runVariation = async (key: string, instruction: string) => {
    if (!displayedOutput || isGeneratingAny || actionLoading) return;
    setActionLoading(key);
    const previous = displayedOutput;
    setOutput("");
    try {
      const accumulated = await streamGeneration(instruction);
      if (accumulated.trim()) {
        setFullVersion(accumulated);
        setShowingShort(false);
        setTranslatedPost(null);
        setTranslatedLang(null);
      } else {
        setOutput(previous);
        toast.error("No content returned.");
      }
    } catch (e: any) {
      setOutput(previous);
      toast.error(e?.message || "Variation failed");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Branded header */}
      <div style={{ marginBottom: 0 }}>
        <div style={{ fontSize: 10, letterSpacing: 2, color: "var(--ink-3)", marginBottom: 6, textTransform: "uppercase" }}>
          Your content engine
        </div>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 500, color: "var(--ink)", letterSpacing: "-0.02em", margin: 0 }}>
          Publish
        </h1>
        <p style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 8, lineHeight: 1.5, maxWidth: 640 }}>
          Create from your intelligence, not from templates — every post is grounded in your real signals
        </p>
      </div>
      <div className="flex flex-col lg:flex-row gap-6">
      {/* Main Editor */}
      <div className="flex-1 min-w-0 space-y-5">
        {/* Hero CTA — top signal */}
        {(() => {
          if (contentType === "flash" || contentType === "framework_summary") return null;
          const activeSignal = (selectedSignalId && _signals.find(s => s.id === selectedSignalId)) || _signals[0];
          if (!activeSignal) return null;
          const isCustomAngle = !!(selectedSignalTitle && selectedSignalTitle !== activeSignal.signal_title) || (!!topic && topic !== activeSignal.signal_title);
          const heroTitle = isCustomAngle ? topic : activeSignal.signal_title;
          return (
          <div
            id="aura-hero-cta"
            style={{
              background: "var(--ink)",
              borderRadius: 16,
              padding: 22,
              boxShadow: "var(--shadow-sm)",
              color: "#fff",
            }}
          >
            <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.55)", marginBottom: 10, fontWeight: 600 }}>
              {isCustomAngle ? "Selected post angle" : "Generate from your top signal"}
            </div>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 500, color: "#fff", lineHeight: 1.25, margin: 0 }}>
              {heroTitle}
            </h2>
            {isCustomAngle && (
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 6 }}>
                From signal: {activeSignal.signal_title} · {Math.round((activeSignal.confidence ?? 0) * 100)}%
              </div>
            )}
            <div style={{ fontSize: 12, color: "var(--brand)", marginTop: 8, fontWeight: 500 }}>
              {Math.round((activeSignal.confidence ?? 0) * 100)}% · {activeSignal.fragment_count ?? 0} findings · {activeSignal.unique_orgs ?? 0} organizations
            </div>
            <div className="flex flex-col sm:flex-row gap-2 mt-4">
              <AuraButton
                variant="primary"
                size="lg"
                loading={isGeneratingAny}
                onClick={() => {
                  const heroTopic = isCustomAngle ? topic : activeSignal.signal_title;
                  const heroContext = isCustomAngle ? context : (activeSignal.explanation || "");
                  if (!isCustomAngle) {
                    selectSuggestion(activeSignal.signal_title, activeSignal.explanation || "", "post", activeSignal.signal_title, activeSignal.explanation || "");
                    setSelectedSignalId(activeSignal.id);
                  }
                  generate({ topic: heroTopic, context: heroContext, contentType: "post", language: lang, framework });
                }}
                style={{ flex: 1, gap: 6, color: "#fff" }}
              >
                Generate post <ArrowRight className="w-4 h-4" />
              </AuraButton>
              <div className="flex gap-1 rounded-[10px] p-0.5" style={{ background: "rgba(255,255,255,0.08)" }}>
                <button
                  onClick={() => setLang("en")}
                  style={{
                    background: lang === "en" ? "rgba(255,255,255,0.15)" : "transparent",
                    color: lang === "en" ? "#fff" : "rgba(255,255,255,0.55)",
                    border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 500, cursor: "pointer",
                  }}
                >EN</button>
                <button
                  onClick={() => setLang("ar")}
                  style={{
                    background: lang === "ar" ? "rgba(255,255,255,0.15)" : "transparent",
                    color: lang === "ar" ? "#fff" : "rgba(255,255,255,0.55)",
                    border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 500, cursor: "pointer",
                  }}
                >العربية</button>
              </div>
            </div>
          </div>
          );
        })()}

        {/* Customize (collapsible) */}
        <Collapsible open={customizeOpen} onOpenChange={setCustomizeOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                fontWeight: 500,
                color: "var(--ink-4)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "4px 0",
              }}
            >
              Customize format & framework
              <ChevronDown
                className="w-3.5 h-3.5 transition-transform"
                style={{ transform: customizeOpen ? "rotate(180deg)" : "rotate(0deg)" }}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-5 pt-4">
        {/* Format Selector */}
        <div>
          <p className="text-label uppercase tracking-wider text-xs font-semibold mb-1">Content Format</p>
          <p className="text-[12px] text-muted-foreground mb-3">Choose your format — each one is tuned to your voice and sector</p>
          <div data-testid="pub-format-selector" className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(Object.entries(FORMAT_LABELS) as [ContentType, { label: string; icon: any; subtitle?: string }][]).map(([key, { label, icon: Icon, subtitle }]) => {
              const active = contentType === key;
              return (
                <button
                  key={key}
                  onClick={() => {
                    if (key === "carousel") {
                      navigate("/carousel-studio", {
                        state: {
                          topic: topic || undefined,
                          context: context || undefined,
                          signalId: selectedSignalId || undefined,
                          signalTitle: selectedSignalTitle || undefined,
                          lang,
                          autoGenerate: !!(topic && topic.trim()),
                        },
                      });
                      return;
                    }
                    setContentType(key);
                  }}
                  data-testid={key === "flash" ? "pub-flash-trigger" : undefined}
                  style={{
                    background: active ? "var(--vellum)" : "#fff",
                    borderRadius: 12,
                    padding: "12px 14px",
                    border: active ? "1.5px solid var(--brand)" : "0.5px solid rgba(0,0,0,0.07)",
                    boxShadow: "var(--shadow-sm)",
                    cursor: "pointer",
                    textAlign: "center",
                    transition: "box-shadow 0.15s, border-color 0.15s, background 0.15s",
                  }}
                  className="hover:shadow-md flex flex-col items-center"
                >
                  <span
                    className="flex items-center justify-center"
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      background: active ? "var(--bronze-mist)" : "var(--surface-subtle)",
                      color: active ? "var(--brand)" : "var(--ink-4)",
                      marginBottom: 6,
                    }}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: active ? "var(--brand)" : "var(--ink)", lineHeight: 1.2 }}>
                    {label}
                  </span>
                  {subtitle && (
                    <span style={{ fontSize: 9, color: "var(--ink-2)", marginTop: 2, fontFamily: "Cairo, sans-serif" }}>{subtitle}</span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-3">
            <button
              onClick={() => navigate("/carousel-studio", {
                state: {
                  topic,
                  context,
                  signalId: selectedSignalId || undefined,
                  signalTitle: selectedSignalTitle || undefined,
                  lang,
                  autoGenerate: !!(topic && topic.trim()),
                },
              })}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 14px", borderRadius: 10,
                background: "linear-gradient(135deg,#1C1812,#2A1F14)",
                color: "#D4B056", fontSize: 12, fontWeight: 600,
                border: "1px solid #D4B056", cursor: "pointer",
              }}
            >
              ✨ Carousel Studio
              <span style={{ opacity: 0.7, fontWeight: 400 }}>— viral, multi-style</span>
            </button>
          </div>
        </div>

        {/* Framework Builder Mode */}
        {contentType === "flash" ? (
          <FlashPanel />
        ) : contentType === "framework_summary" ? (
          <FrameworkBuilderInline
            initialTitle={topic}
            initialDescription={context}
          />
        ) : (
          <>
            {/* Framework Selector */}
            <div>
              <p className="text-label uppercase tracking-wider text-xs font-semibold mb-1">Framework</p>
              <p className="text-[12px] text-muted-foreground mb-2">Structural patterns that shape how your argument unfolds</p>
              <div className="flex flex-wrap gap-1.5">
                {FRAMEWORK_OPTIONS.map(fw => {
                  const active = framework === fw.key;
                  return (
                    <button
                      key={fw.key}
                      onClick={() => setFramework(fw.key)}
                      style={{
                        fontSize: 11,
                        fontWeight: 500,
                        padding: "5px 12px",
                        borderRadius: 20,
                        background: active ? "var(--ink)" : "#fff",
                        border: `0.5px solid ${active ? "var(--ink)" : "rgba(0,0,0,0.07)"}`,
                        color: active ? "#fff" : "var(--ink-3)",
                        cursor: "pointer",
                        transition: "background 0.15s, color 0.15s, border-color 0.15s",
                      }}
                    >
                      {fw.label}
                    </button>
                  );
                })}
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
              <Input
                data-testid="pub-topic-input"
                value={topic}
                onChange={(e) => {
                  const v = e.target.value;
                  setTopic(v);
                  if (trendPrefillLabel) setTrendPrefillLabel(null);
                  // If user diverges from the pre-filled signal topic, reset signal source
                  if (selectedSignalId && v.trim() !== (selectedSignalTitle || "").trim()) {
                    setSelectedSignalId(null);
                    setSelectedSignalTitle(null);
                    setSelectedSignalInsight(null);
                  }
                }}
                placeholder="e.g. Why AI-native organizations will outperform digital transformations"
                className="aura-create-input"
              />
            </div>

            {/* Context */}
            <div>
              <p className="text-label uppercase tracking-wider text-xs font-semibold mb-2">Context <span className="text-muted-foreground/50 normal-case">(optional)</span></p>
              <Textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="Add angles, data points, or frameworks to include…"
                className="aura-create-input min-h-[80px]"
              />
            </div>

            {/* Language */}
            <div className="flex items-center gap-3">
              <p className="text-label uppercase tracking-wider text-xs font-semibold">Language</p>
              <div data-testid="pub-lang-toggle" className="flex gap-1 bg-secondary/30 rounded-lg p-0.5 border border-border/10">
                <button onClick={() => setLang("en")} className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${lang === "en" ? "bg-primary text-primary-foreground" : "text-foreground"}`}>English</button>
                <button onClick={() => setLang("ar")} className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${lang === "ar" ? "bg-primary text-primary-foreground" : "text-foreground"}`}>العربية</button>
              </div>
            </div>

            {/* Generate */}
            <button
              id="aura-generate-btn"
              data-testid="pub-generate-btn"
              onClick={() => generate()}
              disabled={isGeneratingAny || !topic.trim()}
              className="aura-generate-btn w-full"
              style={{
                background: isGeneratingAny || !topic.trim() ? "var(--brand-pale)" : "var(--brand)",
                color: "var(--surface-ink)",
                border: "none",
                borderRadius: 12,
                padding: 14,
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 14,
                fontWeight: 600,
                cursor: isGeneratingAny || !topic.trim() ? "not-allowed" : "pointer",
                transition: "background 0.15s",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {generating ? "Generating…" : `Generate ${FORMAT_LABELS[contentType]?.label || "Content"}`}
            </button>
            {isGeneratingAny && showSlowHint && (
              <p style={{ fontSize: 12, color: "var(--ink-4)", textAlign: "center", marginTop: 8 }}>
                This usually takes 10–30 seconds…
              </p>
            )}

            {/* Output */}
            {displayedOutput && (
              <motion.div data-testid="pub-output" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-label uppercase tracking-wider text-xs font-semibold">
                    {showingShort ? "Short Version" : "Generated Content"}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button data-testid="pub-copy-btn" size="sm" variant="ghost" onClick={handleCopy} className="h-7 gap-1.5 text-xs">
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
                            .select("level, sector_focus, firm")
                            .eq("user_id", session.user.id)
                            .maybeSingle();

                          const generationParams = {
                            model: "google/gemini-3-flash-preview",
                            prompt_template_version: "v1",
                            signal_ids: selectedSignalId ? [selectedSignalId] : [],
                            signal_titles: selectedSignalTitle ? [selectedSignalTitle] : [],
                            source_signal_id: selectedSignalId,
                            identity_snapshot: {
                              role: profile?.level ?? null,
                              sector: profile?.sector_focus ?? null,
                              firm: profile?.firm ?? null,
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
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1.5 text-xs border-border/15"
                      onClick={() => {
                        const text = stripMarkdown(displayedOutput || output || fullVersion || shortVersion || "");
                        if (!text.trim()) { toast.error("Nothing to share"); return; }
                        shareToLinkedIn({
                          text,
                          mode: "feed",
                          toastMessage: "Post copied to clipboard — paste it in LinkedIn.",
                        });
                      }}
                    >
                      <Linkedin className="w-3 h-3" /> Post on LinkedIn →
                    </Button>
                  </div>
                </div>

                {/* Back to full version link */}
                {showingShort && !generatingShort && (
                  <button onClick={switchToFull} className="flex items-center gap-1 text-xs text-primary hover:underline">
                    <ChevronLeft className="w-3 h-3" /> Back to full version
                  </button>
                )}

                 <div
                   dir={lang === "ar" || isArabicText(displayedOutput) ? "rtl" : "ltr"}
                   className={`p-5 rounded-xl bg-secondary/20 border border-border/10 text-sm text-foreground/90 leading-relaxed max-h-[500px] overflow-y-auto ${
                     lang === "ar" || isArabicText(displayedOutput) ? "arabic-text" : ""
                   }`}
                 >
                  {renderMarkdown(displayedOutput)}
                  {isGeneratingAny && <span className="inline-block w-1.5 h-4 bg-primary/60 ml-1 animate-pulse rounded-sm" />}
                </div>

                {/* Generation attribution — connect post to user's real intelligence */}
                {!isGeneratingAny && (() => {
                  const sig = (selectedSignalId && _signals.find(s => s.id === selectedSignalId)) || _signals[0];
                  if (sig && (selectedSignalTitle || sig.signal_title)) {
                    const title = selectedSignalTitle || sig.signal_title;
                    const conf = Math.round((sig.confidence ?? 0) * 100);
                    return (
                      <div
                        className="text-[11px]"
                        style={{
                          color: "var(--ink-3)",
                          fontStyle: "italic",
                          paddingLeft: 2,
                          letterSpacing: "0.01em",
                        }}
                      >
                        Grounded in your <span style={{ color: "var(--brand)", fontStyle: "normal", fontWeight: 500 }}>{title}</span> signal · {conf}% confidence
                      </div>
                    );
                  }
                  return (
                    <div
                      className="text-[11px]"
                      style={{ color: "var(--ink-3)", fontStyle: "italic", paddingLeft: 2 }}
                    >
                      Based on your voice profile
                    </div>
                  );
                })()}

                {/* LinkedIn-style preview (collapsed by default) */}
                {!isGeneratingAny && (
                  <LinkedInFeedPreview text={stripMarkdown(displayedOutput || "")} language={lang} />
                )}

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

            {/* Visual companion is rendered below in its dedicated section */}

            {/* Quick Actions + Variations (visible after a post is generated) */}
            {displayedOutput && !isGeneratingAny && contentType === "post" && (
              <div className="space-y-4">
                {/* Quick Actions */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {[
                    { key: "shorter", label: "Shorter", icon: "✂", instruction: "Rewrite this post to be 40% shorter. Keep the hook and the key insight. Remove filler. Return only the rewritten post." },
                    { key: "bolder", label: "Bolder", icon: "⚡", instruction: "Make this post more provocative and contrarian. Add a specific challenge to conventional wisdom. Name a competitor or rival approach. Return only the rewritten post." },
                    { key: "data", label: "Add data", icon: "📊", instruction: "Add a specific statistic, number, or data point from the signal evidence. Place it where it creates the most impact. Return only the rewritten post." },
                    { key: "translate", label: "Translate", icon: "🌐", instruction: "" },
                  ].map((a) => {
                    const loading = actionLoading === a.key;
                    const disabled = !!actionLoading || isGeneratingAny;
                    return (
                      <button
                        key={a.key}
                        type="button"
                        disabled={disabled}
                        onClick={() => a.key === "translate" ? runTranslate() : runQuickAction(a.key, a.instruction)}
                        className="flex items-center gap-1.5 px-3.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                          height: 48,
                          background: "var(--vellum)",
                          border: "1px solid var(--brand-line)",
                          borderRadius: 8,
                          color: "var(--ink)",
                          fontSize: 13,
                          fontWeight: 500,
                        }}
                        onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.borderColor = "var(--brand)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--brand-line)"; }}
                      >
                        {loading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <span style={{ fontSize: 14 }}>{a.icon}</span>
                        )}
                        <span>{loading ? "Working…" : a.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Translation result alongside original */}
                {translatedPost !== null && translatedLang && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div
                      className="rounded-lg p-4"
                      style={{ background: "var(--vellum)", border: "1px solid var(--brand-line)" }}
                    >
                      <p className="text-[10px] uppercase tracking-[0.12em] mb-2" style={{ color: "var(--ink-3)" }}>
                        Original ({lang.toUpperCase()})
                      </p>
                      <div className="text-sm leading-relaxed" style={{ color: "var(--ink)" }}>
                        {renderMarkdown(displayedOutput)}
                      </div>
                    </div>
                    <div
                      className="rounded-lg p-4"
                      style={{ background: "var(--vellum)", border: "1px solid var(--brand-line)" }}
                      dir={translatedLang === "ar" ? "rtl" : "ltr"}
                    >
                      <p className="text-[10px] uppercase tracking-[0.12em] mb-2" style={{ color: "var(--ink-3)" }}>
                        {translatedLang.toUpperCase()}
                        {actionLoading === "translate" && <span className="ml-2 normal-case tracking-normal">translating…</span>}
                      </p>
                      <div className="text-sm leading-relaxed" style={{ color: "var(--ink)" }}>
                        {translatedPost ? renderMarkdown(translatedPost) : <span style={{ color: "var(--ink-3)" }}>…</span>}
                      </div>
                    </div>
                  </div>
                )}

                {/* Variations */}
                <div>
                  <div className="mb-2">
                    <p className="text-[10px] uppercase tracking-[0.12em] font-semibold" style={{ color: "var(--ink-2)" }}>
                      Variations
                    </p>
                    <p className="text-[11px]" style={{ color: "var(--ink-3)" }}>
                      Different angles on the same signal
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    {[
                      { key: "var-question", label: "Lead with a question", desc: "Open with a provocative question", instruction: "Rewrite this post so it opens with a single provocative question that challenges the reader. Keep the same insight and signal evidence. Return only the rewritten post." },
                      { key: "var-number", label: "Lead with a number", desc: "Open with a striking statistic", instruction: "Rewrite this post so it opens with a striking, specific statistic or number drawn from the signal evidence. Keep the same core insight. Return only the rewritten post." },
                      { key: "var-tension", label: "Lead with tension", desc: "Open with a contradiction", instruction: "Rewrite this post so it opens with a sharp contradiction or conflict between two competing ideas. Keep the same insight and signal evidence. Return only the rewritten post." },
                    ].map((v) => {
                      const loading = actionLoading === v.key;
                      const disabled = !!actionLoading || isGeneratingAny;
                      return (
                        <button
                          key={v.key}
                          type="button"
                          disabled={disabled}
                          onClick={() => runVariation(v.key, v.instruction)}
                          className="text-left p-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{
                            background: "var(--vellum)",
                            border: "1px solid var(--brand-line)",
                          }}
                          onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.borderColor = "var(--brand)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--brand-line)"; }}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            {loading && <Loader2 className="w-3 h-3 animate-spin" style={{ color: "var(--brand)" }} />}
                            <span className="text-[13px] font-medium" style={{ color: "var(--ink)" }}>
                              {v.label}
                            </span>
                          </div>
                          <p className="text-[11px]" style={{ color: "var(--ink-3)" }}>{v.desc}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Visual Companion — Branded Card or AI Schematic */}
            {displayedOutput && !isGeneratingAny && (
              <div className="rounded-xl border border-border/10 bg-card/60 backdrop-blur-sm">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/8">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-3.5 h-3.5 text-primary/60" />
                    <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/50 font-semibold">
                      Visual Companion
                    </p>
                  </div>
                  <div className="inline-flex rounded-md border border-border/15 overflow-hidden">
                    {([
                      { key: 'card', label: 'Branded Card' },
                      { key: 'schematic', label: 'AI Schematic' },
                    ] as const).map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setVisualMode(opt.key)}
                        className="px-2.5 h-7 text-[11px] font-medium transition-colors"
                        style={{
                          background: visualMode === opt.key ? "var(--brand)" : "transparent",
                          color: visualMode === opt.key ? "var(--ink-on-brand, #0d0d0d)" : "var(--muted-foreground)",
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                {visualMode === 'card' ? (
                  <div className="p-3">
                    <CardPreviewPanel
                      postText={displayedOutput}
                      topicLabel={topic}
                      language={lang}
                      authorName={
                        lang === 'ar'
                          ? (profileName || 'اسمك')
                          : (profileName || 'Your Name')
                      }
                      authorTitle={profileRole || 'Professional'}
                      recommendedStyle={cardRecommendation?.style}
                      recommendedType={cardRecommendation?.card_type}
                      recommendedHighlight={cardRecommendation?.highlight}
                    />
                  </div>
                ) : (
                  <SchematicPreviewPanel
                    postText={displayedOutput}
                    topicLabel={topic}
                    language={lang}
                    authorName={profileName || 'Author'}
                    authorTitle={profileRole || 'Professional'}
                  />
                )}
              </div>
            )}

            
          </>
        )}
          </CollapsibleContent>
        </Collapsible>
      </div>

      <StartFromPanel
        currentFormat={(contentType === "flash" ? "post" : contentType) as any}
        hasDraft={!!(topic.trim() || output)}
        onSelect={(t, ctx, fmt, sigTitle, sigInsight, sigId) => {
          selectSuggestion(t, ctx, fmt, sigTitle, sigInsight);
          if (sigId) setSelectedSignalId(sigId);
          // Bring the hero CTA into view so the user sees the loaded angle
          setTimeout(() => {
            document.getElementById("aura-hero-cta")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 50);
        }}
      />
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
  const [signalCount, setSignalCount] = useState<number | null>(null);
  const [captureCount, setCaptureCount] = useState<number | null>(null);

  useEffect(() => {
    loadSuggestions();
    (async () => {
      const [{ count: sc }, { count: cc }] = await Promise.all([
        supabase.from("strategic_signals" as any).select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("entries").select("id", { count: "exact", head: true }),
      ]);
      setSignalCount(sc || 0);
      setCaptureCount(cc || 0);
    })();
  }, []);

  const loadSuggestions = async () => {
    const { data } = await (supabase.from("narrative_suggestions" as any) as any).select("*").order("created_at", { ascending: false }).limit(20);
    setSuggestions(data || []);
    setLoading(false);
  };

  const generatePlan = async () => {
    setGenerating(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-authority-content`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ action: "generate_narrative_plan" }),
        signal: controller.signal,
      });
      if (!resp.ok) throw new Error("Generation failed");
      const data = await resp.json();
      const count = data.suggestions?.length || 0;
      if (count === 0) {
        toast("No suggestions generated — try capturing more content first.");
      } else {
        toast.success(`Generated ${count} narrative suggestions`);
        await loadSuggestions();
      }
    } catch (e: any) {
      if (e?.name === "AbortError") {
        toast.error("Plan generation timed out. Please try again.");
      } else {
        toast.error(e.message);
      }
    } finally {
      clearTimeout(timeoutId);
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
        <p className="text-sm text-muted-foreground">Plan your authority narrative based on signals and insights — sequence the moves that compound your influence.</p>
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
      const externalPosts = rows.filter((p: any) =>
        p.source_type === "linkedin_export" ||
        p.source_type === "external_reference"
      );
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
  const [distilling, setDistilling] = useState(false);
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

  const handleDistill = async () => {
    setDistilling(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) throw new Error("Not authenticated");

      const { data, error } = await supabase.functions.invoke("voice-distill", {
        body: { user_id: session.user.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("Voice profile updated — Aura learned from your posts");
    } catch (e: any) {
      console.error("Voice distill error:", e);
      toast.error(e.message || "Failed to distill voice");
    } finally {
      setDistilling(false);
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

      <div className="mt-4 pt-4 border-t border-border/10">
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-2 text-xs border-border/15"
          onClick={handleDistill}
          disabled={distilling}
        >
          {distilling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {distilling ? "Analyzing your posts..." : "Distill voice from my posts"}
        </Button>
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
  post_short: { label: "Short", cls: "bg-[#B08D3A]/15 text-[#B08D3A] border-[#B08D3A]/20" },
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
              <p
                className={`text-sm text-foreground leading-snug line-clamp-3 ${isArabicText(p.post_text) ? "arabic-text" : ""}`}
                dir={isArabicText(p.post_text) ? "rtl" : "auto"}
              >
                {p.post_text || "Untitled"}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-muted-foreground/40">Aura Draft</span>
              </div>
              {p.source_metadata?.signal_titles?.[0] && (
                <p className="text-[10px] text-muted-foreground/40 mt-1 line-clamp-1">From signal: {p.source_metadata.signal_titles[0]}</p>
              )}
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
              {p.source_metadata?.signal_titles?.[0] && (
                <p className="text-[10px] text-muted-foreground/40 mt-0.5 line-clamp-1">From signal: {p.source_metadata.signal_titles[0]}</p>
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
        style={{ borderLeft: "1px solid var(--ink-7)", paddingLeft: 12, marginBottom: expanded ? 12 : 0, background: "none", border: "none", cursor: "pointer", borderLeftWidth: 1, borderLeftStyle: "solid", borderLeftColor: "var(--ink-7)" }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-7)", margin: 0 }}>
            Frameworks
          </h3>
          <span style={{ fontFamily: "var(--font-display, 'Cormorant Garamond')", fontSize: 13, fontStyle: "italic", color: "var(--ink-3)", lineHeight: 1.4 }}>
            Reusable thinking models for your content
          </span>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, backgroundColor: "var(--bg-subtle)", color: "var(--color-muted)" }}>
          {frameworks.length}
        </span>
        <ChevronDown
          className="ml-auto transition-transform duration-200 group-hover:text-primary"
          style={{ width: 16, height: 16, color: "var(--ink-5)", transform: expanded ? "rotate(0deg)" : "rotate(-90deg)" }}
        />
      </button>
      {expanded && (
        <div style={{ display: "grid", gap: 12 }}>
          <CollapsibleList
            items={frameworks}
            visibleCount={3}
            label="frameworks"
            renderItem={(fw) => {
            const isApproved = fw.tags?.includes("Approved");
            return (
              <div
                key={fw.id}
                style={{ background: "var(--bg-card)", borderRadius: 8, padding: 16, border: "1px solid var(--color-border)", transition: "border-color 0.2s", marginBottom: 12 }}
                className="hover:border-[rgba(255,255,255,0.08)]"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p style={{ fontSize: 14, fontWeight: 700, color: "var(--ink-7)", lineHeight: 1.4 }} className="line-clamp-1">{fw.title}</p>
                    {fw.summary && (
                      <>
                        <p style={{ fontSize: 13, color: "var(--color-muted)", lineHeight: 1.5, marginTop: 4 }} className={expandedCards.has(fw.id) ? "" : "line-clamp-2"}>{fw.summary}</p>
                        {fw.summary.split("\n").length > 2 || fw.summary.length > 120 ? (
                          <button
                            onClick={() => toggleCardExpand(fw.id)}
                            style={{ fontSize: 13, color: "var(--brand)", background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 4 }}
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
                    backgroundColor: isApproved ? "var(--success-pale)" : "var(--bg-subtle)",
                    color: isApproved ? "var(--success)" : "var(--color-muted)",
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
                      style={{ fontSize: 12, fontWeight: 500, padding: "4px 8px", borderRadius: 6, backgroundColor: "transparent", color: "var(--danger)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                      className="hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
            }}
          />
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

/* ── LinkedIn feed-card preview (M-1-1) ── */
const LinkedInPreview = ({
  text,
  profile,
}: {
  text: string | null;
  profile: { first_name?: string | null; level?: string | null; avatar_url?: string | null } | null;
}) => {
  if (!text) return null;
  const lines = text.split("\n").slice(0, 3).join("\n");
  const showMore = text.length > lines.length;
  const name = profile?.first_name || "You";
  const level = profile?.level || "Executive";
  const initial = (name[0] || "?").toUpperCase();
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e6e6e6",
        borderRadius: 8,
        padding: 12,
        marginBottom: 10,
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: "#1d2226",
      }}
      aria-label="LinkedIn feed preview"
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt="" style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover" }} />
        ) : (
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#0a66c2", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 600 }}>
            {initial}
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>{name}</div>
          <div style={{ fontSize: 11, color: "#666", lineHeight: 1.2 }}>{level} · now</div>
        </div>
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.45, whiteSpace: "pre-wrap" }} dir="auto">
        {lines}
        {showMore && <span style={{ color: "#666" }}> …see more</span>}
      </div>
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
  // M-1-1: confirm-publish + URL tracking + preview
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [urlDrafts, setUrlDrafts] = useState<Record<string, string>>({});
  const [savedUrls, setSavedUrls] = useState<Record<string, string>>({});
  const [signalTitleMap, setSignalTitleMap] = useState<Record<string, string>>({});
  const [profile, setProfile] = useState<{ first_name?: string | null; level?: string | null; avatar_url?: string | null } | null>(null);

  useEffect(() => { loadPosts(); loadProfile(); }, []);

  const loadProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await (supabase.from("diagnostic_profiles" as any) as any)
      .select("first_name, level, avatar_url")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) setProfile(data);
  };

  const loadPosts = async () => {
    setLoading(true);
    const [liRes, ciRes] = await Promise.all([
      supabase
        .from("linkedin_posts")
        .select("id, title, post_text, format_type, tracking_status, topic_label, created_at, source_metadata, source_type, published_at, linkedin_url, source_signal_id")
        .neq("source_type", "aura_generated")
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
    const urls: Record<string, string> = {};
    (liRes.data || []).forEach((p: any) => { if (p.linkedin_url) urls[p.id] = p.linkedin_url; });
    setSavedUrls(urls);

    // Resolve signal titles for cards that reference a source signal id
    const signalIds = new Set<string>();
    (liRes.data || []).forEach((p: any) => { if (p.source_signal_id) signalIds.add(p.source_signal_id); });
    (ciRes.data || []).forEach((ci: any) => {
      const sid = ci.generation_params?.source_signal_id || ci.generation_params?.signal_ids?.[0];
      if (sid) signalIds.add(sid);
    });
    if (signalIds.size > 0) {
      const { data: sigRows } = await (supabase.from("strategic_signals" as any) as any)
        .select("id, signal_title")
        .in("id", Array.from(signalIds));
      const map: Record<string, string> = {};
      (sigRows || []).forEach((s: any) => { if (s?.id && s?.signal_title) map[s.id] = s.signal_title; });
      setSignalTitleMap(map);
    } else {
      setSignalTitleMap({});
    }
    setLoading(false);
  };

  const handleCopy = async (id: string, text: string) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
      window.open("https://www.linkedin.com/feed/", "_blank", "noopener,noreferrer");
      toast.success("Copied. LinkedIn opened in a new tab.");
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
          source_signal_id: (item.source_metadata as any)?.source_signal_id
            || (item.source_metadata?.signal_ids?.[0])
            || null,
          enriched_by: [],
          synced_at: new Date().toISOString(),
        });
      if (error) throw error;
      await supabase
        .from("content_items")
        .update({ status: "published" })
        .eq("id", id);
      setDrafts(prev => prev.filter(p => p.id !== id));
      toast.success("Published — this post now contributes to your authority score", { duration: 4000 });
      loadPosts();
    } catch (e: any) {
      toast.error(e.message || "Failed to mark as published");
    }
  };

  const saveLinkedInUrl = async (postId: string, url: string) => {
    const trimmed = url.trim();
    if (!trimmed.startsWith("https://www.linkedin.com/")) {
      toast.error("URL must start with https://www.linkedin.com/");
      return;
    }
    const { error } = await supabase
      .from("linkedin_posts")
      .update({ linkedin_url: trimmed, published_confirmed_at: new Date().toISOString() })
      .eq("id", postId);
    if (error) { toast.error("Could not save URL"); return; }
    setSavedUrls(prev => ({ ...prev, [postId]: trimmed }));
    setUrlDrafts(prev => { const n = { ...prev }; delete n[postId]; return n; });
    toast.success("URL linked — engagement data will connect to this post");
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
        <EmptyState
          icon={PenTool}
          title="No content yet."
          description="Start by creating a post, carousel, or essay on the Create tab."
          ctaLabel="Go to Create"
          ctaAction={onSwitchToCreate}
        />
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
          style={{ borderLeft: "1px solid var(--brand)", paddingLeft: 12, marginBottom: showDrafts ? 12 : 0, background: "none", border: "none", cursor: "pointer", borderLeftWidth: 1, borderLeftStyle: "solid", borderLeftColor: "var(--brand)" }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--brand)", margin: 0 }}>
              Your Drafts
            </h3>
            <span style={{ fontFamily: "var(--font-display, 'Cormorant Garamond')", fontSize: 13, fontStyle: "italic", color: "var(--ink-3)", lineHeight: 1.4 }}>
              Posts waiting to become authority — each one is already signal-grounded and voice-matched
            </span>
          </div>
          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, backgroundColor: "var(--bg-subtle)", color: "var(--brand)" }}>
            {drafts.length}
          </span>
          <ChevronDown
            className="ml-auto transition-transform duration-200 group-hover:text-primary"
            style={{ width: 16, height: 16, color: "var(--brand)", transform: showDrafts ? "rotate(0deg)" : "rotate(-90deg)" }}
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
                    borderLeft: "2px solid var(--brand)",
                    borderRadius: 8,
                    padding: 16,
                    border: "1px solid var(--color-border)",
                    borderLeftWidth: 2,
                    borderLeftColor: "var(--brand)",
                    transition: "all 0.2s",
                  }}
                  className="hover:bg-muted/20 hover:border-l-brand"
                >
                  {/* LinkedIn preview (M-1-1) */}
                  <LinkedInPreview text={p.post_text} profile={profile} />

                  {/* Body text */}
                  <p style={{ fontSize: 14, color: "var(--color-foreground, var(--ink-7))", lineHeight: 1.6 }} className={expandedCards.has(p.id) ? "" : "line-clamp-4"} dir="auto">
                    {p.post_text || "Untitled draft"}
                  </p>
                  {(p.post_text?.split("\n").length || 0) > 4 || (p.post_text?.length || 0) > 280 ? (
                    <button
                      onClick={() => toggleCardExpand(p.id)}
                      style={{ fontSize: 13, color: "var(--brand)", background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 4 }}
                      className="hover:underline"
                    >
                      {expandedCards.has(p.id) ? "Show less" : "Read more"}
                    </button>
                  ) : null}

                  {/* Source signal label */}
                  {(() => {
                    const sid = (p.source_metadata as any)?.source_signal_id || (p.source_metadata as any)?.signal_ids?.[0];
                    const titleFromMeta = (p.source_metadata as any)?.signal_titles?.[0];
                    const title = titleFromMeta || (sid ? signalTitleMap[sid] : null);
                    if (!title) return null;
                    return (
                      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 8, fontSize: 11, color: "var(--color-muted)" }}>
                        <Lightbulb className="w-3 h-3" style={{ color: "var(--brand)" }} />
                        <span className="line-clamp-1">From signal: {title}</span>
                      </div>
                    );
                  })()}

                  {/* Badge row */}
                  <div className="flex items-center flex-wrap" style={{ gap: 8, marginTop: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, backgroundColor: "var(--bg-subtle)", color: "var(--color-muted)", textTransform: "uppercase" }}>
                      {lang === "ar" ? "AR" : "EN"}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, backgroundColor: "var(--bg-subtle)" }} className={badge.cls.includes("text-") ? badge.cls.split(" ").filter(c => c.startsWith("text-")).join(" ") : "text-muted-foreground"}>
                      {badge.label}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, backgroundColor: "var(--warning-pale)", color: "var(--warning)" }}>
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
                      {copiedId === p.id ? <Check className="w-3.5 h-3.5" /> : <Linkedin className="w-3.5 h-3.5" />}
                      {copiedId === p.id ? "Copied" : "Copy to LinkedIn"}
                    </button>
                    <button
                      onClick={() => setConfirmingId(p.id)}
                      style={{ fontSize: 13, color: "var(--color-muted)", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
                      className="hover:text-foreground transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" /> Mark as Published
                    </button>
                    <button
                      onClick={() => setPendingDeleteId(p.id)}
                      style={{ fontSize: 13, color: "var(--danger)", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                      className="hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Inline confirmation (M-1-1) */}
                  {confirmingId === p.id && (
                    <div style={{ marginTop: 12, padding: 10, background: "var(--bg-subtle)", borderRadius: 6, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, color: "var(--ink)" }}>Did you publish this on LinkedIn?</span>
                      <div style={{ flex: 1 }} />
                      <button
                        onClick={async () => { setConfirmingId(null); await markPublished(p.id); }}
                        style={{ fontSize: 12, fontWeight: 600, color: "#fff", background: "var(--brand)", border: 0, borderRadius: 4, padding: "5px 10px", cursor: "pointer" }}
                      >Yes, it's live</button>
                      <button
                        onClick={() => setConfirmingId(null)}
                        style={{ fontSize: 12, color: "var(--color-muted)", background: "transparent", border: 0, cursor: "pointer" }}
                      >Not yet</button>
                    </div>
                  )}
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
          style={{ borderLeft: "1px solid var(--ink-7)", paddingLeft: 12, marginBottom: showPublished ? 12 : 0, background: "none", border: "none", cursor: "pointer", borderLeftWidth: 1, borderLeftStyle: "solid", borderLeftColor: "var(--ink-7)" }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-7)", margin: 0 }}>
              Published Posts
            </h3>
            <span style={{ fontFamily: "var(--font-display, 'Cormorant Garamond')", fontSize: 13, fontStyle: "italic", color: "var(--ink-3)", lineHeight: 1.4 }}>
              Your published authority trail — engagement data flows back to strengthen your signals
            </span>
          </div>
          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, backgroundColor: "var(--bg-subtle)", color: "var(--color-muted)" }}>
            {publishedPosts.length}
          </span>
          <ChevronDown
            className="ml-auto transition-transform duration-200 group-hover:text-primary"
            style={{ width: 16, height: 16, color: "var(--ink-5)", transform: showPublished ? "rotate(0deg)" : "rotate(-90deg)" }}
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
              const isExternal = (p as any).source_type === "external_reference"
                || (p.source_metadata as any)?.source_type === "external_reference";
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
                      <p style={{ fontSize: 14, color: "var(--color-foreground, var(--ink-7))", lineHeight: 1.5 }} className={expandedCards.has(p.id) ? "" : "line-clamp-2"} dir="auto">
                        {p.post_text}
                      </p>
                      {(p.post_text?.split("\n").length || 0) > 2 || (p.post_text?.length || 0) > 140 ? (
                        <button
                          onClick={() => toggleCardExpand(p.id)}
                          style={{ fontSize: 13, color: "var(--brand)", background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 4 }}
                          className="hover:underline"
                        >
                          {expandedCards.has(p.id) ? "Show less" : "Read more"}
                        </button>
                      ) : null}
                      {p.topic_label && (
                        <p style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 4 }} className="line-clamp-1">{p.topic_label}</p>
                      )}
                      {(() => {
                        const sid = (p as any).source_signal_id || (p.source_metadata as any)?.source_signal_id || (p.source_metadata as any)?.signal_ids?.[0];
                        const titleFromMeta = (p.source_metadata as any)?.signal_titles?.[0];
                        const title = titleFromMeta || (sid ? signalTitleMap[sid] : null);
                        if (!title) return null;
                        return (
                          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6, fontSize: 11, color: "var(--color-muted)" }}>
                            <Lightbulb className="w-3 h-3" style={{ color: "var(--brand)" }} />
                            <span className="line-clamp-1">From signal: {title}</span>
                          </div>
                        );
                      })()}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, backgroundColor: "var(--bg-subtle)" }} className={badge.cls.includes("text-") ? badge.cls.split(" ").filter(c => c.startsWith("text-")).join(" ") : "text-muted-foreground"}>
                        {badge.label}
                      </span>
                      {isExternal ? (
                        <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, backgroundColor: "rgba(59,130,246,0.15)", color: "rgb(96,165,250)" }}>
                          LinkedIn
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, backgroundColor: "var(--success-pale)", color: "var(--success)" }}>
                          Published
                        </span>
                      )}
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
                      {copiedId === p.id ? <Check className="w-3.5 h-3.5" /> : <Linkedin className="w-3.5 h-3.5" />}
                      {copiedId === p.id ? "Copied" : "Copy to LinkedIn"}
                    </button>
                    <button
                      onClick={() => setPendingDeleteId(p.id)}
                      style={{ fontSize: 13, color: "var(--danger)", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                      className="hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* LinkedIn URL tracker (M-1-1) */}
                  {p._source === "linkedin_posts" && (
                    savedUrls[p.id] ? (
                      <div style={{ marginTop: 10, fontSize: 12, color: "var(--success)", display: "flex", alignItems: "center", gap: 6 }}>
                        <Check className="w-3 h-3" /> URL linked ✓ —{" "}
                        <a href={savedUrls[p.id]} target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand)", textDecoration: "underline" }}>
                          view on LinkedIn
                        </a>
                      </div>
                    ) : (
                      <div style={{ marginTop: 10, display: "flex", gap: 6, alignItems: "center" }}>
                        <input
                          type="url"
                          placeholder="Paste your LinkedIn post URL to track performance"
                          value={urlDrafts[p.id] || ""}
                          onChange={(e) => setUrlDrafts(prev => ({ ...prev, [p.id]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === "Enter") saveLinkedInUrl(p.id, urlDrafts[p.id] || ""); }}
                          maxLength={500}
                          style={{ flex: 1, fontSize: 12, padding: "6px 10px", borderRadius: 4, border: "1px solid var(--color-border)", background: "var(--bg-subtle)", color: "var(--ink)" }}
                        />
                        <button
                          onClick={() => saveLinkedInUrl(p.id, urlDrafts[p.id] || "")}
                          disabled={!urlDrafts[p.id]?.trim()}
                          aria-label="Save LinkedIn URL"
                          style={{ background: "var(--brand)", color: "#fff", border: 0, borderRadius: 4, padding: "6px 8px", cursor: "pointer", display: "inline-flex", alignItems: "center", opacity: urlDrafts[p.id]?.trim() ? 1 : 0.5 }}
                        >
                          <Save className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )
                  )}
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
  { key: "plan", label: "Plan", icon: Calendar },
  { key: "create", label: "Create", icon: PenTool },
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
      <FirstVisitHint page="publish" />
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

      

      <div
        className="inline-flex"
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 4,
          boxShadow: "var(--shadow-sm)",
          border: "0.5px solid rgba(0,0,0,0.07)",
          gap: 2,
        }}
      >
        {TABS.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              data-testid={`pub-tab-${tab.key}`}
              data-active={active ? "true" : "false"}
              style={{
                fontSize: 12,
                padding: "6px 16px",
                borderRadius: 9,
                border: "none",
                cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
                background: active ? "var(--brand)" : "transparent",
                color: active ? "#fff" : "var(--ink-4)",
                fontWeight: active ? 600 : 500,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                transition: "background 0.15s, color 0.15s",
              }}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "create" && <CreateTab planPrefill={planPrefill} signalPrefill={signalPrefill} onSignalPrefillConsumed={onSignalPrefillConsumed} />}
      {activeTab === "plan" && <PlanTab onGenerateFromPlan={handleGenerateFromPlan} />}
      {activeTab === "library" && <LibraryTab onSwitchToCreate={() => setActiveTab("create")} />}
    </div>
  );
};

export default AuthorityTab;
