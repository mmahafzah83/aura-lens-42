import { useEffect, useState } from "react";
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Settings2, Loader2, Target, TrendingUp, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { EVIDENCE_MATRIX } from "@/components/diagnostic/EvidenceMatrix";

// Partner Gold Standard benchmarks
const PARTNER_BENCHMARK: Record<string, number> = {
  "Strategic Architecture": 95,
  "C-Suite Stewardship": 100,
  "Sector Foresight": 90,
  "Digital Synthesis": 85,
  "Executive Presence": 100,
  "Commercial Velocity": 95,
  "Human-Centric Leadership": 90,
  "Operational Resilience": 80,
  "Geopolitical Fluency": 90,
  "Value-Based P&L": 95,
};

// Short labels for radar axis
const SHORT_LABELS: Record<string, string> = {
  "Strategic Architecture": "Architecture",
  "C-Suite Stewardship": "Stewardship",
  "Sector Foresight": "Foresight",
  "Digital Synthesis": "Digital",
  "Executive Presence": "Presence",
  "Commercial Velocity": "Commercial",
  "Human-Centric Leadership": "Leadership",
  "Operational Resilience": "Resilience",
  "Geopolitical Fluency": "Geopolitics",
  "Value-Based P&L": "P&L",
};

const EXPERIENCE_BONUS_SKILLS = ["Sector Foresight", "Geopolitical Fluency"];

const FALLBACK_PILLARS = ["C-Suite Advisory", "Strategic Architecture", "Industry Foresight", "Transformation Stewardship", "Digital Fluency"];

interface RadarDataPoint {
  skill: string;
  fullName: string;
  current: number;
  benchmark: number;
}

const SkillRadar = () => {
  const [data, setData] = useState<RadarDataPoint[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [targets, setTargets] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [gapSkills, setGapSkills] = useState<{ name: string; delta: number }[]>([]);
  const [hasExperienceBonus, setHasExperienceBonus] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const load = async () => {
      const [{ data: intelligence }, { data: profile }, { data: targetRows }] = await Promise.all([
        supabase.from("learned_intelligence" as any).select("skill_pillars, skill_boost_pct") as any,
        supabase.from("diagnostic_profiles" as any).select("generated_skills, skill_ratings, years_experience").maybeSingle() as any,
        supabase.from("skill_targets" as any).select("pillar, target_hours") as any,
      ]);

      const diagSkills = profile?.data?.generated_skills || profile?.generated_skills;
      const diagRatings = profile?.data?.skill_ratings || profile?.skill_ratings;
      const yearsExp = profile?.data?.years_experience || profile?.years_experience || "";

      // Check experience bonus
      const totalMatch = yearsExp.match?.(/^(\d+)y total/);
      const totalYears = totalMatch ? parseInt(totalMatch[1]) : 0;
      const expBonus = totalYears > 15;
      setHasExperienceBonus(expBonus);

      const activePillars: string[] = diagSkills && diagSkills.length > 0
        ? diagSkills.map((s: any) => s.name)
        : FALLBACK_PILLARS;

      // Intelligence boosts
      const boosts: Record<string, number> = {};
      activePillars.forEach((p) => { boosts[p] = 0; });
      (intelligence || []).forEach((i: any) => {
        (i.skill_pillars || []).forEach((pillar: string) => {
          if (boosts[pillar] !== undefined) boosts[pillar] += Number(i.skill_boost_pct || 3);
        });
      });

      // Targets
      const tgts: Record<string, number> = {};
      activePillars.forEach((p) => { tgts[p] = 100; });
      (targetRows || []).forEach((t: any) => {
        if (tgts[t.pillar] !== undefined) tgts[t.pillar] = Number(t.target_hours) || 100;
      });
      setTargets(tgts);

      // Build data
      const radarData: RadarDataPoint[] = activePillars.map((p: string) => {
        let baseScore = diagRatings?.[p] ?? 50;
        baseScore = Math.min(100, baseScore + (boosts[p] || 0));

        // Experience bonus
        if (expBonus && EXPERIENCE_BONUS_SKILLS.includes(p)) {
          baseScore = Math.min(100, baseScore + 10);
        }

        return {
          skill: SHORT_LABELS[p] || (p.length > 12 ? p.slice(0, 10) + "…" : p),
          fullName: p,
          current: baseScore,
          benchmark: PARTNER_BENCHMARK[p] || 90,
        };
      });

      setData(radarData);

      // Calculate top 2 gaps
      const gaps = radarData
        .map((d) => ({ name: d.fullName, delta: (PARTNER_BENCHMARK[d.fullName] || 90) - d.current }))
        .filter((g) => g.delta > 0)
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 2);
      setGapSkills(gaps);
    };

    load();
  }, [saving]);

  const handleSaveTargets = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    for (const pillar of Object.keys(targets)) {
      const hours = targets[pillar] || 100;
      await (supabase.from("skill_targets" as any) as any).delete().eq("user_id", user.id).eq("pillar", pillar);
      await (supabase.from("skill_targets" as any) as any).insert({ user_id: user.id, pillar, target_hours: hours });
    }

    toast({ title: "Targets Saved", description: "12-month goals updated." });
    setSaving(false);
    setEditOpen(false);
  };

  const selectedSkillData = selectedSkill
    ? EVIDENCE_MATRIX.find((s) => s.name === selectedSkill)
    : null;

  const selectedScore = selectedSkill
    ? data.find((d) => d.fullName === selectedSkill)?.current ?? 0
    : 0;

  const selectedBenchmark = selectedSkill
    ? PARTNER_BENCHMARK[selectedSkill] || 90
    : 0;

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-lg font-semibold text-foreground">Skill Radar</h3>
        <button onClick={() => setEditOpen(true)} className="text-muted-foreground hover:text-primary transition-colors">
          <Settings2 className="w-4 h-4" />
        </button>
      </div>
      <p className="text-xs text-muted-foreground mb-2 tracking-wide uppercase">vs. Partner Gold Standard</p>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-2">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-1 rounded-full" style={{ background: "hsl(43 72% 52%)" }} />
          <span className="text-[10px] text-muted-foreground">You</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-1 rounded-full bg-muted-foreground/40" />
          <span className="text-[10px] text-muted-foreground">Partner Target</span>
        </div>
        {hasExperienceBonus && (
          <div className="flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-emerald-400" />
            <span className="text-[10px] text-emerald-400">+10% Exp Bonus</span>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-[220px] sm:min-h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} cx="50%" cy="50%" outerRadius="68%">
            <PolarGrid stroke="hsl(0 0% 20%)" strokeDasharray="3 3" />
            <PolarAngleAxis
              dataKey="skill"
              tick={{ fill: "hsl(43 72% 52%)", fontSize: 10, fontWeight: 600 }}
              onClick={(e: any) => {
                const label = e?.value;
                const match = data.find((d) => d.skill === label);
                if (match) setSelectedSkill(match.fullName);
              }}
              style={{ cursor: "pointer" }}
            />
            <Tooltip
              contentStyle={{
                background: "hsl(0 0% 7%)",
                border: "0.5px solid hsl(43 72% 52% / 0.15)",
                borderRadius: "12px",
                boxShadow: "0 8px 32px hsl(0 0% 0% / 0.4)",
                padding: "8px 14px",
                fontSize: "12px",
                color: "hsl(40 10% 92%)",
              }}
              formatter={(value: number, name: string) => {
                const label = name === "current" ? "Your Score" : "Partner Target";
                return [`${value}%`, label];
              }}
            />
            {/* Benchmark (grey, semi-transparent) */}
            <Radar
              name="benchmark"
              dataKey="benchmark"
              stroke="hsl(0 0% 50%)"
              fill="hsl(0 0% 50%)"
              fillOpacity={0.08}
              strokeWidth={1.5}
              strokeDasharray="6 3"
            />
            {/* User (gold) */}
            <Radar
              name="current"
              dataKey="current"
              stroke="hsl(43 72% 52%)"
              fill="hsl(43 72% 52%)"
              strokeWidth={3}
              dot={{ r: 5, fill: "hsl(43 72% 52%)", stroke: "hsl(43 72% 62%)", strokeWidth: 2, cursor: "pointer" }}
              fillOpacity={0.2}
              activeDot={{
                r: 6,
                fill: "hsl(43 72% 52%)",
                stroke: "hsl(43 72% 62%)",
                strokeWidth: 2,
                onClick: (_: any, payload: any) => {
                  const match = data.find((d) => d.skill === payload?.payload?.skill);
                  if (match) setSelectedSkill(match.fullName);
                },
              }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Tap hint */}
      <p className="text-[10px] text-center text-muted-foreground/40 mt-1 mb-2">Tap a skill label to inspect evidence</p>

      {/* Gap Analysis Card */}
      {gapSkills.length > 0 && (
        <div className="mt-2 p-4 rounded-xl glass-card border border-border/10">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-4 h-4 text-primary" />
            <h4 className="text-sm font-semibold text-foreground">Gap Analysis</h4>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            To reach <span className="text-primary font-semibold">Partner level</span>, your primary focus areas are{" "}
            <span className="text-foreground font-semibold">{gapSkills[0]?.name}</span>
            {" "}(−{gapSkills[0]?.delta}%)
            {gapSkills[1] && (
              <>
                {" "}and{" "}
                <span className="text-foreground font-semibold">{gapSkills[1]?.name}</span>
                {" "}(−{gapSkills[1]?.delta}%)
              </>
            )}.
          </p>
        </div>
      )}

      {/* Skill Detail Modal (tap to inspect) */}
      <Dialog open={!!selectedSkill} onOpenChange={(open) => !open && setSelectedSkill(null)}>
        <DialogContent className="glass-card border-border/30 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg text-foreground flex items-center gap-2">
              {selectedSkillData?.name || selectedSkill}
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted/20 text-muted-foreground">
                {selectedSkillData?.tier} Tier
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-4 mt-2 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{selectedScore}%</div>
              <div className="text-[10px] text-muted-foreground uppercase">Your Score</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-muted-foreground">{selectedBenchmark}%</div>
              <div className="text-[10px] text-muted-foreground uppercase">Partner Target</div>
            </div>
            <div className="text-center">
              <div className={`text-2xl font-bold ${selectedBenchmark - selectedScore > 0 ? "text-rose-400" : "text-emerald-400"}`}>
                {selectedBenchmark - selectedScore > 0 ? `−${selectedBenchmark - selectedScore}` : `+${selectedScore - selectedBenchmark}`}%
              </div>
              <div className="text-[10px] text-muted-foreground uppercase">Gap</div>
            </div>
          </div>

          {selectedSkillData && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Objective Evidence Questions</p>
              {selectedSkillData.questions.map((q, i) => {
                const levelColor = q.level === "Base" ? "bg-emerald-500/20 text-emerald-400" : q.level === "Intermediate" ? "bg-amber-500/20 text-amber-400" : "bg-rose-500/20 text-rose-400";
                return (
                  <div key={i} className="p-3 rounded-lg bg-muted/5 border border-border/10">
                    <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full mb-1.5 ${levelColor}`}>
                      {q.level}
                    </span>
                    <p className="text-sm text-foreground/80 leading-relaxed">{q.question}</p>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Targets Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="glass-card border-border/30 sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-gradient-gold text-lg">Set 12-Month Targets</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2 max-h-[50vh] overflow-y-auto">
            {Object.keys(targets).map((p) => (
              <div key={p} className="flex items-center justify-between gap-4">
                <span className="text-sm text-foreground">{p}</span>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={targets[p] ?? 100}
                  onChange={(e) => setTargets({ ...targets, [p]: parseFloat(e.target.value) || 100 })}
                  className="w-24 h-8 bg-secondary border-border/30 text-sm text-right"
                  placeholder="hrs"
                />
              </div>
            ))}
          </div>
          <Button onClick={handleSaveTargets} disabled={saving} className="w-full mt-4 bg-primary text-primary-foreground hover:bg-primary/90">
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Save Targets
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SkillRadar;
