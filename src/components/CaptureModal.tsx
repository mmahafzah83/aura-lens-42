import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Link, Mic, Type, Loader2, Square } from "lucide-react";
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
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceAnalysis, setVoiceAnalysis] = useState<{ summary: string | null; skill_pillar: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Prefer webm/opus, fall back to whatever the browser supports
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        // Stop all tracks
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];

        if (blob.size === 0) {
          toast({ title: "Error", description: "No audio captured.", variant: "destructive" });
          return;
        }

        // Transcribe via Whisper
        setIsTranscribing(true);
        toast({ title: "Transcribing", description: "Whisper is processing your audio…" });

        try {
          const formData = new FormData();
          const ext = mimeType.includes("webm") ? "webm" : "mp4";
          formData.append("audio", blob, `recording.${ext}`);

          const { data: fnData, error: fnError } = await supabase.functions.invoke(
            "transcribe-voice",
            { body: formData }
          );

          if (fnError) {
            console.error("Transcription error:", fnError);
            toast({ title: "Transcription failed", description: fnError.message, variant: "destructive" });
          } else if (fnData?.error) {
            toast({ title: "Transcription failed", description: fnData.error, variant: "destructive" });
          } else if (fnData?.transcript) {
            setContent(fnData.transcript);
            if (fnData.summary) {
              setVoiceAnalysis({ summary: fnData.summary, skill_pillar: fnData.skill_pillar || null });
              toast({ title: "Analyzed", description: "Senior Partner briefing generated." });
            } else {
              toast({ title: "Transcribed", description: "Voice note converted to text." });
            }
          }
        } catch (err) {
          console.error("Transcription fetch error:", err);
          toast({ title: "Error", description: "Could not transcribe audio.", variant: "destructive" });
        }
        setIsTranscribing(false);
      };

      recorder.start();
      setIsRecording(true);
      toast({ title: "Recording", description: "Speak clearly. Tap stop when done." });
    } catch (err) {
      console.error("Microphone error:", err);
      toast({ title: "Microphone Error", description: "Could not access microphone. Check browser permissions.", variant: "destructive" });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const handleSave = async () => {
    if (!content.trim()) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ title: "Error", description: "Not authenticated", variant: "destructive" });
      setSaving(false);
      return;
    }

    let summary: string | null = null;
    let title: string | null = null;
    let skill_pillar: string | null = null;
    let has_strategic_insight = false;

    if (captureType === "link") {
      toast({ title: "Analyzing", description: "AI is extracting strategic intelligence..." });
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
          title = fnData?.title || null;
          summary = fnData?.summary || null;
          skill_pillar = fnData?.skill_pillar || null;
          has_strategic_insight = fnData?.has_strategic_insight === true;
        }
      } catch (err) {
        console.error("Summary fetch error:", err);
      }
    }

    if (captureType === "voice") {
      if (voiceAnalysis?.summary) {
        summary = voiceAnalysis.summary;
        has_strategic_insight = true;
      }
      if (voiceAnalysis?.skill_pillar) {
        skill_pillar = voiceAnalysis.skill_pillar;
      } else {
        // Fallback keyword tagging
        const lower = content.toLowerCase();
        if (lower.includes("strategy") || lower.includes("plan") || lower.includes("objective")) skill_pillar = "Strategy";
        else if (lower.includes("tech") || lower.includes("digital twin")) skill_pillar = "Technology";
        else if (lower.includes("desalination") || lower.includes("nwc") || lower.includes("mewa") || lower.includes("water")) skill_pillar = "Utilities";
        else if (lower.includes("leader") || lower.includes("team") || lower.includes("manage")) skill_pillar = "Leadership";
        else if (lower.includes("brand") || lower.includes("personal") || lower.includes("market")) skill_pillar = "Brand";
        else skill_pillar = "Strategy";
      }
    }

    const { error } = await supabase.from("entries").insert({
      user_id: user.id,
      type: captureType,
      content: content.trim(),
      summary,
      title,
      skill_pillar,
      has_strategic_insight,
    } as any);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Captured", description: summary ? "Entry saved with executive briefing." : "Entry saved successfully." });
      setContent("");
      setVoiceAnalysis(null);
      onCaptured();
      onOpenChange(false);
    }
    setSaving(false);
  };

  const types: { key: CaptureType; icon: typeof Link; label: string }[] = [
    { key: "link", icon: Link, label: "Link" },
    { key: "voice", icon: Mic, label: "Voice" },
    { key: "text", icon: Type, label: "Text" },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && isRecording) stopRecording(); onOpenChange(v); }}>
      <DialogContent className="glass-card border-border/30 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-gradient-gold text-xl">Capture Intelligence</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 my-4">
          {types.map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => { if (!isRecording && !isTranscribing) setCaptureType(key); }}
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
            className="bg-secondary border-border/30"
          />
        )}

        {captureType === "text" && (
          <Textarea
            placeholder="Write your thoughts..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            className="bg-secondary border-border/30 resize-none"
          />
        )}

        {captureType === "voice" && (
          <div className="flex flex-col items-center gap-4 py-6">
            {isTranscribing ? (
              <>
                <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
                <p className="text-sm text-muted-foreground">Transcribing with Whisper…</p>
              </>
            ) : (
              <>
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
                    isRecording
                      ? "bg-destructive animate-pulse"
                      : "bg-primary gold-glow hover:scale-105"
                  }`}
                >
                  {isRecording ? (
                    <Square className="w-7 h-7 text-destructive-foreground" />
                  ) : (
                    <Mic className="w-8 h-8 text-primary-foreground" />
                  )}
                </button>
                <p className="text-sm text-muted-foreground">
                  {isRecording ? "Recording… tap to stop" : "Tap to record"}
                </p>
              </>
            )}

            {content && !isRecording && !isTranscribing && (
              <div className="w-full mt-2">
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={4}
                  className="bg-secondary border-border/30 resize-none text-sm"
                  placeholder="Transcript will appear here…"
                />
              </div>
            )}
          </div>
        )}

        <Button
          onClick={handleSave}
          disabled={saving || isRecording || isTranscribing || !content.trim()}
          className="w-full mt-2 bg-primary text-primary-foreground hover:bg-primary/90 gold-glow"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          {saving && captureType === "link" ? "Extracting Intelligence…" : "Save Entry"}
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default CaptureModal;
