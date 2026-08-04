import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Link, Mic, Type, Loader2, Square, ImageIcon, X, FileUp, Plus, Camera, FolderOpen, FileText, Sparkles, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import DocumentUpload from "@/components/DocumentUpload";
import { bumpCaptureAndCheckDrift } from "@/lib/identityDriftCheck";
import { TOAST, ERROR } from "@/constants/language";
import { useCelebrationsEnabled } from "@/hooks/useCelebrationsEnabled";
import { track } from "@/lib/track";

const trackCaptureCompleted = (capture_type: string, source: string) =>
  void track("capture_completed", { capture_type, source });

type CaptureType = "link" | "voice" | "text" | "image" | "document";

interface CaptureModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCaptured: () => void;
  onDuplicate?: () => void;
  onOpenChat?: (prefill: string) => void;
  prefillUrl?: string;
  prefillText?: string;
  /** Opens the modal on a specific mode. Defaults to the existing behaviour. */
  initialType?: CaptureType;
}

const isValidUrl = (s: string) => {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};

/* ── System-B "Signal" palette, capture surface only ── */
const SB = {
  canvas: "#F2F5F9",
  card: "#FFFFFF",
  border: "#E2E7EE",
  ink: "#0F1519",
  ink2: "#5B6673",
  blue: "#0670C4",
  blueHover: "#04477C",
  blueTint: "#EAF3FB",
  cyan: "#00CEC9",
  cyanText: "#00807B",
  amber: "#E0A82E",
  success: "#12805C",
  error: "#C0392B",
} as const;

/** Scoped styles: focus-visible, 44px targets, reduced-motion, queue bar. */
const CAPTURE_CSS = `
[data-capture-surface] :is(button, input, textarea, [tabindex]):focus-visible {
  outline: 2px solid ${SB.blue};
  outline-offset: 2px;
  border-radius: 8px;
}
[data-capture-surface] .cap-tap { min-height: 44px; min-width: 44px; }
[data-capture-surface] .cap-dropzone { transition: border-color 150ms ease, background 150ms ease; }
[data-capture-surface] .cap-queue-bar {
  height: 4px; border-radius: 999px; background: ${SB.border}; overflow: hidden;
}
[data-capture-surface] .cap-queue-bar > i {
  display: block; height: 100%; border-radius: 999px; background: ${SB.cyan};
  width: 40%; animation: cap-indet 1.1s ease-in-out infinite;
}
[data-capture-surface] .cap-queue-bar.is-done > i {
  width: 100%; background: ${SB.success}; animation: none;
}
@keyframes cap-indet { 0% { margin-inline-start: -40%; } 100% { margin-inline-start: 100%; } }
@media (prefers-reduced-motion: reduce) {
  [data-capture-surface] .cap-queue-bar > i { animation: none; width: 100%; }
  [data-capture-surface] .animate-spin { animation: none; }
  [data-capture-surface] .capture-wave-bar { animation: none; transform: scaleY(0.7); }
  [data-capture-surface] .capture-pulse-dot { animation: none; }
}
`;

type QueuedImage = { id: string; file: File; preview: string; status: "queued" | "saving" | "done" | "error" };
type BaselineSnapshot = { signals: Record<string, number>; imprint: number | null };
type CaptureResult = {
  since: string;
  userId: string;
  title: string;
  baseline: BaselineSnapshot;
};

const snapshotBaseline = async (userId: string): Promise<BaselineSnapshot> => {
  const out: BaselineSnapshot = { signals: {}, imprint: null };
  try {
    const [{ data: sigs }, { data: imp }] = await Promise.all([
      supabase.from("strategic_signals").select("id, strength_score").eq("user_id", userId),
      supabase.from("imprint_snapshots").select("imprint").eq("user_id", userId)
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    (sigs || []).forEach((s: any) => { out.signals[s.id] = Number(s.strength_score) || 0; });
    if (imp && typeof (imp as any).imprint === "number") out.imprint = (imp as any).imprint;
  } catch { /* baseline is best-effort */ }
  return out;
};

/**
 * Honest result card. Shows nothing until the pipeline has actually produced
 * data: evidence first, and the signal state ONLY when a real strength delta
 * exists for one of this member's own signals.
 */
const CaptureResultCard = ({ result, onClose }: { result: CaptureResult; onClose: () => void }) => {
  const [fragments, setFragments] = useState<number>(0);
  const [themes, setThemes] = useState<string[]>([]);
  const [signal, setSignal] = useState<{ id: string; title: string; delta: number; rank: number } | null>(null);
  const [imprint, setImprint] = useState<{ from: number; to: number } | null>(null);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (stop) return;
      try {
        const { data: frags } = await supabase
          .from("evidence_fragments")
          .select("id, skill_pillars, tags")
          .eq("user_id", result.userId)
          .gte("created_at", result.since);
        if (frags && frags.length) {
          setFragments(frags.length);
          const chips = new Set<string>();
          frags.forEach((f: any) => {
            (f.skill_pillars || []).forEach((p: string) => chips.add(p));
            (f.tags || []).slice(0, 2).forEach((t: string) => chips.add(t));
          });
          setThemes(Array.from(chips).slice(0, 4));
        }

        const { data: sigs } = await supabase
          .from("strategic_signals")
          .select("id, signal_title, strength_score")
          .eq("user_id", result.userId)
          .order("strength_score", { ascending: false });
        if (sigs) {
          for (let i = 0; i < sigs.length; i++) {
            const s: any = sigs[i];
            const before = result.baseline.signals[s.id];
            const now = Number(s.strength_score) || 0;
            if (before === undefined || now > before) {
              const delta = before === undefined ? now : now - before;
              if (delta > 0) {
                setSignal({ id: s.id, title: s.signal_title, delta: Math.round(delta), rank: i + 1 });
                break;
              }
            }
          }
        }

        if (result.baseline.imprint !== null) {
          const { data: imp } = await supabase
            .from("imprint_snapshots").select("imprint").eq("user_id", result.userId)
            .order("created_at", { ascending: false }).limit(1).maybeSingle();
          const now = (imp as any)?.imprint;
          if (typeof now === "number" && now !== result.baseline.imprint) {
            setImprint({ from: result.baseline.imprint, to: now });
          }
        }
      } catch { /* keep waiting */ }
    };
    void tick();
    const iv = window.setInterval(tick, 5000);
    const to = window.setTimeout(() => window.clearInterval(iv), 180000);
    return () => { stop = true; window.clearInterval(iv); window.clearTimeout(to); };
  }, [result]);

  const go = (tab: string) => {
    onClose();
    window.dispatchEvent(new CustomEvent("aura:switch-tab", { detail: { tab } }));
  };

  return (
    <div
      style={{
        background: SB.card, border: `1px solid ${SB.border}`, borderRadius: 20,
        padding: 18, display: "flex", flexDirection: "column", gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Sparkles size={16} style={{ color: signal ? SB.blue : SB.cyanText }} />
        <div style={{ fontSize: 14, fontWeight: 600, color: SB.ink }}>{result.title}</div>
      </div>

      {fragments === 0 && !signal ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="capture-pulse-dot" />
          <span style={{ fontSize: 13, color: SB.ink2 }}>Aura is reading it. This card fills in as it finishes.</span>
        </div>
      ) : (
        <>
          {fragments > 0 && (
            <div style={{ fontFamily: "var(--ff-mono)", fontSize: 12, color: SB.ink2, letterSpacing: "0.04em" }}>
              {fragments} {fragments === 1 ? "piece" : "pieces"} of evidence extracted
            </div>
          )}
          {themes.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {themes.map((t) => (
                <span key={t} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 4, background: SB.canvas, color: SB.ink2, border: `1px solid ${SB.border}` }}>{t}</span>
              ))}
            </div>
          )}
          {signal && (
            <div style={{ borderTop: `1px solid ${SB.border}`, paddingTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontFamily: "var(--ff-mono)", fontSize: 13, color: SB.ink, fontWeight: 600 }}>
                +{signal.delta} strength · now #{signal.rank} on your radar
              </div>
              <div style={{ fontSize: 13, color: SB.ink2 }}>{signal.title}</div>
              {imprint && (
                <div style={{ fontFamily: "var(--ff-mono)", fontSize: 12, color: SB.ink2 }}>
                  Imprint {imprint.from} → {imprint.to}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 2 }}>
        <button
          type="button"
          className="cap-tap"
          onClick={() => go(signal ? "intelligence" : "intelligence")}
          style={{
            background: SB.blue, color: "#FFFFFF", border: 0, borderRadius: 8,
            padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer",
            display: "inline-flex", alignItems: "center", gap: 6,
          }}
        >
          {signal ? "Open the signal" : "Open your library"} <ArrowRight size={14} />
        </button>
        <button
          type="button"
          className="cap-tap"
          onClick={onClose}
          style={{ background: "transparent", border: 0, color: SB.ink2, fontSize: 13, cursor: "pointer", padding: "10px 8px" }}
        >
          Capture something else
        </button>
      </div>
    </div>
  );
};

const CaptureModal = ({ open, onOpenChange, onCaptured, onDuplicate, onOpenChat, prefillUrl, prefillText, initialType }: CaptureModalProps) => {
  const queryClient = useQueryClient();
  const { enabled: celebrationsEnabled } = useCelebrationsEnabled();
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
  const [imageQueue, setImageQueue] = useState<QueuedImage[]>([]);
  const [imageDragActive, setImageDragActive] = useState(false);
  const [captureResult, setCaptureResult] = useState<CaptureResult | null>(null);

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

  // First-capture ceremony overlay (lives outside the bottom sheet so it can
  // appear after the sheet closes). The modal's `!open` guard does not hide it.
  const [firstCeremonyOpen, setFirstCeremonyOpen] = useState(false);
  const [firstCeremonyShowCta, setFirstCeremonyShowCta] = useState(false);

  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textNoteRef = useRef<HTMLTextAreaElement>(null);
  const transcriptRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Shared first-capture ceremony trigger. Counts entries + documents so the
  // ceremony fires on the user's first capture of ANY type (link/text/image/
  // voice/document). Guarded by a single localStorage flag.
  const maybeTriggerFirstCeremony = async (userId: string): Promise<boolean> => {
    if (!celebrationsEnabled) return false;
    try {
      if (localStorage.getItem("aura_first_capture_celebrated")) return false;
      const [entriesRes, docsRes] = await Promise.all([
        supabase
          .from("entries")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
        supabase
          .from("documents")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
      ]);
      const total = (entriesRes.count ?? 0) + (docsRes.count ?? 0);
      if (total === 1) {
        localStorage.setItem("aura_first_capture_celebrated", "true");
        setFirstCeremonyOpen(true);
        setFirstCeremonyShowCta(false);
        window.setTimeout(() => setFirstCeremonyShowCta(true), 2000);
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  };

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
    setCaptureResult(null);
    setImageQueue([]);
  }, [open]);

  // a11y: Esc closes (surface-only a11y baseline; does not change capture flow).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isRecording) stopRecording();
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, isRecording, onOpenChange]);

  // Apply prefill from external openers (e.g. Market Scan cards)
  useEffect(() => {
    if (!open) return;
    if (prefillUrl) {
      setCaptureType("link");
      setContent(prefillUrl);
    } else if (prefillText) {
      setCaptureType("text");
      setContent(prefillText);
      // Auto-resize textarea to fit pre-filled content
      let tries = 0;
      const fit = () => {
        const ta = textNoteRef.current;
        if (ta) {
          ta.style.height = "auto";
          ta.style.height = ta.scrollHeight + "px";
          return;
        }
        if (tries++ < 40) requestAnimationFrame(fit);
      };
      requestAnimationFrame(fit);
    } else if (initialType) {
      setCaptureType(initialType);
    }
  }, [open, prefillUrl, prefillText, initialType]);

  const handleImageSelect = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please upload an image.", variant: "destructive" });
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "Too large", description: "Image must be under 20MB.", variant: "destructive" });
      return;
    }

    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);

    setAnalyzing(true);
    toast({ title: "Looking", description: "Aura is reading your screenshot…" });

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
    setImageQueue([]);
  };

  /** Accepts one or many images: the first becomes the analysed primary,
   *  the rest queue up and are ingested after it, each with its own row. */
  const handleImagesSelect = async (files: File[]) => {
    const valid: File[] = [];
    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        toast({ title: "Unsupported file", description: "Please upload an image.", variant: "destructive" });
        continue;
      }
      if (file.size > 20 * 1024 * 1024) {
        toast({ title: "Too large", description: "Image must be under 20MB.", variant: "destructive" });
        continue;
      }
      valid.push(file);
    }
    if (!valid.length) return;
    const rows: QueuedImage[] = valid.map((f, i) => ({
      id: `${Date.now()}-${i}-${f.name}`,
      file: f,
      preview: URL.createObjectURL(f),
      status: "queued",
    }));
    const takePrimary = !imageFile;
    setImageQueue((q) => [...q, ...rows]);
    if (takePrimary) await handleImageSelect(rows[0].file);
  };

  const removeQueuedImage = (id: string) => {
    setImageQueue((q) => {
      const row = q.find((r) => r.id === id);
      const next = q.filter((r) => r.id !== id);
      if (row && row.file === imageFile) {
        setImageFile(null);
        setImagePreview(null);
        setImageAnalysis(null);
        setContent("");
        if (next.length) void handleImageSelect(next[0].file);
      }
      return next;
    });
  };

  /** Uploads + ingests a single extra image (queue items after the primary). */
  const uploadAndIngestImage = async (file: File, userId: string, accessToken: string) => {
    const filePath = `${userId}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("capture-images").upload(filePath, file);
    if (upErr) throw new Error(upErr.message);
    const { data: urlData } = supabase.storage.from("capture-images").getPublicUrl(filePath);
    const image_url = urlData.publicUrl;
    const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ingest-capture`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ type: "image", content: file.name, metadata: { image_url }, source_url: image_url }),
    });
    if (!resp.ok) throw new Error(`Server error (${resp.status})`);
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
              transcriptRef.current?.focus();
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
        // Entries-level dedupe guard (mirrors ingest-capture entries guard).
        const dedupeKey = finalText.replace(/\s+/g, " ");
        if (dedupeKey) {
          const { data: existingEntries } = await supabase
            .from("entries")
            .select("id, created_at")
            .eq("user_id", session.user.id)
            .eq("content", dedupeKey)
            .limit(1);
          if (existingEntries && existingEntries.length > 0) {
            setDuplicateInfo({
              id: existingEntries[0].id,
              date: new Date(existingEntries[0].created_at).toLocaleDateString(),
            });
            onDuplicate?.();
            setSaving(false);
            return;
          }
        }
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

        // Beat 1 — honest, no fabricated progress
        try { sessionStorage.setItem("aura_pending_capture_at", String(Date.now())); } catch { /* noop */ }
        sonnerToast("Saved. Aura is reading it — this usually takes a few minutes.");

        const voiceSince = new Date(Date.now() - 5000).toISOString();
        const voiceBaseline = await snapshotBaseline(session.user.id);
        setCaptureResult({ since: voiceSince, userId: session.user.id, title, baseline: voiceBaseline });

        setContent("");
        setVoiceAudioUrl(null);
        setTranscriptionFailed(false);
        onCaptured();
        window.dispatchEvent(new Event("capture-complete"));
        trackCaptureCompleted(captureType, "modal");
        void maybeTriggerFirstCeremony(session.user.id);

        // M3-4 identity drift check (frontend only, fire-and-forget)
        bumpCaptureAndCheckDrift(session.user.id);

        // Fire-and-forget signal detection
        if (entryRow?.id) {
          supabase.functions
            .invoke("extract-evidence", {
              body: { source_type: "entry", source_id: entryRow.id, user_id: session.user.id },
            })
            .then(({ error }) => {
              if (error) {
                console.error("[voice] extract-evidence error:", error);
                return;
              }
              queryClient.invalidateQueries({ queryKey: ["strategic-signals"] });
              queryClient.invalidateQueries({ queryKey: ["signals"] });
              queryClient.invalidateQueries({ queryKey: ["entries"] });
            })
            .catch((err) => console.error("[voice] extract-evidence failed:", err));
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

      const sinceIso = new Date(Date.now() - 5000).toISOString();
      const baseline = await snapshotBaseline(session.user.id);

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

      if (data?.error === "duplicate_url" || data?.error === "duplicate_entry") {
        setDuplicateInfo({
          id: data.existing_id,
          date: new Date(data.created_at).toLocaleDateString(),
        });
        onDuplicate?.();
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
          title: "Couldn't read that one",
          description: data.error_message || "Something didn't go through. Try again.",
          variant: "destructive",
        });
        setSaving(false);
        return;
      }

      // Note: ingest-capture already creates the entries row server-side.
      // Client-side insert was causing duplicates — removed.
      // If a skill pillar was selected, patch it onto the most recent entry for this URL.
      const entryRow: { id?: string } = {};
      if (selectedPillar && captureType === "link") {
        const targetUrl = data?.original_url || content.trim();
        const { data: latest } = await supabase
          .from("entries")
          .select("id")
          .eq("user_id", session.user.id)
          .eq("image_url", targetUrl)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (latest?.id) {
          entryRow.id = latest.id;
          await supabase.from("entries").update({ skill_pillar: selectedPillar }).eq("id", latest.id);
        }
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

      // Success — celebrate the FIRST EVER capture (count = 1 for this user)
      const didCelebrate = await maybeTriggerFirstCeremony(session.user.id);
      if (!didCelebrate) {
        // Beat 1 — honest, no fabricated progress. Beat 2 lands via the
        // realtime subscription in Dashboard when fragments actually arrive.
        sonnerToast("Saved. Aura is reading it — this usually takes a few minutes.", {
          duration: 4500,
        });
      }
      try { sessionStorage.setItem("aura_pending_capture_at", String(Date.now())); } catch { /* noop */ }

      setContent("");
      setVoiceAudioUrl(null);
      setTranscriptionFailed(false);
      setImagePreview(null);
      setImageAnalysis(null);
      setUrlError(null);
      setDuplicateInfo(null);
      onCaptured();
      // Notify any listening pages (Intelligence, etc.) that a capture completed
      window.dispatchEvent(new Event("capture-complete"));
      trackCaptureCompleted(captureType, "modal");

      // Extra images from the queue, each ingested on its own.
      const extras = imageQueue.filter((r) => r.file !== imageFile);
      if (captureType === "image" && extras.length) {
        for (const row of extras) {
          setImageQueue((q) => q.map((r) => (r.id === row.id ? { ...r, status: "saving" } : r)));
          try {
            await uploadAndIngestImage(row.file, session.user.id, session.access_token);
            setImageQueue((q) => q.map((r) => (r.id === row.id ? { ...r, status: "done" } : r)));
            trackCaptureCompleted("image", "modal");
          } catch (e: any) {
            setImageQueue((q) => q.map((r) => (r.id === row.id ? { ...r, status: "error" } : r)));
            sonnerToast.error(`Could not save ${row.file.name}: ${e?.message || "unknown error"}`);
          }
        }
      }
      setImageFile(null);
      setImageQueue([]);

      // Honest, in-place result card. Fills in only as real data arrives.
      setCaptureResult({
        since: sinceIso,
        userId: session.user.id,
        title: data?.extracted_title || (captureType === "link" ? (linkPreview?.domain || "New source") : "New capture"),
        baseline,
      });

      // M3-4 identity drift check (frontend only, fire-and-forget)
      bumpCaptureAndCheckDrift(session.user.id);

      // Server-side pipeline (ingest-capture → extract-evidence → detect-signals-v2) is
      // fire-and-forget. Verify it ran by checking for fragments after a short delay.
      // Refresh signals UI optimistically; the safety net catches silent server failures.
      queryClient.invalidateQueries({ queryKey: ["strategic-signals"] });
      queryClient.invalidateQueries({ queryKey: ["signals"] });
      queryClient.invalidateQueries({ queryKey: ["entries"] });
      if (entryRow?.id) {
        const checkAt = new Date(Date.now() - 60000).toISOString();
        setTimeout(async () => {
          try {
            const { count } = await supabase
              .from("evidence_fragments")
              .select("id", { count: "exact", head: true })
              .eq("user_id", session.user.id)
              .gte("created_at", checkAt);
            if (!count) {
              console.warn("[CaptureModal] Pipeline verification: no fragments after 15s");
            } else {
              queryClient.invalidateQueries({ queryKey: ["strategic-signals"] });
              queryClient.invalidateQueries({ queryKey: ["signals"] });
              queryClient.invalidateQueries({ queryKey: ["entries"] });
            }
          } catch {
            // Silent — don't bother the user
          }
        }, 15000);
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

  // The first-capture ceremony renders independently of `open` so the user
  // sees it AFTER the bottom sheet closes.
  const ceremonyPortal = firstCeremonyOpen && typeof document !== "undefined"
    ? createPortal(
      <div
        role="dialog"
        aria-label="Your first signal is forming"
        style={{
          position: "fixed", inset: 0, zIndex: 20000,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(4, 8, 12, 0.78)",
          backdropFilter: "blur(6px)",
          animation: "fade-up-in 360ms ease both",
        }}
        onClick={() => setFirstCeremonyOpen(false)}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "relative",
            maxWidth: 460,
            padding: "44px 36px 32px",
            textAlign: "center",
            background: "#FFFFFF",
            border: "1px solid #E2E7EE",
            borderRadius: 16,
            boxShadow: "0 30px 80px -20px rgba(0,0,0,0.5)",
          }}
        >
          {/* Gold radial glow behind the glyph */}
          <div
            aria-hidden
            style={{
              position: "absolute", top: 14, left: "50%",
              width: 220, height: 220, transform: "translateX(-50%)",
              background: "radial-gradient(circle, color-mix(in srgb, #00CEC9 22%, transparent) 0%, transparent 65%)",
              pointerEvents: "none",
            }}
          />
          <div
            className="aura-gold-pulse"
            style={{
              position: "relative", fontSize: 42, lineHeight: 1,
              color: "#00807B",
              marginBottom: 18,
            }}
          >✦</div>
          <h2
            style={{
              fontFamily: "var(--ff-ui)",
              fontSize: 26, fontWeight: 500,
              color: "#0F1519",
              letterSpacing: "-0.01em",
              margin: "0 0 12px",
            }}
          >
            Your first signal is forming
          </h2>
          <p
            style={{
              fontSize: 14, lineHeight: 1.65,
              color: "#5B6673",
              margin: "0 auto 20px", maxWidth: 360,
            }}
          >
            Aura is extracting intelligence from this source. Your strategic radar is now active.
          </p>
          {firstCeremonyShowCta && (
            <button
              type="button"
              className="animate-fade-up-in"
              onClick={() => {
                setFirstCeremonyOpen(false);
                window.dispatchEvent(new CustomEvent("aura:switch-tab", { detail: { tab: "intelligence" } }));
              }}
              style={{
                background: "#0670C4",
                color: "#FFFFFF",
                border: 0, borderRadius: 8,
                padding: "10px 22px",
                fontSize: 14, fontWeight: 600,
                cursor: "pointer",
              }}
            >
              See your intelligence →
            </button>
          )}
          <button
            type="button"
            onClick={() => setFirstCeremonyOpen(false)}
            aria-label="Close"
            style={{
              position: "absolute", top: 12, insetInlineEnd: 12,
              background: "transparent", border: 0,
              color: "#5B6673", cursor: "pointer",
            }}
          >
            <X size={16} />
          </button>
        </div>
      </div>,
      document.body,
    )
    : null;

  if (!open) return <>{ceremonyPortal}</>;

  // Skill pillar chip fallbacks (per spec)
  const PILLAR_CHIPS = [
    "Digital Transformation",
    "Strategy",
    "Operations",
    "AI & Automation",
    "Leadership",
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
    <div data-testid="capture-panel" data-capture-surface className="fixed inset-0 z-[10000] flex flex-col items-center justify-end" style={{ willChange: "unset" }}>
      <style dangerouslySetInnerHTML={{ __html: CAPTURE_CSS }} />
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
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.defaultPrevented && captureType !== "document") {
            e.preventDefault();
            void handleSave();
          }
        }}
        className="relative flex flex-col w-full overflow-hidden capture-sheet-anim"
        style={{
          maxHeight: "88vh",
          zIndex: 1000,
          background: "#FFFFFF",
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          color: "#0F1519",
          transform: swipeY > 0 ? `translateY(${swipeY}px)` : undefined,
          transition: swipeY > 0 ? "none" : "transform 0.3s ease-out",
          opacity: swipeY > 0 ? Math.max(0.3, 1 - swipeY / 400) : 1,
          boxShadow: "0 -8px 40px rgba(0,0,0,0.55)",
        }}
      >
        {/* Sheet handle */}
        <div className="flex justify-center cursor-grab">
          <div style={{ width: 40, height: 4, background: "#E2E7EE", borderRadius: 2, margin: "10px auto 0" }} />
        </div>

        {/* Header */}
        <div
          className="flex items-center justify-between"
          style={{ padding: "14px 20px 10px" }}
        >
          <div className="flex items-center" style={{ gap: 12 }}>
            <div
              className="flex items-center justify-center shrink-0"
              style={{ width: 36, height: 36, background: "#0670C4", borderRadius: 11 }}
            >
              <Plus className="w-5 h-5" style={{ color: "#FFFFFF" }} strokeWidth={2.5} />
            </div>
            <div>
              <h2
                style={{
                  fontFamily: "var(--ff-ui)",
                  fontSize: 18,
                  color: "#0F1519",
                  margin: 0,
                  lineHeight: 1.375,
                }}
              >
                Capture
              </h2>
              <p
                style={{
                  fontSize: 12,
                  color: "#5B6673",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  fontWeight: 600,
                  margin: "2px 0 0",
                  fontFamily: "var(--ff-mono)",
                }}
              >
                Something you read, saw or heard
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="flex items-center justify-center tactile-press cap-tap"
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: "#F2F5F9",
              color: "#5B6673",
              border: "none",
            }}
            aria-label="Close capture"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto" style={{ padding: "12px 20px 20px", display: "flex", flexDirection: "column", gap: 16, minHeight: 0 }}>
          {captureResult ? (
            <CaptureResultCard result={captureResult} onClose={() => { setCaptureResult(null); onOpenChange(false); }} />
          ) : (
          <>
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
                    border: active ? "0.5px solid #0670C4" : "0.5px solid #E2E7EE",
                    background: active
                      ? "color-mix(in srgb, #0670C4 18%, #F2F5F9)"
                      : "#F2F5F9",
                    color: active ? "#0F1519" : "#5B6673",
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
                      background: active ? "color-mix(in srgb, #0670C4 25%, transparent)" : "#FFFFFF",
                    }}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  {label}
                </button>
              );
            })}
          </div>

          {/* Caption: what Aura wants — a source, not a brief */}
          <p style={{ fontSize: 12, color: "#5B6673", lineHeight: 1.5, margin: "-8px 0 0" }}>
            Give Aura the source — the article, the report, the thing someone said in a meeting. Aura writes from your sources later.
          </p>

          {/* ── LINK ── */}
          {captureType === "link" && (
            <div className="space-y-3">
              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  data-testid="capture-url-input"
                  placeholder="Paste a URL..."
                  value={content}
                  onChange={(e) => { setContent(e.target.value); setUrlError(null); setDuplicateInfo(null); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSave();
                    }
                  }}
                   onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#0670C4";
                    e.currentTarget.style.background = "#FFFFFF";
                    e.currentTarget.style.boxShadow = "0 0 0 3px color-mix(in srgb, #0670C4 30%, transparent)";
                  }}
                  onBlur={async (e) => {
                    e.currentTarget.style.borderColor = urlError ? "#C0392B" : "#E2E7EE";
                    e.currentTarget.style.background = "#FFFFFF";
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
                    background: "#FFFFFF",
                    border: urlError ? "0.5px solid #C0392B" : "0.5px solid #E2E7EE",
                    borderRadius: 12,
                    padding: "13px 76px 13px 16px",
                    fontSize: 14,
                    color: "#0F1519",
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
                    insetInlineEnd: 8,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "#F2F5F9",
                    color: "#5B6673",
                    border: "0.5px solid #E2E7EE",
                    borderRadius: 7,
                    fontSize: 12,
                    fontWeight: 600,
                    padding: "5px 10px",
                    cursor: "pointer",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    fontFamily: "var(--ff-mono)",
                  }}
                >
                  Paste
                </button>
              </div>

              {urlError && <p style={{ fontSize: 12, color: "#C0392B", margin: 0 }}>{urlError}</p>}

              {linkPreview && (
                <div
                  style={{
                    background: "#F2F5F9",
                    border: "0.5px solid #E2E7EE",
                    borderRadius: 12,
                    padding: "12px 14px",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#5B6673", fontFamily: "var(--ff-mono)" }}>
                    {linkPreview.domain}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "#0F1519", marginTop: 4, lineHeight: 1.35 }}>
                    {linkPreview.title}
                  </div>
                  {linkPreview.snippet && (
                    <div style={{ fontSize: 12, color: "#5B6673", marginTop: 6, lineHeight: 1.5 }}>
                      {linkPreview.snippet}…
                    </div>
                  )}
                </div>
              )}

              {signalMatch && (
                <div
                  style={{
                    background: "color-mix(in srgb, #00CEC9 15%, #F2F5F9)",
                    border: "0.5px solid color-mix(in srgb, #00CEC9 35%, transparent)",
                    borderRadius: 10,
                    padding: "11px 14px",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <span className="capture-pulse-dot" />
                  <span style={{ fontSize: 12, color: "#0F1519", lineHeight: 1.45 }}>
                    Aura detected this strengthens your signal <strong>{signalMatch.title}</strong> — adding will reinforce it.
                  </span>
                </div>
              )}

              {duplicateInfo && (
                <div
                  style={{
                    background: "#F2F5F9",
                    border: "0.5px solid #E2E7EE",
                    borderRadius: 10,
                    padding: "10px 14px",
                  }}
                >
                  <p style={{ fontSize: 12, color: "#0F1519", margin: 0 }}>
                    You already captured this source on {duplicateInfo.date}.
                  </p>
                  <div style={{ marginTop: 6 }}>
                    <button type="button" onClick={() => { setDuplicateInfo(null); handleSave(); }} style={{ fontSize: 12, color: "#0670C4", background: "transparent", border: "none", cursor: "pointer", padding: 0, fontWeight: 600 }}>
                      Capture anyway
                    </button>
                    <button type="button" onClick={() => { setContent(""); setDuplicateInfo(null); }} style={{ fontSize: 12, color: "#5B6673", background: "transparent", border: "none", marginInlineStart: 12, cursor: "pointer", padding: 0 }}>
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
                        fontSize: 12,
                        padding: "5px 12px",
                        borderRadius: 20,
                        background: active
                          ? "color-mix(in srgb, #0670C4 20%, #F2F5F9)"
                          : "#F2F5F9",
                        border: active ? "0.5px solid #0670C4" : "0.5px solid #E2E7EE",
                        color: active ? "#0F1519" : "#5B6673",
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
                ref={textNoteRef}
                placeholder="Paste the text, or write down what you read or heard — and where it came from."
                value={content}
                maxLength={15000}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v.length > 15000) {
                    setContent(v.slice(0, 15000));
                    sonnerToast("Text trimmed to 15,000 characters for reliable processing.");
                  } else {
                    setContent(v);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleSave();
                  }
                }}
                onPaste={(e) => {
                  const pasted = e.clipboardData.getData("text");
                  const projected = (content || "").length + pasted.length;
                  if (projected > 15000) {
                    sonnerToast("Text trimmed to 15,000 characters for reliable processing.");
                  }
                }}
                dir="auto"
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#0670C4";
                  e.currentTarget.style.background = "#FFFFFF";
                  e.currentTarget.style.boxShadow = "0 0 0 3px color-mix(in srgb, #0670C4 30%, transparent)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "#E2E7EE";
                  e.currentTarget.style.background = "#FFFFFF";
                  e.currentTarget.style.boxShadow = "none";
                }}
                style={{
                  width: "100%",
                  background: "#FFFFFF",
                  border: "0.5px solid #E2E7EE",
                  borderRadius: 12,
                  padding: "14px 16px",
                  fontSize: 14,
                  color: "#0F1519",
                  minHeight: 120,
                  resize: "none",
                  outline: "none",
                  transition: "all 150ms ease",
                  overflow: "hidden",
                }}
              />
              {content.length > 12000 && (
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 11,
                    color: content.length >= 15000 ? "#C0392B" : "#5B6673",
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                    fontFamily: "var(--ff-mono)",
                  }}
                >
                  {content.length.toLocaleString()} / 15,000
                </div>
              )}
              <p style={{ fontSize: 12, color: "#5B6673", lineHeight: 1.5, margin: "8px 0 0" }}>
                Not sure what to capture? The last useful thing you read this week.
              </p>
              {/* §16.1 trust line — quiet, caption, muted; bilingual stack */}
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 2 }}>
                <p style={{ fontSize: 11, lineHeight: 1.6, color: "#5B6673", margin: 0 }}>
                  What you capture stays yours — used only to build your signals.
                </p>
                <p
                  dir="rtl"
                  lang="ar"
                  style={{ fontSize: 11, lineHeight: 1.6, color: "#5B6673", margin: 0, fontFamily: "var(--font-arabic)" }}
                >
                  ما تلتقطه يبقى لك وحدك — يُستخدم لبناء إشاراتك فقط.
                </p>
              </div>
            </div>
          )}

          {/* ── IMAGE ── */}
          {captureType === "image" && (
            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  e.target.value = "";
                  if (files.length) void handleImagesSelect(files);
                }}
              />
              {imageQueue.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {imageQueue.map((row) => (
                    <div key={row.id} style={{ display: "flex", alignItems: "center", gap: 10, background: SB.canvas, border: `1px solid ${SB.border}`, borderRadius: 8, padding: "8px 10px" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: SB.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.file.name}</div>
                        <div className={`cap-queue-bar${row.status === "done" ? " is-done" : ""}`} style={{ marginTop: 6 }}><i /></div>
                      </div>
                      <button
                        type="button"
                        className="cap-tap"
                        aria-label={`Remove ${row.file.name}`}
                        onClick={() => removeQueuedImage(row.id)}
                        style={{ background: "transparent", border: 0, color: SB.ink2, cursor: "pointer" }}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {!imagePreview ? (
                <>
                  <div
                    className="cap-dropzone"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setImageDragActive(true); }}
                    onDragLeave={() => setImageDragActive(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setImageDragActive(false);
                      const files = Array.from(e.dataTransfer.files || []);
                      if (files.length) void handleImagesSelect(files);
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "#0670C4";
                      e.currentTarget.style.background = "color-mix(in srgb, #0670C4 10%, #FFFFFF)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = imageDragActive ? SB.blue : "#E2E7EE";
                      e.currentTarget.style.background = imageDragActive ? SB.blueTint : "#FFFFFF";
                    }}
                    style={{
                      background: imageDragActive ? SB.blueTint : "#FFFFFF",
                      border: `1.5px dashed ${imageDragActive ? SB.blue : "#E2E7EE"}`,
                      borderRadius: 14,
                      padding: 32,
                      textAlign: "center",
                      cursor: "pointer",
                      transition: "all 150ms ease",
                    }}
                  >
                    <ImageIcon className="w-9 h-9 mx-auto mb-3" style={{ color: "#5B6673" }} />
                    <p style={{ fontSize: 14, color: "#0F1519", margin: 0 }}>Drop an image or click to upload</p>
                    <p style={{ fontSize: 12, color: "#5B6673", marginTop: 4 }}>PNG, JPG up to 20MB</p>
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
                        border: "0.5px solid #E2E7EE",
                        borderRadius: 10,
                        padding: "8px 16px",
                        fontSize: 12,
                        background: "#F2F5F9",
                        color: "#0F1519",
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
                        border: "0.5px solid #E2E7EE",
                        borderRadius: 10,
                        padding: "8px 16px",
                        fontSize: 12,
                        background: "#F2F5F9",
                        color: "#0F1519",
                        cursor: "pointer",
                      }}
                    >
                      <FolderOpen className="w-3.5 h-3.5" /> From files
                    </button>
                  </div>
                </>
              ) : (
                <div className="relative">
                  <img src={imagePreview} alt="Preview" style={{ width: "100%", maxHeight: 200, objectFit: "contain", borderRadius: 12, background: "#FFFFFF" }} />
                  <button onClick={clearImage} className="absolute" style={{ top: 8, insetInlineEnd: 8, width: 26, height: 26, borderRadius: "50%", background: "#F2F5F9", border: "0.5px solid #E2E7EE", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                    <X className="w-3.5 h-3.5" style={{ color: "#0F1519" }} />
                  </button>
                </div>
              )}
              {analyzing && (
                <div className="flex items-center" style={{ gap: 8, fontSize: 14, color: "#5B6673" }}>
                  <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#00CEC9" }} />
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
                  <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#5B6673", fontFamily: "var(--ff-mono)" }}>
                    Recent documents
                  </div>
                  <div className="space-y-1.5">
                    {recentDocs.map((d) => {
                      const ext = (d.filename || "").split(".").pop()?.toLowerCase() || "";
                      const isPdf = ext === "pdf";
                      const iconBg = isPdf ? "#C0392B" : "#00CEC9";
                      const isProcessed = d.status === "processed";
                      return (
                        <div
                          key={d.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            padding: "10px 12px",
                            background: "#F2F5F9",
                            border: "0.5px solid #E2E7EE",
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
                            <div style={{ fontSize: 12, fontWeight: 500, color: "#0F1519", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {d.filename}
                            </div>
                            <div style={{ fontSize: 12, color: "#5B6673", marginTop: 2 }}>
                              {fmtBytes(d.file_size)} · {new Date(d.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </div>
                          </div>
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              letterSpacing: "0.06em",
                              textTransform: "uppercase",
                              padding: "3px 8px",
                              borderRadius: 6,
                              background: isProcessed
                                ? "color-mix(in srgb, #12805C 18%, #F2F5F9)"
                                : "color-mix(in srgb, #00CEC9 16%, #F2F5F9)",
                              color: isProcessed ? "#12805C" : "#00807B",
                              fontFamily: "var(--ff-mono)",
                            }}
                          >
                            {isProcessed ? "Read" : "Reading"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <DocumentUpload onUploaded={async () => {
                onCaptured();
                window.dispatchEvent(new Event("capture-complete"));
                trackCaptureCompleted("document", "upload");
                const { data: { user } } = await supabase.auth.getUser();
                if (user) await maybeTriggerFirstCeremony(user.id);
                onOpenChange(false);
              }} />
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
                      background: "#FFFFFF",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Loader2 className="w-7 h-7 animate-spin" style={{ color: "#00CEC9" }} />
                  </div>
                  <p style={{ fontSize: 14, color: "#5B6673", margin: 0 }}>Transcribing…</p>
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
                      background: isRecording ? "#C0392B" : "#0670C4",
                      boxShadow: isRecording
                        ? "0 4px 20px color-mix(in srgb, #C0392B 40%, transparent)"
                        : "0 4px 20px color-mix(in srgb, #0670C4 35%, transparent)",
                      transition: "background 200ms ease",
                    }}
                    aria-label={isRecording ? "Stop recording" : "Start recording"}
                  >
                    {isRecording ? (
                      <Square className="w-6 h-6" style={{ color: "#FFFFFF" }} fill="currentColor" />
                    ) : (
                      <Mic className="w-7 h-7" style={{ color: "#FFFFFF" }} />
                    )}
                  </button>
                  <div
                    style={{
                      fontFamily: "var(--ff-mono)",
                      fontSize: 22,
                      color: isRecording ? "#00807B" : "#0F1519",
                      letterSpacing: "-0.02em",
                      lineHeight: 1.5,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {fmtMMSS(recordingSeconds)}
                  </div>
                  {!isRecording && (
                    <p style={{ fontSize: 12, color: "#5B6673", margin: 0 }}>Tap to record</p>
                  )}
                </>
              )}
              {!isRecording && !isTranscribing && (
                <div className="w-full" style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                  {transcriptionFailed && (
                    <p style={{ fontSize: 12, color: "#0F1519", margin: 0 }}>
                      Auto-transcription unavailable. Type your notes manually.
                    </p>
                  )}
                  <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#5B6673", margin: 0, fontFamily: "var(--ff-mono)" }}>
                    Transcript
                  </p>
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    dir="auto"
                    rows={3}
                    ref={transcriptRef}
                    placeholder="Transcript will appear here…"
                    style={{
                      width: "100%",
                      background: "#FFFFFF",
                      border: "0.5px solid #E2E7EE",
                      borderRadius: 12,
                      padding: "12px 14px",
                      fontSize: 14,
                      color: "#0F1519",
                      resize: "none",
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Save button (not for document tab — it has its own upload handler) */}
          {captureType !== "document" && (
            <>
            <button
              type="button"
              className="cap-tap"
              onClick={handleSave}
              disabled={saving || isRecording || isTranscribing || analyzing || (captureType === "image" ? !imageFile : !content.trim())}
              onMouseEnter={(e) => {
                if (!e.currentTarget.disabled) e.currentTarget.style.background = "#04477C";
              }}
              onMouseLeave={(e) => {
                if (!e.currentTarget.disabled) e.currentTarget.style.background = "#0670C4";
              }}
              style={{
                width: "100%",
                background: "#0670C4",
                color: "#FFFFFF",
                border: "none",
                borderRadius: 12,
                padding: 14,
                
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
            <p style={{ fontSize: 11, color: SB.ink2, textAlign: "center", margin: "8px 0 0", fontFamily: "var(--ff-mono)" }}>
              Press ⌘↵ or click to save
            </p>
            </>
          )}
          </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CaptureModal;
