import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { UserCog, Save, Plus, X, Loader2, ShieldCheck, RefreshCw, ClipboardCheck, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
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
}

const ProfileManagement = ({ onResetDiagnostic, onNavigate }: ProfileManagementProps) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [firm, setFirm] = useState("");
  const [level, setLevel] = useState("");
  const [corePractice, setCorePractice] = useState("");
  const [sectorFocus, setSectorFocus] = useState("");
  const [northStar, setNorthStar] = useState("");
  const [brandPillars, setBrandPillars] = useState<string[]>([]);
  const [newPillar, setNewPillar] = useState("");
  const [skills, setSkills] = useState<Skill[]>([]);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [newSkillName, setNewSkillName] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [brandOpen, setBrandOpen] = useState(false);
  const [auditCompleted, setAuditCompleted] = useState(false);
  const [radarKey, setRadarKey] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await (supabase.from("diagnostic_profiles" as any) as any)
        .select("*").eq("user_id", user.id).maybeSingle();
      if (profile) {
        setFirm(profile.firm || "");
        setLevel(profile.level || "");
        setCorePractice(profile.core_practice || "");
        setSectorFocus(profile.sector_focus || "");
        setNorthStar(profile.north_star_goal || "");
        setBrandPillars(profile.brand_pillars || []);
        setSkills(profile.generated_skills || []);
        setRatings(profile.skill_ratings || {});
        setAuditCompleted(!!profile.audit_completed_at);
      }
      setLoading(false);
    };
    load();
  }, [radarKey]);

  const handleSave = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const { error } = await (supabase.from("diagnostic_profiles" as any) as any)
      .upsert({
        user_id: user.id,
        firm,
        level,
        core_practice: corePractice,
        sector_focus: sectorFocus,
        north_star_goal: northStar,
        brand_pillars: brandPillars,
        generated_skills: skills,
        skill_ratings: ratings,
      }, { onConflict: "user_id" });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Profile Updated", description: "Your executive profile has been saved." });
    }
    setSaving(false);
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
    <div className="glass-card rounded-2xl p-6 sm:p-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
            <UserCog className="w-4 h-4 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Profile & Skills</h3>
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
              <span className="text-[10px] text-muted-foreground tracking-wider uppercase">North Star</span>
              <p className="text-sm text-foreground mt-0.5">{northStar}</p>
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {brandPillars.map((p, i) => (
              <span key={i} className="text-[10px] px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">{p}</span>
            ))}
          </div>

          {/* Start Objective Audit button */}
          <Button
            variant="outline"
            onClick={() => setAuditOpen(true)}
            className="w-full mt-2 border-primary/30 text-primary hover:bg-primary/10 gap-2"
          >
            <ClipboardCheck className="w-4 h-4" />
            Start Objective Audit
          </Button>

          {/* Brand Assessment button */}
          <div className="relative group">
            <Button
              variant="outline"
              onClick={() => auditCompleted && setBrandOpen(true)}
              disabled={!auditCompleted}
              className={`w-full gap-2 ${auditCompleted ? "border-primary/30 text-primary hover:bg-primary/10" : "border-[#252525] text-[#3a3a3a] cursor-not-allowed"}`}
            >
              <Compass className="w-4 h-4" />
              Start Brand Assessment
            </Button>
            {!auditCompleted && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-[#1a1a1a] border border-[#252525] rounded-lg text-[10px] text-[#888] w-64 text-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                Complete your Evidence Audit first — your brand positioning is more accurate when grounded in evidence.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            {[{ label: "Firm", value: firm, set: setFirm }, { label: "Level", value: level, set: setLevel }, { label: "Core Practice", value: corePractice, set: setCorePractice }, { label: "Sector Focus", value: sectorFocus, set: setSectorFocus }].map(item => (
              <div key={item.label}>
                <label className="text-[10px] text-muted-foreground tracking-wider uppercase mb-1 block">{item.label}</label>
                <Input value={item.value} onChange={(e) => item.set(e.target.value)} className="h-9 bg-secondary border-border/30 text-sm" />
              </div>
            ))}
          </div>

          <div>
            <label className="text-[10px] text-muted-foreground tracking-wider uppercase mb-1 block">24-Month North Star</label>
            <Input value={northStar} onChange={(e) => setNorthStar(e.target.value)} className="h-9 bg-secondary border-border/30 text-sm" />
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
              <Input placeholder="Add pillar…" value={newPillar} onChange={(e) => setNewPillar(e.target.value)} className="h-8 bg-secondary border-border/30 text-sm flex-1" onKeyDown={(e) => e.key === "Enter" && addPillar()} />
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

          <Button onClick={handleSave} disabled={saving} className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Save Profile
          </Button>

          {/* Start Objective Audit */}
          <Button variant="outline" onClick={() => setAuditOpen(true)} className="w-full border-primary/30 text-primary hover:bg-primary/10 gap-2">
            <ClipboardCheck className="w-4 h-4" />
            Start Objective Audit
          </Button>

          {/* Brand Assessment button */}
          <div className="relative group">
            <Button
              variant="outline"
              onClick={() => auditCompleted && setBrandOpen(true)}
              disabled={!auditCompleted}
              className={`w-full gap-2 ${auditCompleted ? "border-primary/30 text-primary hover:bg-primary/10" : "border-[#252525] text-[#3a3a3a] cursor-not-allowed"}`}
            >
              <Compass className="w-4 h-4" />
              Start Brand Assessment
            </Button>
            {!auditCompleted && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-[#1a1a1a] border border-[#252525] rounded-lg text-[10px] text-[#888] w-64 text-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                Complete your Evidence Audit first — your brand positioning is more accurate when grounded in evidence.
              </div>
            )}
          </div>

          {onResetDiagnostic && (
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
              Reset Assessment & Re-Diagnose
            </Button>
          )}
        </div>
      )}

      <ObjectiveAuditModal open={auditOpen} onOpenChange={setAuditOpen} onComplete={() => setRadarKey(k => k + 1)} onNavigate={onNavigate} />
    </div>
  );
};

export default ProfileManagement;
