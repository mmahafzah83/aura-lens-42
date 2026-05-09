import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { UserCog, Save, Plus, X, Loader2, ShieldCheck, RefreshCw, ClipboardCheck, Compass, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { EVIDENCE_MATRIX } from "@/components/diagnostic/EvidenceMatrix";
import ObjectiveAuditModal from "@/components/ObjectiveAuditModal";
import BrandAssessmentModal from "@/components/BrandAssessmentModal";

interface Skill {
  name: string;
  description?: string;
}

interface ProfileManagementProps {
  onResetDiagnostic?: () => void;
  onNavigate?: (tab: string) => void;
  startExpanded?: boolean;
  /** When true, hides Audit/Brand/Reset triggers — used inside the GuidedJourney flow
   *  where those steps live as separate cards. */
  compact?: boolean;
}

const SECTOR_OPTIONS = [
  "Consulting", "Energy", "Finance", "Government", "Technology",
  "Healthcare", "Telecom", "Real Estate", "Manufacturing", "Other",
];

const ProfileManagement = ({ onResetDiagnostic, onNavigate, startExpanded, compact }: ProfileManagementProps) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [firm, setFirm] = useState("");
  const [level, setLevel] = useState("");
  const [corePractice, setCorePractice] = useState("");
  const [sectorFocus, setSectorFocus] = useState("");
  const [sectorOther, setSectorOther] = useState("");
  const [hasSavedBefore, setHasSavedBefore] = useState(false);
  const [northStar, setNorthStar] = useState("");
  const [brandPillars, setBrandPillars] = useState<string[]>([]);
  const [newPillar, setNewPillar] = useState("");
  const [skills, setSkills] = useState<Skill[]>([]);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [newSkillName, setNewSkillName] = useState("");
  const [expanded, setExpanded] = useState(!!startExpanded);
  const [auditOpen, setAuditOpen] = useState(false);
  const [brandOpen, setBrandOpen] = useState(false);
  const [auditCompleted, setAuditCompleted] = useState(false);
  const [radarKey, setRadarKey] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data: profile } = await (supabase.from("diagnostic_profiles" as any) as any)
        .select("*").eq("user_id", user.id).maybeSingle();
      if (profile) {
        setFirstName(profile.first_name || "");
        setAvatarUrl(profile.avatar_url || null);
        setFirm(profile.firm || "");
        setLevel(profile.level || "");
        setCorePractice(profile.core_practice || "");
        const sf = profile.sector_focus || "";
        if (sf && !SECTOR_OPTIONS.includes(sf)) {
          setSectorFocus("Other");
          setSectorOther(sf);
        } else {
          setSectorFocus(sf);
        }
        setNorthStar(profile.north_star_goal || "");
        setBrandPillars(profile.brand_pillars || []);
        setSkills(profile.generated_skills || []);
        setRatings(profile.skill_ratings || {});
        setAuditCompleted(!!profile.audit_completed_at);
        setHasSavedBefore(!!(profile.first_name && profile.firm && profile.level && profile.sector_focus));
      }
      setLoading(false);
    };
    load();
  }, [radarKey]);

  const handleSave = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const resolvedSector = sectorFocus === "Other" ? sectorOther.trim() : sectorFocus;
    const mandatoryComplete = !!(
      firstName?.trim() && firm?.trim() && level?.trim() && resolvedSector
    );
    const wasFirstSave = !hasSavedBefore;
    const { error } = await (supabase.from("diagnostic_profiles" as any) as any)
      .upsert({
        user_id: user.id,
        first_name: firstName,
        avatar_url: avatarUrl,
        firm,
        level,
        core_practice: corePractice,
        sector_focus: resolvedSector,
        north_star_goal: northStar,
        brand_pillars: brandPillars,
        generated_skills: skills,
        skill_ratings: ratings,
        ...(mandatoryComplete ? { onboarding_completed: true, completed: true } : {}),
      }, { onConflict: "user_id" });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Profile saved." });
      if (mandatoryComplete) {
        try { localStorage.setItem("aura_onboarding_complete", "true"); } catch {}
        setHasSavedBefore(true);
      }
      try { window.dispatchEvent(new CustomEvent("aura:journey-refresh")); } catch {}
    }
    setSaving(false);
  };

  const handleAvatarUpload = async (file: File) => {
    if (!file || !userId) return;
    setUploadingAvatar(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${userId}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, {
        cacheControl: "3600",
        upsert: true,
      });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = data.publicUrl;
      setAvatarUrl(url);
      await (supabase.from("diagnostic_profiles" as any) as any)
        .update({ avatar_url: url }).eq("user_id", userId);
      toast({ title: "Avatar updated" });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const addSkill = () => {
    if (!newSkillName.trim() || skills.find(s => s.name === newSkillName)) return;
    setSkills(prev => [...prev, { name: newSkillName }]);
    setRatings(prev => ({ ...prev, [newSkillName]: 50 }));
    setNewSkillName("");
  };

  const removeSkill = (name: string) => {
    setSkills(prev => prev.filter(s => s.name !== name));
    setRatings(prev => { const next = { ...prev }; delete next[name]; return next; });
  };

  const addPillar = () => {
    if (!newPillar.trim() || brandPillars.length >= 5) return;
    setBrandPillars(prev => [...prev, newPillar]);
    setNewPillar("");
  };

  const removePillar = (idx: number) => setBrandPillars(prev => prev.filter((_, i) => i !== idx));

  if (loading) return <div className="glass-card rounded-2xl p-8 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;

  return (
    <>
    <div className="glass-card rounded-2xl p-6 sm:p-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
            <UserCog className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Profile & Skills</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Your declared starting point — Aura refines this as evidence accumulates</p>
          </div>
        </div>
        <button onClick={() => setExpanded(!expanded)} className="text-xs text-muted-foreground hover:text-primary transition-colors">
          {expanded ? "Collapse" : "Edit Profile"}
        </button>
      </div>

      {!expanded ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {[{ label: "Firm", value: firm }, { label: "Level", value: level }, { label: "Practice", value: corePractice }, { label: "Sector", value: sectorFocus }].map(item => (
              <div key={item.label} className="p-3 rounded-xl bg-secondary/30">
                <span className="text-[10px] text-muted-foreground tracking-wider uppercase">{item.label}</span>
                <p className="text-sm text-foreground mt-0.5 truncate">{item.value || "—"}</p>
              </div>
            ))}
          </div>
          {northStar && (
            <div className="p-3 rounded-xl bg-secondary/30">
              <span className="text-[10px] text-muted-foreground tracking-wider uppercase">My 3-year ambition</span>
              <p className="text-sm text-foreground mt-0.5">{northStar}</p>
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {brandPillars.map((p, i) => (
              <span key={i} className="text-[10px] px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">{p}</span>
            ))}
          </div>

        </div>
      ) : (
        <div className="space-y-5">
          {/* Avatar + first name */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <div
                className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center"
                style={{ background: "var(--brand-surface, #f3ecd9)", color: "var(--brand)", fontWeight: 600 }}
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <span>{(firstName || "?").charAt(0).toUpperCase()}</span>
                )}
              </div>
              <label
                className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center cursor-pointer"
                style={{ background: "var(--brand)", color: "#fff" }}
                title="Change avatar"
              >
                {uploadingAvatar ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleAvatarUpload(f);
                  }}
                />
              </label>
            </div>
            <div className="flex-1">
              <label className="text-[10px] text-muted-foreground tracking-wider uppercase mb-1 block">First name</label>
              <Input placeholder="e.g., Mohammad" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="h-9 bg-secondary border-border/30 text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Firm", value: firm, set: setFirm, placeholder: "e.g., Deloitte, Saudi Aramco, your organization" },
              { label: "Level / Title", value: level, set: setLevel, placeholder: "e.g., VP of Strategy, CIO, your current role" },
              { label: "Core Practice", value: corePractice, set: setCorePractice, placeholder: "e.g., Strategy, Technology, Finance — the area you work in" },
            ].map(item => (
              <div key={item.label}>
                <label className="text-[10px] text-muted-foreground tracking-wider uppercase mb-1 block">{item.label}</label>
                <Input placeholder={item.placeholder} value={item.value} onChange={(e) => item.set(e.target.value)} className="h-9 bg-secondary border-border/30 text-sm" />
              </div>
            ))}
            <div>
              <label className="text-[10px] text-muted-foreground tracking-wider uppercase mb-1 block">Sector Focus</label>
              <Select value={sectorFocus || undefined} onValueChange={setSectorFocus}>
                <SelectTrigger className="h-9 bg-secondary border-border/30 text-sm">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {SECTOR_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {sectorFocus === "Other" && (
                <Input
                  placeholder="Type your sector"
                  value={sectorOther}
                  onChange={(e) => setSectorOther(e.target.value)}
                  className="h-9 bg-secondary border-border/30 text-sm mt-2"
                />
              )}
            </div>
          </div>

          <div>
            <label className="text-[10px] text-muted-foreground tracking-wider uppercase mb-1 block">My 3-year ambition</label>
            <Input
              placeholder="What do you want to be known for in 3 years?"
              value={northStar}
              onChange={(e) => setNorthStar(e.target.value)}
              className="h-9 bg-secondary border-border/30 text-sm"
            />
            <p className="text-[11px] text-muted-foreground/80 mt-1.5 leading-relaxed">
              Where do you want your career to be? Be specific — Aura uses this to shape your content.
            </p>
          </div>

          <div>
            <label className="text-[10px] text-muted-foreground tracking-wider uppercase mb-2 block">Brand Pillars</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {brandPillars.map((p, i) => (
                <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center gap-1.5">
                  {p}
                  <button onClick={() => removePillar(i)} className="hover:text-destructive"><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input placeholder="The 2–3 topics you want to own — e.g., Digital Government, AI in Banking" value={newPillar} onChange={(e) => setNewPillar(e.target.value)} className="h-8 bg-secondary border-border/30 text-sm flex-1" onKeyDown={(e) => e.key === "Enter" && addPillar()} />
              <Button size="sm" variant="outline" onClick={addPillar} className="h-8"><Plus className="w-3.5 h-3.5" /></Button>
            </div>
          </div>

          <div>
            <label className="text-[10px] text-muted-foreground tracking-wider uppercase mb-2 block">Skills & Self-Assessment</label>
            <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
              {skills.map((skill) => {
                const isObjective = EVIDENCE_MATRIX.some(e => e.name === skill.name);
                return (
                  <div key={skill.name} className="p-3 rounded-xl bg-secondary/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm text-foreground">{skill.name}</span>
                        {isObjective && <span title="Verified via Objective Diagnostic"><ShieldCheck className="w-3.5 h-3.5 text-primary" /></span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-primary font-medium">{ratings[skill.name] || 0}%</span>
                        <button onClick={() => removeSkill(skill.name)} className="text-muted-foreground hover:text-destructive"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                    <Slider value={[ratings[skill.name] || 0]} onValueChange={([v]) => setRatings(prev => ({ ...prev, [skill.name]: v }))} max={100} step={1} className="w-full" />
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2 mt-3">
              <Input placeholder="Add skill…" value={newSkillName} onChange={(e) => setNewSkillName(e.target.value)} className="h-8 bg-secondary border-border/30 text-sm flex-1" onKeyDown={(e) => e.key === "Enter" && addSkill()} />
              <Button size="sm" variant="outline" onClick={addSkill} className="h-8"><Plus className="w-3.5 h-3.5" /></Button>
            </div>
          </div>

          {(() => {
            const resolvedSector = sectorFocus === "Other" ? sectorOther.trim() : sectorFocus;
            const canSave = !!(firstName?.trim() && firm?.trim() && level?.trim() && resolvedSector);
            return (
              <div>
                <Button
                  onClick={handleSave}
                  disabled={saving || !canSave}
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                  Save my profile
                </Button>
                {!canSave && (
                  <p className="text-[11px] text-muted-foreground/70 mt-2 text-center">
                    Fill in the required fields to continue.
                  </p>
                )}
              </div>
            );
          })()}

          {onResetDiagnostic && hasSavedBefore && (
            <Button
              variant="outline"
              onClick={async () => {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;
                await (supabase.from("diagnostic_profiles" as any) as any)
                  .update({ completed: false, skill_ratings: {}, generated_skills: [] })
                  .eq("user_id", user.id);
                onResetDiagnostic();
              }}
              className="w-full border-destructive/30 text-destructive hover:bg-destructive/10"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Reset assessment
            </Button>
          )}
        </div>
      )}

    </div>
    </>
  );
};

export default ProfileManagement;
