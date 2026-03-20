import { useState } from "react";
import { Flame, Loader2, TrendingUp, TrendingDown, Zap, Target } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type Entry = Database["public"]["Tables"]["entries"]["Row"];

const PotentialUnleashed = ({ entries }: { entries: Entry[] }) => {
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{
    strengths: string[];
    blind_spots: string[];
    brand_alignment: number;
    brand_rationale: string;
    unlock_action: string;
  } | null>(null);
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const handleGenerate = async () => {
    if (entries.length === 0) {
      toast({ title: "No captures yet", description: "Add some captures first.", variant: "destructive" });
      return;
    }

    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-potential", {
        body: {
          entries: entries.slice(0, 15).map((e) => ({
            type: e.type,
            skill_pillar: e.skill_pillar,
            summary: e.summary,
            content: e.content,
          })),
        },
      });

      if (error || data?.error) {
        toast({ title: "Analysis failed", description: data?.error || error?.message, variant: "destructive" });
      } else {
        setResult(data);
        setOpen(true);
      }
    } catch {
      toast({ title: "Error", description: "Could not analyze potential.", variant: "destructive" });
    }
    setGenerating(false);
  };

  const getBrandColor = (score: number) => {
    if (score >= 8) return "text-green-400";
    if (score >= 5) return "text-primary";
    return "text-amber-400";
  };

  return (
    <>
      <div
        className="glass-card rounded-2xl p-4 sm:p-6 cursor-pointer hover:bg-card-hover transition-all group"
        onClick={handleGenerate}
      >
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <Flame className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
          {generating && <Loader2 className="w-4 h-4 text-primary animate-spin" />}
        </div>
        <p className="text-lg sm:text-xl font-bold text-foreground tracking-tight">
          {entries.length}
        </p>
        <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 sm:mt-1.5 tracking-wide uppercase">
          Brand & Potential
        </p>
        <p className="text-[10px] text-primary mt-2 font-medium group-hover:underline">
          Open the Mirror →
        </p>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="glass-card border-border/30 sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-gradient-gold text-lg">Brand & Potential Mirror</DialogTitle>
          </DialogHeader>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Transformation Architect Assessment</p>

          {result && (
            <div className="space-y-5 mt-3">
              {/* Brand Alignment Score */}
              <div className="flex items-center gap-4 bg-secondary/50 rounded-xl p-4 border border-border/20">
                <div className="flex flex-col items-center">
                  <Target className="w-5 h-5 text-primary mb-1" />
                  <span className={`text-3xl font-bold ${getBrandColor(result.brand_alignment)}`}>
                    {result.brand_alignment}
                  </span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">/10</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-primary uppercase tracking-widest font-semibold mb-1">Brand Alignment</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{result.brand_rationale}</p>
                </div>
              </div>

              {/* Strengths */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-green-400" />
                  <p className="text-xs text-green-400 uppercase tracking-widest font-semibold">Where You Lead</p>
                </div>
                <ul className="space-y-2">
                  {result.strengths.map((s, i) => (
                    <li key={i} className="text-sm text-foreground leading-relaxed bg-green-500/5 border border-green-500/10 rounded-lg p-3">
                      {s}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Blind Spots */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <TrendingDown className="w-4 h-4 text-amber-400" />
                  <p className="text-xs text-amber-400 uppercase tracking-widest font-semibold">Blind Spots</p>
                </div>
                <ul className="space-y-2">
                  {result.blind_spots.map((w, i) => (
                    <li key={i} className="text-sm text-foreground leading-relaxed bg-amber-500/5 border border-amber-500/10 rounded-lg p-3">
                      {w}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Unlock Action */}
              <div className="bg-primary/10 border border-primary/20 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-4 h-4 text-primary" />
                  <p className="text-xs text-primary uppercase tracking-widest font-semibold">The Coach's Challenge</p>
                </div>
                <p className="text-sm text-foreground leading-relaxed italic">{result.unlock_action}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PotentialUnleashed;
