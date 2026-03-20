import { useState } from "react";
import { Brain, Loader2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type Entry = Database["public"]["Tables"]["entries"]["Row"];

const WeeklyTransformationLens = ({ entries }: { entries: Entry[] }) => {
  const [generating, setGenerating] = useState(false);
  const [memo, setMemo] = useState("");
  const [memoOpen, setMemoOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const weeklyVoice = entries.filter(
    (e) => e.type === "voice" && new Date(e.created_at) >= weekAgo
  );

  const voiceCount = weeklyVoice.length;

  const handleGenerate = async () => {
    if (weeklyVoice.length === 0) {
      toast({ title: "No voice notes", description: "Record some voice notes this week first.", variant: "destructive" });
      return;
    }

    setGenerating(true);
    try {
      const thoughts = weeklyVoice
        .slice(0, 10)
        .map((e, i) => `[${i + 1}] ${e.summary || e.content}`)
        .join("\n\n");

      const { data, error } = await supabase.functions.invoke("draft-post", {
        body: {
          title: "Weekly Transformation Lens",
          summary: thoughts,
          content: "",
          type: "weekly-memo",
        },
      });

      if (error || data?.error) {
        toast({ title: "Generation failed", description: data?.error || error?.message, variant: "destructive" });
      } else {
        setMemo(data.post);
        setMemoOpen(true);
      }
    } catch {
      toast({ title: "Error", description: "Could not generate memo.", variant: "destructive" });
    }
    setGenerating(false);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(memo);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <div
        className="glass-card rounded-2xl p-4 sm:p-6 cursor-pointer hover:bg-card-hover transition-all group"
        onClick={handleGenerate}
      >
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <Brain className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
          {generating && <Loader2 className="w-4 h-4 text-primary animate-spin" />}
        </div>
        <p className="text-lg sm:text-xl font-bold text-foreground tracking-tight">
          {voiceCount}
        </p>
        <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 sm:mt-1.5 tracking-wide uppercase">
          Weekly Thoughts
        </p>
        <p className="text-[10px] text-primary mt-2 font-medium group-hover:underline">
          Generate Leadership Memo →
        </p>
      </div>

      <Dialog open={memoOpen} onOpenChange={setMemoOpen}>
        <DialogContent className="glass-card border-border/30 sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-gradient-gold text-lg">Weekly Transformation Lens</DialogTitle>
          </DialogHeader>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Leadership Memo + Coach's Challenge</p>
          <div className="bg-secondary/50 rounded-xl p-5 mt-2 text-sm text-foreground leading-relaxed whitespace-pre-line max-h-[400px] overflow-y-auto" dir="auto">
            {memo}
          </div>
          <Button onClick={handleCopy} variant="outline" className="w-full mt-2 border-border/30">
            {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
            {copied ? "Copied!" : "Copy to Clipboard"}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default WeeklyTransformationLens;
