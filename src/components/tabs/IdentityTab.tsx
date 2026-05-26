import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Pencil, Check, Eye, Zap, Map as MapIcon, Trophy, Target as TargetIcon, ChevronDown, Star } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import ProfileIntelligence from "@/components/ProfileIntelligence";
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
import ScoreBreakdown from "@/components/identity/ScoreBreakdown";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { shareToLinkedIn } from "@/lib/shareLinkedIn";

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
  brand_assessment_completed_at: string | null;
  brand_assessment_results: any;
  identity_intelligence: any;
  primary_strength: string | null;
}

const IdentityTab = ({ onResetDiagnostic, onSwitchTab, onDraftToStudio }: IdentityTabProps) => {
  const { user: authUser, isReady: authReady } = useAuthReady();
  const journey = useJourneyState(authUser?.id ?? null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [authorityScore, setAuthorityScore] = useState<number | null>(null);
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
  const [brandOpen, setBrandOpen] = useState(false);
  const [fullProfileOpen, setFullProfileOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [showFullPositioning, setShowFullPositioning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loadError, setLoadError] = useState(false);
  const [marketShareData, setMarketShareData] = useState<MilestoneShareData | null>(null);
  const [entryCount, setEntryCount] = useState<number>(0);
  const [trackedPostCount, setTrackedPostCount] = useState<number>(0);
  const [fullProfileExpanded, setFullProfileExpanded] = useState(false);
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
        if (!cancelled && !error && res && Array.isArray((res as any).milestones)) {
          setMilestoneData((res as any).milestones);
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

  const loadAll = async (uid: string) => {
    console.log("[IdentityTab] loadAll started");
    setLoadError(false);
    setLoading(true);
    try {
      const [profileRes, scoreRes, signalsRes] = await withTimeout(Promise.all([
        (supabase.from("diagnostic_profiles" as any) as any)
          .select("first_name, last_name, level, firm, sector_focus, core_practice, north_star_goal, brand_pillars, avatar_url, onboarding_completed, audit_completed_at, brand_assessment_completed_at, brand_assessment_results, identity_intelligence, primary_strength")
          .eq("user_id", uid).maybeSingle(),
        (supabase.from("authority_scores") as any)
          .select("authority_score").eq("user_id", uid)
          .order("snapshot_date", { ascending: false }).limit(1).maybeSingle(),
        (supabase.from("strategic_signals") as any)
          .select("signal_title, confidence, unique_orgs, theme_tags, supporting_evidence_ids")
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
          brand_assessment_completed_at: null, brand_assessment_results: null,
          identity_intelligence: null, primary_strength: null,
        } as ProfileRow);
      }
      if (scoreRes.data) setAuthorityScore(scoreRes.data.authority_score);
      // Stage counts — entries + tracked LinkedIn posts (lightweight head queries)
      try {
        const [entriesCountRes, postsCountRes] = await Promise.all([
          (supabase.from("entries") as any)
            .select("id", { count: "exact", head: true })
            .eq("user_id", uid),
          (supabase.from("linkedin_posts") as any)
            .select("id", { count: "exact", head: true })
            .eq("user_id", uid)
            .not("tracking_status", "is", null),
        ]);
        setEntryCount(entriesCountRes.count || 0);
        setTrackedPostCount(postsCountRes.count || 0);
      } catch (e) {
        console.warn("[IdentityTab] stage counts failed", e);
      }
      // Radar inputs — voice profile, posts engagement, capture rhythm
      try {
        const fourWeeksAgo = new Date(); fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
        const [voiceRes, postsRes, recentEntriesRes] = await Promise.all([
          (supabase.from("authority_voice_profiles") as any)
            .select("tone, example_posts").eq("user_id", uid).maybeSingle(),
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
        ((recentEntriesRes.data || []) as any[]).forEach((e) => {
          const d = new Date(e.created_at);
          const week = Math.floor((Date.now() - d.getTime()) / (7 * 86400000));
          if (week >= 0 && week < 4) weeks.add(week);
        });
        setRadarInputs({ avgEngagement, totalPosts, voiceTrained, weeksActive: weeks.size });
      } catch (e) {
        console.warn("[IdentityTab] radar inputs failed", e);
      }
      if (signalsRes.data) {
        const signals = signalsRes.data as any[];
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

  const authorityThemes: { theme: string; rationale: string }[] = Array.isArray(identityIntel?.authority_themes)
    ? identityIntel.authority_themes
    : [];

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
        <h1 style={{ fontFamily: "var(--font-display, 'Cormorant Garamond')", fontSize: 26, fontWeight: 500, color: "var(--ink)", margin: "8px 0 6px" }}>
          My Story
        </h1>
        <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "0 auto", maxWidth: 560, lineHeight: 1.6 }}>
          A living record of how the market sees you — and how you're changing that.
        </p>
      </div>
      <FirstVisitHint page="story" />

      {/* Gated welcome for users without brand assessment */}
      {!assessmentCompleted && (
        <div style={{ background: "var(--ink)", borderRadius: 16, padding: "28px 28px 24px", position: "relative", overflow: "hidden", border: "1px solid var(--brand-line, rgba(197,165,90,0.2))" }}>
          <div className="relative">
            <div style={{ fontSize: 12, letterSpacing: "0.16em", color: "var(--brand)", marginBottom: 8, fontWeight: 600 }}>
              Your professional identity
            </div>
            <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: "#fff", margin: "0 0 12px", lineHeight: 1.375 }}>
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
        <div>
          <div
            style={{
              background: "var(--surface-subtle, var(--aura-card))",
              borderRadius: 14,
              padding: "18px 20px",
              display: "flex",
              alignItems: "center",
              gap: 14,
              border: "0.5px solid var(--brand-line, rgba(0,0,0,0.06))",
            }}
          >
            {/* Avatar */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Change photo"
              style={{
                width: 60, height: 60, borderRadius: "50%",
                border: "2px solid var(--brand, var(--warning))",
                background: "var(--aura-card)",
                display: "flex", alignItems: "center", justifyContent: "center",
                overflow: "hidden", flexShrink: 0, padding: 0, cursor: "pointer",
              }}
              aria-label="Change profile photo"
            >
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt={userName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span style={{ color: "var(--brand)", fontFamily: "var(--font-display)", fontWeight: 500, fontSize: 18 }}>{initials}</span>
              )}
            </button>
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
                  }}>
                    {archetypeName}
                  </span>
                )}
                {authorityScore != null && (
                  <span style={{ fontFamily: "var(--font-display)", fontSize: 15, color: "var(--warning, var(--brand))", fontWeight: 500 }}>
                    {authorityScore}
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
            <Eye className="w-3.5 h-3.5" style={{ color: "var(--danger, #c0392b)" }} />
            <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.06em", color: "var(--danger, #c0392b)", textTransform: "uppercase" }}>
              How the market sees you
            </span>
          </div>
          <p style={{ fontSize: 12, color: "var(--ink-5)", margin: "0 0 12px" }}>
            Three perspectives on your digital footprint — refreshed from your latest intelligence.
          </p>
          <MarketMirror userId={authUser?.id ?? null} />
        </section>
      )}

      {/* SECTION 4 — CLOSE THE GAP */}
      {assessmentCompleted && authorityThemes.length > 0 && (
        <section style={{ borderTop: "0.5px solid var(--brand-line, rgba(0,0,0,0.08))", paddingTop: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Zap className="w-3.5 h-3.5" style={{ color: "var(--warning, var(--brand))" }} />
            <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.06em", color: "var(--warning, var(--brand))", textTransform: "uppercase" }}>
              Close the gap
            </span>
          </div>
          <p style={{ fontSize: 12, color: "var(--ink-3)", margin: "0 0 12px" }}>
            Publishing on these topics directly addresses the gaps the market sees.
          </p>
          <div className="space-y-2">
            {authorityThemes.slice(0, 5).map((t, i) => (
              <button
                key={i}
                onClick={() => handleGenerateContent(t.theme, t.rationale)}
                style={{
                  display: "flex", alignItems: "center", width: "100%",
                  padding: "12px 14px", borderRadius: 10,
                  border: "0.5px solid var(--brand-line, rgba(0,0,0,0.08))",
                  background: "transparent", cursor: "pointer", textAlign: "left",
                }}
              >
                <span style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: i === 0 ? "var(--danger, #c0392b)" : "var(--warning, var(--brand))",
                  marginRight: 12, flexShrink: 0,
                }} />
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
                  {t.theme}
                </span>
                <span style={{ fontSize: 11, color: "var(--warning, var(--brand))", marginLeft: 12 }}>
                  Write this →
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* SECTION 5 — YOUR TERRITORY */}
      {assessmentCompleted && themesForTerritory.length > 0 && (
        <section style={{ borderTop: "0.5px solid var(--brand-line, rgba(0,0,0,0.08))", paddingTop: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <MapIcon className="w-3.5 h-3.5" style={{ color: "var(--ink-5)" }} />
              <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.06em", color: "var(--ink-5)", textTransform: "uppercase" }}>
                Your territory
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
                  background: isStrong ? "var(--brand-pale, rgba(176,141,58,0.12))" : "var(--surface-subtle)",
                  color: isStrong ? "var(--warning, var(--brand))" : "var(--ink)",
                }}>
                  {t.theme}
                </span>
              );
            })}
          </div>
        </section>
      )}

      {/* SECTION 6 — SCORE + RADAR (two-column) */}
      {assessmentCompleted && (
        <section style={{ borderTop: "0.5px solid var(--brand-line, rgba(0,0,0,0.08))", paddingTop: 20 }}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div style={{ background: "var(--aura-card)", border: "0.5px solid var(--brand-line, rgba(0,0,0,0.08))", borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.04em", color: "var(--ink-5)", textTransform: "uppercase", marginBottom: 10 }}>
                Score breakdown
              </div>
              <ScoreBreakdown userId={authUser?.id ?? null} />
            </div>
            <div style={{ background: "var(--aura-card)", border: "0.5px solid var(--brand-line, rgba(0,0,0,0.08))", borderRadius: 12, padding: 14 }}>
              <AuditRadarWidget onStartAudit={() => setAuditOpen(true)} hideEditScores />
              <div style={{ fontSize: 10, color: "var(--ink-5)", marginTop: 6, textAlign: "center" }}>
                From your assessment
              </div>
            </div>
          </div>
        </section>
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
                <Star className="w-2 h-2" style={{ color: "#fff" }} fill="currentColor" />
              </span>
              <div style={{ fontSize: 11, fontWeight: 500, color: "var(--warning, var(--brand))", letterSpacing: "0.04em" }}>
                NOW — {archetypeName ? archetypeName.toUpperCase() : "STRATEGIST"}{authorityScore != null ? ` · SCORE ${authorityScore}` : ""}
              </div>
              {(identityIntel?.primary_role || positioningTitle) && (
                <div style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 500, color: "var(--ink)", marginTop: 3 }}>
                  {identityIntel?.primary_role || positioningTitle}
                </div>
              )}
            </div>

            {/* Earned milestones */}
            {earnedSorted.map((m) => (
              <div key={m.id} style={{ position: "relative", paddingBottom: 16 }}>
                <span style={{
                  position: "absolute", left: -30, top: 0, width: 14, height: 14, borderRadius: "50%",
                  background: "var(--success, #2e7d32)", display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Check className="w-2 h-2" style={{ color: "#fff" }} strokeWidth={3} />
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink)" }}>{m.name}</span>
                  {m.earned_at && (
                    <span style={{ fontSize: 10, color: "var(--ink-5)" }}>{fmtDate(m.earned_at)}</span>
                  )}
                  <button
                    onClick={() => handleMilestoneShare(m)}
                    style={{ fontSize: 10, color: "var(--brand)", background: "transparent", border: 0, padding: 0, cursor: "pointer", marginLeft: "auto" }}
                  >
                    Share
                  </button>
                </div>
                {(m.context?.signal_title || m.context?.tone) && (
                  <div style={{ fontSize: 11, color: "var(--ink-5)", marginTop: 2 }}>
                    {m.context?.signal_title || (m.context?.tone ? `Tone: ${m.context.tone}` : "")}
                  </div>
                )}
              </div>
            ))}

            {/* NEXT */}
            {nextMilestone && (
              <div style={{ position: "relative", paddingBottom: 16 }}>
                <span style={{
                  position: "absolute", left: -30, top: 0, width: 14, height: 14, borderRadius: "50%",
                  background: "var(--aura-card)", border: "2px dashed var(--warning, var(--brand))",
                }} />
                <div style={{ fontSize: 12, fontWeight: 500, color: "var(--warning, var(--brand))" }}>
                  Next: {nextMilestone.name}
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-5)", marginTop: 3, lineHeight: 1.5 }}>
                  This milestone strengthens your market presence.
                </div>
                {nextMilestone.cta && (
                  <button
                    onClick={handleNextMilestoneCTA}
                    style={{
                      marginTop: 8, padding: "6px 12px", borderRadius: 8,
                      background: "var(--warning, var(--brand))", color: "var(--ink-on-brand, #fff)",
                      border: 0, fontSize: 12, fontWeight: 500, cursor: "pointer",
                    }}
                  >
                    {nextMilestone.cta.label}
                  </button>
                )}
              </div>
            )}

            {/* FUTURE */}
            {futureMilestones.length > 0 && (
              <div style={{ position: "relative" }}>
                <span style={{
                  position: "absolute", left: -30, top: 0, width: 14, height: 14, borderRadius: "50%",
                  background: "var(--aura-card)", border: "2px solid var(--ink-5)", opacity: 0.4,
                }} />
                <div style={{ fontSize: 11, color: "var(--ink-5)" }}>
                  Then: {futureMilestones.join(", ")}
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
                      width: 18, height: 18, borderRadius: "50%",
                      background: isDone ? "var(--success, #2e7d32)" : isCurrent ? "var(--warning, var(--brand))" : "transparent",
                      border: !isDone && !isCurrent ? "1.5px solid var(--ink-5)" : "none",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {isDone && <Check className="w-2.5 h-2.5" style={{ color: "#fff" }} strokeWidth={3} />}
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

      {/* SECTION 9 — VIEW FULL PROFILE (collapsed by default) */}
      <section style={{ borderTop: "0.5px solid var(--brand-line, rgba(0,0,0,0.08))", paddingTop: 16 }}>
        <button
          onClick={() => setFullProfileExpanded((v) => !v)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 12, color: "var(--ink-3)",
            background: "transparent", border: 0, padding: 0, cursor: "pointer",
          }}
        >
          {fullProfileExpanded ? "Hide full profile" : "View full profile"}
          <ChevronDown className="w-3.5 h-3.5" style={{ transform: fullProfileExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
        </button>
        {fullProfileExpanded && assessmentCompleted && (
          <div className="mt-4" data-testid="story-strategic-identity">
            <ProfileIntelligence onGenerateContent={handleGenerateContent} intelligenceStage={intelligenceStage} />
          </div>
        )}
      </section>

      {/* Hidden — still mounted for data refresh logic of milestones share */}
      <div className="hidden">
        <MilestonesSection userId={authUser?.id ?? null} />
      </div>

      {/* Modals */}
      <ObjectiveAuditModal open={auditOpen} onOpenChange={setAuditOpen} onNavigate={handleNavigate} />
      <BrandAssessmentModal open={brandOpen} onOpenChange={setBrandOpen} onNavigate={handleNavigate} />
      {marketShareData && (
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
