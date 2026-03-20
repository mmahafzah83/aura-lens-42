import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const PILLARS = ["C-Suite Advisory", "Strategic Architecture", "Industry Foresight", "Transformation Stewardship", "Digital Fluency"] as const;

interface TrainingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLogged: () => void;
}

const TrainingModal = ({ open, onOpenChange, onLogged }: TrainingModalProps) => {
  const [pillar, setPillar] = useState<string>("");
  const [hours, setHours] = useState("");
  const [topic, setTopic] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    if (!pillar || !hours || !topic.trim()) return;
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ title: "Error", description: "Not authenticated", variant: "destructive" });
      setSaving(false);
      return;
    }

    const { error } = await supabase.from("training_logs" as any).insert({
      user_id: user.id,
      pillar,
      duration_hours: parseFloat(hours),
      topic: topic.trim(),
    } as any);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Training Logged", description: `${hours}h of ${pillar} recorded.` });
      setPillar("");
      setHours("");
      setTopic("");
      onLogged();
      onOpenChange(false);
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card border-border/30 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-gradient-gold text-xl">Log Training</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Subject Area</label>
            <Select value={pillar} onValueChange={setPillar}>
              <SelectTrigger className="bg-secondary border-border/30">
                <SelectValue placeholder="Select a pillar" />
              </SelectTrigger>
              <SelectContent>
                {PILLARS.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Duration (Hours)</label>
            <Input
              type="number"
              min="0.25"
              step="0.25"
              placeholder="e.g. 1.5"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              className="bg-secondary border-border/30"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Topic Name</label>
            <Input
              placeholder="e.g. AWS Solutions Architecture"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="bg-secondary border-border/30"
            />
          </div>
        </div>

        <Button
          onClick={handleSave}
          disabled={saving || !pillar || !hours || !topic.trim()}
          className="w-full mt-4 bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
          Log Training
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default TrainingModal;
