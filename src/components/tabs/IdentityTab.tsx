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
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [authorityScore, setAuthorityScore] = useState<number | null>(null);
  const [signalStats, setSignalStats] = useState({ count: 0, topConfidence: 0, totalOrgs: 0, topSignals: [] as string[] });
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

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const [profileRes, scoreRes, signalsRes] = await Promise.all([
      (supabase.from("diagnostic_profiles" as any) as any)
        .select("first_name, level, firm, sector_focus, core_practice, north_star_goal, brand_pillars, avatar_url, onboarding_completed, audit_completed_at, brand_assessment_completed_at, brand_assessment_results, identity_intelligence, primary_strength")
        .eq("user_id", user.id).maybeSingle(),
      (supabase.from("authority_scores") as any)
        .select("authority_score").eq("user_id", user.id)
        .order("snapshot_date", { ascending: false }).limit(1).maybeSingle(),
      (supabase.from("strategic_signals") as any)
        .select("signal_title, confidence, unique_orgs")
        .eq("user_id", user.id).eq("status", "active")
        .order("confidence", { ascending: false }).limit(20),
    ]);

    if (profileRes.data) setProfile(profileRes.data);
    if (scoreRes.data) setAuthorityScore(scoreRes.data.authority_score);
    if (signalsRes.data) {
      const signals = signalsRes.data as any[];
      setSignalStats({
        count: signals.length,
        topConfidence: signals.length > 0 ? Math.round(Number(signals[0].confidence) * 100) : 0,
        totalOrgs: signals.reduce((s: number, sig: any) => s + (sig.unique_orgs || 0), 0),
        topSignals: signals.slice(0, 4).map((s: any) => s.signal_title),
      });
    }
    setLoading(false);
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
      loadAll();
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

  if (loading) {
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
      {/* Two-column layout */}
      <div className="flex flex-col md:flex-row gap-6">
        {/* LEFT COLUMN */}
        <div className="w-full md:w-[200px] md:shrink-0 space-y-3">
          {/* Avatar Block */}
          <div style={{ background: "#141414", border: "1px solid #252525", borderRadius: 10, padding: 16, textAlign: "center" }}>
            {/* Avatar ring */}
            <div className="mx-auto relative" style={{ width: 80, height: 80 }}>
              <div
                className="w-full h-full rounded-full overflow-hidden flex items-center justify-center cursor-pointer group"
                style={{ border: "2px solid #C5A55A" }}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadingAvatar ? (
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#C5A55A" }} />
                ) : profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <span style={{ color: "#C5A55A", fontSize: 24, fontWeight: 600 }}>{initials}</span>
                )}
                {/* Hover overlay */}
                <div className="absolute inset-0 rounded-full bg-black/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Upload className="w-3.5 h-3.5" style={{ color: "#C5A55A" }} />
                  <span style={{ color: "#C5A55A", fontSize: 10 }}>Upload</span>
                </div>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
            </div>

            {/* Name & role */}
            <p style={{ fontSize: 14, fontWeight: 600, color: "#f0f0f0", marginTop: 10 }}>{userName}</p>
            <p style={{ fontSize: 11, color: "#888", lineHeight: 1.4 }}>{profile?.level || "Executive"}</p>

            {/* Authority score */}
            <div style={{ background: "#1a1400", border: "1px solid rgba(197,165,90,0.2)", borderRadius: 6, padding: "6px 10px", marginTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 22, fontWeight: 700, color: "#C5A55A" }}>
                {authorityScore != null ? Math.round(Number(authorityScore)) : "—"}
              </span>
              <span style={{ fontSize: 9, color: "#888" }}>Authority<br/>Score</span>
            </div>
          </div>

          {/* Identity Facts */}
          <div style={{ background: "#141414", border: "1px solid #252525", borderRadius: 10, padding: 12 }}>
            {identityFacts.map(fact => (
              <div key={fact.key} className="mb-2 last:mb-0">
                <div style={{ fontSize: 9, textTransform: "uppercase", color: "#555", letterSpacing: "0.05em" }}>{fact.label}</div>
                {editingField === fact.key ? (
                  <div className="flex items-center gap-1 mt-0.5">
                    <input
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && saveEdit(fact.key)}
                      onBlur={() => saveEdit(fact.key)}
                      autoFocus
                      className="flex-1 bg-transparent border-b border-[#C5A55A] text-[11px] text-[#d0d0d0] outline-none py-0.5"
                    />
                    {saving ? <Loader2 className="w-3 h-3 animate-spin text-[#C5A55A]" /> : <Check className="w-3 h-3 text-green-500" />}
                  </div>
                ) : (
                  <div className="flex items-center justify-between group mt-0.5">
                    <span style={{ fontSize: 11, color: "#d0d0d0", wordBreak: "break-word", lineHeight: 1.4 }} className="flex-1">{fact.value || "—"}</span>
                    <button onClick={() => startEdit(fact.key, fact.value)} className="opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                      <Pencil className="w-2.5 h-2.5 text-[#555] hover:text-[#C5A55A]" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Assessments */}
          <div style={{ background: "#141414", border: "1px solid #252525", borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 9, textTransform: "uppercase", color: "#555", marginBottom: 8, letterSpacing: "0.05em" }}>Completed</div>
            {assessments.map(a => (
              <div key={a.name} className="flex items-center gap-2 mb-1.5 last:mb-0">
                {a.done ? (
                  <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0" style={{ background: "#C5A55A" }}>
                    <Check className="w-2 h-2 text-black" />
                  </div>
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full border shrink-0" style={{ borderColor: "#555" }} />
                )}
                <span style={{ fontSize: 10, color: a.done ? "#888" : "#555", flex: 1 }}>{a.name}</span>
                {a.done && a.date ? (
                  <span style={{ fontSize: 9, color: "#555" }}>{new Date(a.date).toLocaleDateString()}</span>
                ) : !a.done ? (
                  <button
                    onClick={() => {
                      if (a.name === "Evidence Audit") setAuditOpen(true);
                      else if (a.name === "Brand Assessment") setBrandOpen(true);
                    }}
                    style={{ fontSize: 9, color: "#C5A55A" }}
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
          {/* Positioning Card */}
          <div style={{ background: "#141414", borderLeft: "2px solid #C5A55A", borderRadius: "0 10px 10px 0", padding: 16, position: "relative" }}>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div style={{ fontSize: 9, textTransform: "uppercase", color: "#C5A55A", letterSpacing: "0.1em", marginBottom: 6 }}>
                  HOW AURA POSITIONS ME
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: "#f0f0f0", marginBottom: 8 }}>
                  {positioningTitle || "Complete your profile to unlock positioning"}
                </h3>
                {profile?.brand_pillars && profile.brand_pillars.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {profile.brand_pillars.map((p, i) => (
                      <span key={i} style={{ background: "#1a1400", border: "1px solid rgba(197,165,90,0.27)", color: "#C5A55A", fontSize: 9, padding: "2px 8px", borderRadius: 20 }}>{p}</span>
                    ))}
                  </div>
                )}
                {positioningStatement && (
                  <div>
                    <p style={{ fontSize: 12, color: "#888", lineHeight: 1.6, fontStyle: "italic" }} className={showFullPositioning ? "" : "line-clamp-4"}>
                      {positioningStatement}
                    </p>
                    {positioningStatement.length > 200 && (
                      <button onClick={() => setShowFullPositioning(!showFullPositioning)} style={{ fontSize: 10, color: "#C5A55A", marginTop: 4 }}>
                        {showFullPositioning ? "Show less" : "Show more"}
                      </button>
                    )}
                  </div>
                )}
              </div>
              <button onClick={regeneratePositioning} disabled={regenerating} style={{ fontSize: 10, color: "#555" }} className="shrink-0 ml-3 hover:text-[#C5A55A] transition-colors">
                {regenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Regenerate →"}
              </button>
            </div>
          </div>

          {/* Timeline */}
          <div className="relative" style={{ paddingLeft: 20 }}>
            {/* Vertical line */}
            <div className="absolute" style={{ left: 5, top: 8, bottom: 8, width: 1, background: "linear-gradient(to bottom, #C5A55A, #252525)" }} />

            {/* Node 1 — Where I Am Now */}
            <div className="relative mb-4">
              <div className="absolute" style={{ left: -20, top: 6, width: 8, height: 8, borderRadius: "50%", background: "#C5A55A" }} />
              <div style={{ background: "#141414", border: "1px solid #252525", borderRadius: 8, padding: "10px 12px" }}>
                <div className="flex items-center justify-between group">
                  <div>
                    <p style={{ fontSize: 12, color: "#e0e0e0" }}>{[profile?.level, profile?.firm].filter(Boolean).join(" · ") || "Your current role"}</p>
                    <p style={{ fontSize: 10, color: "#666" }}>{[profile?.sector_focus, profile?.core_practice].filter(Boolean).join(" · ")}</p>
                  </div>
                  <button onClick={() => startEdit("level", profile?.level || "")} className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <Pencil className="w-3 h-3 text-[#555] hover:text-[#C5A55A]" />
                  </button>
                </div>
              </div>
            </div>

            {/* Node 2 — Building Authority In */}
            <div className="relative mb-4">
              <div className="absolute" style={{ left: -20, top: 6, width: 8, height: 8, borderRadius: "50%", border: "2px solid #C5A55A", background: "transparent" }} />
              <div style={{ background: "#141414", border: "1px solid #252525", borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 9, textTransform: "uppercase", color: "#555", marginBottom: 6, letterSpacing: "0.05em" }}>BUILDING AUTHORITY IN</div>
                {signalStats.topSignals.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {signalStats.topSignals.map((s, i) => (
                      <span key={i} style={{ background: "#1a1400", border: "1px solid rgba(197,165,90,0.27)", color: "#C5A55A", fontSize: 9, padding: "2px 8px", borderRadius: 20 }}>{s}</span>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: 10, color: "#555", marginBottom: 6, fontStyle: "italic" }}>No signals detected yet</p>
                )}
                <div className="flex gap-2">
                  {[
                    { val: signalStats.count, label: "signals" },
                    { val: signalStats.topConfidence ? `${signalStats.topConfidence}%` : "—", label: "top strength" },
                    { val: signalStats.totalOrgs, label: "organisations" },
                  ].map((box, i) => (
                    <div key={i} style={{ background: "#111", border: "1px solid #222", borderRadius: 6, padding: 5, textAlign: "center", flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#C5A55A" }}>{box.val}</div>
                      <div style={{ fontSize: 8, color: "#555" }}>{box.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Node 3 — 3-Year Target */}
            <div className="relative">
              <div className="absolute" style={{ left: -20, top: 6, width: 8, height: 8, borderRadius: "50%", border: "2px solid #555", background: "transparent" }} />
              <div style={{ background: "#0a120a", border: "1px solid #2a4a2a", borderRadius: 8, padding: "10px 12px" }}>
                <div className="flex items-start justify-between group">
                  <div className="flex-1">
                    <div style={{ fontSize: 9, textTransform: "uppercase", color: "#4a8a4a", marginBottom: 4, letterSpacing: "0.05em" }}>3-YEAR TARGET</div>
                    {editingField === "north_star_goal" ? (
                      <div className="flex items-center gap-1">
                        <input
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && saveEdit("north_star_goal")}
                          onBlur={() => saveEdit("north_star_goal")}
                          autoFocus
                          className="flex-1 bg-transparent border-b border-[#4a8a4a] text-[11px] text-[#88c488] outline-none"
                        />
                      </div>
                    ) : (
                      <p style={{ fontSize: 11, color: "#88c488", lineHeight: 1.5 }}>{profile?.north_star_goal || "Set your north star goal"}</p>
                    )}
                  </div>
                  {editingField !== "north_star_goal" && (
                    <button onClick={() => startEdit("north_star_goal", profile?.north_star_goal || "")} className="opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                      <Pencil className="w-3 h-3 text-[#555] hover:text-[#4a8a4a]" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Full Profile Link */}
          <button
            onClick={() => setFullProfileOpen(true)}
            className="flex items-center gap-1.5 transition-colors"
            style={{ fontSize: 11, color: "#C5A55A" }}
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
            style={{ width: 680, maxWidth: "90vw", maxHeight: "88vh", background: "#0d0d0d", border: "1px solid #252525", borderRadius: 12, padding: 24 }}
            onClick={e => e.stopPropagation()}
          >
            <button onClick={() => setFullProfileOpen(false)} className="absolute top-4 right-4 text-[#555] hover:text-[#f0f0f0] transition-colors">
              <X className="w-5 h-5" />
            </button>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: "#f0f0f0", marginBottom: 20 }}>Strategic Identity</h2>

            <div className="space-y-6">
              <ProfileIntelligence onGenerateContent={handleGenerateContent} />
              <VoiceEngineSection />
              <BrandArchetypeWidget onStartAssessment={() => { setFullProfileOpen(false); setBrandOpen(true); }} />
              <AuditRadarWidget onStartAudit={() => { setFullProfileOpen(false); setAuditOpen(true); }} />

              <div className="pt-4 border-t border-[#252525]">
                <h3 style={{ fontSize: 13, fontWeight: 600, color: "#f0f0f0", marginBottom: 12 }}>Profile Settings</h3>
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
