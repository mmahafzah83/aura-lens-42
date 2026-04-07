import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Pencil, Check, X, RefreshCw, Loader2, Calendar, ArrowRight } from "lucide-react";
import ProfileCompletenessCard from "@/components/ProfileCompletenessCard";

interface ProfileData {
  first_name: string | null;
  level: string | null;
  primary_strength: string | null;
  sector_focus: string | null;
  north_star_goal: string | null;
  core_practice: string | null;
  firm: string | null;
  brand_pillars: string[];
}

interface ProfileDates {
  onboarding_completed: boolean;
  created_at: string;
  audit_completed_at: string | null;
  brand_assessment_completed_at: string | null;
}

const OnboardingProfileSection = () => {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [dates, setDates] = useState<ProfileDates | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [brandSummary, setBrandSummary] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const [showFullEdit, setShowFullEdit] = useState(false);
  const [fullEditData, setFullEditData] = useState<ProfileData | null>(null);

  const loadProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await (supabase.from("diagnostic_profiles") as any)
      .select("first_name, level, primary_strength, sector_focus, north_star_goal, core_practice, firm, brand_pillars, onboarding_completed, created_at, audit_completed_at, brand_assessment_completed_at, audit_results, brand_assessment_results, identity_intelligence")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) {
      setProfile(data);
      setDates({
        onboarding_completed: data.onboarding_completed,
        created_at: data.created_at,
        audit_completed_at: data.audit_completed_at,
        brand_assessment_completed_at: data.brand_assessment_completed_at,
      });
      // Try AI-generated brand positioning on load
      generateAIPositioning(data);
    }
    setLoading(false);
  };

  useEffect(() => { loadProfile(); }, []);

  const generateLocalSummary = (p: ProfileData) => {
    const role = p.level || "professional";
    const industry = p.sector_focus || "your industry";
    const goal = p.north_star_goal || "building authority";
    const strength = p.primary_strength || "";
    const strengthLabel = strength.includes("strategically") ? "strategic thinking"
      : strength.includes("data") ? "evidence-based analysis"
      : strength.includes("people") ? "collaborative leadership"
      : strength.includes("Execute") ? "execution speed" : "your unique strengths";
    setBrandSummary(
      `As a ${role.toLowerCase()} in ${industry}, your natural strength in ${strengthLabel} positions you to lead conversations around ${goal.toLowerCase()}. Aura recommends you build authority by consistently sharing insights that combine your operational expertise with forward-looking industry perspective.`
    );
  };

  const saveField = async (field: string, value: string) => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const updateObj: any = {};
    const dbField = field === "industry" ? "sector_focus" : field === "career_target" ? "north_star_goal" : field === "role" ? "level" : field;
    updateObj[dbField] = value;
    const { error } = await (supabase.from("diagnostic_profiles") as any)
      .update(updateObj).eq("user_id", user.id);
    if (error) { toast.error("Failed to save"); }
    else {
      toast.success("Profile updated.");
      await loadProfile();
    }
    setSaving(false);
    setEditingField(null);
  };

  const generateAIPositioning = async (p: ProfileData) => {
    setRegenerating(true);
    setBrandSummary("Writing your brand positioning...");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: fullProfile } = await (supabase.from("diagnostic_profiles") as any)
        .select("level, sector_focus, north_star_goal, firm, core_practice, primary_strength, brand_pillars, audit_results, brand_assessment_results, identity_intelligence")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!fullProfile) { generateLocalSummary(p); return; }

      const identityIntel = fullProfile.identity_intelligence || {};
      const profileContext = JSON.stringify({
        role: fullProfile.level,
        industry: fullProfile.sector_focus,
        career_target: fullProfile.north_star_goal,
        firm: fullProfile.firm,
        core_practice: fullProfile.core_practice,
        primary_strength: fullProfile.primary_strength,
        brand_pillars: fullProfile.brand_pillars,
        audit_results: fullProfile.audit_results,
        brand_assessment_results: fullProfile.brand_assessment_results,
        expertise_areas: identityIntel.expertise_areas,
        authority_ambitions: identityIntel.authority_ambitions,
      }, null, 2);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No session");

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-brand-positioning`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ profileContext }),
      });

      if (!resp.ok) throw new Error("Failed to generate");
      const data = await resp.json();
      if (data.positioning) {
        setBrandSummary(data.positioning);
      } else {
        throw new Error("No positioning returned");
      }
    } catch (e: any) {
      console.error("Brand positioning error:", e);
      generateLocalSummary(p);
    } finally {
      setRegenerating(false);
    }
  };
  const handleRegenerate = async () => {
    if (!profile) return;
    setRegenerating(true);
    setBrandSummary("Writing your brand positioning...");

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Fetch full profile data for the AI
      const { data: fullProfile } = await (supabase.from("diagnostic_profiles") as any)
        .select("level, sector_focus, north_star_goal, firm, core_practice, primary_strength, brand_pillars, audit_results, brand_assessment_results, identity_intelligence")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!fullProfile) throw new Error("Profile not found");

      const identityIntel = fullProfile.identity_intelligence || {};

      const profileContext = JSON.stringify({
        role: fullProfile.level,
        industry: fullProfile.sector_focus,
        career_target: fullProfile.north_star_goal,
        firm: fullProfile.firm,
        core_practice: fullProfile.core_practice,
        primary_strength: fullProfile.primary_strength,
        brand_pillars: fullProfile.brand_pillars,
        audit_results: fullProfile.audit_results,
        brand_assessment_results: fullProfile.brand_assessment_results,
        expertise_areas: identityIntel.expertise_areas,
        authority_ambitions: identityIntel.authority_ambitions,
      }, null, 2);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No session");

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-brand-positioning`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ profileContext }),
      });

      if (!resp.ok) throw new Error("Failed to generate");
      const data = await resp.json();
      if (data.positioning) {
        setBrandSummary(data.positioning);
        toast.success("Brand positioning refreshed.");
      } else {
        throw new Error("No positioning returned");
      }
    } catch (e: any) {
      console.error("Brand positioning error:", e);
      // Fall back to local generation
      generateLocalSummary(profile);
      toast.error("Could not generate AI positioning — showing default.");
    } finally {
      setRegenerating(false);
    }
  };

  const saveFullEdit = async () => {
    if (!fullEditData) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const { error } = await (supabase.from("diagnostic_profiles") as any)
      .update({
        first_name: fullEditData.first_name,
        level: fullEditData.level,
        primary_strength: fullEditData.primary_strength,
        sector_focus: fullEditData.sector_focus,
        north_star_goal: fullEditData.north_star_goal,
        core_practice: fullEditData.core_practice,
        firm: fullEditData.firm,
      }).eq("user_id", user.id);
    if (error) { toast.error("Failed to save"); }
    else {
      toast.success("Profile updated.");
      await loadProfile();
    }
    setSaving(false);
    setShowFullEdit(false);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#C5A55A" }} />
      </div>
    );
  }

  if (!profile) return null;

  const profileFields = [
    { key: "first_name", label: "Name", value: profile.first_name },
    { key: "role", label: "Role", value: profile.level },
    { key: "primary_strength", label: "Primary strength", value: profile.primary_strength },
    { key: "industry", label: "Industry / Sector", value: profile.sector_focus },
    { key: "career_target", label: "Career target", value: profile.north_star_goal },
    { key: "core_practice", label: "Core practice", value: profile.core_practice },
    { key: "firm", label: "Firm", value: profile.firm },
  ];

  const handleCompletenessAction = (action: string) => {
    if (action === "edit_name") { setEditingField("first_name"); setEditValue(profile?.first_name || ""); }
    else if (action === "edit_role") { setEditingField("role"); setEditValue(profile?.level || ""); }
    else if (action === "edit_industry") { setEditingField("industry"); setEditValue(profile?.sector_focus || ""); }
    else if (action === "edit_career_target") { setEditingField("career_target"); setEditValue(profile?.north_star_goal || ""); }
    else if (action === "edit_firm") { setEditingField("firm"); setEditValue(profile?.firm || ""); }
    else if (action === "edit_core_practice") { setEditingField("core_practice"); setEditValue(profile?.core_practice || ""); }
    else if (action === "edit_strength") { /* handled via profile fields edit */ }
    else if (action === "edit_pillars") { setShowFullEdit(true); setFullEditData({ ...profile! }); }
  };

  return (
    <div className="space-y-8">
      {/* Profile Completeness */}
      <ProfileCompletenessCard onAction={handleCompletenessAction} />

      {/* Section 1: Your Profile */}
      <div className="space-y-3">
        <h2 className="text-xs uppercase tracking-[0.2em] font-medium" style={{ color: "#C5A55A" }}>Your profile</h2>
        <div className="rounded-xl overflow-hidden" style={{ background: "#141414", border: "1px solid #252525" }}>
          {profileFields.map((f, i) => (
            <div
              key={f.key}
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: i < profileFields.length - 1 ? "1px solid #252525" : "none" }}
            >
              <div className="flex-1 min-w-0">
                <span className="text-[10px] uppercase tracking-wider block" style={{ color: "#666" }}>{f.label}</span>
                {editingField === f.key ? (
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      autoFocus
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      className="flex-1 px-2 py-1 rounded text-sm outline-none"
                      style={{ background: "#0d0d0d", border: "1px solid #252525", color: "#f0f0f0" }}
                    />
                    <button
                      onClick={() => saveField(f.key, editValue)}
                      disabled={saving}
                      className="p-1 rounded"
                      style={{ color: "#7ab648" }}
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button onClick={() => setEditingField(null)} className="p-1 rounded" style={{ color: "#666" }}>
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <span className="text-sm block mt-0.5" style={{ color: f.value ? "#f0f0f0" : "#3a3a3a" }}>
                    {f.value || "Not set"}
                  </span>
                )}
              </div>
              {editingField !== f.key && (
                <button
                  onClick={() => { setEditingField(f.key); setEditValue(f.value || ""); }}
                  className="text-xs flex items-center gap-1 ml-3 shrink-0"
                  style={{ color: "#C5A55A" }}
                >
                  <Pencil className="w-3 h-3" /> Edit
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Section 2: Assessment History */}
      <div className="space-y-3">
        <h2 className="text-xs uppercase tracking-[0.2em] font-medium" style={{ color: "#C5A55A" }}>Assessment history</h2>
        <div className="rounded-xl overflow-hidden" style={{ background: "#141414", border: "1px solid #252525" }}>
          {/* Onboarding */}
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid #252525" }}>
            <div className="flex items-center gap-3">
              <Calendar className="w-3.5 h-3.5 shrink-0" style={{ color: "#666" }} />
              <div>
                <span className="text-sm block" style={{ color: "#f0f0f0" }}>Onboarding</span>
                <span className="text-[10px] block" style={{ color: "#666" }}>
                  {dates?.onboarding_completed ? `Completed ${formatDate(dates.created_at)}` : "Not completed"}
                </span>
              </div>
            </div>
          </div>

          {/* Evidence Audit */}
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid #252525" }}>
            <div className="flex items-center gap-3">
              <Calendar className="w-3.5 h-3.5 shrink-0" style={{ color: "#666" }} />
              <div>
                <span className="text-sm block" style={{ color: "#f0f0f0" }}>Evidence Audit</span>
                <span className="text-[10px] block" style={{ color: dates?.audit_completed_at ? "#666" : "#3a3a3a" }}>
                  {dates?.audit_completed_at ? `Completed ${formatDate(dates.audit_completed_at)}` : "Not completed yet"}
                </span>
              </div>
            </div>
            <button className="text-[11px] flex items-center gap-1" style={{ color: "#C5A55A" }}>
              Retake <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {/* Brand Assessment */}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <Calendar className="w-3.5 h-3.5 shrink-0" style={{ color: "#666" }} />
              <div>
                <span className="text-sm block" style={{ color: "#f0f0f0" }}>Brand Assessment</span>
                <span className="text-[10px] block" style={{ color: dates?.brand_assessment_completed_at ? "#666" : "#3a3a3a" }}>
                  {dates?.brand_assessment_completed_at ? `Completed ${formatDate(dates.brand_assessment_completed_at)}` : "Not completed yet"}
                </span>
              </div>
            </div>
            <button className="text-[11px] flex items-center gap-1" style={{ color: "#C5A55A" }}>
              Retake <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Section 3: Brand Positioning */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs uppercase tracking-[0.2em] font-medium" style={{ color: "#C5A55A" }}>Brand positioning</h2>
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            className="text-[11px] flex items-center gap-1"
            style={{ color: "#666" }}
          >
            <RefreshCw className={`w-3 h-3 ${regenerating ? "animate-spin" : ""}`} /> Regenerate
          </button>
        </div>
        <div className="rounded-xl p-4 space-y-2" style={{ background: "#141414", border: "1px solid #252525" }}>
          <p className="text-[10px] uppercase tracking-wider" style={{ color: "#666" }}>What Aura recommends you stand for</p>
          <p className="text-sm leading-relaxed" style={{ color: regenerating ? "#666" : "#f0f0f0", fontStyle: regenerating ? "italic" : "normal" }}>
            {brandSummary}
          </p>
        </div>
      </div>

      {/* Edit full profile */}
      {!showFullEdit ? (
        <button
          onClick={() => { setFullEditData({ ...profile }); setShowFullEdit(true); }}
          className="w-full py-3 rounded-xl text-sm font-medium"
          style={{ background: "#141414", border: "1px solid #252525", color: "#C5A55A" }}
        >
          Edit full profile
        </button>
      ) : (
        <div className="rounded-xl p-4 space-y-4" style={{ background: "#141414", border: "1px solid #C5A55A33" }}>
          <h3 className="text-xs uppercase tracking-wider" style={{ color: "#C5A55A" }}>Edit all fields</h3>
          {[
            { key: "first_name", label: "Name" },
            { key: "level", label: "Role" },
            { key: "primary_strength", label: "Primary strength" },
            { key: "sector_focus", label: "Industry / Sector" },
            { key: "north_star_goal", label: "Career target" },
            { key: "core_practice", label: "Core practice" },
            { key: "firm", label: "Firm" },
          ].map(f => (
            <div key={f.key} className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider" style={{ color: "#666" }}>{f.label}</label>
              <input
                value={(fullEditData as any)?.[f.key] || ""}
                onChange={e => setFullEditData(prev => prev ? { ...prev, [f.key]: e.target.value } : prev)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: "#0d0d0d", border: "1px solid #252525", color: "#f0f0f0" }}
              />
            </div>
          ))}
          <div className="flex gap-2">
            <button
              onClick={saveFullEdit}
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium"
              style={{ background: "#C5A55A", color: "#0d0d0d" }}
            >
              {saving ? "Saving..." : "Save all changes"}
            </button>
            <button
              onClick={() => setShowFullEdit(false)}
              className="px-4 py-2.5 rounded-xl text-sm"
              style={{ background: "#252525", color: "#666" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default OnboardingProfileSection;
