import { useEffect, useState } from "react";
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Settings2, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

const PILLARS = ["C-Suite Advisory", "Strategic Architecture", "Industry Foresight", "Transformation Stewardship", "Digital Fluency"];
const DEFAULT_TARGET = 100;

const SkillRadar = () => {
  const [data, setData] = useState(PILLARS.map((p) => ({ skill: p, current: 0, target: DEFAULT_TARGET })));
  const [showTarget, setShowTarget] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [targets, setTargets] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const fetch = async () => {
      const [{ data: logs }, { data: targetRows }] = await Promise.all([
        supabase.from("training_logs" as any).select("pillar, duration_hours") as any,
        supabase.from("skill_targets" as any).select("pillar, target_hours") as any,
      ]);

      const totals: Record<string, number> = {};
      const tgts: Record<string, number> = {};
      PILLARS.forEach((p) => { totals[p] = 0; tgts[p] = DEFAULT_TARGET; });

      (logs || []).forEach((l: any) => {
        if (totals[l.pillar] !== undefined) totals[l.pillar] += Number(l.duration_hours) || 0;
      });
      (targetRows || []).forEach((t: any) => {
        if (tgts[t.pillar] !== undefined) tgts[t.pillar] = Number(t.target_hours) || DEFAULT_TARGET;
      });

      setTargets(tgts);

      const allVals = [...Object.values(totals), ...Object.values(tgts)];
      const maxVal = Math.max(...allVals, 1);

      setData(PILLARS.map((p) => ({
        skill: p,
        current: Math.round((totals[p] / maxVal) * 100),
        target: Math.round((tgts[p] / maxVal) * 100),
      })));
    };

    fetch();
  }, [saving]);

  const handleSaveTargets = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    for (const pillar of PILLARS) {
      const hours = targets[pillar] || DEFAULT_TARGET;
      await (supabase.from("skill_targets" as any) as any).delete().eq("user_id", user.id).eq("pillar", pillar);
      await (supabase.from("skill_targets" as any) as any).insert({ user_id: user.id, pillar, target_hours: hours });
    }

    toast({ title: "Targets Saved", description: "12-month goals updated." });
    setSaving(false);
    setEditOpen(false);
  };

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-lg font-semibold text-foreground">Skill Radar</h3>
        <button onClick={() => setEditOpen(true)} className="text-muted-foreground hover:text-primary transition-colors">
          <Settings2 className="w-4 h-4" />
        </button>
      </div>
      <p className="text-xs text-muted-foreground mb-3 tracking-wide uppercase">Training hours by pillar</p>

      <div className="flex items-center gap-2 mb-2">
        <Switch checked={showTarget} onCheckedChange={setShowTarget} className="data-[state=checked]:bg-primary" />
        <span className="text-xs text-muted-foreground">Show 12-month target</span>
      </div>

      <div className="flex-1 min-h-[200px] sm:min-h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} cx="50%" cy="50%" outerRadius="72%">
            <PolarGrid stroke="hsl(0 0% 20%)" strokeDasharray="3 3" />
            <PolarAngleAxis
              dataKey="skill"
              tick={{ fill: "hsl(40 15% 65%)", fontSize: 10, fontFamily: "Inter" }}
            />
            <Radar name="Current" dataKey="current" stroke="hsl(43 72% 52%)" fill="hsl(43 72% 52%)" fillOpacity={0.12} strokeWidth={2} />
            {showTarget && (
              <Radar name="Target" dataKey="target" stroke="hsl(0 0% 40%)" fill="none" strokeWidth={1.5} strokeDasharray="6 3" />
            )}
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {showTarget && (
        <div className="flex items-center justify-center gap-5 mt-1">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-primary rounded-full" />
            <span className="text-[10px] text-muted-foreground">Current</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-muted-foreground rounded-full" style={{ borderTop: "1.5px dashed" }} />
            <span className="text-[10px] text-muted-foreground">12-mo Target</span>
          </div>
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="glass-card border-border/30 sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-gradient-gold text-lg">Set 12-Month Targets</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            {PILLARS.map((p) => (
              <div key={p} className="flex items-center justify-between gap-4">
                <span className="text-sm text-foreground">{p}</span>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={targets[p] ?? DEFAULT_TARGET}
                  onChange={(e) => setTargets({ ...targets, [p]: parseFloat(e.target.value) || DEFAULT_TARGET })}
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
