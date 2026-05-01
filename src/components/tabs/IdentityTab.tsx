import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Pencil, Check, Loader2, Upload, ChevronRight, X } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import ProfileIntelligence from "@/components/ProfileIntelligence";
import ProfileManagement from "@/components/ProfileManagement";
import BrandArchetypeWidget from "@/components/BrandArchetypeWidget";
import AuditRadarWidget from "@/components/AuditRadarWidget";
import ObjectiveAuditModal from "@/components/ObjectiveAuditModal";
import BrandAssessmentModal from "@/components/BrandAssessmentModal";
import VoiceEngineSection from "@/components/VoiceEngineSection";
import SectionError from "@/components/ui/section-error";
import { withTimeout, showQueryErrorToast } from "@/lib/safeQuery";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import { createPortal } from "react-dom";

interface IdentityTabProps {
  onResetDiagnostic: () => void;
  onSwitchTab?: (tab: string) => void;
  onDraftToStudio?: (prefill: { topic: string; context: string; sourceType?: string; sourceTitle?: string }) => void;
}

interface ProfileRow {
  first_name: string | null;
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
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [authorityScore, setAuthorityScore] = useState<number | null>(null);
  const [signalStats, setSignalStats] = useState({ count: 0, topConfidence: 0, totalOrgs: 0, topTags: [] as string[] });
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

  const loadAll = async (uid: string) => {
    console.log("[IdentityTab] loadAll started");
    setLoadError(false);
    setLoading(true);
    try {
      const [profileRes, scoreRes, signalsRes] = await withTimeout(Promise.all([
        (supabase.from("diagnostic_profiles" as any) as any)
          .select("first_name, level, firm, sector_focus, core_practice, north_star_goal, brand_pillars, avatar_url, onboarding_completed, audit_completed_at, brand_assessment_completed_at, brand_assessment_results, identity_intelligence, primary_strength")
          .eq("user_id", uid).maybeSingle(),
        (supabase.from("authority_scores") as any)
          .select("authority_score").eq("user_id", uid)
          .order("snapshot_date", { ascending: false }).limit(1).maybeSingle(),
        (supabase.from("strategic_signals") as any)
          .select("signal_title, confidence, unique_orgs, theme_tags")
          .eq("user_id", uid).eq("status", "active")
          .order("confidence", { ascending: false }).limit(20),
      ]), 12000);

      if (profileRes.data) setProfile(profileRes.data);
      if (scoreRes.data) setAuthorityScore(scoreRes.data.authority_score);
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
        setSignalStats({
          count: signals.length,
          topConfidence: signals.length > 0 ? Math.round(Number(signals[0].confidence) * 100) : 0,
          totalOrgs: signals.reduce((s: number, sig: any) => s + (sig.unique_orgs || 0), 0),
          topTags,
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

  const userName = profile?.first_name || "You";
  const initials = userName.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

  // Extract positioning data from brand_assessment_results or identity_intelligence
  const brandResults = profile?.brand_assessment_results || {};
  const identityIntel = profile?.identity_intelligence || {};
  const positioningTitle = brandResults?.positioning_title || identityIntel?.primary_role || profile?.primary_strength || "";
  const positioningStatement = brandResults?.positioning_statement || identityIntel?.identity_summary || "";

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

  return (
    <div className="space-y-6">
      {loadError && (
        <SectionError onRetry={() => authUser && loadAll(authUser.id)} message="Couldn't load your story. " />
      )}
      {/* Two-column layout */}
      <div className="flex flex-col md:flex-row gap-6">
        {/* LEFT COLUMN */}
        <div className="w-full md:w-[200px] md:shrink-0 space-y-3">
          {/* Profile Sidebar Card (light) */}
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: 20,
              boxShadow: "var(--shadow-sm)",
              textAlign: "center",
            }}
          >
            {/* Avatar with orange ring + green status dot */}
            <div className="mx-auto relative" style={{ width: 80, height: 80 }}>
              <div
                className="w-full h-full rounded-full overflow-hidden flex items-center justify-center cursor-pointer group"
                style={{ border: "3px solid var(--brand)", background: "var(--surface-subtle)" }}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadingAvatar ? (
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--brand)" }} />
                ) : profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <span style={{ color: "var(--brand)", fontSize: 24, fontWeight: 600 }}>{initials}</span>
                )}
                <div className="absolute inset-0 rounded-full bg-black/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Upload className="w-3.5 h-3.5" style={{ color: "var(--brand)" }} />
                  <span style={{ color: "var(--brand)", fontSize: 10 }}>Upload</span>
                </div>
              </div>
              {/* Green status dot */}
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  bottom: 2,
                  right: 2,
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: "var(--success)",
                  border: "2px solid #fff",
                }}
              />
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
            </div>

            {/* Name & role */}
            <p
              style={{
                fontFamily: "'DM Serif Display', serif",
                fontSize: 16,
                color: "var(--surface-ink-subtle)",
                marginTop: 12,
                lineHeight: 1.2,
              }}
            >
              {userName}
            </p>
            <p style={{ fontSize: 11, color: "var(--ink-4)", lineHeight: 1.4, marginTop: 2 }}>
              {profile?.level || "Executive"}
            </p>

            {/* Stat tiles: Score + Followers (followers placeholder if not loaded) */}
            <div className="grid grid-cols-2 gap-2 mt-3">
              {[
                { label: "Score", value: authorityScore != null ? String(authorityScore) : "—" },
                { label: "Signals", value: signalStats.count ? String(signalStats.count) : "0" },
              ].map((tile) => (
                <div
                  key={tile.label}
                  style={{
                    background: "var(--surface-subtle)",
                    borderRadius: 10,
                    padding: 10,
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "'DM Serif Display', serif",
                      fontSize: 18,
                      color: "var(--brand)",
                      lineHeight: 1.1,
                    }}
                  >
                    {tile.value}
                  </div>
                  <div
                    style={{
                      fontSize: 9,
                      textTransform: "uppercase",
                      color: "var(--ink-5)",
                      letterSpacing: "0.06em",
                      marginTop: 2,
                    }}
                  >
                    {tile.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Identity Facts */}
          <div style={{ background: "var(--surface-ink-raised)", border: "1px solid var(--ink-3)", borderRadius: 10, padding: 12 }}>
            {identityFacts.map(fact => (
              <div key={fact.key} className="mb-2 last:mb-0">
                <div style={{ fontSize: 9, textTransform: "uppercase", color: "var(--ink-5)", letterSpacing: "0.05em" }}>{fact.label}</div>
                {editingField === fact.key ? (
                  <div className="flex items-center gap-1 mt-0.5">
                    <input
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && saveEdit(fact.key)}
                      onBlur={() => saveEdit(fact.key)}
                      autoFocus
                      className="flex-1 bg-transparent border-b border-brand text-[11px] text-ink-7 outline-none py-0.5"
                    />
                    {saving ? <Loader2 className="w-3 h-3 animate-spin text-brand" /> : <Check className="w-3 h-3 text-green-500" />}
                  </div>
                ) : (
                  <div className="flex items-center justify-between group mt-0.5">
                    <span style={{ fontSize: 11, color: "var(--ink-7)", wordBreak: "break-word", lineHeight: 1.4 }} className="flex-1">{fact.value || "—"}</span>
                    <button onClick={() => startEdit(fact.key, fact.value)} className="opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                      <Pencil className="w-2.5 h-2.5 text-ink-5 hover:text-brand" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Assessments */}
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: 16,
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div
              style={{
                fontSize: 9,
                textTransform: "uppercase",
                color: "var(--ink-5)",
                marginBottom: 10,
                letterSpacing: "0.08em",
                fontWeight: 600,
              }}
            >
              Completed
            </div>
            {assessments.map(a => (
              <div key={a.name} className="flex items-center gap-2 mb-2 last:mb-0">
                {a.done ? (
                  <span
                    className="flex items-center justify-center shrink-0"
                    style={{ background: "var(--success)", borderRadius: 4, width: 14, height: 14 }}
                  >
                    <Check className="w-2.5 h-2.5" style={{ color: "#fff" }} strokeWidth={3} />
                  </span>
                ) : (
                  <span
                    className="shrink-0"
                    style={{
                      background: "transparent",
                      border: "1px solid rgba(0,0,0,0.18)",
                      borderRadius: 4,
                      width: 14,
                      height: 14,
                    }}
                  />
                )}
                <span
                  style={{
                    fontSize: 11,
                    color: a.done ? "var(--ink-3)" : "var(--ink-5)",
                    flex: 1,
                  }}
                >
                  {a.name}
                </span>
                {a.done && a.date ? (
                  <span style={{ fontSize: 9, color: "var(--ink-5)" }}>{new Date(a.date).toLocaleDateString()}</span>
                ) : !a.done ? (
                  <button
                    onClick={() => {
                      if (a.name === "Evidence Audit") setAuditOpen(true);
                      else if (a.name === "Brand Assessment") setBrandOpen(true);
                    }}
                    style={{ fontSize: 10, color: "var(--brand)", fontWeight: 600 }}
                  >
                    Start →
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="flex-1 space-y-4">
          {/* Market Position Hero Card (dark) */}
          <div
            className="aura-hero-card"
            style={{
              background: "var(--ink)",
              borderRadius: 16,
              padding: 22,
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* Radial glow top-right */}
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                top: -60,
                right: -60,
                width: 200,
                height: 200,
                background:
                  "radial-gradient(circle, hsl(43 50% 55% / 0.10) 0%, transparent 70%)",
                pointerEvents: "none",
              }}
            />
            <div className="relative flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div
                  style={{
                    fontSize: 9,
                    textTransform: "uppercase",
                    color: "var(--brand)",
                    letterSpacing: "0.12em",
                    marginBottom: 8,
                    fontWeight: 600,
                  }}
                >
                  Your market position
                </div>
                <h3
                  style={{
                    fontFamily: "'DM Serif Display', serif",
                    fontSize: 20,
                    color: "#ffffff",
                    marginBottom: 12,
                    lineHeight: 1.25,
                  }}
                >
                  {positioningTitle || "Complete your profile to unlock positioning"}
                </h3>
                {profile?.brand_pillars && profile.brand_pillars.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {profile.brand_pillars.map((p, i) => {
                      const primary = i < 3;
                      return (
                        <span
                          key={i}
                          style={{
                            background: primary
                              ? "var(--brand-muted)"
                              : "rgba(255,255,255,0.07)",
                            color: primary ? "var(--brand)" : "var(--ink-7)",
                            border: `0.5px solid ${
                              primary ? "var(--bronze-line)" : "rgba(255,255,255,0.1)"
                            }`,
                            borderRadius: 20,
                            fontSize: 10,
                            padding: "3px 10px",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {p}
                        </span>
                      );
                    })}
                  </div>
                )}
                {positioningStatement && (
                  <div>
                    <p
                      style={{
                        fontSize: 13,
                        color: "var(--ink-6)",
                        lineHeight: 1.6,
                        fontWeight: 300,
                      }}
                      className={showFullPositioning ? "" : "line-clamp-4"}
                    >
                      {positioningStatement}
                    </p>
                    {positioningStatement.length > 200 && (
                      <button
                        onClick={() => setShowFullPositioning(!showFullPositioning)}
                        style={{ fontSize: 11, color: "var(--brand)", marginTop: 6, fontWeight: 500 }}
                      >
                        {showFullPositioning ? "Show less" : "Show more"}
                      </button>
                    )}
                  </div>
                )}
              </div>
              <button
                onClick={regeneratePositioning}
                disabled={regenerating}
                style={{
                  fontSize: 11,
                  color: "var(--brand)",
                  background: "transparent",
                  cursor: regenerating ? "default" : "pointer",
                }}
                className="shrink-0 ml-3 hover:opacity-80 transition-opacity"
              >
                {regenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Regenerate →"}
              </button>
            </div>
          </div>

          {/* Active Focus Areas — pill chips */}
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: 18,
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div
              style={{
                fontSize: 9,
                textTransform: "uppercase",
                color: "var(--ink-5)",
                marginBottom: 10,
                letterSpacing: "0.08em",
                fontWeight: 600,
              }}
            >
              Active focus areas
            </div>
            {signalStats.topTags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {signalStats.topTags.map((s, i) => (
                  <span
                    key={i}
                    style={{
                      background: "var(--brand-pale)",
                      color: "var(--warning)",
                      borderRadius: 20,
                      padding: "5px 13px",
                      fontSize: 12,
                      fontWeight: 500,
                    }}
                  >
                    {s}
                  </span>
                ))}
                <button
                  onClick={() => onSwitchTab && onSwitchTab("intelligence")}
                  style={{
                    background: "var(--surface-subtle)",
                    color: "var(--ink-4)",
                    borderRadius: 20,
                    padding: "5px 13px",
                    fontSize: 12,
                    fontWeight: 500,
                  }}
                >
                  + add area
                </button>
              </div>
            ) : (
              <p style={{ fontSize: 11, color: "var(--ink-5)", fontStyle: "italic" }}>
                Capture more to build your signal profile
              </p>
            )}
          </div>

          {/* 3-Year Target — Horizontal Timeline */}
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: 22,
              boxShadow: "var(--shadow-sm)",
              position: "relative",
            }}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <div
                  style={{
                    fontSize: 9,
                    textTransform: "uppercase",
                    color: "var(--ink-5)",
                    letterSpacing: "0.08em",
                    fontWeight: 600,
                    marginBottom: 4,
                  }}
                >
                  3-year target
                </div>
                {editingField === "north_star_goal" ? (
                  <input
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && saveEdit("north_star_goal")}
                    onBlur={() => saveEdit("north_star_goal")}
                    autoFocus
                    className="bg-transparent border-b border-brand text-[13px] text-surface-ink-subtle outline-none"
                    style={{ minWidth: 240 }}
                  />
                ) : (
                  <p
                    style={{
                      fontSize: 13,
                      color: "var(--surface-ink-subtle)",
                      lineHeight: 1.5,
                      fontWeight: 500,
                    }}
                  >
                    {profile?.north_star_goal || "Set your north star goal"}
                  </p>
                )}
              </div>
              {editingField !== "north_star_goal" && (
                <button
                  onClick={() => startEdit("north_star_goal", profile?.north_star_goal || "")}
                  className="opacity-50 hover:opacity-100 transition-opacity ml-2 shrink-0"
                >
                  <Pencil className="w-3 h-3" style={{ color: "var(--ink-5)" }} />
                </button>
              )}
            </div>

            {/* Timeline rail */}
            {(() => {
              // 4 nodes: Foundation (onboarding), Building (signals), Now (positioning), Target (north star)
              const onboardingDone = !!profile?.onboarding_completed;
              const auditOrBrandDone = !!profile?.audit_completed_at || !!profile?.brand_assessment_completed_at;
              const positioningDone = !!positioningTitle;
              const nodes = [
                { label: "Foundation", state: onboardingDone ? "done" : "future" as "done"|"current"|"future" },
                { label: "Building", state: auditOrBrandDone ? "done" : (onboardingDone ? "current" : "future") as "done"|"current"|"future" },
                { label: "Now", state: positioningDone ? "current" : (auditOrBrandDone ? "current" : "future") as "done"|"current"|"future" },
                { label: "3-yr target", state: "future" as "done"|"current"|"future" },
              ];
              return (
                <div className="relative" style={{ paddingTop: 6, paddingBottom: 4 }}>
                  {/* Connecting line */}
                  <div
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      top: 16,
                      left: "8%",
                      right: "8%",
                      height: 1,
                      background: "rgba(0,0,0,0.12)",
                    }}
                  />
                  <div className="grid grid-cols-4 relative">
                    {nodes.map((n, i) => {
                      const isDone = n.state === "done";
                      const isCurrent = n.state === "current";
                      return (
                        <div key={i} className="flex flex-col items-center">
                          <span
                            className="flex items-center justify-center"
                            style={{
                              width: 20,
                              height: 20,
                              borderRadius: "50%",
                              background: isDone
                                ? "var(--success)"
                                : isCurrent
                                  ? "var(--brand)"
                                  : "var(--surface-subtle)",
                              border: !isDone && !isCurrent ? "2px solid rgba(0,0,0,0.12)" : "none",
                              boxShadow: isCurrent ? "0 0 0 4px var(--brand-muted)" : "none",
                              zIndex: 1,
                            }}
                          >
                            {isDone && <Check className="w-2.5 h-2.5" style={{ color: "#fff" }} strokeWidth={3} />}
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              color: isCurrent ? "var(--brand)" : isDone ? "var(--ink-3)" : "var(--ink-5)",
                              marginTop: 8,
                              fontWeight: isCurrent ? 600 : 400,
                              textAlign: "center",
                            }}
                          >
                            {n.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Full Profile Link */}
          <button
            onClick={() => setFullProfileOpen(true)}
            className="flex items-center gap-1.5 transition-colors"
            style={{ fontSize: 11, color: "var(--brand)" }}
          >
            Full profile <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Full Profile Modal */}
      {fullProfileOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.8)" }} onClick={() => setFullProfileOpen(false)}>
          <div
            className="relative overflow-y-auto"
            style={{ width: 680, maxWidth: "90vw", maxHeight: "88vh", background: "var(--ink)", border: "1px solid var(--ink-3)", borderRadius: 12, padding: 24 }}
            onClick={e => e.stopPropagation()}
          >
            <button onClick={() => setFullProfileOpen(false)} className="absolute top-4 right-4 text-ink-5 hover:text-ink-7 transition-colors">
              <X className="w-5 h-5" />
            </button>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--ink-7)", marginBottom: 20 }}>Strategic Identity</h2>

            <div className="space-y-6">
              <ProfileIntelligence onGenerateContent={handleGenerateContent} />
              <VoiceEngineSection />
              <BrandArchetypeWidget onStartAssessment={() => { setFullProfileOpen(false); setBrandOpen(true); }} />
              <AuditRadarWidget onStartAudit={() => { setFullProfileOpen(false); setAuditOpen(true); }} />

              <div className="pt-4 border-t border-ink-3">
                <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-7)", marginBottom: 12 }}>Profile Settings</h3>
                <ProfileManagement onResetDiagnostic={onResetDiagnostic} onNavigate={handleNavigate} />
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Assessment Modals */}
      <ObjectiveAuditModal open={auditOpen} onOpenChange={setAuditOpen} onNavigate={handleNavigate} />
      <BrandAssessmentModal open={brandOpen} onOpenChange={setBrandOpen} onNavigate={handleNavigate} />
    </div>
  );
};

export default IdentityTab;
