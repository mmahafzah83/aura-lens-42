import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { ChevronLeft, ChevronRight, Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { EVIDENCE_MATRIX, calculateScore, calculateTotalScore } from "@/components/diagnostic/EvidenceMatrix";
import AuditResultsView from "@/components/AuditResultsView";

interface ObjectiveAuditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
  onNavigate?: (tab: string) => void;
}

const ObjectiveAuditModal = ({ open, onOpenChange, onComplete, onNavigate }: ObjectiveAuditModalProps) => {
  const [currentSkillIdx, setCurrentSkillIdx] = useState(0);
  const [checks, setChecks] = useState<Record<string, boolean[]>>(
    Object.fromEntries(EVIDENCE_MATRIX.map((s) => [s.name, [false, false, false]]))
  );
  const [saving, setSaving] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [finalScores, setFinalScores] = useState<Record<string, number>>({});
  const { toast } = useToast();

  const skill = EVIDENCE_MATRIX[currentSkillIdx];
  const progress = ((currentSkillIdx + 1) / EVIDENCE_MATRIX.length) * 100;

  // Cascade logic: toggling a tier auto-checks/unchecks dependent tiers
  const toggle = (qIdx: number) => {
    setChecks((prev) => {
      const current = [...prev[skill.name]];
      const newVal = !current[qIdx];

      if (newVal) {
        // Checking a tier → auto-check all lower tiers
        // qIdx 0 = Base, 1 = Intermediate, 2 = Advanced
        for (let i = 0; i <= qIdx; i++) {
          current[i] = true;
        }
      } else {
        // Unchecking a tier → auto-uncheck all higher tiers
        for (let i = qIdx; i < current.length; i++) {
          current[i] = false;
        }
      }

      return { ...prev, [skill.name]: current };
    });
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

      setFinalScores(newRatings);
      setShowResults(true);
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

  if (!open) return null;

  return (
    <>
      {/* Full-screen overlay */}
      <div
        className="fixed inset-0 z-[1000]"
        style={{ background: "rgba(0,0,0,0.8)" }}
        onClick={() => onOpenChange(false)}
      />

      {/* Centered modal */}
      <div
        className="fixed z-[1001]"
        style={{
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 560,
          maxWidth: "92vw",
          height: "88vh",
          display: "flex",
          flexDirection: "column",
          background: "#0d0d0d",
          borderRadius: 16,
          border: "1px solid #252525",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — fixed */}
        <div className="shrink-0 px-5 pt-5 pb-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#C5A55A]" />
              <span className="text-[15px] font-semibold text-[#f0f0f0]">
                {showResults ? "Audit Results" : "Objective Evidence Audit"}
              </span>
            </div>
            <button onClick={() => onOpenChange(false)} className="text-[#666] hover:text-[#999] text-lg leading-none">&times;</button>
          </div>
          {!showResults && (
            <>
              <Progress value={progress} className="h-1.5 mb-2" />
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-[#888]">
                  Skill {currentSkillIdx + 1} of {EVIDENCE_MATRIX.length} · <span className="text-[#C5A55A] font-semibold">Running score: {calculateTotalScore(checks)}%</span>
                </p>
                <p className="text-[10px] text-[#666]">Answer honestly. Only verified evidence counts.</p>
              </div>
            </>
          )}
        </div>

        {/* Content — scrollable */}
        <div className="flex-1 overflow-y-auto px-5 pb-4">
          {showResults ? (
            <AuditResultsView
              scores={finalScores}
              onNavigate={onNavigate}
              onClose={() => onOpenChange(false)}
            />
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-[#f0f0f0]">{skill.name}</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#1a1a1a] text-[#888]">
                  {skill.tier} Tier · {skill.category}
                </span>
              </div>

              {skill.questions.map((q, qIdx) => {
                return (
                  <div
                    key={qIdx}
                    className={`p-4 rounded-xl border space-y-2 cursor-pointer transition-all duration-300 ${
                      checks[skill.name][qIdx] ? "bg-[#C5A55A]/5 border-[#C5A55A]/20" : "bg-[#141414] border-[#1a1a1a]"
                    }`}
                    onClick={() => toggle(qIdx)}
                  >
                    <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${levelColor(q.level)}`}>
                      {q.level}
                    </span>
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={checks[skill.name][qIdx]}
                        onCheckedChange={() => toggle(qIdx)}
                        className="mt-0.5 transition-all duration-300"
                      />
                      <p className="text-sm text-[#ccc] leading-relaxed">{q.question}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer — sticky */}
        {!showResults && (
          <div
            className="shrink-0"
            style={{
              background: "#0d0d0d",
              borderTop: "0.5px solid #1a1a1a",
              padding: "12px 16px",
            }}
          >
            <div className="text-center mb-3">
              <span className="text-2xl font-bold text-[#C5A55A]">{calculateScore(checks[skill.name])}%</span>
              <p className="text-[10px] text-[#666]">Calculated Score</p>
            </div>
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                onClick={() => setCurrentSkillIdx((i) => Math.max(0, i - 1))}
                disabled={currentSkillIdx === 0}
                className="gap-1 border-[#252525] text-[#888] hover:text-[#f0f0f0]"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </Button>

              {currentSkillIdx < EVIDENCE_MATRIX.length - 1 ? (
                <Button
                  onClick={() => setCurrentSkillIdx((i) => i + 1)}
                  className="gap-1 bg-[#C5A55A] text-[#0d0d0d] hover:brightness-110"
                >
                  Next <ChevronRight className="w-4 h-4" />
                </Button>
              ) : (
                <Button
                  onClick={handleSubmit}
                  disabled={saving}
                  className="gap-1 bg-[#C5A55A] text-[#0d0d0d] hover:brightness-110"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  Submit Audit
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default ObjectiveAuditModal;
