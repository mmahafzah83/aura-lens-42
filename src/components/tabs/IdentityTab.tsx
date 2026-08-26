import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Pencil, Check, Eye, Map as MapIcon, Trophy, Target as TargetIcon, Star, Camera, Mic } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import ProfileIntelligence from "@/components/ProfileIntelligence";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { FirstTimeHint } from "@/components/FirstTimeHint";
import MilestonesSection from "@/components/MilestonesSection";
import AuditRadarWidget from "@/components/AuditRadarWidget";
import ObjectiveAuditModal from "@/components/ObjectiveAuditModal";
import BrandAssessmentModal from "@/components/BrandAssessmentModal";
import ReportVersions from "@/components/identity/ReportVersions";
import BrandReportSection from "@/components/identity/BrandReportSection";
import { CollapseStyles } from "@/components/common/CollapseBlock";
import SectionError from "@/components/ui/section-error";
import { withTimeout, showQueryErrorToast } from "@/lib/safeQuery";
import { useAuthReady } from "@/hooks/useAuthReady";
import MarketMirror from "@/components/MarketMirror";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import MilestoneShareModal, { type MilestoneShareData } from "@/components/MilestoneShareModal";
import { computeIntelligenceStage, type IntelligenceStage } from "@/components/ui/IntelligenceStageBadge";
import FirstVisitHint from "@/components/ui/FirstVisitHint";
import AuraCardPanel from "@/components/AuraCardPanel";
import GuidedJourney from "@/components/GuidedJourney";
import { useJourneyState } from "@/hooks/useJourneyState";

import VoiceWorkspace from "@/components/voice/VoiceWorkspace";
import HowYouAppear from "@/components/identity/HowYouAppear";
import { useCelebrationsEnabled } from "@/hooks/useCelebrationsEnabled";
import { useTierFromImprint } from "@/hooks/useTierFromImprint";

import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { shareToLinkedIn } from "@/lib/shareLinkedIn";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import ReadShape from "@/components/identity/ReadShape";
import CvCrosscheck, { type CvCrosscheckState } from "@/components/report/CvCrosscheck";
import CvUploadControl from "@/components/cv/CvUploadControl";
import ErrorBoundary from "@/components/ErrorBoundary";
import { handoffSubject, type SubjectHandoff } from "@/lib/workHandoff";
import {
  applyPublishedFilter,
  applyCatalogFilter,
  filterPublishedRows,
} from "@/lib/postProvenance";


const prettify = (s?: string) =>
  (s || "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (m) => m.toUpperCase());

/** Four panes. Old keys map forward so existing URLs never 404. Module scope: stable across renders. */
type PaneKey = "appear" | "voice" | "standing" | "show";
const PANE_ALIAS: Record<string, PaneKey> = {
  appear: "appear",
  identity: "appear",
  voice: "voice",
  standing: "standing",
  insights: "standing",
  record: "standing",
  show: "show",
  report: "show",
  reports: "show",
  card: "show",
  cards: "show",
};

/** "What you can show" stack — 16px between its cards. */
const SHOW_STACK: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 16,
};
const PANE_SUBLINE: React.CSSProperties = { fontSize: 13.5, color: "#5B6673", marginTop: 2 };

/** "Where you stand" is one continuous section — 16px between its cards. */
const STANDING_STACK: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 16,
};

interface IdentityTabProps {
  onResetDiagnostic: () => void;
  onSwitchTab?: (tab: string) => void;
  /** One shape for every handoff — see src/lib/workHandoff.ts. */
  onDraftToStudio?: (prefill: SubjectHandoff) => void;
}

interface ProfileRow {
  first_name: string | null;
  last_name: string | null;
  level: string | null;
  firm: string | null;
  sector_focus: string | null;
  seniority_band?: string | null;
  core_practice: string | null;
  north_star_goal: string | null;
  brand_pillars: string[];
  avatar_url: string | null;
  onboarding_completed: boolean;
  audit_completed_at: string | null;
  audit_method: string | null;
  brand_assessment_completed_at: string | null;
  brand_assessment_results: any;
  identity_intelligence: any;
  primary_strength: string | null;
  instrument_version?: number | null;
}

const IdentityTab = ({ onResetDiagnostic, onSwitchTab, onDraftToStudio }: IdentityTabProps) => {
  const { user: authUser, isReady: authReady } = useAuthReady();
  const { enabled: celebrationsEnabled } = useCelebrationsEnabled();
  const journey = useJourneyState(authUser?.id ?? null);
  // Canonical score: imprint_snapshots (same source as Home/Observatory).
  
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [scoreTotal, setScoreTotal] = useState<number | null>(null);
  
  // Score components + tier-boundary inputs for live Journey derivation
  const [scoreComponents, setScoreComponents] = useState<{ signal: number; content: number; capture: number } | null>(null);
  // EF-provided tier boundary data — replaces local threshold math.
  const [nextTierFromEF, setNextTierFromEF] = useState<{ name: string | null; pointsToNext: number | null }>({ name: null, pointsToNext: null });
  const [thisWeekEntries, setThisWeekEntries] = useState<number>(0);
  const [topApproachingLive, setTopApproachingLive] = useState<{ title: string; strength: number } | null>(null);
  const [signalStats, setSignalStats] = useState({
    count: 0,
    topConfidence: 0,
    totalOrgs: 0,
    topTags: [] as string[],
    themeGroups: [] as { theme: string; count: number; avgConfidence: number }[],
    topSignal: null as { title: string; confidence: number } | null,
    topOrgs: [] as string[],
  });
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [, setRadarRefreshKey] = useState(0);
  
  const [brandOpen, setBrandOpen] = useState(false);
  const [fullProfileOpen, setFullProfileOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [showFullPositioning, setShowFullPositioning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loadError, setLoadError] = useState(false);
  const [autoAssessing, setAutoAssessing] = useState(false);
  const [assessmentStep, setAssessmentStep] = useState("");
  const autoAssessTriggered = useRef(false);
  
  const [marketShareData, setMarketShareData] = useState<MilestoneShareData | null>(null);
  const [entryCount, setEntryCount] = useState<number>(0);
  const [trackedPostCount, setTrackedPostCount] = useState<number>(0);
  const [, setPublishedPostCount] = useState<number>(0);
  
  const [, setMilestoneData] = useState<{ id: string; name: string; earned: boolean; earned_at: string | null; context: any }[]>([]);
  /* The newest CV on file, and when the stored cross-check was written. */
  const [cvDoc, setCvDoc] = useState<{ status: string | null; created_at: string | null } | null>(null);
  const [cvCrosscheckAt, setCvCrosscheckAt] = useState<string | null>(null);
  const [radarInputs, setRadarInputs] = useState({
    avgEngagement: 0,
    totalPosts: 0,
    voiceTrained: false,
    weeksActive: 0,
  });

  useEffect(() => {
    if (!authReady) return;
    if (!authUser) {
      console.log("[IdentityTab] blocked: auth ready but no user");
      setLoading(false);
      return;
    }
    loadAll(authUser.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, authUser]);

  // Load milestones for the timeline (same source as MilestonesSection)
  useEffect(() => {
    if (!authReady || !authUser) return;
    let cancelled = false;
    (async () => {
      try {
        await supabase.auth.getSession();
        const { data: res, error } = await invokeEdgeFunction("calculate-aura-score", { body: {} });
        if (!cancelled && !error && res) {
          const r = res as any;
          if (Array.isArray(r.milestones)) setMilestoneData(r.milestones);
          setNextTierFromEF({
            name: r.next_tier_name ?? null,
            pointsToNext: typeof r.points_to_next === "number" ? r.points_to_next : null,
          });
        }
      } catch (e) {
        console.warn("[IdentityTab] milestones load failed", e);
      }
    })();
    return () => { cancelled = true; };
  }, [authReady, authUser]);

  const navigate = useNavigate();

  // Pane state — the URL search param `story` is the single source of truth.
  const [searchParams, setSearchParams] = useSearchParams();
  const storyParam = searchParams.get("story");
  const pane: PaneKey = PANE_ALIAS[storyParam ?? ""] ?? "appear";
  const setPane = (next: PaneKey) => {
    const params = new URLSearchParams(searchParams);
    if (next === "appear") params.delete("story");
    else params.set("story", next);
    setSearchParams(params);
  };

  useEffect(() => {
    const openAssessment = () => setBrandOpen(true);
    const openProfileEditor = () => {
      // Scroll the inline ProfileManagement section into view
      requestAnimationFrame(() => {
        const el = document.querySelector('[data-testid="story-strategic-identity"]');
        if (el && "scrollIntoView" in el) (el as HTMLElement).scrollIntoView({ behavior: "smooth", block: "start" });
      });
    };
    window.addEventListener("aura:open-brand-assessment", openAssessment);
    window.addEventListener("aura:open-profile-editor", openProfileEditor);
    return () => {
      window.removeEventListener("aura:open-brand-assessment", openAssessment);
      window.removeEventListener("aura:open-profile-editor", openProfileEditor);
    };
  }, []);

  // Auto-trigger the brand-assessment → identity-intelligence → market-mirror chain
  // for users who just finished onboarding but haven't run the assessment yet.
  useEffect(() => {
    if (!profile || !authUser) return;
    if (autoAssessTriggered.current) return;
    const isOnboarded = !!profile.onboarding_completed;
    const hasAssessment = !!profile.brand_assessment_completed_at;
    if (!isOnboarded || hasAssessment) return;

    autoAssessTriggered.current = true;
    setAutoAssessing(true);
    (async () => {
      try {
        setAssessmentStep("Analyzing your professional identity…");
        await supabase.functions.invoke("brand-assessment", { body: {} });
        setAssessmentStep("Mapping your expertise territories…");
        await supabase.functions.invoke("generate-identity-intelligence", { body: {} });
        setAssessmentStep("Generating how the market sees you…");
        await supabase.functions.invoke("generate-market-mirror", { body: {} });
        await loadAll(authUser.id);
      } catch (err) {
        console.error("[IdentityTab] Auto-assessment chain failed:", err);
      } finally {
        setAutoAssessing(false);
      }
    })();
  }, [profile, authUser]);

  const loadAll = async (uid: string) => {
    console.log("[IdentityTab] loadAll started");
    setLoadError(false);
    setLoading(true);
    try {
      const [profileRes, signalsRes] = await withTimeout(Promise.all([
        (supabase.from("diagnostic_profiles" as any) as any)
          .select("first_name, last_name, level, firm, sector_focus, seniority_band, core_practice, north_star_goal, brand_pillars, avatar_url, onboarding_completed, audit_completed_at, audit_method, brand_assessment_completed_at, brand_assessment_results, identity_intelligence, primary_strength, instrument_version")
          .eq("user_id", uid).maybeSingle(),
        (supabase.from("strategic_signals") as any)
          .select("signal_title, confidence, unique_orgs, theme_tags, supporting_evidence_ids, strength_score, lifecycle_tier")
          .eq("user_id", uid).eq("status", "active")
          .order("confidence", { ascending: false }).limit(40),
      ]), 12000);

      if (profileRes.data) {
        setProfile(profileRes.data);
      } else {
        // Empty stub so the page renders an actionable shell (assessment CTA + ProfileManagement editor)
        setProfile({
          first_name: null, last_name: null, level: null, firm: null, sector_focus: null, seniority_band: null,
          core_practice: null, north_star_goal: null, brand_pillars: [],
          avatar_url: null, onboarding_completed: false, audit_completed_at: null,
          audit_method: null, brand_assessment_completed_at: null, brand_assessment_results: null,
          identity_intelligence: null, primary_strength: null, instrument_version: null,
        } as ProfileRow);
      }
      
      // score_snapshots is used ONLY for the component breakdown bars.
      // The headline number/tier comes from imprint_snapshots via useTierFromImprint.
      try {
        const { data: snap } = await (supabase.from("score_snapshots" as any) as any)
          .select("components, score")
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (snap) {
          const c = (snap as any).components || {};
          const sig = Number(c.signal_score) || 0;
          const con = Number(c.content_score) || 0;
          const cap = Number(c.capture_score) || 0;
          // Persisted snapshot total (breakdown context only — never the headline).
          const total = Number((snap as any).score) || null;
          setScoreTotal(total);
          setScoreComponents({ signal: sig, content: con, capture: cap });
        }
      } catch (e) {
        console.warn("[IdentityTab] score snapshot load failed", e);
      }
      // Stage counts — entries + tracked LinkedIn posts (lightweight head queries)
      try {
        const [entriesCountRes, postsCountRes, publishedCountRes] = await Promise.all([
          (supabase.from("entries") as any)
            .select("id", { count: "exact", head: true })
            .eq("user_id", uid)
            .eq("source_type", "user"),
          applyCatalogFilter(
            (supabase.from("linkedin_posts") as any)
              .select("id", { count: "exact", head: true })
              .eq("user_id", uid),
          ),
          applyPublishedFilter(
            (supabase.from("linkedin_posts") as any)
              .select("source_type, tracking_status")
              .eq("user_id", uid),
          ),
        ]);
        setEntryCount(entriesCountRes.count || 0);
        setTrackedPostCount(postsCountRes.count || 0);
        setPublishedPostCount(
          filterPublishedRows((publishedCountRes as any).data || []).length,
        );
      } catch (e) {
        console.warn("[IdentityTab] stage counts failed", e);
      }
      // Radar inputs — voice profile, posts engagement, capture rhythm
      try {
        const fourWeeksAgo = new Date(); fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
        const [voiceRes, postsRes, recentEntriesRes] = await Promise.all([
          (supabase.from("authority_voice_profiles") as any)
            .select("tone, example_posts").eq("user_id", uid).eq("is_primary", true).eq("mode_key", "default").maybeSingle(),
          (supabase.from("linkedin_posts") as any)
            .select("engagement_score").eq("user_id", uid).limit(200),
          (supabase.from("entries") as any)
            .select("created_at").eq("user_id", uid).eq("source_type", "user")
            .gte("created_at", fourWeeksAgo.toISOString()).limit(500),
        ]);
        const posts = (postsRes.data || []) as any[];
        const totalPosts = posts.length;
        const avgEngagement = totalPosts > 0
          ? posts.reduce((s, p) => s + (Number(p.engagement_score) || 0), 0) / totalPosts
          : 0;
        const voice = voiceRes.data || {};
        const voiceTrained = !!(voice?.tone || (Array.isArray(voice?.example_posts) && voice.example_posts.length > 0));
        const weeks = new Set<number>();
        let wk0 = 0;
        ((recentEntriesRes.data || []) as any[]).forEach((e) => {
          const d = new Date(e.created_at);
          const week = Math.floor((Date.now() - d.getTime()) / (7 * 86400000));
          if (week >= 0 && week < 4) weeks.add(week);
          if (week === 0) wk0 += 1;
        });
        setRadarInputs({ avgEngagement, totalPosts, voiceTrained, weeksActive: weeks.size });
        setThisWeekEntries(wk0);
      } catch (e) {
        console.warn("[IdentityTab] radar inputs failed", e);
      }
      if (signalsRes.data) {
        const signals = signalsRes.data as any[];
        // Predicate: "approaching Live" = lifecycle_tier in {emerging, evergreen} AND strength_score >= 0.7
        const approaching = signals.find((s: any) => {
          const tier = String(s?.lifecycle_tier || "").toLowerCase();
          const strength = Number(s?.strength_score) || 0;
          return (tier === "emerging" || tier === "evergreen") && strength >= 0.7;
        });
        if (approaching) {
          setTopApproachingLive({
            title: approaching.signal_title || "",
            strength: Number(approaching.strength_score) || 0,
          });
        } else {
          setTopApproachingLive(null);
        }
        const seen = new Set<string>();
        const topTags: string[] = [];
        for (const sig of signals) {
          const tags: string[] = Array.isArray(sig.theme_tags) ? sig.theme_tags : [];
          for (const t of tags) {
            if (!t) continue;
            const key = t.trim().toLowerCase();
            if (key && !seen.has(key)) {
              seen.add(key);
              topTags.push(t.trim());
              if (topTags.length >= 6) break;
            }
          }
          if (topTags.length >= 6) break;
        }

        // Group signals by theme tag → average confidence + count
        const themeMap = new Map<string, { conf: number[]; count: number }>();
        for (const sig of signals) {
          const tags: string[] = Array.isArray(sig.theme_tags) ? sig.theme_tags : [];
          for (const raw of tags) {
            const t = (raw || "").trim();
            if (!t) continue;
            const existing = themeMap.get(t) || { conf: [], count: 0 };
            existing.conf.push(Number(sig.confidence) || 0);
            existing.count += 1;
            themeMap.set(t, existing);
          }
        }
        const themeGroups = Array.from(themeMap.entries())
          .map(([theme, v]) => ({
            theme,
            count: v.count,
            avgConfidence: v.conf.reduce((a, b) => a + b, 0) / v.conf.length,
          }))
          .sort((a, b) => b.avgConfidence - a.avgConfidence)
          .slice(0, 8);

        const topSignal = signals[0]
          ? { title: signals[0].signal_title || "", confidence: Math.round(Number(signals[0].confidence) * 100) }
          : null;

        // Pull top org names from evidence_fragments referenced by these signals
        const allEvidenceIds = Array.from(new Set(
          signals.flatMap((s: any) => Array.isArray(s.supporting_evidence_ids) ? s.supporting_evidence_ids : [])
        )).slice(0, 60);
        let topOrgs: string[] = [];
        if (allEvidenceIds.length > 0) {
          const { data: frags } = await (supabase.from("evidence_fragments") as any)
            .select("entities").in("id", allEvidenceIds);
          const orgCounts = new Map<string, number>();
          (frags || []).forEach((f: any) => {
            const ents: any[] = Array.isArray(f.entities) ? f.entities : [];
            ents.forEach((e) => {
              const t = (e?.type || "").toLowerCase();
              const name = (e?.name || "").trim();
              if (!name) return;
              if (t === "organization" || t === "company" || t === "firm") {
                orgCounts.set(name, (orgCounts.get(name) || 0) + 1);
              }
            });
          });
          topOrgs = Array.from(orgCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([n]) => n);
        }

        setSignalStats({
          count: signals.length,
          topConfidence: signals.length > 0 ? Math.round(Number(signals[0].confidence) * 100) : 0,
          totalOrgs: signals.reduce((s: number, sig: any) => s + (sig.unique_orgs || 0), 0),
          topTags,
          themeGroups,
          topSignal,
          topOrgs,
        });
      }
    } catch (err) {
      console.error("[IdentityTab] loadAll failed", err);
      setLoadError(true);
      showQueryErrorToast();
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (field: string, currentValue: string) => {
    setEditingField(field);
    setEditValue(currentValue);
  };

  const saveEdit = async (field: string) => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const { error } = await (supabase.from("diagnostic_profiles" as any) as any)
      .update({ [field]: editValue }).eq("user_id", user.id);
    setSaving(false);
    if (error) { toast.error("We couldn't save that. Please try again."); return; }
    setProfile(prev => prev ? { ...prev, [field]: editValue } : prev);
    setEditingField(null);
    toast.success("Updated");
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = urlData.publicUrl + "?t=" + Date.now();
      const { error: profErr } = await (supabase.from("diagnostic_profiles" as any) as any)
        .update({ avatar_url: publicUrl }).eq("user_id", user.id);
      if (profErr) throw profErr;
      setProfile(prev => prev ? { ...prev, avatar_url: publicUrl } : prev);
      toast.success("Photo updated");
    } catch (err: any) {
      toast.error("Upload failed");
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const regeneratePositioning = async () => {
    setRegenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-brand-positioning`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({}),
      });
      if (!resp.ok) throw new Error("Failed");
      toast.success("Positioning rewritten");
      if (authUser) loadAll(authUser.id);
    } catch {
      toast.error("Couldn't rewrite your positioning just now.");
    } finally {
      setRegenerating(false);
    }
  };

  const handleNavigate = (target: string) => {
    if (target === "intelligence" && onSwitchTab) onSwitchTab("intelligence");
  };

  const handleGenerateContent = (topic: string, context?: string) => {
    if (onDraftToStudio) {
      onDraftToStudio(handoffSubject({
        topic,
        context: context || "",
        sourceType: "authority_next",
        sourceTitle: topic,
        contentFormat: "post",
        surface: "my_story",
      }));
    } else if (onSwitchTab) {
      onSwitchTab("authority");
    }
  };

  const fullName = [profile?.first_name, (profile as any)?.last_name].filter(Boolean).join(" ").trim();
  const userName = fullName || "You";
  const initials = (() => {
    const fn = (profile?.first_name || "").trim();
    const ln = ((profile as any)?.last_name || "").trim();
    if (fn && ln) return (fn[0] + ln[0]).toUpperCase();
    if (fn) return fn[0].toUpperCase();
    return "Y";
  })();

  // Extract positioning data from brand_assessment_results or identity_intelligence
  const brandResults = profile?.brand_assessment_results || {};
  const identityIntel = profile?.identity_intelligence || {};
  const positioningTitle = brandResults?.positioning_title || brandResults?.primary_archetype || identityIntel?.primary_role || profile?.primary_strength || "";
  const positioningStatement = brandResults?.positioning_statement || identityIntel?.identity_summary || brandResults?.interpretation || "";

  const assessments = [
    { name: "Onboarding", done: profile?.onboarding_completed, date: null },
    { name: "Evidence Audit", done: !!profile?.audit_completed_at, date: profile?.audit_completed_at },
    { name: "Brand Assessment", done: !!profile?.brand_assessment_completed_at, date: profile?.brand_assessment_completed_at },
  ];

  const identityFacts = [
    { key: "firm", label: "Firm", value: profile?.firm || "" },
    { key: "sector_focus", label: "Sector", value: profile?.sector_focus || "" },
    { key: "north_star_goal", label: "How I lead", value: profile?.north_star_goal || "" },
    { key: "core_practice", label: "Specialises in", value: profile?.core_practice || "" },
  ];

  const showSkeleton = useDelayedFlag(loading && !profile, 200);

  const intelligenceStage: IntelligenceStage | null = computeIntelligenceStage({
    brandAssessmentDone: !!profile?.brand_assessment_completed_at,
    entryCount,
    signalCount: signalStats.count,
    trackedPostCount,
  });

  const assessmentCompleted = !!profile?.brand_assessment_completed_at;

  if (loading && !profile) {
    if (!showSkeleton) {
      // Brief boot window — render nothing instead of flashing a skeleton
      return <div className="min-h-[400px]" aria-busy="true" />;
    }
    return (
      <div className="flex gap-6 animate-fade-in">
        <div className="w-[200px] shrink-0 space-y-4">
          <Skeleton className="h-[260px] rounded-[10px]" />
          <Skeleton className="h-[180px] rounded-[10px]" />
        </div>
        <div className="flex-1 space-y-4">
          <Skeleton className="h-[140px] rounded-[10px]" />
          <Skeleton className="h-[300px] rounded-[10px]" />
        </div>
      </div>
    );
  }

  // Note: empty profile is now stubbed in loadAll so the actionable shell always renders.

  // GUIDED JOURNEY — replaces the normal My Story view until profile + assessment are done.
  // Voice training is optional (skippable). Once cleared, the normal layout below renders.
  if (!journey.loading && !journey.guidedJourneyDone) {
    return (
      <div className="space-y-6">
        <GuidedJourney journey={journey} onResetDiagnostic={onResetDiagnostic} />
        <BrandAssessmentModal
          open={brandOpen && Number(profile?.instrument_version) !== 2}
          sector={profile?.sector_focus ?? undefined}
          band={profile?.seniority_band ?? undefined}
          onOpenChange={(o) => { setBrandOpen(o); if (!o) { if (authUser) loadAll(authUser.id); journey.refresh(); } }}
          onComplete={() => { if (authUser) loadAll(authUser.id); journey.refresh(); }}
        />
      </div>
    );
  }

  // ============ Derived values for new layout ============
  const themesForTerritory = signalStats.themeGroups
    .map((g) => ({ theme: prettify(g.theme), conf: g.avgConfidence }))
    .slice(0, 8);
  const strongestTheme = themesForTerritory[0]?.theme || null;



  const archetypeName = brandResults?.primary_archetype || positioningTitle || "";
  const positioningOnly = brandResults?.positioning_statement || "";
  const subtitle = [profile?.level, profile?.firm, profile?.sector_focus].filter(Boolean).join(" · ");


  const handleMilestoneShare = (m: { id: string; name: string; context: any }) => {
    setMarketShareData({
      milestoneId: m.id,
      milestoneName: m.name,
      contextText: m.context?.signal_title || m.context?.tone || "",
    } as any);
  };


  /* CV cross-check state — derived from the newest CV document and the
     stored cross-check on the profile row. */
  const cvState: CvCrosscheckState = (() => {
    if (!cvDoc) return "no_cv";
    if (cvDoc.status === "processing") return "processing";
    if (cvDoc.status === "error" || cvDoc.status === "failed") return "error";
    if (cvCrosscheckAt && cvDoc.created_at && new Date(cvDoc.created_at).getTime() > new Date(cvCrosscheckAt).getTime()) {
      return "stale";
    }
    return "ready";
  })();

  const runCrosscheck = async () => {
    if (!authUser) return;
    try {
      await supabase.auth.getSession();
      await supabase.functions.invoke("cv-crosscheck", { body: {} });
      await loadAll(authUser.id);
    } catch (e) {
      console.warn("[IdentityTab] cv-crosscheck failed", e);
    }
  };


  return (
    <div className="space-y-6 story-page">
      {loadError && (
        <SectionError onRetry={() => authUser && loadAll(authUser.id)} message="Couldn't load your story. " />
      )}

      {/* SECTION 1 — HEADER (centered editorial) */}
      <div className="text-center" style={{ paddingTop: 4 }}>
        <div style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--ink-5)", fontWeight: 500, textTransform: "uppercase" }}>
          Your professional identity
        </div>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 500, color: "var(--ink)", margin: "8px 0 6px" }}>
          Profile
        </h1>
        <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "0 auto", maxWidth: 560, lineHeight: 1.6 }}>
          A living record of how the market sees you — and how you're changing that.
        </p>
      </div>
      <FirstVisitHint page="story" />
      <FirstTimeHint hintKey="mystory-profile">
        Your professional identity as the market sees it — generated from your assessment and captures, not a template.
      </FirstTimeHint>

      {/* PANE SWITCHER — URL param `story` is the single source of truth */}
      <div
        role="tablist"
        aria-label="Profile panes"
        style={{
          display: "flex",
          gap: 8,
          overflowX: "auto",
          paddingBottom: 4,
          marginBlockStart: 4,
        }}
      >
        {([
          { key: "appear", label: "How you appear" },
          { key: "voice", label: "How you sound" },
          { key: "standing", label: "Where you stand" },
          { key: "show", label: "What you can show" },
        ] as const).map((t) => {
          const active = pane === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setPane(t.key)}
              style={{
                flex: "0 0 auto",
                whiteSpace: "nowrap",
                borderRadius: 8,
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                background: active ? "#0670C4" : "#FFFFFF",
                color: active ? "#FFFFFF" : "#5B6673",
                border: active ? "1px solid #0670C4" : "1px solid #E2E7EE",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {pane === "appear" && (<>
      {/* HOW YOU APPEAR — the first thing in this pane */}
      <HowYouAppear userId={authUser?.id ?? null} />

      {/* Gated welcome for users without brand assessment */}
      {!assessmentCompleted && autoAssessing && (
        <div style={{ background: "var(--paper-2)", borderRadius: 16, padding: "32px 28px", border: "0.5px solid var(--rule)", display: "flex", flexDirection: "column", alignItems: "center", gap: 16, textAlign: "center" }}>
          <div
            style={{
              width: 32, height: 32, borderRadius: "50%",
              border: "2px solid var(--rule)",
              borderTopColor: "var(--action)",
              animation: "aura-spin 0.9s linear infinite",
            }}
          />
          <div style={{ fontFamily: "var(--ff-ui)", fontWeight: 600, fontSize: 20, color: "var(--ink)" }}>
            Building your professional identity
          </div>
          <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
            {assessmentStep || "Getting started…"}
          </div>
          <style>{`@keyframes aura-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
      {!assessmentCompleted && !autoAssessing && (
        <div style={{ background: "var(--paper-2)", borderRadius: 16, padding: "28px 28px 24px", position: "relative", overflow: "hidden", border: "0.5px solid var(--rule)", borderLeft: "3px solid var(--spot)" }}>
          <div className="relative">
          <div style={{ fontSize: 12, color: "var(--ink-5)", marginBottom: 8, fontWeight: 500 }}>
              Your professional identity
            </div>
            <h2 style={{ fontFamily: "var(--ff-ui)", fontWeight: 600, fontSize: 22, color: "var(--ink)", margin: "0 0 12px", lineHeight: 1.375 }}>
              Tell Aura who you are in 5 minutes, and it'll show you how the market should see you.
            </h2>
            <button
              onClick={() => setBrandOpen(true)}
              style={{ background: "var(--action)", color: "var(--ink)", border: 0, borderRadius: 10, padding: "12px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
            >
              Show me who I am in this market →
            </button>
          </div>
        </div>
      )}

      {/* SECTION 2 — PROFILE HERO CARD */}
      {assessmentCompleted && (
        <div>
          <SectionHeader label="Your market position" />
          <p style={{ fontSize: 12, color: "#5B6673", marginTop: 2 }}>
            How you stand in the market — drawn from your assessment. Edit anything; your words always win.
          </p>
        </div>
      )}
      {assessmentCompleted && (
        <div>
          <div
            style={{
              background: "var(--vellum, var(--paper-2))",
              borderRadius: 14,
              padding: "18px 20px",
              display: "flex",
              alignItems: "center",
              gap: 14,
              border: "0.5px solid var(--brand-line, rgba(0,0,0,0.06))",
            }}
          >
            {/* Avatar */}
            <div style={{ position: "relative", flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => navigate("/settings?tab=account")}
                title="Manage your photo in Account"
                style={{
                  width: 60, height: 60, borderRadius: "50%",
                  border: "2px solid var(--brand, var(--warning))",
                  background: "var(--aura-card)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  overflow: "hidden", padding: 0, cursor: "pointer",
                }}
                aria-label="Manage your photo in Account"
              >
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt={userName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ color: "var(--brand)", fontFamily: "var(--font-display)", fontWeight: 500, fontSize: 18 }}>{initials}</span>
                )}
              </button>
              <div
                style={{
                  position: "absolute",
                  bottom: -2,
                  right: -2,
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: "var(--brand)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "2px solid var(--vellum, var(--paper-2))",
                }}
                aria-hidden="true"
              >
                <Camera className="w-2.5 h-2.5" style={{ color: "var(--paper)" }} />
              </div>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />

            {/* Center */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "var(--ff-ui)", fontSize: 17, fontWeight: 600, color: "var(--ink)", lineHeight: 1.2 }}>
                {userName}
              </div>
              {subtitle && (
                <div style={{ fontSize: 11, color: "var(--ink-5)", marginTop: 4 }}>{subtitle}</div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                {archetypeName && (
                  <span style={{
                    fontSize: 11, fontWeight: 500, padding: "3px 10px",
                    borderRadius: 12, background: "rgba(6,112,196,0.10)",
                    color: "var(--action-ink)",
                    display: "inline-flex", alignItems: "center", gap: 6,
                  }}>
                    {archetypeName}
                    <InfoTooltip
                      label="Your archetype"
                      text="Your primary professional archetype from your brand assessment. Shapes how Aura positions your content."
                      side="bottom"
                      triggerSize={13}
                    />
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ONE positioning paragraph */}
          {positioningOnly && (
            <p style={{ fontSize: 14, color: "var(--ink-3)", lineHeight: 1.7, marginTop: 14, marginBottom: 0 }}>
              {positioningOnly}
            </p>
          )}
        </div>
      )}

      {/* SECTION 3 — MARKET MIRROR */}
      {assessmentCompleted && (
        <section style={{ borderTop: "0.5px solid var(--brand-line, rgba(0,0,0,0.08))", paddingTop: 20 }} data-testid="story-market-mirror">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Eye className="w-3.5 h-3.5" style={{ color: "var(--error, #c0392b)" }} />
            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-5)", display: "inline-flex", alignItems: "center", gap: 6 }}>
              How the market sees you
              <InfoTooltip
                label="Market Mirror"
                text="How three audiences would describe you today — based on your signals, content, and assessment. Refreshes as your intelligence grows."
                side="bottom"
                triggerSize={13}
              />
            </span>
          </div>
          <p style={{ fontSize: 12, color: "var(--ink-5)", margin: "0 0 12px" }}>
            Three perspectives on your digital footprint — refreshed from your latest intelligence.
          </p>
          <MarketMirror userId={authUser?.id ?? null} hideHeader />
        </section>
      )}
      </>)}

      {/* SECTION 4 — YOUR VOICE */}
      {pane === "voice" && assessmentCompleted && (
        <section style={{ borderTop: "0.5px solid var(--brand-line, rgba(0,0,0,0.08))", paddingTop: 20 }} data-testid="story-voice-section">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Mic className="w-3.5 h-3.5" style={{ color: "var(--ink-5)" }} />
              <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-5)" }}>
                Your voice
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  padding: "2px 8px",
                  borderRadius: 10,
                  background: radarInputs.voiceTrained ? "rgba(18,128,92, 0.12)" : "rgba(6,112,196,0.10)",
                  color: radarInputs.voiceTrained ? "var(--success)" : "var(--text-muted)",
                }}
              >
                {radarInputs.voiceTrained ? "Trained" : "Not yet"}
              </span>
            </div>
          </div>
          <p style={{ fontSize: 12, color: "#5B6673", marginTop: 2 }}>
            How Aura writes as you. Learned from your posts — teach it, correct it, it updates instantly.
          </p>
          <div style={{ marginTop: 12 }}>
            <VoiceWorkspace
              userId={authUser?.id ?? null}
              onWrite={() => handleGenerateContent("Write in my voice")}
            />
          </div>
        </section>
      )}

      {/* SECTION 5 — YOUR TERRITORY */}
      {pane === "appear" && assessmentCompleted && themesForTerritory.length > 0 && (
        <section style={{ borderTop: "0.5px solid var(--brand-line, rgba(0,0,0,0.08))", paddingTop: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <MapIcon className="w-3.5 h-3.5" style={{ color: "var(--ink-5)" }} />
              <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-5)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                Your territory
                <InfoTooltip
                  label="Your territories"
                  text="Your strongest signals. Highlighted territories have the deepest evidence."
                  side="bottom"
                  triggerSize={13}
                />
              </span>
            </div>
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
              {themesForTerritory.length} {themesForTerritory.length === 1 ? "tag" : "tags"}
            </span>
          </div>
          <p style={{ fontSize: 12, color: "var(--ink-3)", margin: "0 0 12px" }}>
            The intellectual territory your intelligence is building around.
          </p>
          <div className="flex flex-wrap gap-2">
            {themesForTerritory.map((t, i) => {
              const isStrong = i === 0;
              return (
                <span key={i} style={{
                  fontSize: 11,
                  padding: "6px 12px",
                  borderRadius: 8,
                  fontWeight: isStrong ? 500 : 400,
                  background: isStrong ? "rgba(6,112,196,0.10)" : "var(--vellum, var(--paper-2))",
                  color: isStrong ? "var(--ink)" : "var(--ink)",
                  border: isStrong ? "0.5px solid transparent" : "0.5px solid var(--brand-line, rgba(0,0,0,0.1))",
                }}>
                  {t.theme}
                </span>
              );
            })}
          </div>
        </section>
      )}

      {pane === "standing" && (
      <div style={STANDING_STACK}>
      {/* SECTION 6 — CV AGAINST PROFILE */}
      {/* Every state is inside CvCrosscheck; this pane only supplies the truth. */}
      <div>
        <SectionHeader label="Your CV against your profile" />
      </div>
      <CvCrosscheck
        userId={authUser?.id ?? null}
        state={cvState}
        uploadSlot={cvState === "no_cv" ? <CvUploadControl userId={authUser?.id ?? null} showPurpose={false} /> : undefined}
        onRetry={cvState === "error" ? runCrosscheck : undefined}
        onRunAgain={cvState === "stale" ? runCrosscheck : undefined}
      />

      {assessmentCompleted && (
        <div>
          <SectionHeader label="Profile intelligence" />
          <p style={{ fontSize: 12, color: "#5B6673", marginTop: 2 }}>
            What Aura has noticed about you lately, and the work you keep returning to, ready when you are.
          </p>
        </div>
      )}
      {assessmentCompleted && (
        <div data-testid="story-strategic-identity">
          <ProfileIntelligence onGenerateContent={handleGenerateContent} intelligenceStage={intelligenceStage} hideSuggestedTopics={false} />
        </div>
      )}


      <MilestonesSection userId={authUser?.id ?? null} />

      </div>
      )}

      {pane === "show" && (
      <div style={SHOW_STACK}>
        <CollapseStyles />
        <div>
          <SectionHeader label="What you can show" />
          <p style={PANE_SUBLINE}>Everything here is yours to download or send.</p>
        </div>


        <ErrorBoundary>
          <BrandReportSection
            results={profile?.brand_assessment_results}
            hasAssessment={!!profile?.brand_assessment_completed_at}
            assessedAt={profile?.brand_assessment_completed_at}
            onCompleteAssessment={() => setBrandOpen(true)}
          />
        </ErrorBoundary>

        {profile?.brand_assessment_completed_at ? (
          <ErrorBoundary>
            <ReportVersions
              firstName={profile?.first_name}
              lastName={profile?.last_name}
              onCompleteAssessment={() => setBrandOpen(true)}
            />
          </ErrorBoundary>
        ) : null}

        <ErrorBoundary>
          <AuraCardPanel
            onNavigateAssessment={() => setBrandOpen(true)}
            onNavigatePhoto={() => navigate("/settings?tab=account")}
            onNavigateSettings={() => { window.location.href = "/settings#location"; }}
          />
        </ErrorBoundary>

      </div>
      )}

      {/* Modals */}
      <ObjectiveAuditModal
        open={auditOpen}
        onOpenChange={setAuditOpen}
        onNavigate={handleNavigate}
        onComplete={() => {
          setRadarRefreshKey((k) => k + 1);
          if (authUser?.id) loadAll(authUser.id);
        }}
      />
      <BrandAssessmentModal open={brandOpen && Number(profile?.instrument_version) !== 2} sector={profile?.sector_focus ?? undefined} band={profile?.seniority_band ?? undefined} onOpenChange={setBrandOpen} onNavigate={handleNavigate} />
      {celebrationsEnabled && marketShareData && (
        <MilestoneShareModal
          open={!!marketShareData}
          onClose={() => setMarketShareData(null)}
          data={marketShareData}
        />
      )}

      {pane === "appear" && (
        <ErrorBoundary>
          <ReadShape />
        </ErrorBoundary>
      )}
    </div>
  );
};

export default IdentityTab;
