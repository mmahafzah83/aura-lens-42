import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Link, Mic, Type, Loader2, Square, ImageIcon, X, FileUp, ExternalLink, Paperclip, Plus, Camera, FolderOpen, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
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
  const queryClient = useQueryClient();
  const [captureType, setCaptureType] = useState<CaptureType>("link");
  const [content, setContent] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionFailed, setTranscriptionFailed] = useState(false);
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

  // ── New UI-only state for v4 design ──
  const [selectedPillar, setSelectedPillar] = useState<string | null>(null);
  const [linkPreview, setLinkPreview] = useState<{ title: string; domain: string; snippet: string } | null>(null);
  const [signalMatch, setSignalMatch] = useState<{ title: string } | null>(null);
  const [recentDocs, setRecentDocs] = useState<Array<{
    id: string;
    filename: string;
    file_type: string;
    file_size: number | null;
    status: string;
    created_at: string;
  }>>([]);

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
        setTranscriptionFailed(false);
        try {
          const ext = mimeType.includes("webm") ? "webm" : "mp4";
          const { data: { session } } = await supabase.auth.getSession();
          const freshToken = session?.access_token;
          if (!freshToken) {
            setTranscriptionFailed(true);
            sonnerToast.error("Transcription failed — type your note instead");
            setIsTranscribing(false);
            return;
          }

          // Upload audio to storage for later reference
          if (session?.user?.id) {
            const audioPath = `${session.user.id}/${Date.now()}.${ext}`;
            const { error: upErr } = await supabase.storage.from("captures").upload(audioPath, blob);
            if (!upErr) {
              const { data: urlData } = supabase.storage.from("captures").getPublicUrl(audioPath);
              if (urlData?.publicUrl) setVoiceAudioUrl(urlData.publicUrl);
            }
          }

          // NOTE: supabase.functions.invoke does not properly forward FormData,
          // so we POST directly to the function URL with multipart body.
          const formData = new FormData();
          formData.append("audio", blob, `recording.${ext}`);

          const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe-voice`;
          const resp = await fetch(fnUrl, {
            method: "POST",
            headers: { Authorization: `Bearer ${freshToken}` },
            body: formData,
          });
          const fnData = await resp.json().catch(() => null);

          if (!resp.ok || !fnData?.transcript) {
            // 422 = expected "no speech detected" — log as warning, not error,
            // so the dev runtime-error overlay doesn't treat it as a crash.
            if (resp.status === 422) {
              console.warn("transcribe-voice: no speech detected", fnData);
            } else {
              console.error("transcribe-voice failed:", resp.status, fnData);
            }
            setTranscriptionFailed(true);
            const msg = resp.status === 422
              ? "No clear speech detected — type your note manually"
              : "Transcription failed — type your note instead";
            sonnerToast.error(msg);
            setTimeout(() => {
              const ta = document.querySelector<HTMLTextAreaElement>('textarea[placeholder="Transcript will appear here…"]');
              ta?.focus();
            }, 50);
          } else {
            setContent(fnData.transcript);
            if (fnData.audio_url) setVoiceAudioUrl(fnData.audio_url);
          }
        } catch (err) {
          console.error("transcribe-voice exception:", err);
          setTranscriptionFailed(true);
          sonnerToast.error("Transcription failed — type your note instead");
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

    // ─── Voice capture: direct entries INSERT (bypass ingest-capture so the
    // user's literal transcript is never rewritten by AI).
    if (captureType === "voice") {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          toast({ title: "Error", description: "Session expired. Please log in again.", variant: "destructive" });
          setSaving(false);
          return;
        }
        const finalText = content.trim();
        const title = "Voice note — " + new Date().toLocaleDateString();
        const { data: entryRow, error: entryError } = await supabase
          .from("entries")
          .insert({
            user_id: session.user.id,
            type: "voice",
            title,
            content: finalText,
            summary: finalText.slice(0, 200),
            ...(voiceAudioUrl && { image_url: voiceAudioUrl }),
          })
          .select("id")
          .single();

        if (entryError) {
          console.error("Voice entry insert failed:", entryError);
          toast({ title: "Save failed", description: entryError.message, variant: "destructive" });
          setSaving(false);
          return;
        }

        sonnerToast.success("Voice capture saved");

        setContent("");
        setVoiceAudioUrl(null);
        setTranscriptionFailed(false);
        onCaptured();
        onOpenChange(false);

        // Fire-and-forget signal detection
        if (entryRow?.id) {
          supabase.functions
            .invoke("detect-signals-v2", {
              body: { entry_id: entryRow.id, user_id: session.user.id },
            })
            .then(({ data: result, error }) => {
              if (error) {
                console.error("detect-signals-v2 (voice) error:", error);
                return;
              }
              if (result?.is_new) {
                sonnerToast("New signal detected from your voice note", {
                  position: "bottom-right",
                  duration: 3000,
                });
              }
              queryClient.invalidateQueries({ queryKey: ["strategic-signals"] });
              queryClient.invalidateQueries({ queryKey: ["signals"] });
            })
            .catch((err) => console.error("detect-signals-v2 (voice) exception:", err));
        }
      } catch (err: any) {
        toast({
          title: "Save failed",
          description: err?.message || "An unexpected error occurred.",
          variant: "destructive",
        });
      }
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

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast({ title: "Error", description: "Session expired. Please log in again.", variant: "destructive" });
        setSaving(false);
        return;
      }

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
      // For links, use the extracted article text from ingest-capture instead of the raw URL
      const entryContent = captureType === "link" && data?.extracted_content
        ? data.extracted_content
        : captureContent;
      const entryTitle = captureType === "link"
        ? (data?.extracted_title || (() => { try { return new URL(content.trim()).hostname; } catch { return content.trim().slice(0, 60); } })())
        : (captureContent || "").slice(0, 60) || "Untitled";

      const { data: entryRow, error: entryError } = await supabase.from("entries").insert({
        user_id: session.user.id,
        type: captureType,
        title: entryTitle,
        content: entryContent,
        summary: entryContent.slice(0, 300),
        ...(selectedPillar && { skill_pillar: selectedPillar }),
        ...(captureType === "link" && { image_url: data?.original_url || content.trim() }),
      }).select("id").single();

      if (entryError) {
        console.error("Failed to insert entry:", entryError.message, entryError);
      }

      // Capture link preview (UI only) so we can render the preview card
      if (captureType === "link" && (data?.extracted_title || data?.extracted_content)) {
        try {
          const u = new URL(data?.original_url || content.trim());
          setLinkPreview({
            title: data?.extracted_title || u.hostname,
            domain: u.hostname.replace(/^www\./, ""),
            snippet: (data?.extracted_content || "").slice(0, 160),
          });
        } catch {
          // ignore preview errors
        }
      }

      // Success
      toast({
        title: "Source saved",
        description: "Your source has been saved.",
      });

      setContent("");
      setVoiceAudioUrl(null);
      setTranscriptionFailed(false);
      setImagePreview(null);
      setImageAnalysis(null);
      setUrlError(null);
      setDuplicateInfo(null);
      onCaptured();
      onOpenChange(false);

      // Fire-and-forget: extract evidence then detect signals (unified pipeline)
      if (entryRow?.id) {
        supabase.functions.invoke('extract-evidence', {
          body: { source_type: 'entry', source_id: entryRow.id, user_id: session.user.id },
        })
          .then(({ data: extractResult, error: extractError }) => {
            if (extractError) {
              console.error("extract-evidence error:", extractError);
              return;
            }
            const registryId = extractResult?.source_registry_id;
            if (!registryId) return;

            // Now run signal detection on the new fragments
            return supabase.functions.invoke('detect-signals-v2', {
              body: { source_registry_id: registryId, user_id: session.user.id },
            });
          })
          .then((res) => {
            if (!res) return;
            const { data: result, error } = res;
            if (error) {
              console.error("detect-signals-v2 error:", error);
              return;
            }
            // Capture signal title for the UI banner
            const matchedTitle =
              result?.signal?.title ||
              result?.signal_title ||
              result?.matched_signal?.title ||
              null;
            if (matchedTitle) setSignalMatch({ title: matchedTitle });
            if (result?.is_new) {
              setTimeout(() => {
                sonnerToast("New pattern detected ✦", {
                  position: "bottom-right",
                  duration: 3000,
                  style: {
                    background: "#1a1400",
                    color: "#F97316",
                    border: "1px solid #F9731633",
                  },
                });
              }, 3000);
            }
            queryClient.invalidateQueries({ queryKey: ["strategic-signals"] });
            queryClient.invalidateQueries({ queryKey: ["signals"] });
          })
          .catch((err) => console.error("pipeline background error:", err));
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
                onBlur={async (e) => {
                  const url = e.target.value.trim();
                  if (!url || !isValidUrl(url)) return;
                  const { data: { user } } = await supabase.auth.getUser();
                  if (!user) return;
                  const { data: dup } = await supabase
                    .from("entries")
                    .select("id, created_at")
                    .eq("user_id", user.id)
                    .eq("type", "link")
                    .eq("image_url", url)
                    .limit(1)
                    .maybeSingle();
                  if (dup) {
                    setDuplicateInfo({
                      id: dup.id,
                      date: new Date(dup.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
                    });
                  }
                }}
                className={`bg-secondary border-border/30 ${urlError ? "border-destructive" : ""}`}
              />
              {urlError && <p className="text-xs text-destructive">{urlError}</p>}
              {duplicateInfo && (
                <div
                  style={{
                    background: "rgba(239, 159, 39, 0.1)",
                    border: "0.5px solid rgba(239, 159, 39, 0.4)",
                    borderRadius: 6,
                    padding: "8px 12px",
                    marginTop: 6,
                  }}
                >
                  <p className="text-foreground" style={{ fontSize: 12, fontWeight: 400, margin: 0 }}>
                    You already captured this source on {duplicateInfo.date}.
                  </p>
                  <div style={{ marginTop: 6 }}>
                    <button
                      type="button"
                      onClick={() => { setDuplicateInfo(null); handleSave(); }}
                      style={{ fontSize: 11, color: "#EF9F27", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
                    >
                      Capture anyway
                    </button>
                    <button
                      type="button"
                      onClick={() => { setContent(""); setDuplicateInfo(null); }}
                      className="text-muted-foreground"
                      style={{ fontSize: 11, background: "transparent", border: "none", marginLeft: 12, cursor: "pointer", padding: 0 }}
                    >
                      Skip
                    </button>
                  </div>
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
                  <p className="text-sm text-muted-foreground">Transcribing…</p>
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
              {!isRecording && !isTranscribing && (
                <div className="w-full mt-2 space-y-2">
                  {transcriptionFailed && (
                    <p className="text-xs text-foreground">Auto-transcription unavailable. Type your notes manually.</p>
                  )}
                  <p className="text-xs text-muted-foreground">Transcript</p>
                  <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} dir="auto" className="bg-secondary border-border/30 resize-none text-sm" placeholder="Transcript will appear here…" />
                </div>
              )}
            </div>
          )}

          {saving && (
            <div className="flex items-center justify-center gap-2 py-2">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span className="text-sm text-foreground">Processing your capture…</span>
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
