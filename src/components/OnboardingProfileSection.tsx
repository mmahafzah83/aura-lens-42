import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Pencil, Check, X, RefreshCw, Loader2, ChevronDown } from "lucide-react";

const ROLES = [
  "Senior consultant or advisor",
  "Executive or director",
  "Independent expert or founder",
  "Other professional",
];

const STRENGTHS = [
  "Think strategically — see the big picture first",
  "Go deep into the data and evidence",
  "Work with people to find the answer together",
  "Execute — find the fastest path and move",
];

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

const OnboardingProfileSection = () => {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [changingAnswer, setChangingAnswer] = useState<"role" | "strength" | null>(null);
  const [brandSummary, setBrandSummary] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const [showFullEdit, setShowFullEdit] = useState(false);
  const [fullEditData, setFullEditData] = useState<ProfileData | null>(null);

  const loadProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await (supabase.from("diagnostic_profiles") as any)
      .select("first_name, level, primary_strength, sector_focus, north_star_goal, core_practice, firm, brand_pillars")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) {
      setProfile(data);
      generateBrandSummary(data);
    }
    setLoading(false);
  };

  useEffect(() => { loadProfile(); }, []);

  const generateBrandSummary = (p: ProfileData) => {
    const role = p.level || "professional";
    const strength = p.primary_strength || "";
    const industry = p.sector_focus || "your industry";
    const goal = p.north_star_goal || "building authority";
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
    setChangingAnswer(null);
  };

  const handleRegenerate = async () => {
    if (!profile) return;
    setRegenerating(true);
    // Re-generate locally (could call AI edge function in future)
    generateBrandSummary(profile);
    await new Promise(r => setTimeout(r, 800));
    setRegenerating(false);
    toast.success("Brand positioning refreshed.");
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

  return (
    <div className="space-y-8">
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

      {/* Section 2: Your Assessment */}
      <div className="space-y-3">
        <h2 className="text-xs uppercase tracking-[0.2em] font-medium" style={{ color: "#C5A55A" }}>Your assessment</h2>

        {/* Role question */}
        <div className="rounded-xl p-4 space-y-2" style={{ background: "#141414", border: "1px solid #252525" }}>
          <p className="text-xs" style={{ color: "#666" }}>What best describes your role?</p>
          <p className="text-sm font-medium" style={{ color: "#C5A55A" }}>{profile.level || "Not answered"}</p>
          {changingAnswer === "role" ? (
            <div className="space-y-2 pt-2" style={{ borderTop: "1px solid #252525" }}>
              {ROLES.map(r => (
                <button
                  key={r}
                  onClick={() => saveField("role", r)}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm transition-all"
                  style={{
                    background: profile.level === r ? "#1e1a10" : "#0d0d0d",
                    border: `1px solid ${profile.level === r ? "#C5A55A" : "#252525"}`,
                    color: profile.level === r ? "#C5A55A" : "#f0f0f0",
                  }}
                >
                  {r}
                </button>
              ))}
              <button onClick={() => setChangingAnswer(null)} className="text-xs mt-1" style={{ color: "#666" }}>Cancel</button>
            </div>
          ) : (
            <button onClick={() => setChangingAnswer("role")} className="text-[11px]" style={{ color: "#C5A55A99" }}>
              Change answer
            </button>
          )}
        </div>

        {/* Strength question */}
        <div className="rounded-xl p-4 space-y-2" style={{ background: "#141414", border: "1px solid #252525" }}>
          <p className="text-xs" style={{ color: "#666" }}>When you solve a problem, you usually...</p>
          <p className="text-sm font-medium" style={{ color: "#C5A55A" }}>{profile.primary_strength || "Not answered"}</p>
          {changingAnswer === "strength" ? (
            <div className="space-y-2 pt-2" style={{ borderTop: "1px solid #252525" }}>
              {STRENGTHS.map(s => (
                <button
                  key={s}
                  onClick={() => saveField("primary_strength", s)}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm transition-all"
                  style={{
                    background: profile.primary_strength === s ? "#1e1a10" : "#0d0d0d",
                    border: `1px solid ${profile.primary_strength === s ? "#C5A55A" : "#252525"}`,
                    color: profile.primary_strength === s ? "#C5A55A" : "#f0f0f0",
                  }}
                >
                  {s}
                </button>
              ))}
              <button onClick={() => setChangingAnswer(null)} className="text-xs mt-1" style={{ color: "#666" }}>Cancel</button>
            </div>
          ) : (
            <button onClick={() => setChangingAnswer("strength")} className="text-[11px]" style={{ color: "#C5A55A99" }}>
              Change answer
            </button>
          )}
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
          <p className="text-sm leading-relaxed" style={{ color: "#f0f0f0" }}>{brandSummary}</p>
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
