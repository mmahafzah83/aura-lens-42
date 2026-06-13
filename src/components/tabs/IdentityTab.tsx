import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Pencil, Check, Eye, Map as MapIcon, Trophy, Target as TargetIcon, Star, Camera, ChevronDown, Mic } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import ProfileIntelligence from "@/components/ProfileIntelligence";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { FirstTimeHint } from "@/components/FirstTimeHint";
import MilestonesSection from "@/components/MilestonesSection";
import AuditRadarWidget from "@/components/AuditRadarWidget";
import ObjectiveAuditModal from "@/components/ObjectiveAuditModal";
import BrandAssessmentModal from "@/components/BrandAssessmentModal";
import SectionError from "@/components/ui/section-error";
import { withTimeout, showQueryErrorToast } from "@/lib/safeQuery";
import { useAuthReady } from "@/hooks/useAuthReady";
import MarketMirror from "@/components/MarketMirror";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import MilestoneShareModal, { type MilestoneShareData } from "@/components/MilestoneShareModal";
import { computeIntelligenceStage, type IntelligenceStage } from "@/components/ui/IntelligenceStageBadge";
import FirstVisitHint from "@/components/ui/FirstVisitHint";
import GuidedJourney from "@/components/GuidedJourney";
import { useJourneyState } from "@/hooks/useJourneyState";
import TierCeremonyModal from "@/components/TierCeremonyModal";
import VoiceEngineSection from "@/components/VoiceEngineSection";
import { useCelebrationsEnabled } from "@/hooks/useCelebrationsEnabled";

import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { shareToLinkedIn } from "@/lib/shareLinkedIn";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import {
  applyPublishedFilter,
  applyCatalogFilter,
  filterPublishedRows,
} from "@/lib/postProvenance";

// Canonical 8-milestone definition for the timeline
const MILESTONE_DEFS: { id: string; name: string; cta?: { label: string; tab: string } }[] = [
  { id: "profile_complete", name: "Profile complete" },
  { id: "brand_assessment", name: "Brand assessment" },
  { id: "first_signal", name: "First signal", cta: { label: "Capture an article →", tab: "intelligence" } },
  { id: "voice_trained", name: "Voice trained", cta: { label: "Train your voice →", tab: "authority" } },
  { id: "first_publish", name: "First publish", cta: { label: "Draft this post →", tab: "authority" } },
  { id: "five_signals", name: "Five signals", cta: { label: "Capture an article →", tab: "intelligence" } },
  { id: "sector_depth", name: "Sector depth", cta: { label: "Capture more sources →", tab: "intelligence" } },
  { id: "weekly_rhythm_4", name: "Weekly rhythm", cta: { label: "Capture this week →", tab: "intelligence" } },
];

const prettify = (s?: string) =>
  (s || "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (m) => m.toUpperCase());

interface IdentityTabProps {
  onResetDiagnostic: () => void;
  onSwitchTab?: (tab: string) => void;
  onDraftToStudio?: (prefill: { topic: string; context: string; sourceType?: string; sourceTitle?: string }) => void;
}

interface ProfileRow {
  first_name: string | null;
  last_name: string | null;
  level: string | null;
  firm: string | null;
  sector_focus: string | null;
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
}

const IdentityTab = ({ onResetDiagnostic, onSwitchTab, onDraftToStudio }: IdentityTabProps) => {
  const { user: authUser, isReady: authReady } = useAuthReady();
  const { enabled: celebrationsEnabled } = useCelebrationsEnabled();
  const journey = useJourneyState(authUser?.id ?? null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [authorityScore, setAuthorityScore] = useState<number | null>(null);
  const [scoreTotal, setScoreTotal] = useState<number | null>(null);
  const [tierName, setTierName] = useState<string | null>(null);
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
  const [radarRefreshKey, setRadarRefreshKey] = useState(0);
  const [credentialOpen, setCredentialOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [brandOpen, setBrandOpen] = useState(false);
  const [fullProfileOpen, setFullProfileOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [showFullPositioning, setShowFullPositioning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loadError, setLoadError] = useState(false);
  const [autoAssessing, setAutoAssessing] = useState(false);
  const [assessmentStep, setAssessmentStep] = useState("");
  const autoAssessTriggered = useRef(false);
  const journeyRef = useRef<{ next: any; then: any | null } | null>(null);
  const [marketShareData, setMarketShareData] = useState<MilestoneShareData | null>(null);
  const [entryCount, setEntryCount] = useState<number>(0);
  const [trackedPostCount, setTrackedPostCount] = useState<number>(0);
  const [publishedPostCount, setPublishedPostCount] = useState<number>(0);
  
  const [milestoneData, setMilestoneData] = useState<{ id: string; name: string; earned: boolean; earned_at: string | null; context: any }[]>([]);
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
          if (r.tier_name) setTierName(String(r.tier_name));
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
      const [profileRes, scoreRes, signalsRes] = await withTimeout(Promise.all([
        (supabase.from("diagnostic_profiles" as any) as any)
          .select("first_name, last_name, level, firm, sector_focus, core_practice, north_star_goal, brand_pillars, avatar_url, onboarding_completed, audit_completed_at, audit_method, brand_assessment_completed_at, brand_assessment_results, identity_intelligence, primary_strength")
          .eq("user_id", uid).maybeSingle(),
        (supabase.from("authority_scores") as any)
          .select("authority_score").eq("user_id", uid)
          .order("snapshot_date", { ascending: false }).limit(1).maybeSingle(),
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
          first_name: null, last_name: null, level: null, firm: null, sector_focus: null,
          core_practice: null, north_star_goal: null, brand_pillars: [],
          avatar_url: null, onboarding_completed: false, audit_completed_at: null,
          audit_method: null, brand_assessment_completed_at: null, brand_assessment_results: null,
          identity_intelligence: null, primary_strength: null,
        } as ProfileRow);
      }
      if (scoreRes.data) setAuthorityScore(scoreRes.data.authority_score);
      // Same total as ScoreBreakdown: components from latest score_snapshots row.
      try {
        const { data: snap } = await (supabase.from("score_snapshots" as any) as any)
          .select("components, composite_score, tier")
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (snap) {
          const c = (snap as any).components || {};
          const sig = Number(c.signal_score) || 0;
          const con = Number(c.content_score) || 0;
          const cap = Number(c.capture_score) || 0;
          // Total comes from the snapshot's persisted composite_score (EF aura_score),
          // never a local re-sum.
          const total = Number((snap as any).composite_score) || null;
          setScoreTotal(total);
          const t = (snap as any).tier;
          if (t && typeof t === "string") setTierName(t);
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
            .eq("user_id", uid),
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
            .select("tone, example_posts").eq("user_id", uid).eq("is_primary", true).maybeSingle(),
          (supabase.from("linkedin_posts") as any)
            .select("engagement_score").eq("user_id", uid).limit(200),
          (supabase.from("entries") as any)
            .select("created_at").eq("user_id", uid)
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
    await (supabase.from("diagnostic_profiles" as any) as any)
      .update({ [field]: editValue }).eq("user_id", user.id);
    setProfile(prev => prev ? { ...prev, [field]: editValue } : prev);
    setEditingField(null);
    setSaving(false);
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
      await (supabase.from("diagnostic_profiles" as any) as any)
        .update({ avatar_url: publicUrl }).eq("user_id", user.id);
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
      toast.success("Positioning regenerated");
      if (authUser) loadAll(authUser.id);
    } catch {
      toast.error("Regeneration failed");
    } finally {
      setRegenerating(false);
    }
  };

  const handleNavigate = (target: string) => {
    if (target === "intelligence" && onSwitchTab) onSwitchTab("intelligence");
  };

  const handleGenerateContent = (topic: string, context?: string) => {
    if (onDraftToStudio) {
      onDraftToStudio({ topic, context: context || "", sourceType: "authority_next", sourceTitle: topic });
    } else if (onSwitchTab) {
      sessionStorage.setItem("aura_prefill_topic", topic);
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

  // Radar metrics (0-100 each)
  const radar = {
    signals: Math.min(100, Math.round(signalStats.count * 20 + (signalStats.topConfidence || 0) * 0.5)),
    content: Math.min(100, Math.round((radarInputs.totalPosts || 0) * 2)),
    engagement: Math.min(100, Math.round((radarInputs.avgEngagement || 0) * 40)),
    voice: radarInputs.voiceTrained ? 80 : 20,
    rhythm: Math.min(100, Math.round((radarInputs.weeksActive / 4) * 100)),
  };

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
          open={brandOpen}
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


  // Earned milestones merged with canonical defs
  const earnedById = new Map(milestoneData.filter((m) => m.earned).map((m) => [m.id, m]));
  const earnedSorted = MILESTONE_DEFS
    .filter((d) => earnedById.has(d.id))
    .map((d) => ({ ...d, ...earnedById.get(d.id)! }))
    .sort((a, b) => {
      const ta = a.earned_at ? new Date(a.earned_at).getTime() : 0;
      const tb = b.earned_at ? new Date(b.earned_at).getTime() : 0;
      return tb - ta;
    });
  const nextMilestone = MILESTONE_DEFS.find((d) => !earnedById.has(d.id)) || null;
  const futureMilestones = MILESTONE_DEFS
    .filter((d) => !earnedById.has(d.id) && d.id !== nextMilestone?.id)
    .map((d) => d.name);

  const archetypeName = brandResults?.primary_archetype || positioningTitle || "";
  const positioningOnly = brandResults?.positioning_statement || "";
  const subtitle = [profile?.level, profile?.firm, profile?.sector_focus].filter(Boolean).join(" · ");

  const fmtDate = (iso: string | null) => {
    if (!iso) return "";
    try { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }); } catch { return ""; }
  };

  const handleMilestoneShare = (m: { id: string; name: string; context: any }) => {
    setMarketShareData({
      milestoneId: m.id,
      milestoneName: m.name,
      contextText: m.context?.signal_title || m.context?.tone || "",
    } as any);
  };

  const handleNextMilestoneCTA = () => {
    if (!nextMilestone) return;
    const cta = nextMilestone.cta;
    if (cta && onSwitchTab) onSwitchTab(cta.tab);
  };

  // ============================================================
  // JOURNEY DERIVATION — live NEXT/Then steps from real data.
  // Tier name + points-to-next come from the EF response
  // (single source of truth); no local threshold math here.
  // ============================================================
  type JourneyStep = {
    id: string;
    label: string;
    detail?: string;
    action?: { label: string; tab: string };
  };
  const nextTierBoundary = nextTierFromEF.name && nextTierFromEF.pointsToNext != null
    ? { name: nextTierFromEF.name, pointsToNext: nextTierFromEF.pointsToNext }
    : null;

  const lowestComponentLabel = (() => {
    if (!scoreComponents) return null;
    const entries: Array<[string, number, string]> = [
      ["capture", scoreComponents.capture, "intelligence"],
      ["signal", scoreComponents.signal, "intelligence"],
      ["content", scoreComponents.content, "authority"],
    ];
    entries.sort((a, b) => a[1] - b[1]);
    return entries[0];
  })();

  const nextMondayLabel = (() => {
    const d = new Date();
    const day = d.getDay();
    const delta = (8 - day) % 7 || 7;
    d.setDate(d.getDate() + delta);
    return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  })();

  const derived = (() => {
    if (journeyRef.current) return journeyRef.current;
    // Only derive after the page's data has settled enough to be meaningful.
    if (loading) return null;
    if (scoreTotal == null && authorityScore == null) return null;

    const steps: JourneyStep[] = [];

    // 1) First publish
    if (publishedPostCount === 0) {
      steps.push({
        id: "first_publish",
        label: "First publish",
        detail: "Your first post sets the baseline Aura measures from.",
        action: { label: "Draft this post →", tab: "authority" },
      });
    }

    // 2) This week's rhythm
    if (thisWeekEntries < 3) {
      steps.push({
        id: "weekly_rhythm",
        label: `This week's rhythm: ${thisWeekEntries}/3`,
        detail: "Capture three sources this week to keep the rhythm intact.",
        action: { label: "Capture an article →", tab: "intelligence" },
      });
    }

    // 3) Signal approaching Live
    if (topApproachingLive && topApproachingLive.title) {
      steps.push({
        id: "approaching_live",
        label: `Signal "${topApproachingLive.title}" is approaching Live`,
        detail: "One more source confirms it.",
        action: { label: "Capture an article →", tab: "intelligence" },
      });
    }

    // 4) Within 5 points of next tier
    if (nextTierBoundary && nextTierBoundary.pointsToNext <= 5 && nextTierBoundary.pointsToNext > 0) {
      const comp = lowestComponentLabel;
      const compName = comp ? comp[0] : "capture";
      const tab = comp ? comp[2] : "intelligence";
      const actionLabel =
        compName === "content" ? "Draft this post →"
        : compName === "signal" ? "Strengthen a signal →"
        : "Capture an article →";
      steps.push({
        id: "tier_boundary",
        label: `${nextTierBoundary.pointsToNext} points from ${nextTierBoundary.name}`,
        detail: `Your ${compName} score is the lowest — lift it to cross.`,
        action: { label: actionLabel, tab },
      });
    }

    // 5) Fallback rhythm anchor — never empty.
    steps.push({
      id: "rhythm_anchor",
      label: `Keep the rhythm: ${nextMondayLabel} briefing`,
      detail: "Aura's weekly briefing lands on Monday.",
      action: { label: "Open intelligence →", tab: "intelligence" },
    });

    const result = { next: steps[0], then: steps[1] || null };
    journeyRef.current = result;
    return result;
  })();

  const handleDerivedAction = (step: JourneyStep) => {
    if (step.action && onSwitchTab) onSwitchTab(step.action.tab);
  };

  return (
    <div className="space-y-6">
      {loadError && (
        <SectionError onRetry={() => authUser && loadAll(authUser.id)} message="Couldn't load your story. " />
      )}

      {/* SECTION 1 — HEADER (centered editorial) */}
      <div className="text-center" style={{ paddingTop: 4 }}>
        <div style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--ink-5)", fontWeight: 500, textTransform: "uppercase" }}>
          Your professional identity
        </div>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 500, color: "var(--ink)", margin: "8px 0 6px" }}>
          My Story
        </h1>
        <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "0 auto", maxWidth: 560, lineHeight: 1.6 }}>
          A living record of how the market sees you — and how you're changing that.
        </p>
      </div>
      <FirstVisitHint page="story" />
      <FirstTimeHint hintKey="mystory-profile">
        Your professional identity as the market sees it — generated from your assessment and captures, not a template.
      </FirstTimeHint>

      {/* Gated welcome for users without brand assessment */}
      {!assessmentCompleted && autoAssessing && (
        <div style={{ background: "var(--ink)", borderRadius: 16, padding: "32px 28px", border: "1px solid var(--brand-line, rgba(197,165,90,0.2))", display: "flex", flexDirection: "column", alignItems: "center", gap: 16, textAlign: "center" }}>
          <div
            style={{
              width: 32, height: 32, borderRadius: "50%",
              border: "2px solid rgba(197,165,90,0.25)",
              borderTopColor: "var(--brand)",
              animation: "aura-spin 0.9s linear infinite",
            }}
          />
          <div style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--paper)" }}>
            Building your professional identity
          </div>
          <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
            {assessmentStep || "Getting started…"}
          </div>
          <style>{`@keyframes aura-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
      {!assessmentCompleted && !autoAssessing && (
        <div style={{ background: "var(--ink)", borderRadius: 16, padding: "28px 28px 24px", position: "relative", overflow: "hidden", border: "1px solid var(--brand-line, rgba(197,165,90,0.2))" }}>
          <div className="relative">
            <div style={{ fontSize: 12, letterSpacing: "0.16em", color: "var(--brand)", marginBottom: 8, fontWeight: 600 }}>
              Your professional identity
            </div>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--paper)", margin: "0 0 12px", lineHeight: 1.375 }}>
              Tell Aura who you are in 5 minutes, and it'll show you how the market should see you.
            </h2>
            <button
              onClick={() => setBrandOpen(true)}
              style={{ background: "var(--brand)", color: "var(--ink)", border: 0, borderRadius: 10, padding: "12px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
            >
              Show me who I am in this market →
            </button>
          </div>
        </div>
      )}

      {/* SECTION 2 — PROFILE HERO CARD */}
      {assessmentCompleted && (
        <SectionHeader label="Your Market Position" />
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
                onClick={() => fileInputRef.current?.click()}
                title="Change photo"
                style={{
                  width: 60, height: 60, borderRadius: "50%",
                  border: "2px solid var(--brand, var(--warning))",
                  background: "var(--aura-card)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  overflow: "hidden", padding: 0, cursor: "pointer",
                }}
                aria-label="Change profile photo"
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
              <div style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 500, color: "var(--ink)", lineHeight: 1.2 }}>
                {userName}
              </div>
              {subtitle && (
                <div style={{ fontSize: 11, color: "var(--ink-5)", marginTop: 4 }}>{subtitle}</div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                {archetypeName && (
                  <span style={{
                    fontSize: 11, fontWeight: 500, padding: "3px 10px",
                    borderRadius: 12, background: "var(--brand-pale, rgba(176,141,58,0.12))",
                    color: "var(--warning, var(--brand))",
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
                {authorityScore != null && (
                  <span style={{ fontFamily: "var(--font-display)", fontSize: 15, color: "var(--warning, var(--brand))", fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {scoreTotal ?? authorityScore}
                    <InfoTooltip
                      label="Archetype strength"
                      text="Increases as you publish content aligned with your archetype patterns."
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
            <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.06em", color: "var(--error, #c0392b)", textTransform: "uppercase", display: "inline-flex", alignItems: "center", gap: 6 }}>
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

      {/* SECTION 4 — YOUR VOICE */}
      {assessmentCompleted && (
        <section style={{ borderTop: "0.5px solid var(--brand-line, rgba(0,0,0,0.08))", paddingTop: 20 }} data-testid="story-voice-section">
          <button
            type="button"
            onClick={() => setVoiceOpen((v) => !v)}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Mic className="w-3.5 h-3.5" style={{ color: "var(--ink-5)" }} />
              <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.06em", color: "var(--ink-5)", textTransform: "uppercase" }}>
                Your voice
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  padding: "2px 8px",
                  borderRadius: 10,
                  background: radarInputs.voiceTrained ? "rgba(46, 125, 50, 0.12)" : "var(--brand-pale, rgba(176,141,58,0.12))",
                  color: radarInputs.voiceTrained ? "var(--success, #2e7d32)" : "var(--warning, var(--brand))",
                }}
              >
                {radarInputs.voiceTrained ? "Trained" : "Not yet"}
              </span>
            </div>
            <ChevronDown
              className="w-4 h-4"
              style={{
                color: "var(--ink-5)",
                transition: "transform 0.2s ease",
                transform: voiceOpen ? "rotate(180deg)" : "rotate(0deg)",
              }}
            />
          </button>
          {voiceOpen && (
            <div style={{ marginTop: 12 }}>
              <VoiceEngineSection />
            </div>
          )}
        </section>
      )}

      {/* SECTION 5 — YOUR TERRITORY */}
      {assessmentCompleted && themesForTerritory.length > 0 && (
        <section style={{ borderTop: "0.5px solid var(--brand-line, rgba(0,0,0,0.08))", paddingTop: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <MapIcon className="w-3.5 h-3.5" style={{ color: "var(--ink-5)" }} />
              <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.06em", color: "var(--ink-5)", textTransform: "uppercase", display: "inline-flex", alignItems: "center", gap: 6 }}>
                Your territory
                <InfoTooltip
                  label="Your territories"
                  text="Your strongest content themes. Gold-highlighted territories have the deepest signal evidence."
                  side="bottom"
                  triggerSize={13}
                />
              </span>
            </div>
            <span style={{ fontSize: 11, color: "var(--ink-5)" }}>
              {themesForTerritory.length} {themesForTerritory.length === 1 ? "theme" : "themes"}
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
                  background: isStrong ? "var(--brand-pale, rgba(176,141,58,0.12))" : "var(--vellum, var(--paper-2))",
                  color: isStrong ? "var(--warning, var(--brand))" : "var(--ink)",
                  border: isStrong ? "0.5px solid transparent" : "0.5px solid var(--brand-line, rgba(0,0,0,0.1))",
                }}>
                  {t.theme}
                </span>
              );
            })}
          </div>
        </section>
      )}

      {/* SECTION 6 — CAPABILITY RADAR */}
      {assessmentCompleted && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <SectionHeader label="Your Capability Radar" />
          <InfoTooltip slug="capability-radar" label="Capability Radar" side="top" triggerSize={13} />
        </div>
      )}
      {assessmentCompleted && profile?.audit_method !== "evidence_audit" && (
        <p className="text-xs" style={{ color: "var(--ink-5)", marginTop: 2, marginBottom: 8 }}>
          Self-rated baseline — refine with the Objective Audit.
        </p>
      )}
      {assessmentCompleted && (
        <section style={{ borderTop: "0.5px solid var(--brand-line, rgba(0,0,0,0.08))", paddingTop: 20 }}>
          <div style={{ background: "var(--aura-card)", border: "0.5px solid var(--brand-line, rgba(0,0,0,0.08))", borderRadius: 12, padding: 14 }}>
            <AuditRadarWidget
              onStartAudit={() => setAuditOpen(true)}
              hideEditScores
              refreshKey={radarRefreshKey}
            />
          </div>
        </section>
      )}

      {/* SECTION 6b — PROFILE INTELLIGENCE */}
      {assessmentCompleted && (
        <SectionHeader label="Profile Intelligence" />
      )}
      {assessmentCompleted && (
        <div data-testid="story-strategic-identity">
          <ProfileIntelligence onGenerateContent={handleGenerateContent} intelligenceStage={intelligenceStage} hideSuggestedTopics={false} />
        </div>
      )}

      {/* SECTION 7 — YOUR JOURNEY (timeline) */}
      {assessmentCompleted && milestoneData.length > 0 && (
        <section style={{ borderTop: "0.5px solid var(--brand-line, rgba(0,0,0,0.08))", paddingTop: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Trophy className="w-3.5 h-3.5" style={{ color: "var(--success, #2e7d32)" }} />
              <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.06em", color: "var(--success, #2e7d32)", textTransform: "uppercase" }}>
                Your journey
              </span>
            </div>
            <span style={{ fontSize: 11, color: "var(--ink-5)" }}>
              {earnedSorted.length} of {MILESTONE_DEFS.length} milestones
            </span>
          </div>
          <p style={{ fontSize: 12, color: "var(--ink-3)", margin: "0 0 16px" }}>
            Every milestone strengthens your market position.
          </p>

          <div style={{ paddingLeft: 22, borderLeft: "2px solid var(--brand-line, rgba(0,0,0,0.08))", marginLeft: 8 }}>
            {/* NOW */}
            <div style={{ position: "relative", paddingBottom: 18 }}>
              <span style={{
                position: "absolute", left: -30, top: 0, width: 14, height: 14, borderRadius: "50%",
                background: "var(--warning, var(--brand))", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Star className="w-2 h-2" style={{ color: "var(--paper)" }} fill="currentColor" />
              </span>
              <div style={{ fontSize: 11, fontWeight: 500, color: "var(--warning, var(--brand))", letterSpacing: "0.04em" }}>
                NOW{tierName ? ` — ${tierName.toUpperCase()}` : ""}{(scoreTotal ?? authorityScore) != null ? ` · SCORE ${scoreTotal ?? authorityScore}` : ""}
              </div>
              {(identityIntel?.primary_role || positioningTitle) && (
                <div style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 500, color: "var(--ink)", marginTop: 3 }}>
                  {identityIntel?.primary_role || positioningTitle}
                </div>
              )}
              <button
                onClick={() => setCredentialOpen(true)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--brand, #B08D3A)",
                  fontSize: 12,
                  cursor: "pointer",
                  padding: 0,
                  marginTop: 6,
                  fontFamily: "inherit",
                }}
              >
                View credential →
              </button>
            </div>

            {/* Earned milestones — collapsed to one quiet line */}
            {earnedSorted.length > 0 && (
              <div style={{ position: "relative", paddingBottom: 16 }}>
                <span style={{
                  position: "absolute", left: -30, top: 0, width: 14, height: 14, borderRadius: "50%",
                  background: "var(--success, #2e7d32)", display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Check className="w-2 h-2" style={{ color: "var(--paper)" }} strokeWidth={3} />
                </span>
                <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                  {earnedSorted.length} milestone{earnedSorted.length === 1 ? "" : "s"} completed
                  {earnedSorted[0]?.earned_at ? ` · ${fmtDate(earnedSorted[0].earned_at)}` : ""}
                </div>
              </div>
            )}

            {/* NEXT — live, derived from real data (session-memoized) */}
            {derived?.next && (
              <div style={{ position: "relative", paddingBottom: 16 }}>
                <span style={{
                  position: "absolute", left: -30, top: 0, width: 14, height: 14, borderRadius: "50%",
                  background: "var(--aura-card)", border: "2px dashed var(--warning, var(--brand))",
                }} />
                <div style={{ fontSize: 12, fontWeight: 500, color: "var(--warning, var(--brand))" }}>
                  Next: {derived.next.label}
                </div>
                {derived.next.detail && (
                  <div style={{ fontSize: 11, color: "var(--ink-5)", marginTop: 3, lineHeight: 1.5 }}>
                    {derived.next.detail}
                  </div>
                )}
                {derived.next.action && (
                  <button
                    onClick={() => handleDerivedAction(derived.next)}
                    style={{
                      marginTop: 8, padding: "6px 12px", borderRadius: 8,
                      background: "var(--warning, var(--brand))", color: "var(--ink-on-brand, #fff)",
                      border: 0, fontSize: 12, fontWeight: 500, cursor: "pointer",
                    }}
                  >
                    {derived.next.action.label}
                  </button>
                )}
              </div>
            )}

            {/* THEN — second derived step (never the static MILESTONE_DEFS list) */}
            {derived?.then && (
              <div style={{ position: "relative" }}>
                <span style={{
                  position: "absolute", left: -30, top: 0, width: 14, height: 14, borderRadius: "50%",
                  background: "var(--aura-card)", border: "2px solid var(--ink-5)", opacity: 0.4,
                }} />
                <div style={{ fontSize: 11, color: "var(--ink-5)" }}>
                  Then: {derived.then.label}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* SECTION 8 — 3-YEAR TARGET */}
      <section style={{ borderTop: "0.5px solid var(--brand-line, rgba(0,0,0,0.08))", paddingTop: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <TargetIcon className="w-3.5 h-3.5" style={{ color: "var(--ink-5)" }} />
          <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.06em", color: "var(--ink-5)", textTransform: "uppercase" }}>
            3-year target
          </span>
        </div>
        {editingField === "north_star_goal" ? (
          <input
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveEdit("north_star_goal")}
            onBlur={() => saveEdit("north_star_goal")}
            autoFocus
            className="bg-transparent border-b border-brand outline-none w-full"
            style={{ fontSize: 15, color: "var(--ink)", fontFamily: "var(--font-display)", fontWeight: 500, paddingBottom: 2 }}
          />
        ) : (
          <button
            type="button"
            onClick={() => startEdit("north_star_goal", profile?.north_star_goal || "")}
            style={{
              fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 500,
              color: "var(--ink)", background: "transparent", border: 0, padding: 0,
              textAlign: "left", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8,
            }}
          >
            {profile?.north_star_goal || "Set your north star goal"}
            <Pencil className="w-3 h-3" style={{ color: "var(--ink-5)", opacity: 0.5 }} />
          </button>
        )}

        {/* Horizontal timeline */}
        {(() => {
          const onboardingDone = !!profile?.onboarding_completed;
          const auditOrBrandDone = !!profile?.audit_completed_at || !!profile?.brand_assessment_completed_at;
          const nodes = [
            { label: "Foundation", state: onboardingDone ? "done" : "future" },
            { label: "Building", state: auditOrBrandDone ? "done" : onboardingDone ? "current" : "future" },
            { label: "Now", state: "current" },
            { label: "3-yr target", state: "future" },
          ] as const;
          return (
            <div style={{ display: "flex", alignItems: "center", marginTop: 16 }}>
              {nodes.map((n, i) => {
                const isDone = n.state === "done";
                const isCurrent = n.state === "current";
                const dot = (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <span style={{
                      width: 16, height: 16, borderRadius: "50%",
                      background: isDone ? "var(--success, #2e7d32)" : isCurrent ? "var(--warning, var(--brand))" : "transparent",
                      border: !isDone && !isCurrent ? "1.5px solid var(--ink-5)" : "none",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {isDone && <Check style={{ color: "var(--paper)", width: 9, height: 9 }} strokeWidth={3} />}
                    </span>
                    <span style={{
                      fontSize: 9, marginTop: 6,
                      color: isCurrent ? "var(--warning, var(--brand))" : "var(--ink-5)",
                      fontWeight: isCurrent ? 600 : 400, textTransform: "uppercase", letterSpacing: "0.04em",
                    }}>
                      {n.label}
                    </span>
                  </div>
                );
                const next = nodes[i + 1];
                const barColor = (() => {
                  if (!next) return "transparent";
                  if (isDone && next.state === "done") return "var(--success, #2e7d32)";
                  if (isDone && next.state === "current") return "var(--warning, var(--brand))";
                  return "var(--brand-line, rgba(0,0,0,0.12))";
                })();
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", flex: i === nodes.length - 1 ? "0 0 auto" : 1 }}>
                    {dot}
                    {i < nodes.length - 1 && (
                      <div style={{ flex: 1, height: 2, background: barColor, margin: "0 8px", marginTop: -16 }} />
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </section>


      {/* Hidden — still mounted for data refresh logic of milestones share */}
      <div className="hidden">
        <MilestonesSection userId={authUser?.id ?? null} />
      </div>

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
      <BrandAssessmentModal open={brandOpen} onOpenChange={setBrandOpen} onNavigate={handleNavigate} />
      {celebrationsEnabled && (
        <TierCeremonyModal
          userId={authUser?.id ?? null}
          forceOpen={credentialOpen}
          onForceClose={() => setCredentialOpen(false)}
          forcedTierName={tierName ?? null}
        />
      )}
      {celebrationsEnabled && marketShareData && (
        <MilestoneShareModal
          open={!!marketShareData}
          onClose={() => setMarketShareData(null)}
          data={marketShareData}
        />
      )}
    </div>
  );
};

export default IdentityTab;
