import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { track } from "@/lib/track";
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { AuraButton } from "@/components/ui/AuraButton";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { EMPTY_STATE } from "@/constants/language";
import {
  Loader2, Save, X, Send, Copy, Check, Trash2, Search,
  PenTool, LayoutGrid, FileText, BookOpen, Lightbulb,
  Sparkles, Zap, Target, ArrowRight, Layers,
  Calendar, TrendingUp, BarChart3, ChevronLeft, ChevronDown, Image as ImageIcon, Download, Pencil
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Linkedin, Newspaper } from "lucide-react";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { FirstTimeHint } from "@/components/FirstTimeHint";
import { shareToLinkedIn } from "@/lib/shareLinkedIn";
import LinkedInPostSteps from "@/components/LinkedInPostSteps";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatSmartDate } from "@/lib/formatDate";
import { isArabicText } from "@/lib/utils";
import FrameworkBuilderInline from "@/components/FrameworkBuilderInline";
import CardPreviewPanel from "@/components/visual-cards/CardPreviewPanel";

import StartFromPanel from "@/components/StartFromPanel";
import FirstVisitHint from "@/components/ui/FirstVisitHint";
import { isPublishedPost } from "@/lib/postProvenance";
import { markSuggestionDrafted } from "@/lib/markSuggestionDrafted";
import FlashPanel from "@/components/FlashPanel";
import EmptyState from "@/components/ui/EmptyState";
import { AuraLogo } from "@/components/brand/AuraLogo";
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
  { key: "slap", label: "Statement → Link → Angle → Proof" },
  { key: "bab", label: "Before → After → Bridge" },
  { key: "pas", label: "Problem → Agitate → Solve" },
  { key: "wwh", label: "What → Why → How" },
  { key: "chef", label: "Context → Hypothesis → Evidence → Future" },
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
  source?: string;
  moveState?: string;
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

interface DraftPrefill {
  id: string;
  body: string;
  language: "en" | "ar";
  type: "carousel" | "framework" | "linkedin_post";
  topic?: string | null;
  _source?: "content_items" | "linkedin_posts";
}

/**
 * Shared core for marking a post as published.
 * Used by both the Library "mark published" flow (existing drafts) AND
 * the Create-view "Mark as published" flow (no draft row yet).
 *
 * - Validates an optional LinkedIn URL.
 * - Inserts a published linkedin_posts row.
 * - Appends the published text to the user's voice example library (best-effort).
 * - Triggers a non-blocking aura-score recalc.
 *
 * Throws on validation / insert errors so callers can surface a toast.
 */
async function insertPublishedLinkedInPost(opts: {
  userId: string;
  postText: string;
  formatType?: string | null;
  sourceMetadata?: any;
  sourceSignalId?: string | null;
  url?: string | null;
  language?: "en" | "ar";
  frameworkType?: string | null;
}): Promise<void> {
  const { userId, postText, formatType, sourceMetadata, sourceSignalId, url, frameworkType } = opts;
  const lang: "en" | "ar" = opts.language === "ar" ? "ar" : "en";
  let cleanUrl: string | null = null;
  if (url) {
    const trimmed = url.trim();
    if (trimmed && !/^https?:\/\/(www\.)?linkedin\.com\//i.test(trimmed)) {
      throw new Error("URL must be a linkedin.com link");
    }
    cleanUrl = trimmed || null;
  }
  const { error } = await supabase
    .from("linkedin_posts")
    .insert({
      user_id: userId,
      post_text: postText || "",
      format_type: formatType || "post",
      tracking_status: "published",
      source_type: "aura_generated",
      authorship: "aura_drafted",
      acquisition: "published_via_aura",
      published_at: new Date().toISOString(),
      // Canonical URL column read by the archive, metric-matching, and open-link UI.
      post_url: cleanUrl,
      published_confirmed_at: cleanUrl ? new Date().toISOString() : null,
      like_count: 0,
      comment_count: 0,
      repost_count: 0,
      engagement_score: 0,
      source_trust: 100,
      source_metadata: { ...(sourceMetadata || {}), _language: (lang === "ar" || isArabicText(postText)) ? "ar" : "en" },
      source_signal_id: sourceSignalId || null,
      framework_type: frameworkType ?? null,
      enriched_by: [],
      synced_at: new Date().toISOString(),
    });
  if (error) throw error;

  // Voice learning loop — best-effort
  try {
    if (postText && postText.length > 50) {
      const { data: voiceProfile } = await supabase
        .from("authority_voice_profiles")
        .select("example_posts")
        .eq("user_id", userId)
        .eq("language", lang)
        .maybeSingle();
      const existingExamples = Array.isArray(voiceProfile?.example_posts)
        ? (voiceProfile!.example_posts as any[])
        : [];
      const updatedExamples = [...existingExamples, postText].slice(-10);
      if (voiceProfile) {
        await supabase
          .from("authority_voice_profiles")
          .update({ example_posts: updatedExamples })
          .eq("user_id", userId)
          .eq("language", lang);
      } else {
        const { data: anyRow } = await supabase
          .from("authority_voice_profiles")
          .select("id")
          .eq("user_id", userId)
          .limit(1);
        const isFirst = !anyRow || anyRow.length === 0;
        await supabase
          .from("authority_voice_profiles")
          .insert({ user_id: userId, example_posts: updatedExamples, language: lang, is_primary: isFirst });
      }
    }
  } catch (voiceErr) {
    console.warn("voice profile update failed:", voiceErr);
  }

  // Non-blocking score recalc
  invokeEdgeFunction("calculate-aura-score", { body: { user_id: userId } })
    .catch((e) => console.error("calculate-aura-score failed:", e));
}

const CreateTab = ({ planPrefill, signalPrefill, onSignalPrefillConsumed, draftPrefill, onDraftPrefillConsumed, onGoToLibrary }: { planPrefill?: PlanPrefill | null; signalPrefill?: SignalPrefill | null; onSignalPrefillConsumed?: () => void; draftPrefill?: DraftPrefill | null; onDraftPrefillConsumed?: () => void; onGoToLibrary?: () => void }) => {
  const navigate = useNavigate();
  const [topic, setTopic] = useState("");
  const [context, setContext] = useState("");
  const [contentType, setContentType] = useState<ContentType>("post");
  const [trendPrefillLabel, setTrendPrefillLabel] = useState<string | null>(null);
  const [framework, setFramework] = useState<ContentFramework>("auto");
  const [lang, setLang] = useState<"en" | "ar">("en");
  const [output, setOutput] = useState("");
  const [sigPresets, setSigPresets] = useState<{ id: string; name: string; text_en: string; text_ar: string }[]>([]);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [editingDraftSavedAt, setEditingDraftSavedAt] = useState<string | null>(null);
  const [editingSource, setEditingSource] = useState<"content_items" | "linkedin_posts">("content_items");
  const [isEditingBody, setIsEditingBody] = useState(false);
  const [ghostMeta, setGhostMeta] = useState<{
    finding_source: string | null;
    finding_url: string | null;
    finding_implication: string | null;
  } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [showSlowHint, setShowSlowHint] = useState(false);
  const [copied, setCopied] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  // Mark-as-published (Create view) — lets users close the loop without saving a draft first.
  const [publishing, setPublishing] = useState(false);
  const [publishedFromCreate, setPublishedFromCreate] = useState(false);
  const [publishingLive, setPublishingLive] = useState(false);
  // Post-publish confirmation state — surfaces the returned post_url, time,
  // and originating signal so the composer never falls silent after a live publish.
  const [publishedInfo, setPublishedInfo] = useState<
    { url: string | null; publishedAt: string; signalId: string | null; signalTitle: string | null } | null
  >(null);
  const [confirmLiveOpen, setConfirmLiveOpen] = useState(false);
  const [attachedImageUrl, setAttachedImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [pubUrlOpen, setPubUrlOpen] = useState(false);
  const [pubUrl, setPubUrl] = useState("");
  const [pubUrlError, setPubUrlError] = useState("");
  const [confirmPubUrl, setConfirmPubUrl] = useState("");
  const [confirmPubUrlError, setConfirmPubUrlError] = useState("");
  const [selectedSignalId, setSelectedSignalId] = useState<string | null>(null);
  const [selectedSignalTitle, setSelectedSignalTitle] = useState<string | null>(null);
  const [selectedSignalInsight, setSelectedSignalInsight] = useState<string | null>(null);
  const [generationTimestamp, setGenerationTimestamp] = useState<string | null>(null);
  const [voiceWords, setVoiceWords] = useState<string[]>([]);
  const [preferredStructures, setPreferredStructures] = useState<string[]>([]);
  const [profileName, setProfileName] = useState<string>("");
  const [profileRole, setProfileRole] = useState<string>("");
  const [profileLoaded, setProfileLoaded] = useState<boolean>(false);
  // Race-fix: hold the most recently requested signal_id so a generate()
  // fired immediately after signalPrefill arrives can't outrun React state.
  const pendingSignalIdRef = useRef<string | null>(null);
  const [planRef, setPlanRef] = useState<string | null>(null);

  // Short version state
  const [fullVersion, setFullVersion] = useState("");
  const [shortVersion, setShortVersion] = useState("");
  const [showingShort, setShowingShort] = useState(false);
  const [generatingShort, setGeneratingShort] = useState(false);

  // Visual companion state
  // Visual companion is card-only.
  const [cardRecommendation, setCardRecommendation] = useState<any>(null);

  // Quick actions / variations state
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [translatedPost, setTranslatedPost] = useState<string | null>(null);
  const [translatedLang, setTranslatedLang] = useState<"en" | "ar" | null>(null);

  function validateLinkedInUrl(url: string): string {
    const trimmed = url.trim();
    if (trimmed && !trimmed.toLowerCase().includes("linkedin.com/")) {
      return "That doesn't look like a LinkedIn link";
    }
    return "";
  }

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

  // Quality gate from generate-authority-content response
  const [qualityGate, setQualityGate] = useState<{
    overall_score: number;
    pass: boolean;
    scores: { hook?: number; voice?: number; specificity?: number; structure?: number; signal_depth?: number; language_quality?: number };
    verdict?: string;
    weaknesses?: string[];
    skipped?: boolean;
  } | null>(null);
  const [provenanceOpen, setProvenanceOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia?.("(min-width: 768px)").matches ?? true;
  });

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

  // Load signature presets
  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) return;
        const { data } = await supabase.from("diagnostic_profiles").select("signature_presets").eq("user_id", session.user.id).maybeSingle();
        if (Array.isArray((data as any)?.signature_presets)) setSigPresets((data as any).signature_presets);
      } catch { /* ignore */ }
    })();
  }, []);



  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid) return;
      Promise.all([
        supabase.from("strategic_signals").select("id, signal_title, explanation, content_opportunity, confidence, strategic_implications, fragment_count, unique_orgs, theme_tags")
          .eq("status", "active").gte("confidence", 0.6).order("confidence", { ascending: false }).limit(5),
        supabase.from("master_frameworks").select("id, title, summary, tags").order("created_at", { ascending: false }).limit(5),
        supabase.from("authority_voice_profiles").select("vocabulary_preferences, example_posts, preferred_structures").eq("user_id", uid).eq("language", lang).limit(1).maybeSingle(),
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
        setProfileLoaded(true);
      });
    })();
  }, [lang]);

  const insertSignature = (presetId: string) => {
    const p = sigPresets.find((x) => x.id === presetId);
    if (!p) return;
    const text = (lang === "ar" ? p.text_ar : p.text_en) || "";
    if (!text.trim()) return;
    setOutput((prev) => (prev && prev.trim() ? prev.replace(/\s+$/, "") + "\n\n" : "") + text.trim());
  };

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
      track("composer_opened", {
        source: signalPrefill.source ?? "signal_prefill",
        signal_id: signalPrefill.signalId ?? null,
        move_state: signalPrefill.moveState ?? null,
      });
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
      pendingSignalIdRef.current = signalPrefill.signalId || null;
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

  // Apply draft prefill — opens an existing content_items draft in the editor.
  // Mirrors the signalPrefill channel: hydrate state, then notify parent to clear.
  const hydrateDraftSignal = async (sigId: string) => {
    try {
      const { data: sig } = await supabase
        .from("strategic_signals")
        .select("signal_title, explanation, what_it_means_for_you")
        .eq("id", sigId)
        .maybeSingle();
      if (!sig) return;
      setSelectedSignalId(sigId);
      pendingSignalIdRef.current = sigId;
      setSelectedSignalTitle((sig as any).signal_title || null);
      setSelectedSignalInsight(((sig as any).what_it_means_for_you || (sig as any).explanation) || null);
      setTopic(prev => (prev && prev.trim()) ? prev : ((sig as any).signal_title || ""));
    } catch { /* silent — never blank the editor */ }
  };
  useEffect(() => {
    if (draftPrefill) {
      track("composer_opened", {
        source: "draft_prefill",
        signal_id: null,
        move_state: "drafted",
      });
      const mappedType: ContentType =
        draftPrefill.type === "carousel" ? "carousel" :
        draftPrefill.type === "framework" ? "framework_summary" :
        "post";
      setEditingDraftId(draftPrefill.id);
      setEditingSource(draftPrefill._source === "linkedin_posts" ? "linkedin_posts" : "content_items");
      // Detect Overnight ghost draft to render provenance strip above editor.
      setGhostMeta(null);
      setEditingDraftSavedAt(null);
      if (draftPrefill._source === "linkedin_posts") {
        (async () => {
          try {
            const { data } = await supabase
              .from("linkedin_posts")
              .select("source_metadata, source_signal_id, created_at")
              .eq("id", draftPrefill.id)
              .maybeSingle();
            const meta: any = (data as any)?.source_metadata || {};
            if (meta?.ghost_draft === true || String(meta?.ghost_draft) === "true") {
              setGhostMeta({
                finding_source: meta.finding_source ?? null,
                finding_url: meta.finding_url ?? null,
                finding_implication: meta.finding_implication ?? null,
              });
            }
            if ((data as any)?.created_at) setEditingDraftSavedAt((data as any).created_at);
            const sigId = (data as any)?.source_signal_id || null;
            if (sigId) await hydrateDraftSignal(sigId);
          } catch { /* silent — strip just won't render */ }
        })();
      } else {
        (async () => {
          try {
            const { data } = await supabase
              .from("content_items")
              .select("signal_id, generation_params, created_at")
              .eq("id", draftPrefill.id)
              .maybeSingle();
            if ((data as any)?.created_at) setEditingDraftSavedAt((data as any).created_at);
            const sigId = (data as any)?.signal_id
              || (data as any)?.generation_params?.source_signal_id
              || null;
            if (sigId) await hydrateDraftSignal(sigId);
          } catch { /* silent — body already set */ }
        })();
      }
      setTopic(draftPrefill.topic || "");
      setContext("");
      setContentType(mappedType);
      setLang(draftPrefill.language === "ar" ? "ar" : "en");
      setOutput(draftPrefill.body || "");
      setFullVersion("");
      setShortVersion("");
      setShowingShort(false);
      setPlanRef(null);
      setCardRecommendation(null);
      setDraftSaved(false);
      setPublishedFromCreate(false);
      onDraftPrefillConsumed?.();
      // Scroll the opened draft into view — mirrors the signalPrefill pattern.
      setTimeout(() => {
        document.querySelector('[data-testid="pub-output"]')
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 250);
    }
  }, [draftPrefill]);

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
        // Race-fix: prefer freshly-set ref while React flushes setSelectedSignalId
        signal_id: selectedSignalId ?? pendingSignalIdRef.current,
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
    if (json?.quality_gate) {
      setQualityGate(json.quality_gate);
    } else {
      setQualityGate(null);
    }
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
    setQualityGate(null);
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
      setCritiqueError(e.message || "Couldn't load review");
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

  // Fix C: For Arabic text, flip directional arrow symbols so they read RTL.
  // Applied only at display/copy time — the stored DB text remains untouched.
  const fixArabicDirectionalSymbols = (text: string) => {
    if (!text) return text;
    if (!(lang === "ar" || isArabicText(text))) return text;
    return text
      .replace(/→/g, "←")
      .replace(/↳/g, "↲")
      .replace(/->/g, "<-")
      .replace(/⟶/g, "⟵");
  };

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
    const text = fixArabicDirectionalSymbols(stripMarkdown(output));
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch { /* ignore */ }
      document.body.removeChild(ta);
    }
    setCopied(true);
    toast.success("Copied to clipboard — paste it on LinkedIn to publish");
    setTimeout(() => setCopied(false), 2000);
  };

  // Reset "Saved" state whenever the post text changes (user edited or regenerated)
  useEffect(() => {
    setDraftSaved(false);
    setPublishedFromCreate(false);
    setPubUrlOpen(false);
    setPubUrl("");
  }, [output]);

  const handleSaveDraft = async () => {
    if (savingDraft || draftSaved) return;
    setSavingDraft(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) throw new Error("Not authenticated");
      const body = stripMarkdown(output || fullVersion || shortVersion || "");
      if (!body.trim()) { toast.error("Nothing to save"); return; }

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

      const mappedType = (contentType as string) === "carousel" ? "carousel" : (contentType as string) === "framework_summary" ? "framework" : "linkedin_post";
      if (editingDraftId) {
        if (editingSource === "linkedin_posts") {
          // Library draft card — backed by linkedin_posts, not content_items.
          const { error } = await supabase
            .from("linkedin_posts")
            .update({ post_text: body })
            .eq("id", editingDraftId);
          if (error) throw error;
          setDraftSaved(true);
          toast.success("Draft updated in Library");
        } else {
          // Merge generation_params so provenance keys (source: "weekly_ready",
          // source_signal_id, etc.) survive an edit-save and Home filters still match.
          const { data: existing } = await supabase
            .from("content_items")
            .select("generation_params")
            .eq("id", editingDraftId)
            .maybeSingle();
          const prevParams = (existing?.generation_params as Record<string, any>) || {};
          const mergedParams: Record<string, any> = {
            ...prevParams,
            ...generationParams,
          };
          if (prevParams.source !== undefined) mergedParams.source = prevParams.source;
          if (prevParams.source_signal_id !== undefined && !generationParams.source_signal_id) {
            mergedParams.source_signal_id = prevParams.source_signal_id;
          }
          const { error } = await supabase
            .from("content_items")
            .update({
              body,
              language: lang,
              type: mappedType,
              generation_params: mergedParams,
              updated_at: new Date().toISOString(),
            })
            .eq("id", editingDraftId);
          if (error) throw error;
          setDraftSaved(true);
          toast.success("Draft updated in Library");
        }
      } else {
        const { data: inserted, error } = await supabase.from("content_items").insert({
          user_id: session.user.id,
          type: mappedType,
          body,
          language: lang,
          status: "draft",
          generation_params: generationParams,
        }).select("id").single();
        if (error) throw error;
        // Step 2: adopt the freshly-saved draft so a later publish promotes THIS row, not a new twin
        if (inserted?.id) { setEditingDraftId(inserted.id); setEditingSource("content_items"); }
        setMonthlyGenerationCount(prev => prev + 1);
        setDraftSaved(true);
        toast.success("Draft saved to Library");
      }
    } catch (e: any) {
      toast.error(e?.message || "Couldn't save. Please try again.");
    } finally {
      setSavingDraft(false);
    }
  };

  // Publish the current draft to LinkedIn via the linkedin-publish edge function.
  // Reuses the same text + metadata as the manual mark-published flow, but the
  // edge function does the actual posting and confirms it back.

  const handleAttachImage = async (file: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please choose an image file"); return; }
    if (file.size > 40 * 1024 * 1024) { toast.error("Image is too large (max 40 MB)"); return; }
    setUploadingImage(true);
    try {
      // LinkedIn re-compresses and shows feed images at ~1200px, so a 1920px JPEG
      // is visually identical in-feed but a fraction of the size — fast upload, no limit fights.
      const optimized = await new Promise<Blob>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const MAX = 1920;
          const scale = Math.min(1, MAX / Math.max(img.width, img.height));
          const w = Math.round(img.width * scale);
          const h = Math.round(img.height * scale);
          const canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) { reject(new Error("Canvas unavailable")); return; }
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(img.src);
          canvas.toBlob((b) => b ? resolve(b) : reject(new Error("Could not process image")), "image/jpeg", 0.9);
        };
        img.onerror = () => { URL.revokeObjectURL(img.src); reject(new Error("Could not read image")); };
        img.src = URL.createObjectURL(file);
      });

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) throw new Error("Not authenticated");
      const path = `${session.user.id}/linkedin-${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage.from("capture-images").upload(path, optimized, { upsert: true, contentType: "image/jpeg" });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("capture-images").getPublicUrl(path);
      setAttachedImageUrl(pub.publicUrl);
      toast.success(`Image attached (optimized to ${Math.round(optimized.size / 1024)} KB)`);
    } catch (e: any) {
      toast.error(e?.message || "Couldn't attach image");
    } finally {
      setUploadingImage(false);
    }
  };
  const resetComposerForNext = () => {
    setOutput("");
    setFullVersion("");
    setShortVersion("");
    setShowingShort(false);
    setEditingDraftId(null);
    setEditingSource("content_items");
    setGhostMeta(null);
    setSelectedSignalId(null);
    setSelectedSignalTitle(null);
    setTopic("");
    setAttachedImageUrl(null);
    setPublishedFromCreate(false);
    setPublishedInfo(null);
    setConfirmLiveOpen(false);
    setDraftSaved(false);
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch {}
  };
  const handlePublishToLinkedIn = async () => {
    if (publishingLive || publishedFromCreate) return;
    const text = fixArabicDirectionalSymbols(stripMarkdown(output || fullVersion || shortVersion || ""));
    if (!text.trim()) { toast.error("Nothing to publish"); return; }
    setPublishingLive(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) throw new Error("Not authenticated");
      let postId: string;
      if (editingDraftId && editingSource === "linkedin_posts") {
        const { error: upErr } = await supabase
          .from("linkedin_posts")
          .update({ post_text: text })
          .eq("id", editingDraftId);
        if (upErr) throw upErr;
        postId = editingDraftId;
      } else {
        const { data: ins, error: insErr } = await supabase
          .from("linkedin_posts")
          .insert({
            user_id: session.user.id,
            post_text: text,
            format_type: (contentType as string) === "carousel" ? "carousel" : "post",
            tracking_status: "draft",
            source_type: "aura_generated",
            authorship: "aura_drafted",
            source_signal_id: selectedSignalId || null,
            framework_type: framework !== "auto" ? framework : null,
            source_metadata: {
              source: "create_view",
              topic: topic || null,
              language: lang,
              _language: (lang === "ar" || isArabicText(text)) ? "ar" : "en",
              signal_ids: selectedSignalId ? [selectedSignalId] : [],
              signal_titles: selectedSignalTitle ? [selectedSignalTitle] : [],
              ...(attachedImageUrl ? { image_url: attachedImageUrl } : {}),
            },
          })
          .select("id")
          .single();
        if (insErr) throw insErr;
        postId = (ins as any).id;
      }
      const { data, error } = await supabase.functions.invoke("linkedin-publish", { body: { postId } });
      if (error) throw error;
      if (!(data as any)?.success) {
        const msg = (data as any)?.error || "Publish failed";
        toast.error(/not connected/i.test(msg) ? "Connect LinkedIn in Settings first." : msg);
        return;
      }
      setPublishedFromCreate(true);
      setConfirmLiveOpen(false);
      setAttachedImageUrl(null);
      // Step 2: retire the source content_items draft twin so it can't linger as a duplicate
      if (editingDraftId && editingSource === "content_items") {
        await supabase.from("content_items").update({ status: "published" }).eq("id", editingDraftId);
      }
      // The linkedin-publish edge function returns the LinkedIn URL as `postUrl`
      // (which it also writes to linkedin_posts.post_url). We read it straight
      // from that response — no hardcoded string.
      const url: string | null = (data as any).postUrl ?? null;
      track("post_published", { signal_id: selectedSignalId || null, route: "linkedin" });
      setPublishedInfo({
        url,
        publishedAt: new Date().toISOString(),
        signalId: selectedSignalId || null,
        signalTitle: selectedSignalTitle || null,
      });
      toast.success("Published to LinkedIn");
    } catch (e: any) {
      toast.error(e?.message || "Couldn't publish to LinkedIn");
    } finally {
      setPublishingLive(false);
    }
  };

  // Mark the currently-generated post as published WITHOUT requiring a saved draft.
  // Reuses insertPublishedLinkedInPost (same core as Library's markPublished).
  const handleMarkPublishedFromCreate = async (urlArg?: string) => {
    if (publishing || publishedFromCreate) return;
    const body = stripMarkdown(output || fullVersion || shortVersion || "");
    if (!body.trim()) { toast.error("Nothing to publish"); return; }
    setPublishing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) throw new Error("Not authenticated");
      if (editingDraftId && editingSource === "linkedin_posts") {
        // The draft IS the linkedin_posts row — flip it to published in place
        // instead of inserting a duplicate.
        const update: Record<string, any> = {
          post_text: body,
          tracking_status: "published",
          published_at: new Date().toISOString(),
        };
        if (urlArg) {
          update.post_url = urlArg;
          update.published_confirmed_at = new Date().toISOString();
        }
        const { error } = await supabase
          .from("linkedin_posts")
          .update(update as any)
          .eq("id", editingDraftId);
        if (error) throw error;
      } else {
        await insertPublishedLinkedInPost({
          userId: session.user.id,
          postText: body,
          formatType: (contentType as string) === "carousel" ? "carousel" : "post",
          sourceMetadata: {
            source: "create_view",
            topic: topic || null,
            language: lang,
            signal_ids: selectedSignalId ? [selectedSignalId] : [],
            signal_titles: selectedSignalTitle ? [selectedSignalTitle] : [],
          },
          sourceSignalId: selectedSignalId,
          url: urlArg ?? null,
          language: lang,
          frameworkType: framework !== "auto" ? framework : null,
        });
        // If this Create session is editing an existing content_items draft,
        // mark the source row as published so it counts as shipped.
        if (editingDraftId) {
          await supabase
            .from("content_items")
            .update({ status: "published" })
            .eq("id", editingDraftId);
        }
      }
      setPublishedFromCreate(true);
      setPubUrlOpen(false);
      setPubUrl("");
      toast.success("Marked as published — your Imprint is updating");
    } catch (e: any) {
      toast.error(e?.message || "Couldn't mark as published");
    } finally {
      setPublishing(false);
    }
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


  return (
    <div className="flex flex-col gap-6">
      {/* Signature Studio entry — quiet, always visible */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => navigate("/signature")}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            navigate("/signature");
          }
        }}
        className="group cursor-pointer flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 w-full"
        style={{
          background: "var(--paper-2)",
          border: "0.5px solid var(--rule)",
          borderRadius: 14,
          padding: "14px 18px",
          color: "var(--ink)",
          transition: "border-color 160ms ease, background 160ms ease",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "var(--spot)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "var(--rule)"; }}
        aria-label="Open Signature Studio"
      >
        <div
          aria-hidden
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            borderRadius: 10,
            background: "var(--paper)",
            border: "0.5px solid var(--rule)",
            color: "var(--spot)",
            flexShrink: 0,
          }}
        >
          <AuraLogo size={22} variant="auto" />
        </div>
        <div className="flex-1 min-w-0">
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 500, color: "var(--ink)", lineHeight: 1.25 }}>
            Signature
          </div>
          <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 2, lineHeight: 1.4 }}>
            Turn your expertise into a shareable card — for LinkedIn.
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); navigate("/signature"); }}
          className="self-start sm:self-auto"
          style={{
            background: "transparent",
            border: "0.5px solid var(--rule)",
            borderRadius: 999,
            padding: "6px 14px",
            fontSize: 12.5,
            color: "var(--ink)",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Open →
        </button>
      </div>
      <div className="flex flex-col lg:flex-row gap-6">
      {/* Main Editor */}
      <div data-tour="content-generator" className="flex-1 min-w-0 space-y-6">
        <FirstTimeHint hintKey="publish-create">
          Pick a signal, choose a format, and generate a post in your voice. English or Arabic — one tap.
        </FirstTimeHint>
        {/* Hero CTA — top signal */}
        {(() => {
          if (editingDraftId) return null;
          if (contentType === "flash" || contentType === "framework_summary") return null;
          // Race-fix: avoid an empty-pill flash by waiting for profile resolve
          if (!profileLoaded) {
            return (
              <div
                aria-hidden
                style={{
                  background: "var(--paper-2)",
                  borderRadius: 16,
                  padding: 22,
                  border: "0.5px solid var(--rule)",
                }}
              >
                <div className="pub-skel" style={{ height: 10, width: 120, marginBottom: 12 }} />
                <div className="pub-skel" style={{ height: 22, width: "70%", marginBottom: 10 }} />
                <div className="pub-skel" style={{ height: 10, width: "40%" }} />
              </div>
            );
          }
          const activeSignal = (selectedSignalId && _signals.find(s => s.id === selectedSignalId)) || _signals[0];
          if (!activeSignal) return null;
          const isCustomAngle = !!(selectedSignalTitle && selectedSignalTitle !== activeSignal.signal_title) || (!!topic && topic !== activeSignal.signal_title);
          const heroTitle = isCustomAngle ? topic : activeSignal.signal_title;
          return (
          <div
            id="aura-hero-cta"
            style={{
              background: "var(--paper-2)",
              borderRadius: 16,
              padding: 22,
              border: "0.5px solid var(--rule)",
              color: "var(--ink)",
            }}
          >
            <div className="pub-micro pub-micro--spot" style={{ marginBottom: 10 }}>
              {isCustomAngle ? "Selected post angle" : "Generate from your top signal"}
            </div>
            <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 500, color: "var(--ink)", lineHeight: 1.3, margin: 0 }}>
              {heroTitle}
            </h2>
            {isCustomAngle && (
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 6 }}>
                From signal: {activeSignal.signal_title} · {Math.round((activeSignal.confidence ?? 0) * 100)}%
              </div>
            )}
            <div style={{ fontSize: 12, color: "var(--spot)", marginTop: 8, fontWeight: 500 }}>
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
                    pendingSignalIdRef.current = activeSignal.id;
                  }
                  generate({ topic: heroTopic, context: heroContext, contentType: "post", language: lang, framework });
                }}
                style={{ flex: 1, gap: 6 }}
              >
                Generate post <ArrowRight className="w-4 h-4" />
              </AuraButton>
              <div className="flex gap-1 rounded-[10px] p-0.5" style={{ background: "var(--paper-3)" }}>
                <button
                  onClick={() => setLang("en")}
                  style={{
                    background: lang === "en" ? "var(--paper)" : "transparent",
                    color: lang === "en" ? "var(--ink)" : "var(--ink-3)",
                    border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 500, cursor: "pointer",
                  }}
                >EN</button>
                <button
                  onClick={() => setLang("ar")}
                  style={{
                    background: lang === "ar" ? "var(--paper)" : "transparent",
                    color: lang === "ar" ? "var(--ink)" : "var(--ink-3)",
                    border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 500, cursor: "pointer",
                    fontFamily: "var(--font-arabic, 'Cairo', sans-serif)",
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
                color: "var(--ink-2)",
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
          <p className="text-label uppercase tracking-wider text-xs font-semibold mb-1">Format</p>
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
                    background: active ? "var(--vellum)" : "var(--aura-card)",
                    borderRadius: 12,
                    padding: "12px 14px",
                    border: active ? "1.5px solid var(--brand)" : "0.5px solid hsl(var(--border))",
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
                  <span style={{ fontSize: 12, fontWeight: 600, color: active ? "var(--action-ink)" : "var(--ink)", lineHeight: 1.2 }}>
                    {label}
                  </span>
                  {subtitle && (
                    <span style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 2, fontFamily: "Cairo, sans-serif" }}>{subtitle}</span>
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
                background: "var(--paper-3)",
                color: "var(--action-ink)", fontSize: 12, fontWeight: 600,
                border: "1px solid var(--bronze)", cursor: "pointer",
              }}
            >
              <Sparkles className="w-4 h-4 inline-block mr-1.5" /> Carousel Studio
              <span style={{ opacity: 0.7, fontWeight: 400 }}>— viral, multi-style</span>
            </button>
            <button
              onClick={() => navigate("/edition")}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 14px", borderRadius: 10, marginLeft: 8,
                background: "var(--paper-3)",
                color: "var(--action-ink)", fontSize: 12, fontWeight: 600,
                border: "1px solid var(--bronze)", cursor: "pointer",
              }}
            >
              <Newspaper className="w-4 h-4 inline-block mr-1.5" /> Edition Studio
              <span style={{ opacity: 0.7, fontWeight: 400 }}>— your week, compiled</span>
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
              <p className="text-label uppercase tracking-wider text-xs font-semibold mb-1" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                Structure
                <InfoTooltip
                  slug="post-format"
                  label="Structure"
                  side="top"
                  triggerSize={13}
                />
              </p>
              <p className="text-[12px] text-muted-foreground mb-2">Structural patterns that shape how your argument unfolds</p>
              <div className="flex flex-wrap gap-1.5">
                {FRAMEWORK_OPTIONS.map(fw => {
                  const active = framework === fw.key;
                  return (
                    <button
                      key={fw.key}
                      onClick={() => setFramework(fw.key)}
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        padding: "5px 12px",
                        borderRadius: 20,
                        background: active ? "var(--ink)" : "var(--aura-card)",
                        border: `0.5px solid ${active ? "var(--ink)" : "hsl(var(--border))"}`,
                        color: active ? "var(--paper)" : "var(--ink-2)",
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
              <p className="text-label uppercase tracking-wider text-xs font-semibold">
                Language
              </p>
              <div data-testid="pub-lang-toggle" className="flex gap-1 bg-secondary/30 rounded-lg p-0.5 border border-border/10">
                <button onClick={() => setLang("en")} className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${lang === "en" ? "bg-primary text-primary-foreground" : "text-foreground"}`}>English</button>
                <button onClick={() => setLang("ar")} style={{ fontFamily: "var(--font-arabic, 'Cairo', sans-serif)" }} className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${lang === "ar" ? "bg-primary text-primary-foreground" : "text-foreground"}`}>العربية</button>
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
                fontFamily: "var(--font-body), sans-serif",
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
              {generating ? "Writing…" : `Generate ${FORMAT_LABELS[contentType]?.label || "Content"}`}
            </button>
            {isGeneratingAny && showSlowHint && (
              <p style={{ fontSize: 12, color: "var(--ink-4)", textAlign: "center", marginTop: 8 }}>
                This usually takes 10–30 seconds…
              </p>
            )}

            {/* Output */}
            {displayedOutput && (
              <motion.div data-testid="pub-output" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                {editingDraftId && (
                  <div
                    data-testid="composer-editing-strip"
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.14em",
                      color: "var(--ink-3)",
                      borderBottom: "0.5px solid var(--rule)",
                      paddingBottom: 8,
                      marginBottom: 4,
                    }}
                  >
                    {editingDraftSavedAt
                      ? `Editing your draft · Saved ${new Date(editingDraftSavedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }).toUpperCase()}`
                      : "Editing your draft"}
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-label uppercase tracking-wider text-xs font-semibold">
                    {showingShort ? "Short Version" : "Generated Content"}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button data-testid="pub-copy-btn" size="sm" variant="ghost" onClick={handleCopy} className="h-7 gap-1.5 text-xs">
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? "Copied" : "Copy"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleSaveDraft}
                      disabled={savingDraft || draftSaved || !output.trim()}
                      className={`h-7 gap-1.5 text-xs ${draftSaved ? "border-emerald-500/40 text-emerald-500" : "border-border/15"}`}
                    >
                      {savingDraft ? (
                        <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
                      ) : draftSaved ? (
                        <><Check className="w-3.5 h-3.5" /> Saved</>
                      ) : (
                        <><Save className="w-3.5 h-3.5" /> Save Draft</>
                      )}
                    </Button>
                    <InfoTooltip slug="save-draft" label="Save Draft" side="top" triggerSize={13} />
                    {sigPresets.length > 0 && (
                      <select
                        data-testid="pub-signature-picker"
                        defaultValue=""
                        onChange={(e) => { const v = e.target.value; if (v) { insertSignature(v); e.currentTarget.value = ""; } }}
                        disabled={!output.trim()}
                        title="Insert a saved signature"
                        className="h-7 text-xs rounded-md border bg-background px-2 text-muted-foreground"
                      >
                        <option value="">+ Signature</option>
                        {sigPresets.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                      </select>
                    )}
                    <Button
                      data-testid="pub-publish-linkedin-btn"
                      size="sm"
                      onClick={() => { if (publishedFromCreate || publishingLive) return; setConfirmLiveOpen((v) => !v); }}
                      disabled={publishingLive || publishedFromCreate || !output.trim()}
                      className="h-7 gap-1.5 text-xs"
                    >
                      {publishingLive ? (
                        <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Publishing…</>
                      ) : publishedFromCreate ? (
                        <><Check className="w-3.5 h-3.5" /> Published ✓</>
                      ) : (
                        <><Send className="w-3.5 h-3.5" /> Review & publish</>
                      )}
                    </Button>
                  </div>
                </div>

                {confirmLiveOpen && !publishedFromCreate && (() => {
                  const previewText = fixArabicDirectionalSymbols(stripMarkdown(output || fullVersion || shortVersion || ""));
                  const count = previewText.length;
                  const isAr = lang === "ar";
                  return (
                    <div className="mt-2 border rounded-lg overflow-hidden bg-background">
                      <div className="px-3.5 py-2 border-b text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center justify-between">
                        <span>Preview — exactly how it will post</span>
                        <button
                          type="button"
                          aria-label="Close preview"
                          onClick={() => setConfirmLiveOpen(false)}
                          className="p-1 rounded hover:bg-muted/40 text-muted-foreground"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div
                        dir={isAr ? "rtl" : "ltr"}
                        className="p-4 whitespace-pre-wrap break-words text-[15px] leading-relaxed max-h-80 overflow-y-auto"
                        style={{ textAlign: isAr ? "right" : "left" }}
                      >
                        {previewText || "Nothing to preview yet."}
                      </div>
                      {attachedImageUrl && (
                        <div className="px-4 pb-3">
                          <img src={attachedImageUrl} alt="attached preview" className="max-h-60 rounded-md border" />
                        </div>
                      )}
                      <div className="px-3.5 py-2 border-t flex flex-col gap-2">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{count} / 3000 characters</span>
                          <span>{attachedImageUrl ? "Image attached" : "Text only — no image attached"}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Tip: LinkedIn shows about the first 210 characters before "…see more." Make sure your hook lands there.
                        </div>
                        {count > 3000 && (
                          <span className="text-xs text-destructive">Over LinkedIn's 3000-character limit — trim before publishing.</span>
                        )}
                        <div className="flex items-center gap-2">
                          <input ref={imageInputRef} type="file" accept="image/*" className="hidden"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAttachImage(f); e.currentTarget.value = ""; }} />
                          <Button size="sm" variant="ghost" onClick={() => imageInputRef.current?.click()} disabled={uploadingImage} className="h-8 text-xs">
                            {uploadingImage ? "Uploading…" : attachedImageUrl ? "Change image" : "Add image"}
                          </Button>
                          {attachedImageUrl && (
                            <Button size="sm" variant="ghost" onClick={() => setAttachedImageUrl(null)} className="h-8 text-xs text-destructive">Remove</Button>
                          )}
                        </div>
                        <div className="flex gap-2 mt-0.5">
                          <Button size="sm" onClick={handlePublishToLinkedIn} disabled={publishingLive || uploadingImage || !previewText.trim() || count > 3000} className="h-8 text-xs">
                            {publishingLive ? "Publishing…" : "Publish now"}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirmLiveOpen(false)} disabled={publishingLive} className="h-8 text-xs">
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Post-publish confirmation — shown in place of composer silence.
                    Reads post_url from the linkedin-publish response. */}
                {publishedInfo && (
                  <div
                    className="mt-3 rounded-lg overflow-hidden"
                    style={{ border: "1px solid var(--brand-line, var(--border))", background: "var(--bg-card, var(--bg-subtle))" }}
                    role="status"
                    aria-live="polite"
                  >
                    <div className="p-4 flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4" style={{ color: "var(--gold-dark, var(--brand))" }} />
                        <span className="text-sm font-semibold" style={{ color: "var(--ink)" }}>Published.</span>
                        <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                          {new Date(publishedInfo.publishedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                        </span>
                      </div>
                      {publishedInfo.signalTitle && (
                        <div className="text-xs flex items-center gap-1.5" style={{ color: "var(--color-muted)" }}>
                          <Lightbulb className="w-3.5 h-3.5" style={{ color: "var(--brand)" }} />
                          <span>From signal: {publishedInfo.signalTitle}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-3 flex-wrap mt-1">
                        {publishedInfo.url ? (
                          <a
                            href={publishedInfo.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-medium hover:underline"
                            style={{ color: "var(--brand)" }}
                          >
                            <Linkedin className="w-3.5 h-3.5" /> Open on LinkedIn ↗
                          </a>
                        ) : (
                          <span className="text-xs" style={{ color: "var(--color-muted)", fontStyle: "italic" }}>
                            LinkedIn didn't return a URL — check your feed.
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={resetComposerForNext}
                          style={{ color: "var(--brand)", background: "transparent", border: 0, cursor: "pointer" }}
                          className="inline-flex items-center gap-1 text-xs font-semibold hover:underline"
                        >
                          Start next →
                        </button>
                        <button
                          type="button"
                          onClick={() => onGoToLibrary?.()}
                          style={{ color: "var(--color-muted)", background: "transparent", border: 0, cursor: "pointer" }}
                          className="inline-flex items-center gap-1 text-xs font-medium hover:underline"
                        >
                          View in Library
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Back to full version link */}
                {showingShort && !generatingShort && (
                  <button onClick={switchToFull} className="flex items-center gap-1 text-xs text-primary hover:underline">
                    <ChevronLeft className="w-3.5 h-3.5" /> Back to full version
                  </button>
                )}

                {ghostMeta && (
                  <div
                    style={{
                      background: "var(--paper-2)",
                      border: "1px solid var(--rule)",
                      padding: "10px 12px",
                      marginBottom: 10,
                      borderRadius: 8,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "var(--font-mono, 'IBM Plex Mono', ui-monospace, monospace)",
                        fontSize: 9.5,
                        letterSpacing: "0.22em",
                        textTransform: "uppercase",
                        color: "#36C5B0",
                      }}
                    >
                      THE OVERNIGHT · WRITTEN FOR YOU
                    </div>
                    {ghostMeta.finding_source && (
                      <div
                        style={{
                          marginTop: 6,
                          fontFamily: "var(--font-serif)",
                          fontStyle: "italic",
                          fontSize: 12.5,
                          color: "var(--ink-2)",
                          lineHeight: 1.5,
                        }}
                      >
                        Drafted from a finding you kept:{" "}
                        {ghostMeta.finding_url ? (
                          <a
                            href={ghostMeta.finding_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "var(--spot)", textDecoration: "underline" }}
                          >
                            {ghostMeta.finding_source}
                          </a>
                        ) : (
                          <span>{ghostMeta.finding_source}</span>
                        )}
                      </div>
                    )}
                    {ghostMeta.finding_implication && (
                      <div
                        style={{
                          marginTop: 4,
                          fontStyle: "italic",
                          fontSize: 12,
                          color: "var(--ink-3)",
                          lineHeight: 1.5,
                        }}
                      >
                        {ghostMeta.finding_implication}
                      </div>
                    )}
                    <div
                      style={{
                        marginTop: 8,
                        fontFamily: "var(--font-mono, 'IBM Plex Mono', ui-monospace, monospace)",
                        fontSize: 9,
                        letterSpacing: "0.18em",
                        textTransform: "uppercase",
                        color: "var(--ink-3)",
                      }}
                    >
                      YOURS TO EDIT — NOTHING PUBLISHES WITHOUT YOU
                    </div>
                  </div>
                )}
                <div className="relative">
                  {isEditingBody && output.trim() ? (
                    <textarea
                      value={output}
                      onChange={(e) => setOutput(e.target.value)}
                      dir={lang === "ar" || isArabicText(displayedOutput) ? "rtl" : "ltr"}
                      className={`w-full p-5 rounded-xl bg-secondary/20 border border-border/10 text-sm text-foreground/90 max-h-[500px] overflow-y-auto resize-none focus:outline-none focus:ring-1 focus:ring-primary/30 ${
                        lang === "ar" || isArabicText(displayedOutput)
                          ? "arabic-text font-cairo text-right leading-[1.9]"
                          : "leading-relaxed"
                      }`}
                      style={{ minHeight: 280 }}
                    />
                  ) : (
                    <div
                      dir={lang === "ar" || isArabicText(displayedOutput) ? "rtl" : "ltr"}
                      className={`p-5 rounded-xl bg-secondary/20 border border-border/10 text-sm text-foreground/90 leading-relaxed max-h-[500px] overflow-y-auto ${
                        lang === "ar" || isArabicText(displayedOutput) ? "arabic-text" : ""
                      }`}
                    >
                      {renderMarkdown(fixArabicDirectionalSymbols(displayedOutput))}
                      {isGeneratingAny && <span className="inline-block w-1.5 h-4 bg-primary/60 ml-1 animate-pulse rounded-sm" />}
                    </div>
                  )}
                  {output.trim() && !isGeneratingAny && (
                    <button
                      type="button"
                      onClick={() => setIsEditingBody((v) => !v)}
                      className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-background/70 backdrop-blur border border-border/20 text-[11px] text-foreground/70 hover:text-foreground hover:bg-background/90 transition"
                      aria-label={isEditingBody ? "Done editing" : "Edit post body"}
                    >
                      {isEditingBody ? (
                        <><Check className="w-3 h-3" /> Done</>
                      ) : (
                        <><Pencil className="w-3 h-3" /> Edit</>
                      )}
                    </button>
                  )}
                </div>
                {output.trim() && !isGeneratingAny && (
                  <>
                  <p className="mt-2 text-[11px] text-muted-foreground/60" style={{ letterSpacing: "0.02em" }}>
                    ✦ AI-assisted · Review before publishing
                  </p>

                  </>
                )}

                {/* Generation attribution — voice fallback only */}
                {!isGeneratingAny && voiceWords.length > 0 && (
                  <div
                    className="text-xs"
                    style={{ color: "var(--ink-3)", fontStyle: "italic", paddingLeft: 2 }}
                  >
                    Based on your voice profile
                  </div>
                )}



                {/* Provenance trail + Publish Confidence */}
                {!isGeneratingAny && (() => {
                  const sig = (selectedSignalId && _signals.find(s => s.id === selectedSignalId)) || _signals[0];
                  const sigTitle = selectedSignalTitle || sig?.signal_title || null;
                  const sigConf = sig ? Math.round((sig.confidence ?? 0) * 100) : null;
                  const evidenceCount = sig?.fragment_count ?? 0;
                  const gate = qualityGate;
                  const gateActive = !!gate && !gate.skipped;
                  const dims: { key: string; label: string; raw: number }[] = gateActive ? [
                    { key: "voice", label: "Voice", raw: gate!.scores?.voice ?? 0 },
                    { key: "hook", label: "Hook", raw: gate!.scores?.hook ?? 0 },
                    { key: "specificity", label: "Specificity", raw: gate!.scores?.specificity ?? 0 },
                    { key: "structure", label: "Structure", raw: gate!.scores?.structure ?? 0 },
                    { key: "signal_depth", label: "Signal depth", raw: gate!.scores?.signal_depth ?? 0 },
                  ] : [];
                  return (
                    <div className="rounded-xl border border-border/10 bg-secondary/10 overflow-hidden">
                      {/* HOW THIS WAS BUILT — collapsible */}
                      <button
                        type="button"
                        onClick={() => setProvenanceOpen(o => !o)}
                        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-secondary/20 transition-colors"
                      >
                        <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground font-semibold">
                          How this was built
                        </span>
                        <span className="inline-flex items-center gap-2">
                          <InfoTooltip slug="how-built" label="How this was built" side="top" triggerSize={13} />
                          <span className="text-xs text-muted-foreground/70">{provenanceOpen ? "−" : "+"}</span>
                        </span>
                      </button>
                      {provenanceOpen && (
                        <div className="px-4 pb-3 space-y-1.5 text-xs text-muted-foreground/90 leading-relaxed">
                          {sigTitle ? (
                            <div>
                              <span style={{ color: "var(--brand)" }}>✦</span> Signal:{" "}
                              <span className="text-foreground/90">"{sigTitle}"</span>
                              {sigConf != null && <> — {sigConf}% confidence</>}
                              {evidenceCount > 0 && <> · {evidenceCount} sources</>}
                            </div>
                          ) : (
                            <div>
                              <span style={{ color: "var(--brand)" }}>✦</span> Signal: drafted from your topic input
                            </div>
                          )}
                          <div>
                            <span style={{ color: "var(--brand)" }}>✦</span> Voice: matched against your LinkedIn voice profile
                          </div>
                          {gateActive && (
                            <div>
                              <span style={{ color: "var(--brand)" }}>✦</span> Quality: reviewed{gate!.verdict ? <> — <span className="text-foreground/90">{gate!.verdict}</span></> : null}
                            </div>
                          )}
                        </div>
                      )}

                      {/* PUBLISH CONFIDENCE — only when gate ran */}
                      {gateActive && (
                        <div className="border-t border-border/10 px-4 py-3 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground font-semibold">
                              Publish confidence
                              <InfoTooltip slug="publish-confidence" label="Publish confidence" side="top" triggerSize={13} className="ml-1.5 align-middle" />
                            </span>
                            <span className={`text-xs font-semibold tabular-nums ${gate!.overall_score >= 70 ? "text-[color:var(--warning)]" : "text-muted-foreground"}`}>
                              {gate!.overall_score}%
                            </span>
                          </div>
                          <div className="bg-secondary/30 rounded-full h-1.5 overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.max(0, Math.min(100, gate!.overall_score))}%` }}
                              transition={{ duration: 0.6 }}
                              className={`h-full rounded-full ${gate!.overall_score >= 70 ? "bg-[color:var(--warning)]" : "bg-muted-foreground/40"}`}
                            />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 pt-1">
                            {dims.map(d => {
                              const pct = Math.max(0, Math.min(100, Math.round(d.raw * 10)));
                              return (
                                <div key={d.key} className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground w-20 shrink-0">{d.label}</span>
                                  <div className="flex-1 bg-secondary/30 rounded-full h-1 overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${d.raw >= 7 ? "bg-[color:var(--warning)]" : "bg-muted-foreground/30"}`}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                  <span className={`text-xs tabular-nums w-8 text-right ${d.raw >= 7 ? "text-[color:var(--warning)]" : "text-muted-foreground/60"}`}>{pct}%</span>
                                </div>
                              );
                            })}
                          </div>
                          {gate!.overall_score < 70 ? (
                            <><Button
                              size="sm"
                              variant="outline"
                              disabled={isGeneratingAny || !!actionLoading}
                              className="h-8 w-full text-xs gap-1.5 border-[color:var(--warning)]/40 text-[color:var(--warning)] hover:bg-[color-mix(in_srgb,var(--warning)_10%,transparent)]"
                              onClick={async () => {
                                const weak = (gate!.weaknesses || []).filter(Boolean);
                                const instruction = weak.length
                                  ? `Strengthen this post by addressing these specific weaknesses identified by quality review:\n- ${weak.join("\n- ")}\n\nKeep the same topic, signal grounding, and voice. Return only the rewritten post.`
                                  : `Strengthen the hook, specificity, and signal depth of this post. Keep the same topic and voice. Return only the rewritten post.`;
                                setActionLoading("strengthen");
                                try {
                                  const accumulated = await streamGeneration(instruction);
                                  if (accumulated.trim()) {
                                    setFullVersion(accumulated);
                                    setShowingShort(false);
                                  }
                                } catch (e: any) {
                                  toast.error(e?.message || "Strengthen failed");
                                } finally {
                                  setActionLoading(null);
                                }
                              }}
                            >
                              {actionLoading === "strengthen" ? "Strengthening…" : "Strengthen before publishing →"}
                            </Button>
                            <InfoTooltip slug="strengthen-post" label="Strengthen" side="top" triggerSize={13} className="ml-1.5 align-middle" /></>
                          ) : (
                            <div className="text-xs text-[color:var(--warning)]">
                              Ready to publish — quality threshold met.
                            </div>
                          )}
                          {/* Character count + reading time — table-stakes per AuthoredUp/Taplio/Buffer */}
                          {(() => {
                            const plain = stripMarkdown(displayedOutput || "");
                            const chars = plain.length;
                            const words = plain.split(/\s+/).filter(Boolean).length;
                            const minutes = Math.max(1, Math.ceil(words / 200));
                            const over = chars > 3000;
                            return (
                              <div
                                className={`text-xs tabular-nums pt-1 ${over ? "font-medium text-[color:var(--error)]" : "text-[color:hsl(var(--muted-foreground))]"}`}
                              >
                                {chars.toLocaleString()} / 3,000 chars · ~{minutes} min read
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  );
                })()}

              </motion.div>
            )}
            {/* Voice Feedback Buttons */}
            {displayedOutput && !isGeneratingAny && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs text-muted-foreground border-border/20 hover:bg-secondary/30"
                  onClick={async () => {
                    try {
                      const { data: { session } } = await supabase.auth.getSession();
                      if (!session?.user?.id) return;
                      const uid = session.user.id;
                      const snippet = output.slice(0, 300);
                      const { data: existing } = await supabase.from("authority_voice_profiles").select("id, example_posts, tone").eq("user_id", uid).eq("language", lang).maybeSingle();
                      const newExample = { content: snippet, added_at: new Date().toISOString(), source: "voice_feedback" };
                      if (existing) {
                        const posts = Array.isArray(existing.example_posts) ? [...(existing.example_posts as any[]), newExample] : [newExample];
                        await supabase.from("authority_voice_profiles").update({ example_posts: posts, tone: existing.tone || "analytical, calm confidence" }).eq("id", existing.id);
                      } else {
                        const { data: anyRow } = await supabase.from("authority_voice_profiles").select("id").eq("user_id", uid).limit(1);
                        const isFirst = !anyRow || anyRow.length === 0;
                        await supabase.from("authority_voice_profiles").insert({ user_id: uid, example_posts: [newExample], tone: "analytical, calm confidence", language: lang, is_primary: isFirst });
                      }
                      toast.success("Voice engine updated");
                    } catch { toast.error("Couldn't update voice engine"); }
                  }}
                >
                  <Check className="w-3.5 h-3.5 mr-1" /> Sounds like me
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs text-muted-foreground border-border/20 hover:bg-secondary/30"
                  onClick={async () => {
                    try {
                      const { data: { session } } = await supabase.auth.getSession();
                      if (!session?.user?.id) return;
                      const uid = session.user.id;
                      const first10 = output.split(/\s+/).slice(0, 10).join(" ");
                      const avoidNote = `Avoid this pattern: ${first10}`;
                      const { data: existing } = await supabase.from("authority_voice_profiles").select("id, vocabulary_preferences").eq("user_id", uid).eq("language", lang).maybeSingle();
                      if (existing) {
                        const prefs = (typeof existing.vocabulary_preferences === "object" && existing.vocabulary_preferences) ? { ...(existing.vocabulary_preferences as any) } : {};
                        const avoidList = Array.isArray(prefs.avoid) ? [...prefs.avoid, avoidNote] : [avoidNote];
                        await supabase.from("authority_voice_profiles").update({ vocabulary_preferences: { ...prefs, avoid: avoidList } }).eq("id", existing.id);
                      } else {
                        const { data: anyRow } = await supabase.from("authority_voice_profiles").select("id").eq("user_id", uid).limit(1);
                        const isFirst = !anyRow || anyRow.length === 0;
                        await supabase.from("authority_voice_profiles").insert({ user_id: uid, vocabulary_preferences: { avoid: [avoidNote] }, language: lang, is_primary: isFirst });
                      }
                      toast.success("Noted. Aura will adjust.");
                    } catch { toast.error("Couldn't save preference"); }
                  }}
                >
                  <X className="w-3.5 h-3.5 mr-1" /> Doesn't sound like me
                </Button>
              </div>
            )}

            {/* Visual companion is rendered below in its dedicated section */}


            {/* Visual Companion — Branded Card */}
            {displayedOutput && !isGeneratingAny && (
              <div className="rounded-xl border border-border/10 bg-card/60 backdrop-blur-sm">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/8">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-3.5 h-3.5 text-primary/60" />
                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/50 font-semibold">
                      Visual Companion
                    </p>
                  </div>
                </div>
                <div className="p-5">
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
  const navigate = useNavigate();

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
    const { data } = await (supabase.from("narrative_suggestions" as any) as any).select("*").eq("status", "suggested").order("created_at", { ascending: false }).limit(20);
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

  // New-user empty state — show guidance, never fake plans.
  // Smart empty state — gated on signal count.
  if (suggestions.length === 0 && signalCount !== null && signalCount < 3) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 px-6 max-w-md mx-auto space-y-3">
        <Calendar className="w-10 h-10 text-primary/40" strokeWidth={1.5} />
        <p className="text-foreground font-medium">Not enough signals yet.</p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Aura needs at least 3 active signals to suggest a content plan. You have {signalCount} so far.
        </p>
        <Button onClick={() => navigate("/home")} className="mt-2 gap-2">
          Keep capturing →
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Plan what to publish next based on signals and insights — sequence the moves that compound your influence.</p>
        <Button variant="outline" size="sm" onClick={generatePlan} disabled={generating} className="gap-2 border-border/40">
          {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          Generate Plan
        </Button>
      </div>

      {suggestions.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <Calendar className="w-8 h-8 text-primary/30 mx-auto" />
          <p className="text-foreground font-medium">No narrative plan yet</p>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">Generate an AI-powered content plan based on your strongest signals and frameworks.</p>
          <Button onClick={generatePlan} disabled={generating} className="gap-2 border-border/40">
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
                    <div key={s.id} className="rounded-xl p-5 border border-border/30 hover:border-primary/30 transition-all" style={{ background: "var(--paper-2)" }}>
                      <p className="text-sm font-semibold text-foreground mb-1">{s.topic}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed mb-2">{s.angle}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{s.reason}</span>
                        <span className="ml-auto">{formatSmartDate(s.created_at)}</span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3 h-7 text-xs gap-1.5 border-border/40"
                        onClick={() => {
                          onGenerateFromPlan({
                            topic: s.topic,
                            context: `${s.angle}\n\nReason: ${s.reason}`,
                            contentType: FORMAT_TO_CONTENT_TYPE[s.recommended_format] || "post",
                            planTitle: s.topic,
                          });
                          if (s.id) {
                            markSuggestionDrafted(s.id);
                            setSuggestions((prev: any[]) => prev.filter((x) => x.id !== s.id));
                          }
                        }}
                      >
                        <ArrowRight className="w-3.5 h-3.5" /> Generate this →
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
        .neq("tracking_status", "external_reference")
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
        (p: any) => isPublishedPost(p) && p.like_count != null && p.like_count > 0,
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
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">Create your first post and connect your LinkedIn activity to see performance analytics here.</p>
      </div>
    );
  }

  // Separate posts for detailed view
  const externalPosts = posts.filter((p: any) => p.source_type === "external_reference");
  const auraDrafts = posts.filter((p: any) => p.source_type === "aura_generated" && p.tracking_status === "draft");
  const auraPublished = posts.filter((p: any) => isPublishedPost(p));

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
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-muted/20 text-muted-foreground border border-border/15 shrink-0 ml-2">
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
            ? `Your strongest theme is "${stats.topTheme}". Continue publishing on this topic to deepen audience trust.`
            : "Publish more content to unlock performance insights."
          }
        </p>
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
  post: { label: "Post", cls: "bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] text-[color:var(--warning)] border-[color-mix(in_srgb,var(--warning)_20%,transparent)]" },
  linkedin_post: { label: "Post", cls: "bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] text-[color:var(--warning)] border-[color-mix(in_srgb,var(--warning)_20%,transparent)]" },
  post_short: { label: "Short", cls: "bg-[color:var(--bronze-pale)] text-[color:var(--bronze-text)] border-[color:var(--bronze-line)]" },
  carousel: { label: "Carousel", cls: "bg-[color-mix(in_srgb,var(--info)_15%,transparent)] text-[color:var(--info)] border-[color-mix(in_srgb,var(--info)_20%,transparent)]" },
  framework: { label: "Framework", cls: "bg-[color:var(--bronze-pale)] text-[color:var(--bronze-text)] border-[color:var(--bronze-line)]" },
  essay: { label: "Essay", cls: "bg-muted/30 text-muted-foreground border-border/20" },
  article: { label: "Article", cls: "bg-muted/30 text-muted-foreground border-border/20" },
  whitepaper: { label: "Whitepaper", cls: "bg-muted/30 text-muted-foreground border-border/20" },
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
  onMarkPublished: (id: string, url?: string) => void;
  onDelete: (id: string) => void;
}) => {
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [impressions, setImpressions] = useState("");
  const [reactions, setReactions] = useState("");
  const [comments, setComments] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmPub, setConfirmPub] = useState(false);
  const [pubUrl, setPubUrl] = useState("");

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
      toast.error("Couldn't save metrics");
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
                <span className="text-xs text-muted-foreground/40">Aura Draft</span>
              </div>
              {p.source_metadata?.signal_titles?.[0] && (
                <p className="text-xs text-muted-foreground/40 mt-1 line-clamp-1">From signal: {p.source_metadata.signal_titles[0]}</p>
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
                <p className="text-xs text-muted-foreground/40 mt-0.5">From plan: {p.source_metadata.from_plan}</p>
              )}
              {p.source_metadata?.signal_titles?.[0] && (
                <p className="text-xs text-muted-foreground/40 mt-0.5 line-clamp-1">From signal: {p.source_metadata.signal_titles[0]}</p>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${badge.cls}`}>
            {badge.label}
          </span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${
            isDraft
              ? "bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] text-[color:var(--warning)] border-[color-mix(in_srgb,var(--warning)_20%,transparent)]"
              : "bg-emerald-500/15 text-emerald-400 border-emerald-500/20"
          }`}>
            {isDraft ? "Draft" : "Published"}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3">
        <span className="text-xs text-muted-foreground/40">{formatSmartDate(p.created_at)}</span>
        <div className="flex-1" />
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs gap-1.5"
          onClick={() => p.post_text && onCopy(p.id, p.post_text)}
          disabled={!p.post_text}
        >
          {copiedId === p.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copiedId === p.id ? "Copied" : "Copy"}
        </Button>
        {isDraft && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5 border-border/15"
            style={{ color: "var(--brand)" }}
            onClick={() => setConfirmPub(v => !v)}
          >
            <Check className="w-3.5 h-3.5" /> Mark as published →
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={() => onDelete(p.id)}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      {isDraft && confirmPub && (
        <div className="mt-3 pt-3 border-t border-border/8 space-y-2">
          <label className="text-xs text-muted-foreground block">
            Paste your LinkedIn post URL (optional)
          </label>
          <p className="text-[11px] text-muted-foreground/70 leading-snug -mt-1">
            Add the link so Aura can track how it performed.
          </p>
          <Input
            value={pubUrl}
            onChange={e => setPubUrl(e.target.value)}
            placeholder="https://linkedin.com/posts/..."
            className="h-8 text-xs bg-secondary/20 border-border/10"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onMarkPublished(p.id, pubUrl.trim() || undefined);
                setConfirmPub(false);
              }
            }}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-7 text-xs gap-1.5"
              style={{ background: "var(--brand)", color: "#fff" }}
              onClick={() => {
                onMarkPublished(p.id, pubUrl.trim() || undefined);
                setConfirmPub(false);
              }}
            >
              <Check className="w-3.5 h-3.5" /> Mark as published
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => {
                onMarkPublished(p.id);
                setConfirmPub(false);
              }}
            >
              Skip URL
            </Button>
          </div>
        </div>
      )}

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
                  <label className="text-xs text-muted-foreground block mb-1">Impressions</label>
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
                  <label className="text-xs text-muted-foreground block mb-1">Reactions</label>
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
                  <label className="text-xs text-muted-foreground block mb-1">Comments</label>
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
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
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
      toast.error("Couldn't download diagram");
    }
  };

  const deleteFramework = async (id: string) => {
    const { error } = await supabase.from("master_frameworks").delete().eq("id", id);
    if (error) { toast.error("Couldn't delete framework"); return; }
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
          <span style={{ fontFamily: "var(--font-display, var(--font-serif))", fontSize: 14, fontStyle: "italic", color: "var(--ink-3)", lineHeight: 1.4 }}>
            Reusable thinking models for your content
          </span>
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 999, backgroundColor: "var(--bg-subtle)", color: "var(--color-muted)" }}>
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
                        <p style={{ fontSize: 14, color: "var(--color-muted)", lineHeight: 1.5, marginTop: 4 }} className={expandedCards.has(fw.id) ? "" : "line-clamp-2"}>{fw.summary}</p>
                        {fw.summary.split("\n").length > 2 || fw.summary.length > 120 ? (
                          <button
                            onClick={() => toggleCardExpand(fw.id)}
                            style={{ fontSize: 14, color: "var(--brand)", background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 4 }}
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
                    fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 999,
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
                        <ImageIcon className="w-3.5 h-3.5" /> View
                      </button>
                    )}
                    <button
                      onClick={() => handleDownloadText(fw)}
                      style={{ fontSize: 12, fontWeight: 500, padding: "4px 12px", borderRadius: 6, backgroundColor: "var(--bg-subtle)", color: "var(--color-muted)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
                      className="hover:bg-muted/40 transition-colors"
                      title="Download framework as text"
                    >
                      <Download className="w-3.5 h-3.5" /> Download
                    </button>
                    <button
                      onClick={() => setPendingDeleteId(`fw_${fw.id}`)}
                      style={{ fontSize: 12, fontWeight: 500, padding: "4px 8px", borderRadius: 6, backgroundColor: "transparent", color: "var(--error)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                      className="hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
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
  // Defensive: strip stray markdown asterisks (**bold**, *em*) so older drafts render clean.
  const cleanText = text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/(^|[\s(])\*(?!\s)([^*\n]+?)\*(?=[\s.,;:!?)]|$)/g, "$1$2")
    .replace(/\*\*/g, "");
  const lines = cleanText.split("\n").slice(0, 3).join("\n");
  const showMore = cleanText.length > lines.length;
  const name = profile?.first_name || "You";
  const level = profile?.level || "Executive";
  const initial = (name[0] || "?").toUpperCase();
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid var(--vellum)",
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
          <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.2 }}>{name}</div>
          <div style={{ fontSize: 12, color: "#666", lineHeight: 1.2 }}>{level} · now</div>
        </div>
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.45, whiteSpace: "pre-wrap" }} dir="auto">
        {lines}
        {showMore && <span style={{ color: "#666" }}> …see more</span>}
      </div>
    </div>
  );
};

const LibraryTab = ({ onSwitchToCreate, onOpenDraft, onWriteFromPost }: { onSwitchToCreate: () => void; onOpenDraft?: (draft: { id: string; body: string; language: "en" | "ar"; type: "carousel" | "framework" | "linkedin_post"; topic?: string | null; _source?: "content_items" | "linkedin_posts" }) => void; onWriteFromPost?: (prefill: SignalPrefill) => void }) => {
  const [drafts, setDrafts] = useState<SavedPost[]>([]);
  const [publishedPosts, setPublishedPosts] = useState<SavedPost[]>([]);
  const [needsReview, setNeedsReview] = useState<SavedPost[]>([]);
  const [publishedTotal, setPublishedTotal] = useState<number>(0);
  // Exact-count truth per authorship group (not derived from array.length).
  const [auraTotal, setAuraTotal] = useState<number>(0);
  const [earlierTotal, setEarlierTotal] = useState<number>(0);
  const [showEarlier, setShowEarlier] = useState<boolean>(false);
  const [postMetrics, setPostMetrics] = useState<Record<string, { impressions?: number | null; reactions?: number | null }>>({});
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [showPublished, setShowPublished] = useState(false);
  const [showDrafts, setShowDrafts] = useState(true);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const toggleCardExpand = (id: string) => setExpandedCards(prev => { const next = new Set(prev); if (next.has(id)) { next.delete(id); } else { next.add(id); } return next; });
  // M-1-1: confirm-publish + URL tracking + preview
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmPubUrl, setConfirmPubUrl] = useState("");
  const [confirmPubUrlError, setConfirmPubUrlError] = useState("");
  function validateLinkedInUrl(url: string): string {
    const trimmed = url.trim();
    if (trimmed && !trimmed.toLowerCase().includes("linkedin.com/")) {
      return "That doesn't look like a LinkedIn link";
    }
    return "";
  }
  const [urlDrafts, setUrlDrafts] = useState<Record<string, string>>({});
  const [savedUrls, setSavedUrls] = useState<Record<string, string>>({});
  const [signalTitleMap, setSignalTitleMap] = useState<Record<string, string>>({});
  const [profile, setProfile] = useState<{ first_name?: string | null; level?: string | null; avatar_url?: string | null } | null>(null);
  const [topSignal, setTopSignal] = useState<{ id: string; signal_title: string } | null>(null);
  const [signalCount, setSignalCount] = useState<number>(0);
  const [hasLinkedIn, setHasLinkedIn] = useState<boolean>(true); // default true → hides tutorial until we know
  const navigate = useNavigate();
  // P4: search / filter / sort — all client-side against already-loaded rows.
  const [librarySearch, setLibrarySearch] = useState<string>("");
  const [libraryLang, setLibraryLang] = useState<"all" | "ar" | "en">("all");
  const [libraryStatus, setLibraryStatus] = useState<"all" | "draft" | "published">("all");
  const [librarySort, setLibrarySort] = useState<"recent" | "top">("recent");
  // Race-fix: don't let realtime INSERTs trigger a parallel refetch
  // before the initial loadPosts() has settled.
  const initialLoadDoneRef = useRef(false);

  useEffect(() => {
    initialLoadDoneRef.current = false;
    loadPosts().finally(() => { initialLoadDoneRef.current = true; });
    loadProfile();
    loadSignalContext();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setHasLinkedIn(false); return; }
      const { data } = await supabase
        .from("linkedin_connections")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      setHasLinkedIn(!!data);
    })();
  }, []);

  // Realtime: refetch library when this user's linkedin_posts change.
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      channel = supabase
        .channel(`publish-live-${user.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "linkedin_posts", filter: `user_id=eq.${user.id}` },
          () => { if (initialLoadDoneRef.current) loadPosts(); },
        )
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const loadSignalContext = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { count } = await (supabase.from("strategic_signals" as any) as any)
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "active");
    setSignalCount(count || 0);
    const { data } = await (supabase.from("strategic_signals" as any) as any)
      .select("id, signal_title")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("priority_score", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.id) setTopSignal({ id: data.id, signal_title: data.signal_title });
  };

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
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const uid = authUser?.id;
    const LI_COLS = "id, title, post_text, format_type, tracking_status, topic_label, created_at, source_metadata, source_type, authorship, acquisition, published_at, linkedin_url, post_url, source_signal_id, content_type";
    const [liDraftsRes, liNeedsReviewRes, liPublishedRes, ciRes, publishedCountRes, auraCountRes, earlierCountRes] = await Promise.all([
      supabase
        .from("linkedin_posts")
        .select(LI_COLS)
        .eq("tracking_status", "draft")
        .is("published_at", null)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("linkedin_posts")
        .select(LI_COLS)
        .eq("tracking_status", "needs_review")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("linkedin_posts")
        .select(LI_COLS)
        .not("published_at", "is", null)
        .order("published_at", { ascending: false })
        .limit(100),
      supabase
        .from("content_items")
        .select("id, type, body, language, status, generation_params, created_at")
        .eq("status", "draft")
        .order("created_at", { ascending: false })
        .limit(100),
      uid
        ? supabase
            .from("linkedin_posts")
            .select("id", { count: "exact", head: true })
            .eq("user_id", uid)
            .not("published_at", "is", null)
        : Promise.resolve({ count: 0 } as any),
      uid
        ? supabase
            .from("linkedin_posts")
            .select("id", { count: "exact", head: true })
            .eq("user_id", uid)
            .in("authorship", ["aura_drafted", "aura_assisted"])
        : Promise.resolve({ count: 0 } as any),
      uid
        ? supabase
            .from("linkedin_posts")
            .select("id", { count: "exact", head: true })
            .eq("user_id", uid)
            .in("authorship", ["user_written", "unknown"])
        : Promise.resolve({ count: 0 } as any),
    ]);
    setPublishedTotal(publishedCountRes?.count ?? 0);
    setAuraTotal(auraCountRes?.count ?? 0);
    setEarlierTotal(earlierCountRes?.count ?? 0);

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

    // Library shows EVERY linkedin_posts draft for the current user (server-scoped:
    // tracking_status='draft' AND published_at IS NULL). The only client-side guard
    // is empty/whitespace-only body. Carousel rows keep format_type: "carousel".
    const liAllDrafts: SavedPost[] = (liDraftsRes.data || [])
      .filter((p: any) => typeof p.post_text === "string" && p.post_text.trim().length > 0)
      .map((p: any) => ({
        ...p,
        format_type: p.content_type === "carousel" ? "carousel" : p.format_type,
        _source: "linkedin_posts" as const,
      }));
    // Kept for the metrics-id set below (published + linkedin_posts drafts).
    const liCarouselDrafts = liAllDrafts.filter((p: any) => p.format_type === "carousel");
    const liPostDrafts = liAllDrafts.filter((p: any) => p.format_type !== "carousel");

    // Published section — server-scoped by published_at IS NOT NULL, ordered by
    // published_at DESC. Rows with no post_text (legacy export imports) are still
    // valid entries; the row renderer falls back to date + Open on LinkedIn.
    const liPublished: SavedPost[] = (liPublishedRes.data || []).map((p: any) => ({
      ...p,
      _source: "linkedin_posts" as const,
    }));

    const liNeedsReview: SavedPost[] = (liNeedsReviewRes.data || []).map((p: any) => ({
      ...p,
      _source: "linkedin_posts" as const,
    }));

    // De-duplicate by draft id so a draft present in both stores appears once.
    // linkedin_posts wins over content_items (it's the row the publish path uses).
    const seenDraftIds = new Set<string>();
    const allDrafts = [...liAllDrafts, ...ciDrafts]
      .filter((d) => {
        if (!d?.id || seenDraftIds.has(d.id)) return false;
        seenDraftIds.add(d.id);
        return true;
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setDrafts(allDrafts);
    setPublishedPosts(liPublished);
    setNeedsReview(liNeedsReview);
    // Union of all three result sets, de-duplicated by id, so no row that was
    // previously mapped stops being mapped.
    const urls: Record<string, string> = {};
    const seenUrlIds = new Set<string>();
    [...(liDraftsRes.data || []), ...(liNeedsReviewRes.data || []), ...(liPublishedRes.data || [])]
      .forEach((p: any) => {
        if (!p?.id || seenUrlIds.has(p.id)) return;
        seenUrlIds.add(p.id);
        if (p.linkedin_url) urls[p.id] = p.linkedin_url;
      });
    setSavedUrls(urls);

    // Latest metrics per linkedin_posts row rendered in the library
    // (published + any linkedin_posts drafts). Empty-text export rows
    // have real metrics too — verified against DB.
    const metricsIds = Array.from(new Set([
      ...liPublished.map(p => p.id),
      ...liCarouselDrafts.map(p => p.id),
      ...liPostDrafts.map(p => p.id),
    ]));
    if (metricsIds.length > 0) {
      const { data: metricsRows } = await supabase
        .from("linkedin_post_metrics")
        .select("post_id, impressions, reactions, snapshot_date")
        .in("post_id", metricsIds)
        .order("snapshot_date", { ascending: false });
      const map: Record<string, { impressions?: number | null; reactions?: number | null }> = {};
      (metricsRows || []).forEach((m: any) => {
        if (!map[m.post_id]) map[m.post_id] = { impressions: m.impressions, reactions: m.reactions };
      });
      setPostMetrics(map);
    } else {
      setPostMetrics({});
    }

    // Resolve signal titles for cards that reference a source signal id
    const signalIds = new Set<string>();
    const seenSigRowIds = new Set<string>();
    [...(liDraftsRes.data || []), ...(liNeedsReviewRes.data || []), ...(liPublishedRes.data || [])]
      .forEach((p: any) => {
        if (!p?.id || seenSigRowIds.has(p.id)) return;
        seenSigRowIds.add(p.id);
        if (p.source_signal_id) signalIds.add(p.source_signal_id);
      });
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
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
      await shareToLinkedIn({ text, url: "https://aura-intel.org" });
    } catch (err) {
      console.error("[Library] copy failed", err);
      toast.error("Could not copy — please select and copy manually");
    }
  };

  const resolveNeedsReviewLive = async (id: string) => {
    try {
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from("linkedin_posts")
        .update({
          tracking_status: "published",
          published_at: nowIso,
          published_confirmed_at: nowIso,
          authorship: "aura_drafted",
          acquisition: "published_via_aura",
        })
        .eq("id", id);
      if (error) throw error;
      toast.success("Marked as published");
      await loadPosts();
    } catch (e: any) {
      toast.error(e?.message || "Couldn't update this post");
    }
  };

  const resolveNeedsReviewDraft = async (id: string) => {
    try {
      const { error } = await supabase
        .from("linkedin_posts")
        .update({ tracking_status: "draft" })
        .eq("id", id);
      if (error) throw error;
      toast.success("Returned to drafts");
      await loadPosts();
    } catch (e: any) {
      toast.error(e?.message || "Couldn't return to drafts");
    }
  };

  const markPublished = async (id: string, url?: string) => {
    const trimmedUrl = url ? url.trim() : undefined;
    const item = drafts.find(p => p.id === id);
    if (!item) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) throw new Error("Not authenticated");
      const linkedSignalId = (item.source_metadata as any)?.source_signal_id
        || (item.source_metadata?.signal_ids?.[0])
        || null;
      if (item._source === "linkedin_posts") {
        // Carousel draft — flip in place. source_type stays 'carousel_studio'
        // (immutable provenance). No voice-learning side effect.
        const nowIso = new Date().toISOString();
        const { error: upErr } = await supabase
          .from("linkedin_posts")
          .update({
            tracking_status: "published",
            published_at: nowIso,
            post_url: trimmedUrl ?? null,
            published_confirmed_at: trimmedUrl ? nowIso : null,
          })
          .eq("id", id);
        if (upErr) throw upErr;
      } else {
        await insertPublishedLinkedInPost({
          userId: session.user.id,
          postText: item.post_text || "",
          formatType: item.format_type || "post",
          sourceMetadata: item.source_metadata || {},
          sourceSignalId: linkedSignalId,
          url: trimmedUrl ?? null,
          language: (((item.source_metadata as any)?._language ?? (item.source_metadata as any)?.language ?? (isArabicText(item.post_text || "") ? "ar" : "en")) === "ar" ? "ar" : "en"),
          frameworkType: (item as any).framework_type ?? null,
        });
        await supabase
          .from("content_items")
          .update({ status: "published" })
          .eq("id", id);
      }
      setDrafts(prev => prev.filter(p => p.id !== id));
      track("post_published", { signal_id: linkedSignalId || null, route: "manual" });
      // Fetch the related signal title to personalize the ceremony toast.
      let signalTitle = "strategic";
      if (linkedSignalId) {
        const { data: sig } = await supabase
          .from("strategic_signals")
          .select("signal_title")
          .eq("id", linkedSignalId)
          .maybeSingle();
        if (sig?.signal_title) signalTitle = sig.signal_title;
      }
      toast.custom((t) => (
        <div
          className="aura-publish-ceremony"
          style={{
            display: "flex", alignItems: "flex-start", gap: 14,
            padding: "14px 18px",
            borderLeft: "3px solid var(--gold-dark, var(--brand))",
            border: "1px solid var(--brand-line, var(--border))",
            borderRadius: 8,
            boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
            minWidth: 320, maxWidth: 420,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <span aria-hidden className="aura-gold-pulse" style={{
            fontSize: 22, lineHeight: 1, color: "var(--gold-dark, var(--brand))",
            flexShrink: 0, marginTop: 2,
          }}>✦</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: "var(--font-display, var(--font-serif))",
              fontSize: 18, lineHeight: 1.25, color: "var(--ink)", marginBottom: 4,
            }}>
              Published — your digital presence is growing.
            </div>
            <div className="font-normal text-sm text-ink-4">
              {linkedSignalId
                ? `This strengthens your ${signalTitle} positioning.`
                : "Every post compounds your visibility."}
            </div>
          </div>
        </div>
      ), { duration: 4000 });
      loadPosts();
    } catch (e: any) {
      toast.error(e.message || "Couldn't mark as published");
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
    if (error) { toast.error("Couldn't delete"); return; }
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
        {topSignal ? (
          <EmptyState
            icon={PenTool}
            title="Your best posts haven't been written yet"
            description="They're waiting inside your signals. Pick one and let Aura draft something only you could write."
            ctaLabel={`Write about: "${topSignal.signal_title}" →`}
            ctaAction={onSwitchToCreate}
          />
        ) : (
          <EmptyState
            icon={PenTool}
            title="Your best posts haven't been written yet"
            description="They're waiting inside the signals Aura hasn't detected yet. Capture a few articles, then come back."
            ctaLabel="Capture something →"
            ctaAction={() => navigate("/home")}
          />
        )}
      </div>
    );
  }

  // P4: hook = first NON-EMPTY, trimmed line of post_text. Fixes rows whose
  // post_text starts with blank lines (previously rendered as an empty hook).
  const firstNonEmptyLine = (text: string | null | undefined): string => {
    if (!text) return "";
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (t) return t;
    }
    return "";
  };

  // Row-level filter shared by drafts and published sections. Client-side.
  const langOf = (p: SavedPost): "ar" | "en" => {
    const meta = (p as any).source_metadata as any;
    if (meta?._language === "ar") return "ar";
    if (meta?._language === "en") return "en";
    return p.post_text && isArabicText(p.post_text) ? "ar" : "en";
  };
  const searchNeedle = librarySearch.trim().toLowerCase();
  const matchesFilters = (p: SavedPost, status: "draft" | "published"): boolean => {
    if (libraryStatus !== "all" && libraryStatus !== status) return false;
    if (libraryLang !== "all" && langOf(p) !== libraryLang) return false;
    if (searchNeedle) {
      const hay = `${(p as any).title || ""} ${(p as any).post_text || ""}`.toLowerCase();
      if (!hay.includes(searchNeedle)) return false;
    }
    return true;
  };
  const filteredDrafts = drafts.filter(p => matchesFilters(p, "draft"));
  const impressionsOf = (id: string): number => {
    const m = postMetrics[id];
    return typeof m?.impressions === "number" ? m.impressions : -1;
  };
  const applyPublishedSort = (rows: SavedPost[]): SavedPost[] => {
    if (librarySort !== "top") return rows;
    // Rows without metrics sink to the bottom (impressionsOf returns -1).
    return [...rows].sort((a, b) => impressionsOf(b.id) - impressionsOf(a.id));
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 32,
        ['--bg-card' as any]: 'var(--paper-2)',
        ['--bg-subtle' as any]: 'var(--paper-3)',
        ['--color-border' as any]: 'var(--brand-line)',
        ['--color-muted' as any]: 'var(--ink-3)',
      }}
    >
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

      {/* Tutorial — shown once, only when the user has no active LinkedIn connection. */}
      {!hasLinkedIn && (
        <LinkedInPostSteps shareLabel="Post on LinkedIn" />
      )}

      {/* P4: Search + filter chips — System-A styling, client-side only. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input
          type="search"
          value={librarySearch}
          onChange={(e) => setLibrarySearch(e.target.value)}
          placeholder="Search your library"
          dir="auto"
          aria-label="Search library"
          style={{
            width: "100%",
            fontSize: 14,
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid var(--rule)",
            background: "var(--paper-2)",
            color: "var(--ink)",
            outline: "none",
          }}
        />
        <div className="flex items-center flex-wrap" style={{ gap: 16, rowGap: 8 }}>
          <div className="flex items-center" style={{ gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-3)" }}>
              Language
            </span>
            {([
              { k: "all", label: "All" },
              { k: "ar",  label: "AR" },
              { k: "en",  label: "EN" },
            ] as const).map(opt => {
              const active = libraryLang === opt.k;
              return (
                <button
                  key={opt.k}
                  type="button"
                  onClick={() => setLibraryLang(opt.k)}
                  aria-pressed={active}
                  style={{
                    fontSize: 12,
                    fontWeight: active ? 600 : 500,
                    padding: "4px 10px",
                    borderRadius: 999,
                    border: "1px solid var(--rule)",
                    background: active ? "var(--ink)" : "var(--paper-2)",
                    color: active ? "var(--paper)" : "var(--ink)",
                    cursor: "pointer",
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center" style={{ gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-3)" }}>
              Status
            </span>
            {([
              { k: "all",       label: "All" },
              { k: "draft",     label: "Draft" },
              { k: "published", label: "Published" },
            ] as const).map(opt => {
              const active = libraryStatus === opt.k;
              return (
                <button
                  key={opt.k}
                  type="button"
                  onClick={() => setLibraryStatus(opt.k)}
                  aria-pressed={active}
                  style={{
                    fontSize: 12,
                    fontWeight: active ? 600 : 500,
                    padding: "4px 10px",
                    borderRadius: 999,
                    border: "1px solid var(--rule)",
                    background: active ? "var(--ink)" : "var(--paper-2)",
                    color: active ? "var(--paper)" : "var(--ink)",
                    cursor: "pointer",
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {needsReview.length > 0 && (
        <div>
          <div
            className="flex items-center gap-2.5 w-full text-left"
            style={{ borderLeft: "2px solid var(--action, #D6A748)", paddingLeft: 12, marginBottom: 12 }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--action, #D6A748)", margin: 0 }}>
                Needs review
              </h3>
              <span style={{ fontFamily: "var(--font-display, var(--font-serif))", fontSize: 14, fontStyle: "italic", color: "var(--ink-3)", lineHeight: 1.4 }}>
                We couldn't confirm these reached LinkedIn. Check your feed before reposting — don't blind-retry.
              </span>
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 999, backgroundColor: "var(--paper-2)", color: "var(--action, #D6A748)" }}>
              {needsReview.length}
            </span>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {needsReview.map((row) => {
              const text = row.post_text || "";
              const rtl = isArabicText(text);
              return (
                <div
                  key={row.id}
                  style={{
                    border: "1px solid var(--paper-2)",
                    borderLeft: "2px solid var(--action, #D6A748)",
                    padding: 14,
                    background: "var(--paper)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div
                    dir={rtl ? "rtl" : "ltr"}
                    style={{
                      fontSize: 14,
                      lineHeight: 1.5,
                      color: "var(--ink-1)",
                      whiteSpace: "pre-wrap",
                      display: "-webkit-box",
                      WebkitLineClamp: 4,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                      textAlign: rtl ? "right" : "left",
                    }}
                  >
                    {text || <span style={{ fontStyle: "italic", color: "var(--ink-3)" }}>(no text)</span>}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => resolveNeedsReviewLive(row.id)}
                      className="inline-flex items-center gap-1 text-xs font-semibold hover:underline"
                      style={{ color: "var(--brand)", background: "transparent", border: 0, cursor: "pointer", padding: "4px 0" }}
                    >
                      It's live on LinkedIn
                    </button>
                    <button
                      type="button"
                      onClick={() => resolveNeedsReviewDraft(row.id)}
                      className="inline-flex items-center gap-1 text-xs font-medium hover:underline"
                      style={{ color: "var(--color-muted)", background: "transparent", border: 0, cursor: "pointer", padding: "4px 0" }}
                    >
                      Return to drafts
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Section 1: Aura Drafts ── */}
      <div>
        <button
          onClick={() => setShowDrafts(!showDrafts)}
          className="flex items-center gap-2.5 w-full text-left group"
          style={{ borderLeft: "1px solid var(--spot)", paddingLeft: 12, marginBottom: showDrafts ? 12 : 0, background: "none", border: "none", cursor: "pointer", borderLeftWidth: 1, borderLeftStyle: "solid", borderLeftColor: "var(--spot)" }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--spot)", margin: 0 }}>
              Your Drafts
            </h3>
            <span style={{ fontFamily: "var(--font-display, var(--font-serif))", fontSize: 14, fontStyle: "italic", color: "var(--ink-3)", lineHeight: 1.4 }}>
              These are ready to go. One click, and your expertise is out there working for you — even while you sleep.
            </span>
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 999, backgroundColor: "var(--paper-2)", color: "var(--spot)" }}>
            {drafts.length}
          </span>
          <ChevronDown
            className="ml-auto transition-transform duration-200 group-hover:text-primary"
            style={{ width: 16, height: 16, color: "var(--spot)", transform: showDrafts ? "rotate(0deg)" : "rotate(-90deg)" }}
          />
        </button>
        {showDrafts && (filteredDrafts.length === 0 ? (
          <div style={{ background: "var(--paper)", borderRadius: 8, padding: 16, textAlign: "center" }}>
            <p style={{ fontSize: 14, color: "var(--ink-3)" }}>
              {drafts.length === 0
                ? "No drafts yet. Generate content on the Create tab."
                : "No drafts match your search."}
            </p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {filteredDrafts.map(p => {
              const lang = (p.source_metadata as any)?._language || (p.source_metadata as any)?.language || (isArabicText(p.post_text || "") ? "ar" : "en");
              const badge = FORMAT_BADGE[p.format_type || "post"] || FORMAT_BADGE.post;
              const expanded = expandedCards.has(p.id);
              const metrics = postMetrics[p.id];
              const hasMetrics = metrics && (typeof metrics.impressions === "number" || typeof metrics.reactions === "number");
              return (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    background: "var(--paper)",
                    borderLeft: "2px solid var(--spot)",
                    borderRadius: 8,
                    padding: 16,
                    border: "1px solid var(--rule)",
                    borderLeftWidth: 2,
                    borderLeftColor: "var(--spot)",
                    transition: "all 0.2s",
                  }}
                  className="hover:bg-muted/20 hover:border-l-brand"
                >
                  {/* Compact clickable row: hook (1-line) + chips + date + metrics */}
                  <button
                    type="button"
                    onClick={() => toggleCardExpand(p.id)}
                    aria-expanded={expanded}
                    className="w-full text-left flex items-center gap-3"
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
                  >
                    <span
                      className="flex-1 min-w-0 truncate"
                      style={{ fontSize: 14, color: "var(--ink)", lineHeight: 1.5 }}
                      dir="auto"
                    >
                      {firstNonEmptyLine(p.post_text) || "Untitled draft"}
                    </span>
                    <span className="shrink-0 flex items-center" style={{ gap: 6 }}>
                      {(p.source_metadata as any)?.ghost_draft === true || String((p.source_metadata as any)?.ghost_draft) === "true" ? (
                        <span
                          style={{
                            fontFamily: "var(--font-mono, 'IBM Plex Mono', ui-monospace, monospace)",
                            fontSize: 9,
                            letterSpacing: "0.18em",
                            textTransform: "uppercase",
                            color: "#36C5B0",
                            background: "#131009",
                            border: "1px solid rgba(54,197,176,0.4)",
                            padding: "2px 6px",
                            borderRadius: 999,
                          }}
                        >
                          THE OVERNIGHT
                        </span>
                      ) : null}
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 6px", borderRadius: 999, backgroundColor: "var(--paper-2)", color: "var(--ink-3)", textTransform: "uppercase" }}>
                        {lang === "ar" ? "AR" : "EN"}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 6px", borderRadius: 999, backgroundColor: "var(--paper-2)", color: "var(--warning)" }}>
                        Draft
                      </span>
                      <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
                        {formatSmartDate(p.created_at)}
                      </span>
                      {hasMetrics && (
                        <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
                          · {typeof metrics!.impressions === "number" ? `${metrics!.impressions!.toLocaleString()} impressions` : ""}
                          {typeof metrics!.impressions === "number" && typeof metrics!.reactions === "number" ? " · " : ""}
                          {typeof metrics!.reactions === "number" ? `${metrics!.reactions!.toLocaleString()} reactions` : ""}
                        </span>
                      )}
                      <ChevronDown className="w-3.5 h-3.5" style={{ color: "var(--ink-3)", transform: expanded ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }} />
                    </span>
                  </button>

                  {expanded && (
                    <>
                      {/* Full text */}
                      <p style={{ fontSize: 14, color: "var(--ink)", lineHeight: 1.625, marginTop: 12, whiteSpace: "pre-wrap" }} dir="auto">
                        {p.post_text || "Untitled draft"}
                      </p>

                      {/* Source signal label */}
                      {(() => {
                    const sid = (p.source_metadata as any)?.source_signal_id || (p.source_metadata as any)?.signal_ids?.[0];
                    const titleFromMeta = (p.source_metadata as any)?.signal_titles?.[0];
                    const title = titleFromMeta || (sid ? signalTitleMap[sid] : null);
                    if (!title) return null;
                    return (
                      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 8, fontSize: 12, color: "var(--ink-3)" }}>
                        <Lightbulb className="w-3.5 h-3.5" style={{ color: "var(--spot)" }} />
                        <span className="line-clamp-1">From signal: {title}</span>
                      </div>
                    );
                  })()}

                      {/* Format badge (extra chip on expanded state) */}
                      <div className="flex items-center flex-wrap" style={{ gap: 8, marginTop: 10 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 999, backgroundColor: "var(--paper-2)" }} className={badge.cls.includes("text-") ? badge.cls.split(" ").filter(c => c.startsWith("text-")).join(" ") : "text-muted-foreground"}>
                          {badge.label}
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center" style={{ marginTop: 12, gap: 16 }}>
                    <div className="flex-1" />
                    <button
                      onClick={() => p.post_text && handleCopy(p.id, p.post_text)}
                      disabled={!p.post_text}
                      style={{ fontSize: 14, color: "var(--ink-3)", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
                      className="hover:text-foreground transition-colors disabled:opacity-30"
                    >
                      {copiedId === p.id ? <Check className="w-3.5 h-3.5" /> : <Linkedin className="w-3.5 h-3.5" />}
                      {copiedId === p.id ? "Copied" : "Post on LinkedIn →"}
                    </button>
                    <button
                      onClick={() => { setConfirmingId(p.id); setConfirmPubUrl(""); setConfirmPubUrlError(""); }}
                      style={{ fontSize: 14, color: "var(--ink-3)", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
                      className="hover:text-foreground transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" /> Mark as published
                    </button>
                    {onOpenDraft && (
                      <button
                        onClick={() => {
                          const rawType = p.format_type || "linkedin_post";
                          const mappedType: "carousel" | "framework" | "linkedin_post" =
                            rawType === "carousel" ? "carousel" :
                            rawType === "framework" ? "framework" :
                            "linkedin_post";
                          if (p._source === "linkedin_posts" && mappedType === "carousel") {
                            const meta: any = p.source_metadata || {};
                            navigate("/carousel-studio", {
                              state: {
                                draftId: p.id,
                                draftCarousel: {
                                  slides: meta.slides || [],
                                  style: meta.style || "clean_paper",
                                  carousel_title: meta.carousel_title,
                                  hashtags: meta.hashtags || [],
                                  signal_id: meta.signal_id,
                                  lang: meta.lang === "ar" ? "ar" : "en",
                                  linkedin_caption: p.post_text || "",
                                  author_name: meta.author_name,
                                  author_title: meta.author_title,
                                  signal_attribution: meta.signal_attribution,
                                },
                                signalId: meta.signal_id,
                                lang: meta.lang === "ar" ? "ar" : "en",
                              },
                            });
                            return;
                          }
                          onOpenDraft({
                            id: p.id,
                            body: p.post_text || "",
                            language: (((p.source_metadata as any)?._language ?? (p.source_metadata as any)?.language ?? (isArabicText(p.post_text || "") ? "ar" : "en")) === "ar" ? "ar" : "en"),
                            type: mappedType,
                            topic: (p.source_metadata as any)?.topic || null,
                            _source: p._source,
                          });
                        }}
                        title="Edit draft"
                        aria-label="Edit draft"
                        style={{ fontSize: 14, color: "var(--ink-3)", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
                        className="hover:text-foreground transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </button>
                    )}
                    <button
                      onClick={() => setPendingDeleteId(p.id)}
                      style={{ fontSize: 14, color: "var(--error)", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                      className="hover:text-[color:var(--error)] transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Inline confirmation (M-1-1) */}
                  {confirmingId === p.id && (
                    <div style={{ marginTop: 12, padding: 10, background: "var(--paper-2)", borderRadius: 6, display: "flex", flexDirection: "column", gap: 8 }}>
                      <span style={{ fontSize: 14, color: "var(--ink)" }}>Did you publish this on LinkedIn?</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <Input
                          value={confirmPubUrl}
                          onChange={(e) => { setConfirmPubUrl(e.target.value); setConfirmPubUrlError(""); }}
                          placeholder="https://www.linkedin.com/posts/…"
                          className="h-7 text-xs flex-1 min-w-[200px]"
                        />
                        <button
                          onClick={async () => {
                            const err = validateLinkedInUrl(confirmPubUrl);
                            if (err) { setConfirmPubUrlError(err); return; }
                            setConfirmingId(null);
                            await markPublished(p.id, confirmPubUrl.trim() || undefined);
                          }}
                          style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-on-brand)", background: "var(--spot)", border: 0, borderRadius: 4, padding: "5px 10px", cursor: "pointer" }}
                        >Yes, it's live</button>
                        <button
                          onClick={() => { setConfirmingId(null); setConfirmPubUrl(""); setConfirmPubUrlError(""); }}
                          style={{ fontSize: 12, color: "var(--ink-3)", background: "transparent", border: 0, cursor: "pointer" }}
                        >Not yet</button>
                      </div>
                      {confirmPubUrlError ? (
                        <span style={{ fontSize: 12, color: "var(--warning)" }}>{confirmPubUrlError}</span>
                      ) : (
                        <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
                          Optional — paste the post's link so Aura can track how it performs and learn from it.
                        </span>
                      )}
                    </div>
                  )}
                    </>
                  )}
                </motion.div>
              );
            })}
          </div>
        ))}
      </div>

      {/* ── Section 2: Published Posts (collapsed by default) ── */}
      {(() => {
        // Split rows by authorship using explicit predicates. Anything that
        // doesn't match either known bucket falls into a visible "Unclassified"
        // group instead of being silently absorbed — surfaces DB drift fast.
        const AURA_AUTHORSHIP     = new Set(["aura_drafted", "aura_assisted"]);
        const EARLIER_AUTHORSHIP  = new Set(["user_written", "unknown"]);
        // P4: filter published rows by the shared library controls first,
        // then split by authorship. Sort (Recent | Top performing) is applied
        // per-group so counts of the two sortable groups stay accurate.
        const filteredPublished = publishedPosts.filter(p => matchesFilters(p, "published"));
        const auraRows          = applyPublishedSort(filteredPublished.filter((p: any) => AURA_AUTHORSHIP.has(p.authorship)));
        const earlierRows       = applyPublishedSort(filteredPublished.filter((p: any) => EARLIER_AUTHORSHIP.has(p.authorship)));
        const unclassifiedRows  = filteredPublished.filter(
          (p: any) => !AURA_AUTHORSHIP.has(p.authorship) && !EARLIER_AUTHORSHIP.has(p.authorship),
        );

        // Small inline sort toggle placed in the Aura / Earlier group headers.
        const SortToggle = () => (
          <div
            role="group"
            aria-label="Sort published posts"
            onClick={(e) => e.stopPropagation()}
            style={{ display: "inline-flex", gap: 4, marginLeft: 8 }}
          >
            {([
              { k: "recent", label: "Recent" },
              { k: "top",    label: "Top performing" },
            ] as const).map(opt => {
              const active = librarySort === opt.k;
              return (
                <button
                  key={opt.k}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setLibrarySort(opt.k); }}
                  aria-pressed={active}
                  style={{
                    fontSize: 11,
                    fontWeight: active ? 600 : 500,
                    padding: "2px 8px",
                    borderRadius: 999,
                    border: "1px solid var(--rule)",
                    background: active ? "var(--ink)" : "var(--paper-2)",
                    color: active ? "var(--paper)" : "var(--ink-3)",
                    cursor: "pointer",
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        );

        const renderCard = (p: any) => {
              const badge = FORMAT_BADGE[p.format_type || "post"] || FORMAT_BADGE.post;
              const isExternal = (p as any).source_type === "external_reference"
                || (p.source_metadata as any)?.source_type === "external_reference";
              const externalHref = (p as any).post_url || (p as any).linkedin_url || savedUrls[p.id];
              const metrics = postMetrics[p.id];
              const hasMetrics = metrics && (typeof metrics.impressions === "number" || typeof metrics.reactions === "number");
              const hasText = !!(p.post_text && p.post_text.trim().length > 0);
              const expanded = expandedCards.has(p.id);
              const publishedAtMs = (p as any).published_at ? new Date((p as any).published_at).getTime() : 0;
              const older48h = publishedAtMs > 0 && (Date.now() - publishedAtMs) > 48 * 60 * 60 * 1000;
              const savedUrl = savedUrls[p.id];
              const lang = (p.source_metadata as any)?._language || (p.source_metadata as any)?.language || ((p.post_text && isArabicText(p.post_text)) ? "ar" : "en");

              const metricsChunk = hasMetrics ? (
                <>
                  {typeof metrics!.impressions === "number" && <>{metrics!.impressions!.toLocaleString()} impressions</>}
                  {typeof metrics!.impressions === "number" && typeof metrics!.reactions === "number" && " · "}
                  {typeof metrics!.reactions === "number" && <>{metrics!.reactions!.toLocaleString()} reactions</>}
                </>
              ) : (older48h && !savedUrl && p._source === "linkedin_posts" && !isExternal) ? (
                <span style={{ fontStyle: "italic" }}>not linked — expand to add the post URL</span>
              ) : null;

              // Compact row for rows with no post_text: date · metrics · Open on LinkedIn ↗
              if (!hasText) {
                return (
                  <div
                    key={p.id}
                    style={{ background: "var(--paper)", borderRadius: 8, padding: "10px 16px", border: "1px solid var(--rule)", display: "flex", alignItems: "center", gap: 12 }}
                  >
                    <span style={{ fontSize: 12, color: "var(--ink-3)", minWidth: 88 }}>
                      {formatSmartDate((p as any).published_at || p.created_at)}
                    </span>
                    {metricsChunk && (
                      <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{metricsChunk}</span>
                    )}
                    <div style={{ flex: 1 }} />
                    {externalHref ? (
                      <a
                        href={externalHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: 14, color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 5, textDecoration: "none" }}
                        className="hover:text-foreground transition-colors"
                      >
                        <Linkedin className="w-3.5 h-3.5" /> Open on LinkedIn ↗
                      </a>
                    ) : (
                      <span style={{ fontSize: 12, color: "var(--ink-3)", fontStyle: "italic" }}>no link</span>
                    )}
                  </div>
                );
              }

              return (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{ background: "var(--paper)", borderRadius: 8, padding: 16, border: "1px solid var(--rule)", transition: "border-color 0.2s" }}
                  className="hover:border-[color:var(--hairline)]"
                >
                  {/* Compact row: hook (1-line) + chips + date + metrics */}
                  <button
                    type="button"
                    onClick={() => toggleCardExpand(p.id)}
                    aria-expanded={expanded}
                    className="w-full text-left flex items-center gap-3"
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
                  >
                    <span
                      className="flex-1 min-w-0 truncate"
                      style={{ fontSize: 14, color: "var(--ink)", lineHeight: 1.5 }}
                      dir="auto"
                    >
                      {firstNonEmptyLine(p.post_text)}
                    </span>
                    <span className="shrink-0 flex items-center" style={{ gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 6px", borderRadius: 999, backgroundColor: "var(--paper-2)", color: "var(--ink-3)", textTransform: "uppercase" }}>
                        {lang === "ar" ? "AR" : "EN"}
                      </span>
                      {isExternal ? (
                        <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 6px", borderRadius: 999, backgroundColor: "var(--paper-2)", color: "var(--info)" }}>
                          LinkedIn
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 6px", borderRadius: 999, backgroundColor: "var(--paper-2)", color: "var(--success)" }}>
                          Published
                        </span>
                      )}
                      <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
                        {formatSmartDate((p as any).published_at || p.created_at)}
                      </span>
                      {metricsChunk && (
                        <span style={{ fontSize: 11, color: "var(--ink-3)" }}>· {metricsChunk}</span>
                      )}
                      <ChevronDown className="w-3.5 h-3.5" style={{ color: "var(--ink-3)", transform: expanded ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }} />
                    </span>
                  </button>

                  {expanded && (
                    <>
                      <p style={{ fontSize: 14, color: "var(--ink)", lineHeight: 1.625, marginTop: 12, whiteSpace: "pre-wrap" }} dir="auto">
                        {p.post_text}
                      </p>
                      {p.topic_label && (
                        <p style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }} className="line-clamp-1">{p.topic_label}</p>
                      )}
                      {(() => {
                        const sid = (p as any).source_signal_id || (p.source_metadata as any)?.source_signal_id || (p.source_metadata as any)?.signal_ids?.[0];
                        const titleFromMeta = (p.source_metadata as any)?.signal_titles?.[0];
                        const title = titleFromMeta || (sid ? signalTitleMap[sid] : null);
                        if (!title) return null;
                        return (
                          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6, fontSize: 12, color: "var(--ink-3)" }}>
                            <Lightbulb className="w-3.5 h-3.5" style={{ color: "var(--spot)" }} />
                            <span className="line-clamp-1">From signal: {title}</span>
                          </div>
                        );
                      })()}
                      <div className="flex items-center flex-wrap" style={{ gap: 8, marginTop: 10 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 999, backgroundColor: "var(--paper-2)" }} className={badge.cls.includes("text-") ? badge.cls.split(" ").filter(c => c.startsWith("text-")).join(" ") : "text-muted-foreground"}>
                          {badge.label}
                        </span>
                      </div>
                      <div className="flex items-center" style={{ marginTop: 12, gap: 16 }}>
                        <div className="flex-1" />
                        {externalHref && (
                          <a
                            href={externalHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: 14, color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 5, textDecoration: "none" }}
                            className="hover:text-foreground transition-colors"
                          >
                            <Linkedin className="w-3.5 h-3.5" /> Open on LinkedIn ↗
                          </a>
                        )}
                        <button
                          onClick={() => p.post_text && handleCopy(p.id, p.post_text)}
                          disabled={!p.post_text}
                          style={{ fontSize: 14, color: "var(--ink-3)", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
                          className="hover:text-foreground transition-colors disabled:opacity-30"
                        >
                          {copiedId === p.id ? <Check className="w-3.5 h-3.5" /> : <Linkedin className="w-3.5 h-3.5" />}
                          {copiedId === p.id ? "Copied" : "Post on LinkedIn →"}
                        </button>
                        {onWriteFromPost && p.post_text && (
                          <button
                            onClick={() => {
                              const topic = firstNonEmptyLine(p.post_text) || "Write from this post";
                              const context = (p.post_text || "").slice(0, 4000);
                              onWriteFromPost({
                                topic,
                                context,
                                sourceType: "past_post",
                                sourceTitle: topic,
                                contentFormat: "post",
                                source: "library_past_post",
                              });
                            }}
                            style={{ fontSize: 14, color: "var(--spot)", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
                            className="hover:opacity-80 transition-opacity"
                            title="Draft a new post inspired by this one"
                          >
                            <Pencil className="w-3.5 h-3.5" /> Write from this →
                          </button>
                        )}
                        <button
                          onClick={() => setPendingDeleteId(p.id)}
                          style={{ fontSize: 14, color: "var(--error)", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                          className="hover:text-[color:var(--error)] transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* URL field only appears when this row has no saved URL */}
                      {p._source === "linkedin_posts" && !savedUrl && (
                        <div style={{ marginTop: 10, display: "flex", gap: 6, alignItems: "center" }}>
                          <input
                            type="url"
                            placeholder="Paste your LinkedIn post URL to track performance"
                            value={urlDrafts[p.id] || ""}
                            onChange={(e) => setUrlDrafts(prev => ({ ...prev, [p.id]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === "Enter") saveLinkedInUrl(p.id, urlDrafts[p.id] || ""); }}
                            maxLength={500}
                            style={{ flex: 1, fontSize: 12, padding: "6px 10px", borderRadius: 4, border: "1px solid var(--rule)", background: "var(--paper-2)", color: "var(--ink)" }}
                          />
                          <button
                            onClick={() => saveLinkedInUrl(p.id, urlDrafts[p.id] || "")}
                            disabled={!urlDrafts[p.id]?.trim()}
                            aria-label="Save LinkedIn URL"
                            style={{ background: "var(--spot)", color: "var(--paper)", border: 0, borderRadius: 4, padding: "6px 8px", cursor: "pointer", display: "inline-flex", alignItems: "center", opacity: urlDrafts[p.id]?.trim() ? 1 : 0.5 }}
                          >
                            <Save className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </motion.div>
              );
        };

        return (
          <>
            {/* Group A — Written with Aura (default open) */}
            <div>
              <button
                onClick={() => setShowPublished(!showPublished)}
                className="flex items-center gap-2.5 w-full text-left group"
                style={{ borderLeft: "1px solid var(--ink-7)", paddingLeft: 12, marginBottom: showPublished ? 12 : 0, background: "none", border: "none", cursor: "pointer", borderLeftWidth: 1, borderLeftStyle: "solid", borderLeftColor: "var(--ink-7)" }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-3)", margin: 0 }}>
                    Written with Aura
                  </h3>
                  <span style={{ fontFamily: "var(--font-display, var(--font-serif))", fontSize: 14, fontStyle: "italic", color: "var(--ink-3)", lineHeight: 1.4 }}>
                    Posts you shipped through Aura — engagement flows back to strengthen your signals
                  </span>
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 999, backgroundColor: "var(--paper-2)", color: "var(--ink-3)" }}>
                  {auraTotal}
                </span>
                <SortToggle />
                <ChevronDown
                  className="ml-auto transition-transform duration-200 group-hover:text-primary"
                  style={{ width: 16, height: 16, color: "var(--ink-3)", transform: showPublished ? "rotate(0deg)" : "rotate(-90deg)" }}
                />
              </button>
              {showPublished && (
                <div style={{ display: "grid", gap: 12 }}>
                  {auraRows.length === 0 ? (
                    <div style={{ background: "var(--paper)", borderRadius: 8, padding: 16, textAlign: "center" }}>
                      <p style={{ fontSize: 14, color: "var(--ink-3)" }}>
                        {(searchNeedle || libraryLang !== "all" || libraryStatus !== "all")
                          ? "No posts match your search."
                          : "Nothing published through Aura yet. Your first post from a signal lands here."}
                      </p>
                    </div>
                  ) : (
                    <>
                      {auraRows.map(renderCard)}
                      {auraRows.length < auraTotal && (
                        <div style={{ textAlign: "center", fontSize: 12, color: "var(--ink-3)", padding: "8px 0" }}>
                          Showing {auraRows.length} of {auraTotal}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Group B — Your earlier work (collapsed by default). */}
            {earlierTotal > 0 && (
              <div>
                <button
                  onClick={() => setShowEarlier(!showEarlier)}
                  className="flex items-center gap-2.5 w-full text-left group"
                  style={{ borderLeft: "1px solid var(--ink-7)", paddingLeft: 12, marginBottom: showEarlier ? 12 : 0, background: "none", border: "none", cursor: "pointer", borderLeftWidth: 1, borderLeftStyle: "solid", borderLeftColor: "var(--ink-7)" }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-3)", margin: 0 }}>
                      Your earlier work
                    </h3>
                    <span style={{ fontFamily: "var(--font-display, var(--font-serif))", fontSize: 14, fontStyle: "italic", color: "var(--ink-3)", lineHeight: 1.4 }}>
                      Posts Aura learned about — imported from your LinkedIn history or discovered on the web
                    </span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 999, backgroundColor: "var(--paper-2)", color: "var(--ink-3)" }}>
                    {earlierTotal}
                  </span>
                  <SortToggle />
                  <ChevronDown
                    className="ml-auto transition-transform duration-200 group-hover:text-primary"
                    style={{ width: 16, height: 16, color: "var(--ink-3)", transform: showEarlier ? "rotate(0deg)" : "rotate(-90deg)" }}
                  />
                </button>
                {showEarlier && (
                  <div style={{ display: "grid", gap: 12 }}>
                    {earlierRows.map(renderCard)}
                    {earlierRows.length < earlierTotal && (
                      <div style={{ textAlign: "center", fontSize: 12, color: "var(--ink-3)", padding: "8px 0" }}>
                        Showing {earlierRows.length} of {earlierTotal}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Group C — Unclassified. Only appears if the DB drifts (authorship
                outside the known enum). Renders in a visible red-tinted band so
                nothing can silently disappear into A or B. */}
            {unclassifiedRows.length > 0 && (
              <div>
                <div
                  className="flex items-center gap-2.5 w-full text-left"
                  style={{ borderLeft: "2px solid var(--color-destructive, #b45309)", paddingLeft: 12, marginBottom: 12 }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-destructive, #b45309)", margin: 0 }}>
                      Unclassified
                    </h3>
                    <span style={{ fontFamily: "var(--font-display, var(--font-serif))", fontSize: 14, fontStyle: "italic", color: "var(--ink-3)", lineHeight: 1.4 }}>
                      Authorship label doesn't match a known bucket — surfaced here so it isn't hidden.
                    </span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 999, backgroundColor: "var(--paper-2)", color: "var(--color-destructive, #b45309)" }}>
                    {unclassifiedRows.length}
                  </span>
                </div>
                <div style={{ display: "grid", gap: 12 }}>
                  {unclassifiedRows.map(renderCard)}
                </div>
              </div>
            )}
          </>
        );
      })()}

      {/* ── Section 3: Frameworks ── */}
      <FrameworkLibrarySection pendingDeleteId={pendingDeleteId} setPendingDeleteId={setPendingDeleteId} expandedCards={expandedCards} toggleCardExpand={toggleCardExpand} />
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
  draftPrefill?: DraftPrefill | null;
  onDraftPrefillConsumed?: () => void;
  onOpenDraft?: (draft: { id: string; body: string; language: "en" | "ar"; type: "carousel" | "framework" | "linkedin_post"; topic?: string | null; _source?: "content_items" | "linkedin_posts" }) => void;
}

const TABS: { key: AuthoritySubTab; label: string; icon: typeof PenTool }[] = [
  { key: "create", label: "Create", icon: PenTool },
  { key: "library", label: "Library", icon: BookOpen },
  { key: "plan", label: "Plan", icon: Calendar },
];

const AuthorityTab = ({ entries, onRefresh, signalPrefill, onSignalPrefillConsumed, draftPrefill, onDraftPrefillConsumed, onOpenDraft }: AuthorityTabProps) => {
  const [activeTab, setActiveTab] = useState<AuthoritySubTab>("create");
  const [brandDone, setBrandDone] = useState<boolean | null>(null);
  const [planPrefill, setPlanPrefill] = useState<PlanPrefill | null>(null);
  // Local prefill channel for "Write from this" in the Library. Reuses the
  // same SignalPrefill contract CreateTab already consumes.
  const [libraryPrefill, setLibraryPrefill] = useState<SignalPrefill | null>(null);
  const effectiveSignalPrefill = signalPrefill ?? libraryPrefill;
  const handleSignalPrefillConsumed = () => {
    setLibraryPrefill(null);
    onSignalPrefillConsumed?.();
  };

  useEffect(() => {
    supabase.from("diagnostic_profiles").select("brand_assessment_completed_at").limit(1).maybeSingle()
      .then(({ data }) => setBrandDone(!!data?.brand_assessment_completed_at));
  }, []);

  const handleGenerateFromPlan = (prefill: PlanPrefill) => {
    setPlanPrefill({ ...prefill });
    setActiveTab("create");
  };

  // When signalPrefill arrives (external or from library), switch to create tab
  useEffect(() => {
    if (effectiveSignalPrefill) {
      setActiveTab("create");
    }
  }, [effectiveSignalPrefill]);

  // When draftPrefill arrives (user opened an existing draft), switch to create tab
  useEffect(() => {
    if (draftPrefill) {
      setActiveTab("create");
    }
  }, [draftPrefill]);

  return (
    <div className="publish-page space-y-8" style={{ background: "var(--paper)", minHeight: "100%" }}>
      <FirstVisitHint page="publish" />
      {/* Branded header — visible on every sub-tab (Create, Library, Plan) */}
      <div>
        <div className="pub-micro" style={{ marginBottom: 6 }}>
          Your content engine
        </div>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 34, fontWeight: 500, color: "var(--ink)", letterSpacing: "-0.02em", margin: 0 }}>
          Composer
        </h1>
        <p style={{ fontSize: 14, color: "var(--ink-3)", marginTop: 8, lineHeight: 1.5, maxWidth: 640 }}>
          You already know things most people in your sector don't. This is where that knowledge becomes content that opens doors.
        </p>
      </div>
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
          background: "var(--paper-2)",
          borderRadius: 12,
          padding: 4,
          border: "0.5px solid var(--rule)",
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
                fontFamily: "var(--font-serif), Georgia, serif",
                background: active ? "var(--paper)" : "transparent",
                color: active ? "var(--ink)" : "var(--ink-3)",
                fontWeight: active ? 600 : 500,
                boxShadow: active ? "0 1px 2px rgba(27,23,18,0.08)" : "none",
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

      {activeTab === "create" && <CreateTab planPrefill={planPrefill} signalPrefill={effectiveSignalPrefill} onSignalPrefillConsumed={handleSignalPrefillConsumed} draftPrefill={draftPrefill} onDraftPrefillConsumed={onDraftPrefillConsumed} onGoToLibrary={() => setActiveTab("library")} />}
      {activeTab === "plan" && <PlanTab onGenerateFromPlan={handleGenerateFromPlan} />}
      {activeTab === "library" && <LibraryTab onSwitchToCreate={() => setActiveTab("create")} onOpenDraft={onOpenDraft} onWriteFromPost={(prefill) => { setLibraryPrefill(prefill); setActiveTab("create"); }} />}
    </div>
  );
};

export default AuthorityTab;
