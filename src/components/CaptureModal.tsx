import { useState, useRef, useEffect } from "react";
import { Link, Mic, Type, Loader2, Square, ImageIcon, X, FileUp, Plus, Camera, FolderOpen, FileText } from "lucide-react";
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

  // Recording elapsed seconds (UI only)
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recordingTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (isRecording) {
      setRecordingSeconds(0);
      const startedAt = Date.now();
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds(Math.floor((Date.now() - startedAt) / 1000));
      }, 250);
    } else if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    return () => {
      if (recordingTimerRef.current) {
        window.clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    };
  }, [isRecording]);

  // Load recent processed documents when the doc tab opens.
  useEffect(() => {
    if (!open || captureType !== "document") return;
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("documents")
        .select("id, filename, file_type, file_size, status, created_at")
        .eq("user_id", user.id)
        .eq("status", "processed")
        .order("created_at", { ascending: false })
        .limit(3);
      if (!cancelled && data) setRecentDocs(data as any);
    })();
    return () => { cancelled = true; };
  }, [open, captureType]);

  // Reset transient UI on modal close
  useEffect(() => {
    if (open) return;
    setLinkPreview(null);
    setSignalMatch(null);
  }, [open]);

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
                    background: "var(--surface-ink-subtle)",
                    color: "var(--brand)",
                    border: "1px solid var(--brand-muted)",
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

  // Skill pillar chip fallbacks (per spec)
  const PILLAR_CHIPS = [
    "Digital Transformation",
    "IT/OT",
    "Water Utilities",
    "AI/ML",
    "Vision 2030",
  ];

  const fmtBytes = (b: number | null) => {
    if (!b || b <= 0) return "—";
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
    return `${(b / 1024 / 1024).toFixed(1)} MB`;
  };
  const fmtMMSS = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const r = (s % 60).toString().padStart(2, "0");
    return `${m}:${r}`;
  };

  return (
    <div className="fixed inset-0 z-[10000] flex flex-col items-center justify-end" style={{ willChange: "unset" }}>
      {/* Blurred backdrop */}
      <div
        className="fixed inset-0 capture-backdrop"
        style={{ zIndex: 999, pointerEvents: "all" }}
        onClick={handleClose}
      />

      {/* Bottom Sheet */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onPaste={handlePaste}
        className="relative flex flex-col w-full overflow-hidden capture-sheet-anim"
        style={{
          maxHeight: "88vh",
          zIndex: 1000,
          background: "#FFFFFF",
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          color: "var(--ink)",
          transform: swipeY > 0 ? `translateY(${swipeY}px)` : undefined,
          transition: swipeY > 0 ? "none" : "transform 0.3s ease-out",
          opacity: swipeY > 0 ? Math.max(0.3, 1 - swipeY / 400) : 1,
          boxShadow: "0 -8px 40px rgba(0,0,0,0.18)",
        }}
      >
        {/* Sheet handle */}
        <div className="flex justify-center cursor-grab">
          <div style={{ width: 40, height: 4, background: "var(--border)", borderRadius: 2, margin: "10px auto 0" }} />
        </div>

        {/* Header */}
        <div
          className="flex items-center justify-between"
          style={{ padding: "14px 20px 10px" }}
        >
          <div className="flex items-center" style={{ gap: 12 }}>
            <div
              className="flex items-center justify-center shrink-0"
              style={{ width: 36, height: 36, background: "var(--brand)", borderRadius: 11 }}
            >
              <Plus className="w-5 h-5" style={{ color: "#FFFFFF" }} strokeWidth={2.5} />
            </div>
            <div>
              <h2
                style={{
                  fontFamily: "'DM Serif Display', Georgia, serif",
                  fontSize: 18,
                  color: "var(--ink)",
                  margin: 0,
                  lineHeight: 1.1,
                }}
              >
                Capture
              </h2>
              <p
                style={{
                  fontSize: 9,
                  color: "var(--ink-4)",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  fontWeight: 600,
                  margin: "2px 0 0",
                }}
              >
                Intelligence capture
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="flex items-center justify-center tactile-press"
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "var(--surface-subtle)",
              color: "var(--ink-5)",
              border: "none",
            }}
            aria-label="Close capture"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto" style={{ padding: "12px 20px 20px", display: "flex", flexDirection: "column", gap: 16, minHeight: 0 }}>
          {/* Pill tabs */}
          <div className="flex flex-wrap" style={{ gap: 8 }}>
            {types.map(({ key, icon: Icon, label }) => {
              const active = captureType === key;
              const disabled = isRecording || isTranscribing || analyzing;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    if (disabled) return;
                    setCaptureType(key);
                    if (key !== "image") clearImage();
                    setUrlError(null);
                    setDuplicateInfo(null);
                    setLinkPreview(null);
                    setSignalMatch(null);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "8px 14px",
                    borderRadius: 10,
                    fontSize: 12,
                    fontWeight: 500,
                    border: active ? "0.5px solid var(--ink)" : "0.5px solid var(--border-subtle)",
                    background: active ? "var(--ink)" : "transparent",
                    color: active ? "#FFFFFF" : "var(--ink-4)",
                    opacity: disabled ? 0.5 : 1,
                    cursor: disabled ? "not-allowed" : "pointer",
                    transition: "all 150ms ease",
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      background: active ? "rgba(255,255,255,0.15)" : "var(--surface-subtle)",
                    }}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  {label}
                </button>
              );
            })}
          </div>

          {/* ── LINK ── */}
          {captureType === "link" && (
            <div className="space-y-3">
              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  placeholder="Paste a URL..."
                  value={content}
                  onChange={(e) => { setContent(e.target.value); setUrlError(null); setDuplicateInfo(null); }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "var(--brand)";
                    e.currentTarget.style.background = "#FFFFFF";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(249,115,22,0.10)";
                  }}
                  onBlur={async (e) => {
                    e.currentTarget.style.borderColor = urlError ? "var(--danger)" : "var(--border)";
                    e.currentTarget.style.background = "var(--surface-subtle)";
                    e.currentTarget.style.boxShadow = "none";
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
                  style={{
                    width: "100%",
                    background: "var(--surface-subtle)",
                    border: urlError ? "0.5px solid var(--danger)" : "0.5px solid var(--border)",
                    borderRadius: 12,
                    padding: "13px 76px 13px 16px",
                    fontSize: 13,
                    color: "var(--ink)",
                    outline: "none",
                    transition: "all 150ms ease",
                  }}
                />
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const text = await navigator.clipboard.readText();
                      if (text) { setContent(text.trim()); setUrlError(null); setDuplicateInfo(null); }
                    } catch {
                      sonnerToast.error("Clipboard not available");
                    }
                  }}
                  style={{
                    position: "absolute",
                    right: 8,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "var(--brand-pale)",
                    color: "var(--brand)",
                    borderRadius: 7,
                    fontSize: 10,
                    fontWeight: 600,
                    padding: "5px 10px",
                    border: "none",
                    cursor: "pointer",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Paste
                </button>
              </div>

              {urlError && <p style={{ fontSize: 12, color: "var(--danger)", margin: 0 }}>{urlError}</p>}

              {linkPreview && (
                <div
                  style={{
                    background: "#FFFFFF",
                    border: "0.5px solid var(--border-subtle)",
                    borderRadius: 12,
                    padding: "12px 14px",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                  }}
                >
                  <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-4)" }}>
                    {linkPreview.domain}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)", marginTop: 4, lineHeight: 1.35 }}>
                    {linkPreview.title}
                  </div>
                  {linkPreview.snippet && (
                    <div style={{ fontSize: 11, color: "var(--ink-5)", marginTop: 6, lineHeight: 1.5 }}>
                      {linkPreview.snippet}…
                    </div>
                  )}
                </div>
              )}

              {signalMatch && (
                <div
                  style={{
                    background: "var(--brand-pale)",
                    borderRadius: 10,
                    padding: "11px 14px",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <span className="capture-pulse-dot" />
                  <span style={{ fontSize: 12, color: "var(--warning)", lineHeight: 1.45 }}>
                    Aura detected this strengthens your signal <strong>{signalMatch.title}</strong> — adding will reinforce it.
                  </span>
                </div>
              )}

              {duplicateInfo && (
                <div
                  style={{
                    background: "rgba(239, 159, 39, 0.1)",
                    border: "0.5px solid rgba(239, 159, 39, 0.4)",
                    borderRadius: 10,
                    padding: "10px 14px",
                  }}
                >
                  <p style={{ fontSize: 12, color: "var(--ink)", margin: 0 }}>
                    You already captured this source on {duplicateInfo.date}.
                  </p>
                  <div style={{ marginTop: 6 }}>
                    <button type="button" onClick={() => { setDuplicateInfo(null); handleSave(); }} style={{ fontSize: 11, color: "var(--warning)", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
                      Capture anyway
                    </button>
                    <button type="button" onClick={() => { setContent(""); setDuplicateInfo(null); }} style={{ fontSize: 11, color: "var(--ink-5)", background: "transparent", border: "none", marginLeft: 12, cursor: "pointer", padding: 0 }}>
                      Skip
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── TEXT ── */}
          {captureType === "text" && (
            <div className="space-y-3">
              <div className="flex flex-wrap" style={{ gap: 6 }}>
                {PILLAR_CHIPS.map((p) => {
                  const active = selectedPillar === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setSelectedPillar(active ? null : p)}
                      style={{
                        fontSize: 11,
                        padding: "5px 12px",
                        borderRadius: 20,
                        background: active ? "var(--ink)" : "var(--surface-subtle)",
                        border: active ? "0.5px solid var(--ink)" : "0.5px solid var(--border-subtle)",
                        color: active ? "#FFFFFF" : "var(--ink-3)",
                        cursor: "pointer",
                        transition: "all 150ms ease",
                      }}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
              <textarea
                placeholder="Write your thoughts..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                dir="auto"
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "var(--brand)";
                  e.currentTarget.style.background = "#FFFFFF";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(249,115,22,0.10)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "var(--border)";
                  e.currentTarget.style.background = "var(--surface-subtle)";
                  e.currentTarget.style.boxShadow = "none";
                }}
                style={{
                  width: "100%",
                  background: "var(--surface-subtle)",
                  border: "0.5px solid var(--border)",
                  borderRadius: 12,
                  padding: "14px 16px",
                  fontSize: 13,
                  color: "var(--ink)",
                  height: 100,
                  resize: "none",
                  outline: "none",
                  transition: "all 150ms ease",
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                }}
              />
            </div>
          )}

          {/* ── IMAGE ── */}
          {captureType === "image" && (
            <div className="space-y-3">
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleImageSelect(file); }} />
              {!imagePreview ? (
                <>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--brand)";
                      e.currentTarget.style.background = "var(--brand-pale)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--border-strong)";
                      e.currentTarget.style.background = "var(--surface-subtle)";
                    }}
                    style={{
                      background: "var(--surface-subtle)",
                      border: "1.5px dashed var(--border-strong)",
                      borderRadius: 14,
                      padding: 32,
                      textAlign: "center",
                      cursor: "pointer",
                      transition: "all 150ms ease",
                    }}
                  >
                    <ImageIcon className="w-9 h-9 mx-auto mb-3" style={{ color: "var(--ink-5)" }} />
                    <p style={{ fontSize: 13, color: "var(--ink-3)", margin: 0 }}>Drop an image or click to upload</p>
                    <p style={{ fontSize: 10, color: "var(--ink-5)", marginTop: 4 }}>PNG, JPG up to 10MB</p>
                  </div>
                  <div className="grid grid-cols-2" style={{ gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        border: "0.5px solid var(--border)",
                        borderRadius: 10,
                        padding: "8px 16px",
                        fontSize: 12,
                        background: "#FFFFFF",
                        color: "var(--ink)",
                        cursor: "pointer",
                      }}
                    >
                      <Camera className="w-3.5 h-3.5" /> From camera
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        border: "0.5px solid var(--border)",
                        borderRadius: 10,
                        padding: "8px 16px",
                        fontSize: 12,
                        background: "#FFFFFF",
                        color: "var(--ink)",
                        cursor: "pointer",
                      }}
                    >
                      <FolderOpen className="w-3.5 h-3.5" /> From files
                    </button>
                  </div>
                </>
              ) : (
                <div className="relative">
                  <img src={imagePreview} alt="Preview" style={{ width: "100%", maxHeight: 200, objectFit: "contain", borderRadius: 12, background: "var(--surface-subtle)" }} />
                  <button onClick={clearImage} className="absolute" style={{ top: 8, right: 8, width: 26, height: 26, borderRadius: "50%", background: "rgba(255,255,255,0.9)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                    <X className="w-3.5 h-3.5" style={{ color: "var(--ink)" }} />
                  </button>
                </div>
              )}
              {analyzing && (
                <div className="flex items-center" style={{ gap: 8, fontSize: 13, color: "var(--ink-5)" }}>
                  <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--brand)" }} />
                  AI is reading your screenshot…
                </div>
              )}
            </div>
          )}

          {/* ── DOCUMENT ── */}
          {captureType === "document" && (
            <div className="space-y-3">
              {recentDocs.length > 0 && (
                <div className="space-y-2">
                  <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-4)" }}>
                    Recent documents
                  </div>
                  <div className="space-y-1.5">
                    {recentDocs.map((d) => {
                      const ext = (d.filename || "").split(".").pop()?.toLowerCase() || "";
                      const isPdf = ext === "pdf";
                      const iconBg = isPdf ? "var(--danger)" : "var(--color-indigo)";
                      const isProcessed = d.status === "processed";
                      return (
                        <div
                          key={d.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            padding: "10px 12px",
                            background: "#FFFFFF",
                            border: "0.5px solid var(--border-subtle)",
                            borderRadius: 12,
                          }}
                        >
                          <div
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: 9,
                              background: iconBg,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            <FileText className="w-4 h-4" style={{ color: "#FFFFFF" }} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {d.filename}
                            </div>
                            <div style={{ fontSize: 10, color: "var(--ink-5)", marginTop: 2 }}>
                              {fmtBytes(d.file_size)} · {new Date(d.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </div>
                          </div>
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 600,
                              letterSpacing: "0.06em",
                              textTransform: "uppercase",
                              padding: "3px 8px",
                              borderRadius: 6,
                              background: isProcessed ? "var(--success-pale)" : "var(--warning-pale)",
                              color: isProcessed ? "var(--success)" : "var(--warning)",
                            }}
                          >
                            {isProcessed ? "Processed" : "Processing"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <DocumentUpload onUploaded={() => { onCaptured(); onOpenChange(false); }} />
            </div>
          )}

          {/* ── VOICE ── */}
          {captureType === "voice" && (
            <div className="flex flex-col items-center" style={{ gap: 14, padding: "8px 0 4px" }}>
              {isTranscribing ? (
                <>
                  <div
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: "50%",
                      background: "var(--surface-subtle)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Loader2 className="w-7 h-7 animate-spin" style={{ color: "var(--brand)" }} />
                  </div>
                  <p style={{ fontSize: 13, color: "var(--ink-5)", margin: 0 }}>Transcribing…</p>
                </>
              ) : (
                <>
                  {isRecording && (
                    <div className="flex items-end justify-center" style={{ gap: 4, height: 36 }}>
                      {Array.from({ length: 12 }).map((_, i) => (
                        <span
                          key={i}
                          className="capture-wave-bar"
                          style={{ animationDelay: `${(i % 6) * 80}ms` }}
                        />
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={isRecording ? stopRecording : startRecording}
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: "50%",
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: isRecording ? "var(--danger)" : "var(--brand)",
                      boxShadow: isRecording
                        ? "0 4px 20px rgba(184,48,37,0.4)"
                        : "0 4px 20px rgba(249,115,22,0.4)",
                      transition: "background 200ms ease",
                    }}
                    aria-label={isRecording ? "Stop recording" : "Start recording"}
                  >
                    {isRecording ? (
                      <Square className="w-6 h-6" style={{ color: "#FFFFFF" }} fill="#FFFFFF" />
                    ) : (
                      <Mic className="w-7 h-7" style={{ color: "#FFFFFF" }} />
                    )}
                  </button>
                  <div
                    style={{
                      fontFamily: "'DM Serif Display', Georgia, serif",
                      fontSize: 22,
                      color: "var(--brand)",
                      letterSpacing: "-0.02em",
                      lineHeight: 1,
                    }}
                  >
                    {fmtMMSS(recordingSeconds)}
                  </div>
                  {!isRecording && (
                    <p style={{ fontSize: 12, color: "var(--ink-5)", margin: 0 }}>Tap to record</p>
                  )}
                </>
              )}
              {!isRecording && !isTranscribing && (
                <div className="w-full" style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                  {transcriptionFailed && (
                    <p style={{ fontSize: 12, color: "var(--ink)", margin: 0 }}>
                      Auto-transcription unavailable. Type your notes manually.
                    </p>
                  )}
                  <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-4)", margin: 0 }}>
                    Transcript
                  </p>
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    dir="auto"
                    rows={3}
                    placeholder="Transcript will appear here…"
                    style={{
                      width: "100%",
                      background: "var(--surface-subtle)",
                      border: "0.5px solid var(--border)",
                      borderRadius: 12,
                      padding: "12px 14px",
                      fontSize: 13,
                      color: "var(--ink)",
                      resize: "none",
                      outline: "none",
                      fontFamily: "'DM Sans', system-ui, sans-serif",
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Save button (not for document tab — it has its own upload handler) */}
          {captureType !== "document" && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || isRecording || isTranscribing || analyzing || (captureType === "image" ? !imageFile : !content.trim())}
              onMouseEnter={(e) => {
                if (!e.currentTarget.disabled) e.currentTarget.style.background = "var(--brand-hover)";
              }}
              onMouseLeave={(e) => {
                if (!e.currentTarget.disabled) e.currentTarget.style.background = "var(--brand)";
              }}
              style={{
                width: "100%",
                background: "var(--brand)",
                color: "#FFFFFF",
                border: "none",
                borderRadius: 12,
                padding: 14,
                fontFamily: "'DM Sans', system-ui, sans-serif",
                fontSize: 14,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                cursor: "pointer",
                opacity: (saving || isRecording || isTranscribing || analyzing || (captureType === "image" ? !imageFile : !content.trim())) ? 0.55 : 1,
                transition: "background 150ms ease, opacity 150ms ease",
              }}
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save capture"
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CaptureModal;
