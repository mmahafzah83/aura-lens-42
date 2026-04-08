import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Link, Mic, Type, Loader2, Square, ImageIcon, X, FileUp, ExternalLink, Paperclip } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import DocumentUpload from "@/components/DocumentUpload";

type CaptureType = "link" | "voice" | "text" | "image" | "document";

interface CaptureModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCaptured: () => void;
  onOpenChat?: (prefill: string) => void;
}

const isValidUrl = (s: string) => {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};

const CaptureModal = ({ open, onOpenChange, onCaptured, onOpenChat }: CaptureModalProps) => {
  const [captureType, setCaptureType] = useState<CaptureType>("link");
  const [content, setContent] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceAudioUrl, setVoiceAudioUrl] = useState<string | null>(null);
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
  const [urlError, setUrlError] = useState<string | null>(null);
  const [duplicateInfo, setDuplicateInfo] = useState<{ id: string; date: string } | null>(null);
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
          const { data: { session } } = await supabase.auth.getSession();
          const freshToken = session?.access_token;
          const { data: fnData, error: fnError } = await supabase.functions.invoke("transcribe-voice", {
            body: formData,
            ...(freshToken ? { headers: { Authorization: `Bearer ${freshToken}` } } : {}),
          });
          if (fnError) {
            toast({ title: "Transcription failed", description: fnError.message, variant: "destructive" });
          } else if (fnData?.error) {
            toast({ title: "Transcription failed", description: fnData.error, variant: "destructive" });
          } else if (fnData?.transcript) {
            setContent(fnData.transcript);
            if (fnData.audio_url) setVoiceAudioUrl(fnData.audio_url);
            toast({ title: "Transcribed", description: "Voice note converted to text." });
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

    // URL validation for link type
    if (captureType === "link") {
      if (!isValidUrl(content.trim())) {
        setUrlError("Please enter a valid URL starting with http:// or https://");
        return;
      }
      setUrlError(null);
    }

    setDuplicateInfo(null);
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ title: "Error", description: "Not authenticated", variant: "destructive" });
      setSaving(false);
      return;
    }

    let captureContent = content.trim();
    let captureMetadata: Record<string, any> = {};
    let image_url: string | null = null;

    // Handle image upload first
    if (captureType === "image" && imageFile) {
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
        captureContent = imageAnalysis.transcribed_text || imageFile.name;
        captureMetadata = {
          title: imageAnalysis.title,
          summary: imageAnalysis.summary,
          skill_pillar: imageAnalysis.skill_pillar,
          has_strategic_insight: imageAnalysis.has_strategic_insight,
          image_url,
        };
      } else {
        captureContent = imageFile.name;
        captureMetadata = { image_url };
      }
    }

    // Voice metadata
    if (captureType === "voice" && voiceAnalysis) {
      captureMetadata = {
        summary: voiceAnalysis.summary,
        skill_pillar: voiceAnalysis.skill_pillar,
      };
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast({ title: "Error", description: "Session expired. Please log in again.", variant: "destructive" });
        setSaving(false);
        return;
      }

      console.log("Calling ingest-capture with:", captureType, captureContent);

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ingest-capture`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          type: captureType,
          content: captureContent,
          metadata: captureMetadata,
          ...(captureType === "link" && { source_url: content.trim() }),
          ...(captureType === "image" && image_url && { source_url: image_url }),
        }),
      });

      console.log("Response status:", resp.status);

      const data = await resp.json().catch(() => null);

      if (data?.error === "duplicate_url") {
        setDuplicateInfo({
          id: data.existing_id,
          date: new Date(data.created_at).toLocaleDateString(),
        });
        setSaving(false);
        return;
      }

      if (!resp.ok) {
        toast({
          title: "Capture Failed",
          description: data?.error_message || data?.message || data?.error || `Server error (${resp.status})`,
          variant: "destructive",
        });
        setSaving(false);
        return;
      }

      // Processing failure returned in body
      if (data?.processing_status === "failed") {
        toast({
          title: "Processing Failed",
          description: data.error_message || "An error occurred during processing.",
          variant: "destructive",
        });
        setSaving(false);
        return;
      }

      // Also insert into entries table so Knowledge tab picks it up
      const entryTitle = captureType === "link"
        ? (() => { try { return new URL(content.trim()).hostname; } catch { return content.trim().slice(0, 60); } })()
        : (captureContent || "").slice(0, 60) || "Untitled";

      const { data: entryRow, error: entryError } = await supabase.from("entries").insert({
        user_id: session.user.id,
        type: captureType === "link" ? "link" : captureType,
        title: entryTitle,
        content: captureContent,
        summary: captureContent.slice(0, 300),
      }).select("id").single();

      if (entryError) {
        console.error("Failed to insert entry:", entryError.message, entryError);
      } else {
        console.log("Entry inserted successfully, id:", entryRow?.id);
      }

      // Success (201)
      toast({
        title: "Captured. Processing complete.",
        description: "Your capture has been saved and processed.",
      });

      setContent("");
      setVoiceAnalysis(null);
      setImageFile(null);
      setImagePreview(null);
      setImageAnalysis(null);
      setUrlError(null);
      setDuplicateInfo(null);
      onCaptured();
      onOpenChange(false);

      // Fire-and-forget: detect signals in background
      if (entryRow?.id) {
        const entryId = entryRow.id;
        const userId = session.user.id;
        const accessToken = session.access_token;
        setTimeout(() => {
          fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/detect-signals`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ entry_id: entryId, user_id: userId }),
          })
            .then((r) => r.json())
            .then((result) => {
              console.log("detect-signals result:", result);
              if (result?.is_new) {
                setTimeout(() => {
                  toast({ title: "🔍 New signal detected", description: "Check Intelligence tab." });
                }, 3000);
              }
            })
            .catch((err) => console.warn("detect-signals background error:", err));
        }, 0);
      }
    } catch (err: any) {
      toast({
        title: "Capture Failed",
        description: err.message || "An unexpected error occurred.",
        variant: "destructive",
      });
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

  const handleClose = () => {
    if (isRecording) stopRecording();
    onOpenChange(false);
  };

  // Swipe-to-dismiss state
  const touchStartY = useRef(0);
  const [swipeY, setSwipeY] = useState(0);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const delta = e.touches[0].clientY - touchStartY.current;
    if (delta > 0) setSwipeY(delta);
  };
  const onTouchEnd = () => {
    if (swipeY > 120) handleClose();
    setSwipeY(0);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex flex-col items-center justify-end" style={{ willChange: "unset" }}>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" style={{ zIndex: 999, pointerEvents: "all" }} onClick={handleClose} />

      {/* Bottom Sheet */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onPaste={handlePaste}
        className="relative flex flex-col w-full bg-background rounded-t-2xl overflow-hidden"
        style={{
          maxHeight: "85vh",
          zIndex: 1000,
          transform: swipeY > 0 ? `translateY(${swipeY}px)` : "translateY(0)",
          transition: swipeY > 0 ? "none" : "transform 0.3s ease-out",
          opacity: swipeY > 0 ? Math.max(0.3, 1 - swipeY / 400) : 1,
          willChange: "unset",
        }}
      >
        {/* Swipe handle */}
        <div className="flex justify-center pt-2.5 pb-1 cursor-grab">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/30 shrink-0 min-h-[52px]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <Paperclip className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Capture</h2>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Intelligence Capture</p>
            </div>
          </div>
          <button onClick={handleClose} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-secondary tactile-press">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
          {/* Type tabs */}
          <div className="flex gap-2">
            {types.map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => { if (!isRecording && !isTranscribing && !analyzing) { setCaptureType(key); if (key !== "image") clearImage(); setUrlError(null); setDuplicateInfo(null); } }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium transition-all ${
                  captureType === key
                    ? "bg-primary/15 text-primary border border-primary/25"
                    : "bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary border border-border/20"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          {captureType === "link" && (
            <div className="space-y-2">
              <Input
                placeholder="Paste a URL..."
                value={content}
                onChange={(e) => { setContent(e.target.value); setUrlError(null); setDuplicateInfo(null); }}
                className={`bg-secondary border-border/30 ${urlError ? "border-destructive" : ""}`}
              />
              {urlError && <p className="text-xs text-destructive">{urlError}</p>}
              {duplicateInfo && (
                <div className="flex items-center gap-2 rounded-lg bg-accent/10 border border-accent/20 px-3 py-2">
                  <p className="text-xs text-accent-foreground flex-1">
                    You already captured this URL on {duplicateInfo.date}.
                  </p>
                  <a href={content.trim()} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:text-primary/80 underline flex items-center gap-1 shrink-0">
                    <ExternalLink className="w-3 h-3" /> View original
                  </a>
                </div>
              )}
            </div>
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
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleImageSelect(file); }} />
              {!imagePreview ? (
                <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-border/40 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-colors">
                  <ImageIcon className="w-10 h-10 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">Click to upload or paste a screenshot</p>
                  <p className="text-[10px] text-muted-foreground mt-1">PNG, JPG up to 10MB</p>
                </div>
              ) : (
                <div className="relative">
                  <img src={imagePreview} alt="Preview" className="w-full max-h-48 object-contain rounded-xl bg-secondary" />
                  <button onClick={clearImage} className="absolute top-2 right-2 w-6 h-6 rounded-full bg-background/80 flex items-center justify-center hover:bg-background transition-colors">
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
                  {imageAnalysis.title && <p className="text-sm font-medium text-foreground">{imageAnalysis.title}</p>}
                  <p className="text-xs text-foreground whitespace-pre-line leading-relaxed" dir="auto">{imageAnalysis.summary}</p>
                  {imageAnalysis.skill_pillar && (
                    <span className="inline-block text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/15 text-primary mt-1">{imageAnalysis.skill_pillar}</span>
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
                      isRecording ? "bg-destructive animate-pulse" : "bg-primary gold-glow hover:scale-105"
                    }`}
                  >
                    {isRecording ? <Square className="w-7 h-7 text-destructive-foreground" /> : <Mic className="w-8 h-8 text-primary-foreground" />}
                  </button>
                  <p className="text-sm text-muted-foreground">{isRecording ? "Recording… tap to stop" : "Tap to record"}</p>
                </>
              )}
              {content && !isRecording && !isTranscribing && (
                <div className="w-full mt-2 space-y-3">
                  <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} dir="auto" className="bg-secondary border-border/30 resize-none text-sm" placeholder="Transcript will appear here…" />
                  {voiceAnalysis?.summary && (
                    <div className="bg-secondary/60 border border-border/20 rounded-xl p-4 space-y-2">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Senior Partner Analysis</p>
                      <p className="text-xs text-foreground whitespace-pre-line leading-relaxed" dir="auto">{voiceAnalysis.summary}</p>
                      {voiceAnalysis.skill_pillar && (
                        <span className="inline-block text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/15 text-primary mt-1">{voiceAnalysis.skill_pillar}</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {saving && (
            <div className="flex items-center justify-center gap-2 py-2">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Processing your capture…</span>
            </div>
          )}

          {captureType !== "document" && (
            <Button
              onClick={handleSave}
              disabled={saving || isRecording || isTranscribing || analyzing || (captureType === "image" ? !imageFile : !content.trim())}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 gold-glow"
            >
              {saving ? null : "Save Capture"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CaptureModal;
