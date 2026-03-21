import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Link, Mic, Type, Loader2, Square, ImageIcon, X, FileUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import DocumentUpload from "@/components/DocumentUpload";

type CaptureType = "link" | "voice" | "text" | "image" | "document";

const NEW_PILLARS = ["C-Suite Advisory", "Strategic Architecture", "Industry Foresight", "Transformation Stewardship", "Digital Fluency"];

interface CaptureModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCaptured: () => void;
  onOpenChat?: (prefill: string) => void;
}

const CaptureModal = ({ open, onOpenChange, onCaptured, onOpenChat }: CaptureModalProps) => {
  const [captureType, setCaptureType] = useState<CaptureType>("link");
  const [content, setContent] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceAnalysis, setVoiceAnalysis] = useState<{ summary: string | null; skill_pillar: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageAnalysis, setImageAnalysis] = useState<{
    transcribed_text: string;
    title: string;
    summary: string;
    skill_pillar: string;
    has_strategic_insight: boolean;
  } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const handleImageSelect = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please upload an image.", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Too large", description: "Image must be under 10MB.", variant: "destructive" });
      return;
    }

    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);

    // Analyze with AI
    setAnalyzing(true);
    toast({ title: "Analyzing", description: "AI is reading your screenshot…" });

    try {
      const base64Reader = new FileReader();
      const base64 = await new Promise<string>((resolve) => {
        base64Reader.onload = () => {
          const result = base64Reader.result as string;
          resolve(result.split(",")[1]);
        };
        base64Reader.readAsDataURL(file);
      });

      const { data, error } = await supabase.functions.invoke("analyze-image", {
        body: { image_base64: base64, mime_type: file.type },
      });

      if (error || data?.error) {
        toast({ title: "Analysis failed", description: data?.error || error?.message, variant: "destructive" });
      } else {
        setImageAnalysis(data);
        setContent(data.transcribed_text || file.name);
        toast({ title: "Analyzed", description: "Image intelligence extracted." });
      }
    } catch {
      toast({ title: "Error", description: "Could not analyze image.", variant: "destructive" });
    }
    setAnalyzing(false);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          setCaptureType("image");
          handleImageSelect(file);
        }
        return;
      }
    }
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setImageAnalysis(null);
    setContent("");
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
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
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        if (blob.size === 0) {
          toast({ title: "Error", description: "No audio captured.", variant: "destructive" });
          return;
        }
        setIsTranscribing(true);
        toast({ title: "Transcribing", description: "Processing your audio…" });
        try {
          const formData = new FormData();
          const ext = mimeType.includes("webm") ? "webm" : "mp4";
          formData.append("audio", blob, `recording.${ext}`);
          const { data: fnData, error: fnError } = await supabase.functions.invoke("transcribe-voice", { body: formData });
          if (fnError) {
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
        } catch {
          toast({ title: "Error", description: "Could not transcribe audio.", variant: "destructive" });
        }
        setIsTranscribing(false);
      };

      recorder.start();
      setIsRecording(true);
      toast({ title: "Recording", description: "Speak clearly. Tap stop when done." });
    } catch {
      toast({ title: "Microphone Error", description: "Could not access microphone.", variant: "destructive" });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const handleSave = async () => {
    if (captureType === "image" && !imageFile) return;
    if (captureType !== "image" && !content.trim()) return;
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
    let image_url: string | null = null;
    let entryContent = content.trim();

    if (captureType === "image" && imageFile) {
      // Upload image to storage
      const filePath = `${user.id}/${Date.now()}-${imageFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from("capture-images")
        .upload(filePath, imageFile);

      if (uploadError) {
        toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
        setSaving(false);
        return;
      }

      const { data: urlData } = supabase.storage.from("capture-images").getPublicUrl(filePath);
      image_url = urlData.publicUrl;

      if (imageAnalysis) {
        entryContent = imageAnalysis.transcribed_text || imageFile.name;
        title = imageAnalysis.title;
        summary = imageAnalysis.summary;
        skill_pillar = imageAnalysis.skill_pillar;
        has_strategic_insight = imageAnalysis.has_strategic_insight;
      } else {
        entryContent = imageFile.name;
      }
    }

    if (captureType === "link") {
      toast({ title: "Analyzing", description: "AI is extracting strategic intelligence..." });
      try {
        const { data: fnData, error: fnError } = await supabase.functions.invoke("summarize-link", {
          body: { url: content.trim() },
        });
        if (!fnError && !fnData?.error) {
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
        const lower = content.toLowerCase();
        if (lower.includes("advisory") || lower.includes("c-suite")) skill_pillar = "C-Suite Advisory";
        else if (lower.includes("architecture") || lower.includes("strategy")) skill_pillar = "Strategic Architecture";
        else if (lower.includes("foresight") || lower.includes("trend")) skill_pillar = "Industry Foresight";
        else if (lower.includes("transform") || lower.includes("change")) skill_pillar = "Transformation Stewardship";
        else if (lower.includes("digital") || lower.includes("tech") || lower.includes("ai")) skill_pillar = "Digital Fluency";
        else skill_pillar = "Strategic Architecture";
      }
    }

    // Detect expert framework content
    const fullText = `${title || ""} ${summary || ""} ${entryContent}`.toLowerCase();
    const isExpertFramework = /expert\s*system|framework|step[s]?\s*(1|one)|branding\s*(system|model|framework)|methodology|playbook|blueprint|principle[s]?\s*of/i.test(fullText);
    const framework_tag = isExpertFramework ? "#ExpertFramework" : null;

    const { data: insertData, error } = await supabase.from("entries").insert({
      user_id: user.id,
      type: captureType,
      content: entryContent,
      summary,
      title,
      skill_pillar,
      has_strategic_insight,
      image_url,
      framework_tag,
    } as any).select("id").single();

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      // Generate embedding in background (non-blocking)
      if (insertData?.id) {
        supabase.functions.invoke("generate-embedding", {
          body: { text: `${title || ""} ${summary || ""} ${entryContent}`, table: "entries", record_id: insertData.id },
        }).catch((e) => console.error("Embedding error:", e));

        // If expert framework, extract and save to master_frameworks
        if (isExpertFramework) {
          toast({ title: "Expert Framework Detected", description: "Extracting framework steps…" });
          supabase.functions.invoke("extract-framework", {
            body: { entry_id: insertData.id, title, summary, content: entryContent },
          }).then(({ data, error: fwErr }) => {
            if (!fwErr && data?.success) {
              toast({ title: "Framework Saved", description: `"${data.framework_title}" added to your expert vault (${data.steps_count} steps).` });
            }
          }).catch((e) => console.error("Framework extraction error:", e));
        }

        // Auto-deconstruct: extract learned intelligence from every capture
        supabase.functions.invoke("deconstruct-upload", {
          body: { entry_id: insertData.id },
        }).then(({ data: deconData }) => {
          if (deconData?.extracted > 0) {
            toast({ title: "Intelligence Extracted", description: `${deconData.extracted} insights added to your Learning Vault.` });
          }
        }).catch((e) => console.error("Deconstruct error:", e));
      }
      toast({ title: "Captured", description: summary ? "Entry saved with executive briefing." : "Entry saved successfully." });
      setContent("");
      setVoiceAnalysis(null);
      setImageFile(null);
      setImagePreview(null);
      setImageAnalysis(null);
      onCaptured();
      onOpenChange(false);
    }
    setSaving(false);
  };

  const types: { key: CaptureType; icon: typeof Link; label: string }[] = [
    { key: "link", icon: Link, label: "Link" },
    { key: "voice", icon: Mic, label: "Voice" },
    { key: "text", icon: Type, label: "Text" },
    { key: "image", icon: ImageIcon, label: "Image" },
    { key: "document", icon: FileUp, label: "Doc" },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && isRecording) stopRecording(); onOpenChange(v); }}>
      <DialogContent className="glass-card border-border/30 sm:max-w-md" onPaste={handlePaste}>
        <DialogHeader>
          <DialogTitle className="text-gradient-gold text-xl">Capture Intelligence</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 my-4">
          {types.map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => { if (!isRecording && !isTranscribing && !analyzing) { setCaptureType(key); if (key !== "image") clearImage(); } }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-lg text-xs sm:text-sm font-medium transition-all ${
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
            dir="auto"
            className="bg-secondary border-border/30 resize-none"
          />
        )}

        {captureType === "image" && (
          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImageSelect(file);
              }}
            />

            {!imagePreview ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border/40 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-colors"
              >
                <ImageIcon className="w-10 h-10 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">Click to upload or paste a screenshot</p>
                <p className="text-[10px] text-muted-foreground mt-1">PNG, JPG up to 10MB</p>
              </div>
            ) : (
              <div className="relative">
                <img src={imagePreview} alt="Preview" className="w-full max-h-48 object-contain rounded-xl bg-secondary" />
                <button
                  onClick={clearImage}
                  className="absolute top-2 right-2 w-6 h-6 rounded-full bg-background/80 flex items-center justify-center hover:bg-background transition-colors"
                >
                  <X className="w-3.5 h-3.5 text-foreground" />
                </button>
              </div>
            )}

            {analyzing && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                AI is reading your screenshot…
              </div>
            )}

            {imageAnalysis && (
              <div className="bg-secondary/60 border border-border/20 rounded-xl p-4 space-y-2">
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Image Intelligence</p>
                {imageAnalysis.title && (
                  <p className="text-sm font-medium text-foreground">{imageAnalysis.title}</p>
                )}
                <p className="text-xs text-foreground whitespace-pre-line leading-relaxed" dir="auto">
                  {imageAnalysis.summary}
                </p>
                {imageAnalysis.skill_pillar && (
                  <span className="inline-block text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/15 text-primary mt-1">
                    {imageAnalysis.skill_pillar}
                  </span>
                )}
                {onOpenChat && (
                  <button
                    onClick={() => {
                      const title = imageAnalysis.title || "this framework";
                      onOpenChat(`Turn the framework "${title}" into a 5-minute briefing for my next meeting. Structure it as: Context (30s), Core Framework (2min), Application to Our Client (2min), One Provocative Question (30s).`);
                      onOpenChange(false);
                    }}
                    className="mt-2 w-full text-left text-xs px-3 py-2.5 rounded-lg bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-colors"
                  >
                    ◈ Turn this framework into a 5-minute meeting briefing?
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {captureType === "document" && (
          <DocumentUpload onUploaded={() => { onCaptured(); onOpenChange(false); }} />
        )}

        {captureType === "voice" && (
          <div className="flex flex-col items-center gap-4 py-6">
            {isTranscribing ? (
              <>
                <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
                <p className="text-sm text-muted-foreground">Analyzing as Senior Partner…</p>
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
              <div className="w-full mt-2 space-y-3">
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={3}
                  dir="auto"
                  className="bg-secondary border-border/30 resize-none text-sm"
                  placeholder="Transcript will appear here…"
                />
                {voiceAnalysis?.summary && (
                  <div className="bg-secondary/60 border border-border/20 rounded-xl p-4 space-y-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Senior Partner Analysis</p>
                    <p className="text-xs text-foreground whitespace-pre-line leading-relaxed" dir="auto">{voiceAnalysis.summary}</p>
                    {voiceAnalysis.skill_pillar && (
                      <span className="inline-block text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/15 text-primary mt-1">
                        {voiceAnalysis.skill_pillar}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {captureType !== "document" && (
          <Button
            onClick={handleSave}
            disabled={saving || isRecording || isTranscribing || analyzing || (captureType === "image" ? !imageFile : !content.trim())}
            className="w-full mt-2 bg-primary text-primary-foreground hover:bg-primary/90 gold-glow"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {saving && captureType === "link" ? "Extracting Intelligence…" : saving ? "Saving…" : "Save Entry"}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CaptureModal;
