import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { ChevronLeft, ChevronRight, Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { EVIDENCE_MATRIX, calculateScore, calculateTotalScore } from "@/components/diagnostic/EvidenceMatrix";

interface ObjectiveAuditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

const ObjectiveAuditModal = ({ open, onOpenChange, onComplete }: ObjectiveAuditModalProps) => {
  const [currentSkillIdx, setCurrentSkillIdx] = useState(0);
  const [checks, setChecks] = useState<Record<string, boolean[]>>(
    Object.fromEntries(EVIDENCE_MATRIX.map((s) => [s.name, [false, false, false]]))
  );
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const skill = EVIDENCE_MATRIX[currentSkillIdx];
  const progress = ((currentSkillIdx + 1) / EVIDENCE_MATRIX.length) * 100;

  const toggle = (qIdx: number) => {
    setChecks((prev) => ({
      ...prev,
      [skill.name]: prev[skill.name].map((v, i) => (i === qIdx ? !v : v)),
    }));
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const newRatings: Record<string, number> = {};
      EVIDENCE_MATRIX.forEach((s) => {
        newRatings[s.name] = calculateScore(checks[s.name]);
      });

      const skills = EVIDENCE_MATRIX.map((s) => ({ name: s.name, description: `${s.category} — ${s.tier} Tier` }));

      await (supabase.from("diagnostic_profiles" as any) as any)
        .update({
          skill_ratings: newRatings,
          generated_skills: skills,
          completed: true,
        })
        .eq("user_id", user.id);

      // Update skill_targets
      await (supabase.from("skill_targets" as any) as any).delete().eq("user_id", user.id);
      const top5 = Object.entries(newRatings).sort(([, a], [, b]) => b - a).slice(0, 5);
      for (const [pillar] of top5) {
        await (supabase.from("skill_targets" as any) as any).insert({
          user_id: user.id,
          pillar,
          target_hours: 100,
        });
      }

      toast({ title: "Objective Audit Complete", description: "Your Skill Radar has been verified." });
      onOpenChange(false);
      onComplete?.();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const levelColor = (level: string) =>
    level === "Base" ? "bg-emerald-500/20 text-emerald-400" :
    level === "Intermediate" ? "bg-amber-500/20 text-amber-400" :
    "bg-rose-500/20 text-rose-400";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card border-border/30 sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg text-foreground flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            Objective Evidence Audit
          </DialogTitle>
        </DialogHeader>

        <Progress value={progress} className="h-1.5 mb-2" />
        <div className="flex items-center justify-between mb-4">
          <p className="text-[10px] text-muted-foreground">
            Skill {currentSkillIdx + 1} of {EVIDENCE_MATRIX.length} · <span className="text-primary font-semibold">Running score: {calculateTotalScore(checks)}%</span>
          </p>
          <p className="text-[10px] text-muted-foreground">Answer honestly. Only verified evidence counts.</p>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-foreground">{skill.name}</h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted/20 text-muted-foreground">
              {skill.tier} Tier · {skill.category}
            </span>
          </div>

          {skill.questions.map((q, qIdx) => (
            <div
              key={qIdx}
              className="p-4 rounded-xl bg-secondary/30 border border-border/10 space-y-2 cursor-pointer"
              onClick={() => toggle(qIdx)}
            >
              <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${levelColor(q.level)}`}>
                {q.level}
              </span>
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={checks[skill.name][qIdx]}
                  onCheckedChange={() => toggle(qIdx)}
                  className="mt-0.5"
                />
                <p className="text-sm text-foreground/80 leading-relaxed">{q.question}</p>
              </div>
            </div>
          ))}

          <div className="text-center">
            <span className="text-2xl font-bold text-primary">{calculateScore(checks[skill.name])}%</span>
            <p className="text-[10px] text-muted-foreground">Calculated Score</p>
          </div>
        </div>

        <div className="flex items-center justify-between mt-4">
          <Button
            variant="outline"
            onClick={() => setCurrentSkillIdx((i) => Math.max(0, i - 1))}
            disabled={currentSkillIdx === 0}
            className="gap-1"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </Button>

          {currentSkillIdx < EVIDENCE_MATRIX.length - 1 ? (
            <Button
              onClick={() => setCurrentSkillIdx((i) => i + 1)}
              className="gap-1 bg-primary text-primary-foreground"
            >
              Next <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={saving}
              className="gap-1 bg-primary text-primary-foreground"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              Submit Audit
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ObjectiveAuditModal;
