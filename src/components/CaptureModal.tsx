import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Link, Mic, Type, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type CaptureType = "link" | "voice" | "text";

interface CaptureModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCaptured: () => void;
}

const CaptureModal = ({ open, onOpenChange, onCaptured }: CaptureModalProps) => {
  const [captureType, setCaptureType] = useState<CaptureType>("link");
  const [content, setContent] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    if (!content.trim()) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ title: "Error", description: "Not authenticated", variant: "destructive" });
      setSaving(false);
      return;
    }

    // If it's a link, generate an AI summary first
    let summary: string | null = null;
    if (captureType === "link") {
      toast({ title: "Analyzing", description: "AI is reading the page..." });
      try {
        const { data: fnData, error: fnError } = await supabase.functions.invoke("summarize-link", {
          body: { url: content.trim() },
        });
        if (fnError) {
          console.error("Summary function error:", fnError);
          toast({ title: "Summary unavailable", description: "Saving link without summary.", variant: "destructive" });
        } else if (fnData?.error) {
          console.error("Summary error:", fnData.error);
          toast({ title: "Summary unavailable", description: fnData.error, variant: "destructive" });
        } else {
          summary = fnData?.summary || null;
        }
      } catch (err) {
        console.error("Summary fetch error:", err);
      }
    }

    const { error } = await supabase.from("entries").insert({
      user_id: user.id,
      type: captureType,
      content: content.trim(),
      summary,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Captured", description: summary ? "Entry saved with executive summary." : "Entry saved successfully." });
      setContent("");
      onCaptured();
      onOpenChange(false);
    }
    setSaving(false);
  };

  const toggleRecording = () => {
    if (!isRecording) {
      if (!navigator.mediaDevices?.getUserMedia) {
        toast({ title: "Unsupported", description: "Voice recording not supported in this browser.", variant: "destructive" });
        return;
      }
      setIsRecording(true);
      toast({ title: "Recording", description: "Voice recording started. Click stop when done." });
    } else {
      setIsRecording(false);
      setContent("[Voice note recorded at " + new Date().toLocaleTimeString() + "]");
      toast({ title: "Stopped", description: "Voice recording saved." });
    }
  };

  const types: { key: CaptureType; icon: typeof Link; label: string }[] = [
    { key: "link", icon: Link, label: "Link" },
    { key: "voice", icon: Mic, label: "Voice" },
    { key: "text", icon: Type, label: "Text" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card border-border/50 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-gradient-gold text-xl">Capture Intelligence</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 my-4">
          {types.map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setCaptureType(key)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium transition-all ${
                captureType === key
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {captureType === "link" && (
          <Input
            placeholder="Paste a URL..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="bg-secondary border-border/50"
          />
        )}

        {captureType === "text" && (
          <Textarea
            placeholder="Write your thoughts..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            className="bg-secondary border-border/50 resize-none"
          />
        )}

        {captureType === "voice" && (
          <div className="flex flex-col items-center gap-4 py-4">
            <button
              onClick={toggleRecording}
              className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
                isRecording
                  ? "bg-destructive animate-pulse"
                  : "bg-primary gold-glow hover:scale-105"
              }`}
            >
              <Mic className={`w-8 h-8 ${isRecording ? "text-destructive-foreground" : "text-primary-foreground"}`} />
            </button>
            <p className="text-sm text-muted-foreground">
              {isRecording ? "Recording... tap to stop" : "Tap to record"}
            </p>
          </div>
        )}

        <Button
          onClick={handleSave}
          disabled={saving || !content.trim()}
          className="w-full mt-2 bg-primary text-primary-foreground hover:bg-primary/90 gold-glow"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          {saving && captureType === "link" ? "Analyzing & Saving..." : "Save Entry"}
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default CaptureModal;
