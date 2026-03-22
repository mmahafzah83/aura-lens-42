import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Flag, Star, CheckCircle2, Circle, Plus, Trash2, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface Milestone {
  month: number;
  label: string;
  done: boolean;
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const YearlyRoadmap = () => {
  const [northStar, setNorthStar] = useState("");
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newMonth, setNewMonth] = useState(0);
  const { toast } = useToast();

  const currentMonth = new Date().getMonth();
  const now = new Date();
  const endOfYear = new Date(now.getFullYear(), 11, 31);
  const daysToGoal = Math.max(0, Math.ceil((endOfYear.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await (supabase.from("diagnostic_profiles" as any) as any)
        .select("north_star_goal").eq("user_id", user.id).maybeSingle();
      if (profile?.north_star_goal) setNorthStar(profile.north_star_goal);

      const { data: logs } = await (supabase.from("training_logs" as any) as any)
        .select("created_at, pillar").eq("user_id", user.id);

      const quarters: Milestone[] = [
        { month: 2, label: "Q1: Foundation & Self-Assessment", done: currentMonth >= 2 },
        { month: 5, label: "Q2: Skill Acceleration", done: currentMonth >= 5 },
        { month: 8, label: "Q3: Market Positioning", done: currentMonth >= 8 },
        { month: 11, label: "Q4: North Star Sprint", done: currentMonth >= 11 },
      ];
      const entryCount = (logs || []).length;
      if (entryCount >= 5) {
        quarters.push({ month: Math.min(currentMonth, 11), label: `${entryCount} training sessions logged`, done: true });
      }
      setMilestones(quarters.sort((a, b) => a.month - b.month));
    };
    load();
  }, []);

  const addMilestone = () => {
    if (!newLabel.trim()) return;
    setMilestones(prev => [...prev, { month: newMonth, label: newLabel, done: false }].sort((a, b) => a.month - b.month));
    setNewLabel("");
    toast({ title: "Milestone Added" });
  };

  const toggleMilestone = (idx: number) => setMilestones(prev => prev.map((m, i) => i === idx ? { ...m, done: !m.done } : m));
  const removeMilestone = (idx: number) => setMilestones(prev => prev.filter((_, i) => i !== idx));

  return (
    <div className="glass-card rounded-2xl p-6 sm:p-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
            <Flag className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">12-Month Roadmap</h3>
            {northStar && (
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                <Star className="w-3 h-3 text-primary" />
                {northStar}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
            <CalendarClock className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-bold text-primary">{daysToGoal}</span>
            <span className="text-[10px] text-muted-foreground">days left</span>
          </div>
          <button onClick={() => setEditOpen(true)} className="text-xs text-muted-foreground hover:text-primary transition-colors px-3 py-1.5 rounded-lg glass-card tactile-press">
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Vertical Stepper */}
      <div className="relative ml-4">
        {/* Vertical line */}
        <div className="absolute left-[11px] top-0 bottom-0 w-[2px] bg-border/30" />
        <div
          className="absolute left-[11px] top-0 w-[2px] bg-primary/60 transition-all duration-700"
          style={{ height: `${Math.min(100, ((currentMonth + 1) / 12) * 100)}%` }}
        />

        <div className="space-y-0">
          {milestones.map((m, idx) => {
            const isCurrent = m.month === currentMonth;
            const isPast = m.month <= currentMonth;

            return (
              <div key={idx} className="relative flex items-start gap-4 pb-6 group">
                {/* Dot */}
                <div
                  className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 ${
                    m.done
                      ? "bg-primary text-primary-foreground"
                      : isCurrent
                        ? "bg-primary/20 border-2 border-primary text-primary"
                        : isPast
                          ? "bg-secondary/80 text-muted-foreground border border-border/30"
                          : "bg-secondary/40 text-muted-foreground/40 border border-border/20"
                  }`}
                  style={isCurrent ? { boxShadow: '0 0 12px 3px hsl(43 72% 52% / 0.4)' } : undefined}
                >
                  {m.done ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3 h-3" />}
                </div>

                {/* Content */}
                <div
                  className={`flex-1 p-3 rounded-xl cursor-pointer tactile-press transition-all ${
                    isCurrent ? "bg-primary/5 border border-primary/20" : "bg-secondary/20 border border-border/10 hover:bg-secondary/30"
                  }`}
                  onClick={() => toggleMilestone(idx)}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-sm ${m.done ? "text-foreground/60 line-through" : "text-foreground"}`}>
                      {m.label}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-medium ${isCurrent ? "text-primary" : "text-muted-foreground/50"}`}>
                        {MONTH_LABELS[m.month]}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeMilestone(idx); }}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Milestone Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="glass-card border-border/30 sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-gradient-gold text-lg">Add Milestone</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <Input placeholder="Milestone description…" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} className="bg-secondary border-border/30" />
            <div className="flex flex-wrap gap-1.5">
              {MONTH_LABELS.map((label, idx) => (
                <button key={idx} onClick={() => setNewMonth(idx)} className={`px-2.5 py-1 rounded-lg text-xs transition-all tactile-press ${newMonth === idx ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
                  {label}
                </button>
              ))}
            </div>
            <Button onClick={addMilestone} className="w-full bg-primary text-primary-foreground hover:bg-primary/90">Add Milestone</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default YearlyRoadmap;
