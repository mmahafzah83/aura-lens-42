import { useState } from "react";
import { Flame, Loader2, Eye, AlertTriangle, Lightbulb, Target } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type Entry = Database["public"]["Tables"]["entries"]["Row"];

type MirrorResult = {
  outsider_perception: string;
  contradiction: string;
  neglected_topic: string;
  brand_alignment: number;
  brand_rationale: string;
};

const PotentialUnleashed = ({ entries }: { entries: Entry[] }) => {
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<MirrorResult | null>(null);
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
          entries: entries.slice(0, 10).map((e) => ({
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
          Mirror
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
            <DialogTitle className="text-gradient-gold text-lg">Brand Mirror</DialogTitle>
          </DialogHeader>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Based on your last 10 captures</p>

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

              {/* Outsider Perception */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Eye className="w-4 h-4 text-blue-400" />
                  <p className="text-xs text-blue-400 uppercase tracking-widest font-semibold">How You Sound to an Outsider</p>
                </div>
                <div className="text-sm text-foreground leading-relaxed bg-blue-500/5 border border-blue-500/10 rounded-lg p-3" dir="auto">
                  {result.outsider_perception}
                </div>
              </div>

              {/* Contradiction */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <p className="text-xs text-amber-400 uppercase tracking-widest font-semibold">Contradiction in Your Thinking</p>
                </div>
                <div className="text-sm text-foreground leading-relaxed bg-amber-500/5 border border-amber-500/10 rounded-lg p-3" dir="auto">
                  {result.contradiction}
                </div>
              </div>

              {/* Neglected Topic */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Lightbulb className="w-4 h-4 text-green-400" />
                  <p className="text-xs text-green-400 uppercase tracking-widest font-semibold">What You Should Be Talking About</p>
                </div>
                <div className="text-sm text-foreground leading-relaxed bg-green-500/5 border border-green-500/10 rounded-lg p-3" dir="auto">
                  {result.neglected_topic}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PotentialUnleashed;
