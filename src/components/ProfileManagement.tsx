import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { UserCog, Save, Plus, X, Loader2, RotateCcw, ShieldCheck, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { EVIDENCE_MATRIX } from "@/components/diagnostic/EvidenceMatrix";

interface Skill {
  name: string;
  description?: string;
}

interface ProfileManagementProps {
  onResetDiagnostic?: () => void;
}

const ProfileManagement = ({ onResetDiagnostic }: ProfileManagementProps) => {
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
  const { toast } = useToast();

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await (supabase.from("diagnostic_profiles" as any) as any)
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profile) {
        setFirm(profile.firm || "");
        setLevel(profile.level || "");
        setCorePractice(profile.core_practice || "");
        setSectorFocus(profile.sector_focus || "");
        setNorthStar(profile.north_star_goal || "");
        setBrandPillars(profile.brand_pillars || []);
        const gs = profile.generated_skills || [];
        setSkills(gs);
        setRatings(profile.skill_ratings || {});
      }
      setLoading(false);
    };
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    await (supabase.from("diagnostic_profiles" as any) as any)
      .update({
        firm,
        level,
        core_practice: corePractice,
        sector_focus: sectorFocus,
        north_star_goal: northStar,
        brand_pillars: brandPillars,
        generated_skills: skills,
        skill_ratings: ratings,
      })
      .eq("user_id", user.id);

    toast({ title: "Profile Updated", description: "Your executive profile has been saved." });
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
    setRatings(prev => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const addPillar = () => {
    if (!newPillar.trim() || brandPillars.length >= 5) return;
    setBrandPillars(prev => [...prev, newPillar]);
    setNewPillar("");
  };

  const removePillar = (idx: number) => {
    setBrandPillars(prev => prev.filter((_, i) => i !== idx));
  };

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
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          {expanded ? "Collapse" : "Edit Profile"}
        </button>
      </div>

      {!expanded ? (
        /* Compact view */
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Firm", value: firm },
              { label: "Level", value: level },
              { label: "Practice", value: corePractice },
              { label: "Sector", value: sectorFocus },
            ].map(item => (
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
              <span key={i} className="text-[10px] px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                {p}
              </span>
            ))}
          </div>
        </div>
      ) : (
        /* Expanded edit view */
        <div className="space-y-5">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Firm", value: firm, set: setFirm },
              { label: "Level", value: level, set: setLevel },
              { label: "Core Practice", value: corePractice, set: setCorePractice },
              { label: "Sector Focus", value: sectorFocus, set: setSectorFocus },
            ].map(item => (
              <div key={item.label}>
                <label className="text-[10px] text-muted-foreground tracking-wider uppercase mb-1 block">{item.label}</label>
                <Input
                  value={item.value}
                  onChange={(e) => item.set(e.target.value)}
                  className="h-9 bg-secondary border-border/30 text-sm"
                />
              </div>
            ))}
          </div>

          {/* North Star */}
          <div>
            <label className="text-[10px] text-muted-foreground tracking-wider uppercase mb-1 block">24-Month North Star</label>
            <Input
              value={northStar}
              onChange={(e) => setNorthStar(e.target.value)}
              className="h-9 bg-secondary border-border/30 text-sm"
            />
          </div>

          {/* Brand Pillars */}
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
              <Input
                placeholder="Add pillar…"
                value={newPillar}
                onChange={(e) => setNewPillar(e.target.value)}
                className="h-8 bg-secondary border-border/30 text-sm flex-1"
                onKeyDown={(e) => e.key === "Enter" && addPillar()}
              />
              <Button size="sm" variant="outline" onClick={addPillar} className="h-8"><Plus className="w-3.5 h-3.5" /></Button>
            </div>
          </div>

          {/* Skills with Ratings */}
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
                      {isObjective && (
                        <span title="Verified via Objective Diagnostic"><ShieldCheck className="w-3.5 h-3.5 text-primary" /></span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-primary font-medium">{ratings[skill.name] || 0}%</span>
                      <button onClick={() => removeSkill(skill.name)} className="text-muted-foreground hover:text-destructive">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <Slider
                    value={[ratings[skill.name] || 0]}
                    onValueChange={([v]) => setRatings(prev => ({ ...prev, [skill.name]: v }))}
                    max={100}
                    step={1}
                    className="w-full"
                  />
                </div>
                );
              })}
            </div>
            <div className="flex gap-2 mt-3">
              <Input
                placeholder="Add skill…"
                value={newSkillName}
                onChange={(e) => setNewSkillName(e.target.value)}
                className="h-8 bg-secondary border-border/30 text-sm flex-1"
                onKeyDown={(e) => e.key === "Enter" && addSkill()}
              />
              <Button size="sm" variant="outline" onClick={addSkill} className="h-8"><Plus className="w-3.5 h-3.5" /></Button>
            </div>
          </div>

          {/* Save */}
          <Button onClick={handleSave} disabled={saving} className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Save Profile
          </Button>
        </div>
      )}
    </div>
  );
};

export default ProfileManagement;
